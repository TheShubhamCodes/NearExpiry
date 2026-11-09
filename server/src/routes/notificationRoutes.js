const express = require('express');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  triggerCheck,
  sendTestEmail
} = require('../controllers/notificationController');
const { authenticate, requireOwner } = require('../middleware/authMiddleware');

const router = express.Router();

// All notification routes require active authentication
router.use(authenticate);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/mark-all-read', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

// Notification preferences
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

// Manual trigger check & test email
router.post('/trigger-check', triggerCheck);
router.post('/test-email', requireOwner, sendTestEmail);

module.exports = router;

