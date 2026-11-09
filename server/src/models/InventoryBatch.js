const mongoose = require('mongoose');

const inventoryBatchSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required']
    },
    batchNumber: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'Batch number cannot exceed 100 characters']
    },
    quantityReceived: {
      type: Number,
      required: [true, 'Original quantity received is required'],
      min: [0.001, 'Quantity received must be greater than 0']
    },
    currentQuantity: {
      type: Number,
      required: [true, 'Current available quantity is required'],
      min: [0, 'Current quantity cannot be negative']
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase cost per unit is required'],
      min: [0, 'Purchase price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      default: null,
      min: [0, 'Selling price cannot be negative']
    },
    activeMarkdown: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Markdown',
      default: null
    },
    discountedPrice: {
      type: Number,
      default: null,
      min: [0, 'Discounted price cannot be negative']
    },
    isQuarantined: {
      type: Boolean,
      default: false
    },
    manufacturingDate: {
      type: Date,
      default: null
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required']
    },
    receivedDate: {
      type: Date,
      default: Date.now
    },
    supplierName: {
      type: String,
      trim: true,
      maxlength: [150, 'Supplier name cannot exceed 150 characters'],
      default: ''
    },
    supplierInvoiceNumber: {
      type: String,
      trim: true,
      maxlength: [100, 'Supplier invoice number cannot exceed 100 characters'],
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by user is required']
    }
  },
  {
    timestamps: true
  }
);

// Pre-validation and pre-save business rule checks
inventoryBatchSchema.pre('validate', function (next) {
  // 1. Current quantity must not exceed quantity received
  if (this.currentQuantity !== undefined && this.quantityReceived !== undefined) {
    if (this.currentQuantity > this.quantityReceived) {
      this.invalidate('currentQuantity', 'Current available quantity cannot exceed original quantity received');
    }
  }

  // 2. Expiry date cannot be earlier than manufacturing date
  if (this.manufacturingDate && this.expiryDate) {
    const mfg = new Date(this.manufacturingDate);
    const exp = new Date(this.expiryDate);
    if (exp < mfg) {
      this.invalidate('expiryDate', 'Expiry date cannot be earlier than manufacturing date');
    }
  }

  next();
});

// Indexes for fast lookup, sorting, and FEFO expiry queries
inventoryBatchSchema.index({ product: 1, expiryDate: 1 });
inventoryBatchSchema.index({ expiryDate: 1 });
inventoryBatchSchema.index({ batchNumber: 1 });
inventoryBatchSchema.index({ product: 1, currentQuantity: 1 });
inventoryBatchSchema.index({ isQuarantined: 1, currentQuantity: 1 });
inventoryBatchSchema.index({ receivedDate: 1 });
inventoryBatchSchema.index({ createdAt: -1 });

const InventoryBatch = mongoose.model('InventoryBatch', inventoryBatchSchema);

module.exports = InventoryBatch;

