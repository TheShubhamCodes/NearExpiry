const authService = require('../services/authService');
const { sendTokenCookie, clearTokenCookie } = require('../utils/token');
const { resetAuthRateLimit } = require('../middleware/rateLimiter');

const getSetupStatus = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const status = await authService.getSetupStatus();
    return res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
};

const setup = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { user, store, token } = await authService.setupInitialOwner(req.body);
    
    // Set HTTP-only secure cookie (token is not exposed in JSON body)
    sendTokenCookie(res, token);

    // Reset rate limiter on success
    resetAuthRateLimit(req.ip);

    return res.status(201).json({
      success: true,
      message: 'Store and initial owner account initialized successfully.',
      data: {
        user,
        store
      }
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { user, store, token } = await authService.loginUser(req.body);

    // Set HTTP-only secure cookie (token is not exposed in JSON body)
    sendTokenCookie(res, token);

    // Reset rate limiter on success
    resetAuthRateLimit(req.ip);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      data: {
        user,
        store
      }
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    clearTokenCookie(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      data: {
        user: req.user,
        store: req.store
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSetupStatus,
  setup,
  login,
  logout,
  getMe
};

