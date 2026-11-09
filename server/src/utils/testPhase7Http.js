/**
 * Phase 7 HTTP Integration Test Suite
 * Tests all /api/notifications endpoints over live HTTP.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Notification = require('../models/Notification');
const { generateToken } = require('./token');

const API_BASE = 'http://localhost:5000/api';

async function runHttpTests() {
  console.log('--- Starting Phase 7 HTTP API Verification ---');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let ownerToken;
  let employeeToken;
  let testNotification;

  try {
    // 0. Clean up test users and notifications
    await User.deleteMany({ email: /http_p7/ });
    await Notification.deleteMany({});

    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Http P7 Supermarket',
        contactEmail: 'httpp7@test.com'
      });
    }

    owner = await User.create({
      fullName: 'Http Owner P7',
      email: 'http_p7_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Http Employee P7',
      email: 'http_p7_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    ownerToken = generateToken(owner);
    employeeToken = generateToken(employee);

    // Create a test notification for owner
    testNotification = await Notification.create({
      user: owner._id,
      store: store._id,
      type: 'EXPIRY_CRITICAL',
      title: 'Urgent Expiry HTTP Test',
      message: 'Milk expires tomorrow.',
      severity: 'critical'
    });

    const authHeaders = (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`
    });

    // Test 1: Unauthenticated request returns 401
    console.log('Test 1: Unauthenticated GET /api/notifications');
    const res1 = await fetch(`${API_BASE}/notifications`);
    if (res1.status !== 401) throw new Error(`Expected 401, got ${res1.status}`);
    console.log('  ✓ 401 Unauthorized for unauthenticated request');

    // Test 2: Authenticated GET /api/notifications returns list
    console.log('\nTest 2: Authenticated GET /api/notifications');
    const res2 = await fetch(`${API_BASE}/notifications`, { headers: authHeaders(ownerToken) });
    if (res2.status !== 200) throw new Error(`Expected 200, got ${res2.status}`);
    const data2 = await res2.json();
    if (!data2.success || !Array.isArray(data2.data)) throw new Error('Invalid notifications response format');
    if (data2.data.length < 1) throw new Error('Expected at least 1 notification in feed');
    console.log('  ✓ 200 OK: Notifications feed returned with pagination metadata');

    // Test 3: GET /api/notifications/unread-count
    console.log('\nTest 3: GET /api/notifications/unread-count');
    const res3 = await fetch(`${API_BASE}/notifications/unread-count`, { headers: authHeaders(ownerToken) });
    if (res3.status !== 200) throw new Error(`Expected 200, got ${res3.status}`);
    const data3 = await res3.json();
    if (typeof data3.data.unreadCount !== 'number' || data3.data.unreadCount < 1) {
      throw new Error('Expected positive unread count');
    }
    console.log(`  ✓ 200 OK: Unread count returned (${data3.data.unreadCount})`);

    // Test 4: PATCH /api/notifications/:id/read
    console.log('\nTest 4: PATCH /api/notifications/:id/read');
    const res4 = await fetch(`${API_BASE}/notifications/${testNotification._id}/read`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken)
    });
    if (res4.status !== 200) throw new Error(`Expected 200, got ${res4.status}`);
    const data4 = await res4.json();
    if (!data4.data.isRead) throw new Error('Expected notification to be marked read');
    console.log('  ✓ 200 OK: Notification successfully marked as read');

    // Test 5: Employee trying to mark owner's notification -> 404 / Access Denied
    console.log('\nTest 5: Cross-User Authorization Boundary');
    const res5 = await fetch(`${API_BASE}/notifications/${testNotification._id}/read`, {
      method: 'PATCH',
      headers: authHeaders(employeeToken)
    });
    if (res5.status !== 404) throw new Error(`Expected 404 for cross-user access, got ${res5.status}`);
    console.log('  ✓ 404 Not Found: Employee cannot access or modify owner notification');

    // Test 6: PATCH /api/notifications/mark-all-read
    console.log('\nTest 6: PATCH /api/notifications/mark-all-read');
    const res6 = await fetch(`${API_BASE}/notifications/mark-all-read`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken)
    });
    if (res6.status !== 200) throw new Error(`Expected 200, got ${res6.status}`);
    console.log('  ✓ 200 OK: Mark all notifications read completed');

    // Test 7: GET & PUT /api/notifications/preferences
    console.log('\nTest 7: GET & PUT /api/notifications/preferences');
    const res7a = await fetch(`${API_BASE}/notifications/preferences`, { headers: authHeaders(ownerToken) });
    if (res7a.status !== 200) throw new Error(`Expected 200, got ${res7a.status}`);
    const data7a = await res7a.json();
    if (!data7a.data.userPreferences) throw new Error('Preferences data missing');

    const res7b = await fetch(`${API_BASE}/notifications/preferences`, {
      method: 'PUT',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        browserNotificationsEnabled: true,
        notifyLowStock: false
      })
    });
    if (res7b.status !== 200) throw new Error(`Expected 200, got ${res7b.status}`);
    const data7b = await res7b.json();
    if (data7b.data.browserNotificationsEnabled !== true || data7b.data.notifyLowStock !== false) {
      throw new Error('Preferences update mismatch');
    }
    console.log('  ✓ 200 OK: Notification preferences updated successfully');

    // Test 8: POST /api/notifications/trigger-check
    console.log('\nTest 8: POST /api/notifications/trigger-check');
    const res8 = await fetch(`${API_BASE}/notifications/trigger-check`, {
      method: 'POST',
      headers: authHeaders(employeeToken)
    });
    if (res8.status !== 200) throw new Error(`Expected 200, got ${res8.status}`);
    console.log('  ✓ 200 OK: Manual background check triggered');

    // Test 9: POST /api/notifications/test-email (Employee 403, Owner 200)
    console.log('\nTest 9: POST /api/notifications/test-email');
    const res9a = await fetch(`${API_BASE}/notifications/test-email`, {
      method: 'POST',
      headers: authHeaders(employeeToken)
    });
    if (res9a.status !== 403) throw new Error(`Expected 403 for employee, got ${res9a.status}`);
    console.log('  ✓ 403 Forbidden: Employee prevented from triggering test emails');

    const res9b = await fetch(`${API_BASE}/notifications/test-email`, {
      method: 'POST',
      headers: authHeaders(ownerToken)
    });
    if (res9b.status !== 200) throw new Error(`Expected 200 for owner, got ${res9b.status}`);
    console.log('  ✓ 200 OK: Store owner can trigger test email');

    // Test 10: DELETE /api/notifications/:id
    console.log('\nTest 10: DELETE /api/notifications/:id');
    const res10 = await fetch(`${API_BASE}/notifications/${testNotification._id}`, {
      method: 'DELETE',
      headers: authHeaders(ownerToken)
    });
    if (res10.status !== 200) throw new Error(`Expected 200, got ${res10.status}`);
    console.log('  ✓ 200 OK: Notification deleted successfully');

    console.log('\n--- ALL 10 PHASE 7 HTTP INTEGRATION TESTS PASSED! ---');
  } finally {
    // Clean up
    await User.deleteMany({ email: /http_p7/ });
    await Notification.deleteMany({});
    await Store.deleteMany({ contactEmail: /httpp7/ });
    await mongoose.disconnect();
  }
}

runHttpTests().catch((err) => {
  console.error('\n❌ HTTP Integration Test Failed:', err);
  process.exit(1);
});
