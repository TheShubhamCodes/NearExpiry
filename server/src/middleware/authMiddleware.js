const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');
const { jwtSecret } = require('../config/env');

const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Try reading HTTP-only cookie
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // 2. Fallback to Bearer token in Authorization header
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.'
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, jwtSecret);

    // Fetch user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User session invalid. User not found.'
      });
    }

    // Check active status
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the store owner.'
      });
    }

    // Attach user and store
    req.user = user;
    req.store = await Store.getStore();
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid session token. Please log in.'
    });
  }
};

// Middleware: restrict to owner role only
const requireOwner = (req, res, next) => {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Access restricted: Store Owner permissions required.'
    });
  }
  next();
};

module.exports = {
  authenticate,
  requireOwner
};

