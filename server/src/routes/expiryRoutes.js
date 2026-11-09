const express = require('express');
const {
  getSummary,
  getBatches,
  getFEFO,
  getCalendar,
  getRisk
} = require('../controllers/expiryController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All expiry endpoints require active authentication (available to both owners and employees)
router.use(authenticate);

router.get('/summary', getSummary);
router.get('/batches', getBatches);
router.get('/fefo', getFEFO);
router.get('/calendar', getCalendar);
router.get('/risk', getRisk);

module.exports = router;

