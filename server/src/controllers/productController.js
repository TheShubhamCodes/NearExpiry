const productService = require('../services/productService');
const cloudinaryService = require('../services/cloudinaryService');
const {
  createProductSchema,
  updateProductSchema,
  productQuerySchema
} = require('../utils/validators');

/**
 * Create a new product
 */
const createProduct = async (req, res, next) => {
  try {
    const validatedData = createProductSchema.parse(req.body);
    const product = await productService.createProduct(validatedData, req.user._id);

    return res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      data: { product }
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
      });
    }
    next(error);
  }
};

/**
 * List products with search, category filtering, and pagination
 */
const getProducts = async (req, res, next) => {
  try {
    const validatedQuery = productQuerySchema.parse(req.query);
    const result = await productService.getProducts(validatedQuery);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
      });
    }
    next(error);
  }
};

/**
 * Get product by ID
 */
const getProductById = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);

    return res.status(200).json({
      success: true,
      data: { product }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Look up barcode (local database first, then Open Food Facts)
 */
const lookupBarcode = async (req, res, next) => {
  try {
    const result = await productService.lookupBarcode(req.params.barcode);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing product
 */
const updateProduct = async (req, res, next) => {
  try {
    const validatedData = updateProductSchema.parse(req.body);
    const product = await productService.updateProduct(req.params.id, validatedData);

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      data: { product }
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
      });
    }
    next(error);
  }
};

/**
 * Delete a product by ID
 */
const deleteProduct = async (req, res, next) => {
  try {
    const result = await productService.deleteProduct(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Product removed from catalog.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available categories
 */
const getCategories = async (req, res, next) => {
  try {
    const categories = await productService.getCategories();

    return res.status(200).json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload product image via backend Cloudinary service
 */
const uploadImage = async (req, res, next) => {
  try {
    const result = await cloudinaryService.uploadProductImage(req.body?.image);
    return res.status(200).json({
      success: true,
      message: 'Product image uploaded successfully.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  lookupBarcode,
  updateProduct,
  deleteProduct,
  getCategories,
  uploadImage
};

