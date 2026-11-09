const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: [true, 'Store name is required'],
      trim: true,
      maxlength: [100, 'Store name cannot exceed 100 characters']
    },
    contactEmail: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true
    },
    contactPhone: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: '' }
    },
    currency: {
      type: String,
      trim: true,
      default: 'USD ($)'
    },
    expiryWarningDays: {
      type: Number,
      default: 7,
      min: [0, 'Expiry warning days cannot be negative']
    },
    expiryCriticalDays: {
      type: Number,
      default: 3,
      min: [0, 'Expiry critical days cannot be negative']
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Low stock threshold cannot be negative']
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
      trim: true,
      validate: {
        validator: function (val) {
          if (!val) return false;
          try {
            Intl.DateTimeFormat(undefined, { timeZone: val });
            return true;
          } catch (e) {
            return false;
          }
        },
        message: 'Invalid IANA timezone identifier'
      }
    },
    notificationSettings: {
      inAppEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: false },
      dailyDigestEnabled: { type: Boolean, default: true },
      dailyDigestTime: { type: String, default: '08:00', trim: true },
      notifyExpiryWarning: { type: Boolean, default: true },
      notifyExpiryCritical: { type: Boolean, default: true },
      notifyExpiringToday: { type: Boolean, default: true },
      notifyExpired: { type: Boolean, default: true },
      notifyLowStock: { type: Boolean, default: true },
      notifyBatchDepleted: { type: Boolean, default: true }
    },
    markdownRules: {
      warningDiscountPercent: { type: Number, default: 15, min: 0, max: 100 },
      criticalDiscountPercent: { type: Number, default: 30, min: 0, max: 100 },
      todayDiscountPercent: { type: Number, default: 50, min: 0, max: 100 },
      autoSuggestEnabled: { type: Boolean, default: true }
    },
    aiSettings: {
      minMarginPercent: { type: Number, default: 10, min: 0, max: 100 },
      leadTimeDays: { type: Number, default: 3, min: 1, max: 60 },
      forecastPeriodDays: { type: Number, default: 14, min: 1, max: 90 },
      velocityWindowDays: { type: Number, default: 30, min: 7, max: 180 },
      autoAlertHighRisk: { type: Boolean, default: true }
    },
    isConfigured: {
      type: Boolean,
      default: true
    },
    // Database-level single-store constraint: only ONE store document can have key 'primary_store'
    storeKey: {
      type: String,
      default: 'primary_store',
      unique: true,
      immutable: true
    }
  },
  {
    timestamps: true
  }
);

// Validate threshold logic before validation
storeSchema.pre('validate', function (next) {
  if (
    typeof this.expiryCriticalDays === 'number' &&
    typeof this.expiryWarningDays === 'number' &&
    this.expiryCriticalDays > this.expiryWarningDays
  ) {
    this.invalidate('expiryCriticalDays', 'Expiry critical days cannot exceed expiry warning days');
  }
  next();
});

// Helper static method to get the single store
storeSchema.statics.getStore = async function () {
  return await this.findOne();
};

const Store = mongoose.model('Store', storeSchema);

module.exports = Store;

