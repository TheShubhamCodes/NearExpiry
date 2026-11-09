const mongoose = require('mongoose');
const InventoryBatch = require('../models/InventoryBatch');
const Product = require('../models/Product');
const Store = require('../models/Store');
const {
  getCalendarDateParts,
  getDaysUntilExpiry,
  calculateBatchExpiryStatus
} = require('../utils/expiryUtils');

/**
 * Fetch the active store settings or return sensible defaults
 */
const getStoreSettings = async () => {
  const store = await Store.getStore();
  return {
    storeName: store?.storeName || 'NearExpiry Store',
    currency: store?.currency || 'USD ($)',
    expiryWarningDays: store?.expiryWarningDays !== undefined ? store.expiryWarningDays : 7,
    expiryCriticalDays: store?.expiryCriticalDays !== undefined ? store.expiryCriticalDays : 3,
    lowStockThreshold: store?.lowStockThreshold !== undefined ? store.lowStockThreshold : 5,
    timezone: store?.timezone || 'Asia/Kolkata'
  };
};

/**
 * Get comprehensive Expiry Dashboard Summary
 */
const getExpirySummary = async (options = {}) => {
  const settings = await getStoreSettings();
  const timezone = options.timezone || settings.timezone;
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();

  const batches = await InventoryBatch.find({})
    .populate('product', 'name brand barcode category unit imageUrl')
    .lean();

  let expiredBatches = 0;
  let expiredUnits = 0;
  let expiredCostLoss = 0;

  let expiringTodayBatches = 0;
  let expiringTodayUnits = 0;
  let expiringTodayValueAtRisk = 0;

  let criticalBatches = 0;
  let criticalUnits = 0;
  let criticalValueAtRisk = 0;

  let expiringSoonBatches = 0;
  let expiringSoonUnits = 0;
  let expiringSoonValueAtRisk = 0;

  let freshBatches = 0;
  let freshUnits = 0;

  let depletedBatches = 0;
  let totalActiveBatches = 0;
  let totalActiveUnits = 0;

  batches.forEach((b) => {
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone,
      referenceDate
    });

    const qty = b.currentQuantity;
    const cost = Number(((b.purchasePrice || 0) * qty).toFixed(2));

    if (meta.status === 'DEPLETED') {
      depletedBatches++;
    } else if (meta.status === 'EXPIRED') {
      expiredBatches++;
      expiredUnits += qty;
      expiredCostLoss += cost;
    } else if (meta.status === 'EXPIRING_TODAY') {
      expiringTodayBatches++;
      expiringTodayUnits += qty;
      expiringTodayValueAtRisk += cost;
      totalActiveBatches++;
      totalActiveUnits += qty;
    } else if (meta.status === 'CRITICAL') {
      criticalBatches++;
      criticalUnits += qty;
      criticalValueAtRisk += cost;
      totalActiveBatches++;
      totalActiveUnits += qty;
    } else if (meta.status === 'EXPIRING_SOON') {
      expiringSoonBatches++;
      expiringSoonUnits += qty;
      expiringSoonValueAtRisk += cost;
      totalActiveBatches++;
      totalActiveUnits += qty;
    } else if (meta.status === 'FRESH') {
      freshBatches++;
      freshUnits += qty;
      totalActiveBatches++;
      totalActiveUnits += qty;
    }
  });

  const totalValueAtRisk = Number(
    (expiringTodayValueAtRisk + criticalValueAtRisk + expiringSoonValueAtRisk).toFixed(2)
  );

  return {
    expiredBatches,
    expiredUnits,
    expiredCostLoss: Number(expiredCostLoss.toFixed(2)),

    expiringTodayBatches,
    expiringTodayUnits,
    expiringTodayValueAtRisk: Number(expiringTodayValueAtRisk.toFixed(2)),

    criticalBatches,
    criticalUnits,
    criticalValueAtRisk: Number(criticalValueAtRisk.toFixed(2)),

    expiringSoonBatches,
    expiringSoonUnits,
    expiringSoonValueAtRisk: Number(expiringSoonValueAtRisk.toFixed(2)),

    freshBatches,
    freshUnits,

    depletedBatches,
    totalActiveBatches,
    totalActiveUnits,
    totalBatches: batches.length,

    totalValueAtRisk,
    storeSettings: settings
  };
};

/**
 * Filter, sort, and paginate batches with live expiry metadata
 */
const getExpiryBatches = async (query = {}) => {
  const settings = await getStoreSettings();
  const timezone = settings.timezone;
  const referenceDate = new Date();

  const {
    search = '',
    category = '',
    status = 'ALL',
    dateFrom = '',
    dateTo = '',
    sortBy = 'expiryDate',
    sortOrder = 'asc',
    page = 1,
    limit = 10
  } = query;

  // Build Mongo query for batches
  const batchFilter = {};

  if (dateFrom || dateTo) {
    batchFilter.expiryDate = {};
    if (dateFrom) {
      const fromParts = dateFrom.split('-').map(Number);
      batchFilter.expiryDate.$gte = new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2], 0, 0, 0, 0));
    }
    if (dateTo) {
      const toParts = dateTo.split('-').map(Number);
      batchFilter.expiryDate.$lte = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2], 23, 59, 59, 999));
    }
  }

  // Fetch batches and populate product
  let batches = await InventoryBatch.find(batchFilter)
    .populate('product', 'name brand barcode category unit imageUrl')
    .sort({ expiryDate: 1, receivedDate: 1, _id: 1 })
    .lean();

  // Annotate all batches with dynamic expiry calculation
  let enriched = batches.map((b) => {
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone,
      referenceDate
    });

    return {
      ...b,
      ...meta
    };
  });

  // Filter in memory: search keyword (batch number, product name, brand, barcode)
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    enriched = enriched.filter((b) => {
      const bNum = (b.batchNumber || '').toLowerCase();
      const pName = (b.product?.name || '').toLowerCase();
      const pBrand = (b.product?.brand || '').toLowerCase();
      const pBarcode = (b.product?.barcode || '').toLowerCase();
      return bNum.includes(s) || pName.includes(s) || pBrand.includes(s) || pBarcode.includes(s);
    });
  }

  // Filter by product category
  if (category && category !== 'ALL') {
    enriched = enriched.filter((b) => b.product?.category === category);
  }

  // Filter by computed status
  if (status && status !== 'ALL') {
    enriched = enriched.filter((b) => b.status === status);
  }

  // Sorting
  const orderMultiplier = sortOrder === 'desc' ? -1 : 1;
  enriched.sort((a, b) => {
    let valA, valB;
    if (sortBy === 'daysUntilExpiry') {
      valA = a.daysUntilExpiry;
      valB = b.daysUntilExpiry;
    } else if (sortBy === 'currentQuantity') {
      valA = a.currentQuantity;
      valB = b.currentQuantity;
    } else if (sortBy === 'purchasePrice') {
      valA = a.purchasePrice || 0;
      valB = b.purchasePrice || 0;
    } else if (sortBy === 'purchaseValueAtRisk') {
      valA = a.purchaseValueAtRisk || 0;
      valB = b.purchaseValueAtRisk || 0;
    } else if (sortBy === 'createdAt') {
      valA = new Date(a.createdAt).getTime();
      valB = new Date(b.createdAt).getTime();
    } else {
      // Default: expiryDate
      valA = new Date(a.expiryDate).getTime();
      valB = new Date(b.expiryDate).getTime();
    }

    if (valA < valB) return -1 * orderMultiplier;
    if (valA > valB) return 1 * orderMultiplier;
    return 0;
  });

  // Pagination
  const totalBatches = enriched.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const totalPages = Math.ceil(totalBatches / limitNum) || 1;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = enriched.slice(startIndex, startIndex + limitNum);

  return {
    batches: paginated,
    pagination: {
      totalBatches,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    },
    storeSettings: settings
  };
};

/**
 * FEFO (First Expired, First Out) Recommendation Engine
 * Groups eligible saleable stock by product, orders by earliest expiryDate,
 * and designates the #1 Pick First batch with clear plain-language rationale.
 */
const getFEFORecommendations = async () => {
  const settings = await getStoreSettings();
  const timezone = settings.timezone;
  const referenceDate = new Date();

  // Find all batches with currentQuantity > 0
  const batches = await InventoryBatch.find({ currentQuantity: { $gt: 0 } })
    .populate('product', 'name brand barcode category unit imageUrl')
    .sort({ expiryDate: 1, receivedDate: 1, _id: 1 })
    .lean();

  // Group by product
  const productGroups = {};

  batches.forEach((b) => {
    if (!b.product) return;
    const pId = b.product._id.toString();

    if (!productGroups[pId]) {
      productGroups[pId] = {
        product: b.product,
        batches: [],
        expiredBatches: []
      };
    }

    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone,
      referenceDate
    });

    const enrichedBatch = {
      ...b,
      ...meta
    };

    if (meta.status === 'EXPIRED') {
      productGroups[pId].expiredBatches.push(enrichedBatch);
    } else {
      productGroups[pId].batches.push(enrichedBatch);
    }
  });

  const recommendations = [];

  for (const pId in productGroups) {
    const group = productGroups[pId];
    const saleableBatches = group.batches;

    // Stable FEFO sorting:
    // 1. expiryDate ascending
    // 2. receivedDate ascending
    // 3. _id ascending
    saleableBatches.sort((a, b) => {
      const expA = new Date(a.expiryDate).getTime();
      const expB = new Date(b.expiryDate).getTime();
      if (expA !== expB) return expA - expB;

      const recA = new Date(a.receivedDate || a.createdAt).getTime();
      const recB = new Date(b.receivedDate || b.createdAt).getTime();
      if (recA !== recB) return recA - recB;

      return a._id.toString().localeCompare(b._id.toString());
    });

    if (saleableBatches.length === 0 && group.expiredBatches.length === 0) {
      continue;
    }

    let totalSaleableUnits = 0;
    const rankedBatches = saleableBatches.map((b, idx) => {
      totalSaleableUnits += b.currentQuantity;
      const isFirst = idx === 0;

      let fefoRecommendation = '';
      if (isFirst) {
        if (b.status === 'EXPIRING_TODAY') {
          fefoRecommendation = `CRITICAL FEFO PICK: Batch #${b.batchNumber || 'Primary'} expires TODAY. Sell this batch immediately before any other stock.`;
        } else if (b.status === 'CRITICAL') {
          fefoRecommendation = `URGENT FEFO PICK: Batch #${b.batchNumber || 'Primary'} expires in ${b.daysUntilExpiry} days (${b.expiryDateFormatted}). Prioritize on front shelves now.`;
        } else if (b.status === 'EXPIRING_SOON') {
          fefoRecommendation = `FEFO PICK: Batch #${b.batchNumber || 'Primary'} expires soonest on ${b.expiryDateFormatted} (${b.daysUntilExpiry} days). Dispatch first before newer batches.`;
        } else {
          fefoRecommendation = `FEFO PICK: Batch #${b.batchNumber || 'Primary'} has the earliest expiry date (${b.expiryDateFormatted}). Shelve first according to FEFO principles.`;
        }
      } else {
        const first = saleableBatches[0];
        fefoRecommendation = `HOLD IN QUEUE: Keep behind Batch #${first.batchNumber || '1'}. Dispatch after #${first.batchNumber || '1'} is fully depleted.`;
      }

      return {
        ...b,
        fefoRank: idx + 1,
        isFefoPick: isFirst,
        fefoBadge: isFirst ? '#1 Pick First' : `Queue #${idx + 1}`,
        fefoRecommendation
      };
    });

    recommendations.push({
      product: group.product,
      totalSaleableUnits,
      saleableBatchesCount: saleableBatches.length,
      expiredBatchesCount: group.expiredBatches.length,
      expiredUnits: group.expiredBatches.reduce((acc, b) => acc + b.currentQuantity, 0),
      expiredBatches: group.expiredBatches,
      batches: rankedBatches,
      fefoPickBatch: rankedBatches[0] || null,
      earliestExpiryDate: rankedBatches[0]?.expiryDateFormatted || null,
      earliestDaysUntilExpiry: rankedBatches[0]?.daysUntilExpiry !== undefined ? rankedBatches[0].daysUntilExpiry : null
    });
  }

  // Sort recommendation cards: most urgent product (lowest earliestDaysUntilExpiry) first
  recommendations.sort((a, b) => {
    if (a.earliestDaysUntilExpiry === null) return 1;
    if (b.earliestDaysUntilExpiry === null) return -1;
    return a.earliestDaysUntilExpiry - b.earliestDaysUntilExpiry;
  });

  return {
    recommendations,
    totalProducts: recommendations.length,
    storeSettings: settings
  };
};

/**
 * Monthly Expiry Calendar Data
 * Aggregates batches expiring by calendar day (YYYY-MM-DD) for a requested month.
 */
const getExpiryCalendarData = async ({ month, year } = {}) => {
  const settings = await getStoreSettings();
  const timezone = settings.timezone;
  const now = new Date();
  const todayParts = getCalendarDateParts(now, timezone);

  const selectedYear = year ? parseInt(year, 10) : todayParts.year;
  const selectedMonth = month ? parseInt(month, 10) : todayParts.month;

  // Format month string YYYY-MM
  const monthString = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Calculate start and end UTC timestamps safely covering the month in any timezone
  const startMonthUtc = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0));
  const endMonthUtc = new Date(Date.UTC(selectedYear, selectedMonth, 0, 23, 59, 59, 999));

  // Query batches expiring in this month window
  const batches = await InventoryBatch.find({
    expiryDate: { $gte: startMonthUtc, $lte: endMonthUtc }
  })
    .populate('product', 'name brand barcode category unit imageUrl')
    .sort({ expiryDate: 1 })
    .lean();

  // Days in month
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const calendarDays = {};

  // Initialize empty day slots
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarDays[dayStr] = {
      date: dayStr,
      dayNumber: d,
      totalBatches: 0,
      totalUnits: 0,
      highestRisk: 'FRESH',
      batches: []
    };
  }

  const riskOrder = {
    EXPIRED: 5,
    EXPIRING_TODAY: 4,
    CRITICAL: 3,
    EXPIRING_SOON: 2,
    FRESH: 1,
    DEPLETED: 0
  };

  batches.forEach((b) => {
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone,
      referenceDate: now
    });

    const dayKey = meta.expiryDateFormatted;
    if (calendarDays[dayKey]) {
      calendarDays[dayKey].totalBatches++;
      calendarDays[dayKey].totalUnits += b.currentQuantity;
      calendarDays[dayKey].batches.push({
        _id: b._id,
        batchNumber: b.batchNumber,
        productName: b.product?.name || 'Unknown Product',
        productCategory: b.product?.category || 'General',
        productUnit: b.product?.unit || 'piece',
        currentQuantity: b.currentQuantity,
        purchasePrice: b.purchasePrice,
        status: meta.status,
        riskLevel: meta.riskLevel,
        daysUntilExpiry: meta.daysUntilExpiry
      });

      // Update highest risk for the day
      const currentHighest = calendarDays[dayKey].highestRisk;
      if (riskOrder[meta.status] > (riskOrder[currentHighest] || 0)) {
        calendarDays[dayKey].highestRisk = meta.status;
      }
    }
  });

  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(selectedYear, selectedMonth - 1, 1));

  return {
    year: selectedYear,
    month: selectedMonth,
    monthString,
    monthName,
    daysInMonth,
    calendarDays,
    today: todayParts.dateStr,
    storeSettings: settings
  };
};

/**
 * Deterministic Expiry Risk Assessment
 * Groups inventory by risk tier (High, Medium, Low, Expired) with financial exposure
 */
const getExpiryRiskAssessment = async () => {
  const settings = await getStoreSettings();
  const timezone = settings.timezone;
  const referenceDate = new Date();

  const batches = await InventoryBatch.find({ currentQuantity: { $gt: 0 } })
    .populate('product', 'name brand barcode category unit imageUrl')
    .lean();

  const highRisk = [];
  const mediumRisk = [];
  const lowRisk = [];
  const expired = [];

  batches.forEach((b) => {
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone,
      referenceDate
    });

    const item = {
      ...b,
      ...meta
    };

    if (meta.status === 'EXPIRED') {
      expired.push(item);
    } else if (meta.status === 'EXPIRING_TODAY' || meta.status === 'CRITICAL') {
      highRisk.push(item);
    } else if (meta.status === 'EXPIRING_SOON') {
      mediumRisk.push(item);
    } else if (meta.status === 'FRESH') {
      lowRisk.push(item);
    }
  });

  // Calculate aggregations
  const sumUnits = (list) => list.reduce((acc, b) => acc + b.currentQuantity, 0);
  const sumValue = (list) =>
    Number(list.reduce((acc, b) => acc + (b.purchaseValueAtRisk || 0), 0).toFixed(2));

  // Sort batches by urgency: earliest days until expiry first
  const sortByUrgency = (a, b) => a.daysUntilExpiry - b.daysUntilExpiry;
  expired.sort(sortByUrgency);
  highRisk.sort(sortByUrgency);
  mediumRisk.sort(sortByUrgency);
  lowRisk.sort(sortByUrgency);

  return {
    summary: {
      expiredCount: expired.length,
      expiredUnits: sumUnits(expired),
      expiredCostLoss: sumValue(expired),

      highRiskCount: highRisk.length,
      highRiskUnits: sumUnits(highRisk),
      highRiskValue: sumValue(highRisk),

      mediumRiskCount: mediumRisk.length,
      mediumRiskUnits: sumUnits(mediumRisk),
      mediumRiskValue: sumValue(mediumRisk),

      lowRiskCount: lowRisk.length,
      lowRiskUnits: sumUnits(lowRisk),
      lowRiskValue: sumValue(lowRisk)
    },
    expired,
    highRisk,
    mediumRisk,
    lowRisk,
    storeSettings: settings
  };
};

module.exports = {
  getStoreSettings,
  getExpirySummary,
  getExpiryBatches,
  getFEFORecommendations,
  getExpiryCalendarData,
  getExpiryRiskAssessment
};

