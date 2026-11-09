const salesService = require('./ai/salesService');
const predictionEngine = require('./ai/predictionEngine');
const discountOptimizer = require('./ai/discountOptimizer');
const demandForecaster = require('./ai/demandForecaster');
const insightDetector = require('./ai/insightDetector');
const modelEvaluator = require('./ai/modelEvaluator');
const Store = require('../models/Store');
const AIPredictionLog = require('../models/AIPredictionLog');

/**
 * Get comprehensive AI Summary KPIs for the executive intelligence dashboard
 */
const getAISummary = async () => {
  const [
    riskQueueRes,
    discountRecRes,
    forecastRes,
    insightsRes,
    evalRes,
    store
  ] = await Promise.all([
    predictionEngine.getActiveExpiryRiskQueue({ limit: 100, minRisk: 'MEDIUM' }),
    discountOptimizer.getActiveDiscountRecommendations({ limit: 100 }),
    demandForecaster.getCatalogDemandForecasts({ limit: 100 }),
    insightDetector.detectStoreInsights(),
    modelEvaluator.evaluateDemandModel().catch(() => ({ status: 'INSUFFICIENT_DATA' })),
    Store.getStore()
  ]);

  const highRiskBatchesCount = riskQueueRes.highRiskCount || 0;
  const totalValueAtRisk = Number(
    (riskQueueRes.queue || []).reduce((acc, r) => acc + (r.estimatedValueAtRisk || 0), 0).toFixed(2)
  );

  const potentialRevenueRecovery = discountRecRes.estimatedTotalRevenueRecovery || 0;
  const stockoutRiskCount = forecastRes.stockoutDangerCount || 0;
  const reorderRequiredCount = forecastRes.reorderRequiredCount || 0;
  const activeInsightsCount = insightsRes.totalInsights || 0;

  return {
    summary: {
      highRiskBatchesCount,
      totalValueAtRisk,
      discountRecommendationsCount: discountRecRes.totalCandidates || 0,
      potentialRevenueRecovery,
      stockoutRiskCount,
      reorderRequiredCount,
      activeInsightsCount
    },
    modelStatus: {
      status: evalRes.status,
      modelVersion: '1.0.0',
      confidence: highRiskBatchesCount > 0 ? 'ACTIVE' : 'READY',
      metrics: evalRes.metrics || null
    },
    storeSettings: {
      currency: store?.currency || 'USD ($)',
      timezone: store?.timezone || 'Asia/Kolkata',
      aiSettings: store?.aiSettings || {}
    }
  };
};

module.exports = {
  // Sales
  recordSale: salesService.recordSale,
  getSalesHistory: salesService.getSalesHistory,
  getProductSalesVelocity: salesService.getProductSalesVelocity,
  getCategorySalesVelocity: salesService.getCategorySalesVelocity,

  // Prediction Engine
  predictBatchExpiryRisk: predictionEngine.predictBatchExpiryRisk,
  getActiveExpiryRiskQueue: predictionEngine.getActiveExpiryRiskQueue,

  // Discount Optimizer
  recommendIntelligentDiscount: discountOptimizer.recommendIntelligentDiscount,
  getActiveDiscountRecommendations: discountOptimizer.getActiveDiscountRecommendations,

  // Demand Forecaster
  forecastProductDemand: demandForecaster.forecastProductDemand,
  getCatalogDemandForecasts: demandForecaster.getCatalogDemandForecasts,

  // Insights & Anomaly Detection
  detectStoreInsights: insightDetector.detectStoreInsights,

  // Model Evaluation
  evaluateDemandModel: modelEvaluator.evaluateDemandModel,

  // Executive Summary
  getAISummary
};

