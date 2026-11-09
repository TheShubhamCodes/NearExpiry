const inventoryService = require('../services/inventoryService');
const {
  createBatchSchema,
  updateBatchSchema,
  adjustStockSchema,
  batchQuerySchema
} = require('../utils/validators');

/**
 * Receive new stock and create inventory batch
 */
const receiveStock = async (req, res, next) => {
  try {
    const validatedData = createBatchSchema.parse(req.body);
    const result = await inventoryService.receiveStock(validatedData, req.user._id);

    return res.status(201).json({
      success: true,
      message: 'Stock received and batch recorded successfully.',
      data: result
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
 * List batches with filters and pagination
 */
const getBatches = async (req, res, next) => {
  try {
    const validatedQuery = batchQuerySchema.parse(req.query);
    const result = await inventoryService.getBatches(validatedQuery);

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
 * Get batch by ID with audit movement history
 */
const getBatchById = async (req, res, next) => {
  try {
    const result = await inventoryService.getBatchById(req.params.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update batch metadata
 */
const updateBatch = async (req, res, next) => {
  try {
    const validatedData = updateBatchSchema.parse(req.body);
    const batch = await inventoryService.updateBatch(req.params.id, validatedData);

    return res.status(200).json({
      success: true,
      message: 'Batch information updated successfully.',
      data: { batch }
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
 * Adjust stock quantity with reason
 */
const adjustStock = async (req, res, next) => {
  try {
    const validatedData = adjustStockSchema.parse(req.body);
    const result = await inventoryService.adjustStock(req.params.id, validatedData, req.user._id);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
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
 * Get all batches for a specific product
 */
const getProductBatches = async (req, res, next) => {
  try {
    const result = await inventoryService.getProductBatches(req.params.productId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get real-time inventory overview summary statistics
 */
const getInventorySummary = async (req, res, next) => {
  try {
    const summary = await inventoryService.getInventorySummary();

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get low stock products
 */
const getLowStock = async (req, res, next) => {
  try {
    const threshold = req.query.threshold ? parseInt(req.query.threshold, 10) : 5;
    const items = await inventoryService.getLowStock(threshold);

    return res.status(200).json({
      success: true,
      data: { items }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List stock movements (audit log)
 */
const getMovements = async (req, res, next) => {
  try {
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const result = await inventoryService.getMovements({
      batch: req.query.batch,
      product: req.query.product,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  receiveStock,
  getBatches,
  getBatchById,
  updateBatch,
  adjustStock,
  getProductBatches,
  getInventorySummary,
  getLowStock,
  getMovements
};

