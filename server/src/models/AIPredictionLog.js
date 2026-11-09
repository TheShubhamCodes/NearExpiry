const mongoose = require('mongoose');

const aiPredictionLogSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Store reference is required'],
      index: true
    },
    predictionType: {
      type: String,
      required: [true, 'Prediction type is required'],
      enum: {
        values: [
          'EXPIRY_RISK',
          'DISCOUNT_RECOMMENDATION',
          'DEMAND_FORECAST',
          'ANOMALY_INSIGHT'
        ],
        message: '{VALUE} is not a valid prediction type'
      },
      index: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryBatch',
      default: null,
      index: true
    },
    modelVersion: {
      type: String,
      default: '1.0.0'
    },
    inputs: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    prediction: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    actualOutcome: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVIEWED', 'DISMISSED', 'APPLIED'],
      default: 'ACTIVE',
      index: true
    }
  },
  {
    timestamps: true
  }
);

aiPredictionLogSchema.index({ store: 1, predictionType: 1, createdAt: -1 });

const AIPredictionLog = mongoose.model('AIPredictionLog', aiPredictionLogSchema);

module.exports = AIPredictionLog;

