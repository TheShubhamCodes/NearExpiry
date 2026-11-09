const express = require('express');
const {
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
} = require('../controllers/aiController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All AI and sales routes require authenticated session
router.use(authenticate);

// Sales recording & transaction history
router.post('/sales', recordSale);
router.get('/sales', getSalesHistory);

// High-level predictive dashboard summary
router.get('/summary', getAISummary);

// Predictive Expiry Risk Queue
router.get('/risk-queue', getExpiryRiskQueue);
router.get('/risk-queue/:batchId', predictBatchRisk);

// Intelligent Markdown Optimizer
router.get('/discounts', getDiscountRecommendations);
router.get('/discounts/:batchId', recommendBatchDiscount);

// Demand Forecasting & Reorder Recommendations
router.get('/demand', getDemandForecasts);
router.get('/demand/:productId', forecastProduct);

// Operational Anomalies & Store Insights
router.get('/insights', getStoreInsights);

// Model Performance & Historical Evaluation
router.get('/evaluation', evaluateModel);

module.exports = router;

