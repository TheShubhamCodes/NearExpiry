const mongoose = require('mongoose');
const InventoryBatch = require('../models/InventoryBatch');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StockMovement = require('../models/StockMovement');
const Markdown = require('../models/Markdown');
const SupplierReturn = require('../models/SupplierReturn');
const StockDisposition = require('../models/StockDisposition');
const {
  getCalendarDateParts,
  getDaysUntilExpiry,
  calculateBatchExpiryStatus
} = require('../utils/expiryUtils');

/**
 * Helper to fetch store settings and defaults
 */
const getStoreSettings = async () => {
  const store = await Store.getStore();
  return {
    storeId: store?._id,
    storeName: store?.storeName || 'NearExpiry Store',
    currency: store?.currency || 'USD ($)',
    expiryWarningDays: store?.expiryWarningDays !== undefined ? store.expiryWarningDays : 7,
    expiryCriticalDays: store?.expiryCriticalDays !== undefined ? store.expiryCriticalDays : 3,
    lowStockThreshold: store?.lowStockThreshold !== undefined ? store.lowStockThreshold : 5,
    timezone: store?.timezone || 'Asia/Kolkata',
    markdownRules: store?.markdownRules || {
      warningDiscountPercent: 15,
      criticalDiscountPercent: 30,
      todayDiscountPercent: 50,
      autoSuggestEnabled: true
    }
  };
};

/**
 * Pure timezone date constructor matching given calendar parts in a specific IANA timezone
 */
const getTzDate = (dateStr, timeStr = '00:00:00.000', timeZone = 'Asia/Kolkata') => {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, min, sec] = timeStr.split(':').map(Number);

    let guess = Date.UTC(year, month - 1, day, hour, min, sec || 0);
    for (let i = 0; i < 3; i++) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });
      const parts = {};
      formatter.formatToParts(new Date(guess)).forEach((p) => {
        parts[p.type] = p.value;
      });
      const gHour = parts.hour === '24' ? 0 : Number(parts.hour);
      const diff =
        Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day),
          gHour,
          Number(parts.minute),
          Number(parts.second)
        ) - Date.UTC(year, month - 1, day, hour, min, sec || 0);

      guess -= diff;
      if (diff === 0) break;
    }
    return new Date(guess);
  } catch (err) {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
};

/**
 * Calculate exact date ranges and equivalent previous period for comparison
 */
const getDateRangeAndComparison = (period = '30days', customStart = null, customEnd = null, timezone = 'Asia/Kolkata') => {
  const now = new Date();
  const todayParts = getCalendarDateParts(now, timezone);
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${todayParts.year}-${pad(todayParts.month)}-${pad(todayParts.day)}`;

  let currentStart;
  let currentEnd;
  let previousStart;
  let previousEnd;
  let periodLabel = 'Last 30 Days';

  if (period === 'today') {
    periodLabel = 'Today';
    currentStart = getTzDate(todayStr, '00:00:00.000', timezone);
    currentEnd = getTzDate(todayStr, '23:59:59.999', timezone);

    // Yesterday
    const yestDate = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
    const yestParts = getCalendarDateParts(yestDate, timezone);
    const yestStr = `${yestParts.year}-${pad(yestParts.month)}-${pad(yestParts.day)}`;
    previousStart = getTzDate(yestStr, '00:00:00.000', timezone);
    previousEnd = getTzDate(yestStr, '23:59:59.999', timezone);
  } else if (period === '7days') {
    periodLabel = 'Last 7 Days';
    const day7Ago = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const d7Parts = getCalendarDateParts(day7Ago, timezone);
    const d7Str = `${d7Parts.year}-${pad(d7Parts.month)}-${pad(d7Parts.day)}`;

    currentStart = getTzDate(d7Str, '00:00:00.000', timezone);
    currentEnd = getTzDate(todayStr, '23:59:59.999', timezone);

    const prevSpan = currentEnd.getTime() - currentStart.getTime();
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = new Date(previousEnd.getTime() - prevSpan);
  } else if (period === 'thisMonth') {
    periodLabel = 'This Month';
    const firstDayStr = `${todayParts.year}-${pad(todayParts.month)}-01`;
    currentStart = getTzDate(firstDayStr, '00:00:00.000', timezone);
    currentEnd = getTzDate(todayStr, '23:59:59.999', timezone);

    // Previous month equivalent
    let pMonth = todayParts.month - 1;
    let pYear = todayParts.year;
    if (pMonth < 1) {
      pMonth = 12;
      pYear -= 1;
    }
    const prevFirstStr = `${pYear}-${pad(pMonth)}-01`;
    const lastDayOfPrevMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
    const prevEndDay = Math.min(todayParts.day, lastDayOfPrevMonth);
    const prevEndStr = `${pYear}-${pad(pMonth)}-${pad(prevEndDay)}`;

    previousStart = getTzDate(prevFirstStr, '00:00:00.000', timezone);
    previousEnd = getTzDate(prevEndStr, '23:59:59.999', timezone);
  } else if (period === 'lastMonth') {
    periodLabel = 'Last Month';
    let pMonth = todayParts.month - 1;
    let pYear = todayParts.year;
    if (pMonth < 1) {
      pMonth = 12;
      pYear -= 1;
    }
    const daysInLastMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
    const pFirstStr = `${pYear}-${pad(pMonth)}-01`;
    const pLastStr = `${pYear}-${pad(pMonth)}-${pad(daysInLastMonth)}`;

    currentStart = getTzDate(pFirstStr, '00:00:00.000', timezone);
    currentEnd = getTzDate(pLastStr, '23:59:59.999', timezone);

    let ppMonth = pMonth - 1;
    let ppYear = pYear;
    if (ppMonth < 1) {
      ppMonth = 12;
      ppYear -= 1;
    }
    const daysInPPLastMonth = new Date(Date.UTC(ppYear, ppMonth, 0)).getUTCDate();
    const ppFirstStr = `${ppYear}-${pad(ppMonth)}-01`;
    const ppLastStr = `${ppYear}-${pad(ppMonth)}-${pad(daysInPPLastMonth)}`;

    previousStart = getTzDate(ppFirstStr, '00:00:00.000', timezone);
    previousEnd = getTzDate(ppLastStr, '23:59:59.999', timezone);
  } else if (period === 'custom' && customStart && customEnd) {
    periodLabel = 'Custom Range';
    const sDate = customStart.slice(0, 10);
    const eDate = customEnd.slice(0, 10);
    currentStart = getTzDate(sDate, '00:00:00.000', timezone);
    currentEnd = getTzDate(eDate, '23:59:59.999', timezone);

    const span = currentEnd.getTime() - currentStart.getTime();
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = new Date(previousEnd.getTime() - span);
  } else {
    // Default: '30days'
    periodLabel = 'Last 30 Days';
    const day30Ago = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const d30Parts = getCalendarDateParts(day30Ago, timezone);
    const d30Str = `${d30Parts.year}-${pad(d30Parts.month)}-${pad(d30Parts.day)}`;

    currentStart = getTzDate(d30Str, '00:00:00.000', timezone);
    currentEnd = getTzDate(todayStr, '23:59:59.999', timezone);

    const span = currentEnd.getTime() - currentStart.getTime();
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = new Date(previousEnd.getTime() - span);
  }

  return {
    period,
    periodLabel,
    timezone,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd
  };
};

// =========================================================================
// 1. ADVANCED BUSINESS DASHBOARD ANALYTICS
// =========================================================================

/**
 * Compute database-driven business dashboard metrics with comparison to previous period
 */
const getDashboardAnalytics = async (period = '30days', customStart = null, customEnd = null) => {
  const settings = await getStoreSettings();
  const dateRanges = getDateRangeAndComparison(period, customStart, customEnd, settings.timezone);
  const now = new Date();

  // 1. Fetch catalog and inventory
  const [
    totalProducts,
    allBatches,
    quarantinedDispositions,
    activeMarkdowns,
    pendingReturns,
    disposedCurrent,
    disposedPrevious,
    movementsCurrent,
    movementsPrevious
  ] = await Promise.all([
    Product.countDocuments(),
    InventoryBatch.find({})
      .populate('product', 'name brand barcode category unit imageUrl reorderPoint')
      .lean(),
    StockDisposition.find({ status: 'QUARANTINED' }).lean(),
    Markdown.find({ status: 'ACTIVE' }).populate('batch').lean(),
    SupplierReturn.find({ status: { $in: ['REQUESTED', 'APPROVED', 'DISPATCHED'] } }).populate('batch').lean(),
    StockDisposition.find({
      status: { $in: ['DISPOSED', 'WRITTEN_OFF'] },
      createdAt: { $gte: dateRanges.currentStart, $lte: dateRanges.currentEnd }
    }).lean(),
    StockDisposition.find({
      status: { $in: ['DISPOSED', 'WRITTEN_OFF'] },
      createdAt: { $gte: dateRanges.previousStart, $lte: dateRanges.previousEnd }
    }).lean(),
    StockMovement.find({
      createdAt: { $gte: dateRanges.currentStart, $lte: dateRanges.currentEnd }
    }).lean(),
    StockMovement.find({
      createdAt: { $gte: dateRanges.previousStart, $lte: dateRanges.previousEnd }
    }).lean()
  ]);

  // 2. Inventory Valuation (Zero Double Counting)
  let saleableUnits = 0;
  let saleableCostValue = 0;
  let saleableRetailValue = 0;
  let activeBatchesCount = 0;

  let expiredInBatchUnits = 0;
  let expiredInBatchCostValue = 0;
  let expiredBatchesCount = 0;

  let nearExpiryUnits = 0;
  let nearExpiryCostValue = 0;
  let nearExpiryRetailValue = 0;
  let nearExpiryBatchesCount = 0;

  let freshUnits = 0;
  let freshCostValue = 0;
  let freshBatchesCount = 0;

  // Track product-level saleable stock for low-stock and reorder calculations
  const productSaleableMap = {}; // { productId: { units, product } }

  allBatches.forEach((b) => {
    const pId = b.product?._id ? b.product._id.toString() : b.product?.toString();
    if (pId && !productSaleableMap[pId]) {
      productSaleableMap[pId] = {
        units: 0,
        product: b.product
      };
    }

    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone: settings.timezone,
      referenceDate: now
    });

    const qty = b.currentQuantity || 0;
    const unitCost = b.purchasePrice || 0;
    const unitRetail = b.discountedPrice || b.sellingPrice || 0;
    const costTotal = Number((qty * unitCost).toFixed(2));
    const retailTotal = Number((qty * unitRetail).toFixed(2));

    if (b.isQuarantined) {
      // Already quarantined batches have their units tracked in StockDisposition
      return;
    }

    if (qty <= 0) {
      return;
    }

    if (meta.status === 'EXPIRED') {
      expiredInBatchUnits += qty;
      expiredInBatchCostValue += costTotal;
      expiredBatchesCount++;
    } else {
      // Saleable batch
      activeBatchesCount++;
      saleableUnits += qty;
      saleableCostValue += costTotal;
      saleableRetailValue += retailTotal;

      if (pId) {
        productSaleableMap[pId].units += qty;
      }

      if (['EXPIRING_TODAY', 'CRITICAL', 'EXPIRING_SOON'].includes(meta.status)) {
        nearExpiryBatchesCount++;
        nearExpiryUnits += qty;
        nearExpiryCostValue += costTotal;
        nearExpiryRetailValue += retailTotal;
      } else if (meta.status === 'FRESH') {
        freshBatchesCount++;
        freshUnits += qty;
        freshCostValue += costTotal;
      }
    }
  });

  // 3. Quarantined stock (segregated from saleable stock)
  const quarantinedUnits = quarantinedDispositions.reduce((acc, q) => acc + (q.quantity || 0), 0);
  const quarantinedCostValue = Number(
    quarantinedDispositions.reduce((acc, q) => acc + (q.costLoss || 0), 0).toFixed(2)
  );

  // 4. Total physical inventory (Physical = Saleable + Expired in Batch + Quarantined)
  const totalPhysicalUnits = saleableUnits + expiredInBatchUnits + quarantinedUnits;
  const totalPhysicalCostValue = Number(
    (saleableCostValue + expiredInBatchCostValue + quarantinedCostValue).toFixed(2)
  );

  // 5. Low-stock products calculation
  let lowStockProductsCount = 0;
  const lowStockThreshold = settings.lowStockThreshold;

  // Check products that have batches
  Object.values(productSaleableMap).forEach(({ units, product }) => {
    const threshold = product?.reorderPoint !== undefined && product?.reorderPoint !== null
      ? product.reorderPoint
      : lowStockThreshold;
    if (units <= threshold) {
      lowStockProductsCount++;
    }
  });
  // Add products that have 0 batches registered at all (stock is 0 <= threshold)
  const productsWithBatchesCount = Object.keys(productSaleableMap).length;
  if (totalProducts > productsWithBatchesCount) {
    lowStockProductsCount += (totalProducts - productsWithBatchesCount);
  }

  // 6. Action Metrics: Markdowns & Returns
  let activeMarkdownValue = 0;
  activeMarkdowns.forEach((m) => {
    const qty = m.batch?.currentQuantity || 0;
    activeMarkdownValue += (m.discountedPrice || 0) * qty;
  });

  let pendingReturnValue = 0;
  pendingReturns.forEach((r) => {
    const unitPrice = r.batch?.purchasePrice || 0;
    pendingReturnValue += unitPrice * (r.quantity || 0);
  });

  // 7. Disposal losses in selected period vs previous period
  const disposalUnitsCurrent = disposedCurrent.reduce((acc, d) => acc + (d.quantity || 0), 0);
  const disposalLossCurrent = Number(
    disposedCurrent.reduce((acc, d) => acc + (d.costLoss || 0), 0).toFixed(2)
  );

  const disposalUnitsPrevious = disposedPrevious.reduce((acc, d) => acc + (d.quantity || 0), 0);
  const disposalLossPrevious = Number(
    disposedPrevious.reduce((acc, d) => acc + (d.costLoss || 0), 0).toFixed(2)
  );

  // 8. Stock Movements analysis (Current vs Previous)
  const summarizeMovements = (movements) => {
    let receivedUnits = 0;
    let receivedCount = 0;
    let adjustedIncreaseUnits = 0;
    let adjustedDecreaseUnits = 0;
    let damagedUnits = 0;
    let quarantinedUnitsMoved = 0;
    let disposedUnitsMoved = 0;
    let returnedToSupplierUnits = 0;

    movements.forEach((m) => {
      const q = m.quantityChanged || 0;
      switch (m.movementType) {
        case 'STOCK_RECEIVED':
          receivedUnits += q;
          receivedCount++;
          break;
        case 'STOCK_ADJUSTED_INCREASE':
          adjustedIncreaseUnits += q;
          break;
        case 'STOCK_ADJUSTED_DECREASE':
          adjustedDecreaseUnits += q;
          break;
        case 'STOCK_DAMAGED':
          damagedUnits += q;
          break;
        case 'STOCK_EXPIRED':
          damagedUnits += q;
          break;
        case 'STOCK_QUARANTINED':
          quarantinedUnitsMoved += q;
          break;
        case 'STOCK_DISPOSED':
          disposedUnitsMoved += q;
          break;
        case 'STOCK_RETURNED_TO_SUPPLIER':
          returnedToSupplierUnits += q;
          break;
        default:
          break;
      }
    });

    return {
      totalMovementsCount: movements.length,
      receivedUnits,
      receivedCount,
      adjustedIncreaseUnits,
      adjustedDecreaseUnits,
      damagedUnits,
      quarantinedUnitsMoved,
      disposedUnitsMoved,
      returnedToSupplierUnits
    };
  };

  const movementsCurrentSummary = summarizeMovements(movementsCurrent);
  const movementsPreviousSummary = summarizeMovements(movementsPrevious);

  // Helper for percentage change calculation
  const calcPercentChange = (current, previous) => {
    if (!previous || previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
  };

  return {
    dateRange: {
      period: dateRanges.period,
      periodLabel: dateRanges.periodLabel,
      startDate: dateRanges.currentStart.toISOString(),
      endDate: dateRanges.currentEnd.toISOString(),
      previousStartDate: dateRanges.previousStart.toISOString(),
      previousEndDate: dateRanges.previousEnd.toISOString(),
      timezone: settings.timezone
    },
    catalog: {
      totalProducts,
      totalBatches: allBatches.length,
      activeBatches: activeBatchesCount,
      lowStockProductsCount
    },
    inventoryValuation: {
      totalPhysicalUnits,
      totalPhysicalCostValue,
      saleable: {
        units: saleableUnits,
        costValue: Number(saleableCostValue.toFixed(2)),
        retailValue: Number(saleableRetailValue.toFixed(2)),
        batchesCount: activeBatchesCount
      },
      expired: {
        units: expiredInBatchUnits,
        costValue: Number(expiredInBatchCostValue.toFixed(2)),
        batchesCount: expiredBatchesCount
      },
      quarantined: {
        units: quarantinedUnits,
        costValue: quarantinedCostValue,
        recordsCount: quarantinedDispositions.length
      },
      nearExpiry: {
        units: nearExpiryUnits,
        costValue: Number(nearExpiryCostValue.toFixed(2)),
        retailValue: Number(nearExpiryRetailValue.toFixed(2)),
        batchesCount: nearExpiryBatchesCount
      },
      fresh: {
        units: freshUnits,
        costValue: Number(freshCostValue.toFixed(2)),
        batchesCount: freshBatchesCount
      }
    },
    actions: {
      markdowns: {
        activeCount: activeMarkdowns.length,
        activeMarkdownValue: Number(activeMarkdownValue.toFixed(2))
      },
      supplierReturns: {
        pendingCount: pendingReturns.length,
        pendingRecoveryValue: Number(pendingReturnValue.toFixed(2))
      },
      disposalLoss: {
        currentPeriod: {
          recordsCount: disposedCurrent.length,
          units: disposalUnitsCurrent,
          costLoss: disposalLossCurrent
        },
        previousPeriod: {
          recordsCount: disposedPrevious.length,
          units: disposalUnitsPrevious,
          costLoss: disposalLossPrevious
        },
        percentChange: calcPercentChange(disposalLossCurrent, disposalLossPrevious)
      }
    },
    movements: {
      currentPeriod: movementsCurrentSummary,
      previousPeriod: movementsPreviousSummary,
      receivedPercentChange: calcPercentChange(
        movementsCurrentSummary.receivedUnits,
        movementsPreviousSummary.receivedUnits
      )
    },
    storeSettings: {
      currency: settings.currency,
      timezone: settings.timezone,
      lowStockThreshold: settings.lowStockThreshold
    }
  };
};

// =========================================================================
// 2. EXPIRY DISTRIBUTION & AGEING ANALYTICS
// =========================================================================

/**
 * Breakdown of active inventory by 6 explicit expiry statuses
 */
const getExpiryDistribution = async () => {
  const settings = await getStoreSettings();
  const now = new Date();

  const batches = await InventoryBatch.find({ isQuarantined: false })
    .populate('product', 'category')
    .lean();

  const statusTiers = {
    FRESH: { status: 'FRESH', label: 'Fresh (> 7d)', batchCount: 0, units: 0, costValue: 0, retailValue: 0, color: '#10b981' },
    EXPIRING_SOON: { status: 'EXPIRING_SOON', label: 'Warning (4–7d)', batchCount: 0, units: 0, costValue: 0, retailValue: 0, color: '#f59e0b' },
    CRITICAL: { status: 'CRITICAL', label: 'Critical (1–3d)', batchCount: 0, units: 0, costValue: 0, retailValue: 0, color: '#f97316' },
    EXPIRING_TODAY: { status: 'EXPIRING_TODAY', label: 'Expiring Today (0d)', batchCount: 0, units: 0, costValue: 0, retailValue: 0, color: '#ef4444' },
    EXPIRED: { status: 'EXPIRED', label: 'Expired (Past Shelf Life)', batchCount: 0, units: 0, costValue: 0, retailValue: 0, color: '#b91c1c' },
    DEPLETED: { status: 'DEPLETED', label: 'Depleted (0 units)', batchCount: 0, units: 0, costValue: 0, retailValue: 0, color: '#94a3b8' }
  };

  batches.forEach((b) => {
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone: settings.timezone,
      referenceDate: now
    });

    const tier = statusTiers[meta.status] || statusTiers.FRESH;
    const qty = b.currentQuantity || 0;
    tier.batchCount++;
    tier.units += qty;
    tier.costValue = Number((tier.costValue + qty * (b.purchasePrice || 0)).toFixed(2));
    tier.retailValue = Number((tier.retailValue + qty * (b.discountedPrice || b.sellingPrice || 0)).toFixed(2));
  });

  return {
    distribution: Object.values(statusTiers),
    storeSettings: settings
  };
};

/**
 * Category-wise inventory value breakdown
 */
const getCategoryValuation = async () => {
  const settings = await getStoreSettings();
  const now = new Date();

  const batches = await InventoryBatch.find({ isQuarantined: false, currentQuantity: { $gt: 0 } })
    .populate('product', 'name category brand')
    .lean();

  const categoryMap = {};

  batches.forEach((b) => {
    const category = b.product?.category || 'General';
    if (!categoryMap[category]) {
      categoryMap[category] = {
        category,
        batchCount: 0,
        totalUnits: 0,
        costValue: 0,
        retailValue: 0,
        expiredUnits: 0,
        expiredCostValue: 0,
        nearExpiryUnits: 0,
        nearExpiryCostValue: 0
      };
    }

    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone: settings.timezone,
      referenceDate: now
    });

    const qty = b.currentQuantity || 0;
    const cost = qty * (b.purchasePrice || 0);
    const retail = qty * (b.discountedPrice || b.sellingPrice || 0);

    const entry = categoryMap[category];
    entry.batchCount++;
    entry.totalUnits += qty;
    entry.costValue += cost;
    entry.retailValue += retail;

    if (meta.status === 'EXPIRED') {
      entry.expiredUnits += qty;
      entry.expiredCostValue += cost;
    } else if (['EXPIRING_TODAY', 'CRITICAL', 'EXPIRING_SOON'].includes(meta.status)) {
      entry.nearExpiryUnits += qty;
      entry.nearExpiryCostValue += cost;
    }
  });

  const categories = Object.values(categoryMap).map((c) => ({
    ...c,
    costValue: Number(c.costValue.toFixed(2)),
    retailValue: Number(c.retailValue.toFixed(2)),
    expiredCostValue: Number(c.expiredCostValue.toFixed(2)),
    nearExpiryCostValue: Number(c.nearExpiryCostValue.toFixed(2))
  }));

  // Sort descending by total cost value
  categories.sort((a, b) => b.costValue - a.costValue);

  return {
    categories,
    currency: settings.currency
  };
};

/**
 * Stock Ageing analysis based on time since receivedDate
 */
const getStockAgeing = async () => {
  const settings = await getStoreSettings();
  const now = new Date();

  const batches = await InventoryBatch.find({ isQuarantined: false, currentQuantity: { $gt: 0 } })
    .populate('product', 'name category')
    .lean();

  const ageingTiers = {
    tier0_30: { range: '0–30 days', label: 'Fresh Stock', batchCount: 0, units: 0, costValue: 0, color: '#10b981' },
    tier31_60: { range: '31–60 days', label: 'Normal Turnover', batchCount: 0, units: 0, costValue: 0, color: '#3b82f6' },
    tier61_90: { range: '61–90 days', label: 'Slow Moving', batchCount: 0, units: 0, costValue: 0, color: '#f59e0b' },
    tier90_plus: { range: '90+ days', label: 'Aged / At Risk', batchCount: 0, units: 0, costValue: 0, color: '#ef4444' }
  };

  batches.forEach((b) => {
    const received = b.receivedDate || b.createdAt || now;
    const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(received).getTime()) / (1000 * 60 * 60 * 24)));
    const qty = b.currentQuantity || 0;
    const cost = qty * (b.purchasePrice || 0);

    let target = ageingTiers.tier0_30;
    if (ageDays > 90) {
      target = ageingTiers.tier90_plus;
    } else if (ageDays > 60) {
      target = ageingTiers.tier61_90;
    } else if (ageDays > 30) {
      target = ageingTiers.tier31_60;
    }

    target.batchCount++;
    target.units += qty;
    target.costValue += cost;
  });

  const tiers = Object.values(ageingTiers).map((t) => ({
    ...t,
    costValue: Number(t.costValue.toFixed(2))
  }));

  return {
    ageing: tiers,
    currency: settings.currency
  };
};

/**
 * Movement trends over time series (daily or weekly buckets)
 */
const getMovementTrends = async (period = '30days', customStart = null, customEnd = null) => {
  const settings = await getStoreSettings();
  const dateRanges = getDateRangeAndComparison(period, customStart, customEnd, settings.timezone);

  const movements = await StockMovement.find({
    createdAt: { $gte: dateRanges.currentStart, $lte: dateRanges.currentEnd }
  })
    .sort({ createdAt: 1 })
    .lean();

  const pad = (n) => String(n).padStart(2, '0');
  const buckets = {};

  movements.forEach((m) => {
    const parts = getCalendarDateParts(m.createdAt, settings.timezone);
    const dateKey = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;

    if (!buckets[dateKey]) {
      buckets[dateKey] = {
        date: dateKey,
        label: `${pad(parts.day)}/${pad(parts.month)}`,
        received: 0,
        adjusted: 0,
        quarantined: 0,
        disposed: 0,
        returned: 0
      };
    }

    const q = m.quantityChanged || 0;
    const b = buckets[dateKey];

    switch (m.movementType) {
      case 'STOCK_RECEIVED':
        b.received += q;
        break;
      case 'STOCK_ADJUSTED_INCREASE':
      case 'STOCK_ADJUSTED_DECREASE':
      case 'STOCK_DAMAGED':
      case 'STOCK_EXPIRED':
        b.adjusted += q;
        break;
      case 'STOCK_QUARANTINED':
        b.quarantined += q;
        break;
      case 'STOCK_DISPOSED':
        b.disposed += q;
        break;
      case 'STOCK_RETURNED_TO_SUPPLIER':
        b.returned += q;
        break;
      default:
        break;
    }
  });

  const timeline = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));

  return {
    timeline,
    dateRange: dateRanges,
    totalEvents: movements.length
  };
};

/**
 * Top products with the highest expiry risk
 */
const getTopExpiryRiskProducts = async (limit = 10) => {
  const settings = await getStoreSettings();
  const now = new Date();

  const batches = await InventoryBatch.find({ isQuarantined: false, currentQuantity: { $gt: 0 } })
    .populate('product', 'name brand category unit')
    .lean();

  const productRiskMap = {};

  batches.forEach((b) => {
    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone: settings.timezone,
      referenceDate: now
    });

    if (meta.status === 'FRESH' || meta.status === 'DEPLETED') {
      return;
    }

    const p = b.product;
    if (!p) return;
    const pId = p._id.toString();

    if (!productRiskMap[pId]) {
      productRiskMap[pId] = {
        productId: p._id,
        name: p.name,
        brand: p.brand || '',
        category: p.category || 'General',
        unit: p.unit || 'piece',
        expiringSoonUnits: 0,
        criticalUnits: 0,
        expiringTodayUnits: 0,
        expiredUnits: 0,
        costAtRisk: 0,
        earliestExpiryDate: b.expiryDate
      };
    }

    const entry = productRiskMap[pId];
    const qty = b.currentQuantity || 0;
    const cost = qty * (b.purchasePrice || 0);

    entry.costAtRisk += cost;

    if (meta.status === 'EXPIRING_SOON') entry.expiringSoonUnits += qty;
    if (meta.status === 'CRITICAL') entry.criticalUnits += qty;
    if (meta.status === 'EXPIRING_TODAY') entry.expiringTodayUnits += qty;
    if (meta.status === 'EXPIRED') entry.expiredUnits += qty;

    if (new Date(b.expiryDate) < new Date(entry.earliestExpiryDate)) {
      entry.earliestExpiryDate = b.expiryDate;
    }
  });

  const riskProducts = Object.values(productRiskMap).map((rp) => ({
    ...rp,
    costAtRisk: Number(rp.costAtRisk.toFixed(2)),
    earliestExpiryFormatted: getCalendarDateParts(rp.earliestExpiryDate, settings.timezone).dateStr
  }));

  riskProducts.sort((a, b) => b.costAtRisk - a.costAtRisk);

  return {
    products: riskProducts.slice(0, limit),
    currency: settings.currency
  };
};

/**
 * FEFO compliance calculation where sufficient movement data exists
 */
const getFEFOCompliance = async () => {
  // Inspect recent stock decrements and audit if they pulled from the earliest active batch
  const movements = await StockMovement.find({
    movementType: { $in: ['STOCK_ADJUSTED_DECREASE', 'STOCK_DAMAGED', 'STOCK_DISPOSED', 'STOCK_RETURNED_TO_SUPPLIER'] }
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('batch product user')
    .lean();

  let auditedCount = 0;
  let compliantCount = 0;

  for (const m of movements) {
    if (!m.batch || !m.product) continue;
    auditedCount++;

    // Find any batch for this product that had earlier expiry and was available at the time
    const earlierBatch = await InventoryBatch.findOne({
      product: m.product._id,
      _id: { $ne: m.batch._id },
      expiryDate: { $lt: m.batch.expiryDate },
      createdAt: { $lte: m.createdAt },
      currentQuantity: { $gt: 0 }
    }).lean();

    if (!earlierBatch) {
      compliantCount++;
    }
  }

  const complianceRate = auditedCount > 0 ? Number(((compliantCount / auditedCount) * 100).toFixed(1)) : 100;

  return {
    complianceRate,
    auditedCount,
    compliantCount,
    nonCompliantCount: auditedCount - compliantCount,
    status: complianceRate >= 90 ? 'EXCELLENT' : complianceRate >= 75 ? 'SATISFACTORY' : 'NEEDS_ATTENTION'
  };
};

// =========================================================================
// 3. REPORTS DATA & CSV EXPORT GENERATOR
// =========================================================================

/**
 * Fetch report table rows for any of the 7 supported report types
 */
const getReportData = async (reportType, query = {}) => {
  const { page = 1, limit = 50, search, category, status, period, startDate, endDate } = query;
  const settings = await getStoreSettings();
  const dateRanges = getDateRangeAndComparison(period, startDate, endDate, settings.timezone);
  const now = new Date();

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  let rows = [];
  let total = 0;

  switch (reportType) {
    case 'expiry': {
      const filter = { isQuarantined: false, currentQuantity: { $gt: 0 } };
      const batches = await InventoryBatch.find(filter)
        .populate('product', 'name brand category barcode unit')
        .sort({ expiryDate: 1 })
        .lean();

      let enriched = batches.map((b) => {
        const meta = calculateBatchExpiryStatus(b, {
          expiryWarningDays: settings.expiryWarningDays,
          expiryCriticalDays: settings.expiryCriticalDays,
          timezone: settings.timezone,
          referenceDate: now
        });
        return {
          id: b._id,
          productName: b.product?.name || 'Unknown',
          brand: b.product?.brand || '',
          barcode: b.product?.barcode || 'N/A',
          category: b.product?.category || 'General',
          batchNumber: b.batchNumber || 'Primary',
          quantity: b.currentQuantity,
          unit: b.product?.unit || 'piece',
          purchasePrice: b.purchasePrice || 0,
          costAtRisk: Number(((b.currentQuantity || 0) * (b.purchasePrice || 0)).toFixed(2)),
          expiryDate: meta.expiryDateFormatted,
          daysUntilExpiry: meta.daysUntilExpiry,
          status: meta.status,
          riskLevel: meta.riskLevel,
          isSaleable: meta.isSaleable
        };
      });

      if (category && category !== 'ALL') {
        enriched = enriched.filter((r) => r.category === category);
      }
      if (status && status !== 'ALL') {
        enriched = enriched.filter((r) => r.status === status);
      }
      if (search) {
        const q = search.toLowerCase();
        enriched = enriched.filter(
          (r) => r.productName.toLowerCase().includes(q) || r.batchNumber.toLowerCase().includes(q)
        );
      }

      total = enriched.length;
      rows = enriched.slice(skip, skip + limitNum);
      break;
    }

    case 'valuation': {
      const filter = {};
      if (category && category !== 'ALL') filter.category = category;
      if (search) filter.name = { $regex: search, $options: 'i' };

      const products = await Product.find(filter).lean();
      const batches = await InventoryBatch.find({ isQuarantined: false, currentQuantity: { $gt: 0 } }).lean();

      const batchMap = {};
      batches.forEach((b) => {
        const pId = b.product.toString();
        if (!batchMap[pId]) batchMap[pId] = [];
        batchMap[pId].push(b);
      });

      const valuationList = products.map((p) => {
        const pBatches = batchMap[p._id.toString()] || [];
        const totalUnits = pBatches.reduce((acc, b) => acc + (b.currentQuantity || 0), 0);
        let totalCost = 0;
        let totalRetail = 0;

        pBatches.forEach((b) => {
          totalCost += (b.currentQuantity || 0) * (b.purchasePrice || 0);
          totalRetail += (b.currentQuantity || 0) * (b.discountedPrice || b.sellingPrice || 0);
        });

        return {
          id: p._id,
          productName: p.name,
          brand: p.brand || '',
          barcode: p.barcode || 'N/A',
          category: p.category || 'General',
          unit: p.unit || 'piece',
          batchesCount: pBatches.length,
          totalUnits,
          totalCost: Number(totalCost.toFixed(2)),
          totalRetail: Number(totalRetail.toFixed(2)),
          potentialMargin: Number((totalRetail - totalCost).toFixed(2))
        };
      });

      total = valuationList.length;
      rows = valuationList.slice(skip, skip + limitNum);
      break;
    }

    case 'movement': {
      const filter = {
        createdAt: { $gte: dateRanges.currentStart, $lte: dateRanges.currentEnd }
      };

      const [items, count] = await Promise.all([
        StockMovement.find(filter)
          .populate('product', 'name brand category unit')
          .populate('batch', 'batchNumber expiryDate')
          .populate('user', 'fullName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        StockMovement.countDocuments(filter)
      ]);

      total = count;
      rows = items.map((m) => ({
        id: m._id,
        timestamp: m.createdAt.toISOString(),
        productName: m.product?.name || 'Unknown',
        batchNumber: m.batch?.batchNumber || 'Primary',
        movementType: m.movementType,
        quantityChanged: m.quantityChanged,
        quantityBefore: m.quantityBefore,
        quantityAfter: m.quantityAfter,
        reason: m.reason || '',
        user: m.user?.fullName || 'System'
      }));
      break;
    }

    case 'markdowns': {
      const filter = {};
      if (status && status !== 'ALL') filter.status = status;

      const [items, count] = await Promise.all([
        Markdown.find(filter)
          .populate('product', 'name brand category unit')
          .populate('batch', 'batchNumber expiryDate currentQuantity')
          .populate('requestedBy', 'fullName email')
          .populate('approvedBy', 'fullName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Markdown.countDocuments(filter)
      ]);

      total = count;
      rows = items.map((md) => ({
        id: md._id,
        productName: md.product?.name || 'Unknown',
        batchNumber: md.batch?.batchNumber || 'Primary',
        originalPrice: md.originalPrice,
        discountPercent: md.discountPercent,
        discountedPrice: md.discountedPrice,
        currentQuantity: md.batch?.currentQuantity || 0,
        status: md.status,
        requestedBy: md.requestedBy?.fullName || 'User',
        approvedBy: md.approvedBy?.fullName || 'N/A',
        reason: md.reason,
        createdAt: md.createdAt.toISOString()
      }));
      break;
    }

    case 'returns': {
      const filter = {};
      if (status && status !== 'ALL') filter.status = status;

      const [items, count] = await Promise.all([
        SupplierReturn.find(filter)
          .populate('product', 'name brand category unit')
          .populate('batch', 'batchNumber purchasePrice')
          .populate('responsibleEmployee', 'fullName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        SupplierReturn.countDocuments(filter)
      ]);

      total = count;
      rows = items.map((r) => ({
        id: r._id,
        productName: r.product?.name || 'Unknown',
        batchNumber: r.batch?.batchNumber || 'Primary',
        supplierName: r.supplierName,
        supplierContact: r.supplierContact || 'N/A',
        quantity: r.quantity,
        unit: r.product?.unit || 'piece',
        reason: r.reason,
        status: r.status,
        resolutionExpected: r.resolutionExpected,
        recoveryValue: Number(((r.quantity || 0) * (r.batch?.purchasePrice || 0)).toFixed(2)),
        followUpDate: r.followUpDate ? r.followUpDate.toISOString().slice(0, 10) : 'N/A',
        stockDeducted: r.stockDeducted ? 'Yes' : 'No',
        responsibleEmployee: r.responsibleEmployee?.fullName || 'User'
      }));
      break;
    }

    case 'disposal': {
      const filter = {};
      if (status && status !== 'ALL') filter.status = status;

      const [items, count] = await Promise.all([
        StockDisposition.find(filter)
          .populate('product', 'name brand category unit')
          .populate('batch', 'batchNumber purchasePrice')
          .populate('responsibleEmployee', 'fullName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        StockDisposition.countDocuments(filter)
      ]);

      total = count;
      rows = items.map((d) => ({
        id: d._id,
        productName: d.product?.name || 'Unknown',
        batchNumber: d.batch?.batchNumber || 'Primary',
        quantity: d.quantity,
        unit: d.product?.unit || 'piece',
        actionType: d.actionType,
        disposalMethod: d.disposalMethod || 'Quarantine Storage',
        status: d.status,
        costLoss: d.costLoss || 0,
        reason: d.reason,
        witness: d.disposalWitness || 'N/A',
        responsibleEmployee: d.responsibleEmployee?.fullName || 'User',
        createdAt: d.createdAt.toISOString()
      }));
      break;
    }

    case 'lowStock': {
      const batches = await InventoryBatch.find({ isQuarantined: false, currentQuantity: { $gt: 0 } }).lean();
      const products = await Product.find({}).lean();

      const productStockMap = {};
      batches.forEach((b) => {
        const pId = b.product.toString();
        productStockMap[pId] = (productStockMap[pId] || 0) + (b.currentQuantity || 0);
      });

      const lowStockList = [];
      products.forEach((p) => {
        const availableStock = productStockMap[p._id.toString()] || 0;
        const reorderPoint = p.reorderPoint !== undefined && p.reorderPoint !== null
          ? p.reorderPoint
          : settings.lowStockThreshold;

        if (availableStock <= reorderPoint) {
          lowStockList.push({
            id: p._id,
            productName: p.name,
            brand: p.brand || '',
            barcode: p.barcode || 'N/A',
            category: p.category || 'General',
            unit: p.unit || 'piece',
            availableStock,
            reorderPoint,
            stockDeficit: Math.max(0, reorderPoint - availableStock),
            status: availableStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
          });
        }
      });

      total = lowStockList.length;
      rows = lowStockList.slice(skip, skip + limitNum);
      break;
    }

    default:
      throw new Error(`Unsupported report type: "${reportType}"`);
  }

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    reportType,
    rows,
    pagination: {
      total,
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
 * Generate RFC 4180-compliant CSV string for report download
 */
const exportReportCSV = async (reportType, query = {}) => {
  const result = await getReportData(reportType, { ...query, page: 1, limit: 10000 });
  const rows = result.rows;

  if (rows.length === 0) {
    return 'No records found for the selected filter criteria.\n';
  }

  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '""';
    const stringValue = String(value);
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const headers = Object.keys(rows[0]).filter((k) => k !== 'id');
  const headerLine = headers.map(escapeCSV).join(',');

  const lines = [headerLine];

  rows.forEach((row) => {
    const line = headers.map((h) => escapeCSV(row[h])).join(',');
    lines.push(line);
  });

  return lines.join('\r\n');
};

module.exports = {
  getStoreSettings,
  getDateRangeAndComparison,
  getDashboardAnalytics,
  getExpiryDistribution,
  getCategoryValuation,
  getStockAgeing,
  getMovementTrends,
  getTopExpiryRiskProducts,
  getFEFOCompliance,
  getReportData,
  exportReportCSV
};

