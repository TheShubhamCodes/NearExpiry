const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const {
  notificationQuerySchema,
  updateNotificationPreferencesSchema
} = require('../utils/validators');

/**
 * List paginated notifications for current user
 */
const getNotifications = async (req, res, next) => {
  try {
    const validated = notificationQuerySchema.parse(req.query);
    const result = await notificationService.getUserNotifications(req.user._id, validated);
    return res.status(200).json({
      success: true,
      data: result.notifications,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current unread notification count
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadCount(req.user._id);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a single notification as read
 */
const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read for current user
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllAsRead(req.user._id);
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete / dismiss a notification
 */
const deleteNotification = async (req, res, next) => {
  try {
    const result = await notificationService.deleteNotification(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get notification preferences (User + Store settings)
 */
const getPreferences = async (req, res, next) => {
  try {
    const preferences = await notificationService.getNotificationPreferences(req.user._id);
    return res.status(200).json({
      success: true,
      data: preferences
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user's notification preferences
 */
const updatePreferences = async (req, res, next) => {
  try {
    const validated = updateNotificationPreferencesSchema.parse(req.body);
    const result = await notificationService.updateUserNotificationPreferences(req.user._id, validated);
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.preferences
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger manual background check on-demand
 */
const triggerCheck = async (req, res, next) => {
  try {
    const result = await notificationService.runExpiryAndInventoryChecks();
    return res.status(200).json({
      success: true,
      message: 'Expiry and inventory check completed',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send test alert email (Owner only)
 */
const sendTestEmail = async (req, res, next) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only the store owner can send test email alerts.'
      });
    }

    const result = await emailService.sendAlertEmail({
      to: req.user.email,
      subject: '[NearExpiry Test] Email Notification Delivery Verification',
      title: 'NearExpiry Email Integration Test',
      message: 'This is a test notification confirming that Resend email delivery is properly configured for your NearExpiry store.',
      severity: 'info',
      details: {
        'Recipient': req.user.fullName,
        'Email': req.user.email,
        'Timestamp': new Date().toISOString(),
        'Status': 'Resend Active'
      }
    });

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? `Test email sent to ${req.user.email}`
        : result.skipped
          ? 'Resend API key not configured; email skipped.'
          : `Failed to deliver test email: ${result.error}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  triggerCheck,
  sendTestEmail
};

