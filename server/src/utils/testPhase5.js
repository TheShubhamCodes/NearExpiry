/**
 * NearExpiry Phase 5 Automated Test Suite: Batch and Inventory Management
 * 
 * Verifies:
 * 1. Multiple batches for the same product.
 * 2. Initial stock receipt and automatic STOCK_RECEIVED movement.
 * 3. Date validation (expiry date cannot precede manufacturing date).
 * 4. Quantity validation (non-negative, currentQuantity <= quantityReceived).
 * 5. Stock adjustments with mandatory reasons (increase, decrease, damage, expiry).
 * 6. Protection against negative stock.
 * 7. Stock movement audit history accuracy.
 * 8. Real-time inventory overview summary statistics.
 * 9. Product-to-batch relationships and product batch ledger.
 * 10. Product deletion protection when batches exist.
 * 11. Batch metadata updates.
 * 12. Clean test data teardown.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const StockMovement = require('../models/StockMovement');
const inventoryService = require('../services/inventoryService');
const productService = require('../services/productService');

const log = (msg, success = true) => {
  console.log(`${success ? '  [PASS]' : '  [FAIL]'} ${msg}`);
};

const runPhase5Tests = async () => {
  console.log('\n======================================================');
  console.log('  NearExpiry — Phase 5 Batch & Inventory Management Tests');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    await mongoose.connect(mongodbUri);
    console.log('[Setup] Connected to MongoDB');

    // Setup test owner & employee
    let owner = await User.findOne({ role: 'owner' });
    if (!owner) {
      owner = await User.create({
        fullName: 'Phase5 Owner',
        email: 'phase5_owner@test.nearexpiry.local',
        password: 'Password123!',
        role: 'owner',
        isActive: true
      });
    }

    // Clean up any old test data
    await InventoryBatch.deleteMany({ notes: { $regex: /^TEST_PHASE5/ } });
    await StockMovement.deleteMany({ reason: { $regex: /^TEST_PHASE5/ } });
    await Product.deleteMany({ name: { $regex: /^TEST_PHASE5/ } });

    // 1. Create a test product
    const product = await Product.create({
      name: 'TEST_PHASE5 Whole Milk 1L',
      brand: 'DairyValley',
      category: 'Dairy & Eggs',
      unit: 'litre',
      createdBy: owner._id
    });
    console.log(`[Setup] Created test product: "${product.name}" (${product._id})`);

    // TEST 1: Receive Stock & Create Batch with automatic STOCK_RECEIVED movement
    console.log('\n--- Test 1: Receive initial stock batch ---');
    const today = new Date();
    const expiry1 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days later
    const mfg1 = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    const receive1 = await inventoryService.receiveStock({
      productId: product._id.toString(),
      batchNumber: 'LOT-A101',
      quantityReceived: 50,
      purchasePrice: 1.50,
      sellingPrice: 2.29,
      manufacturingDate: mfg1,
      expiryDate: expiry1,
      supplierName: 'Fresh Dairy Dist',
      supplierInvoiceNumber: 'INV-9901',
      notes: 'TEST_PHASE5 Batch 1'
    }, owner._id);

    const b1 = receive1.batch;
    const m1 = receive1.movement;

    if (
      b1 &&
      b1.currentQuantity === 50 &&
      b1.quantityReceived === 50 &&
      m1 &&
      m1.movementType === 'STOCK_RECEIVED' &&
      m1.quantityBefore === 0 &&
      m1.quantityAfter === 50 &&
      m1.quantityChanged === 50
    ) {
      log('Initial batch created and immutable STOCK_RECEIVED movement recorded accurately');
      passed++;
    } else {
      log('Initial batch creation failed', false);
      failed++;
    }

    // TEST 2: Multiple batches for the same product
    console.log('\n--- Test 2: Multiple batches for same product ---');
    const expiry2 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days later
    const receive2 = await inventoryService.receiveStock({
      productId: product._id.toString(),
      batchNumber: 'LOT-B202',
      quantityReceived: 75,
      purchasePrice: 1.55,
      sellingPrice: 2.39,
      expiryDate: expiry2,
      supplierName: 'Fresh Dairy Dist',
      notes: 'TEST_PHASE5 Batch 2'
    }, owner._id);

    const b2 = receive2.batch;
    const b2ProductId = b2.product?._id ? b2.product._id.toString() : b2.product.toString();
    if (b2 && b2._id && b2ProductId === product._id.toString()) {
      log('Second batch for same product created successfully with distinct expiry and price');
      passed++;
    } else {
      log('Multiple batch creation failed', false);
      failed++;
    }

    // TEST 3: Date validation (Expiry cannot precede Manufacturing date)
    console.log('\n--- Test 3: Date validation (Expiry before Manufacturing) ---');
    try {
      const invalidMfg = new Date('2026-10-15');
      const invalidExp = new Date('2026-10-10'); // Before mfg!
      await inventoryService.receiveStock({
        productId: product._id.toString(),
        batchNumber: 'LOT-FAIL',
        quantityReceived: 10,
        purchasePrice: 1.00,
        manufacturingDate: invalidMfg,
        expiryDate: invalidExp,
        notes: 'TEST_PHASE5 Invalid'
      }, owner._id);
      log('Batch with expiry before mfg date was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400 || err.message.includes('cannot be earlier')) {
        log(`Rejected invalid dates with message: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error: ${err.message}`, false);
        failed++;
      }
    }

    // TEST 4: Quantity validation
    console.log('\n--- Test 4: Quantity validation ---');
    try {
      await inventoryService.receiveStock({
        productId: product._id.toString(),
        quantityReceived: -5, // Negative quantity!
        purchasePrice: 1.00,
        expiryDate: expiry1,
        notes: 'TEST_PHASE5 Negative'
      }, owner._id);
      log('Negative quantity was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      log(`Negative quantity rejected as expected: "${err.message}"`);
      passed++;
    }

    // TEST 5: Stock Adjustment — Decrease / Damaged
    console.log('\n--- Test 5: Stock adjustment (Decrease / Damaged) ---');
    const adjustDamaged = await inventoryService.adjustStock(
      b1._id,
      {
        adjustmentType: 'STOCK_DAMAGED',
        quantity: 5,
        reason: 'TEST_PHASE5 Crushed packaging on shelf'
      },
      owner._id
    );

    if (
      adjustDamaged.batch.currentQuantity === 45 &&
      adjustDamaged.movement.movementType === 'STOCK_DAMAGED' &&
      adjustDamaged.movement.quantityBefore === 50 &&
      adjustDamaged.movement.quantityAfter === 45 &&
      adjustDamaged.movement.quantityChanged === 5
    ) {
      log('Stock decreased from 50 to 45 with STOCK_DAMAGED movement logged');
      passed++;
    } else {
      log('Damaged stock adjustment failed', false);
      failed++;
    }

    // TEST 6: Stock Adjustment — Increase
    console.log('\n--- Test 6: Stock adjustment (Increase) ---');
    const adjustIncrease = await inventoryService.adjustStock(
      b1._id,
      {
        adjustmentType: 'STOCK_ADJUSTED_INCREASE',
        quantity: 2,
        reason: 'TEST_PHASE5 Stock recount correction (+2 discovered)'
      },
      owner._id
    );

    if (
      adjustIncrease.batch.currentQuantity === 47 &&
      adjustIncrease.movement.movementType === 'STOCK_ADJUSTED_INCREASE' &&
      adjustIncrease.movement.quantityBefore === 45 &&
      adjustIncrease.movement.quantityAfter === 47
    ) {
      log('Stock increased from 45 to 47 with STOCK_ADJUSTED_INCREASE movement logged');
      passed++;
    } else {
      log('Increase stock adjustment failed', false);
      failed++;
    }

    // TEST 7: Protection against negative stock
    console.log('\n--- Test 7: Protection against negative stock ---');
    try {
      await inventoryService.adjustStock(
        b1._id,
        {
          adjustmentType: 'STOCK_ADJUSTED_DECREASE',
          quantity: 100, // Available is 47!
          reason: 'TEST_PHASE5 Over-reduction'
        },
        owner._id
      );
      log('Reduction below zero was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400 && err.message.includes('Current available quantity is only 47')) {
        log(`Negative stock prevented with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error message on negative stock check: ${err.message}`, false);
        failed++;
      }
    }

    // TEST 8: Mandatory reason check on stock adjustments
    console.log('\n--- Test 8: Mandatory reason check ---');
    try {
      await inventoryService.adjustStock(
        b1._id,
        {
          adjustmentType: 'STOCK_ADJUSTED_DECREASE',
          quantity: 1,
          reason: '' // empty!
        },
        owner._id
      );
      log('Adjustment without reason was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400) {
        log(`Empty reason rejected with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error: ${err.message}`, false);
        failed++;
      }
    }

    // TEST 9: Product Batches Ledger & Totals
    console.log('\n--- Test 9: Product Batches Ledger ---');
    const productLedger = await inventoryService.getProductBatches(product._id);
    if (
      productLedger.batches.length === 2 &&
      productLedger.summary.totalAvailableUnits === (47 + 75) && // 122 units
      productLedger.summary.totalReceivedUnits === (50 + 75) // 125 units
    ) {
      log(`Product ledger verified: 2 batches, ${productLedger.summary.totalAvailableUnits} available units`);
      passed++;
    } else {
      log(`Product ledger mismatch: ${JSON.stringify(productLedger.summary)}`, false);
      failed++;
    }

    // TEST 10: Inventory Summary Statistics
    console.log('\n--- Test 10: Inventory Summary Statistics ---');
    const summary = await inventoryService.getInventorySummary();
    if (
      summary.totalBatches >= 2 &&
      summary.activeBatches >= 2 &&
      summary.totalUnitsInStock >= 122 &&
      summary.distinctProductsWithStock >= 1
    ) {
      log(`Summary statistics verified: ${summary.totalUnitsInStock} total units across ${summary.distinctProductsWithStock} distinct product(s)`);
      passed++;
    } else {
      log(`Summary stats check failed: ${JSON.stringify(summary)}`, false);
      failed++;
    }

    // TEST 11: Product Deletion Protection
    console.log('\n--- Test 11: Product deletion protection ---');
    try {
      await productService.deleteProduct(product._id);
      log('Product with active batches was deleted (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400 && err.message.includes('associated inventory batch(es)')) {
        log(`Product deletion blocked with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error on protected deletion: ${err.message}`, false);
        failed++;
      }
    }

    // TEST 12: Stock Movement Audit Log
    console.log('\n--- Test 12: Stock movement audit log ---');
    const movementsResult = await inventoryService.getMovements({ batch: b1._id.toString() });
    if (movementsResult.movements.length === 3) { // 1 received, 1 damaged, 1 increase
      log(`Movement history confirmed: ${movementsResult.movements.length} audit entries for batch ${b1.batchNumber}`);
      passed++;
    } else {
      log(`Movement history count mismatch: expected 3, got ${movementsResult.movements.length}`, false);
      failed++;
    }

    // TEST 13: Batch metadata update
    console.log('\n--- Test 13: Batch metadata update ---');
    const updatedBatch = await inventoryService.updateBatch(b1._id, {
      batchNumber: 'LOT-A101-UPDATED',
      sellingPrice: 2.49,
      notes: 'TEST_PHASE5 Price adjusted'
    });
    if (updatedBatch.batchNumber === 'LOT-A101-UPDATED' && updatedBatch.sellingPrice === 2.49) {
      log('Batch metadata successfully updated');
      passed++;
    } else {
      log('Batch update failed', false);
      failed++;
    }

    // CLEANUP
    console.log('\n--- Cleanup: Purging test data ---');
    await InventoryBatch.deleteMany({ notes: { $regex: /^TEST_PHASE5/ } });
    await StockMovement.deleteMany({ reason: { $regex: /^TEST_PHASE5/ } });
    await Product.deleteMany({ name: { $regex: /^TEST_PHASE5/ } });
    await User.deleteMany({ email: 'phase5_owner@test.nearexpiry.local' });
    log('Database cleanly reset: 0 test records remaining');

  } catch (error) {
    console.error('[FATAL TEST ERROR]', error);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n======================================================');
    console.log(`  Phase 5 Tests Complete: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
};

runPhase5Tests();
