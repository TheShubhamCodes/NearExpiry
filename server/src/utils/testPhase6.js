/**
 * Phase 6 Unit & Domain Verification Test Suite
 * Tests Store thresholds, Product reorderPoint, 6 explicit Expiry statuses,
 * Timezone-aware date boundaries, FEFO sorting, and Risk calculations.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const User = require('../models/User');
const {
  getCalendarDateParts,
  getDaysUntilExpiry,
  calculateBatchExpiryStatus
} = require('./expiryUtils');
const expiryService = require('../services/expiryService');

let testUser;
let testProduct1;
let testProduct2;
let initialStore;

async function runTests() {
  console.log('--- Starting Phase 6 Domain & Service Verification ---');
  await mongoose.connect(mongodbUri);

  try {
    // Clean up test collections
    await User.deleteMany({ email: /testphase6/ });
    await Product.deleteMany({ name: /Phase6Test/ });
    await InventoryBatch.deleteMany({ batchNumber: /P6-/ });

    testUser = await User.create({
      fullName: 'Phase6 Tester',
      email: 'testphase6_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner'
    });

    // 1. Verify Store configuration defaults and validation
    console.log('Test 1: Store Expiry & Timezone Configuration');
    let store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Phase 6 Test Mart',
        contactEmail: 'phase6@test.com'
      });
    }

    if (store.expiryWarningDays !== 7) throw new Error(`Expected default warning days 7, got ${store.expiryWarningDays}`);
    if (store.expiryCriticalDays !== 3) throw new Error(`Expected default critical days 3, got ${store.expiryCriticalDays}`);
    if (store.lowStockThreshold !== 5) throw new Error(`Expected default low-stock threshold 5, got ${store.lowStockThreshold}`);
    if (store.timezone !== 'Asia/Kolkata') throw new Error(`Expected default timezone Asia/Kolkata, got ${store.timezone}`);
    console.log('  ✓ Store defaults verified (7 warning, 3 critical, 5 low stock, Asia/Kolkata)');

    // Test rejection when critical > warning
    let validationFailed = false;
    try {
      store.expiryCriticalDays = 10;
      store.expiryWarningDays = 5;
      await store.save();
    } catch (e) {
      validationFailed = true;
    }
    if (!validationFailed) throw new Error('Expected validation failure when criticalDays > warningDays');
    console.log('  ✓ Pre-validation hook correctly rejected criticalDays > warningDays');

    // Test invalid timezone rejection
    validationFailed = false;
    try {
      store.expiryCriticalDays = 3;
      store.expiryWarningDays = 7;
      store.timezone = 'Invalid/Fakeland';
      await store.save();
    } catch (e) {
      validationFailed = true;
    }
    if (!validationFailed) throw new Error('Expected validation failure for invalid timezone');
    console.log('  ✓ Invalid IANA timezone correctly rejected');

    // Reset store settings to valid values
    store.timezone = 'Asia/Kolkata';
    store.expiryCriticalDays = 3;
    store.expiryWarningDays = 7;
    await store.save();

    // 2. Product model reorderPoint field
    console.log('\nTest 2: Product reorderPoint Field');
    testProduct1 = await Product.create({
      name: 'Phase6Test Milk 1L',
      brand: 'DairyFresh',
      category: 'Dairy & Eggs',
      unit: 'litre',
      reorderPoint: 15,
      createdBy: testUser._id
    });

    testProduct2 = await Product.create({
      name: 'Phase6Test Bread',
      brand: 'GoldenLoaf',
      category: 'Bakery & Bread',
      unit: 'packet',
      reorderPoint: null,
      createdBy: testUser._id
    });

    if (testProduct1.reorderPoint !== 15) throw new Error(`Expected reorderPoint 15, got ${testProduct1.reorderPoint}`);
    if (testProduct2.reorderPoint !== null) throw new Error(`Expected reorderPoint null, got ${testProduct2.reorderPoint}`);
    console.log('  ✓ Product reorderPoint supported (explicit value 15 and null)');

    // 3. Centralized Expiry Calculation Engine: All 6 explicit statuses
    console.log('\nTest 3: 6 Explicit Expiry Statuses Classification');
    const tz = 'Asia/Kolkata';
    const todayParts = getCalendarDateParts(new Date(), tz);
    
    // Helper to format date offset in days relative to today in store timezone
    const makeDate = (dayOffset) => {
      const d = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + dayOffset, 12, 0, 0));
      return d;
    };

    // Case A: DEPLETED (currentQuantity = 0, even if unexpired)
    const statDepleted = calculateBatchExpiryStatus(
      { expiryDate: makeDate(10), currentQuantity: 0, purchasePrice: 2.5 },
      { expiryWarningDays: 7, expiryCriticalDays: 3, timezone: tz }
    );
    if (statDepleted.status !== 'DEPLETED') throw new Error(`Expected DEPLETED, got ${statDepleted.status}`);
    if (statDepleted.isSaleable !== false) throw new Error('Depleted batch should not be saleable');
    console.log('  ✓ Status 1: DEPLETED (0 quantity takes precedence)');

    // Case B: EXPIRED (past date, e.g. -2 days)
    const statExpired = calculateBatchExpiryStatus(
      { expiryDate: makeDate(-2), currentQuantity: 10, purchasePrice: 2.5 },
      { expiryWarningDays: 7, expiryCriticalDays: 3, timezone: tz }
    );
    if (statExpired.status !== 'EXPIRED') throw new Error(`Expected EXPIRED, got ${statExpired.status}`);
    if (statExpired.isSaleable !== false) throw new Error('Expired batch should not be saleable');
    if (statExpired.riskLevel !== 'HIGH') throw new Error('Expired batch should have HIGH riskLevel');
    console.log('  ✓ Status 2: EXPIRED (past calendar day, not saleable, high risk)');

    // Case C: EXPIRING_TODAY (0 days remaining)
    const statToday = calculateBatchExpiryStatus(
      { expiryDate: makeDate(0), currentQuantity: 8, purchasePrice: 2.5 },
      { expiryWarningDays: 7, expiryCriticalDays: 3, timezone: tz }
    );
    if (statToday.status !== 'EXPIRING_TODAY') throw new Error(`Expected EXPIRING_TODAY, got ${statToday.status}`);
    if (statToday.isSaleable !== true) throw new Error('Expiring today batch MUST remain active and saleable on its final day');
    if (statToday.daysUntilExpiry !== 0) throw new Error(`Expected 0 days until expiry, got ${statToday.daysUntilExpiry}`);
    console.log('  ✓ Status 3: EXPIRING_TODAY (remains active and saleable on final day)');

    // Case D: CRITICAL (1 to 3 days remaining)
    const statCritical = calculateBatchExpiryStatus(
      { expiryDate: makeDate(2), currentQuantity: 12, purchasePrice: 2.5 },
      { expiryWarningDays: 7, expiryCriticalDays: 3, timezone: tz }
    );
    if (statCritical.status !== 'CRITICAL') throw new Error(`Expected CRITICAL, got ${statCritical.status}`);
    if (statCritical.isSaleable !== true) throw new Error('Critical batch should be saleable');
    if (statCritical.riskLevel !== 'HIGH') throw new Error('Critical batch should have HIGH riskLevel');
    console.log('  ✓ Status 4: CRITICAL (1-3 days, saleable, high risk)');

    // Case E: EXPIRING_SOON (4 to 7 days remaining)
    const statSoon = calculateBatchExpiryStatus(
      { expiryDate: makeDate(5), currentQuantity: 20, purchasePrice: 2.5 },
      { expiryWarningDays: 7, expiryCriticalDays: 3, timezone: tz }
    );
    if (statSoon.status !== 'EXPIRING_SOON') throw new Error(`Expected EXPIRING_SOON, got ${statSoon.status}`);
    if (statSoon.isSaleable !== true) throw new Error('Expiring soon batch should be saleable');
    if (statSoon.riskLevel !== 'MEDIUM') throw new Error('Expiring soon batch should have MEDIUM riskLevel');
    console.log('  ✓ Status 5: EXPIRING_SOON (4-7 days, saleable, medium risk)');

    // Case F: FRESH (> 7 days remaining)
    const statFresh = calculateBatchExpiryStatus(
      { expiryDate: makeDate(14), currentQuantity: 50, purchasePrice: 2.5 },
      { expiryWarningDays: 7, expiryCriticalDays: 3, timezone: tz }
    );
    if (statFresh.status !== 'FRESH') throw new Error(`Expected FRESH, got ${statFresh.status}`);
    if (statFresh.isSaleable !== true) throw new Error('Fresh batch should be saleable');
    if (statFresh.riskLevel !== 'LOW') throw new Error('Fresh batch should have LOW riskLevel');
    console.log('  ✓ Status 6: FRESH (> 7 days, safe for regular storage, low risk)');

    // 4. Create batches to test FEFO Recommendation Engine & Summaries
    console.log('\nTest 4: FEFO Recommendation Engine & Batch Queue');

    // Create 3 batches for Product 1:
    // Batch A: Expiring in 2 days (Critical)
    const batchA = await InventoryBatch.create({
      product: testProduct1._id,
      batchNumber: 'P6-B1-CRIT',
      quantityReceived: 10,
      currentQuantity: 10,
      purchasePrice: 1.5,
      expiryDate: makeDate(2),
      receivedDate: new Date(Date.now() - 5 * 86400000),
      createdBy: testUser._id
    });

    // Batch B: Expiring in 6 days (Expiring soon)
    const batchB = await InventoryBatch.create({
      product: testProduct1._id,
      batchNumber: 'P6-B2-SOON',
      quantityReceived: 15,
      currentQuantity: 15,
      purchasePrice: 1.5,
      expiryDate: makeDate(6),
      receivedDate: new Date(Date.now() - 3 * 86400000),
      createdBy: testUser._id
    });

    // Batch C: Expired 1 day ago (Expired - must NOT be picked!)
    const batchC = await InventoryBatch.create({
      product: testProduct1._id,
      batchNumber: 'P6-B3-EXP',
      quantityReceived: 5,
      currentQuantity: 5,
      purchasePrice: 1.5,
      expiryDate: makeDate(-1),
      receivedDate: new Date(Date.now() - 10 * 86400000),
      createdBy: testUser._id
    });

    // Batch D: Product 2, Fresh
    const batchD = await InventoryBatch.create({
      product: testProduct2._id,
      batchNumber: 'P6-B4-FRESH',
      quantityReceived: 30,
      currentQuantity: 30,
      purchasePrice: 2.0,
      expiryDate: makeDate(12),
      receivedDate: new Date(),
      createdBy: testUser._id
    });

    const fefoResult = await expiryService.getFEFORecommendations();
    if (!fefoResult.recommendations || fefoResult.recommendations.length === 0) {
      throw new Error('FEFO recommendations empty');
    }

    const p1Rec = fefoResult.recommendations.find(
      (r) => r.product._id.toString() === testProduct1._id.toString()
    );
    if (!p1Rec) throw new Error('Product 1 not found in FEFO recommendations');

    // Top pick must be Batch A (expires in 2 days)
    if (p1Rec.batches[0].batchNumber !== 'P6-B1-CRIT') {
      throw new Error(`Expected #1 FEFO pick to be P6-B1-CRIT, got ${p1Rec.batches[0].batchNumber}`);
    }
    if (p1Rec.batches[0].isFefoPick !== true) throw new Error('Batch A should have isFefoPick=true');
    if (!p1Rec.batches[0].fefoRecommendation.includes('P6-B1-CRIT')) {
      throw new Error('Batch A fefoRecommendation should mention batch number');
    }

    // Second pick must be Batch B
    if (p1Rec.batches[1].batchNumber !== 'P6-B2-SOON') {
      throw new Error(`Expected queue #2 to be P6-B2-SOON, got ${p1Rec.batches[1].batchNumber}`);
    }
    if (p1Rec.batches[1].isFefoPick !== false) throw new Error('Batch B should have isFefoPick=false');

    // Expired Batch C must NOT be in the saleable batch queue
    const hasExpiredInQueue = p1Rec.batches.some((b) => b.batchNumber === 'P6-B3-EXP');
    if (hasExpiredInQueue) throw new Error('Expired batch C was incorrectly included in saleable FEFO queue');
    if (p1Rec.expiredBatchesCount !== 1) throw new Error(`Expected 1 expired batch count, got ${p1Rec.expiredBatchesCount}`);
    console.log('  ✓ FEFO Engine correctly ranked earliest expiring batch as #1 Pick First');
    console.log('  ✓ FEFO Engine correctly excluded expired stock from saleable recommendations');

    // 5. Expiry Summary Statistics
    console.log('\nTest 5: Expiry Summary Metrics');
    const summary = await expiryService.getExpirySummary();
    if (summary.expiredBatches < 1) throw new Error(`Expected at least 1 expired batch, got ${summary.expiredBatches}`);
    if (summary.criticalBatches < 1) throw new Error(`Expected at least 1 critical batch, got ${summary.criticalBatches}`);
    if (summary.expiringSoonBatches < 1) throw new Error(`Expected at least 1 expiring soon batch, got ${summary.expiringSoonBatches}`);
    if (summary.freshBatches < 1) throw new Error(`Expected at least 1 fresh batch, got ${summary.freshBatches}`);
    if (summary.totalValueAtRisk <= 0) throw new Error(`Expected value at risk > 0, got ${summary.totalValueAtRisk}`);
    if (summary.expiredCostLoss !== 7.5) { // 5 units * 1.5 = 7.5
      throw new Error(`Expected expiredCostLoss 7.5, got ${summary.expiredCostLoss}`);
    }
    console.log(`  ✓ Summary accurate: Expired Loss = $${summary.expiredCostLoss}, Value At Risk = $${summary.totalValueAtRisk}`);

    // 6. Monthly Calendar Aggregation
    console.log('\nTest 6: Expiry Calendar Data');
    const calData = await expiryService.getExpiryCalendarData();
    if (!calData.calendarDays) throw new Error('Calendar days missing');
    if (calData.month !== todayParts.month) throw new Error('Calendar month mismatch');
    console.log(`  ✓ Calendar aggregated for month ${calData.monthName} (${calData.daysInMonth} days)`);

    // 7. Risk Assessment
    console.log('\nTest 7: Expiry Risk Assessment Breakdown');
    const riskData = await expiryService.getExpiryRiskAssessment();
    if (riskData.expired.length < 1) throw new Error('Risk assessment missing expired batch');
    if (riskData.highRisk.length < 1) throw new Error('Risk assessment missing high-risk batch');
    if (riskData.mediumRisk.length < 1) throw new Error('Risk assessment missing medium-risk batch');
    if (riskData.lowRisk.length < 1) throw new Error('Risk assessment missing low-risk batch');
    console.log(`  ✓ Risk tiers: Expired (${riskData.expired.length}), High (${riskData.highRisk.length}), Medium (${riskData.mediumRisk.length}), Low (${riskData.lowRisk.length})`);

    console.log('\n--- ALL 7 PHASE 6 UNIT & DOMAIN TESTS PASSED! ---');
  } finally {
    // Clean up test data
    await User.deleteMany({ email: /testphase6/ });
    await Product.deleteMany({ name: /Phase6Test/ });
    await InventoryBatch.deleteMany({ batchNumber: /P6-/ });
    await Store.deleteMany({ contactEmail: /phase6/ });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Phase 6 Test Failed:', err);
  process.exit(1);
});
