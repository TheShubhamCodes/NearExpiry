const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/,
        'Please enter a valid email address'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false // Exclude from query results by default
    },
    role: {
      type: String,
      enum: {
        values: ['owner', 'employee'],
        message: 'Role must be either owner or employee'
      },
      default: 'employee'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date,
      default: null
    },
    notificationPreferences: {
      inAppEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
      browserNotificationsEnabled: { type: Boolean, default: false },
      notifyExpiryWarning: { type: Boolean, default: true },
      notifyExpiryCritical: { type: Boolean, default: true },
      notifyExpiringToday: { type: Boolean, default: true },
      notifyExpired: { type: Boolean, default: true },
      notifyLowStock: { type: Boolean, default: true },
      notifyBatchDepleted: { type: Boolean, default: true }
    }
  },
  {
    timestamps: true
  }
);

// Database-level single-owner constraint: Only ONE user in the entire database can have role 'owner'
userSchema.index(
  { role: 1 },
  { 
    unique: true, 
    partialFilterExpression: { role: 'owner' } 
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Sanitize user object for JSON serialization (never expose password)
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;

