/**
 * Expiry Date and Timezone Utilities for NearExpiry (Phase 6)
 * 
 * Provides centralized, timezone-aware date calculations and 6 explicit batch statuses:
 * - DEPLETED (0 units remaining, takes precedence)
 * - EXPIRED (past calendar day in store timezone)
 * - EXPIRING_TODAY (active on final calendar day in store timezone)
 * - CRITICAL (1 to expiryCriticalDays remaining)
 * - EXPIRING_SOON (critical+1 to expiryWarningDays remaining)
 * - FRESH (> expiryWarningDays remaining)
 */

/**
 * Get calendar date parts formatted in the store's IANA timezone
 * @param {Date|string} date 
 * @param {string} timezone e.g. 'Asia/Kolkata'
 * @returns {{ dateStr: string, year: number, month: number, day: number }}
 */
const getCalendarDateParts = (date = new Date(), timezone = 'Asia/Kolkata') => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const dateStr = formatter.format(new Date(date));
    const [year, month, day] = dateStr.split('-').map(Number);
    return { dateStr, year, month, day };
  } catch (err) {
    // Fallback to UTC if timezone is invalid
    const d = new Date(date);
    const dateStr = d.toISOString().slice(0, 10);
    const [year, month, day] = dateStr.split('-').map(Number);
    return { dateStr, year, month, day };
  }
};

/**
 * Difference in whole calendar days between two dates in a timezone
 * @param {Date|string} expiryDate 
 * @param {Date|string} referenceDate (defaults to now)
 * @param {string} timezone 
 * @returns {number}
 */
const getDaysUntilExpiry = (expiryDate, referenceDate = new Date(), timezone = 'Asia/Kolkata') => {
  const expParts = getCalendarDateParts(expiryDate, timezone);
  const refParts = getCalendarDateParts(referenceDate, timezone);

  const utcExp = Date.UTC(expParts.year, expParts.month - 1, expParts.day);
  const utcRef = Date.UTC(refParts.year, refParts.month - 1, refParts.day);
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.round((utcExp - utcRef) / msPerDay);
};

/**
 * Classify a batch into one of 6 explicit statuses with risk assessment
 * 
 * @param {object} batch - { expiryDate, currentQuantity, purchasePrice, sellingPrice }
 * @param {object} [options] - { expiryWarningDays = 7, expiryCriticalDays = 3, timezone = 'Asia/Kolkata', referenceDate = new Date() }
 */
const calculateBatchExpiryStatus = (batch, options = {}) => {
  const {
    expiryWarningDays = 7,
    expiryCriticalDays = 3,
    timezone = 'Asia/Kolkata',
    referenceDate = new Date()
  } = options;

  const currentQuantity = Number(batch.currentQuantity !== undefined ? batch.currentQuantity : 0);
  const purchasePrice = Number(batch.purchasePrice || 0);
  const sellingPrice = batch.sellingPrice !== undefined && batch.sellingPrice !== null ? Number(batch.sellingPrice) : null;

  const daysUntilExpiry = getDaysUntilExpiry(batch.expiryDate, referenceDate, timezone);
  const expParts = getCalendarDateParts(batch.expiryDate, timezone);

  let status = 'FRESH';
  let riskLevel = 'LOW';
  let riskReason = '';

  // 1. Depleted batches (0 quantity) take precedence
  if (currentQuantity === 0) {
    status = 'DEPLETED';
    riskLevel = 'LOW';
    riskReason = 'Batch is depleted (0 units remaining). No active expiry risk.';
  }
  // 2. Expired: past calendar day
  else if (daysUntilExpiry < 0) {
    status = 'EXPIRED';
    riskLevel = 'HIGH';
    const pastDays = Math.abs(daysUntilExpiry);
    riskReason = pastDays === 1
      ? 'Expired yesterday. Remove from sales shelves immediately.'
      : `Expired ${pastDays} days ago. Remove from sales shelves immediately.`;
  }
  // 3. Expiring Today: active on final day
  else if (daysUntilExpiry === 0) {
    status = 'EXPIRING_TODAY';
    riskLevel = 'HIGH';
    riskReason = 'Expires today! Prioritize selling or offer promotional discount immediately.';
  }
  // 4. Critical: within critical window
  else if (daysUntilExpiry <= expiryCriticalDays) {
    status = 'CRITICAL';
    riskLevel = 'HIGH';
    riskReason = daysUntilExpiry === 1
      ? 'Expires tomorrow! Urgent FEFO priority required.'
      : `Expires in ${daysUntilExpiry} days (within ${expiryCriticalDays}-day critical window). Prioritize dispatch.`;
  }
  // 5. Expiring Soon: within warning window
  else if (daysUntilExpiry <= expiryWarningDays) {
    status = 'EXPIRING_SOON';
    riskLevel = 'MEDIUM';
    riskReason = `Expires in ${daysUntilExpiry} days (within ${expiryWarningDays}-day warning window). Monitor stock level.`;
  }
  // 6. Fresh: beyond warning window
  else {
    status = 'FRESH';
    riskLevel = 'LOW';
    riskReason = `Stock is fresh (${daysUntilExpiry} days until expiration). Safe for regular storage.`;
  }

  const isSaleable = currentQuantity > 0 && status !== 'EXPIRED' && status !== 'DEPLETED' && !batch.isQuarantined;
  const purchaseValueAtRisk = Number((currentQuantity * purchasePrice).toFixed(2));
  const potentialRevenueAtRisk = sellingPrice !== null ? Number((currentQuantity * sellingPrice).toFixed(2)) : null;

  // Legacy compatibility mapping
  const isExpired = status === 'EXPIRED';
  const isExpiringToday = status === 'EXPIRING_TODAY';
  const isExpiringSoon = status === 'CRITICAL' || status === 'EXPIRING_SOON' || status === 'EXPIRING_TODAY';
  const batchStatus = status === 'EXPIRING_TODAY'
    ? 'expiringToday'
    : (status === 'CRITICAL' || status === 'EXPIRING_SOON')
      ? 'expiringSoon'
      : status.toLowerCase();

  return {
    status,
    daysUntilExpiry,
    isSaleable,
    riskLevel,
    riskReason,
    purchaseValueAtRisk,
    potentialRevenueAtRisk,
    expiryDateFormatted: expParts.dateStr,
    // Legacy fields for backward compatibility
    isExpired,
    isExpiringToday,
    isExpiringSoon,
    batchStatus
  };
};

/**
 * Backward compatibility helper for legacy inventory callers
 */
const computeBatchStatus = (expiryDate, currentQuantity = 0, options = {}) => {
  return calculateBatchExpiryStatus({ expiryDate, currentQuantity }, options);
};

const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const getSevenDaysLater = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 59, 999);
  return d;
};

module.exports = {
  getCalendarDateParts,
  getDaysUntilExpiry,
  calculateBatchExpiryStatus,
  computeBatchStatus,
  getStartOfToday,
  getEndOfToday,
  getSevenDaysLater
};
