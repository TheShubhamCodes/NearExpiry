const mongoose = require('mongoose');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const openFoodFactsService = require('./openFoodFactsService');

// Standard supermarket category list for suggestions
const DEFAULT_CATEGORIES = [
  'Dairy & Eggs',
  'Bakery & Bread',
  'Fresh Produce',
  'Meat & Seafood',
  'Pantry Staples',
  'Beverages',
  'Snacks & Sweets',
  'Frozen Foods',
  'Personal Care',
  'Household & Cleaning',
  'General'
];

/**
 * Create a new product in the store catalog
 */
const createProduct = async (productData, userId) => {
  // If barcode is provided, check if it already exists
  if (productData.barcode) {
    const existing = await Product.findOne({ barcode: productData.barcode });
    if (existing) {
      const error = new Error(`A product with barcode "${productData.barcode}" already exists (${existing.name}).`);
      error.statusCode = 400;
      throw error;
    }
  }

  const product = new Product({
    ...productData,
    createdBy: userId
  });

  await product.save();
  await product.populate('createdBy', 'fullName email role');

  return product;
};

/**
 * List products with search, category filtering, and pagination
 */
const getProducts = async ({
  search = '',
  category = '',
  page = 1,
  limit = 10,
  sortBy = 'createdAt',
  sortOrder = 'desc'
}) => {
  const filter = {};

  // Text search on name, brand, or barcode
  if (search && search.trim().length > 0) {
    const term = search.trim();
    const regex = new RegExp(term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    filter.$or = [
      { name: regex },
      { brand: regex },
      { barcode: regex },
      { description: regex }
    ];
  }

  // Category filter
  if (category && category !== 'All' && category.trim().length > 0) {
    filter.category = category.trim();
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'fullName email role')
      .lean(),
    Product.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    products,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Get product by MongoDB ID
 */
const getProductById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid product ID format');
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findById(id).populate('createdBy', 'fullName email role');
  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  return product;
};

/**
 * Look up product by barcode
 * 1. Checks local store database first
 * 2. If not found, calls Open Food Facts API
 */
const lookupBarcode = async (barcode) => {
  if (!barcode || typeof barcode !== 'string' || barcode.trim().length === 0) {
    const error = new Error('Barcode is required for lookup');
    error.statusCode = 400;
    throw error;
  }

  const cleanBarcode = barcode.trim();

  // 1. Check local catalog
  const localProduct = await Product.findOne({ barcode: cleanBarcode })
    .populate('createdBy', 'fullName email role')
    .lean();

  if (localProduct) {
    return {
      source: 'local',
      found: true,
      product: localProduct,
      message: 'Product found in local store catalog.'
    };
  }

  // 2. Query Open Food Facts external database
  const offResult = await openFoodFactsService.lookupBarcode(cleanBarcode);

  if (offResult.found) {
    return {
      source: 'openfoodfacts',
      found: true,
      product: offResult.product,
      message: 'Product details retrieved from Open Food Facts.'
    };
  }

  return {
    source: 'none',
    found: false,
    barcode: cleanBarcode,
    message: offResult.message || 'No product found for this barcode. You can enter details manually.'
  };
};

/**
 * Update an existing product
 */
const updateProduct = async (id, updateData) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid product ID format');
    error.statusCode = 400;
    throw error;
  }

  // If barcode is being updated, verify it does not collide with another product
  if (updateData.barcode) {
    const existing = await Product.findOne({
      barcode: updateData.barcode,
      _id: { $ne: id }
    });
    if (existing) {
      const error = new Error(`Barcode "${updateData.barcode}" is already assigned to "${existing.name}".`);
      error.statusCode = 400;
      throw error;
    }
  }

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).populate('createdBy', 'fullName email role');

  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  return product;
};

/**
 * Delete a product by ID (Protected from accidental deletion if batches exist)
 */
const deleteProduct = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid product ID format');
    error.statusCode = 400;
    throw error;
  }

  // Business rule: Do not allow deletion if associated inventory batches exist
  const batchCount = await InventoryBatch.countDocuments({ product: id });
  if (batchCount > 0) {
    const error = new Error(
      `Cannot delete product: this product has ${batchCount} associated inventory batch(es). Please archive or remove batches first.`
    );
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    deletedId: id,
    productName: product.name,
    barcode: product.barcode
  };
};

/**
 * Get distinct categories present in catalog combined with default categories
 */
const getCategories = async () => {
  const distinctInDb = await Product.distinct('category');
  const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...distinctInDb])).sort();
  return merged;
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  lookupBarcode,
  updateProduct,
  deleteProduct,
  getCategories,
  DEFAULT_CATEGORIES
};

