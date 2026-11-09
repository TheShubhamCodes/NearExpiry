const aiService = require('../services/aiService');
const {
  recordSaleSchema,
  riskQueueQuerySchema,
  forecastQuerySchema
} = require('../utils/validators');

/**
 * Record a verified retail sale and update inventory
 */
const recordSale = async (req, res, next) => {
  try {
    const validated = recordSaleSchema.parse(req.body);
    const result = await aiService.recordSale(validated, req.user);
    return res.status(201).json({
      success: true,
      message: 'Retail sale recorded and inventory updated successfully',
      data: result.sale
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get sales history with filtering and pagination
 */
const getSalesHistory = async (req, res, next) => {
  try {
    const result = await aiService.getSalesHistory(req.query);
    return res.status(200).json({
      success: true,
      data: result.sales,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get executive AI Summary & predictive KPI counts
 */
const getAISummary = async (req, res, next) => {
  try {
    const result = await aiService.getAISummary();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active batches ranked by predicted expiry risk
 */
const getExpiryRiskQueue = async (req, res, next) => {
  try {
    const validated = riskQueueQuerySchema.parse(req.query);
    const result = await aiService.getActiveExpiryRiskQueue(validated);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Predict expiry risk probability for a specific batch
 */
const predictBatchRisk = async (req, res, next) => {
  try {
    const result = await aiService.predictBatchExpiryRisk(req.params.batchId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get intelligent markdown discount recommendations
 */
const getDiscountRecommendations = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 15;
    const result = await aiService.getActiveDiscountRecommendations({ limit });
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get discount recommendation for a specific batch
 */
const recommendBatchDiscount = async (req, res, next) => {
  try {
    const result = await aiService.recommendIntelligentDiscount(req.params.batchId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get demand forecasts and reorder suggestions across catalog
 */
const getDemandForecasts = async (req, res, next) => {
  try {
    const validated = forecastQuerySchema.parse(req.query);
    const result = await aiService.getCatalogDemandForecasts(validated);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get demand forecast for a specific product
 */
const forecastProduct = async (req, res, next) => {
  try {
    const horizonDays = parseInt(req.query.horizonDays, 10) || 14;
    const result = await aiService.forecastProductDemand(req.params.productId, { horizonDays });
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Detect operational anomalies, recurring culprits, and FEFO opportunities
 */
const getStoreInsights = async (req, res, next) => {
  try {
    const result = await aiService.detectStoreInsights();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Evaluate model accuracy on historical sales split (MAE, RMSE, Baseline)
 */
const evaluateModel = async (req, res, next) => {
  try {
    const result = await aiService.evaluateDemandModel();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  recordSale,
  getSalesHistory,
  getAISummary,
  getExpiryRiskQueue,
  predictBatchRisk,
  getDiscountRecommendations,
  recommendBatchDiscount,
  getDemandForecasts,
  forecastProduct,
  getStoreInsights,
  evaluateModel
};

