const mongoose = require('mongoose');
const InventoryBatch = require('../models/InventoryBatch');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StockMovement = require('../models/StockMovement');
const Markdown = require('../models/Markdown');
const SupplierReturn = require('../models/SupplierReturn');
const StockDisposition = require('../models/StockDisposition');
const notificationService = require('./notificationService');
const { calculateBatchExpiryStatus, getCalendarDateParts } = require('../utils/expiryUtils');

/**
 * Helper to fetch store settings and defaults
 */
const getStoreSettings = async () => {
  const store = await Store.getStore();
  return {
    storeId: store?._id,
    currency: store?.currency || 'USD ($)',
    expiryWarningDays: store?.expiryWarningDays !== undefined ? store.expiryWarningDays : 7,
    expiryCriticalDays: store?.expiryCriticalDays !== undefined ? store.expiryCriticalDays : 3,
    timezone: store?.timezone || 'Asia/Kolkata',
    markdownRules: store?.markdownRules || {
      warningDiscountPercent: 15,
      criticalDiscountPercent: 30,
      todayDiscountPercent: 50,
      autoSuggestEnabled: true
    }
  };
};

// =========================================================================
// 1. DISCOUNT & MARKDOWN MANAGEMENT
// =========================================================================

/**
 * Scan active inventory approaching expiry and generate smart markdown suggestions
 */
const getMarkdownSuggestions = async () => {
  const settings = await getStoreSettings();
  const now = new Date();

  // Find batches with currentQuantity > 0 and sellingPrice > 0
  const batches = await InventoryBatch.find({
    currentQuantity: { $gt: 0 },
    sellingPrice: { $gt: 0 }
  })
    .populate('product', 'name brand barcode category unit imageUrl')
    .sort({ expiryDate: 1 })
    .lean();

  // Fetch batches that already have an ACTIVE or PENDING_APPROVAL markdown
  const existingMarkdowns = await Markdown.find({
    status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] }
  }).lean();

  const activeBatchIds = new Set(existingMarkdowns.map((m) => m.batch.toString()));

  const suggestions = [];

  for (const b of batches) {
    // If batch already has an active or pending markdown, skip from new suggestions
    if (activeBatchIds.has(b._id.toString())) {
      continue;
    }

    const meta = calculateBatchExpiryStatus(b, {
      expiryWarningDays: settings.expiryWarningDays,
      expiryCriticalDays: settings.expiryCriticalDays,
      timezone: settings.timezone,
      referenceDate: now
    });

    // Suggest markdowns only for batches approaching expiry (EXPIRING_TODAY, CRITICAL, EXPIRING_SOON)
    // Note: EXPIRED batches should NOT be discounted; they must be quarantined/disposed!
    let suggestedPercent = 0;
    let reason = '';

    if (meta.status === 'EXPIRING_TODAY') {
      suggestedPercent = settings.markdownRules.todayDiscountPercent || 50;
      reason = `Expires today! Aggressive clearance discount (${suggestedPercent}%) to liquidate stock before end-of-day.`;
    } else if (meta.status === 'CRITICAL') {
      suggestedPercent = settings.markdownRules.criticalDiscountPercent || 30;
      reason = `Critical expiry window (${meta.daysUntilExpiry} days left). Recommended ${suggestedPercent}% markdown to accelerate sell-through.`;
    } else if (meta.status === 'EXPIRING_SOON') {
      suggestedPercent = settings.markdownRules.warningDiscountPercent || 15;
      reason = `Approaching expiry (${meta.daysUntilExpiry} days left). Promotional ${suggestedPercent}% markdown to encourage early purchase.`;
    }

    if (suggestedPercent > 0) {
      const originalPrice = b.sellingPrice;
      const discountedPrice = Number((originalPrice * (1 - suggestedPercent / 100)).toFixed(2));
      const potentialRevenue = Number((discountedPrice * b.currentQuantity).toFixed(2));

      suggestions.push({
        batchId: b._id,
        batchNumber: b.batchNumber || 'Primary',
        product: b.product,
        expiryDate: meta.expiryDateFormatted,
        daysUntilExpiry: meta.daysUntilExpiry,
        status: meta.status,
        currentQuantity: b.currentQuantity,
        unit: b.product?.unit || 'piece',
        purchasePrice: b.purchasePrice,
        originalPrice,
        suggestedPercent,
        discountedPrice,
        potentialRevenue,
        reason
      });
    }
  }

  // Sort suggestions: most urgent (lowest days until expiry) first
  suggestions.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return {
    suggestions,
    totalSuggestions: suggestions.length,
    storeRules: settings.markdownRules
  };
};

/**
 * Request or propose a markdown on an inventory batch
 */
const createMarkdownRequest = async (markdownData, userId) => {
  const { batchId, discountPercent, reason, autoApprove = false } = markdownData;

  const batch = await InventoryBatch.findById(batchId).populate('product');
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  if (batch.currentQuantity <= 0) {
    const error = new Error('Cannot apply markdown to a depleted batch (0 units remaining)');
    error.statusCode = 400;
    throw error;
  }

  if (!batch.sellingPrice || batch.sellingPrice <= 0) {
    const error = new Error('Batch must have a valid selling price to calculate discount markdown');
    error.statusCode = 400;
    throw error;
  }

  const numPercent = Number(discountPercent);
  if (isNaN(numPercent) || numPercent < 1 || numPercent > 99) {
    const error = new Error('Discount percentage must be between 1% and 99%');
    error.statusCode = 400;
    throw error;
  }

  // Check if an active or pending markdown already exists on this batch
  const existing = await Markdown.findOne({
    batch: batchId,
    status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] }
  });

  if (existing) {
    const error = new Error(
      `An existing markdown (${existing.status}) is already registered for this batch (ID: ${existing._id}).`
    );
    error.statusCode = 400;
    throw error;
  }

  const originalPrice = batch.sellingPrice;
  const discountedPrice = Number((originalPrice * (1 - numPercent / 100)).toFixed(2));
  const settings = await getStoreSettings();

  const initialStatus = autoApprove ? 'ACTIVE' : 'PENDING_APPROVAL';

  const markdown = new Markdown({
    store: settings.storeId,
    product: batch.product._id,
    batch: batch._id,
    originalPrice,
    discountPercent: numPercent,
    discountedPrice,
    reason: reason.trim(),
    status: initialStatus,
    requestedBy: userId,
    approvedBy: autoApprove ? userId : null,
    approvalDate: autoApprove ? new Date() : null,
    activatedAt: autoApprove ? new Date() : null,
    history: [
      {
        status: initialStatus,
        changedBy: userId,
        timestamp: new Date(),
        note: autoApprove ? 'Markdown created and auto-activated by owner.' : 'Markdown request submitted for approval.'
      }
    ]
  });

  await markdown.save();

  // If auto-approved/activated, update batch immediately
  if (autoApprove) {
    batch.activeMarkdown = markdown._id;
    batch.discountedPrice = discountedPrice;
    await batch.save();
  }

  // Notify owner if pending approval
  if (!autoApprove && settings.storeId) {
    notificationService.createNotification({
      userId,
      storeId: settings.storeId,
      type: 'MARKDOWN_APPROVAL_REQUEST',
      title: `Markdown Approval Request: ${batch.product.name}`,
      message: `Proposed ${numPercent}% markdown (${originalPrice} → ${discountedPrice}) on batch #${batch.batchNumber || '1'}.`,
      severity: 'warning',
      relatedProduct: batch.product._id,
      relatedBatch: batch._id,
      sendEmail: true
    }).catch(() => {});
  }

  await markdown.populate([
    { path: 'product', select: 'name brand barcode category unit imageUrl' },
    { path: 'batch', select: 'batchNumber expiryDate currentQuantity sellingPrice' },
    { path: 'requestedBy', select: 'fullName email role' }
  ]);

  return markdown;
};

/**
 * Approve a markdown (Owner only)
 */
const approveMarkdown = async (markdownId, userOrId) => {
  const userId = userOrId?._id || userOrId;
  const userRole = userOrId?.role;
  if (userRole && userRole !== 'owner') {
    const error = new Error('Only store owners can approve markdowns');
    error.statusCode = 403;
    throw error;
  }

  // Atomic state transition from PENDING_APPROVAL to APPROVED
  const markdown = await Markdown.findOneAndUpdate(
    { _id: markdownId, status: 'PENDING_APPROVAL' },
    {
      $set: {
        status: 'APPROVED',
        approvedBy: userId,
        approvalDate: new Date()
      },
      $push: {
        history: {
          status: 'APPROVED',
          changedBy: userId,
          timestamp: new Date(),
          note: 'Markdown approved by owner.'
        }
      }
    },
    { new: true }
  ).populate('product batch');

  if (!markdown) {
    const existing = await Markdown.findById(markdownId);
    if (!existing) {
      const error = new Error('Markdown record not found');
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`Cannot approve markdown with current status "${existing.status}"`);
    error.statusCode = 400;
    throw error;
  }

  // Notify requester
  notificationService.createNotification({
    userId: markdown.requestedBy,
    storeId: markdown.store,
    type: 'MARKDOWN_APPROVED',
    title: `Markdown Approved: ${markdown.product?.name}`,
    message: `${markdown.discountPercent}% discount approved. Ready for activation.`,
    severity: 'info',
    relatedProduct: markdown.product?._id,
    relatedBatch: markdown.batch?._id,
    sendEmail: false
  }).catch(() => {});

  return markdown;
};

/**
 * Activate an approved markdown to apply discounted price on the inventory batch
 */
const activateMarkdown = async (markdownId, userOrId) => {
  const userId = userOrId?._id || userOrId;
  const userRole = userOrId?.role;
  if (userRole && userRole !== 'owner') {
    const error = new Error('Only store owners can activate markdowns');
    error.statusCode = 403;
    throw error;
  }

  // Atomic state transition to ACTIVE
  const markdown = await Markdown.findOneAndUpdate(
    { _id: markdownId, status: { $in: ['APPROVED', 'PENDING_APPROVAL'] } },
    {
      $set: {
        status: 'ACTIVE',
        activatedAt: new Date()
      },
      $push: {
        history: {
          status: 'ACTIVE',
          changedBy: userId,
          timestamp: new Date(),
          note: 'Markdown activated. Discounted selling price is now live on the retail shelf.'
        }
      }
    },
    { new: true }
  ).populate('batch product');

  if (!markdown) {
    const existing = await Markdown.findById(markdownId);
    if (!existing) {
      const error = new Error('Markdown record not found');
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`Cannot activate markdown in status "${existing.status}"`);
    error.statusCode = 400;
    throw error;
  }

  const batch = await InventoryBatch.findById(markdown.batch._id);
  if (!batch || batch.currentQuantity <= 0) {
    // Revert markdown status back to APPROVED
    await Markdown.findByIdAndUpdate(markdownId, { $set: { status: 'APPROVED' } });
    const error = new Error('Associated inventory batch is no longer available or has 0 units');
    error.statusCode = 400;
    throw error;
  }

  // Apply discount reference to batch atomically
  await InventoryBatch.findByIdAndUpdate(batch._id, {
    activeMarkdown: markdown._id,
    discountedPrice: markdown.discountedPrice
  });

  return markdown;
};

/**
 * Reject a markdown request
 */
const rejectMarkdown = async (markdownId, reason, userId) => {
  const markdown = await Markdown.findOneAndUpdate(
    { _id: markdownId, status: 'PENDING_APPROVAL' },
    {
      $set: { status: 'REJECTED' },
      $push: {
        history: {
          status: 'REJECTED',
          changedBy: userId,
          timestamp: new Date(),
          note: reason ? reason.trim() : 'Markdown request rejected by store owner.'
        }
      }
    },
    { new: true }
  ).populate('product');

  if (!markdown) {
    const existing = await Markdown.findById(markdownId);
    if (!existing) {
      const error = new Error('Markdown record not found');
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`Cannot reject markdown in status "${existing.status}"`);
    error.statusCode = 400;
    throw error;
  }

  // Notify requester
  notificationService.createNotification({
    userId: markdown.requestedBy,
    storeId: markdown.store,
    type: 'MARKDOWN_REJECTED',
    title: `Markdown Rejected: ${markdown.product?.name}`,
    message: reason ? `Reason: ${reason}` : 'The proposed markdown was not approved.',
    severity: 'info',
    relatedProduct: markdown.product?._id,
    sendEmail: false
  }).catch(() => {});

  return markdown;
};

/**
 * Cancel an active or approved markdown
 * Enforces:
 * - Owners can cancel any markdown (approved, active, or pending)
 * - Employees can ONLY withdraw/cancel their OWN pending proposal
 */
const cancelMarkdown = async (markdownId, reason, userOrId) => {
  const userId = userOrId?._id || userOrId;
  const userRole = userOrId?.role;

  const existing = await Markdown.findById(markdownId);
  if (!existing) {
    const error = new Error('Markdown record not found');
    error.statusCode = 404;
    throw error;
  }

  // Object-level authorization check:
  if (userRole && userRole !== 'owner') {
    if (existing.status !== 'PENDING_APPROVAL' || existing.requestedBy.toString() !== userId.toString()) {
      const error = new Error(
        'Access denied: Employees can only withdraw their own pending markdown proposals. Cancelling approved or active markdowns requires store owner authorization.'
      );
      error.statusCode = 403;
      throw error;
    }
  }

  if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
    const error = new Error(`Markdown is already ${existing.status.toLowerCase()}`);
    error.statusCode = 400;
    throw error;
  }

  const markdown = await Markdown.findByIdAndUpdate(
    markdownId,
    {
      $set: { status: 'CANCELLED' },
      $push: {
        history: {
          status: 'CANCELLED',
          changedBy: userId,
          timestamp: new Date(),
          note: reason ? reason.trim() : 'Markdown cancelled.'
        }
      }
    },
    { new: true }
  );

  // If was active on batch, clear active discount
  await InventoryBatch.findByIdAndUpdate(markdown.batch, {
    activeMarkdown: null,
    discountedPrice: null
  });

  return markdown;
};

/**
 * Complete a markdown (e.g. all discounted units sold out)
 */
const completeMarkdown = async (markdownId, userId) => {
  const markdown = await Markdown.findById(markdownId);
  if (!markdown) {
    const error = new Error('Markdown record not found');
    error.statusCode = 404;
    throw error;
  }

  markdown.status = 'COMPLETED';
  markdown.completedAt = new Date();
  markdown.history.push({
    status: 'COMPLETED',
    changedBy: userId,
    timestamp: new Date(),
    note: 'Markdown workflow completed.'
  });

  await markdown.save();

  await InventoryBatch.findByIdAndUpdate(markdown.batch, {
    activeMarkdown: null,
    discountedPrice: null
  });

  return markdown;
};

/**
 * List markdowns with filtering and pagination
 */
const getMarkdowns = async (query = {}) => {
  const { status, search, page = 1, limit = 10 } = query;

  const filter = {};
  if (status && status !== 'ALL') {
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    Markdown.find(filter)
      .populate('product', 'name brand barcode category unit imageUrl')
      .populate('batch', 'batchNumber expiryDate currentQuantity quantityReceived sellingPrice')
      .populate('requestedBy', 'fullName email role')
      .populate('approvedBy', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Markdown.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    markdowns: items,
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

// =========================================================================
// 2. SUPPLIER RETURN & REPLACEMENT MANAGEMENT
// =========================================================================

/**
 * Create a new supplier return request linked to an inventory batch
 */
const createSupplierReturn = async (returnData, userId) => {
  const {
    batchId,
    supplierName,
    quantity,
    reason,
    expectedResolution = 'REPLACEMENT',
    followUpDate = null,
    notes = '',
    status = 'REQUESTED'
  } = returnData;

  const batch = await InventoryBatch.findById(batchId).populate('product');
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  const numQty = Number(quantity);
  if (isNaN(numQty) || numQty <= 0) {
    const error = new Error('Return quantity must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  if (numQty > batch.currentQuantity) {
    const error = new Error(
      `Cannot return ${numQty} units. Batch currently only contains ${batch.currentQuantity} units available.`
    );
    error.statusCode = 400;
    throw error;
  }

  const settings = await getStoreSettings();
  const effectiveSupplier = (supplierName || batch.supplierName || 'Primary Supplier').trim();

  // If creating directly with status 'DISPATCHED', deduct inventory atomically
  const isDirectDispatch = status === 'DISPATCHED';

  const returnRecord = new SupplierReturn({
    store: settings.storeId,
    product: batch.product._id,
    batch: batch._id,
    supplierName: effectiveSupplier,
    quantity: numQty,
    reason: reason.trim(),
    expectedResolution,
    status,
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    responsibleEmployee: userId,
    notes: notes.trim(),
    stockDeducted: isDirectDispatch,
    history: [
      {
        status,
        changedBy: userId,
        timestamp: new Date(),
        note: isDirectDispatch ? 'Supplier return created and stock immediately dispatched.' : 'Supplier return created.'
      }
    ]
  });

  await returnRecord.save();

  // If dispatched immediately, record inventory movement and deduct stock atomically
  if (isDirectDispatch) {
    const updatedBatch = await InventoryBatch.findOneAndUpdate(
      { _id: batch._id, currentQuantity: { $gte: numQty } },
      { $inc: { currentQuantity: -numQty } },
      { new: false }
    );

    if (!updatedBatch) {
      await SupplierReturn.findByIdAndDelete(returnRecord._id);
      const error = new Error(`Cannot dispatch return. Available batch stock is less than return quantity (${numQty}).`);
      error.statusCode = 400;
      throw error;
    }

    const before = updatedBatch.currentQuantity;
    const after = before - numQty;

    const movement = new StockMovement({
      product: batch.product._id,
      batch: batch._id,
      movementType: 'STOCK_RETURNED_TO_SUPPLIER',
      quantityChanged: numQty,
      quantityBefore: before,
      quantityAfter: after,
      reason: `Supplier return dispatched (${effectiveSupplier}): ${reason.trim()}`,
      user: userId
    });
    await movement.save();
  }

  await returnRecord.populate([
    { path: 'product', select: 'name brand barcode category unit imageUrl' },
    { path: 'batch', select: 'batchNumber expiryDate currentQuantity supplierName' },
    { path: 'responsibleEmployee', select: 'fullName email role' }
  ]);

  return returnRecord;
};

/**
 * Update supplier return status, process dispatch deduction, replacement or refund.
 * Uses atomic conditional update to guarantee that concurrent dispatch requests cannot double-deduct stock.
 */
const updateSupplierReturnStatus = async (returnId, updateData, userId) => {
  const newStatus = updateData.newStatus || updateData.status;
  const notes = updateData.notes || updateData.resolutionNotes || '';
  const resolutionDetails = updateData.resolutionDetails || {
    refundAmount: updateData.refundAmount,
    replacementBatchId: updateData.replacementBatchId,
    replacementQuantity: updateData.replacementQuantity,
    creditNoteNumber: updateData.creditNoteNumber
  };

  const returnRecord = await SupplierReturn.findById(returnId).populate('batch product');
  if (!returnRecord) {
    const error = new Error('Supplier return record not found');
    error.statusCode = 404;
    throw error;
  }

  const oldStatus = returnRecord.status;

  // 1. Dispatch transition: Deduct inventory if not already deducted (Concurrency-safe check)
  if (newStatus === 'DISPATCHED' && !returnRecord.stockDeducted) {
    // Atomically claim the stock deduction so concurrent requests cannot double-deduct
    const claimedReturn = await SupplierReturn.findOneAndUpdate(
      { _id: returnId, stockDeducted: false },
      { $set: { stockDeducted: true } },
      { new: false }
    );

    if (!claimedReturn) {
      // Stock already claimed/deducted by a concurrent request, proceed safely
      returnRecord.stockDeducted = true;
    } else {
      // Atomically decrement stock from batch
      const updatedBatch = await InventoryBatch.findOneAndUpdate(
        { _id: returnRecord.batch._id, currentQuantity: { $gte: returnRecord.quantity } },
        { $inc: { currentQuantity: -returnRecord.quantity } },
        { new: false }
      );

      if (!updatedBatch) {
        // Revert claimed status on failure
        await SupplierReturn.findByIdAndUpdate(returnId, { $set: { stockDeducted: false } });
        const error = new Error(
          `Cannot dispatch return. Available batch stock is less than return quantity (${returnRecord.quantity}).`
        );
        error.statusCode = 400;
        throw error;
      }

      const before = updatedBatch.currentQuantity;
      const after = before - returnRecord.quantity;

      const movement = new StockMovement({
        product: returnRecord.batch.product || returnRecord.product,
        batch: returnRecord.batch._id,
        movementType: 'STOCK_RETURNED_TO_SUPPLIER',
        quantityChanged: returnRecord.quantity,
        quantityBefore: before,
        quantityAfter: after,
        reason: `Supplier return dispatched to ${returnRecord.supplierName}: ${notes || returnRecord.reason}`,
        user: userId
      });
      await movement.save();

      returnRecord.stockDeducted = true;
    }
  }

  // 2. Replacement received: Optionally log received stock movement
  if (newStatus === 'REPLACEMENT_RECEIVED') {
    const repQty = resolutionDetails.replacementQuantity || returnRecord.quantity;
    returnRecord.resolutionDetails = {
      ...returnRecord.resolutionDetails,
      replacementQuantity: repQty,
      resolvedAt: new Date()
    };
  }

  // 3. Refunded: Record refund amount
  if (newStatus === 'REFUNDED') {
    returnRecord.resolutionDetails = {
      ...returnRecord.resolutionDetails,
      refundAmount: resolutionDetails.refundAmount || 0,
      creditNoteNumber: resolutionDetails.creditNoteNumber || '',
      resolvedAt: new Date()
    };
  }

  returnRecord.status = newStatus;
  returnRecord.history.push({
    status: newStatus,
    changedBy: userId,
    timestamp: new Date(),
    note: notes.trim() || `Status updated from ${oldStatus} to ${newStatus}.`
  });

  await returnRecord.save();

  // Notification for status change
  notificationService.createNotification({
    userId: returnRecord.responsibleEmployee,
    storeId: returnRecord.store,
    type: 'SUPPLIER_RETURN_UPDATE',
    title: `Supplier Return ${newStatus}: ${returnRecord.product?.name}`,
    message: `Return to ${returnRecord.supplierName} (${returnRecord.quantity} units) transitioned to ${newStatus}.`,
    severity: 'info',
    relatedProduct: returnRecord.product?._id,
    sendEmail: false
  }).catch(() => {});

  return returnRecord;
};

/**
 * List supplier returns with search, overdue filtering, and pagination
 */
const getSupplierReturns = async (query = {}) => {
  const { status, search, overdueOnly, page = 1, limit = 10 } = query;

  const filter = {};
  if (status && status !== 'ALL') {
    filter.status = status;
  }

  if (overdueOnly === 'true' || overdueOnly === true) {
    filter.followUpDate = { $lt: new Date() };
    filter.status = { $in: ['DRAFT', 'REQUESTED', 'APPROVED', 'DISPATCHED'] };
  }

  if (search && search.trim()) {
    filter.supplierName = { $regex: search.trim(), $options: 'i' };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    SupplierReturn.find(filter)
      .populate('product', 'name brand barcode category unit imageUrl')
      .populate('batch', 'batchNumber expiryDate currentQuantity supplierName')
      .populate('responsibleEmployee', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    SupplierReturn.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    returns: items,
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

// =========================================================================
// 3. EXPIRED, DAMAGED & UNSELLABLE STOCK (QUARANTINE & DISPOSAL)
// =========================================================================

/**
 * Quarantine damaged, expired, or unsellable stock from a batch
 * Atomically decreases currentQuantity so units can no longer be sold or recommended.
 */
const quarantineStock = async (quarantineData, userId) => {
  const { batchId, quantity, reason, notes = '' } = quarantineData;

  const batch = await InventoryBatch.findById(batchId).populate('product');
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  const numQty = Number(quantity);
  if (isNaN(numQty) || numQty <= 0) {
    const error = new Error('Quarantine quantity must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  if (numQty > batch.currentQuantity) {
    const error = new Error(
      `Cannot quarantine ${numQty} units. Available batch quantity is only ${batch.currentQuantity}.`
    );
    error.statusCode = 400;
    throw error;
  }

  const settings = await getStoreSettings();
  const costLoss = Number((numQty * (batch.purchasePrice || 0)).toFixed(2));

  // 1. Deduct stock from batch atomically so it is segregated from saleable stock
  const updatedBatch = await InventoryBatch.findOneAndUpdate(
    { _id: batch._id, currentQuantity: { $gte: numQty } },
    { $inc: { currentQuantity: -numQty } },
    { new: false }
  );

  if (!updatedBatch) {
    const error = new Error(
      `Cannot quarantine ${numQty} units. Available batch quantity is insufficient.`
    );
    error.statusCode = 400;
    throw error;
  }

  const before = updatedBatch.currentQuantity;
  const after = before - numQty;
  if (after === 0) {
    await InventoryBatch.findByIdAndUpdate(batch._id, { isQuarantined: true });
  }

  // 2. Create StockMovement audit record
  const movement = new StockMovement({
    product: batch.product._id,
    batch: batch._id,
    movementType: 'STOCK_QUARANTINED',
    quantityChanged: numQty,
    quantityBefore: before,
    quantityAfter: after,
    reason: `Stock quarantined: ${reason.trim()}`,
    user: userId
  });
  await movement.save();

  // 3. Create StockDisposition tracking record
  const disposition = new StockDisposition({
    store: settings.storeId,
    product: batch.product._id,
    batch: batch._id,
    quantity: numQty,
    actionType: 'QUARANTINE',
    reason: reason.trim(),
    status: 'QUARANTINED',
    costLoss,
    responsibleEmployee: userId,
    notes: notes.trim(),
    stockDeducted: true,
    history: [
      {
        status: 'QUARANTINED',
        changedBy: userId,
        timestamp: new Date(),
        note: `Quarantined ${numQty} units. Reason: ${reason.trim()}`
      }
    ]
  });

  await disposition.save();

  // Notify store
  notificationService.createNotification({
    userId,
    storeId: settings.storeId,
    type: 'STOCK_QUARANTINED',
    title: `Stock Quarantined: ${batch.product.name}`,
    message: `${numQty} ${batch.product.unit || 'units'} quarantined (${costLoss} cost value). Segregated from sales floor.`,
    severity: 'warning',
    relatedProduct: batch.product._id,
    relatedBatch: batch._id,
    sendEmail: false
  }).catch(() => {});

  await disposition.populate([
    { path: 'product', select: 'name brand barcode category unit imageUrl' },
    { path: 'batch', select: 'batchNumber expiryDate currentQuantity' },
    { path: 'responsibleEmployee', select: 'fullName email role' }
  ]);

  return disposition;
};

/**
 * Dispose, write-off, or donate stock (either from quarantine or directly from expired batch)
 */
const disposeStock = async (disposalData, userId) => {
  const {
    dispositionId = null,
    batchId = null,
    quantity = null,
    actionType = 'DISPOSAL',
    disposalMethod = 'Commercial Waste Dump',
    reason,
    notes = ''
  } = disposalData;

  const settings = await getStoreSettings();

  // Case A: Disposing an ALREADY quarantined stock record
  if (dispositionId) {
    const finalStatus = actionType === 'WRITE_OFF' ? 'WRITTEN_OFF' : actionType === 'DONATION' ? 'DONATED' : 'DISPOSED';

    // Atomically claim the disposal transition so concurrent requests cannot double-dispose
    const disposition = await StockDisposition.findOneAndUpdate(
      { _id: dispositionId, status: 'QUARANTINED' },
      {
        $set: {
          actionType,
          status: finalStatus,
          disposalMethod,
          notes: notes.trim() ? notes.trim() : ''
        },
        $push: {
          history: {
            status: finalStatus,
            changedBy: userId,
            timestamp: new Date(),
            note: `${actionType} completed via ${disposalMethod}. ${reason ? 'Reason: ' + reason.trim() : ''}`
          }
        }
      },
      { new: true }
    ).populate('batch product');

    if (!disposition) {
      const existing = await StockDisposition.findById(dispositionId);
      if (!existing) {
        const error = new Error('Quarantine disposition record not found');
        error.statusCode = 404;
        throw error;
      }
      const error = new Error(`Cannot dispose record with status "${existing.status}"`);
      error.statusCode = 400;
      throw error;
    }

    // Log movement confirming physical disposal
    const movement = new StockMovement({
      product: disposition.product._id,
      batch: disposition.batch._id,
      movementType: 'STOCK_DISPOSED',
      quantityChanged: disposition.quantity,
      quantityBefore: 0,
      quantityAfter: 0,
      reason: `Quarantined stock disposal confirmed (${disposalMethod}): ${reason || disposition.reason}`,
      user: userId
    });
    await movement.save();

    return disposition;
  }

  // Case B: Direct disposal of expired/damaged stock from batch
  if (!batchId || !quantity) {
    const error = new Error('Provide either dispositionId or both batchId and quantity');
    error.statusCode = 400;
    throw error;
  }

  const batch = await InventoryBatch.findById(batchId).populate('product');
  if (!batch) {
    const error = new Error('Inventory batch not found');
    error.statusCode = 404;
    throw error;
  }

  const numQty = Number(quantity);
  if (isNaN(numQty) || numQty <= 0) {
    const error = new Error('Disposal quantity must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  // Atomically decrement stock from batch so concurrent disposals cannot double-deduct
  const updatedBatch = await InventoryBatch.findOneAndUpdate(
    { _id: batch._id, currentQuantity: { $gte: numQty } },
    { $inc: { currentQuantity: -numQty } },
    { new: false }
  );

  if (!updatedBatch) {
    const error = new Error(
      `Cannot dispose ${numQty} units. Available batch stock is insufficient.`
    );
    error.statusCode = 400;
    throw error;
  }

  const before = updatedBatch.currentQuantity;
  const after = before - numQty;

  const costLoss = Number((numQty * (batch.purchasePrice || 0)).toFixed(2));

  // Log StockMovement
  const movement = new StockMovement({
    product: batch.product._id,
    batch: batch._id,
    movementType: 'STOCK_DISPOSED',
    quantityChanged: numQty,
    quantityBefore: before,
    quantityAfter: after,
    reason: `Direct disposal (${disposalMethod}): ${reason.trim()}`,
    user: userId
  });
  await movement.save();

  const finalStatus = actionType === 'WRITE_OFF' ? 'WRITTEN_OFF' : actionType === 'DONATION' ? 'DONATED' : 'DISPOSED';

  const disposition = new StockDisposition({
    store: settings.storeId,
    product: batch.product._id,
    batch: batch._id,
    quantity: numQty,
    actionType,
    reason: reason.trim(),
    status: finalStatus,
    costLoss,
    responsibleEmployee: userId,
    disposalMethod,
    notes: notes.trim(),
    stockDeducted: true,
    history: [
      {
        status: finalStatus,
        changedBy: userId,
        timestamp: new Date(),
        note: `Direct ${actionType} of ${numQty} units via ${disposalMethod}.`
      }
    ]
  });

  await disposition.save();

  // Notification for disposal
  notificationService.createNotification({
    userId,
    storeId: settings.storeId,
    type: 'STOCK_DISPOSED',
    title: `Stock Disposed: ${batch.product.name}`,
    message: `${numQty} units disposed (${costLoss} cost written off) via ${disposalMethod}.`,
    severity: 'danger',
    relatedProduct: batch.product._id,
    relatedBatch: batch._id,
    sendEmail: false
  }).catch(() => {});

  await disposition.populate([
    { path: 'product', select: 'name brand barcode category unit imageUrl' },
    { path: 'batch', select: 'batchNumber expiryDate currentQuantity' },
    { path: 'responsibleEmployee', select: 'fullName email role' }
  ]);

  return disposition;
};

/**
 * Release quarantined stock back to active inventory (e.g. after inspection confirms safety)
 */
const releaseQuarantineStock = async (dispositionIdOrObj, reasonParam, userParam) => {
  const dispositionId = typeof dispositionIdOrObj === 'object' ? dispositionIdOrObj.dispositionId : dispositionIdOrObj;
  const reason = typeof dispositionIdOrObj === 'object' ? dispositionIdOrObj.reason : reasonParam;
  const rawUser = typeof dispositionIdOrObj === 'object' ? reasonParam : userParam;
  const userId = rawUser?._id || rawUser;

  // Atomically claim the release transition so concurrent requests cannot double-restore stock
  const disposition = await StockDisposition.findOneAndUpdate(
    { _id: dispositionId, status: 'QUARANTINED' },
    {
      $set: { status: 'RELEASED_FROM_QUARANTINE' },
      $push: {
        history: {
          status: 'RELEASED_FROM_QUARANTINE',
          changedBy: userId,
          timestamp: new Date(),
          note: reason ? reason.trim() : 'Stock verified safe and returned to active shelf.'
        }
      }
    },
    { new: true }
  ).populate('batch product');

  if (!disposition) {
    const existing = await StockDisposition.findById(dispositionId);
    if (!existing) {
      const error = new Error('Stock disposition record not found');
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`Cannot release stock with status "${existing.status}"`);
    error.statusCode = 400;
    throw error;
  }

  // Atomically restore stock to batch (ensuring does not exceed quantityReceived)
  const updatedBatch = await InventoryBatch.findOneAndUpdate(
    {
      _id: disposition.batch._id,
      $expr: {
        $lte: [{ $add: ['$currentQuantity', disposition.quantity] }, '$quantityReceived']
      }
    },
    {
      $inc: { currentQuantity: disposition.quantity },
      $set: { isQuarantined: false }
    },
    { new: false }
  );

  if (!updatedBatch) {
    // Revert disposition status on failure
    await StockDisposition.findByIdAndUpdate(dispositionId, { $set: { status: 'QUARANTINED' } });
    const error = new Error('Restored stock would exceed original quantity received');
    error.statusCode = 400;
    throw error;
  }

  const before = updatedBatch.currentQuantity;
  const after = before + disposition.quantity;

  // Movement audit log
  const movement = new StockMovement({
    product: disposition.product._id,
    batch: disposition.batch._id,
    movementType: 'STOCK_ADJUSTED_INCREASE',
    quantityChanged: disposition.quantity,
    quantityBefore: before,
    quantityAfter: after,
    reason: `Released from quarantine back to shelves: ${reason || 'Inspected and approved'}`,
    user: userId
  });
  await movement.save();

  return disposition;
};

/**
 * List stock disposition records
 */
const getStockDispositions = async (query = {}) => {
  const { status, actionType, page = 1, limit = 10 } = query;

  const filter = {};
  if (status && status !== 'ALL') {
    filter.status = status;
  }
  if (actionType && actionType !== 'ALL') {
    filter.actionType = actionType;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    StockDisposition.find(filter)
      .populate('product', 'name brand barcode category unit imageUrl')
      .populate('batch', 'batchNumber expiryDate currentQuantity quantityReceived purchasePrice')
      .populate('responsibleEmployee', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    StockDisposition.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    dispositions: items,
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

// =========================================================================
// 4. NEAR-EXPIRY ACTIONS DASHBOARD SUMMARY
// =========================================================================

/**
 * Comprehensive financial and status overview of near-expiry actions
 */
const getActionsSummary = async () => {
  const settings = await getStoreSettings();

  const [
    pendingMarkdowns,
    activeMarkdowns,
    pendingReturns,
    overdueReturns,
    quarantinedStock,
    disposedStock
  ] = await Promise.all([
    Markdown.find({ status: 'PENDING_APPROVAL' }).populate('batch').lean(),
    Markdown.find({ status: 'ACTIVE' }).populate('batch').lean(),
    SupplierReturn.find({ status: { $in: ['REQUESTED', 'APPROVED', 'DISPATCHED'] } }).populate('batch').lean(),
    SupplierReturn.find({
      status: { $in: ['REQUESTED', 'APPROVED', 'DISPATCHED'] },
      followUpDate: { $lt: new Date() }
    }).countDocuments(),
    StockDisposition.find({ status: 'QUARANTINED' }).lean(),
    StockDisposition.find({ status: { $in: ['DISPOSED', 'WRITTEN_OFF'] } }).lean()
  ]);

  // Financial calculations
  let activeMarkdownValue = 0;
  activeMarkdowns.forEach((m) => {
    const qty = m.batch?.currentQuantity || 0;
    activeMarkdownValue += m.discountedPrice * qty;
  });

  let pendingReturnValue = 0;
  pendingReturns.forEach((r) => {
    const price = r.batch?.purchasePrice || 0;
    pendingReturnValue += price * r.quantity;
  });

  const quarantinedUnits = quarantinedStock.reduce((acc, q) => acc + q.quantity, 0);
  const quarantinedCostLoss = Number(
    quarantinedStock.reduce((acc, q) => acc + (q.costLoss || 0), 0).toFixed(2)
  );

  const disposedUnits = disposedStock.reduce((acc, d) => acc + d.quantity, 0);
  const disposedCostLoss = Number(
    disposedStock.reduce((acc, d) => acc + (d.costLoss || 0), 0).toFixed(2)
  );

  return {
    markdowns: {
      pendingApprovalsCount: pendingMarkdowns.length,
      activeCount: activeMarkdowns.length,
      activeMarkdownValue: Number(activeMarkdownValue.toFixed(2))
    },
    supplierReturns: {
      pendingReturnsCount: pendingReturns.length,
      pendingReturnValue: Number(pendingReturnValue.toFixed(2)),
      overdueReturnsCount: overdueReturns
    },
    quarantine: {
      quarantinedCount: quarantinedStock.length,
      quarantinedUnits,
      quarantinedCostLoss
    },
    disposal: {
      disposedCount: disposedStock.length,
      disposedUnits,
      disposedCostLoss
    },
    storeSettings: settings
  };
};

module.exports = {
  getStoreSettings,
  getMarkdownSuggestions,
  createMarkdownRequest,
  approveMarkdown,
  activateMarkdown,
  rejectMarkdown,
  cancelMarkdown,
  completeMarkdown,
  getMarkdowns,
  createSupplierReturn,
  updateSupplierReturnStatus,
  getSupplierReturns,
  quarantineStock,
  disposeStock,
  releaseQuarantineStock,
  getStockDispositions,
  getActionsSummary
};
