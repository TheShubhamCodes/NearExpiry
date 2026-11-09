const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required']
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      required: [true, 'Batch reference is required']
    },
    movementType: {
      type: String,
      required: [true, 'Movement type is required'],
      enum: {
        values: [
          'STOCK_RECEIVED',
          'STOCK_ADJUSTED_INCREASE',
          'STOCK_ADJUSTED_DECREASE',
          'STOCK_DAMAGED',
          'STOCK_EXPIRED',
          'STOCK_QUARANTINED',
          'STOCK_DISPOSED',
          'STOCK_RETURNED_TO_SUPPLIER',
          'STOCK_REPLACEMENT_RECEIVED',
          'STOCK_SOLD'
        ],
        message: '{VALUE} is not a valid stock movement type'
      }
    },
    quantityChanged: {
      type: Number,
      required: [true, 'Quantity changed is required'],
      min: [0.001, 'Quantity changed must be greater than 0']
    },
    quantityBefore: {
      type: Number,
      required: [true, 'Quantity before is required'],
      min: [0, 'Quantity before cannot be negative']
    },
    quantityAfter: {
      type: Number,
      required: [true, 'Quantity after is required'],
      min: [0, 'Quantity after cannot be negative']
    },
    reason: {
      type: String,
      required: [true, 'Movement reason is required'],
      trim: true,
      minlength: [2, 'Reason must be at least 2 characters long'],
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required']
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false } // Auditable: immutable creation timestamp only
  }
);

// Indexes for fast audit retrieval
stockMovementSchema.index({ batch: 1, createdAt: -1 });
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ movementType: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

module.exports = StockMovement;

