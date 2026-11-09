const express = require('express');
const {
  getSetupStatus,
  setup,
  login,
  logout,
  getMe
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { authRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Public setup & authentication routes
router.get('/setup-status', getSetupStatus);
router.post('/setup', authRateLimiter(5, 15 * 60 * 1000), setup);
router.post('/register', authRateLimiter(5, 15 * 60 * 1000), setup);
router.post('/login', authRateLimiter(10, 15 * 60 * 1000), login);
router.post('/logout', logout);

// Authenticated current session route
router.get('/me', authenticate, getMe);

module.exports = router;

