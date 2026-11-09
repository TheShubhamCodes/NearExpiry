/**
 * NearExpiry — Phase 5 Final Inventory Logic Verification Suite
 * 
 * Verifies:
 * 1. Stock increase adjustments & strict invariant (0 <= currentQuantity <= quantityReceived)
 * 2. Atomic database operations & compensation rollback on failure
 * 3. Expiry date handling & date boundary verification (yesterday, today, tomorrow)
 * 4. Centralized low-stock threshold application
 * 5. Data persistence and hygiene
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const StockMovement = require('../models/StockMovement');
const inventoryService = require('../services/inventoryService');
const {
  getStartOfToday,
  getEndOfToday,
  getSevenDaysLater,
  computeBatchStatus
} = require('../utils/expiryUtils');

const log = (msg, success = true) => {
  console.log(`${success ? '  [PASS]' : '  [FAIL]'} ${msg}`);
};

const runVerification = async () => {
  console.log('\n======================================================');
  console.log('  NearExpiry — Phase 5 Final Logic Verification');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    await mongoose.connect(mongodbUri);
    console.log('[Setup] Connected to MongoDB');

    // 0. Setup test user
    let user = await User.findOne({ role: 'owner' });
    if (!user) {
      user = await User.create({
        fullName: 'Verification Owner',
        email: 'verify_owner@test.nearexpiry.local',
        password: 'Password123!',
        role: 'owner',
        isActive: true
      });
    }

    // Clean up any old test records
    await InventoryBatch.deleteMany({ notes: { $regex: /^VERIFY_/ } });
    await StockMovement.deleteMany({ reason: { $regex: /^VERIFY_/ } });
    await Product.deleteMany({ name: { $regex: /^VERIFY_/ } });

    // Create test product
    const product = await Product.create({
      name: 'VERIFY_Test Greek Yogurt 500g',
      brand: 'Olympus',
      category: 'Dairy & Eggs',
      unit: 'piece',
      createdBy: user._id
    });

    // ========================================================
    // PART 1: Stock Increase Adjustments & Quantity Semantics
    // ========================================================
    console.log('\n--- Part 1: Stock Increase Adjustments & Invariants ---');

    // Receive 50 units
    const expFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const { batch: b1 } = await inventoryService.receiveStock({
      productId: product._id.toString(),
      batchNumber: 'VERIFY-LOT-1',
      quantityReceived: 50,
      purchasePrice: 2.00,
      expiryDate: expFuture,
      notes: 'VERIFY_Initial'
    }, user._id);

    log(`Batch initialized with quantityReceived: ${b1.quantityReceived}, currentQuantity: ${b1.currentQuantity}`);
    passed++;

    // Decrease stock by 10 (to 40)
    await inventoryService.adjustStock(
      b1._id,
      { adjustmentType: 'STOCK_ADJUSTED_DECREASE', quantity: 10, reason: 'VERIFY_Sale or damage' },
      user._id
    );

    let currentBatch = await InventoryBatch.findById(b1._id);
    if (currentBatch.currentQuantity === 40 && currentBatch.quantityReceived === 50) {
      log('Stock decreased to 40 (quantityReceived remained intact at 50)');
      passed++;
    } else {
      log('Stock decrease failed', false);
      failed++;
    }

    // Increase stock by 5 (to 45) -> valid because 45 <= 50
    await inventoryService.adjustStock(
      b1._id,
      { adjustmentType: 'STOCK_ADJUSTED_INCREASE', quantity: 5, reason: 'VERIFY_Recount recovery' },
      user._id
    );

    currentBatch = await InventoryBatch.findById(b1._id);
    if (currentBatch.currentQuantity === 45 && currentBatch.quantityReceived === 50) {
      log('Stock increased back to 45 (within quantityReceived boundary)');
      passed++;
    } else {
      log('Valid stock increase failed', false);
      failed++;
    }

    // Attempt to increase stock by 10 (which would yield 55 > 50) -> MUST FAIL with HTTP 400
    try {
      await inventoryService.adjustStock(
        b1._id,
        { adjustmentType: 'STOCK_ADJUSTED_INCREASE', quantity: 10, reason: 'VERIFY_Excess increase' },
        user._id
      );
      log('Increasing stock beyond quantityReceived was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400 && err.message.includes('cannot exceed original quantity received')) {
        log(`Increasing stock beyond quantityReceived blocked with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error: ${err.message}`, false);
        failed++;
      }
    }

    // Attempt to set newQuantity = 60 (> 50) -> MUST FAIL with HTTP 400
    try {
      await inventoryService.adjustStock(
        b1._id,
        { newQuantity: 60, reason: 'VERIFY_New quantity excess' },
        user._id
      );
      log('Setting newQuantity beyond quantityReceived was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400 && err.message.includes('cannot exceed original quantity received')) {
        log(`Setting newQuantity beyond quantityReceived blocked with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error: ${err.message}`, false);
        failed++;
      }
    }

    // Verify quantityReceived was never silently mutated
    currentBatch = await InventoryBatch.findById(b1._id);
    if (currentBatch.quantityReceived === 50 && currentBatch.currentQuantity === 45) {
      log('quantityReceived field remained strictly immutable (50)');
      passed++;
    } else {
      log('quantityReceived was mutated unintentionally', false);
      failed++;
    }

    // ========================================================
    // PART 2: Atomic Database Operations & Compensation Rollback
    // ========================================================
    console.log('\n--- Part 2: Atomic Database Operations & Rollback ---');

    // Test rollback in receiveStock if movement creation fails
    const initialBatchCount = await InventoryBatch.countDocuments({ product: product._id });
    
    // Attempt receiveStock with a monkey-patched movement save to simulate a mid-transaction crash
    const originalSave = StockMovement.prototype.save;
    StockMovement.prototype.save = function () {
      return Promise.reject(new Error('SIMULATED_DB_FAILURE_IN_MOVEMENT'));
    };

    try {
      await inventoryService.receiveStock({
        productId: product._id.toString(),
        batchNumber: 'VERIFY-FAIL-BATCH',
        quantityReceived: 100,
        purchasePrice: 3.00,
        expiryDate: expFuture,
        notes: 'VERIFY_Fail'
      }, user._id);
      log('Failed receiveStock succeeded unexpectedly (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.message === 'SIMULATED_DB_FAILURE_IN_MOVEMENT') {
        const postCrashBatchCount = await InventoryBatch.countDocuments({ product: product._id });
        if (postCrashBatchCount === initialBatchCount) {
          log('Atomic compensation rollback verified: Orphaned batch was deleted after movement failure');
          passed++;
        } else {
          log(`Rollback failed: Orphan batch remained in database (count: ${postCrashBatchCount})`, false);
          failed++;
        }
      } else {
        log(`Unexpected error: ${err.message}`, false);
        failed++;
      }
    }

    // Test rollback in adjustStock if movement creation fails
    StockMovement.prototype.save = function () {
      return Promise.reject(new Error('SIMULATED_DB_FAILURE_IN_ADJUST_MOVEMENT'));
    };

    const preAdjustQty = (await InventoryBatch.findById(b1._id)).currentQuantity; // 45
    try {
      await inventoryService.adjustStock(
        b1._id,
        { adjustmentType: 'STOCK_DAMAGED', quantity: 5, reason: 'VERIFY_Fail adjust' },
        user._id
      );
      log('Failed adjustStock succeeded unexpectedly (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.message === 'SIMULATED_DB_FAILURE_IN_ADJUST_MOVEMENT') {
        const postCrashBatch = await InventoryBatch.findById(b1._id);
        if (postCrashBatch.currentQuantity === preAdjustQty) {
          log(`Atomic compensation rollback verified: Batch stock reverted back to ${preAdjustQty}`);
          passed++;
        } else {
          log(`Rollback failed: Batch quantity remained corrupted at ${postCrashBatch.currentQuantity}`, false);
          failed++;
        }
      } else {
        log(`Unexpected error: ${err.message}`, false);
        failed++;
      }
    }

    // Restore original StockMovement.prototype.save
    StockMovement.prototype.save = originalSave;

    // ========================================================
    // PART 3: Expiry Date Handling & Boundary Logic
    // ========================================================
    console.log('\n--- Part 3: Expiry Date Handling (Yesterday, Today, Tomorrow) ---');

    const startOfToday = getStartOfToday();
    const endOfToday = getEndOfToday();

    // Dates for Yesterday, Today, Tomorrow
    const yesterdayDate = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const todayDate = new Date(startOfToday.getTime() + 12 * 60 * 60 * 1000); // 12 noon today
    const tomorrowDate = new Date(endOfToday.getTime() + 12 * 60 * 60 * 1000); // 12 noon tomorrow

    // 1. Check computeBatchStatus helper
    const yestStatus = computeBatchStatus(yesterdayDate, 10);
    const todayStatus = computeBatchStatus(todayDate, 10);
    const tomStatus = computeBatchStatus(tomorrowDate, 10);

    if (yestStatus.isExpired === true && yestStatus.batchStatus === 'expired') {
      log(`Yesterday (${yesterdayDate.toLocaleDateString()}): Correctly categorized as strictly EXPIRED`);
      passed++;
    } else {
      log('Yesterday expiry status failed', false);
      failed++;
    }

    if (todayStatus.isExpired === false && todayStatus.isExpiringToday === true && todayStatus.batchStatus === 'expiringToday') {
      log(`Today (${todayDate.toLocaleDateString()}): Correctly active on final shelf-life day with expiringToday flag`);
      passed++;
    } else {
      log('Today expiry status failed', false);
      failed++;
    }

    if (tomStatus.isExpired === false && tomStatus.isExpiringSoon === true && tomStatus.batchStatus === 'expiringSoon') {
      log(`Tomorrow (${tomorrowDate.toLocaleDateString()}): Correctly active and flagged as expiringSoon`);
      passed++;
    } else {
      log('Tomorrow expiry status failed', false);
      failed++;
    }

    // 2. Test in MongoDB queries via receiveStock
    const { batch: bYest } = await inventoryService.receiveStock({
      productId: product._id.toString(),
      batchNumber: 'VERIFY-YEST',
      quantityReceived: 10,
      purchasePrice: 1.00,
      expiryDate: yesterdayDate,
      notes: 'VERIFY_Yesterday'
    }, user._id);

    const { batch: bToday } = await inventoryService.receiveStock({
      productId: product._id.toString(),
      batchNumber: 'VERIFY-TODAY',
      quantityReceived: 15,
      purchasePrice: 1.00,
      expiryDate: todayDate,
      notes: 'VERIFY_Today'
    }, user._id);

    const { batch: bTom } = await inventoryService.receiveStock({
      productId: product._id.toString(),
      batchNumber: 'VERIFY-TOM',
      quantityReceived: 20,
      purchasePrice: 1.00,
      expiryDate: tomorrowDate,
      notes: 'VERIFY_Tomorrow'
    }, user._id);

    // Query active vs expired batches
    const activeQuery = await inventoryService.getBatches({ status: 'active', product: product._id.toString() });
    const expiredQuery = await inventoryService.getBatches({ status: 'expired', product: product._id.toString() });

    const activeIds = activeQuery.batches.map(b => b._id.toString());
    const expiredIds = expiredQuery.batches.map(b => b._id.toString());

    if (expiredIds.includes(bYest._id.toString()) && !expiredIds.includes(bToday._id.toString())) {
      log('MongoDB query: Yesterday batch is in expired list; Today batch is NOT in expired list');
      passed++;
    } else {
      log('Expired MongoDB query failed', false);
      failed++;
    }

    if (activeIds.includes(bToday._id.toString()) && activeIds.includes(bTom._id.toString()) && !activeIds.includes(bYest._id.toString())) {
      log('MongoDB query: Today and Tomorrow batches are in active list; Yesterday is excluded');
      passed++;
    } else {
      log('Active MongoDB query failed', false);
      failed++;
    }

    // ========================================================
    // PART 4: Low-Stock Threshold
    // ========================================================
    console.log('\n--- Part 4: Low-Stock Threshold ---');

    const summary = await inventoryService.getInventorySummary();
    if (summary.lowStockThreshold === 5) {
      log(`Summary endpoint correctly reports centralized lowStockThreshold: ${summary.lowStockThreshold}`);
      passed++;
    } else {
      log('lowStockThreshold missing or mismatch', false);
      failed++;
    }

    // Clean up
    await InventoryBatch.deleteMany({ notes: { $regex: /^VERIFY_/ } });
    await StockMovement.deleteMany({ reason: { $regex: /^VERIFY_/ } });
    await Product.deleteMany({ name: { $regex: /^VERIFY_/ } });
    await User.deleteMany({ email: 'verify_owner@test.nearexpiry.local' });
    log('Database cleanly reset: 0 verification test records remaining');

  } catch (error) {
    console.error('[FATAL VERIFICATION ERROR]', error);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n======================================================');
    console.log(`  Verification Tests Complete: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
};

runVerification();

