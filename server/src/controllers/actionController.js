const actionService = require('../services/actionService');
const {
  createMarkdownSchema,
  rejectMarkdownSchema,
  cancelMarkdownSchema,
  createSupplierReturnSchema,
  updateSupplierReturnStatusSchema,
  quarantineStockSchema,
  disposeStockSchema,
  releaseQuarantineSchema
} = require('../utils/validators');

/**
 * Get comprehensive Action Management summary & KPIs
 */
const getSummary = async (req, res, next) => {
  try {
    const summary = await actionService.getActionsSummary();
    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get automatic smart markdown suggestions for approaching-expiry batches
 */
const getMarkdownSuggestions = async (req, res, next) => {
  try {
    const suggestions = await actionService.getMarkdownSuggestions();
    return res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List markdowns with filtering & pagination
 */
const getMarkdowns = async (req, res, next) => {
  try {
    const result = await actionService.getMarkdowns(req.query);
    return res.status(200).json({
      success: true,
      data: result.markdowns,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new markdown proposal (Employee or Owner)
 */
const createMarkdown = async (req, res, next) => {
  try {
    const validated = createMarkdownSchema.parse(req.body);
    const markdown = await actionService.createMarkdownRequest(
      validated,
      req.user._id
    );
    return res.status(201).json({
      success: true,
      message: 'Markdown proposal submitted successfully',
      data: markdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve a markdown proposal (Owner only)
 */
const approveMarkdown = async (req, res, next) => {
  try {
    const markdown = await actionService.approveMarkdown(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      message: 'Markdown proposal approved successfully',
      data: markdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate an approved markdown proposal (Owner only)
 */
const activateMarkdown = async (req, res, next) => {
  try {
    const markdown = await actionService.activateMarkdown(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      message: 'Markdown activated successfully and batch price updated',
      data: markdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject a markdown proposal (Owner only)
 */
const rejectMarkdown = async (req, res, next) => {
  try {
    const validated = rejectMarkdownSchema.parse(req.body);
    const markdown = await actionService.rejectMarkdown(req.params.id, validated.reason, req.user._id);
    return res.status(200).json({
      success: true,
      message: 'Markdown proposal rejected',
      data: markdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel a markdown (Owner can cancel any active/approved markdown; Employees can only withdraw their own pending proposals)
 */
const cancelMarkdown = async (req, res, next) => {
  try {
    const validated = cancelMarkdownSchema.parse(req.body);
    const markdown = await actionService.cancelMarkdown(req.params.id, validated.reason, req.user);
    return res.status(200).json({
      success: true,
      message: 'Markdown cancelled',
      data: markdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete a markdown (when batch sold out or campaign concludes)
 */
const completeMarkdown = async (req, res, next) => {
  try {
    const markdown = await actionService.completeMarkdown(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      message: 'Markdown completed',
      data: markdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List supplier returns with filtering and pagination
 */
const getSupplierReturns = async (req, res, next) => {
  try {
    const result = await actionService.getSupplierReturns(req.query);
    return res.status(200).json({
      success: true,
      data: result.returns,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate a new supplier return record
 */
const createSupplierReturn = async (req, res, next) => {
  try {
    const validated = createSupplierReturnSchema.parse(req.body);
    const supplierReturn = await actionService.createSupplierReturn(validated, req.user);
    return res.status(201).json({
      success: true,
      message: 'Supplier return initiated successfully',
      data: supplierReturn
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update supplier return status (e.g. DISPATCHED, REPLACEMENT_RECEIVED, etc.)
 */
const updateSupplierReturnStatus = async (req, res, next) => {
  try {
    const validated = updateSupplierReturnStatusSchema.parse(req.body);
    const updatedReturn = await actionService.updateSupplierReturnStatus(
      req.params.id,
      validated,
      req.user
    );
    return res.status(200).json({
      success: true,
      message: `Supplier return updated to ${validated.status}`,
      data: updatedReturn
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List stock dispositions (quarantines, disposals, write-offs)
 */
const getStockDispositions = async (req, res, next) => {
  try {
    const result = await actionService.getStockDispositions(req.query);
    return res.status(200).json({
      success: true,
      data: result.dispositions,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Quarantine stock from active inventory
 */
const quarantineStock = async (req, res, next) => {
  try {
    const validated = quarantineStockSchema.parse(req.body);
    const disposition = await actionService.quarantineStock(validated, req.user);
    return res.status(201).json({
      success: true,
      message: 'Stock successfully segregated and placed in quarantine',
      data: disposition
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Dispose or write-off stock (from quarantine or directly from batch)
 */
const disposeStock = async (req, res, next) => {
  try {
    const validated = disposeStockSchema.parse(req.body);
    const disposition = await actionService.disposeStock(validated, req.user);
    return res.status(200).json({
      success: true,
      message: 'Stock disposition / write-off processed successfully',
      data: disposition
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Release quarantined stock back to active inventory
 */
const releaseQuarantineStock = async (req, res, next) => {
  try {
    const validated = releaseQuarantineSchema.parse(req.body);
    const disposition = await actionService.releaseQuarantineStock(
      { dispositionId: req.params.id, reason: validated.reason },
      req.user
    );
    return res.status(200).json({
      success: true,
      message: 'Stock successfully released from quarantine back to active inventory',
      data: disposition
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  getMarkdownSuggestions,
  getMarkdowns,
  createMarkdown,
  approveMarkdown,
  activateMarkdown,
  rejectMarkdown,
  cancelMarkdown,
  completeMarkdown,
  getSupplierReturns,
  createSupplierReturn,
  updateSupplierReturnStatus,
  getStockDispositions,
  quarantineStock,
  disposeStock,
  releaseQuarantineStock
};
