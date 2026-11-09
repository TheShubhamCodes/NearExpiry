const expiryService = require('../services/expiryService');

/**
 * Expiry Overview Summary
 */
const getSummary = async (req, res, next) => {
  try {
    const summary = await expiryService.getExpirySummary();
    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paginated batches list with dynamic expiry status, search, and filtering
 */
const getBatches = async (req, res, next) => {
  try {
    const result = await expiryService.getExpiryBatches(req.query);
    return res.status(200).json({
      success: true,
      data: result.batches,
      pagination: result.pagination,
      storeSettings: result.storeSettings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * FEFO (First Expired, First Out) Recommendations
 */
const getFEFO = async (req, res, next) => {
  try {
    const fefoData = await expiryService.getFEFORecommendations();
    return res.status(200).json({
      success: true,
      data: fefoData.recommendations,
      totalProducts: fefoData.totalProducts,
      storeSettings: fefoData.storeSettings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Monthly Expiry Calendar Data
 */
const getCalendar = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const calendarData = await expiryService.getExpiryCalendarData({ month, year });
    return res.status(200).json({
      success: true,
      data: calendarData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deterministic Expiry Risk Assessment
 */
const getRisk = async (req, res, next) => {
  try {
    const riskData = await expiryService.getExpiryRiskAssessment();
    return res.status(200).json({
      success: true,
      data: riskData
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  getBatches,
  getFEFO,
  getCalendar,
  getRisk
};

