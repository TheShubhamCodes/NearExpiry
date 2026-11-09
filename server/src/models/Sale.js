const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: [true, 'Sale quantity is required'],
      min: [0.001, 'Sale quantity must be greater than 0']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit selling price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    costPrice: {
      type: Number,
      default: 0,
      min: [0, 'Cost price cannot be negative']
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total sale amount is required'],
      min: [0, 'Total amount cannot be negative']
    },
    isMarkdown: {
      type: Boolean,
      default: false
    },
    markdown: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Markdown',
      default: null
    },
    saleDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recording user reference is required']
    },
    receiptNumber: {
      type: String,
      trim: true,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for fast time-window queries & product velocity lookups
saleSchema.index({ store: 1, saleDate: -1 });
saleSchema.index({ product: 1, saleDate: -1 });
saleSchema.index({ batch: 1, saleDate: -1 });
saleSchema.index({ saleDate: -1 });

const Sale = mongoose.model('Sale', saleSchema);

module.exports = Sale;

