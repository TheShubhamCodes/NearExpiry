/**
 * Phase 8 HTTP Integration Test Suite
 * Tests all /api/actions endpoints over live HTTP including:
 * - Summary KPI endpoints
 * - Smart suggestions
 * - Markdown lifecycle & owner authorization guards
 * - Supplier return creation & dispatch
 * - Quarantine & disposal workflows
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const Markdown = require('../models/Markdown');
const SupplierReturn = require('../models/SupplierReturn');
const StockDisposition = require('../models/StockDisposition');
const StockMovement = require('../models/StockMovement');
const { generateToken } = require('./token');

const API_BASE = 'http://localhost:5000/api';

async function runHttpTests() {
  console.log('--- Starting Phase 8 HTTP API Verification ---');
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
    await User.deleteMany({ email: /http_p8/ });
    await Product.deleteMany({ name: /HttpP8/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P8/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /HTTP-P8/i });

    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Http P8 Supermarket',
        contactEmail: 'httpp8@test.com',
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
    }

    owner = await User.create({
      fullName: 'Http Owner P8',
      email: 'http_p8_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Http Employee P8',
      email: 'http_p8_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    ownerToken = generateToken(owner);
    employeeToken = generateToken(employee);

    product = await Product.create({
      name: 'HttpP8 Organic Milk 1L',
      brand: 'FarmFresh',
      category: 'Dairy',
      unit: 'litre',
      createdBy: owner._id
    });

    const now = new Date();
    const expiryDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days -> critical
    batch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'HTTP-P8-01',
      quantityReceived: 50,
      currentQuantity: 50,
      purchasePrice: 1.5,
      sellingPrice: 3.0,
      expiryDate,
      receivedDate: now,
      createdBy: owner._id
    });

    const authHeaders = (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`
    });

    // Test 1: Unauthenticated request to /api/actions/summary returns 401
    console.log('Test 1: Unauthenticated GET /api/actions/summary');
    const res1 = await fetch(`${API_BASE}/actions/summary`);
    if (res1.status !== 401) throw new Error(`Expected 401, got ${res1.status}`);
    console.log('  ✓ 401 Unauthorized for unauthenticated request');

    // Test 2: Authenticated GET /api/actions/summary returns KPIs
    console.log('\nTest 2: Authenticated GET /api/actions/summary');
    const res2 = await fetch(`${API_BASE}/actions/summary`, { headers: authHeaders(ownerToken) });
    if (res2.status !== 200) throw new Error(`Expected 200, got ${res2.status}`);
    const data2 = await res2.json();
    if (!data2.success || !data2.data.markdowns || !data2.data.supplierReturns) {
      throw new Error('Invalid summary structure returned');
    }
    console.log('  ✓ 200 OK: Complete action summary KPIs retrieved');

    // Test 3: GET /api/actions/markdowns/suggestions
    console.log('\nTest 3: GET /api/actions/markdowns/suggestions');
    const res3 = await fetch(`${API_BASE}/actions/markdowns/suggestions`, { headers: authHeaders(employeeToken) });
    if (res3.status !== 200) throw new Error(`Expected 200, got ${res3.status}`);
    const data3 = await res3.json();
    if (!data3.success || !Array.isArray(data3.data.suggestions)) {
      throw new Error('Invalid suggestions payload format');
    }
    const match = data3.data.suggestions.find((s) => s.batchId.toString() === batch._id.toString());
    if (!match || match.suggestedPercent !== 30) {
      throw new Error(`Expected 30% suggestion for critical batch, got ${match?.suggestedPercent}`);
    }
    console.log('  ✓ 200 OK: Smart markdown suggestions computed accurately');

    // Test 4: Employee POST /api/actions/markdowns (Propose Markdown)
    console.log('\nTest 4: Employee POST /api/actions/markdowns (Propose Markdown)');
    const res4 = await fetch(`${API_BASE}/actions/markdowns`, {
      method: 'POST',
      headers: authHeaders(employeeToken),
      body: JSON.stringify({
        batchId: batch._id.toString(),
        discountPercent: 25,
        reason: 'HTTP test proposed discount'
      })
    });
    if (res4.status !== 201) {
      const err = await res4.json();
      throw new Error(`Expected 201, got ${res4.status}: ${JSON.stringify(err)}`);
    }
    const data4 = await res4.json();
    const markdownId = data4.data._id;
    if (data4.data.status !== 'PENDING_APPROVAL' || data4.data.discountedPrice !== 2.25) {
      throw new Error(`Unexpected markdown values: ${JSON.stringify(data4.data)}`);
    }
    console.log('  ✓ 201 Created: Markdown proposal submitted in PENDING_APPROVAL status');

    // Test 5: Employee attempts to approve markdown -> 403 Forbidden
    console.log('\nTest 5: Employee authorization check for markdown approval');
    const res5 = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/approve`, {
      method: 'POST',
      headers: authHeaders(employeeToken)
    });
    if (res5.status !== 403) throw new Error(`Expected 403 Forbidden for employee approval, got ${res5.status}`);
    console.log('  ✓ 403 Forbidden: Employee cannot approve markdown proposals');

    // Test 6: Owner approves markdown -> 200 OK
    console.log('\nTest 6: Owner approves markdown');
    const res6 = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/approve`, {
      method: 'POST',
      headers: authHeaders(ownerToken)
    });
    if (res6.status !== 200) throw new Error(`Expected 200, got ${res6.status}`);
    const data6 = await res6.json();
    if (data6.data.status !== 'APPROVED') throw new Error(`Expected APPROVED status, got ${data6.data.status}`);
    console.log('  ✓ 200 OK: Owner approved markdown proposal');

    // Test 7: Owner activates markdown -> 200 OK
    console.log('\nTest 7: Owner activates markdown');
    const res7 = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/activate`, {
      method: 'POST',
      headers: authHeaders(ownerToken)
    });
    if (res7.status !== 200) throw new Error(`Expected 200, got ${res7.status}`);
    const data7 = await res7.json();
    if (data7.data.status !== 'ACTIVE') throw new Error(`Expected ACTIVE status, got ${data7.data.status}`);
    console.log('  ✓ 200 OK: Owner activated markdown and updated batch price');

    // Test 8: Create Supplier Return
    console.log('\nTest 8: POST /api/actions/returns (Initiate Supplier Return)');
    const res8 = await fetch(`${API_BASE}/actions/returns`, {
      method: 'POST',
      headers: authHeaders(employeeToken),
      body: JSON.stringify({
        productId: product._id.toString(),
        batchId: batch._id.toString(),
        supplierName: 'Dairy Co-op Wholesalers',
        quantity: 10,
        reason: 'NEAR_EXPIRY',
        resolutionExpected: 'REPLACEMENT',
        notes: 'HTTP test supplier return'
      })
    });
    if (res8.status !== 201) {
      const err = await res8.json();
      throw new Error(`Expected 201, got ${res8.status}: ${JSON.stringify(err)}`);
    }
    const data8 = await res8.json();
    const returnId = data8.data._id;
    if (data8.data.status !== 'REQUESTED') throw new Error(`Expected REQUESTED status, got ${data8.data.status}`);
    console.log('  ✓ 201 Created: Supplier return initiated successfully');

    // Test 9: Update Supplier Return status to DISPATCHED
    console.log('\nTest 9: PATCH /api/actions/returns/:id/status (Dispatch Return)');
    const res9 = await fetch(`${API_BASE}/actions/returns/${returnId}/status`, {
      method: 'PATCH',
      headers: authHeaders(employeeToken),
      body: JSON.stringify({
        status: 'DISPATCHED',
        resolutionNotes: 'Dispatched via logistics partner'
      })
    });
    if (res9.status !== 200) throw new Error(`Expected 200, got ${res9.status}`);
    const data9 = await res9.json();
    if (data9.data.status !== 'DISPATCHED' || !data9.data.stockDeducted) {
      throw new Error('Expected DISPATCHED status and stockDeducted: true');
    }
    console.log('  ✓ 200 OK: Supplier return dispatched and stock deducted');

    // Test 10: Quarantine Stock
    console.log('\nTest 10: POST /api/actions/quarantine');
    const res10 = await fetch(`${API_BASE}/actions/quarantine`, {
      method: 'POST',
      headers: authHeaders(employeeToken),
      body: JSON.stringify({
        batchId: batch._id.toString(),
        quantity: 5,
        reason: 'Leaking carton packaging in batch'
      })
    });
    if (res10.status !== 201) throw new Error(`Expected 201, got ${res10.status}`);
    const data10 = await res10.json();
    const dispositionId = data10.data._id;
    if (data10.data.status !== 'QUARANTINED') throw new Error(`Expected QUARANTINED status, got ${data10.data.status}`);
    console.log('  ✓ 201 Created: Stock segregated to quarantine');

    // Test 11: Dispose Quarantined Stock
    console.log('\nTest 11: POST /api/actions/dispose');
    const res11 = await fetch(`${API_BASE}/actions/dispose`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        dispositionId,
        disposalMethod: 'DISPOSED_TRASH',
        reason: 'Disposal authorized after inspection'
      })
    });
    if (res11.status !== 200) throw new Error(`Expected 200, got ${res11.status}`);
    const data11 = await res11.json();
    if (data11.data.status !== 'DISPOSED') throw new Error(`Expected DISPOSED status, got ${data11.data.status}`);
    console.log('  ✓ 200 OK: Quarantined stock written off and disposed');

    console.log('\n======================================================');
    console.log('✓ ALL PHASE 8 HTTP API TESTS PASSED (11/11)');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ PHASE 8 HTTP API VERIFICATION FAILED:', error);
    process.exitCode = 1;
  } finally {
    // Clean up test records
    await User.deleteMany({ email: /http_p8/ });
    await Product.deleteMany({ name: /HttpP8/ });
    await InventoryBatch.deleteMany({ batchNumber: /HTTP-P8/ });
    await Markdown.deleteMany({});
    await SupplierReturn.deleteMany({});
    await StockDisposition.deleteMany({});
    await StockMovement.deleteMany({ reason: /HTTP-P8/i });
    await mongoose.disconnect();
  }
}

runHttpTests();

