const mongoose = require('mongoose');
const InventoryBatch = require('../models/InventoryBatch');
const StockMovement = require('../models/StockMovement');
const Product = require('../models/Product');
const {
  getStartOfToday,
  getEndOfToday,
  getSevenDaysLater,
  computeBatchStatus
} = require('../utils/expiryUtils');

// Centralized default threshold for low-stock alerts
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Receive new stock and record initial batch + movement
 * Implements atomic compensation rollback: if movement fails, batch is purged.
 */
const receiveStock = async (batchData, userId) => {
  const {
    productId,
    batchNumber = '',
    quantityReceived,
    purchasePrice,
    sellingPrice = null,
    manufacturingDate = null,
    expiryDate,
    receivedDate = new Date(),
    supplierName = '',
    supplierInvoiceNumber = '',
    notes = ''
  } = batchData;

  // 1. Verify product exists
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('Invalid product ID');
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findById(productId);
  if (!product) {
    const error = new Error('Product not found in store catalog');
    error.statusCode = 404;
    throw error;
  }

  // 2. Validate dates
  if (manufacturingDate && expiryDate) {
    const mfg = new Date(manufacturingDate);
    const exp = new Date(expiryDate);
    if (exp < mfg) {
      const error = new Error('Expiry date cannot be earlier than manufacturing date');
      error.statusCode = 400;
      throw error;
    }
  }

  // 3. Create batch record with compensation rollback
  let createdBatch = null;

  try {
    const batch = new InventoryBatch({
      product: productId,
      batchNumber: batchNumber.trim(),
      quantityReceived,
      currentQuantity: quantityReceived, // initial available equals received
      purchasePrice,
      sellingPrice,
      manufacturingDate,
      expiryDate,
      receivedDate,
      supplierName: supplierName.trim(),
      supplierInvoiceNumber: supplierInvoiceNumber.trim(),
      notes: notes.trim(),
      createdBy: userId
    });

    await batch.save();
    createdBatch = batch;

    // 4. Record immutable stock movement: STOCK_RECEIVED
    const movement = new StockMovement({
      product: productId,
      batch: batch._id,
      movementType: 'STOCK_RECEIVED',
      quantityChanged: quantityReceived,
      quantityBefore: 0,
      quantityAfter: quantityReceived,
      reason: notes ? `Initial stock receipt: ${notes.slice(0, 200)}` : 'Initial stock receipt',
      user: userId
    });

    await movement.save();

    // 5. Populate and return
    await batch.populate('product', 'name brand barcode category unit imageUrl');
    await batch.populate('createdBy', 'fullName email role');

    return { batch, movement };
  } catch (err) {
    // Atomic rollback: if batch was saved but movement logging failed, delete orphan batch
    if (createdBatch && createdBatch._id) {
      try {
        await InventoryBatch.findByIdAndDelete(createdBatch._id);
      } catch (rollbackErr) {
        console.error('[Rollback Error] Failed to delete orphaned batch:', rollbackErr);
      }
    }
    throw err;
  }
};

/**
 * List batches with search, filters, and pagination
 * Uses startOfToday and sevenDaysLater date boundaries.
 */
const getBatches = async ({
  product = '',
  search = '',
  category = '',
  status = 'all',
  page = 1,
  limit = 10,
  sortBy = 'expiryDate',
  sortOrder = 'asc'
}) => {
  const filter = {};
  const startOfToday = getStartOfToday();
  const endOfToday = getEndOfToday();
  const sevenDaysLater = getSevenDaysLater();

  // Filter by explicit product ID
  if (product && mongoose.Types.ObjectId.isValid(product)) {
    filter.product = product;
  }

  // Search by product name, brand, barcode, or batch number
  if (search && search.trim().length > 0) {
    const term = search.trim();
    const regex = new RegExp(term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

    const matchedProducts = await Product.find({
      $or: [{ name: regex }, { brand: regex }, { barcode: regex }]
    }).select('_id');

    const productIds = matchedProducts.map((p) => p._id);

    filter.$or = [
      { product: { $in: productIds } },
      { batchNumber: regex },
      { supplierName: regex },
      { supplierInvoiceNumber: regex }
    ];
  }

  // Filter by product category
  if (category && category !== 'All') {
    const categoryProducts = await Product.find({ category: category.trim() }).select('_id');
    const categoryIds = categoryProducts.map((p) => p._id);

    if (filter.product) {
      if (!categoryIds.some((id) => id.toString() === filter.product.toString())) {
        return {
          batches: [],
          pagination: { total: 0, page, limit, totalPages: 1, hasNextPage: false, hasPrevPage: false }
        };
      }
    } else if (filter.$or) {
      filter.$and = [
        { $or: filter.$or },
        { product: { $in: categoryIds } }
      ];
      delete filter.$or;
    } else {
      filter.product = { $in: categoryIds };
    }
  }

  // Status filtering using correct calendar date boundaries
  if (status === 'active') {
    filter.currentQuantity = { $gt: 0 };
    filter.expiryDate = { $gte: startOfToday };
  } else if (status === 'expired') {
    filter.currentQuantity = { $gt: 0 };
    filter.expiryDate = { $lt: startOfToday };
  } else if (status === 'expiringSoon') {
    filter.currentQuantity = { $gt: 0 };
    filter.expiryDate = { $gte: startOfToday, $lte: sevenDaysLater };
  } else if (status === 'lowStock') {
    filter.currentQuantity = { $gt: 0, $lte: DEFAULT_LOW_STOCK_THRESHOLD };
  } else if (status === 'depleted') {
    filter.currentQuantity = 0;
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [batches, total] = await Promise.all([
    InventoryBatch.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('product', 'name brand barcode category unit imageUrl')
      .populate('createdBy', 'fullName email role')
      .lean(),
    InventoryBatch.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  // Enrich batches with computed status helper
  const enrichedBatches = batches.map((b) => {
    const statusMeta = computeBatchStatus(b.expiryDate, b.currentQuantity);
    return {
      ...b,
      ...statusMeta
    };
  });

  return {
    batches: enrichedBatches,
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
 * Get batch details with movement history
 */
const getBatchById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid batch ID format');
    error.statusCode = 400;
    throw error;
  }

  const batch = await InventoryBatch.findById(id)
    .populate('product', 'name brand barcode category unit imageUrl manufacturer')
    .populate('createdBy', 'fullName email role')
    .lean();

  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  // Fetch full stock movement audit history for this batch
  const movements = await StockMovement.find({ batch: id })
    .sort({ createdAt: -1 })
    .populate('user', 'fullName email role')
    .lean();

  const statusMeta = computeBatchStatus(batch.expiryDate, batch.currentQuantity);

  return {
    batch: {
      ...batch,
      ...statusMeta
    },
    movements
  };
};

/**
 * Update batch metadata (prices, notes, dates)
 */
const updateBatch = async (id, updateData) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid batch ID format');
    error.statusCode = 400;
    throw error;
  }

  const batch = await InventoryBatch.findById(id);
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  // Check date consistency
  const effectiveMfg = updateData.manufacturingDate !== undefined ? updateData.manufacturingDate : batch.manufacturingDate;
  const effectiveExp = updateData.expiryDate !== undefined ? updateData.expiryDate : batch.expiryDate;

  if (effectiveMfg && effectiveExp && new Date(effectiveExp) < new Date(effectiveMfg)) {
    const error = new Error('Expiry date cannot be earlier than manufacturing date');
    error.statusCode = 400;
    throw error;
  }

  // Allowed fields (quantityReceived is immutable to protect batch intake history)
  const allowedFields = [
    'batchNumber',
    'purchasePrice',
    'sellingPrice',
    'manufacturingDate',
    'expiryDate',
    'supplierName',
    'supplierInvoiceNumber',
    'notes'
  ];

  allowedFields.forEach((field) => {
    if (updateData[field] !== undefined) {
      batch[field] = updateData[field];
    }
  });

  await batch.save();
  await batch.populate('product', 'name brand barcode category unit imageUrl');
  await batch.populate('createdBy', 'fullName email role');

  return batch;
};

/**
 * Adjust stock quantity with auditable movement reason
 * Enforces:
 * 1. after >= 0 (no negative inventory)
 * 2. after <= batch.quantityReceived (currentQuantity cannot exceed original received quantity)
 * 3. Atomic compensation rollback: if movement save fails, batch quantity is reverted.
 */
const adjustStock = async (batchId, { adjustmentType, quantity, newQuantity, reason }, userId) => {
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    const error = new Error('Invalid batch ID format');
    error.statusCode = 400;
    throw error;
  }

  if (!reason || reason.trim().length < 2) {
    const error = new Error('A detailed reason is required for any stock adjustment');
    error.statusCode = 400;
    throw error;
  }

  const batch = await InventoryBatch.findById(batchId);
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  const before = batch.currentQuantity;
  let after = before;
  let movementType = adjustmentType;
  let quantityChanged = 0;

  // Mode 1: newQuantity provided directly
  if (newQuantity !== undefined) {
    after = Number(newQuantity);
    const diff = after - before;

    if (diff === 0) {
      return { batch, movement: null, message: 'Stock quantity unchanged' };
    }

    if (diff > 0) {
      movementType = 'STOCK_ADJUSTED_INCREASE';
      quantityChanged = diff;
    } else {
      movementType = adjustmentType || 'STOCK_ADJUSTED_DECREASE';
      quantityChanged = Math.abs(diff);
    }
  }
  // Mode 2: adjustmentType + quantity delta
  else if (adjustmentType && quantity !== undefined) {
    const delta = Number(quantity);
    if (delta <= 0) {
      const error = new Error('Adjustment quantity must be greater than 0');
      error.statusCode = 400;
      throw error;
    }

    quantityChanged = delta;

    if (adjustmentType === 'STOCK_ADJUSTED_INCREASE') {
      after = before + delta;
    } else if (
      adjustmentType === 'STOCK_ADJUSTED_DECREASE' ||
      adjustmentType === 'STOCK_DAMAGED' ||
      adjustmentType === 'STOCK_EXPIRED'
    ) {
      after = before - delta;
    } else {
      const error = new Error(`Unsupported adjustment type: ${adjustmentType}`);
      error.statusCode = 400;
      throw error;
    }
  } else {
    const error = new Error('Provide either newQuantity or both adjustmentType and quantity');
    error.statusCode = 400;
    throw error;
  }

  // 1. Invariant check: Prevent negative inventory
  if (after < 0) {
    const error = new Error(
      `Cannot decrease stock by ${quantityChanged}. Current available quantity is only ${before}.`
    );
    error.statusCode = 400;
    throw error;
  }

  // 2. Invariant check: currentQuantity must not exceed original quantityReceived
  if (after > batch.quantityReceived) {
    const error = new Error(
      `Cannot increase stock to ${after}. Current available quantity cannot exceed original quantity received (${batch.quantityReceived}) for this batch. To record additional received units, please log a new stock batch.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Atomic conditional update to prevent race conditions during concurrent adjustments
  let updatedBatch = null;
  const isIncrease = after > before;
  const isDecrease = after < before;

  if (isDecrease) {
    updatedBatch = await InventoryBatch.findOneAndUpdate(
      {
        _id: batch._id,
        currentQuantity: { $gte: quantityChanged }
      },
      {
        $inc: { currentQuantity: -quantityChanged }
      },
      { new: true }
    );
  } else if (isIncrease) {
    updatedBatch = await InventoryBatch.findOneAndUpdate(
      {
        _id: batch._id,
        $expr: {
          $lte: [{ $add: ['$currentQuantity', quantityChanged] }, '$quantityReceived']
        }
      },
      {
        $inc: { currentQuantity: quantityChanged }
      },
      { new: true }
    );
  } else {
    // Unchanged
    return { batch, movement: null, message: 'Stock quantity unchanged' };
  }

  if (!updatedBatch) {
    const fresh = await InventoryBatch.findById(batch._id);
    if (!fresh) {
      const error = new Error('Inventory batch not found');
      error.statusCode = 404;
      throw error;
    }
    if (isDecrease && fresh.currentQuantity < quantityChanged) {
      const error = new Error(
        `Cannot decrease stock by ${quantityChanged}. Current available quantity is only ${fresh.currentQuantity}.`
      );
      error.statusCode = 400;
      throw error;
    }
    const error = new Error(
      `Adjustment failed: Concurrent stock update conflict or stock bounds exceeded.`
    );
    error.statusCode = 400;
    throw error;
  }

  try {
    // Create immutable movement audit log
    const movement = new StockMovement({
      product: updatedBatch.product,
      batch: updatedBatch._id,
      movementType,
      quantityChanged,
      quantityBefore: before,
      quantityAfter: updatedBatch.currentQuantity,
      reason: reason.trim(),
      user: userId
    });

    await movement.save();
    await updatedBatch.populate('product', 'name brand barcode category unit imageUrl');

    return {
      batch: updatedBatch,
      movement,
      message: `Stock updated: ${before} → ${updatedBatch.currentQuantity} (${movementType})`
    };
  } catch (err) {
    // Atomic rollback: revert currentQuantity back to before if movement recording fails
    try {
      await InventoryBatch.findByIdAndUpdate(batch._id, { currentQuantity: before });
    } catch (revertErr) {
      console.error('[Rollback Error] Failed to revert batch stock quantity:', revertErr);
    }
    throw err;
  }
};

/**
 * View all batches belonging to a specific product
 */
const getProductBatches = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('Invalid product ID format');
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    const error = new Error('Product not found in catalog');
    error.statusCode = 404;
    throw error;
  }

  const batches = await InventoryBatch.find({ product: productId })
    .sort({ expiryDate: 1 })
    .populate('createdBy', 'fullName email role')
    .lean();

  let totalAvailableUnits = 0;
  let totalExpiredUnits = 0;
  let totalReceivedUnits = 0;
  let activeBatchesCount = 0;
  let expiredBatchesCount = 0;
  let earliestExpiry = null;

  const enrichedBatches = batches.map((b) => {
    const statusMeta = computeBatchStatus(b.expiryDate, b.currentQuantity);
    totalReceivedUnits += b.quantityReceived || 0;

    if (b.currentQuantity > 0) {
      if (statusMeta.isExpired) {
        totalExpiredUnits += b.currentQuantity;
        expiredBatchesCount++;
      } else {
        totalAvailableUnits += b.currentQuantity;
        activeBatchesCount++;
        const exp = new Date(b.expiryDate);
        if (!earliestExpiry || exp < earliestExpiry) {
          earliestExpiry = exp;
        }
      }
    }

    return {
      ...b,
      ...statusMeta
    };
  });

  return {
    product,
    batches: enrichedBatches,
    summary: {
      totalAvailableUnits,
      totalExpiredUnits,
      totalReceivedUnits,
      totalBatches: batches.length,
      activeBatchesCount,
      expiredBatchesCount,
      earliestExpiry
    }
  };
};

/**
 * Real-time supermarket inventory summary statistics
 * Uses correct startOfToday date boundaries to segregate expired units from active stock.
 */
const getInventorySummary = async () => {
  const startOfToday = getStartOfToday();
  const endOfToday = getEndOfToday();
  const sevenDaysLater = getSevenDaysLater();

  const [
    allBatches,
    totalBatches,
    totalCatalogProducts
  ] = await Promise.all([
    InventoryBatch.find({}).lean(),
    InventoryBatch.countDocuments({}),
    Product.countDocuments({})
  ]);

  let totalUnitsInStock = 0; // Active unexpired units (including expiring today)
  let expiredUnits = 0; // Expired units currently in stock
  let activeBatches = 0;
  let expiredBatches = 0;
  let expiringSoonBatches = 0;
  let expiringSoonUnits = 0;
  let expiringTodayBatches = 0;
  let expiringTodayUnits = 0;
  let depletedBatches = 0;

  // Track product-wise stock to find distinct products with stock and low-stock items
  const productStockMap = {}; // { productId: activeStock }

  allBatches.forEach((b) => {
    const pId = b.product.toString();
    if (!productStockMap[pId]) {
      productStockMap[pId] = 0;
    }

    const exp = new Date(b.expiryDate);
    const isExpired = exp < startOfToday;
    const isExpiringToday = !isExpired && exp <= endOfToday;
    const isExpiringSoon = !isExpired && exp <= sevenDaysLater;

    if (b.currentQuantity === 0) {
      depletedBatches++;
    } else if (isExpired) {
      expiredBatches++;
      expiredUnits += b.currentQuantity;
    } else {
      activeBatches++;
      totalUnitsInStock += b.currentQuantity;
      productStockMap[pId] += b.currentQuantity;

      if (isExpiringToday) {
        expiringTodayBatches++;
        expiringTodayUnits += b.currentQuantity;
      }
      if (isExpiringSoon) {
        expiringSoonBatches++;
        expiringSoonUnits += b.currentQuantity;
      }
    }
  });

  // Count distinct products with positive active stock
  const distinctProductsWithStock = Object.values(productStockMap).filter((stock) => stock > 0).length;

  // Low stock products: products registered in catalog that have active stock <= threshold (including 0)
  const lowStockProducts = Object.values(productStockMap).filter(
    (stock) => stock <= DEFAULT_LOW_STOCK_THRESHOLD
  ).length + (totalCatalogProducts - Object.keys(productStockMap).length);

  return {
    distinctProductsWithStock,
    totalUnitsInStock,
    totalBatches,
    activeBatches,
    expiringSoonBatches,
    expiringSoonUnits,
    expiringTodayBatches,
    expiringTodayUnits,
    expiredBatches,
    expiredUnits,
    depletedBatches,
    lowStockProducts,
    totalCatalogProducts,
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD
  };
};

/**
 * List low-stock products
 */
const getLowStock = async (threshold = DEFAULT_LOW_STOCK_THRESHOLD) => {
  const startOfToday = getStartOfToday();

  // Find all active unexpired batches
  const activeBatches = await InventoryBatch.find({
    currentQuantity: { $gt: 0 },
    expiryDate: { $gte: startOfToday }
  }).lean();

  const stockMap = {};
  activeBatches.forEach((b) => {
    const pId = b.product.toString();
    stockMap[pId] = (stockMap[pId] || 0) + b.currentQuantity;
  });

  const allProducts = await Product.find({}).lean();

  const lowStockItems = [];
  allProducts.forEach((p) => {
    const pId = p._id.toString();
    const currentStock = stockMap[pId] || 0;
    if (currentStock <= threshold) {
      lowStockItems.push({
        product: p,
        currentStock,
        threshold,
        isOutOfStock: currentStock === 0
      });
    }
  });

  return lowStockItems.sort((a, b) => a.currentStock - b.currentStock);
};

/**
 * List stock movements (audit history)
 */
const getMovements = async ({ batch = '', product = '', page = 1, limit = 20 }) => {
  const filter = {};
  if (batch && mongoose.Types.ObjectId.isValid(batch)) {
    filter.batch = batch;
  }
  if (product && mongoose.Types.ObjectId.isValid(product)) {
    filter.product = product;
  }

  const skip = (page - 1) * limit;

  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'name brand barcode category unit')
      .populate('batch', 'batchNumber expiryDate')
      .populate('user', 'fullName email role')
      .lean(),
    StockMovement.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    movements,
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

module.exports = {
  receiveStock,
  getBatches,
  getBatchById,
  updateBatch,
  adjustStock,
  getProductBatches,
  getInventorySummary,
  getLowStock,
  getMovements,
  DEFAULT_LOW_STOCK_THRESHOLD
};
