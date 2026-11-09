const mongoose = require('mongoose');

const markdownHistorySchema = new mongoose.Schema(
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

const markdownSchema = new mongoose.Schema(
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
    originalPrice: {
      type: Number,
      required: [true, 'Original price is required'],
      min: [0, 'Original price cannot be negative']
    },
    discountPercent: {
      type: Number,
      required: [true, 'Discount percentage is required'],
      min: [1, 'Discount percentage must be at least 1%'],
      max: [99, 'Discount percentage cannot exceed 99%']
    },
    discountedPrice: {
      type: Number,
      required: [true, 'Discounted price is required'],
      min: [0, 'Discounted price cannot be negative']
    },
    reason: {
      type: String,
      required: [true, 'Markdown reason is required'],
      trim: true,
      minlength: [2, 'Reason must be at least 2 characters long'],
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: {
        values: [
          'PENDING_APPROVAL',
          'APPROVED',
          'ACTIVE',
          'REJECTED',
          'CANCELLED',
          'EXPIRED',
          'COMPLETED'
        ],
        message: '{VALUE} is not a valid markdown status'
      },
      default: 'PENDING_APPROVAL',
      index: true
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requesting user reference is required']
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvalDate: {
      type: Date,
      default: null
    },
    activatedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    history: [markdownHistorySchema]
  },
  {
    timestamps: true
  }
);

// Indexes
markdownSchema.index({ store: 1, status: 1 });
markdownSchema.index({ batch: 1, status: 1 });
markdownSchema.index({ createdAt: -1 });

const Markdown = mongoose.model('Markdown', markdownSchema);

module.exports = Markdown;

