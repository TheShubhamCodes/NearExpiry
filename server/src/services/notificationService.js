const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const { getCalendarDateParts, calculateBatchExpiryStatus } = require('../utils/expiryUtils');
const emailService = require('./emailService');

/**
 * Create a notification with database-level deduplication and optional email dispatch
 */
const createNotification = async ({
  userId,
  storeId,
  type,
  title,
  message,
  severity = 'info',
  relatedProduct = null,
  relatedBatch = null,
  deduplicationKey = null,
  sendEmail = true,
  emailDetails = null
}) => {
  // 1. If deduplicationKey provided, check if already exists
  if (deduplicationKey) {
    const existing = await Notification.findOne({ deduplicationKey }).lean();
    if (existing) {
      return { created: false, duplicate: true, notification: existing };
    }
  }

  // 2. Insert notification
  let notification;
  try {
    notification = new Notification({
      user: userId,
      store: storeId,
      type,
      title,
      message,
      severity,
      relatedProduct,
      relatedBatch,
      deduplicationKey,
      isRead: false
    });
    await notification.save();
  } catch (err) {
    // Catch duplicate key error (code 11000) for concurrency safety
    if (err.code === 11000 && deduplicationKey) {
      const existing = await Notification.findOne({ deduplicationKey }).lean();
      return { created: false, duplicate: true, notification: existing };
    }
    throw err;
  }

  // 3. Check if email should be dispatched
  if (sendEmail) {
    try {
      const [user, store] = await Promise.all([
        User.findById(userId).lean(),
        Store.findById(storeId).lean()
      ]);

      if (user && store) {
        const storeSettings = store.notificationSettings || {};
        const userPrefs = user.notificationPreferences || {};

        const emailMasterEnabled = storeSettings.emailEnabled !== false;
        const userEmailEnabled = userPrefs.emailEnabled !== false;

        // Check alert type preferences
        let typeAllowed = true;
        if (type === 'EXPIRY_WARNING') typeAllowed = storeSettings.notifyExpiryWarning !== false && userPrefs.notifyExpiryWarning !== false;
        if (type === 'EXPIRY_CRITICAL') typeAllowed = storeSettings.notifyExpiryCritical !== false && userPrefs.notifyExpiryCritical !== false;
        if (type === 'EXPIRING_TODAY') typeAllowed = storeSettings.notifyExpiringToday !== false && userPrefs.notifyExpiringToday !== false;
        if (type === 'EXPIRED') typeAllowed = storeSettings.notifyExpired !== false && userPrefs.notifyExpired !== false;
        if (type === 'LOW_STOCK') typeAllowed = storeSettings.notifyLowStock !== false && userPrefs.notifyLowStock !== false;
        if (type === 'BATCH_DEPLETED') typeAllowed = storeSettings.notifyBatchDepleted !== false && userPrefs.notifyBatchDepleted !== false;

        if (emailMasterEnabled && userEmailEnabled && typeAllowed) {
          // Asynchronously dispatch email without blocking API return
          emailService.sendAlertEmail({
            to: user.email,
            subject: `[${severity.toUpperCase()}] ${title}`,
            title,
            message,
            severity,
            details: emailDetails
          }).catch((e) => {
            console.error('[NotificationService] Email delivery error:', e.message);
          });
        }
      }
    } catch (emailErr) {
      console.error('[NotificationService] Failed to evaluate email dispatch:', emailErr.message);
    }
  }

  return { created: true, duplicate: false, notification };
};

/**
 * Get paginated notifications for the current authenticated user
 */
const getUserNotifications = async (userId, query = {}) => {
  const {
    page = 1,
    limit = 20,
    isRead,
    type = 'ALL',
    severity = 'ALL'
  } = query;

  const filter = { user: userId };

  if (isRead !== undefined) {
    filter.isRead = isRead;
  }

  if (type && type !== 'ALL') {
    filter.type = type;
  }

  if (severity && severity !== 'ALL') {
    filter.severity = severity;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .populate('relatedProduct', 'name brand barcode category unit imageUrl')
      .populate('relatedBatch', 'batchNumber expiryDate currentQuantity quantityReceived')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, isRead: false })
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    notifications,
    pagination: {
      total,
      unreadCount,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    }
  };
};

/**
 * Get unread notification count for a user
 */
const getUnreadCount = async (userId) => {
  const count = await Notification.countDocuments({ user: userId, isRead: false });
  return { unreadCount: count };
};

/**
 * Mark a single notification as read (must belong to user)
 */
const markAsRead = async (notificationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const error = new Error('Invalid notification ID format');
    error.statusCode = 400;
    throw error;
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    const error = new Error('Notification not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  return notification;
};

/**
 * Mark all notifications as read for a user
 */
const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return {
    modifiedCount: result.modifiedCount || 0,
    message: 'All notifications marked as read'
  };
};

/**
 * Delete a notification (must belong to user)
 */
const deleteNotification = async (notificationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const error = new Error('Invalid notification ID format');
    error.statusCode = 400;
    throw error;
  }

  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    user: userId
  });

  if (!notification) {
    const error = new Error('Notification not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  return { success: true, message: 'Notification deleted successfully' };
};

/**
 * Get notification preferences (User preferences + Store settings)
 */
const getNotificationPreferences = async (userId) => {
  const [user, store] = await Promise.all([
    User.findById(userId).lean(),
    Store.getStore()
  ]);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    userPreferences: user.notificationPreferences || {
      inAppEnabled: true,
      emailEnabled: true,
      browserNotificationsEnabled: false,
      notifyExpiryWarning: true,
      notifyExpiryCritical: true,
      notifyExpiringToday: true,
      notifyExpired: true,
      notifyLowStock: true,
      notifyBatchDepleted: true
    },
    storeSettings: store?.notificationSettings || {
      inAppEnabled: true,
      emailEnabled: false,
      dailyDigestEnabled: true,
      dailyDigestTime: '08:00',
      notifyExpiryWarning: true,
      notifyExpiryCritical: true,
      notifyExpiringToday: true,
      notifyExpired: true,
      notifyLowStock: true,
      notifyBatchDepleted: true
    },
    isOwner: user.role === 'owner',
    storeTimezone: store?.timezone || 'Asia/Kolkata'
  };
};

/**
 * Update user-level notification preferences
 */
const updateUserNotificationPreferences = async (userId, preferencesData) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  user.notificationPreferences = {
    ...user.notificationPreferences,
    ...preferencesData
  };

  await user.save();

  return {
    success: true,
    message: 'Notification preferences updated successfully',
    preferences: user.notificationPreferences
  };
};

/**
 * Run automated expiry and low-stock checks and create deduplicated notifications
 */
const runExpiryAndInventoryChecks = async (options = {}) => {
  const { referenceDate = new Date() } = options;

  const store = await Store.getStore();
  if (!store) {
    return { checked: 0, created: 0, message: 'Store not configured' };
  }

  const timezone = store.timezone || 'Asia/Kolkata';
  const todayParts = getCalendarDateParts(referenceDate, timezone);
  const todayStr = todayParts.dateStr;

  const warningDays = store.expiryWarningDays !== undefined ? store.expiryWarningDays : 7;
  const criticalDays = store.expiryCriticalDays !== undefined ? store.expiryCriticalDays : 3;
  const storeLowStockThreshold = store.lowStockThreshold !== undefined ? store.lowStockThreshold : 5;

  // Find all active recipients (owner and active employees)
  const activeRecipients = await User.find({ isActive: true }).lean();
  if (activeRecipients.length === 0) {
    return { checked: 0, created: 0, message: 'No active staff recipients found' };
  }

  // Fetch all batches and all catalog products
  const [batches, products] = await Promise.all([
    InventoryBatch.find({}).populate('product').lean(),
    Product.find({}).lean()
  ]);

  let notificationsCreated = 0;
  let duplicatesSkipped = 0;

  // Track product-wise available unexpired stock for low-stock calculation
  const productStockMap = {}; // { productId: totalActiveUnits }
  products.forEach((p) => {
    productStockMap[p._id.toString()] = 0;
  });

  // 1. Process Batches for Expiry & Depletion
  for (const b of batches) {
    if (!b.product) continue;
    const p = b.product;
    const pId = p._id.toString();

    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: warningDays,
      expiryCriticalDays: criticalDays,
      timezone,
      referenceDate
    });

    // Count towards available stock only if active and not expired
    if (meta.isSaleable) {
      productStockMap[pId] = (productStockMap[pId] || 0) + b.currentQuantity;
    }

    // Determine if batch needs notification
    let alertType = null;
    let severity = 'info';
    let title = '';
    let message = '';
    let dedupKeySuffix = '';

    if (b.currentQuantity === 0) {
      // Depleted batch notification: notify once per batch depletion
      alertType = 'BATCH_DEPLETED';
      severity = 'info';
      title = `Batch Depleted: ${p.name}`;
      message = `Batch #${b.batchNumber || '—'} has 0 units remaining.`;
      dedupKeySuffix = 'DEPLETED';
    } else if (meta.status === 'EXPIRED') {
      alertType = 'EXPIRED';
      severity = 'danger';
      title = `Product Expired: ${p.name}`;
      message = `Batch #${b.batchNumber || '—'} (${b.currentQuantity} ${p.unit}s) expired on ${meta.expiryDateFormatted}. Remove from retail shelves immediately.`;
      dedupKeySuffix = `EXPIRED_${todayStr}`;
    } else if (meta.status === 'EXPIRING_TODAY') {
      alertType = 'EXPIRING_TODAY';
      severity = 'critical';
      title = `Expiring Today: ${p.name}`;
      message = `Batch #${b.batchNumber || '—'} (${b.currentQuantity} ${p.unit}s) expires today. Prioritize FEFO rotation or markdown immediately.`;
      dedupKeySuffix = `EXPIRING_TODAY_${todayStr}`;
    } else if (meta.status === 'CRITICAL') {
      alertType = 'EXPIRY_CRITICAL';
      severity = 'critical';
      title = `Critical Expiry (${meta.daysUntilExpiry}d left): ${p.name}`;
      message = `Batch #${b.batchNumber || '—'} (${b.currentQuantity} ${p.unit}s) expires in ${meta.daysUntilExpiry} days (${meta.expiryDateFormatted}). Shelve first.`;
      dedupKeySuffix = `CRITICAL_${todayStr}`;
    } else if (meta.status === 'EXPIRING_SOON') {
      alertType = 'EXPIRY_WARNING';
      severity = 'warning';
      title = `Expiry Warning (${meta.daysUntilExpiry}d left): ${p.name}`;
      message = `Batch #${b.batchNumber || '—'} (${b.currentQuantity} ${p.unit}s) expires in ${meta.daysUntilExpiry} days (${meta.expiryDateFormatted}).`;
      dedupKeySuffix = `WARNING_${todayStr}`;
    }

    // If an alert is triggered, notify all active recipients with deduplication
    if (alertType) {
      for (const recipient of activeRecipients) {
        const deduplicationKey = `${recipient._id}_${b._id}_${dedupKeySuffix}`;
        const res = await createNotification({
          userId: recipient._id,
          storeId: store._id,
          type: alertType,
          title,
          message,
          severity,
          relatedProduct: p._id,
          relatedBatch: b._id,
          deduplicationKey,
          sendEmail: true,
          emailDetails: {
            'Product': p.name,
            'Batch Number': b.batchNumber || 'Primary',
            'Quantity': `${b.currentQuantity} ${p.unit}s`,
            'Expiry Date': meta.expiryDateFormatted,
            'Time Remaining': meta.daysUntilExpiry < 0 ? 'Expired' : `${meta.daysUntilExpiry} days`
          }
        });

        if (res.created) notificationsCreated++;
        else duplicatesSkipped++;
      }
    }
  }

  // 2. Process Products for Low-Stock Threshold
  for (const p of products) {
    const pId = p._id.toString();
    const activeUnits = productStockMap[pId] !== undefined ? productStockMap[pId] : 0;
    const threshold = p.reorderPoint !== null && p.reorderPoint !== undefined
      ? p.reorderPoint
      : storeLowStockThreshold;

    if (activeUnits <= threshold) {
      for (const recipient of activeRecipients) {
        const deduplicationKey = `${recipient._id}_${pId}_LOW_STOCK_${todayStr}`;
        const res = await createNotification({
          userId: recipient._id,
          storeId: store._id,
          type: 'LOW_STOCK',
          title: `Low Stock Alert: ${p.name}`,
          message: `Only ${activeUnits} ${p.unit}s remaining in active stock (threshold: ${threshold}). Restock recommended.`,
          severity: 'warning',
          relatedProduct: p._id,
          relatedBatch: null,
          deduplicationKey,
          sendEmail: true,
          emailDetails: {
            'Product': p.name,
            'Current Stock': `${activeUnits} ${p.unit}s`,
            'Reorder Threshold': `${threshold} ${p.unit}s`,
            'Category': p.category
          }
        });

        if (res.created) notificationsCreated++;
        else duplicatesSkipped++;
      }
    }
  }

  return {
    checkedBatches: batches.length,
    checkedProducts: products.length,
    notificationsCreated,
    duplicatesSkipped,
    date: todayStr
  };
};

/**
 * Send Daily Digest emails and create digest in-app notification
 */
const dispatchDailyDigest = async (options = {}) => {
  const { referenceDate = new Date() } = options;

  const store = await Store.getStore();
  if (!store) return { success: false, message: 'Store not configured' };

  const storeSettings = store.notificationSettings || {};
  if (storeSettings.dailyDigestEnabled === false) {
    return { success: false, message: 'Daily digest is disabled in store settings' };
  }

  const timezone = store.timezone || 'Asia/Kolkata';
  const todayParts = getCalendarDateParts(referenceDate, timezone);
  const todayStr = todayParts.dateStr;

  // Gather batches & products to construct digest summary
  const batches = await InventoryBatch.find({ currentQuantity: { $gt: 0 } })
    .populate('product')
    .lean();

  const expiredItems = [];
  const criticalItems = [];
  const warningItems = [];

  batches.forEach((b) => {
    if (!b.product) return;
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: store.expiryWarningDays || 7,
      expiryCriticalDays: store.expiryCriticalDays || 3,
      timezone,
      referenceDate
    });

    const item = {
      productName: b.product.name,
      batchNumber: b.batchNumber,
      quantity: `${b.currentQuantity} ${b.product.unit || 'units'}`,
      expiryDate: meta.expiryDateFormatted,
      daysUntilExpiry: meta.daysUntilExpiry
    };

    if (meta.status === 'EXPIRED') expiredItems.push(item);
    else if (meta.status === 'EXPIRING_TODAY' || meta.status === 'CRITICAL') criticalItems.push(item);
    else if (meta.status === 'EXPIRING_SOON') warningItems.push(item);
  });

  // Low stock items
  const products = await Product.find({}).lean();
  const lowStockItems = [];
  for (const p of products) {
    const pBatches = batches.filter((b) => b.product?._id?.toString() === p._id.toString());
    const totalActive = pBatches.reduce((acc, b) => acc + b.currentQuantity, 0);
    const threshold = p.reorderPoint !== null && p.reorderPoint !== undefined ? p.reorderPoint : (store.lowStockThreshold || 5);
    if (totalActive <= threshold) {
      lowStockItems.push({
        productName: p.name,
        quantity: `${totalActive} ${p.unit || 'units'}`,
        threshold: `${threshold} units`
      });
    }
  }

  const activeRecipients = await User.find({ isActive: true }).lean();
  let digestsSent = 0;

  for (const recipient of activeRecipients) {
    const deduplicationKey = `${recipient._id}_DAILY_DIGEST_${todayStr}`;

    // Create in-app digest notification
    const res = await createNotification({
      userId: recipient._id,
      storeId: store._id,
      type: 'DAILY_DIGEST',
      title: `Daily Expiry Digest (${todayStr})`,
      message: `Digest summary: ${expiredItems.length} expired, ${criticalItems.length} critical, ${warningItems.length} expiring soon, and ${lowStockItems.length} low-stock items.`,
      severity: expiredItems.length > 0 || criticalItems.length > 0 ? 'critical' : 'info',
      deduplicationKey,
      sendEmail: false // Handled directly below
    });

    if (res.created) {
      // Send digest email if email is enabled
      const emailMaster = storeSettings.emailEnabled !== false;
      const userEmail = recipient.notificationPreferences?.emailEnabled !== false;

      if (emailMaster && userEmail) {
        await emailService.sendDailyDigestEmail({
          to: recipient.email,
          userName: recipient.fullName,
          storeName: store.storeName,
          dateStr: todayStr,
          expiredItems,
          criticalItems,
          warningItems,
          lowStockItems
        });
      }
      digestsSent++;
    }
  }

  return {
    success: true,
    digestsSent,
    date: todayStr,
    summary: {
      expiredCount: expiredItems.length,
      criticalCount: criticalItems.length,
      warningCount: warningItems.length,
      lowStockCount: lowStockItems.length
    }
  };
};

module.exports = {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationPreferences,
  updateUserNotificationPreferences,
  runExpiryAndInventoryChecks,
  dispatchDailyDigest
};
