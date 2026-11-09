const mongoose = require('mongoose');

const returnHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { _id: false }
);

const supplierReturnSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Store reference is required'],
      index: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      required: [true, 'Batch reference is required'],
      index: true
    },
    supplierName: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
      maxlength: [150, 'Supplier name cannot exceed 150 characters']
    },
    quantity: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [0.001, 'Quantity must be greater than 0']
    },
    reason: {
      type: String,
      required: [true, 'Return reason is required'],
      trim: true,
      minlength: [2, 'Reason must be at least 2 characters long'],
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    expectedResolution: {
      type: String,
      enum: {
        values: ['REPLACEMENT', 'REFUND', 'CREDIT_NOTE', 'DISPOSAL_CREDIT'],
        message: '{VALUE} is not a supported return resolution'
      },
      default: 'REPLACEMENT'
    },
    status: {
      type: String,
      enum: {
        values: [
          'DRAFT',
          'REQUESTED',
          'APPROVED',
          'REJECTED',
          'DISPATCHED',
          'REPLACEMENT_RECEIVED',
          'REFUNDED',
          'CLOSED'
        ],
        message: '{VALUE} is not a valid supplier return status'
      },
      default: 'REQUESTED',
      index: true
    },
    returnDate: {
      type: Date,
      default: Date.now
    },
    followUpDate: {
      type: Date,
      default: null,
      index: true
    },
    responsibleEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Responsible employee is required']
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: ''
    },
    resolutionDetails: {
      refundAmount: { type: Number, default: null },
      replacementBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', default: null },
      replacementQuantity: { type: Number, default: null },
      creditNoteNumber: { type: String, default: '' },
      resolvedAt: { type: Date, default: null }
    },
    stockDeducted: {
      type: Boolean,
      default: false
    },
    history: [returnHistorySchema]
  },
  {
    timestamps: true
  }
);

supplierReturnSchema.index({ store: 1, status: 1 });
supplierReturnSchema.index({ createdAt: -1 });

const SupplierReturn = mongoose.model('SupplierReturn', supplierReturnSchema);

module.exports = SupplierReturn;
