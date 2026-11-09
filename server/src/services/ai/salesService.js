const mongoose = require('mongoose');
const Sale = require('../../models/Sale');
const InventoryBatch = require('../../models/InventoryBatch');
const Product = require('../../models/Product');
const StockMovement = require('../../models/StockMovement');
const Store = require('../../models/Store');
const { runWithTransaction } = require('../../utils/transactionHelper');

/**
 * Record a verified retail sale / stock-out
 * Atomically updates batch inventory with conditional stock check,
 * creates STOCK_SOLD movement, and records sale. Concurrency-safe against race conditions.
 */
const recordSale = async (saleData, userOrId) => {
  const userId = userOrId?._id || userOrId;
  const {
    batchId,
    quantity,
    unitPrice = null,
    notes = '',
    receiptNumber = null,
    saleDate = new Date()
  } = saleData;

  const numQty = Number(quantity);
  if (isNaN(numQty) || numQty <= 0) {
    const error = new Error('Sale quantity must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  // 1. Fetch batch and product to determine pricing and initial state
  const initialBatch = await InventoryBatch.findById(batchId).populate('product');
  if (!initialBatch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  if (initialBatch.isQuarantined) {
    const error = new Error('Cannot sell quarantined stock. Stock must be released first.');
    error.statusCode = 400;
    throw error;
  }

  if (numQty > initialBatch.currentQuantity) {
    const error = new Error(
      `Insufficient stock. Available batch quantity is ${initialBatch.currentQuantity}, cannot sell ${numQty} units.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Determine effective unit price:
  let effectiveUnitPrice = unitPrice !== null && unitPrice !== undefined ? Number(unitPrice) : null;
  let isMarkdownApplied = false;

  if (effectiveUnitPrice === null || isNaN(effectiveUnitPrice)) {
    if (initialBatch.discountedPrice && initialBatch.discountedPrice > 0) {
      effectiveUnitPrice = initialBatch.discountedPrice;
      isMarkdownApplied = true;
    } else if (initialBatch.sellingPrice && initialBatch.sellingPrice > 0) {
      effectiveUnitPrice = initialBatch.sellingPrice;
    } else {
      effectiveUnitPrice = initialBatch.purchasePrice || 0;
    }
  }

  const store = await Store.getStore();
  const totalAmount = Number((numQty * effectiveUnitPrice).toFixed(2));
  const costPrice = initialBatch.purchasePrice || 0;

  // Execute multi-document write with ACID transaction (or atomic conditional update with compensation)
  let decremented = false;

  return await runWithTransaction(
    async (session) => {
      const sessionOpt = session ? { session } : {};

      // 2. Concurrency-safe atomic conditional decrement
      const updatedBatch = await InventoryBatch.findOneAndUpdate(
        {
          _id: initialBatch._id,
          isQuarantined: false,
          currentQuantity: { $gte: numQty }
        },
        {
          $inc: { currentQuantity: -numQty }
        },
        {
          new: false, // returns document state BEFORE update
          ...sessionOpt
        }
      );

      if (!updatedBatch) {
        const fresh = await InventoryBatch.findById(initialBatch._id);
        if (!fresh) {
          const error = new Error('Inventory batch not found');
          error.statusCode = 404;
          throw error;
        }
        if (fresh.isQuarantined) {
          const error = new Error('Cannot sell quarantined stock. Stock must be released first.');
          error.statusCode = 400;
          throw error;
        }
        const error = new Error(
          `Insufficient stock. Available batch quantity is ${fresh.currentQuantity}, cannot sell ${numQty} units.`
        );
        error.statusCode = 400;
        throw error;
      }

      decremented = true;
      const before = updatedBatch.currentQuantity;
      const after = before - numQty;

      // 3. Create immutable StockMovement audit record
      const movement = new StockMovement({
        product: initialBatch.product._id,
        batch: initialBatch._id,
        movementType: 'STOCK_SOLD',
        quantityChanged: numQty,
        quantityBefore: before,
        quantityAfter: after,
        reason: notes ? `Retail sale: ${notes.slice(0, 200)}` : 'Retail sale recorded',
        user: userId
      });
      await movement.save(sessionOpt);

      // 4. Create Sale record
      const sale = new Sale({
        store: store?._id,
        product: initialBatch.product._id,
        batch: initialBatch._id,
        quantity: numQty,
        unitPrice: effectiveUnitPrice,
        costPrice,
        totalAmount,
        isMarkdown: isMarkdownApplied || Boolean(initialBatch.activeMarkdown),
        markdown: initialBatch.activeMarkdown || null,
        saleDate: new Date(saleDate),
        recordedBy: userId,
        receiptNumber: receiptNumber ? String(receiptNumber).trim() : null,
        notes: notes ? String(notes).trim() : ''
      });
      await sale.save(sessionOpt);

      await sale.populate([
        { path: 'product', select: 'name brand barcode category unit' },
        { path: 'batch', select: 'batchNumber expiryDate sellingPrice discountedPrice' },
        { path: 'recordedBy', select: 'fullName email role' }
      ]);

      return {
        sale,
        movement,
        batch: {
          ...updatedBatch.toObject(),
          currentQuantity: after
        }
      };
    },
    // Standalone compensation rollback: if non-transactional execution fails after decrement, revert
    async () => {
      if (decremented) {
        await InventoryBatch.findByIdAndUpdate(initialBatch._id, {
          $inc: { currentQuantity: numQty }
        });
      }
    }
  );
};

/**
 * Get paginated sales history with filtering
 */
const getSalesHistory = async (query = {}) => {
  const { page = 1, limit = 20, product, batch, startDate, endDate } = query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  if (product && mongoose.Types.ObjectId.isValid(product)) filter.product = product;
  if (batch && mongoose.Types.ObjectId.isValid(batch)) filter.batch = batch;

  if (startDate || endDate) {
    filter.saleDate = {};
    if (startDate) filter.saleDate.$gte = new Date(startDate);
    if (endDate) filter.saleDate.$lte = new Date(endDate);
  }

  const [sales, total] = await Promise.all([
    Sale.find(filter)
      .populate('product', 'name brand category barcode unit')
      .populate('batch', 'batchNumber expiryDate sellingPrice')
      .populate('recordedBy', 'fullName email role')
      .sort({ saleDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Sale.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    sales,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    }
  };
};

/**
 * Calculate empirical sales velocity for a specific product
 * Uses actual recorded Sale documents within a historical window (default 30 days).
 */
const getProductSalesVelocity = async (productId, windowDays = 30) => {
  const pId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const sales = await Sale.find({
    product: pId,
    saleDate: { $gte: windowStart, $lte: now }
  })
    .sort({ saleDate: 1 })
    .lean();

  const totalSold = sales.reduce((acc, s) => acc + (s.quantity || 0), 0);
  const dataPointsCount = sales.length;

  // Calculate distinct calendar days with sales
  const distinctDays = new Set(sales.map((s) => new Date(s.saleDate).toISOString().slice(0, 10))).size;

  // If we have at least 1 sale, velocity is totalSold / windowDays
  const dailyVelocity = totalSold > 0 ? Number((totalSold / windowDays).toFixed(3)) : 0;

  // Minimum data requirement: at least 3 distinct sales events or at least 5 distinct days observed
  const hasSufficientData = dataPointsCount >= 3 || (totalSold > 0 && distinctDays >= 2);

  // Confidence estimation: based on data points and consistency
  let confidence = 'LOW';
  if (dataPointsCount >= 10 && distinctDays >= 7) {
    confidence = 'HIGH';
  } else if (dataPointsCount >= 3 && distinctDays >= 2) {
    confidence = 'MEDIUM';
  }

  return {
    productId: pId,
    dailyVelocity,
    weeklyVelocity: Number((dailyVelocity * 7).toFixed(2)),
    monthlyVelocity: Number((dailyVelocity * 30).toFixed(2)),
    totalSoldInWindow: totalSold,
    windowDays,
    dataPointsCount,
    distinctDaysWithSales: distinctDays,
    hasSufficientData,
    confidence
  };
};

/**
 * Calculate category-level average daily velocity as a baseline fallback for cold-start products
 */
const getCategorySalesVelocity = async (category, windowDays = 30) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const products = await Product.find({ category }).select('_id').lean();
  if (products.length === 0) {
    return { category, dailyVelocity: 0.1, hasSufficientData: false, confidence: 'LOW' };
  }

  const pIds = products.map((p) => p._id);
  const sales = await Sale.find({
    product: { $in: pIds },
    saleDate: { $gte: windowStart, $lte: now }
  }).lean();

  const totalSold = sales.reduce((acc, s) => acc + (s.quantity || 0), 0);
  const avgVelocityPerProduct =
    totalSold > 0 ? Number((totalSold / (windowDays * products.length)).toFixed(3)) : 0.1;

  return {
    category,
    dailyVelocity: Math.max(0.05, avgVelocityPerProduct),
    totalCategorySalesInWindow: totalSold,
    productsCount: products.length,
    hasSufficientData: sales.length >= 5,
    confidence: sales.length >= 10 ? 'MEDIUM' : 'LOW'
  };
};

module.exports = {
  recordSale,
  getSalesHistory,
  getProductSalesVelocity,
  getCategorySalesVelocity
};

