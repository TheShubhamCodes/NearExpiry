const mongoose = require('mongoose');
const Product = require('../../models/Product');
const InventoryBatch = require('../../models/InventoryBatch');
const SupplierReturn = require('../../models/SupplierReturn');
const Store = require('../../models/Store');
const AIPredictionLog = require('../../models/AIPredictionLog');
const { getProductSalesVelocity } = require('./salesService');

/**
 * Forecast product demand and calculate optimal reorder quantity
 */
const forecastProductDemand = async (productId, options = {}) => {
  const pId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
  const product = await Product.findById(pId);
  if (!product) {
    const error = new Error('Product not found in catalog');
    error.statusCode = 404;
    throw error;
  }

  const store = await Store.getStore();
  const horizonDays = options.horizonDays || store?.aiSettings?.forecastPeriodDays || 14;
  const leadTimeDays = options.leadTimeDays || store?.aiSettings?.leadTimeDays || 3;
  const defaultReorderPoint = store?.lowStockThreshold || 5;
  const reorderPoint = product.reorderPoint !== undefined && product.reorderPoint !== null
    ? product.reorderPoint
    : defaultReorderPoint;

  // 1. Calculate current saleable stock (exclude quarantined & expired)
  const batches = await InventoryBatch.find({
    product: pId,
    isQuarantined: false,
    currentQuantity: { $gt: 0 },
    expiryDate: { $gte: new Date() }
  }).lean();

  const currentSaleableStock = batches.reduce((acc, b) => acc + (b.currentQuantity || 0), 0);

  // 2. Calculate pending incoming replacements from supplier returns
  const pendingReplacements = await SupplierReturn.find({
    product: pId,
    status: { $in: ['REQUESTED', 'APPROVED', 'DISPATCHED'] },
    resolutionExpected: 'REPLACEMENT'
  }).lean();

  const pendingIncomingStock = pendingReplacements.reduce((acc, r) => acc + (r.quantity || 0), 0);

  // 3. Compute empirical sales velocity
  const velocityData = await getProductSalesVelocity(pId, 30);
  const dailyVelocity = velocityData.dailyVelocity;

  // Cold-start check
  if (!velocityData.hasSufficientData) {
    const deficit = Math.max(0, reorderPoint - currentSaleableStock - pendingIncomingStock);
    return {
      productId: product._id,
      productName: product.name,
      brand: product.brand || '',
      category: product.category,
      unit: product.unit || 'piece',
      currentSaleableStock,
      pendingIncomingStock,
      reorderPoint,
      horizonDays,
      leadTimeDays,
      forecastedDemandUnits: null,
      dailyVelocity: 0,
      stockoutRisk: currentSaleableStock === 0 ? 'CRITICAL_STOCKOUT' : currentSaleableStock <= reorderPoint ? 'LOW_STOCK' : 'ADEQUATE',
      daysUntilStockout: null,
      recommendedReorderQuantity: deficit,
      hasSufficientData: false,
      dataSufficiencyMessage: 'Insufficient sales history (requires at least 3 verified sales records). Displaying deterministic catalog reorder deficit.',
      reasoning: currentSaleableStock === 0
        ? `Out of stock! Recommended baseline reorder of ${reorderPoint} units to meet configured shelf threshold.`
        : currentSaleableStock <= reorderPoint
        ? `Current stock (${currentSaleableStock}) is at or below reorder threshold (${reorderPoint}). Baseline replenishment of ${deficit} units recommended.`
        : `Current stock (${currentSaleableStock}) is sufficient above reorder threshold (${reorderPoint}).`,
      confidence: 'LOW',
      modelVersion: '1.0.0',
      predictedAt: new Date().toISOString()
    };
  }

  // 4. ML / Statistical Demand Forecast
  // Forecast = Daily Velocity * Horizon Days
  const forecastedDemandUnits = Math.round(dailyVelocity * horizonDays);
  const demandDuringLeadTime = Math.ceil(dailyVelocity * leadTimeDays);

  // Days until stockout
  const daysUntilStockout = dailyVelocity > 0
    ? Number((currentSaleableStock / dailyVelocity).toFixed(1))
    : 999;

  // Stockout Risk Level
  let stockoutRisk = 'LOW';
  if (currentSaleableStock === 0) {
    stockoutRisk = 'CRITICAL_STOCKOUT';
  } else if (daysUntilStockout <= leadTimeDays) {
    stockoutRisk = 'IMMINENT_STOCKOUT'; // Will run out before new delivery arrives!
  } else if (daysUntilStockout <= horizonDays) {
    stockoutRisk = 'STOCKOUT_WARNING';
  }

  // Safety buffer stock
  const safetyStock = Math.max(reorderPoint, Math.ceil(dailyVelocity * 2));

  // Reorder quantity calculation:
  // (Demand during LeadTime + Demand during Horizon + SafetyBuffer) - CurrentStock - PendingStock
  const requiredStock = demandDuringLeadTime + forecastedDemandUnits + safetyStock;
  const availableStock = currentSaleableStock + pendingIncomingStock;
  const recommendedReorderQuantity = Math.max(0, Math.ceil(requiredStock - availableStock));

  // Explainable Reasoning
  let reasoning = '';
  if (stockoutRisk === 'CRITICAL_STOCKOUT') {
    reasoning = `Currently out of stock. Sales velocity is ${dailyVelocity} units/day. Reorder ${recommendedReorderQuantity} units immediately to cover ${leadTimeDays}-day lead time and ${horizonDays}-day demand.`;
  } else if (stockoutRisk === 'IMMINENT_STOCKOUT') {
    reasoning = `Urgent reorder required! Stock will deplete in ~${daysUntilStockout} days, which is less than the ${leadTimeDays}-day supplier lead time. Reorder ${recommendedReorderQuantity} units.`;
  } else if (recommendedReorderQuantity > 0) {
    reasoning = `Projected ${horizonDays}-day demand is ${forecastedDemandUnits} units based on sales velocity (${dailyVelocity}/day). Recommended replenishment of ${recommendedReorderQuantity} units maintains buffer.`;
  } else {
    reasoning = `Existing stock (${currentSaleableStock} units) is sufficient to cover projected demand (${forecastedDemandUnits} units) across the next ${horizonDays} days.`;
  }

  const result = {
    productId: product._id,
    productName: product.name,
    brand: product.brand || '',
    category: product.category,
    unit: product.unit || 'piece',
    currentSaleableStock,
    pendingIncomingStock,
    reorderPoint,
    horizonDays,
    leadTimeDays,
    dailyVelocity,
    forecastedDemandUnits,
    stockoutRisk,
    daysUntilStockout,
    recommendedReorderQuantity,
    hasSufficientData: true,
    confidence: velocityData.confidence,
    reasoning,
    modelVersion: '1.0.0',
    predictedAt: new Date().toISOString()
  };

  // Optional log
  if (options.persistLog) {
    AIPredictionLog.create({
      store: store?._id,
      predictionType: 'DEMAND_FORECAST',
      product: product._id,
      modelVersion: '1.0.0',
      inputs: {
        horizonDays,
        leadTimeDays,
        dailyVelocity,
        currentSaleableStock,
        pendingIncomingStock
      },
      prediction: {
        forecastedDemandUnits,
        stockoutRisk,
        recommendedReorderQuantity
      }
    }).catch(() => {});
  }

  return result;
};

/**
 * Get demand forecasts and reorder recommendations across entire catalog
 */
const getCatalogDemandForecasts = async (options = {}) => {
  const { filter = 'ALL', limit = 25 } = options;
  const products = await Product.find({}).sort({ name: 1 }).lean();

  const forecasts = [];

  for (const p of products) {
    try {
      const fc = await forecastProductDemand(p._id, { persistLog: false });
      forecasts.push(fc);
    } catch (err) {
      // Continue
    }
  }

  let filtered = forecasts;
  if (filter === 'REORDER_NEEDED') {
    filtered = forecasts.filter((f) => f.recommendedReorderQuantity > 0);
  } else if (filter === 'STOCKOUT_RISK') {
    filtered = forecasts.filter((f) => ['CRITICAL_STOCKOUT', 'IMMINENT_STOCKOUT', 'STOCKOUT_WARNING'].includes(f.stockoutRisk));
  }

  // Sort: highest urgency stockout risk first, then highest reorder quantity
  const riskPriority = { CRITICAL_STOCKOUT: 4, IMMINENT_STOCKOUT: 3, STOCKOUT_WARNING: 2, LOW_STOCK: 1, ADEQUATE: 0, LOW: 0 };
  filtered.sort((a, b) => (riskPriority[b.stockoutRisk] || 0) - (riskPriority[a.stockoutRisk] || 0) || b.recommendedReorderQuantity - a.recommendedReorderQuantity);

  return {
    forecasts: filtered.slice(0, limit),
    totalProducts: products.length,
    reorderRequiredCount: forecasts.filter((f) => f.recommendedReorderQuantity > 0).length,
    stockoutDangerCount: forecasts.filter((f) => ['CRITICAL_STOCKOUT', 'IMMINENT_STOCKOUT'].includes(f.stockoutRisk)).length
  };
};

module.exports = {
  forecastProductDemand,
  getCatalogDemandForecasts
};

