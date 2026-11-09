/**
 * Phase 10 HTTP Integration Test Suite
 * Tests all /api/ai endpoints over live HTTP including:
 * - Unauthenticated 401 handling
 * - Retail Sales Recording (POST /api/ai/sales)
 * - Sales History (GET /api/ai/sales)
 * - AI Executive Summary (GET /api/ai/summary)
 * - Expiry Risk Queue (GET /api/ai/risk-queue and /:batchId)
 * - Intelligent Markdown Optimizer (GET /api/ai/discounts and /:batchId)
 * - Demand Forecasting (GET /api/ai/demand and /:productId)
 * - Store Insights (GET /api/ai/insights)
 * - Model Evaluation (GET /api/ai/evaluation)
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
const { generateToken } = require('./token');

const API_BASE = 'http://localhost:5000/api';

async function runHttpTests() {
  console.log('=== Starting Phase 10 HTTP API Verification ===');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let product;
  let batch;
  let ownerToken;
  let employeeToken;

  try {
    // 0. Clean previous HTTP test artifacts
    await User.deleteMany({ email: /http_p10/ });
    await Product.deleteMany({ name: /HttpP10/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P10/ });
    await Sale.deleteMany({});
    await AIPredictionLog.deleteMany({});
    await StockMovement.deleteMany({ reason: /HTTP-P10/i });

    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Http P10 AI Supermarket',
        contactEmail: 'httpp10@test.com',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata',
        aiSettings: {
          minMarginPercent: 12,
          leadTimeDays: 3,
          forecastPeriodDays: 14,
          velocityWindowDays: 30,
          autoAlertHighRisk: true
        }
      });
    }

    owner = await User.create({
      fullName: 'Http Owner P10',
      email: 'http_p10_owner@nearexpiry.local',
      password: 'HashedPassword123!',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Http Cashier P10',
      email: 'http_p10_cashier@nearexpiry.local',
      password: 'HashedPassword123!',
      role: 'employee',
      isActive: true
    });

    ownerToken = generateToken(owner);
    employeeToken = generateToken(employee);

    product = await Product.create({
      name: 'HttpP10 Organic Butter 250g',
      category: 'Dairy',
      brand: 'Golden Meadow',
      unitOfMeasurement: 'piece',
      createdBy: owner._id
    });

    const expiryIn5Days = new Date();
    expiryIn5Days.setDate(expiryIn5Days.getDate() + 5);

    batch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'HTTP-P10-BATCH-01',
      quantityReceived: 25,
      currentQuantity: 20,
      purchasePrice: 50,
      sellingPrice: 85,
      expiryDate: expiryIn5Days,
      createdBy: owner._id
    });

    console.log('✓ Store, users, product, and batch created for HTTP tests.');

    // 1. Unauthenticated Request -> 401
    console.log('\n--- Test 1: Unauthenticated 401 Check ---');
    const unauthRes = await fetch(`${API_BASE}/ai/summary`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }
    console.log(`✓ Unauthenticated request properly rejected with 401 Unauthorized`);

    // 2. Record Sale (POST /api/ai/sales)
    console.log('\n--- Test 2: POST /api/ai/sales ---');
    const salePayload = {
      batchId: batch._id.toString(),
      quantity: 4,
      unitPrice: 85,
      receiptNumber: 'REC-HTTP-001',
      notes: 'HTTP-P10 verified sale'
    };

    const saleRes = await fetch(`${API_BASE}/ai/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`
      },
      body: JSON.stringify(salePayload)
    });

    if (saleRes.status !== 201) {
      const errBody = await saleRes.text();
      throw new Error(`POST /api/ai/sales failed with ${saleRes.status}: ${errBody}`);
    }

    const saleJson = await saleRes.json();
    if (!saleJson.success || !saleJson.data || saleJson.data.quantity !== 4) {
      throw new Error('Invalid response structure from POST /api/ai/sales');
    }
    console.log(`✓ Sale recorded successfully: totalAmount = $${saleJson.data.totalAmount}`);

    // Verify batch quantity in DB
    const refreshedBatch = await InventoryBatch.findById(batch._id);
    if (refreshedBatch.currentQuantity !== 16) {
      throw new Error(`Expected batch quantity 16, found ${refreshedBatch.currentQuantity}`);
    }
    console.log(`✓ Batch currentQuantity decremented from 20 to 16`);

    // 3. Sales History (GET /api/ai/sales)
    console.log('\n--- Test 3: GET /api/ai/sales ---');
    const historyRes = await fetch(`${API_BASE}/ai/sales?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    if (historyRes.status !== 200) {
      throw new Error(`GET /api/ai/sales failed with ${historyRes.status}`);
    }
    const historyJson = await historyRes.json();
    if (!historyJson.success || !Array.isArray(historyJson.data) || historyJson.data.length === 0) {
      throw new Error('Expected non-empty array of sales in history');
    }
    console.log(`✓ Sales history retrieved: ${historyJson.data.length} transactions, total count: ${historyJson.pagination.total}`);

    // 4. Executive AI Summary (GET /api/ai/summary)
    console.log('\n--- Test 4: GET /api/ai/summary ---');
    const summaryRes = await fetch(`${API_BASE}/ai/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (summaryRes.status !== 200) {
      throw new Error(`GET /api/ai/summary failed with ${summaryRes.status}`);
    }
    const summaryJson = await summaryRes.json();
    if (!summaryJson.success || !summaryJson.data || !summaryJson.data.summary) {
      throw new Error('Invalid structure from GET /api/ai/summary');
    }
    console.log(`✓ AI Summary received: highRiskBatches=${summaryJson.data.summary.highRiskBatchesCount}, valueAtRisk=$${summaryJson.data.summary.totalValueAtRisk}`);

    // 5. Expiry Risk Queue (GET /api/ai/risk-queue and /:batchId)
    console.log('\n--- Test 5: GET /api/ai/risk-queue ---');
    const queueRes = await fetch(`${API_BASE}/ai/risk-queue?limit=10`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (queueRes.status !== 200) {
      throw new Error(`GET /api/ai/risk-queue failed with ${queueRes.status}`);
    }
    const queueJson = await queueRes.json();
    if (!queueJson.success || !Array.isArray(queueJson.data.queue)) {
      throw new Error('Expected queue array in GET /api/ai/risk-queue');
    }
    console.log(`✓ Risk queue returned ${queueJson.data.queue.length} items (highRiskCount: ${queueJson.data.highRiskCount})`);

    // Single batch risk prediction
    const singleRiskRes = await fetch(`${API_BASE}/ai/risk-queue/${batch._id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (singleRiskRes.status !== 200) {
      throw new Error(`GET /api/ai/risk-queue/${batch._id} failed with ${singleRiskRes.status}`);
    }
    const singleRiskJson = await singleRiskRes.json();
    console.log(`✓ Batch risk prediction: score=${singleRiskJson.data.riskScore}%, tier=${singleRiskJson.data.riskCategory}`);

    // 6. Intelligent Markdown Optimizer (GET /api/ai/discounts and /:batchId)
    console.log('\n--- Test 6: GET /api/ai/discounts ---');
    const discountsRes = await fetch(`${API_BASE}/ai/discounts?limit=10`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (discountsRes.status !== 200) {
      throw new Error(`GET /api/ai/discounts failed with ${discountsRes.status}`);
    }
    const discountsJson = await discountsRes.json();
    console.log(`✓ Discount recommendations returned: ${discountsJson.data.recommendations.length} recommendations`);

    const singleDiscountRes = await fetch(`${API_BASE}/ai/discounts/${batch._id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (singleDiscountRes.status !== 200) {
      throw new Error(`GET /api/ai/discounts/${batch._id} failed with ${singleDiscountRes.status}`);
    }
    const singleDiscountJson = await singleDiscountRes.json();
    console.log(`✓ Batch discount recommendation: ${singleDiscountJson.data.suggestedDiscountPercent}% off ($${singleDiscountJson.data.originalPrice} -> $${singleDiscountJson.data.suggestedSellingPrice})`);

    // 7. Demand Forecasting (GET /api/ai/demand and /:productId)
    console.log('\n--- Test 7: GET /api/ai/demand ---');
    const demandRes = await fetch(`${API_BASE}/ai/demand`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (demandRes.status !== 200) {
      throw new Error(`GET /api/ai/demand failed with ${demandRes.status}`);
    }
    const demandJson = await demandRes.json();
    console.log(`✓ Demand forecasts returned for ${demandJson.data.forecasts.length} catalog products`);

    const singleDemandRes = await fetch(`${API_BASE}/ai/demand/${product._id}?horizonDays=14`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (singleDemandRes.status !== 200) {
      throw new Error(`GET /api/ai/demand/${product._id} failed with ${singleDemandRes.status}`);
    }
    const singleDemandJson = await singleDemandRes.json();
    console.log(`✓ Product demand forecast: ${singleDemandJson.data.forecastedDemandUnits} units, stockoutRisk: ${singleDemandJson.data.stockoutRisk}`);

    // 8. Store Insights (GET /api/ai/insights)
    console.log('\n--- Test 8: GET /api/ai/insights ---');
    const insightsRes = await fetch(`${API_BASE}/ai/insights`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (insightsRes.status !== 200) {
      throw new Error(`GET /api/ai/insights failed with ${insightsRes.status}`);
    }
    const insightsJson = await insightsRes.json();
    console.log(`✓ Store insights returned: ${insightsJson.data.totalInsights} insights`);

    // 9. Model Evaluation (GET /api/ai/evaluation)
    console.log('\n--- Test 9: GET /api/ai/evaluation ---');
    const evalRes = await fetch(`${API_BASE}/ai/evaluation`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    if (evalRes.status !== 200) {
      throw new Error(`GET /api/ai/evaluation failed with ${evalRes.status}`);
    }
    const evalJson = await evalRes.json();
    console.log(`✓ Model evaluation endpoint: status = ${evalJson.data.status}`);

    console.log('\n=== ALL PHASE 10 HTTP INTEGRATION TESTS PASSED SUCCESSFULLY! ===');
  } catch (error) {
    console.error('\n❌ Phase 10 HTTP Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // Teardown
    console.log('\n--- Cleaning up Phase 10 HTTP test records ---');
    await User.deleteMany({ email: /http_p10/ });
    await Product.deleteMany({ name: /HttpP10/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P10/ });
    await Sale.deleteMany({});
    await AIPredictionLog.deleteMany({});
    await StockMovement.deleteMany({ reason: /HTTP-P10/i });
    await mongoose.disconnect();
    console.log('✓ Database cleaned and disconnected.');
  }
}

runHttpTests();

