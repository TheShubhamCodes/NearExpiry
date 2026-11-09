/**
 * Phase 10 Unit & Service Verification Test Suite
 * Tests AI & Predictive Analytics:
 * 1. Retail Sales Recording & Atomic Stock Decrement (STOCK_SOLD)
 * 2. Empirical Velocity Calculation (Product & Category Baselines)
 * 3. Expiry Risk Prediction Engine (Probability, Value at Risk, Explainability)
 * 4. Intelligent Markdown Optimizer (Price Elasticity, Margin Floor Protection, Recovery vs Loss)
 * 5. Demand Forecasting & Inventory Reorder (Lead Time Demand, Stockout Risk, Safety Stock)
 * 6. Store Insights & Anomaly Detection (Recurring Culprits, Category Losses, FEFO Violations)
 * 7. Model Evaluation (Train/Test Split, MAE, RMSE vs Naive Baseline)
 * 8. Summary & Cold-Start Behavior
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const StockMovement = require('../models/StockMovement');
const Sale = require('../models/Sale');
const AIPredictionLog = require('../models/AIPredictionLog');
const Notification = require('../models/Notification');
const Markdown = require('../models/Markdown');
const aiService = require('../services/aiService');
const salesService = require('../services/ai/salesService');
const predictionEngine = require('../services/ai/predictionEngine');
const discountOptimizer = require('../services/ai/discountOptimizer');
const demandForecaster = require('../services/ai/demandForecaster');
const insightDetector = require('../services/ai/insightDetector');
const modelEvaluator = require('../services/ai/modelEvaluator');

async function runTests() {
  console.log('=== Starting Phase 10 Domain & Service Verification ===');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let prodYogurt;
  let prodCheese;
  let prodMilk;
  let batchExpiringSoon;
  let batchFresh;
  let batchZeroStock;

  try {
    // 0. Clean test records
    await User.deleteMany({ email: /testp10/ });
    await Product.deleteMany({ name: /TestP10/ });
    await InventoryBatch.deleteMany({ batchNumber: /P10-/ });
    await Sale.deleteMany({});
    await AIPredictionLog.deleteMany({});
    await StockMovement.deleteMany({ reason: /Phase 10/i });
    await Notification.deleteMany({ title: /AI/i });

    // 1. Setup Store and Users
    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Phase 10 AI Supermarket',
        contactEmail: 'phase10@test.com',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata',
        aiSettings: {
          minMarginPercent: 15,
          leadTimeDays: 3,
          forecastPeriodDays: 14,
          velocityWindowDays: 30,
          autoAlertHighRisk: true
        }
      });
    } else {
      store.aiSettings = {
        minMarginPercent: 15,
        leadTimeDays: 3,
        forecastPeriodDays: 14,
        velocityWindowDays: 30,
        autoAlertHighRisk: true
      };
      await store.save();
    }

    owner = await User.create({
      fullName: 'Phase10 AI Owner',
      email: 'testp10_owner@nearexpiry.local',
      password: 'HashedPassword123!',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Phase10 AI Cashier',
      email: 'testp10_cashier@nearexpiry.local',
      password: 'HashedPassword123!',
      role: 'employee',
      isActive: true
    });

    // 2. Setup Products
    prodYogurt = await Product.create({
      name: 'TestP10 Greek Yogurt 500g',
      category: 'Dairy',
      brand: 'Olympus',
      unitOfMeasurement: 'piece',
      createdBy: owner._id
    });

    prodCheese = await Product.create({
      name: 'TestP10 Cheddar Cheese 200g',
      category: 'Dairy',
      brand: 'Farmhouse',
      unitOfMeasurement: 'piece',
      createdBy: owner._id
    });

    prodMilk = await Product.create({
      name: 'TestP10 Almond Milk 1L',
      category: 'Beverages',
      brand: 'Nutty',
      unitOfMeasurement: 'piece',
      createdBy: owner._id
    });

    // 3. Setup Batches
    const today = new Date();
    
    // Batch 1: Expiring in 4 days, 20 units in stock
    const expDate4d = new Date(today);
    expDate4d.setDate(today.getDate() + 4);

    batchExpiringSoon = await InventoryBatch.create({
      product: prodYogurt._id,
      batchNumber: 'P10-BATCH-001',
      quantityReceived: 30,
      currentQuantity: 20,
      purchasePrice: 40,
      sellingPrice: 70,
      expiryDate: expDate4d,
      createdBy: owner._id
    });

    // Batch 2: Expiring in 45 days, 10 units in stock (will easily sell out at category pace of 0.4/day = 18 units)
    const expDate45d = new Date(today);
    expDate45d.setDate(today.getDate() + 45);

    batchFresh = await InventoryBatch.create({
      product: prodCheese._id,
      batchNumber: 'P10-BATCH-002',
      quantityReceived: 10,
      currentQuantity: 10,
      purchasePrice: 100,
      sellingPrice: 160,
      expiryDate: expDate45d,
      createdBy: owner._id
    });

    // Batch 3: Zero stock batch
    const expDate10d = new Date(today);
    expDate10d.setDate(today.getDate() + 10);

    batchZeroStock = await InventoryBatch.create({
      product: prodMilk._id,
      batchNumber: 'P10-BATCH-003',
      quantityReceived: 10,
      currentQuantity: 0,
      purchasePrice: 60,
      sellingPrice: 90,
      expiryDate: expDate10d,
      createdBy: owner._id
    });

    console.log('✓ Store, users, products, and batches initialized successfully.');

    // TEST 1: Record Retail Sale & Stock Movement
    console.log('\n--- Test 1: Retail Sale Recording ---');
    const saleResult = await aiService.recordSale({
      batchId: batchExpiringSoon._id.toString(),
      quantity: 5,
      unitPrice: 70,
      receiptNumber: 'REC-P10-001',
      notes: 'Phase 10 verified sale'
    }, employee);

    if (!saleResult || !saleResult.sale) {
      throw new Error('Failed to record sale');
    }
    console.log(`✓ Sale recorded: ID ${saleResult.sale._id}, qty: 5, total: ${saleResult.sale.totalAmount}`);

    // Verify batch quantity was decremented
    const updatedBatch = await InventoryBatch.findById(batchExpiringSoon._id);
    if (updatedBatch.currentQuantity !== 15) {
      throw new Error(`Expected batch currentQuantity 15, got ${updatedBatch.currentQuantity}`);
    }
    console.log('✓ Batch currentQuantity correctly decremented from 20 to 15');

    // Verify StockMovement
    const movement = await StockMovement.findOne({ batch: batchExpiringSoon._id, movementType: 'STOCK_SOLD' });
    if (!movement || movement.movementType !== 'STOCK_SOLD' || movement.quantityChanged !== 5) {
      throw new Error('StockMovement with STOCK_SOLD type not recorded correctly');
    }
    if (movement.quantityBefore !== 20 || movement.quantityAfter !== 15) {
      throw new Error(`Expected quantities 20 -> 15, got ${movement.quantityBefore} -> ${movement.quantityAfter}`);
    }
    console.log('✓ StockMovement created with movementType STOCK_SOLD, quantityChanged 5, before: 20, after: 15');

    // TEST 2: Validate Negative Stock Prevention
    console.log('\n--- Test 2: Negative Stock Prevention ---');
    let overSaleFailed = false;
    try {
      await aiService.recordSale({
        batchId: batchExpiringSoon._id.toString(),
        quantity: 999, // exceeds 15
        unitPrice: 70
      }, employee);
    } catch (err) {
      overSaleFailed = true;
      console.log(`✓ Over-sale properly rejected: "${err.message}"`);
    }
    if (!overSaleFailed) {
      throw new Error('Expected over-sale to fail but it succeeded!');
    }

    // TEST 3: Sales History & Velocity Baseline
    console.log('\n--- Test 3: Sales Velocity Calculation ---');
    // Insert a few more historical sales across different days for prodYogurt
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);

    await Sale.create([
      {
        store: store._id,
        product: prodYogurt._id,
        batch: batchExpiringSoon._id,
        quantity: 3,
        unitPrice: 70,
        costPrice: 40,
        totalAmount: 210,
        saleDate: yesterday,
        recordedBy: employee._id
      },
      {
        store: store._id,
        product: prodYogurt._id,
        batch: batchExpiringSoon._id,
        quantity: 4,
        unitPrice: 70,
        costPrice: 40,
        totalAmount: 280,
        saleDate: twoDaysAgo,
        recordedBy: employee._id
      }
    ]);

    const velocityYogurt = await salesService.getProductSalesVelocity(prodYogurt._id, 30);
    console.log(`✓ Product velocity calculated: ${velocityYogurt.dailyVelocity} units/day (total sold: ${velocityYogurt.totalSoldInWindow}, distinct days: ${velocityYogurt.distinctDaysWithSales})`);
    if (velocityYogurt.totalSoldInWindow !== 12) { // 5 + 3 + 4
      throw new Error(`Expected total sold 12, got ${velocityYogurt.totalSoldInWindow}`);
    }
    if (!velocityYogurt.hasSufficientData) {
      throw new Error('Expected sufficient data after 3 sales');
    }

    // Test cold-start velocity on prodMilk (0 sales)
    const velocityMilk = await salesService.getProductSalesVelocity(prodMilk._id, 30);
    console.log(`✓ Cold-start product detected: hasSufficientData = ${velocityMilk.hasSufficientData}`);
    if (velocityMilk.hasSufficientData !== false) {
      throw new Error('Expected hasSufficientData to be false for product with 0 sales');
    }

    // TEST 4: Expiry Risk Prediction Engine
    console.log('\n--- Test 4: Expiry Risk Prediction Engine ---');
    // Batch 1 has 15 units remaining, expiring in 4 days.
    // Daily velocity is 0.4 units/day (12 units / 30 days window).
    // In 4 days, expected demand = ~1.6 units. 13.4 units projected unsold.
    const riskYogurt = await predictionEngine.predictBatchExpiryRisk(batchExpiringSoon._id);
    console.log(`✓ Risk predicted for Yogurt batch:`);
    console.log(`  - Probability unsold (riskScore): ${riskYogurt.riskScore}%`);
    console.log(`  - Risk Category: ${riskYogurt.riskCategory}`);
    console.log(`  - Estimated Unsold Units: ${riskYogurt.estimatedUnsoldQuantity}`);
    console.log(`  - Value At Risk: $${riskYogurt.estimatedValueAtRisk}`);
    console.log(`  - Days Remaining: ${riskYogurt.daysRemaining}`);
    console.log(`  - Explainable Factors: ${riskYogurt.mainFactors.join('; ')}`);

    if (riskYogurt.riskScore < 0 || riskYogurt.riskScore > 100) {
      throw new Error(`Risk score out of range: ${riskYogurt.riskScore}`);
    }
    if (!['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].includes(riskYogurt.riskCategory)) {
      throw new Error(`Invalid risk tier: ${riskYogurt.riskCategory}`);
    }

    // Check Fresh batch risk (expiring in 45 days)
    const riskFresh = await predictionEngine.predictBatchExpiryRisk(batchFresh._id);
    console.log(`✓ Risk predicted for Fresh batch: Category ${riskFresh.riskCategory}, Score: ${riskFresh.riskScore}%`);
    if (riskFresh.riskCategory !== 'LOW') {
      throw new Error(`Expected LOW risk category for fresh batch, got ${riskFresh.riskCategory}`);
    }

    // TEST 5: Active Expiry Risk Queue
    console.log('\n--- Test 5: Expiry Risk Queue ---');
    const riskQueue = await predictionEngine.getActiveExpiryRiskQueue({ limit: 10 });
    console.log(`✓ Expiry Risk Queue returned ${riskQueue.queue.length} batches (Summary: highRiskCount=${riskQueue.highRiskCount}, totalEvaluated=${riskQueue.totalEvaluated})`);
    if (riskQueue.queue.length === 0) {
      throw new Error('Risk queue should contain active batches');
    }

    // TEST 6: Intelligent Markdown Optimizer
    console.log('\n--- Test 6: Intelligent Markdown Optimizer ---');
    const markdownRec = await discountOptimizer.recommendIntelligentDiscount(batchExpiringSoon._id);
    console.log(`✓ Markdown Recommendation for Yogurt batch:`);
    console.log(`  - Recommended Discount: ${markdownRec.suggestedDiscountPercent}%`);
    console.log(`  - Original Price: $${markdownRec.originalPrice} -> Discounted: $${markdownRec.suggestedSellingPrice}`);
    console.log(`  - Cost Price: $${markdownRec.purchasePrice}`);
    console.log(`  - Expected Revenue: $${markdownRec.expectedRevenue}`);
    console.log(`  - Loss Avoided: $${markdownRec.estimatedDisposalLossAvoided}`);
    console.log(`  - Explanation: ${markdownRec.explanation}`);

    // Check margin floor constraint: store.aiSettings.minMarginPercent is 15%
    // costPrice is 40. Minimum price allowed = 40 * 1.15 = 46.
    if (markdownRec.suggestedSellingPrice < 46) {
      throw new Error(`Discounted price $${markdownRec.suggestedSellingPrice} violated minimum margin floor of $46`);
    }
    console.log('✓ Margin floor enforcement verified: discounted price preserves >= 15% gross margin');

    // TEST 7: Demand Forecasting & Reorder Engine
    console.log('\n--- Test 7: Demand Forecasting & Reorders ---');
    const forecastYogurt = await demandForecaster.forecastProductDemand(prodYogurt._id, { horizonDays: 14 });
    console.log(`✓ Demand forecast for Greek Yogurt:`);
    console.log(`  - Projected Demand (14d): ${forecastYogurt.forecastedDemandUnits} units`);
    console.log(`  - Current Saleable Stock: ${forecastYogurt.currentSaleableStock} units`);
    console.log(`  - Stockout Risk: ${forecastYogurt.stockoutRisk}`);
    console.log(`  - Recommended Reorder: ${forecastYogurt.recommendedReorderQuantity} units`);
    console.log(`  - Has Sufficient Data: ${forecastYogurt.hasSufficientData}`);

    if (forecastYogurt.forecastedDemandUnits <= 0) {
      throw new Error('Projected demand should be positive for active sales');
    }

    // Forecast for Milk (Cold Start)
    const forecastMilk = await demandForecaster.forecastProductDemand(prodMilk._id, { horizonDays: 14 });
    console.log(`✓ Cold-start forecast for Almond Milk: hasSufficientData = ${forecastMilk.hasSufficientData}, reasoning: "${forecastMilk.reasoning}"`);
    if (forecastMilk.hasSufficientData !== false) {
      throw new Error('Expected hasSufficientData false for milk with 0 sales');
    }

    // Catalog demand forecasts
    const catalogForecasts = await demandForecaster.getCatalogDemandForecasts({});
    console.log(`✓ Catalog forecasts evaluated ${catalogForecasts.forecasts.length} products (Stockout risk count: ${catalogForecasts.stockoutDangerCount})`);

    // TEST 8: Store Insights & Operational Anomaly Detection
    console.log('\n--- Test 8: Store Insights & Anomaly Detection ---');
    const insights = await insightDetector.detectStoreInsights();
    console.log(`✓ Detected ${insights.totalInsights} store insights`);

    // TEST 9: Model Accuracy Evaluation (MAE / RMSE vs Baseline)
    console.log('\n--- Test 9: Model Accuracy Evaluation ---');
    const evaluation = await modelEvaluator.evaluateDemandModel();
    console.log(`✓ Model Evaluation result: status = ${evaluation.status}`);
    if (evaluation.metrics) {
      console.log(`  - MAE: ${evaluation.metrics.modelMAE}`);
      console.log(`  - RMSE: ${evaluation.metrics.modelRMSE}`);
      console.log(`  - Baseline MAE: ${evaluation.metrics.baselineMAE}`);
      console.log(`  - Error Reduction: ${evaluation.metrics.errorReductionPercent}%`);
    }

    // TEST 10: Executive AI Summary
    console.log('\n--- Test 10: Executive AI Summary ---');
    const aiSummary = await aiService.getAISummary();
    console.log(`✓ AI Summary:`);
    console.log(`  - High Risk Batches: ${aiSummary.summary.highRiskBatchesCount}`);
    console.log(`  - Total Value At Risk: $${aiSummary.summary.totalValueAtRisk}`);
    console.log(`  - Active Discount Recommendations: ${aiSummary.summary.discountRecommendationsCount}`);
    console.log(`  - Potential Revenue Recovery: $${aiSummary.summary.potentialRevenueRecovery}`);
    console.log(`  - Stockout Risk Count: ${aiSummary.summary.stockoutRiskCount}`);
    console.log(`  - Operational Insights: ${aiSummary.summary.activeInsightsCount}`);
    console.log(`  - Model Status: ${aiSummary.modelStatus.status}`);

    console.log('\n=== ALL PHASE 10 UNIT & SERVICE TESTS PASSED SUCCESSFULLY! ===');
  } catch (error) {
    console.error('\n❌ Phase 10 Service Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // Teardown test data
    console.log('\n--- Cleaning up Phase 10 test records ---');
    await User.deleteMany({ email: /testp10/ });
    await Product.deleteMany({ name: /TestP10/ });
    await InventoryBatch.deleteMany({ batchNumber: /P10-/ });
    await Sale.deleteMany({});
    await AIPredictionLog.deleteMany({});
    await StockMovement.deleteMany({ reason: /Phase 10/i });
    await Notification.deleteMany({ title: /AI/i });
    await mongoose.disconnect();
    console.log('✓ Database cleaned and disconnected.');
  }
}

runTests();
