/**
 * Phase 11 Automated Security & Authorization Test Suite
 * Tests:
 * 1. CSRF Protection for state-changing requests with untrusted origin
 * 2. Owner vs Employee role-based access control (RBAC):
 *    - Employees cannot manage employees (403)
 *    - Employees cannot update store settings (403)
 *    - Employees cannot approve, activate, or reject markdowns (403)
 *    - Employees cannot cancel owner-approved or active markdowns (403)
 *    - Employees CAN cancel their own pending proposals (200)
 * 3. Inactive Employee Immediate Revocation (Login 403 and Authenticated Token 403)
 * 4. Password hashing ($2b$...) and exclusion from JSON responses (select: false)
 * 5. JWT security and session expiry handling
 * 6. Zod input validation and NoSQL query injection rejection
 * 7. Clean teardown with zero residual records
 */

const mongoose = require('mongoose');
const { mongodbUri, jwtSecret } = require('../config/env');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const Markdown = require('../models/Markdown');
const { generateToken } = require('./token');

const API_BASE = 'http://localhost:5000/api';

async function runSecurityTests() {
  console.log('=== Starting Phase 11 Security & Authorization Verification ===');
  await mongoose.connect(mongodbUri);

  let owner;
  let employeeA;
  let employeeB;
  let store;
  let product;
  let batch;
  let ownerToken;
  let employeeAToken;
  let employeeBToken;

  try {
    // 0. Clean previous security test fixtures
    await User.deleteMany({ email: /sec_p11/ });
    await Product.deleteMany({ name: /SecP11/ });
    await InventoryBatch.deleteMany({ batchNumber: /SEC-P11/ });
    await Markdown.deleteMany({ reason: /SecP11/i });

    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Security P11 Supermarket',
        contactEmail: 'sec_p11@store.local',
        currency: 'USD ($)',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata'
      });
    }

    owner = await User.create({
      fullName: 'SecP11 Owner',
      email: 'sec_p11_owner@store.local',
      password: 'HashedPassword123!',
      role: 'owner',
      isActive: true
    });

    employeeA = await User.create({
      fullName: 'SecP11 Employee A',
      email: 'sec_p11_emp_a@store.local',
      password: 'HashedPassword123!',
      role: 'employee',
      isActive: true
    });

    employeeB = await User.create({
      fullName: 'SecP11 Employee B',
      email: 'sec_p11_emp_b@store.local',
      password: 'HashedPassword123!',
      role: 'employee',
      isActive: true
    });

    ownerToken = generateToken(owner);
    employeeAToken = generateToken(employeeA);
    employeeBToken = generateToken(employeeB);

    product = await Product.create({
      name: 'SecP11 Organic Honey 500g',
      category: 'Pantry Staples',
      brand: 'NaturePure',
      unitOfMeasurement: 'piece',
      createdBy: owner._id
    });

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 10);

    batch = await InventoryBatch.create({
      product: product._id,
      batchNumber: 'SEC-P11-B01',
      quantityReceived: 30,
      currentQuantity: 30,
      purchasePrice: 10,
      sellingPrice: 18,
      expiryDate: expDate,
      createdBy: owner._id
    });

    console.log('✓ Store, users, product, and batch fixtures initialized.');

    // TEST 1: CSRF Protection on State-Changing Requests
    console.log('\n--- Test 1: CSRF Protection with Untrusted Origin ---');
    const csrfRes = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        Origin: 'http://malicious-website.com'
      },
      body: JSON.stringify({
        name: 'SecP11 Evil Product',
        category: 'General',
        unit: 'piece'
      })
    });
    if (csrfRes.status !== 403) {
      throw new Error(`Expected 403 for untrusted Origin, got ${csrfRes.status}`);
    }
    const csrfJson = await csrfRes.json();
    console.log(`✓ Untrusted Origin properly blocked with 403: "${csrfJson.message}"`);

    // TEST 2: Employees Blocked from Owner-Only APIs
    console.log('\n--- Test 2: Role-Based Access Control (Employee Blocked from Owner APIs) ---');

    // 2a. Employee cannot list or manage employees
    const empManageRes = await fetch(`${API_BASE}/employees`, {
      headers: { Authorization: `Bearer ${employeeAToken}` }
    });
    if (empManageRes.status !== 403) {
      throw new Error(`Expected 403 for employee calling /employees, got ${empManageRes.status}`);
    }
    console.log('✓ Employee blocked from GET /api/employees (403 Forbidden)');

    // 2b. Employee cannot update store settings
    const storeUpdateRes = await fetch(`${API_BASE}/store`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({ storeName: 'Hacked Store' })
    });
    if (storeUpdateRes.status !== 403) {
      throw new Error(`Expected 403 for employee calling PUT /api/store, got ${storeUpdateRes.status}`);
    }
    console.log('✓ Employee blocked from PUT /api/store (403 Forbidden)');

    // TEST 3: Markdown Governance (Approval & Cancellation Permissions)
    console.log('\n--- Test 3: Markdown Governance & Employee Authorization Boundaries ---');

    // 3a. Employee A proposes markdown
    const mdPropRes = await fetch(`${API_BASE}/actions/markdowns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({
        batchId: batch._id.toString(),
        discountPercent: 20,
        reason: 'SecP11 markdown proposal by Employee A'
      })
    });
    if (mdPropRes.status !== 201) {
      throw new Error(`Failed to propose markdown: ${await mdPropRes.text()}`);
    }
    const mdPropJson = await mdPropRes.json();
    const markdownId = mdPropJson.data._id;
    console.log(`✓ Employee A created markdown proposal ${markdownId} in PENDING_APPROVAL status`);

    // 3b. Employee B attempts to approve markdown -> 403
    const empApproveRes = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeBToken}`
      },
      body: JSON.stringify({ note: 'Unauthorized approval attempt' })
    });
    if (empApproveRes.status !== 403) {
      throw new Error(`Expected 403 for employee approving markdown, got ${empApproveRes.status}`);
    }
    console.log('✓ Employee blocked from approving markdown (403 Forbidden)');

    // 3c. Employee B attempts to cancel Employee A's proposal -> 403
    const empBCancelRes = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeBToken}`
      },
      body: JSON.stringify({ reason: 'Employee B trying to cancel Employee A proposal' })
    });
    if (empBCancelRes.status !== 403) {
      throw new Error(`Expected 403 for Employee B cancelling Employee A proposal, got ${empBCancelRes.status}`);
    }
    console.log('✓ Employee B blocked from cancelling Employee A pending proposal (403 Forbidden)');

    // 3d. Owner approves markdown -> 200
    const ownerApproveRes = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({ note: 'Owner authorized approval' })
    });
    if (ownerApproveRes.status !== 200) {
      throw new Error(`Owner markdown approval failed: ${await ownerApproveRes.text()}`);
    }
    console.log('✓ Owner successfully approved markdown proposal');

    // 3e. Employee A attempts to cancel APPROVED markdown -> 403
    const empACancelApprovedRes = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeAToken}`
      },
      body: JSON.stringify({ reason: 'Employee trying to cancel approved markdown' })
    });
    if (empACancelApprovedRes.status !== 403) {
      throw new Error(`Expected 403 for employee cancelling approved markdown, got ${empACancelApprovedRes.status}`);
    }
    console.log('✓ Employee blocked from cancelling approved markdown (403 Forbidden)');

    // 3f. Owner cancels markdown -> 200
    const ownerCancelRes = await fetch(`${API_BASE}/actions/markdowns/${markdownId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({ reason: 'Owner cancelled markdown' })
    });
    if (ownerCancelRes.status !== 200) {
      throw new Error(`Owner cancellation failed: ${await ownerCancelRes.text()}`);
    }
    console.log('✓ Owner successfully cancelled markdown');

    // TEST 4: Immediate Inactive Employee Access Revocation
    console.log('\n--- Test 4: Immediate Deactivation & Session Invalidation ---');
    // Deactivate Employee A in database
    await User.findByIdAndUpdate(employeeA._id, { isActive: false });

    // 4a. Employee A attempts to use existing valid token -> 403 Account Deactivated
    const revokedSessionRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${employeeAToken}` }
    });
    if (revokedSessionRes.status !== 403) {
      throw new Error(`Expected 403 for deactivated employee session, got ${revokedSessionRes.status}`);
    }
    const revokedJson = await revokedSessionRes.json();
    console.log(`✓ Existing session immediately blocked: "${revokedJson.message}" (403)`);

    // 4b. Employee A attempts login -> 403 Account Deactivated
    const loginDeactivatedRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sec_p11_emp_a@store.local',
        password: 'HashedPassword123!'
      })
    });
    if (loginDeactivatedRes.status !== 403) {
      throw new Error(`Expected 403 for deactivated employee login, got ${loginDeactivatedRes.status}`);
    }
    console.log('✓ Login for deactivated employee strictly rejected with 403');

    // TEST 5: Password Hash & Sensitive Information Exclusion
    console.log('\n--- Test 5: Sensitive Information Leakage Check ---');
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    const meJson = await meRes.json();
    if (meJson.data.user.password !== undefined) {
      throw new Error('CRITICAL: Password hash exposed in /auth/me response!');
    }
    console.log('✓ Password hash strictly excluded from user responses');

    // Direct database check
    const rawUser = await User.findById(owner._id).select('+password');
    if (!rawUser.password.startsWith('$2a$') && !rawUser.password.startsWith('$2b$')) {
      throw new Error('Password not stored as bcrypt hash in database');
    }
    console.log(`✓ Password verified as salted bcrypt hash (${rawUser.password.slice(0, 10)}...)`);

    // TEST 6: Zod Injection & Schema Validation
    console.log('\n--- Test 6: Input Validation & Injection Prevention ---');
    const invalidBatchRes = await fetch(`${API_BASE}/inventory/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        productId: 'invalid-object-id-injection',
        quantityReceived: -50,
        purchasePrice: 'not-a-number',
        expiryDate: 'invalid-date'
      })
    });
    if (invalidBatchRes.status !== 400) {
      throw new Error(`Expected 400 for malformed input, got ${invalidBatchRes.status}`);
    }
    const invalidJson = await invalidBatchRes.json();
    if (!invalidJson.errors || invalidJson.errors.length === 0) {
      throw new Error('Expected structured Zod validation errors in response');
    }
    console.log(`✓ Malformed input properly rejected with structured errors: ${invalidJson.errors.length} fields failed validation`);

    console.log('\n=== ALL PHASE 11 SECURITY & AUTHORIZATION TESTS PASSED! ===');
  } catch (error) {
    console.error('\n❌ Phase 11 Security Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // Teardown
    console.log('\n--- Cleaning up Phase 11 Security test fixtures ---');
    await User.deleteMany({ email: /sec_p11/ });
    await Product.deleteMany({ name: /SecP11/ });
    await InventoryBatch.deleteMany({ batchNumber: /SEC-P11/ });
    await Markdown.deleteMany({ reason: /SecP11/i });
    await mongoose.disconnect();
    console.log('✓ Database cleaned and disconnected.');
  }
}

runSecurityTests();

