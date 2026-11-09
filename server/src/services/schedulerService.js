const cron = require('node-cron');
const notificationService = require('./notificationService');
const Store = require('../models/Store');
const { getCalendarDateParts } = require('../utils/expiryUtils');

let expiryCheckJob = null;
let digestCheckJob = null;
let startupCheckTimer = null;
let isCheckRunning = false;

/**
 * Start background scheduler for automatic expiry checks and daily digests
 */
const startScheduler = () => {
  // If already started, do not duplicate
  if (expiryCheckJob) {
    return;
  }

  console.log('[Scheduler] Initializing NearExpiry automated background scheduler...');

  // 1. Expiry & Low-Stock Check Job: Runs every hour at minute 0 (0 * * * *)
  // Safe, non-blocking, and deduplication prevents duplicate notifications on the same day
  expiryCheckJob = cron.schedule('0 * * * *', async () => {
    if (isCheckRunning) {
      console.log('[Scheduler] Expiry check already in progress, skipping overlapping run.');
      return;
    }

    isCheckRunning = true;
    try {
      console.log('[Scheduler] Running hourly expiry and inventory check...');
      const result = await notificationService.runExpiryAndInventoryChecks();
      console.log(`[Scheduler] Check complete: ${result.notificationsCreated} new alerts, ${result.duplicatesSkipped} duplicates skipped.`);
    } catch (err) {
      console.error('[Scheduler Error] Expiry check failed:', err.message);
    } finally {
      isCheckRunning = false;
    }
  });

  // 2. Daily Digest Job: Runs every 15 minutes to check if store's local time matches dailyDigestTime
  // Once sent, daily deduplication key ensures it only sends once per day
  digestCheckJob = cron.schedule('*/15 * * * *', async () => {
    try {
      const store = await Store.getStore();
      if (!store || !store.notificationSettings?.dailyDigestEnabled) {
        return;
      }

      const timezone = store.timezone || 'Asia/Kolkata';
      const nowParts = getCalendarDateParts(new Date(), timezone);
      
      // Target digest time (default: '08:00')
      const targetTime = store.notificationSettings.dailyDigestTime || '08:00';
      const [targetHour, targetMin] = targetTime.split(':').map(Number);

      // Get current local hour and minute
      const currentHour = new Date(new Date().toLocaleString('en-US', { timeZone: timezone })).getHours();
      const currentMin = new Date(new Date().toLocaleString('en-US', { timeZone: timezone })).getMinutes();

      // If current hour matches target hour and within 15-minute window
      if (currentHour === targetHour && Math.abs(currentMin - targetMin) < 15) {
        console.log(`[Scheduler] Triggering Daily Digest for store at local time ${targetTime} (${timezone})...`);
        const digestRes = await notificationService.dispatchDailyDigest();
        if (digestRes.success) {
          console.log(`[Scheduler] Daily digest completed: ${digestRes.digestsSent} recipient(s) notified.`);
        }
      }
    } catch (err) {
      console.error('[Scheduler Error] Daily digest check failed:', err.message);
    }
  });

  // 3. Initial startup check with 5-second delay to ensure database is connected
  startupCheckTimer = setTimeout(async () => {
    try {
      console.log('[Scheduler] Running initial startup expiry check...');
      await notificationService.runExpiryAndInventoryChecks();
    } catch (e) {
      console.log('[Scheduler] Initial check skipped (DB may still be initializing or store empty).');
    }
  }, 5000);
  if (typeof startupCheckTimer.unref === 'function') {
    startupCheckTimer.unref();
  }

  console.log('[Scheduler] Background jobs active.');
};

/**
 * Stop background scheduler (for testing or clean server shutdown)
 */
const stopScheduler = () => {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer);
    startupCheckTimer = null;
  }
  if (expiryCheckJob) {
    expiryCheckJob.stop();
    expiryCheckJob = null;
  }
  if (digestCheckJob) {
    digestCheckJob.stop();
    digestCheckJob = null;
  }
  console.log('[Scheduler] Background jobs stopped.');
};

module.exports = {
  startScheduler,
  stopScheduler
};

