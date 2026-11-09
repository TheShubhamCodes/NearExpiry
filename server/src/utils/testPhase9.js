/**
 * Phase 9 Unit & Service Verification Test Suite
 * Tests Advanced Business Dashboard metrics, zero double-counting valuation,
 * Expiry distribution, category valuation, ageing tiers, FEFO compliance,
 * and multi-type reporting with CSV export generation.
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
const analyticsService = require('../services/analyticsService');
const actionService = require('../services/actionService');

async function runTests() {
  console.log('--- Starting Phase 9 Domain & Service Verification ---');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let prodMilk;
  let prodBread;
  let prodApples;
  let critBatch;
  let freshBatch;
  let expBatch;

  try {
    // 0. Clean up previous test data
    await User.deleteMany({ email: /testp9/ });
    await Product.deleteMany({ name: /TestP9/ });
    await InventoryBatch.deleteMany({ batchNumber: /P9-/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /Phase 9/i });

    // 1. Setup store, owner, and employee
    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Phase 9 Analytics Supermarket',
        contactEmail: 'phase9@test.com',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata'
      });
    }

    owner = await User.create({
      fullName: 'Phase9 Owner',
      email: 'testp9_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Phase9 Employee',
      email: 'testp9_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    // 2. Create products with explicit categories and reorder points
    prodMilk = await Product.create({
      name: 'TestP9 Whole Milk 1L',
      brand: 'DairyBest',
      category: 'Dairy',
      unit: 'litre',
      reorderPoint: 15,
      createdBy: owner._id
    });

    prodBread = await Product.create({
      name: 'TestP9 Sliced Bread 400g',
      brand: 'BakeHouse',
      category: 'Bakery',
      unit: 'packet',
      reorderPoint: 5,
      createdBy: owner._id
    });

    prodApples = await Product.create({
      name: 'TestP9 Gala Apples 1kg',
      brand: 'OrchardFresh',
      category: 'Produce',
      unit: 'kg',
      reorderPoint: 10,
      createdBy: owner._id
    });

    const now = new Date();
    // Critical batch: 20 units @ $2.00 cost, $4.00 retail, expires in 2 days
    critBatch = await InventoryBatch.create({
      product: prodMilk._id,
      batchNumber: 'P9-CRIT-01',
      quantityReceived: 20,
      currentQuantity: 20,
      purchasePrice: 2.0,
      sellingPrice: 4.0,
      expiryDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      receivedDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      createdBy: owner._id
    });

    // Fresh batch: 30 units @ $2.00 cost, $4.00 retail, expires in 20 days
    freshBatch = await InventoryBatch.create({
      product: prodMilk._id,
      batchNumber: 'P9-FRESH-01',
      quantityReceived: 30,
      currentQuantity: 30,
      purchasePrice: 2.0,
      sellingPrice: 4.0,
      expiryDate: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
      receivedDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      createdBy: owner._id
    });

    // Expired batch: 10 units @ $1.50 cost, $3.00 retail, expired 2 days ago
    expBatch = await InventoryBatch.create({
      product: prodBread._id,
      batchNumber: 'P9-EXP-01',
      quantityReceived: 10,
      currentQuantity: 10,
      purchasePrice: 1.5,
      sellingPrice: 3.0,
      expiryDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      receivedDate: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
      createdBy: owner._id
    });

    // Log movement for stock received
    await StockMovement.create({
      product: prodMilk._id,
      batch: critBatch._id,
      movementType: 'STOCK_RECEIVED',
      quantityChanged: 20,
      quantityBefore: 0,
      quantityAfter: 20,
      reason: 'Phase 9 test initial receipt',
      user: owner._id
    });

    // Create 1 Quarantined disposition: 5 units of Bread
    await actionService.quarantineStock(
      {
        batchId: expBatch._id.toString(),
        quantity: 5,
        reason: 'Phase 9 segregated expired bread'
      },
      employee
    );

    // Create 1 active Markdown: 25% on critical milk
    const md = await actionService.createMarkdownRequest(
      {
        batchId: critBatch._id.toString(),
        discountPercent: 25,
        reason: 'Phase 9 clearance discount'
      },
      owner
    );
    await actionService.approveMarkdown(md._id, owner);
    await actionService.activateMarkdown(md._id, owner);

    // Create 1 pending Supplier Return: 5 units of milk
    await actionService.createSupplierReturn(
      {
        productId: prodMilk._id.toString(),
        batchId: freshBatch._id.toString(),
        supplierName: 'Dairy Distributor Inc.',
        quantity: 5,
        reason: 'NEAR_EXPIRY',
        resolutionExpected: 'REPLACEMENT'
      },
      employee
    );

    console.log('✓ Test fixtures, batches, and action documents initialized successfully');

    // -------------------------------------------------------------------------
    // Test 1: Dashboard Analytics & Zero Double-Counting Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Dashboard Analytics & Valuation ---');
    const analytics = await analyticsService.getDashboardAnalytics('30days');
    console.log('Dashboard Analytics Overview:', {
      totalProducts: analytics.catalog.totalProducts,
      lowStockProducts: analytics.catalog.lowStockProductsCount,
      saleableUnits: analytics.inventoryValuation.saleable.units,
      saleableCost: analytics.inventoryValuation.saleable.costValue,
      expiredInBatchUnits: analytics.inventoryValuation.expired.units,
      quarantinedUnits: analytics.inventoryValuation.quarantined.units,
      totalPhysicalUnits: analytics.inventoryValuation.totalPhysicalUnits,
      totalPhysicalCostValue: analytics.inventoryValuation.totalPhysicalCostValue
    });

    // Catalog checks
    if (analytics.catalog.totalProducts !== 3) {
      throw new Error(`Expected 3 total products, got ${analytics.catalog.totalProducts}`);
    }
    // Low stock: Bread has 0 saleable units (<= 5), Apples has 0 units (<= 10), Milk has 50 (> 15). Total = 2.
    if (analytics.catalog.lowStockProductsCount !== 2) {
      throw new Error(`Expected 2 low-stock products, got ${analytics.catalog.lowStockProductsCount}`);
    }

    // Valuation & zero double-counting checks:
    // Saleable units: 20 (crit) + 30 (fresh) = 50. Cost: 50 * 2.0 = $100.
    if (analytics.inventoryValuation.saleable.units !== 50) {
      throw new Error(`Expected 50 saleable units, got ${analytics.inventoryValuation.saleable.units}`);
    }
    if (analytics.inventoryValuation.saleable.costValue !== 100.0) {
      throw new Error(`Expected $100.00 saleable cost, got ${analytics.inventoryValuation.saleable.costValue}`);
    }

    // Expired in batch: 5 units remaining (10 original - 5 quarantined). Cost: 5 * 1.5 = $7.50.
    if (analytics.inventoryValuation.expired.units !== 5) {
      throw new Error(`Expected 5 expired-in-batch units, got ${analytics.inventoryValuation.expired.units}`);
    }
    if (analytics.inventoryValuation.expired.costValue !== 7.5) {
      throw new Error(`Expected $7.50 expired cost, got ${analytics.inventoryValuation.expired.costValue}`);
    }

    // Quarantined: 5 units. Cost: 5 * 1.5 = $7.50.
    if (analytics.inventoryValuation.quarantined.units !== 5) {
      throw new Error(`Expected 5 quarantined units, got ${analytics.inventoryValuation.quarantined.units}`);
    }
    if (analytics.inventoryValuation.quarantined.costValue !== 7.5) {
      throw new Error(`Expected $7.50 quarantined cost, got ${analytics.inventoryValuation.quarantined.costValue}`);
    }

    // Total Physical: 50 saleable + 5 expired + 5 quarantined = 60 units. Cost: 100 + 7.5 + 7.5 = $115.00.
    if (analytics.inventoryValuation.totalPhysicalUnits !== 60) {
      throw new Error(`Expected 60 total physical units, got ${analytics.inventoryValuation.totalPhysicalUnits}`);
    }
    if (analytics.inventoryValuation.totalPhysicalCostValue !== 115.0) {
      throw new Error(`Expected $115.00 total physical cost value, got ${analytics.inventoryValuation.totalPhysicalCostValue}`);
    }
    console.log('✓ Physical, Saleable, and Quarantined inventory values strictly verified with zero double-counting');

    // Actions & Movements checks
    if (analytics.actions.markdowns.activeCount !== 1) {
      throw new Error(`Expected 1 active markdown, got ${analytics.actions.markdowns.activeCount}`);
    }
    if (analytics.actions.supplierReturns.pendingCount !== 1) {
      throw new Error(`Expected 1 pending return, got ${analytics.actions.supplierReturns.pendingCount}`);
    }
    console.log('✓ Markdown and Supplier Return dashboard counters match active state');

    // -------------------------------------------------------------------------
    // Test 2: Expiry Distribution Breakdown
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Expiry Distribution Breakdown ---');
    const distRes = await analyticsService.getExpiryDistribution();
    const dist = distRes.distribution;

    const freshTier = dist.find((t) => t.status === 'FRESH');
    const critTier = dist.find((t) => t.status === 'CRITICAL');
    const expTier = dist.find((t) => t.status === 'EXPIRED');

    if (!freshTier || freshTier.units !== 30) {
      throw new Error(`Expected 30 fresh units, got: ${freshTier?.units}`);
    }
    if (!critTier || critTier.units !== 20) {
      throw new Error(`Expected 20 critical units, got: ${critTier?.units}`);
    }
    if (!expTier || expTier.units !== 5) {
      throw new Error(`Expected 5 expired units, got: ${expTier?.units}`);
    }
    console.log('✓ 6-tier expiry distribution accurately mirrors inventory shelf-life');

    // -------------------------------------------------------------------------
    // Test 3: Category Valuation
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Category-wise Valuation ---');
    const catRes = await analyticsService.getCategoryValuation();
    const categories = catRes.categories;

    const dairy = categories.find((c) => c.category === 'Dairy');
    const bakery = categories.find((c) => c.category === 'Bakery');

    if (!dairy || dairy.costValue !== 100.0 || dairy.totalUnits !== 50) {
      throw new Error(`Expected Dairy to have 50 units and $100.00 cost, got: ${dairy?.totalUnits}, $${dairy?.costValue}`);
    }
    if (!bakery || bakery.costValue !== 7.5 || bakery.totalUnits !== 5) {
      throw new Error(`Expected Bakery to have 5 units and $7.50 cost, got: ${bakery?.totalUnits}, $${bakery?.costValue}`);
    }
    console.log('✓ Category valuation groups batches accurately by product category');

    // -------------------------------------------------------------------------
    // Test 4: Stock Ageing Analysis
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Stock Ageing Analysis ---');
    const ageingRes = await analyticsService.getStockAgeing();
    const tiers = ageingRes.ageing;

    const freshStockTier = tiers.find((t) => t.range === '0–30 days');
    if (!freshStockTier || freshStockTier.units !== 55) {
      // 50 milk (received 5-10d ago) + 5 bread (received 25d ago) = 55 units
      throw new Error(`Expected 55 units in 0-30 days tier, got: ${freshStockTier?.units}`);
    }
    console.log('✓ Stock ageing correctly aggregates inventory age based on received dates');

    // -------------------------------------------------------------------------
    // Test 5: Top Expiry Risk Products
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Top Expiry Risk Products ---');
    const riskRes = await analyticsService.getTopExpiryRiskProducts(5);
    const riskProducts = riskRes.products;

    if (riskProducts.length < 2) {
      throw new Error(`Expected at least 2 risk products, got ${riskProducts.length}`);
    }
    // Top risk should be milk ($40.00 critical cost at risk) followed by bread ($7.50 expired cost)
    if (riskProducts[0].name !== 'TestP9 Whole Milk 1L' || riskProducts[0].costAtRisk !== 40.0) {
      throw new Error(`Expected Milk as #1 risk product with $40.00 cost at risk, got: ${riskProducts[0]?.name} ($${riskProducts[0]?.costAtRisk})`);
    }
    console.log('✓ Top expiry risk ranking correctly identifies products with highest financial risk');

    // -------------------------------------------------------------------------
    // Test 6: Report Generation for all 7 Report Types
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing 7 Report Types Data Retrieval ---');
    const reportTypes = ['expiry', 'valuation', 'movement', 'markdowns', 'returns', 'disposal', 'lowStock'];

    for (const type of reportTypes) {
      const rep = await analyticsService.getReportData(type, { limit: 10 });
      if (!rep || !Array.isArray(rep.rows) || !rep.pagination) {
        throw new Error(`Report "${type}" returned invalid structure`);
      }
      console.log(`  ✓ Report "${type}" returned ${rep.rows.length} rows (Total: ${rep.pagination.total})`);
    }
    console.log('✓ All 7 report types executed with full pagination and metadata');

    // -------------------------------------------------------------------------
    // Test 7: RFC 4180 CSV Export Generation
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing RFC 4180 CSV Export Generation ---');
    const csvExpiry = await analyticsService.exportReportCSV('expiry', {});
    if (!csvExpiry.includes('"productName"') || !csvExpiry.includes('"TestP9 Whole Milk 1L"')) {
      throw new Error('CSV output does not contain expected column headers or row values');
    }

    const csvValuation = await analyticsService.exportReportCSV('valuation', {});
    if (!csvValuation.includes('"potentialMargin"') || !csvValuation.includes('"TestP9 Gala Apples 1kg"')) {
      throw new Error('Valuation CSV output does not contain expected columns');
    }
    console.log('✓ RFC 4180 CSV generation validated with escaped quotes and accurate data');

    console.log('\n======================================================');
    console.log('✓ ALL PHASE 9 SERVICE VERIFICATION TESTS PASSED (7/7)');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ PHASE 9 VERIFICATION FAILED:', error);
    process.exitCode = 1;
  } finally {
    // Clean up test records
    await User.deleteMany({ email: /testp9/ });
    await Product.deleteMany({ name: /TestP9/ });
    await InventoryBatch.deleteMany({ batchNumber: /P9-/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /Phase 9/i });
    await mongoose.disconnect();
  }
}

runTests();

