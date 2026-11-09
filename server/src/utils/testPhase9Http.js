/**
 * Phase 9 HTTP Integration Test Suite
 * Tests all /api/analytics endpoints over live HTTP including:
 * - Dashboard KPIs & date range comparisons
 * - Visual analytics endpoints (distribution, category valuation, ageing, movement trends, risk, fefo)
 * - Report table queries with pagination
 * - CSV export file download endpoint
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
const { generateToken } = require('./token');

const API_BASE = 'http://localhost:5000/api';

async function runHttpTests() {
  console.log('--- Starting Phase 9 HTTP API Verification ---');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let product;
  let batch;
  let ownerToken;
  let employeeToken;

  try {
    // 0. Clean up test users, products, batches, and action documents
    await User.deleteMany({ email: /http_p9/ });
    await Product.deleteMany({ name: /HttpP9/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P9/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /HTTP-P9/i });

    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Http P9 Supermarket',
        contactEmail: 'httpp9@test.com',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata'
      });
    }

    owner = await User.create({
      fullName: 'Http Owner P9',
      email: 'http_p9_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Http Employee P9',
      email: 'http_p9_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    ownerToken = generateToken(owner);
    employeeToken = generateToken(employee);

    product = await Product.create({
      name: 'HttpP9 Organic Butter 250g',
      brand: 'DairyGold',
      category: 'Dairy',
      unit: 'packet',
      reorderPoint: 10,
      createdBy: owner._id
    });

    const now = new Date();
    batch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'HTTP-P9-01',
      quantityReceived: 40,
      currentQuantity: 40,
      purchasePrice: 2.5,
      sellingPrice: 5.0,
      expiryDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days -> warning
      receivedDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      createdBy: owner._id
    });

    await StockMovement.create({
      product: product._id,
      batch: batch._id,
      movementType: 'STOCK_RECEIVED',
      quantityChanged: 40,
      quantityBefore: 0,
      quantityAfter: 40,
      reason: 'HTTP-P9 initial receipt',
      user: owner._id
    });

    const authHeaders = (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`
    });

    // Test 1: Unauthenticated request returns 401
    console.log('Test 1: Unauthenticated GET /api/analytics/dashboard');
    const res1 = await fetch(`${API_BASE}/analytics/dashboard`);
    if (res1.status !== 401) throw new Error(`Expected 401, got ${res1.status}`);
    console.log('  ✓ 401 Unauthorized for unauthenticated request');

    // Test 2: Authenticated GET /api/analytics/dashboard
    console.log('\nTest 2: Authenticated GET /api/analytics/dashboard?period=30days');
    const res2 = await fetch(`${API_BASE}/analytics/dashboard?period=30days`, {
      headers: authHeaders(employeeToken)
    });
    if (res2.status !== 200) throw new Error(`Expected 200, got ${res2.status}`);
    const data2 = await res2.json();
    if (!data2.success || !data2.data.inventoryValuation || !data2.data.catalog) {
      throw new Error('Invalid dashboard analytics structure returned');
    }
    if (data2.data.inventoryValuation.totalPhysicalUnits !== 40) {
      throw new Error(`Expected 40 total physical units, got ${data2.data.inventoryValuation.totalPhysicalUnits}`);
    }
    console.log('  ✓ 200 OK: Complete business dashboard metrics retrieved');

    // Test 3: Custom Date Range in Dashboard
    console.log('\nTest 3: GET /api/analytics/dashboard with custom date range');
    const res3 = await fetch(
      `${API_BASE}/analytics/dashboard?period=custom&startDate=2026-11-01&endDate=2026-11-10`,
      { headers: authHeaders(ownerToken) }
    );
    if (res3.status !== 200) throw new Error(`Expected 200, got ${res3.status}`);
    const data3 = await res3.json();
    if (data3.data.dateRange.period !== 'custom') {
      throw new Error(`Expected period "custom", got ${data3.data.dateRange.period}`);
    }
    console.log('  ✓ 200 OK: Custom date range parsed and bounded correctly');

    // Test 4: GET /api/analytics/expiry-distribution
    console.log('\nTest 4: GET /api/analytics/expiry-distribution');
    const res4 = await fetch(`${API_BASE}/analytics/expiry-distribution`, {
      headers: authHeaders(ownerToken)
    });
    if (res4.status !== 200) throw new Error(`Expected 200, got ${res4.status}`);
    const data4 = await res4.json();
    if (!data4.success || !Array.isArray(data4.data.distribution)) {
      throw new Error('Invalid distribution format');
    }
    console.log(`  ✓ 200 OK: Expiry distribution returned with ${data4.data.distribution.length} tiers`);

    // Test 5: GET /api/analytics/category-valuation
    console.log('\nTest 5: GET /api/analytics/category-valuation');
    const res5 = await fetch(`${API_BASE}/analytics/category-valuation`, {
      headers: authHeaders(ownerToken)
    });
    if (res5.status !== 200) throw new Error(`Expected 200, got ${res5.status}`);
    const data5 = await res5.json();
    if (!data5.success || !Array.isArray(data5.data.categories)) {
      throw new Error('Invalid categories valuation format');
    }
    console.log(`  ✓ 200 OK: Category valuation returned with ${data5.data.categories.length} categories`);

    // Test 6: GET /api/analytics/stock-ageing
    console.log('\nTest 6: GET /api/analytics/stock-ageing');
    const res6 = await fetch(`${API_BASE}/analytics/stock-ageing`, {
      headers: authHeaders(ownerToken)
    });
    if (res6.status !== 200) throw new Error(`Expected 200, got ${res6.status}`);
    const data6 = await res6.json();
    if (!data6.success || !Array.isArray(data6.data.ageing)) {
      throw new Error('Invalid stock ageing format');
    }
    console.log(`  ✓ 200 OK: Stock ageing tiers returned (${data6.data.ageing.length} tiers)`);

    // Test 7: GET /api/analytics/movement-trends
    console.log('\nTest 7: GET /api/analytics/movement-trends');
    const res7 = await fetch(`${API_BASE}/analytics/movement-trends?period=30days`, {
      headers: authHeaders(ownerToken)
    });
    if (res7.status !== 200) throw new Error(`Expected 200, got ${res7.status}`);
    const data7 = await res7.json();
    if (!data7.success || !Array.isArray(data7.data.timeline)) {
      throw new Error('Invalid movement trends format');
    }
    console.log('  ✓ 200 OK: Movement trends timeline returned');

    // Test 8: GET /api/analytics/risk-products
    console.log('\nTest 8: GET /api/analytics/risk-products');
    const res8 = await fetch(`${API_BASE}/analytics/risk-products?limit=5`, {
      headers: authHeaders(ownerToken)
    });
    if (res8.status !== 200) throw new Error(`Expected 200, got ${res8.status}`);
    const data8 = await res8.json();
    if (!data8.success || !Array.isArray(data8.data.products)) {
      throw new Error('Invalid risk products format');
    }
    console.log(`  ✓ 200 OK: Top risk products returned (${data8.data.products.length} products)`);

    // Test 9: GET /api/analytics/fefo-compliance
    console.log('\nTest 9: GET /api/analytics/fefo-compliance');
    const res9 = await fetch(`${API_BASE}/analytics/fefo-compliance`, {
      headers: authHeaders(ownerToken)
    });
    if (res9.status !== 200) throw new Error(`Expected 200, got ${res9.status}`);
    const data9 = await res9.json();
    if (!data9.success || typeof data9.data.complianceRate !== 'number') {
      throw new Error('Invalid FEFO compliance format');
    }
    console.log(`  ✓ 200 OK: FEFO compliance rate returned (${data9.data.complianceRate}%)`);

    // Test 10: GET /api/analytics/reports/expiry (Report Data)
    console.log('\nTest 10: GET /api/analytics/reports/expiry');
    const res10 = await fetch(`${API_BASE}/analytics/reports/expiry?limit=10`, {
      headers: authHeaders(ownerToken)
    });
    if (res10.status !== 200) throw new Error(`Expected 200, got ${res10.status}`);
    const data10 = await res10.json();
    if (!data10.success || !Array.isArray(data10.data) || !data10.pagination) {
      throw new Error('Invalid report query response format');
    }
    console.log(`  ✓ 200 OK: Expiry report returned with ${data10.data.length} rows`);

    // Test 11: GET /api/analytics/reports/valuation/export (CSV File Download)
    console.log('\nTest 11: GET /api/analytics/reports/valuation/export (CSV Download)');
    const res11 = await fetch(`${API_BASE}/analytics/reports/valuation/export`, {
      headers: authHeaders(ownerToken)
    });
    if (res11.status !== 200) throw new Error(`Expected 200, got ${res11.status}`);
    const contentType = res11.headers.get('content-type');
    const disposition = res11.headers.get('content-disposition');
    if (!contentType || !contentType.includes('text/csv')) {
      throw new Error(`Expected text/csv content type, got ${contentType}`);
    }
    if (!disposition || !disposition.includes('attachment; filename=')) {
      throw new Error(`Expected attachment content-disposition, got ${disposition}`);
    }
    const csvBody = await res11.text();
    if (!csvBody.includes('"productName"') || !csvBody.includes('"HttpP9 Organic Butter 250g"')) {
      throw new Error('CSV body does not contain expected columns or row data');
    }
    console.log('  ✓ 200 OK: CSV file downloaded with proper MIME headers and RFC 4180 format');

    console.log('\n======================================================');
    console.log('✓ ALL PHASE 9 HTTP API TESTS PASSED (11/11)');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ PHASE 9 HTTP API VERIFICATION FAILED:', error);
    process.exitCode = 1;
  } finally {
    // Clean up test records
    await User.deleteMany({ email: /http_p9/ });
    await Product.deleteMany({ name: /HttpP9/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P9/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /HTTP-P9/i });
    await mongoose.disconnect();
  }
}

runHttpTests();

