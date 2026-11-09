const mongoose = require('mongoose');
const InventoryBatch = require('../../models/InventoryBatch');
const Store = require('../../models/Store');
const AIPredictionLog = require('../../models/AIPredictionLog');
const { getProductSalesVelocity, getCategorySalesVelocity } = require('./salesService');
const { getDaysUntilExpiry } = require('../../utils/expiryUtils');

/**
 * Recommend an intelligent, margin-conscious markdown percentage for an inventory batch
 */
const recommendIntelligentDiscount = async (batchId, options = {}) => {
  const batch = await InventoryBatch.findById(batchId).populate('product');
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  const store = await Store.getStore();
  const timezone = store?.timezone || 'Asia/Kolkata';
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';
  const now = new Date();

  const daysRemaining = getDaysUntilExpiry(batch.expiryDate, now, timezone);
  const currentQty = batch.currentQuantity || 0;
  const purchasePrice = batch.purchasePrice || 0;
  const originalPrice = batch.sellingPrice || (purchasePrice > 0 ? purchasePrice * 1.3 : 1.0);

  if (batch.isQuarantined || currentQty <= 0) {
    return {
      batchId: batch._id,
      applicable: false,
      reason: batch.isQuarantined ? 'Batch is quarantined' : 'Batch has 0 available units'
    };
  }

  if (daysRemaining < 0) {
    return {
      batchId: batch._id,
      applicable: false,
      reason: 'Batch has already expired; must be quarantined or disposed instead of discounted.'
    };
  }

  // Store AI settings
  const minMarginPercent = store?.aiSettings?.minMarginPercent !== undefined ? store.aiSettings.minMarginPercent : 10;
  const storeMarkdownRules = store?.markdownRules || { warningDiscountPercent: 15, criticalDiscountPercent: 30, todayDiscountPercent: 50 };

  // Sales velocity
  const velocityData = await getProductSalesVelocity(batch.product._id, 30);
  let baseVelocity = velocityData.dailyVelocity;

  if (baseVelocity <= 0) {
    const catVel = await getCategorySalesVelocity(batch.product.category, 30);
    baseVelocity = catVel.dailyVelocity;
  }

  // Candidate discounts to evaluate
  let candidatePercents = [10, 15, 20, 25, 30, 40, 50];
  if (daysRemaining === 0) {
    // Expiring today: prioritize clearance liquidation
    candidatePercents = [30, 40, 50, 60, 70];
  } else if (daysRemaining <= 3) {
    candidatePercents = [20, 25, 30, 35, 40, 50];
  }

  let bestCandidate = null;
  let maxNetRecovery = -Infinity;

  candidatePercents.forEach((discount) => {
    const discountedPrice = Number((originalPrice * (1 - discount / 100)).toFixed(2));
    const unitMargin = discountedPrice - purchasePrice;
    const marginPercent = purchasePrice > 0 ? (unitMargin / purchasePrice) * 100 : 0;

    // Margin rule: unless expiring today, require margin >= minMarginPercent
    if (daysRemaining > 1 && marginPercent < minMarginPercent && discount > 15) {
      return; // Skip if breaches store margin rule
    }

    // Velocity boost multiplier based on empirical price elasticity
    // e.g. 20% discount gives (1 + 0.20 * 1.75) = 1.35x velocity
    const velocityMultiplier = 1 + (discount / 100) * 1.75;
    const boostedVelocity = baseVelocity * velocityMultiplier;

    // Projected units sold over remaining days
    const effectiveDays = Math.max(1, daysRemaining);
    const projectedSold = Math.min(currentQty, Number((boostedVelocity * effectiveDays).toFixed(1)));
    const projectedUnsold = Math.max(0, currentQty - projectedSold);

    // Expected financial net recovery:
    // (Revenue from units sold) - (Loss of unsold units discarded at purchase cost)
    const expectedRevenue = projectedSold * discountedPrice;
    const projectedDisposalLoss = projectedUnsold * purchasePrice;
    const netRecovery = expectedRevenue - projectedDisposalLoss;

    if (netRecovery > maxNetRecovery || !bestCandidate) {
      maxNetRecovery = netRecovery;
      bestCandidate = {
        discountPercent: discount,
        discountedPrice,
        marginPercent: Number(marginPercent.toFixed(1)),
        projectedSold,
        projectedUnsold,
        expectedRevenue: Number(expectedRevenue.toFixed(2)),
        projectedDisposalLoss: Number(projectedDisposalLoss.toFixed(2)),
        netRecovery: Number(netRecovery.toFixed(2))
      };
    }
  });

  // Fallback to store rule if no candidate passed margin check
  if (!bestCandidate) {
    const fallbackPercent = daysRemaining === 0
      ? storeMarkdownRules.todayDiscountPercent
      : daysRemaining <= 3
      ? storeMarkdownRules.criticalDiscountPercent
      : storeMarkdownRules.warningDiscountPercent;

    const discPrice = Number((originalPrice * (1 - fallbackPercent / 100)).toFixed(2));
    bestCandidate = {
      discountPercent: fallbackPercent,
      discountedPrice: discPrice,
      marginPercent: purchasePrice > 0 ? Number((((discPrice - purchasePrice) / purchasePrice) * 100).toFixed(1)) : 0,
      projectedSold: Math.min(currentQty, Math.ceil(baseVelocity * Math.max(1, daysRemaining))),
      projectedUnsold: Math.max(0, currentQty - Math.ceil(baseVelocity * Math.max(1, daysRemaining))),
      expectedRevenue: Number((Math.min(currentQty, Math.ceil(baseVelocity * Math.max(1, daysRemaining))) * discPrice).toFixed(2)),
      projectedDisposalLoss: 0,
      netRecovery: 0
    };
  }

  // Plain-language explanation
  let explanation = '';
  if (daysRemaining === 0) {
    explanation = `Batch expires today. Recommending aggressive ${bestCandidate.discountPercent}% clearance discount (${currencySymbol}${originalPrice} → ${currencySymbol}${bestCandidate.discountedPrice}) to liquidate ${currentQty} units before close of business.`;
  } else if (daysRemaining <= 3) {
    explanation = `Critical window (${daysRemaining} days remaining). A ${bestCandidate.discountPercent}% discount is projected to boost sales velocity by ~${Math.round((bestCandidate.discountPercent * 1.75))}% to sell ~${bestCandidate.projectedSold} units while safeguarding a ${bestCandidate.marginPercent}% unit margin.`;
  } else {
    explanation = `Approaching expiry in ${daysRemaining} days. A promotional ${bestCandidate.discountPercent}% markdown is projected to sell through ${bestCandidate.projectedSold} units before the critical threshold, protecting inventory capital.`;
  }

  const result = {
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
    originalPrice,
    suggestedDiscountPercent: bestCandidate.discountPercent,
    suggestedSellingPrice: bestCandidate.discountedPrice,
    marginPercentAtDiscount: bestCandidate.marginPercent,
    estimatedQuantityToSell: bestCandidate.projectedSold,
    estimatedRemainingUnsold: bestCandidate.projectedUnsold,
    expectedRevenue: bestCandidate.expectedRevenue,
    estimatedDisposalLossAvoided: Number((bestCandidate.projectedSold * purchasePrice).toFixed(2)),
    explanation,
    disclaimer: 'Predictions are empirical estimates based on sales velocity and price elasticity; sales are never guaranteed.',
    requiresOwnerApproval: true,
    suggestedAt: now.toISOString(),
    modelVersion: '1.0.0'
  };

  // Optional log
  if (options.persistLog) {
    AIPredictionLog.create({
      store: store?._id,
      predictionType: 'DISCOUNT_RECOMMENDATION',
      product: batch.product._id,
      batch: batch._id,
      modelVersion: '1.0.0',
      inputs: {
        daysRemaining,
        currentQuantity: currentQty,
        originalPrice,
        purchasePrice,
        dailyVelocity: baseVelocity
      },
      prediction: {
        suggestedDiscountPercent: bestCandidate.discountPercent,
        suggestedSellingPrice: bestCandidate.discountedPrice,
        estimatedQuantityToSell: bestCandidate.projectedSold
      }
    }).catch(() => {});
  }

  return result;
};

/**
 * Get recommendations across all active near-expiry inventory batches
 */
const getActiveDiscountRecommendations = async (options = {}) => {
  const store = await Store.getStore();
  const timezone = store?.timezone || 'Asia/Kolkata';
  const warningDays = store?.expiryWarningDays || 7;
  const now = new Date();

  // Find batches approaching expiry
  const batches = await InventoryBatch.find({
    isQuarantined: false,
    currentQuantity: { $gt: 0 },
    activeMarkdown: null // Not already under active markdown
  })
    .sort({ expiryDate: 1 })
    .lean();

  const recommendations = [];

  for (const b of batches) {
    const days = getDaysUntilExpiry(b.expiryDate, now, timezone);
    if (days >= 0 && days <= warningDays) {
      try {
        const rec = await recommendIntelligentDiscount(b._id, { persistLog: false });
        if (rec.applicable !== false) {
          recommendations.push(rec);
        }
      } catch (err) {
        // Skip
      }
    }
  }

  // Sort by urgency: lowest days remaining, then highest quantity
  recommendations.sort((a, b) => a.daysRemaining - b.daysRemaining || b.currentQuantity - a.currentQuantity);

  return {
    recommendations: recommendations.slice(0, options.limit || 15),
    totalCandidates: recommendations.length,
    estimatedTotalRevenueRecovery: Number(
      recommendations.reduce((acc, r) => acc + (r.expectedRevenue || 0), 0).toFixed(2)
    )
  };
};

module.exports = {
  recommendIntelligentDiscount,
  getActiveDiscountRecommendations
};

