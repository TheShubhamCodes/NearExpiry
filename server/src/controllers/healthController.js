const healthService = require('../services/healthService');

const getHealth = (req, res, next) => {
  try {
    const healthData = healthService.getSystemHealth();
    return res.status(200).json({
      success: true,
      message: 'NearExpiry backend is running smoothly',
      data: healthData
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHealth
};

