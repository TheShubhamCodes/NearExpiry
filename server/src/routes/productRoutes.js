const express = require('express');
const productController = require('../controllers/productController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All product management endpoints require authentication
router.use(authenticate);

// Specific sub-paths before parameterized :id route
router.get('/categories', productController.getCategories);
router.get('/lookup/:barcode', productController.lookupBarcode);
router.post('/upload-image', productController.uploadImage);

// Collection operations
router.route('/')
  .get(productController.getProducts)
  .post(productController.createProduct);

// Single resource operations
router.route('/:id')
  .get(productController.getProductById)
  .put(productController.updateProduct)
  .delete(productController.deleteProduct);

module.exports = router;

