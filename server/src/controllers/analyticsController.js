const analyticsService = require('../services/analyticsService');
const {
  dashboardQuerySchema,
  reportQuerySchema
} = require('../utils/validators');

/**
 * Get comprehensive Advanced Business Dashboard KPIs & Comparisons
 */
const getDashboard = async (req, res, next) => {
  try {
    const validated = dashboardQuerySchema.parse(req.query);
    const result = await analyticsService.getDashboardAnalytics(
      validated.period,
      validated.startDate,
      validated.endDate
    );
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory distribution across 6 explicit expiry statuses
 */
const getExpiryDistribution = async (req, res, next) => {
  try {
    const result = await analyticsService.getExpiryDistribution();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get category-wise inventory valuation and risk breakdown
 */
const getCategoryValuation = async (req, res, next) => {
  try {
    const result = await analyticsService.getCategoryValuation();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get batch-wise stock ageing analysis (0-30, 31-60, 61-90, 90+ days)
 */
const getStockAgeing = async (req, res, next) => {
  try {
    const result = await analyticsService.getStockAgeing();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory movement timeline trends over the selected period
 */
const getMovementTrends = async (req, res, next) => {
  try {
    const validated = dashboardQuerySchema.parse(req.query);
    const result = await analyticsService.getMovementTrends(
      validated.period,
      validated.startDate,
      validated.endDate
    );
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top products with the highest expiry risk
 */
const getTopExpiryRiskProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await analyticsService.getTopExpiryRiskProducts(limit);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get FEFO compliance metrics
 */
const getFEFOCompliance = async (req, res, next) => {
  try {
    const result = await analyticsService.getFEFOCompliance();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get data rows for a specific report type (expiry, valuation, movement, markdowns, returns, disposal, lowStock)
 */
const getReport = async (req, res, next) => {
  try {
    const reportType = req.params.type;
    const validated = reportQuerySchema.parse(req.query);
    const result = await analyticsService.getReportData(reportType, validated);
    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: result.pagination,
      storeSettings: result.storeSettings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export filtered report as RFC 4180-compliant CSV file download
 */
const exportReportCSV = async (req, res, next) => {
  try {
    const reportType = req.params.type;
    const validated = reportQuerySchema.parse(req.query);
    const csvContent = await analyticsService.exportReportCSV(reportType, validated);

    const filename = `nearexpiry-${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getExpiryDistribution,
  getCategoryValuation,
  getStockAgeing,
  getMovementTrends,
  getTopExpiryRiskProducts,
  getFEFOCompliance,
  getReport,
  exportReportCSV
};

