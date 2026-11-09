const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient user is required'],
      index: true
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Store reference is required'],
      index: true
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: {
        values: [
          'EXPIRY_WARNING',
          'EXPIRY_CRITICAL',
          'EXPIRING_CRITICAL',
          'EXPIRING_TODAY',
          'EXPIRED',
          'LOW_STOCK',
          'BATCH_DEPLETED',
          'STOCK_ADJUSTMENT',
          'DAILY_DIGEST',
          'MARKDOWN_APPROVAL_REQUEST',
          'MARKDOWN_APPROVED',
          'MARKDOWN_REJECTED',
          'SUPPLIER_RETURN_UPDATE',
          'STOCK_QUARANTINED',
          'STOCK_DISPOSED',
          'AI_HIGH_EXPIRY_RISK',
          'AI_STOCKOUT_WARNING',
          'AI_REORDER_RECOMMENDED',
          'AI_INVENTORY_ANOMALY'
        ],
        message: '{VALUE} is not a supported notification type'
      }
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical', 'danger'],
      default: 'info'
    },
    relatedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null
    },
    relatedBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      default: null
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    deduplicationKey: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes for high-performance notification querying:
// 1. Efficient user notification feed ordered by newest
notificationSchema.index({ user: 1, createdAt: -1 });

// 2. Unread count and filter queries
notificationSchema.index({ user: 1, isRead: 1 });

// 3. Store and type aggregation
notificationSchema.index({ store: 1, type: 1 });

// 4. Unique deduplication key index to prevent duplicate notifications
notificationSchema.index(
  { deduplicationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { deduplicationKey: { $type: 'string', $gt: '' } }
  }
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
