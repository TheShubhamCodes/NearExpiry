/**
 * Phase 7 Unit & Domain Verification Test Suite
 * Tests Notification model, deduplication keys, scheduled check engine,
 * alert categories, user isolation, and Resend email mock integration.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const Notification = require('../models/Notification');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { getCalendarDateParts } = require('./expiryUtils');

async function runTests() {
  console.log('--- Starting Phase 7 Domain & Service Verification ---');
  await mongoose.connect(mongodbUri);

  let owner;
  let employee;
  let store;
  let productA;
  let productB;

  try {
    // 0. Clean up previous test data
    await User.deleteMany({ email: /testp7/ });
    await Product.deleteMany({ name: /TestP7/ });
    await InventoryBatch.deleteMany({ batchNumber: /P7-/ });
    await Notification.deleteMany({});

    // 1. Setup store, owner, and employee
    store = await Store.getStore();
    if (!store) {
      store = await Store.create({
        storeName: 'Phase 7 Supermarket',
        contactEmail: 'phase7@test.com',
        expiryWarningDays: 7,
        expiryCriticalDays: 3,
        lowStockThreshold: 5,
        timezone: 'Asia/Kolkata'
      });
    }

    owner = await User.create({
      fullName: 'Phase7 Owner',
      email: 'testp7_owner@nearexpiry.local',
      password: 'password123',
      role: 'owner',
      isActive: true
    });

    employee = await User.create({
      fullName: 'Phase7 Employee',
      email: 'testp7_emp@nearexpiry.local',
      password: 'password123',
      role: 'employee',
      isActive: true
    });

    console.log('Test 1: Notification Model & Deduplication Key Index');
    // Create notification 1 with unique deduplication key
    const dedupKey = 'user1_batch1_CRITICAL_2026-11-06';
    const n1 = await notificationService.createNotification({
      userId: owner._id,
      storeId: store._id,
      type: 'EXPIRY_CRITICAL',
      title: 'Critical Expiry Alert',
      message: 'Batch expires in 2 days',
      severity: 'critical',
      deduplicationKey: dedupKey,
      sendEmail: false
    });

    if (!n1.created) throw new Error('Expected first notification to be created');

    // Attempt to create duplicate with same key
    const n2 = await notificationService.createNotification({
      userId: owner._id,
      storeId: store._id,
      type: 'EXPIRY_CRITICAL',
      title: 'Critical Expiry Alert',
      message: 'Batch expires in 2 days',
      severity: 'critical',
      deduplicationKey: dedupKey,
      sendEmail: false
    });

    if (n2.created !== false || n2.duplicate !== true) {
      throw new Error('Expected duplicate notification to be rejected by deduplication key');
    }
    console.log('  ✓ Database-level deduplication key correctly prevented duplicate notification');

    // Test 2: Scheduled Expiry & Inventory Engine
    console.log('\nTest 2: Alert Categories Generation (Warning, Critical, Today, Expired, Low-Stock, Depleted)');
    const tz = 'Asia/Kolkata';
    const todayParts = getCalendarDateParts(new Date(), tz);
    const makeDate = (offsetDays) =>
      new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + offsetDays, 12, 0, 0));

    productA = await Product.create({
      name: 'TestP7 Fresh Milk',
      brand: 'DairyBest',
      category: 'Dairy & Eggs',
      unit: 'litre',
      reorderPoint: 8,
      createdBy: owner._id
    });

    productB = await Product.create({
      name: 'TestP7 Cereal Box',
      brand: 'MorningGrain',
      category: 'Pantry Staples',
      unit: 'box',
      reorderPoint: null, // will use store.lowStockThreshold (5)
      createdBy: owner._id
    });

    // Batch 1: Expired (2 days ago)
    await InventoryBatch.create({
      product: productA._id,
      batchNumber: 'P7-EXP',
      quantityReceived: 10,
      currentQuantity: 10,
      purchasePrice: 1.5,
      expiryDate: makeDate(-2),
      createdBy: owner._id
    });

    // Batch 2: Expiring Today (0 days)
    await InventoryBatch.create({
      product: productA._id,
      batchNumber: 'P7-TODAY',
      quantityReceived: 5,
      currentQuantity: 5,
      purchasePrice: 1.5,
      expiryDate: makeDate(0),
      createdBy: owner._id
    });

    // Batch 3: Critical (2 days remaining)
    await InventoryBatch.create({
      product: productA._id,
      batchNumber: 'P7-CRIT',
      quantityReceived: 12,
      currentQuantity: 12,
      purchasePrice: 1.5,
      expiryDate: makeDate(2),
      createdBy: owner._id
    });

    // Batch 4: Warning (5 days remaining)
    await InventoryBatch.create({
      product: productB._id,
      batchNumber: 'P7-WARN',
      quantityReceived: 4, // 4 units <= store threshold (5), so productB will also trigger LOW_STOCK
      currentQuantity: 4,
      purchasePrice: 3.0,
      expiryDate: makeDate(5),
      createdBy: owner._id
    });

    // Batch 5: Depleted (0 units)
    await InventoryBatch.create({
      product: productB._id,
      batchNumber: 'P7-DEPLETED',
      quantityReceived: 20,
      currentQuantity: 0,
      purchasePrice: 3.0,
      expiryDate: makeDate(20),
      createdBy: owner._id
    });

    // Run automated check engine
    const checkResult = await notificationService.runExpiryAndInventoryChecks();
    if (checkResult.notificationsCreated === 0) {
      throw new Error('Expected notifications to be created during check');
    }
    console.log(`  ✓ Check engine executed: ${checkResult.notificationsCreated} notifications created across active recipients`);

    // Verify all alert categories were generated in DB for the owner:
    const ownerNotifs = await Notification.find({ user: owner._id }).lean();
    const hasExpired = ownerNotifs.some((n) => n.type === 'EXPIRED');
    const hasToday = ownerNotifs.some((n) => n.type === 'EXPIRING_TODAY');
    const hasCritical = ownerNotifs.some((n) => n.type === 'EXPIRY_CRITICAL' || n.type === 'EXPIRING_CRITICAL');
    const hasWarning = ownerNotifs.some((n) => n.type === 'EXPIRY_WARNING');
    const hasLowStock = ownerNotifs.some((n) => n.type === 'LOW_STOCK');
    const hasDepleted = ownerNotifs.some((n) => n.type === 'BATCH_DEPLETED');

    if (!hasExpired) throw new Error('Missing EXPIRED notification');
    if (!hasToday) throw new Error('Missing EXPIRING_TODAY notification');
    if (!hasCritical) throw new Error('Missing EXPIRING_CRITICAL notification');
    if (!hasWarning) throw new Error('Missing EXPIRY_WARNING notification');
    if (!hasLowStock) throw new Error('Missing LOW_STOCK notification');
    if (!hasDepleted) throw new Error('Missing BATCH_DEPLETED notification');
    console.log('  ✓ Verified 6 alert types: EXPIRED, EXPIRING_TODAY, EXPIRING_CRITICAL, EXPIRY_WARNING, LOW_STOCK, BATCH_DEPLETED');

    // Test 3: Idempotence & Deduplication on Re-Run
    console.log('\nTest 3: Scheduler Idempotence & Deduplication');
    const recheckResult = await notificationService.runExpiryAndInventoryChecks();
    if (recheckResult.notificationsCreated !== 0) {
      throw new Error(`Expected 0 new notifications on immediate rerun, got ${recheckResult.notificationsCreated}`);
    }
    if (recheckResult.duplicatesSkipped === 0) {
      throw new Error('Expected duplicates to be skipped on rerun');
    }
    console.log(`  ✓ Immediate rerun created 0 duplicates (${recheckResult.duplicatesSkipped} duplicates safely skipped)`);

    // Test 4: Depleted Batch Exclusion from Expiry Alerts
    console.log('\nTest 4: Depleted Batch Expiry Alert Exclusion');
    const depletedExpiryNotif = ownerNotifs.find(
      (n) => n.type === 'EXPIRY_WARNING' && n.title.includes('P7-DEPLETED')
    );
    if (depletedExpiryNotif) {
      throw new Error('Depleted batch was incorrectly given an expiry warning notification');
    }
    console.log('  ✓ Depleted batches with 0 quantity excluded from active expiry alerts');

    // Test 5: User-Specific Notification Access & Isolation
    console.log('\nTest 5: User Isolation & Access Control');
    const employeeNotifs = await Notification.find({ user: employee._id }).lean();
    if (employeeNotifs.length === 0) throw new Error('Expected employee to have their own notification feed');

    // Employee cannot mark owner's notification as read
    let crossUserForbidden = false;
    try {
      await notificationService.markAsRead(ownerNotifs[0]._id, employee._id);
    } catch (err) {
      crossUserForbidden = true;
    }
    if (!crossUserForbidden) throw new Error('Expected error when employee attempts to mark owner notification');
    console.log('  ✓ Cross-user notification manipulation successfully blocked (404/Access Denied)');

    // Test 6: Mark As Read, Mark All Read, and Delete
    console.log('\nTest 6: Notification Read State & Deletion');
    const unreadBefore = (await notificationService.getUnreadCount(owner._id)).unreadCount;
    if (unreadBefore === 0) throw new Error('Expected unread notifications before marking');

    // Mark single notification read
    const targetNotif = ownerNotifs[0];
    const markedOne = await notificationService.markAsRead(targetNotif._id, owner._id);
    if (!markedOne.isRead || !markedOne.readAt) throw new Error('Expected notification to be marked as read');

    // Mark all as read
    const markAllRes = await notificationService.markAllAsRead(owner._id);
    const unreadAfter = (await notificationService.getUnreadCount(owner._id)).unreadCount;
    if (unreadAfter !== 0) throw new Error(`Expected 0 unread notifications after markAllAsRead, got ${unreadAfter}`);
    console.log(`  ✓ Mark as read and mark all as read verified (Unread: ${unreadBefore} → ${unreadAfter})`);

    // Delete notification
    await notificationService.deleteNotification(targetNotif._id, owner._id);
    const checkDeleted = await Notification.findById(targetNotif._id);
    if (checkDeleted) throw new Error('Expected notification to be deleted from database');
    console.log('  ✓ Notification deletion confirmed in MongoDB');

    // Test 7: Daily Digest Dispatch & Deduplication
    console.log('\nTest 7: Daily Digest Dispatcher');
    const digestResult = await notificationService.dispatchDailyDigest();
    if (!digestResult.success || digestResult.digestsSent === 0) {
      throw new Error('Expected daily digest to be sent');
    }
    // Rerun digest should be deduplicated
    const digestRerun = await notificationService.dispatchDailyDigest();
    if (digestRerun.digestsSent !== 0) {
      throw new Error('Expected 0 digests sent on duplicate rerun on same day');
    }
    console.log('  ✓ Daily Digest dispatched and deduplicated successfully');

    // Test 8: Resend Email Integration & Mock Verification
    console.log('\nTest 8: Resend Email Mocking & Template Generation');
    let emailSentArgs = null;
    emailService.setResendClient({
      emails: {
        send: async (args) => {
          emailSentArgs = args;
          return { id: 'mock_resend_email_id_123' };
        }
      }
    });

    const emailRes = await emailService.sendAlertEmail({
      to: 'manager@store.com',
      subject: '[CRITICAL] Milk Expiring Soon',
      title: 'Critical Expiry Alert',
      message: 'Batch P7-CRIT expires in 2 days. Prioritize FEFO.',
      severity: 'critical',
      details: {
        'Product': 'Fresh Milk 1L',
        'Quantity': '12 litres',
        'Expiry Date': '2026-11-08'
      }
    });

    if (!emailRes.success || emailRes.id !== 'mock_resend_email_id_123') {
      throw new Error('Email delivery mock failed');
    }
    if (!emailSentArgs || !emailSentArgs.html.includes('Fresh Milk 1L')) {
      throw new Error('Email HTML template missing product details');
    }
    console.log('  ✓ Resend email mock sent and verified with branded HTML template');

    console.log('\n--- ALL 8 PHASE 7 UNIT & DOMAIN TESTS PASSED! ---');
  } finally {
    // Reset mock client and clean up test records
    emailService.setResendClient(null);
    await User.deleteMany({ email: /testp7/ });
    await Product.deleteMany({ name: /TestP7/ });
    await InventoryBatch.deleteMany({ batchNumber: /P7-/ });
    await Notification.deleteMany({});
    await Store.deleteMany({ contactEmail: /phase7/ });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Phase 7 Test Failed:', err);
  process.exit(1);
});
