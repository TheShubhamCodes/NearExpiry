const healthService = require('../services/healthService');

const getHealth = (req, res, next) => {
  try {
    const healthData = healthService.getSystemHealth();
    const isConnected = Boolean(healthData.database?.connected);

    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'NearExpiry API degraded: database disconnected',
        data: {
          ...healthData,
          status: 'degraded'
        }
      });
    }

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
