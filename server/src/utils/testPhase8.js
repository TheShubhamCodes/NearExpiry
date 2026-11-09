/**
 * Phase 8 Unit & Service Verification Test Suite
 * Tests Markdown lifecycle, approval guards, unapproved price protection,
 * Supplier Return status transitions, duplicate deduction prevention,
 * Quarantine & Disposal inventory movement, FEFO exclusion, and summary KPIs.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const StockMovement = require('../models/StockMovement');
const Markdown = require('../models/Markdown');
const SupplierReturn = require('../models/SupplierReturn');
const StockDisposition = require('../models/StockDisposition');
const Notification = require('../models/Notification');
const actionService = require('../services/actionService');
const { calculateBatchExpiryStatus } = require('./expiryUtils');

async function runTests() {
  console.log('--- Starting Phase 8 Domain & Service Verification ---');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let product;
  let criticalBatch;
  let warningBatch;
  let expiredBatch;

  try {
    // 0. Clean up previous test data
    await User.deleteMany({ email: /testp8/ });
    await Product.deleteMany({ name: /TestP8/ });
    await InventoryBatch.deleteMany({ batchNumber: /P8-/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /Phase 8/i });

    // 1. Setup store, owner, and employee
    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Phase 8 Supermarket',
        contactEmail: 'phase8@test.com',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata',
        markdownRules: {
          warningDiscountPercent: 15,
          criticalDiscountPercent: 30,
          todayDiscountPercent: 50,
          autoSuggestEnabled: true
        }
      });
    } else {
      store.markdownRules = {
        warningDiscountPercent: 15,
        criticalDiscountPercent: 30,
        todayDiscountPercent: 50,
        autoSuggestEnabled: true
      };
      await store.save();
    }

    owner = await User.create({
      fullName: 'Phase8 Owner',
      email: 'testp8_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Phase8 Employee',
      email: 'testp8_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    product = await Product.create({
      name: 'TestP8 Greek Yogurt 500g',
      brand: 'DairyFresh',
      category: 'Dairy',
      unit: 'packet',
      createdBy: owner._id
    });

    const now = new Date();
    // Critical batch (expires in 2 days)
    const critDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    criticalBatch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'P8-CRIT-01',
      quantityReceived: 30,
      currentQuantity: 30,
      purchasePrice: 2.0,
      sellingPrice: 4.0,
      expiryDate: critDate,
      receivedDate: now,
      createdBy: owner._id
    });

    // Warning batch (expires in 5 days)
    const warnDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    warningBatch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'P8-WARN-01',
      quantityReceived: 20,
      currentQuantity: 20,
      purchasePrice: 2.0,
      sellingPrice: 4.0,
      expiryDate: warnDate,
      receivedDate: now,
      createdBy: owner._id
    });

    // Expired batch (expired 2 days ago)
    const expDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    expiredBatch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'P8-EXP-01',
      quantityReceived: 10,
      currentQuantity: 10,
      purchasePrice: 2.0,
      sellingPrice: 4.0,
      expiryDate: expDate,
      receivedDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      createdBy: owner._id
    });

    console.log('✓ Test fixtures initialized successfully');

    // 2. Test Markdown Suggestions
    console.log('\n--- 2. Testing Smart Markdown Suggestions ---');
    const result = await actionService.getMarkdownSuggestions();
    const suggestions = result.suggestions;
    console.log(`Generated ${suggestions.length} suggestions.`);

    const critSuggestion = suggestions.find((s) => s.batchId.toString() === criticalBatch._id.toString());
    const warnSuggestion = suggestions.find((s) => s.batchId.toString() === warningBatch._id.toString());
    const expSuggestion = suggestions.find((s) => s.batchId.toString() === expiredBatch._id.toString());

    if (!critSuggestion || critSuggestion.suggestedPercent !== 30) {
      throw new Error(`Expected 30% discount for critical batch, got: ${critSuggestion?.suggestedPercent}`);
    }
    if (!warnSuggestion || warnSuggestion.suggestedPercent !== 15) {
      throw new Error(`Expected 15% discount for warning batch, got: ${warnSuggestion?.suggestedPercent}`);
    }
    if (expSuggestion) {
      throw new Error('Expired batches must NEVER be suggested for discount sale!');
    }
    console.log('✓ Markdown suggestions adhere to store rules and exclude expired batches');

    // 3. Test Markdown Creation, Approval Guards & Unapproved Price Safety
    console.log('\n--- 3. Testing Markdown Workflow & Approval Safety ---');
    // Employee proposes 30% markdown
    const markdown = await actionService.createMarkdownRequest(
      {
        batchId: criticalBatch._id,
        discountPercent: 30,
        reason: 'Phase 8 proposed markdown for critical batch'
      },
      employee
    );

    if (markdown.status !== 'PENDING_APPROVAL') {
      throw new Error(`Expected PENDING_APPROVAL status, got ${markdown.status}`);
    }

    // Check batch selling price has NOT changed automatically
    const batchCheck = await InventoryBatch.findById(criticalBatch._id);
    if (batchCheck.discountedPrice !== null && batchCheck.discountedPrice !== undefined) {
      throw new Error('Unapproved markdown must not alter batch discountedPrice!');
    }
    console.log('✓ Unapproved markdown does not alter live batch selling price');

    // Employee tries to approve -> must fail
    let empApprovalFailed = false;
    try {
      await actionService.approveMarkdown(markdown._id, employee);
    } catch (err) {
      empApprovalFailed = true;
    }
    if (!empApprovalFailed) {
      throw new Error('Employee must NOT be allowed to approve markdowns!');
    }
    console.log('✓ Employee authorization guard blocked unauthorized markdown approval');

    // Owner approves
    const approvedMarkdown = await actionService.approveMarkdown(markdown._id, owner);
    if (approvedMarkdown.status !== 'APPROVED') {
      throw new Error(`Expected APPROVED status, got ${approvedMarkdown.status}`);
    }

    // Owner activates
    const activatedMarkdown = await actionService.activateMarkdown(markdown._id, owner);
    if (activatedMarkdown.status !== 'ACTIVE') {
      throw new Error(`Expected ACTIVE status, got ${activatedMarkdown.status}`);
    }

    // Batch discounted price should now be 4.0 * (1 - 0.3) = 2.80
    const activeBatch = await InventoryBatch.findById(criticalBatch._id);
    if (activeBatch.discountedPrice !== 2.8 || activeBatch.activeMarkdown.toString() !== markdown._id.toString()) {
      throw new Error(`Expected discountedPrice 2.8, got ${activeBatch.discountedPrice}`);
    }
    console.log('✓ Activated markdown safely updated batch discounted price to 2.80');

    // Cancel markdown -> batch discounted price must be cleared
    await actionService.cancelMarkdown(markdown._id, 'Ending test discount early', owner);
    const revertedBatch = await InventoryBatch.findById(criticalBatch._id);
    if (revertedBatch.discountedPrice !== null || revertedBatch.activeMarkdown !== null) {
      throw new Error('Cancelled markdown must clear batch discountedPrice and activeMarkdown reference');
    }
    console.log('✓ Cancelled markdown successfully reset batch discounted price to null');

    // 4. Test Supplier Return Workflow & Duplicate Stock Deduction Guard
    console.log('\n--- 4. Testing Supplier Return Workflow & Deduction Guards ---');
    const returnRecord = await actionService.createSupplierReturn(
      {
        productId: product._id.toString(),
        batchId: warningBatch._id.toString(),
        supplierName: 'Fresh Farms Supply Co.',
        quantity: 5,
        reason: 'NEAR_EXPIRY',
        resolutionExpected: 'REPLACEMENT',
        notes: 'Phase 8 test return request'
      },
      employee
    );

    if (returnRecord.status !== 'REQUESTED' || returnRecord.stockDeducted !== false) {
      throw new Error('Initial return record should be REQUESTED with stockDeducted: false');
    }

    // Batch quantity should still be 20 (not deducted on request)
    let batchBeforeDispatch = await InventoryBatch.findById(warningBatch._id);
    if (batchBeforeDispatch.currentQuantity !== 20) {
      throw new Error(`Stock must not be deducted on return request, expected 20 got ${batchBeforeDispatch.currentQuantity}`);
    }
    console.log('✓ Supplier return creation preserves stock until physical dispatch');

    // Dispatch return -> stock should be deducted
    const dispatchedReturn = await actionService.updateSupplierReturnStatus(
      returnRecord._id,
      { status: 'DISPATCHED', resolutionNotes: 'Goods dispatched with carrier' },
      employee
    );

    if (dispatchedReturn.status !== 'DISPATCHED' || dispatchedReturn.stockDeducted !== true) {
      throw new Error('Return dispatch should set status DISPATCHED and stockDeducted: true');
    }

    let batchAfterDispatch = await InventoryBatch.findById(warningBatch._id);
    if (batchAfterDispatch.currentQuantity !== 15) {
      throw new Error(`Expected 15 units remaining after dispatching 5, got ${batchAfterDispatch.currentQuantity}`);
    }

    // Verify StockMovement record was created
    const movement = await StockMovement.findOne({
      batch: warningBatch._id,
      movementType: 'STOCK_RETURNED_TO_SUPPLIER'
    });
    if (!movement || movement.quantityChanged !== 5) {
      throw new Error('StockMovement of type STOCK_RETURNED_TO_SUPPLIER was not recorded properly');
    }
    console.log('✓ Return dispatch atomically deducted 5 units and logged STOCK_RETURNED_TO_SUPPLIER movement');

    // Update return status again (e.g. to REPLACEMENT_RECEIVED) -> Verify NO duplicate deduction!
    await actionService.updateSupplierReturnStatus(
      returnRecord._id,
      { status: 'REPLACEMENT_RECEIVED', resolutionNotes: 'Replacement batches arrived' },
      employee
    );

    let batchAfterResolution = await InventoryBatch.findById(warningBatch._id);
    if (batchAfterResolution.currentQuantity !== 15) {
      throw new Error(`Stock was mistakenly deducted a second time! Expected 15, got ${batchAfterResolution.currentQuantity}`);
    }
    console.log('✓ Duplicate deduction guard prevented double deduction on return status update');

    // 5. Test Stock Quarantine, FEFO Exclusion & Disposal Workflow
    console.log('\n--- 5. Testing Quarantine, FEFO Exclusion & Disposal ---');
    // Quarantine expired batch (10 units)
    const quarantine = await actionService.quarantineStock(
      {
        batchId: expiredBatch._id.toString(),
        quantity: 10,
        reason: 'Expired product segregated to quarantine area',
        notes: 'Phase 8 quarantine test'
      },
      employee
    );

    if (quarantine.status !== 'QUARANTINED' || quarantine.stockDeducted !== true) {
      throw new Error('Quarantine record should have status QUARANTINED and stockDeducted: true');
    }

    const batchAfterQuarantine = await InventoryBatch.findById(expiredBatch._id);
    if (batchAfterQuarantine.currentQuantity !== 0 || !batchAfterQuarantine.isQuarantined) {
      throw new Error('Batch currentQuantity must be 0 and isQuarantined true');
    }

    // Check FEFO calculation: batch must NOT be saleable
    const fefoStatus = calculateBatchExpiryStatus(batchAfterQuarantine, {
      expiryWarningDays: 7,
      expiryCriticalDays: 3,
      timezone: 'Asia/Kolkata'
    });
    if (fefoStatus.isSaleable !== false) {
      throw new Error('Quarantined batch must be marked isSaleable: false for FEFO');
    }
    console.log('✓ Stock quarantine segregated inventory and excluded batch from FEFO');

    // Dispose the quarantined stock
    const disposal = await actionService.disposeStock(
      {
        dispositionId: quarantine._id.toString(),
        disposalMethod: 'DISPOSED_TRASH',
        reason: 'Authorized disposal of expired yogurt',
        witness: 'Store Manager John'
      },
      owner
    );

    if (disposal.status !== 'DISPOSED' || disposal.costLoss !== 20.0) {
      throw new Error(`Expected DISPOSED status with costLoss 20.0, got ${disposal.status} and ${disposal.costLoss}`);
    }

    // Verify stock was not deducted again on disposal of already-quarantined item
    const batchAfterDisposal = await InventoryBatch.findById(expiredBatch._id);
    if (batchAfterDisposal.currentQuantity !== 0) {
      throw new Error(`Batch currentQuantity should remain 0, got ${batchAfterDisposal.currentQuantity}`);
    }
    console.log('✓ Disposal of quarantined stock calculated cost loss without duplicate stock deduction');

    // 6. Test Partial Quarantine and Release Back to Inventory
    console.log('\n--- 6. Testing Partial Quarantine & Release Back to Inventory ---');
    const partialQuarantine = await actionService.quarantineStock(
      {
        batchId: criticalBatch._id.toString(),
        quantity: 5,
        reason: 'Suspected seal issue on 5 units'
      },
      employee
    );

    let critAfterPartial = await InventoryBatch.findById(criticalBatch._id);
    if (critAfterPartial.currentQuantity !== 25) {
      throw new Error(`Expected 25 units after quarantining 5 from 30, got ${critAfterPartial.currentQuantity}`);
    }

    // Release back
    await actionService.releaseQuarantineStock(
      {
        dispositionId: partialQuarantine._id.toString(),
        reason: 'Seals inspected and verified intact'
      },
      owner
    );

    let critAfterRelease = await InventoryBatch.findById(criticalBatch._id);
    if (critAfterRelease.currentQuantity !== 30) {
      throw new Error(`Expected 30 units restored after release, got ${critAfterRelease.currentQuantity}`);
    }

    const releaseMovement = await StockMovement.findOne({
      batch: criticalBatch._id,
      movementType: 'STOCK_ADJUSTED_INCREASE',
      reason: /quarantine/i
    });
    if (!releaseMovement || releaseMovement.quantityChanged !== 5) {
      throw new Error('Release movement STOCK_ADJUSTED_INCREASE was not recorded properly');
    }
    console.log('✓ Quarantine release restored inventory quantity with logged StockMovement');

    // 7. Test Action Summary KPIs
    console.log('\n--- 7. Testing Action Summary & KPI Metrics ---');
    // Create an active markdown and a pending return to test live calculations
    const testMarkdown = await actionService.createMarkdownRequest(
      {
        batchId: criticalBatch._id,
        discountPercent: 20,
        reason: 'Summary test markdown'
      },
      owner
    );
    await actionService.approveMarkdown(testMarkdown._id, owner);
    await actionService.activateMarkdown(testMarkdown._id, owner);

    await actionService.createSupplierReturn(
      {
        productId: product._id.toString(),
        batchId: warningBatch._id.toString(),
        supplierName: 'Dairy Distributor Ltd',
        quantity: 3,
        reason: 'NEAR_EXPIRY',
        resolutionExpected: 'CREDIT_NOTE'
      },
      employee
    );

    const summary = await actionService.getActionsSummary();
    console.log('Live Action Summary:', JSON.stringify(summary, null, 2));

    if (summary.supplierReturns.pendingReturnsCount < 1) {
      throw new Error('Expected at least 1 pending supplier return');
    }
    if (summary.markdowns.activeCount < 1) {
      throw new Error('Expected at least 1 active markdown');
    }
    if (summary.disposal.disposedCostLoss !== 20.0) {
      throw new Error(`Expected disposedCostLoss 20.0, got ${summary.disposal.disposedCostLoss}`);
    }
    console.log('✓ Action summary KPIs compute accurate financial metrics');

    console.log('\n======================================================');
    console.log('✓ ALL PHASE 8 SERVICE VERIFICATION TESTS PASSED (7/7)');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ PHASE 8 VERIFICATION FAILED:', error);
    process.exitCode = 1;
  } finally {
    // Clean up test data
    await User.deleteMany({ email: /testp8/ });
    await Product.deleteMany({ name: /TestP8/ });
    await InventoryBatch.deleteMany({ batchNumber: /P8-/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /Phase 8/i });
    await mongoose.disconnect();
  }
}

runTests();
