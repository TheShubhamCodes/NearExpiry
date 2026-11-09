/**
 * Phase 6 HTTP Integration Test Suite
 * Tests all /api/expiry endpoints and /api/store settings updates over live HTTP.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const { generateToken } = require('./token');

const API_BASE = 'http://localhost:5000/api';

async function runHttpTests() {
  console.log('--- Starting Phase 6 HTTP API Verification ---');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let ownerToken;
  let employeeToken;
  let testProduct;
  let batchCrit;
  let batchFresh;
  let batchExp;

  try {
    // 0. Clean up previous test runs
    await User.deleteMany({ email: /http_p6/ });
    await Product.deleteMany({ name: /HttpP6/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P6/ });

    let store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Phase 6 Test Mart',
        contactEmail: 'phase6@test.com'
      });
    }

    // Create owner & employee
    owner = await User.create({
      fullName: 'Http Owner',
      email: 'http_p6_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Http Employee',
      email: 'http_p6_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    ownerToken = generateToken(owner);
    employeeToken = generateToken(employee);

    // Create test product and batches
    testProduct = await Product.create({
      name: 'HttpP6 Organic Yogurt',
      brand: 'NatureFresh',
      category: 'Dairy & Eggs',
      unit: 'packet',
      reorderPoint: 10,
      createdBy: owner._id
    });

    const now = new Date();
    batchCrit = await InventoryBatch.create({
      product: testProduct._id,
      batchNumber: 'HTTP-P6-CRIT',
      quantityReceived: 20,
      currentQuantity: 20,
      purchasePrice: 1.2,
      sellingPrice: 2.0,
      expiryDate: new Date(Date.now() + 2 * 86400000), // in 2 days
      createdBy: owner._id
    });

    batchFresh = await InventoryBatch.create({
      product: testProduct._id,
      batchNumber: 'HTTP-P6-FRESH',
      quantityReceived: 30,
      currentQuantity: 30,
      purchasePrice: 1.2,
      sellingPrice: 2.0,
      expiryDate: new Date(Date.now() + 15 * 86400000), // in 15 days
      createdBy: owner._id
    });

    batchExp = await InventoryBatch.create({
      product: testProduct._id,
      batchNumber: 'HTTP-P6-EXP',
      quantityReceived: 5,
      currentQuantity: 5,
      purchasePrice: 1.2,
      sellingPrice: 2.0,
      expiryDate: new Date(Date.now() - 2 * 86400000), // 2 days ago
      createdBy: owner._id
    });

    // Helper for fetch
    const authHeaders = (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`
    });

    // Test 1: Unauthenticated request to /api/expiry/summary returns 401
    console.log('Test 1: Unauthenticated /api/expiry/summary');
    const res1 = await fetch(`${API_BASE}/expiry/summary`);
    if (res1.status !== 401) throw new Error(`Expected 401 for unauthenticated request, got ${res1.status}`);
    console.log('  ✓ 401 Unauthorized for unauthenticated request');

    // Test 2: Authenticated /api/expiry/summary works for both owner and employee
    console.log('\nTest 2: GET /api/expiry/summary');
    const res2 = await fetch(`${API_BASE}/expiry/summary`, { headers: authHeaders(employeeToken) });
    if (res2.status !== 200) throw new Error(`Expected 200, got ${res2.status}`);
    const data2 = await res2.json();
    if (!data2.success) throw new Error('Response success was false');
    if (data2.data.criticalBatches < 1) throw new Error('Expected at least 1 critical batch');
    if (data2.data.expiredBatches < 1) throw new Error('Expected at least 1 expired batch');
    console.log('  ✓ 200 OK for employee: Summary returned critical, expired, and fresh metrics');

    // Test 3: GET /api/expiry/batches with filters and status
    console.log('\nTest 3: GET /api/expiry/batches?status=CRITICAL');
    const res3 = await fetch(`${API_BASE}/expiry/batches?status=CRITICAL`, { headers: authHeaders(ownerToken) });
    if (res3.status !== 200) throw new Error(`Expected 200, got ${res3.status}`);
    const data3 = await res3.json();
    if (!data3.data.some((b) => b.batchNumber === 'HTTP-P6-CRIT')) {
      throw new Error('Expected HTTP-P6-CRIT in critical batches');
    }
    if (data3.data.some((b) => b.batchNumber === 'HTTP-P6-EXP')) {
      throw new Error('Expired batch should not appear in status=CRITICAL');
    }
    console.log('  ✓ 200 OK: Batches filtered correctly by status=CRITICAL');

    // Test 4: GET /api/expiry/fefo
    console.log('\nTest 4: GET /api/expiry/fefo');
    const res4 = await fetch(`${API_BASE}/expiry/fefo`, { headers: authHeaders(employeeToken) });
    if (res4.status !== 200) throw new Error(`Expected 200, got ${res4.status}`);
    const data4 = await res4.json();
    const productRec = data4.data.find((r) => r.product._id === testProduct._id.toString());
    if (!productRec) throw new Error('Product not found in FEFO recommendations');
    if (productRec.fefoPickBatch.batchNumber !== 'HTTP-P6-CRIT') {
      throw new Error(`Expected HTTP-P6-CRIT as #1 pick, got ${productRec.fefoPickBatch.batchNumber}`);
    }
    if (!productRec.fefoPickBatch.fefoRecommendation.includes('HTTP-P6-CRIT')) {
      throw new Error('Recommendation text missing batch number');
    }
    console.log('  ✓ 200 OK: FEFO recommendations returned with #1 Pick First badge');

    // Test 5: GET /api/expiry/calendar
    console.log('\nTest 5: GET /api/expiry/calendar');
    const res5 = await fetch(`${API_BASE}/expiry/calendar`, { headers: authHeaders(ownerToken) });
    if (res5.status !== 200) throw new Error(`Expected 200, got ${res5.status}`);
    const data5 = await res5.json();
    if (!data5.data.calendarDays) throw new Error('Calendar days missing in calendar response');
    console.log(`  ✓ 200 OK: Expiry calendar data returned for month ${data5.data.monthName}`);

    // Test 6: GET /api/expiry/risk
    console.log('\nTest 6: GET /api/expiry/risk');
    const res6 = await fetch(`${API_BASE}/expiry/risk`, { headers: authHeaders(employeeToken) });
    if (res6.status !== 200) throw new Error(`Expected 200, got ${res6.status}`);
    const data6 = await res6.json();
    if (!data6.data.summary) throw new Error('Summary missing in risk response');
    console.log('  ✓ 200 OK: Risk assessment breakdown returned');

    // Test 7: Employee attempting to update store settings -> 403 Forbidden
    console.log('\nTest 7: Employee PUT /api/store settings -> 403 Forbidden');
    const res7 = await fetch(`${API_BASE}/store`, {
      method: 'PUT',
      headers: authHeaders(employeeToken),
      body: JSON.stringify({ expiryWarningDays: 14 })
    });
    if (res7.status !== 403) throw new Error(`Expected 403 for employee store update, got ${res7.status}`);
    console.log('  ✓ 403 Forbidden: Employee cannot modify store settings');

    // Test 8: Owner updating store expiry thresholds & timezone
    console.log('\nTest 8: Owner PUT /api/store valid settings -> 200 OK');
    const res8 = await fetch(`${API_BASE}/store`, {
      method: 'PUT',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        expiryWarningDays: 10,
        expiryCriticalDays: 4,
        lowStockThreshold: 8,
        timezone: 'Asia/Kolkata'
      })
    });
    if (res8.status !== 200) throw new Error(`Expected 200 for owner store update, got ${res8.status}`);
    const data8 = await res8.json();
    if (data8.data.expiryWarningDays !== 10) throw new Error('expiryWarningDays not updated');
    if (data8.data.expiryCriticalDays !== 4) throw new Error('expiryCriticalDays not updated');
    if (data8.data.lowStockThreshold !== 8) throw new Error('lowStockThreshold not updated');
    console.log('  ✓ 200 OK: Owner updated expiry thresholds (warning: 10, critical: 4, lowStock: 8)');

    // Test 9: Owner updating invalid criticalDays > warningDays -> 400 Bad Request
    console.log('\nTest 9: Owner PUT /api/store invalid criticalDays > warningDays -> 400 Bad Request');
    const res9 = await fetch(`${API_BASE}/store`, {
      method: 'PUT',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        expiryWarningDays: 5,
        expiryCriticalDays: 8
      })
    });
    if (res9.status !== 400) throw new Error(`Expected 400 for criticalDays > warningDays, got ${res9.status}`);
    console.log('  ✓ 400 Bad Request: Rejected invalid thresholds (critical > warning)');

    // Reset store back to defaults
    await fetch(`${API_BASE}/store`, {
      method: 'PUT',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata'
      })
    });

    console.log('\n--- ALL 9 PHASE 6 HTTP INTEGRATION TESTS PASSED! ---');
  } finally {
    // Clean up test collections
    await User.deleteMany({ email: /http_p6/ });
    await Product.deleteMany({ name: /HttpP6/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P6/ });
    await Store.deleteMany({ contactEmail: /phase6/ });
    await mongoose.disconnect();
  }
}

runHttpTests().catch((err) => {
  console.error('\n❌ HTTP Integration Test Failed:', err);
  process.exit(1);
});
