const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All inventory management operations require authentication
router.use(authenticate);

// Aggregated / Overview Endpoints
router.get('/summary', inventoryController.getInventorySummary);
router.get('/low-stock', inventoryController.getLowStock);
router.get('/movements', inventoryController.getMovements);
router.get('/products/:productId/batches', inventoryController.getProductBatches);

// Receive stock / create batch
router.post('/receive', inventoryController.receiveStock);
router.post('/batches', inventoryController.receiveStock);

// Batch collection
router.get('/batches', inventoryController.getBatches);

// Single batch operations
router.get('/batches/:id', inventoryController.getBatchById);
router.put('/batches/:id', inventoryController.updateBatch);
router.post('/batches/:id/adjust', inventoryController.adjustStock);

module.exports = router;

