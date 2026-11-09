const express = require('express');
const { getStore, updateStore } = require('../controllers/storeController');
const { authenticate, requireOwner } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);

// Store info is viewable by all authenticated staff
router.get('/', getStore);

// Store modifications are strictly restricted to the store owner
router.put('/', requireOwner, updateStore);

module.exports = router;

