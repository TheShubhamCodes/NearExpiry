const mongoose = require('mongoose');

const dispositionHistorySchema = new mongoose.Schema(
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

const stockDispositionSchema = new mongoose.Schema(
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
      required: [true, 'Quantity is required'],
      min: [0.001, 'Quantity must be greater than 0']
    },
    actionType: {
      type: String,
      enum: {
        values: ['QUARANTINE', 'DISPOSAL', 'WRITE_OFF', 'DONATION'],
        message: '{VALUE} is not a valid disposition action type'
      },
      required: [true, 'Action type is required']
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      minlength: [2, 'Reason must be at least 2 characters long'],
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: {
        values: [
          'QUARANTINED',
          'DISPOSED',
          'WRITTEN_OFF',
          'DONATED',
          'RELEASED_FROM_QUARANTINE'
        ],
        message: '{VALUE} is not a valid disposition status'
      },
      default: 'QUARANTINED',
      index: true
    },
    dispositionDate: {
      type: Date,
      default: Date.now
    },
    costLoss: {
      type: Number,
      default: 0,
      min: [0, 'Cost loss cannot be negative']
    },
    responsibleEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Responsible employee is required']
    },
    disposalMethod: {
      type: String,
      trim: true,
      maxlength: [100, 'Disposal method cannot exceed 100 characters'],
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: ''
    },
    stockDeducted: {
      type: Boolean,
      default: false
    },
    history: [dispositionHistorySchema]
  },
  {
    timestamps: true
  }
);

stockDispositionSchema.index({ store: 1, status: 1 });
stockDispositionSchema.index({ createdAt: -1 });

const StockDisposition = mongoose.model('StockDisposition', stockDispositionSchema);

module.exports = StockDisposition;
