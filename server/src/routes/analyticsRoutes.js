const express = require('express');
const {
  getDashboard,
  getExpiryDistribution,
  getCategoryValuation,
  getStockAgeing,
  getMovementTrends,
  getTopExpiryRiskProducts,
  getFEFOCompliance,
  getReport,
  exportReportCSV
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All analytics routes require active authentication
router.use(authenticate);

// Executive & operational dashboard metrics
router.get('/dashboard', getDashboard);

// Visual analytics endpoints
router.get('/expiry-distribution', getExpiryDistribution);
router.get('/category-valuation', getCategoryValuation);
router.get('/stock-ageing', getStockAgeing);
router.get('/movement-trends', getMovementTrends);
router.get('/risk-products', getTopExpiryRiskProducts);
router.get('/fefo-compliance', getFEFOCompliance);

// Business reports & CSV export
router.get('/reports/:type', getReport);
router.get('/reports/:type/export', exportReportCSV);

module.exports = router;

