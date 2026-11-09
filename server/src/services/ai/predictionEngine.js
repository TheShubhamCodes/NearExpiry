const mongoose = require('mongoose');
const InventoryBatch = require('../../models/InventoryBatch');
const Product = require('../../models/Product');
const Store = require('../../models/Store');
const AIPredictionLog = require('../../models/AIPredictionLog');
const { getProductSalesVelocity, getCategorySalesVelocity } = require('./salesService');
const { getDaysUntilExpiry, calculateBatchExpiryStatus } = require('../../utils/expiryUtils');

/**
 * Predict expiry risk probability for a specific inventory batch
 */
const predictBatchExpiryRisk = async (batchId, options = {}) => {
  const batch = await InventoryBatch.findById(batchId).populate('product');
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  const store = await Store.getStore();
  const timezone = store?.timezone || 'Asia/Kolkata';
  const now = new Date();

  const daysRemaining = getDaysUntilExpiry(batch.expiryDate, now, timezone);
  const currentQty = batch.currentQuantity || 0;
  const purchasePrice = batch.purchasePrice || 0;
  const sellingPrice = batch.discountedPrice || batch.sellingPrice || purchasePrice * 1.25;

  // 1. Fetch empirical sales velocity
  let velocityData = await getProductSalesVelocity(batch.product._id, options.windowDays || 30);
  let effectiveVelocity = velocityData.dailyVelocity;
  let dataSource = 'PRODUCT_SALES_HISTORY';

  // If cold-start (insufficient product data), incorporate category baseline
  if (!velocityData.hasSufficientData) {
    const categoryVelocity = await getCategorySalesVelocity(batch.product.category, 30);
    if (velocityData.dailyVelocity > 0) {
      // Blend product and category velocity
      effectiveVelocity = Number(
        (0.6 * velocityData.dailyVelocity + 0.4 * categoryVelocity.dailyVelocity).toFixed(3)
      );
      dataSource = 'BLENDED_PRODUCT_AND_CATEGORY';
    } else {
      effectiveVelocity = categoryVelocity.dailyVelocity;
      dataSource = 'CATEGORY_BASELINE_FALLBACK';
    }
  }

  // 2. Compute projected sell-through before expiry
  let projectedSellable = 0;
  let estimatedUnsold = 0;
  let riskScore = 0;
  const factors = [];
  let recommendedAction = '';

  if (batch.isQuarantined) {
    riskScore = 100;
    estimatedUnsold = currentQty;
    factors.push('Batch is currently in quarantine segregation and excluded from sales.');
    recommendedAction = 'Proceed with authorized write-off disposal or supplier return.';
  } else if (currentQty <= 0) {
    riskScore = 0;
    estimatedUnsold = 0;
    factors.push('Batch is completely depleted (0 units remaining).');
    recommendedAction = 'Batch is cleared. No action required.';
  } else if (daysRemaining < 0) {
    // Already expired
    riskScore = 100;
    estimatedUnsold = currentQty;
    factors.push(`Batch expired ${Math.abs(daysRemaining)} days ago. Immediate quarantine required.`);
    recommendedAction = 'Quarantine expired units immediately to prevent illegal or spoiled sales.';
  } else if (daysRemaining === 0) {
    // Expiring today
    projectedSellable = Math.min(currentQty, Math.ceil(effectiveVelocity * 1.0));
    estimatedUnsold = Math.max(0, currentQty - projectedSellable);
    riskScore = estimatedUnsold > 0 ? 95 : 60;
    factors.push('Final day of shelf life (expires today).');
    factors.push(`Current stock (${currentQty} units) vs projected 1-day sales (${projectedSellable} units).`);
    recommendedAction = 'Aggressive 50% clearance discount or staff bundle.';
  } else {
    // Active batch with daysRemaining > 0
    projectedSellable = Number((effectiveVelocity * daysRemaining).toFixed(1));
    estimatedUnsold = Math.max(0, Number((currentQty - projectedSellable).toFixed(1)));

    if (currentQty > 0) {
      const unsoldRatio = estimatedUnsold / currentQty;
      let rawScore = Math.round(unsoldRatio * 100);

      // Urgency adjustments
      if (daysRemaining <= 3 && rawScore < 70) {
        rawScore = Math.max(rawScore, 70); // Critical window
      } else if (daysRemaining <= 7 && rawScore < 45) {
        rawScore = Math.max(rawScore, 45); // Warning window
      }

      riskScore = Math.min(100, Math.max(0, rawScore));
    }

    // Explainable factor generation
    if (effectiveVelocity <= 0) {
      factors.push('No recorded sales velocity for this product in store history.');
    } else {
      factors.push(`Current sales velocity is ${effectiveVelocity} units/day over a ${velocityData.windowDays}-day window.`);
      factors.push(`At current sales rate, store can sell ~${projectedSellable} units across remaining ${daysRemaining} days.`);
    }

    if (estimatedUnsold > 0) {
      factors.push(`Surplus of ~${estimatedUnsold} units projected to remain unsold at expiry.`);
    } else {
      factors.push(`Projected sales pace (${projectedSellable} units) is sufficient to sell out before expiry.`);
    }

    // Action recommendations
    if (riskScore >= 75) {
      recommendedAction = daysRemaining <= 3
        ? 'High Risk: Apply 30%–50% markdown or initiate immediate supplier return.'
        : 'High Risk: Apply promotional markdown to accelerate velocity before critical window.';
    } else if (riskScore >= 50) {
      recommendedAction = 'Medium Risk: Display at prominent checkout display or propose 15% markdown.';
    } else if (riskScore >= 25) {
      recommendedAction = 'Moderate Risk: Ensure strict FEFO rotation to sell this batch first.';
    } else {
      recommendedAction = 'Low Risk: Normal FEFO sales pace is adequate. No intervention needed.';
    }
  }

  // 3. Risk Category Tiering
  let riskCategory = 'LOW';
  if (riskScore >= 75) riskCategory = 'VERY_HIGH';
  else if (riskScore >= 50) riskCategory = 'HIGH';
  else if (riskScore >= 25) riskCategory = 'MEDIUM';

  const estimatedValueAtRisk = Number((estimatedUnsold * purchasePrice).toFixed(2));
  const estimatedRetailLoss = Number((estimatedUnsold * sellingPrice).toFixed(2));

  // 4. Structured Output
  const predictionResult = {
    batchId: batch._id,
    batchNumber: batch.batchNumber || 'Primary',
    product: {
      _id: batch.product._id,
      name: batch.product.name,
      brand: batch.product.brand || '',
      category: batch.product.category,
      unit: batch.product.unit || 'piece'
    },
    daysRemaining,
    currentQuantity: currentQty,
    purchasePrice,
    sellingPrice,
    dailyVelocity: effectiveVelocity,
    projectedSellableQuantity: Math.min(currentQty, projectedSellable),
    estimatedUnsoldQuantity: estimatedUnsold,
    estimatedValueAtRisk,
    estimatedRetailLoss,
    riskScore,
    riskCategory,
    mainFactors: factors,
    recommendedAction,
    dataQuality: {
      hasSufficientSalesData: velocityData.hasSufficientData,
      salesDataPoints: velocityData.dataPointsCount,
      confidence: velocityData.confidence,
      dataSource
    },
    predictedAt: now.toISOString(),
    modelVersion: '1.0.0'
  };

  // Optional background log persistence
  if (options.persistLog) {
    AIPredictionLog.create({
      store: store?._id,
      predictionType: 'EXPIRY_RISK',
      product: batch.product._id,
      batch: batch._id,
      modelVersion: '1.0.0',
      inputs: {
        daysRemaining,
        currentQuantity: currentQty,
        dailyVelocity: effectiveVelocity,
        purchasePrice,
        sellingPrice
      },
      prediction: {
        riskScore,
        riskCategory,
        estimatedUnsoldQuantity: estimatedUnsold,
        estimatedValueAtRisk
      }
    }).catch(() => {});
  }

  return predictionResult;
};

/**
 * Predict and rank expiry risk across all active store batches
 */
const getActiveExpiryRiskQueue = async (options = {}) => {
  const { limit = 20, minRisk = 'MEDIUM' } = options;

  const batches = await InventoryBatch.find({
    isQuarantined: false,
    currentQuantity: { $gt: 0 }
  })
    .sort({ expiryDate: 1 })
    .lean();

  const predictions = [];

  for (const b of batches) {
    try {
      const pred = await predictBatchExpiryRisk(b._id, { persistLog: false });
      predictions.push(pred);
    } catch (err) {
      // Continue processing remaining batches
    }
  }

  // Filter by risk tier if specified
  const riskWeights = { VERY_HIGH: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const minWeight = riskWeights[minRisk] || 1;

  const filtered = predictions.filter((p) => (riskWeights[p.riskCategory] || 0) >= minWeight);

  // Sort descending by risk score, then by estimated value at risk
  filtered.sort((a, b) => b.riskScore - a.riskScore || b.estimatedValueAtRisk - a.estimatedValueAtRisk);

  return {
    queue: filtered.slice(0, limit),
    totalEvaluated: predictions.length,
    highRiskCount: predictions.filter((p) => p.riskScore >= 50).length
  };
};

module.exports = {
  predictBatchExpiryRisk,
  getActiveExpiryRiskQueue
};

