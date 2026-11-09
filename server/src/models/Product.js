const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters'],
      maxlength: [200, 'Product name cannot exceed 200 characters']
    },
    brand: {
      type: String,
      trim: true,
      maxlength: [100, 'Brand name cannot exceed 100 characters'],
      default: ''
    },
    barcode: {
      type: String,
      trim: true,
      default: null,
      // Barcode is normalized to null if empty string so partial index works correctly
      set: (val) => (val && typeof val === 'string' && val.trim() ? val.trim() : null)
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      maxlength: [100, 'Category cannot exceed 100 characters'],
      default: 'General'
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: ''
    },
    imageUrl: {
      type: String,
      trim: true,
      default: ''
    },
    unit: {
      type: String,
      required: [true, 'Unit of measurement is required'],
      trim: true,
      enum: {
        values: [
          'piece',
          'kg',
          'g',
          'litre',
          'ml',
          'packet',
          'box',
          'can',
          'bottle',
          'bundle',
          'pack'
        ],
        message: '{VALUE} is not a supported unit of measurement'
      },
      default: 'piece'
    },
    manufacturer: {
      type: String,
      trim: true,
      maxlength: [150, 'Manufacturer cannot exceed 150 characters'],
      default: ''
    },
    reorderPoint: {
      type: Number,
      default: null,
      min: [0, 'Reorder point cannot be negative'],
      set: (val) => (val !== undefined && val !== null && val !== '' ? Number(val) : null)
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

// Indexes:
// 1. Partial unique index on barcode: enforce uniqueness ONLY when barcode is present and not null
productSchema.index(
  { barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { barcode: { $type: 'string', $gt: '' } }
  }
);

// 2. Indexes for efficient filtering, search, and sorting
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ name: 1 });
productSchema.index({ brand: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

