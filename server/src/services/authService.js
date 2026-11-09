const User = require('../models/User');
const Store = require('../models/Store');
const { generateToken } = require('../utils/token');
const { setupSchema, loginSchema } = require('../utils/validators');

const getSetupStatus = async () => {
  const ownerCount = await User.countDocuments({ role: 'owner' });
  const store = await Store.getStore();

  return {
    isSetup: ownerCount > 0 && store !== null,
    storeName: store ? store.storeName : null
  };
};

const setupInitialOwner = async (data) => {
  // Validate input
  const validated = setupSchema.parse(data);

  // Check if owner or store already exists (prevent duplicate initial owner)
  const existingOwner = await User.findOne({ role: 'owner' });
  const existingStore = await Store.findOne();

  if (existingOwner || existingStore) {
    const error = new Error('Initial store setup has already been completed. Public registration is permanently disabled.');
    error.statusCode = 403;
    throw error;
  }

  // Check if email already used
  const emailExists = await User.findOne({ email: validated.email });
  if (emailExists) {
    const error = new Error('A user with this email address already exists.');
    error.statusCode = 400;
    throw error;
  }

  try {
    // Create Store record (enforced unique by storeKey at the DB level)
    const store = await Store.create({
      storeName: validated.storeName,
      contactEmail: validated.email,
      contactPhone: validated.contactPhone || '',
      address: validated.address || {},
      currency: validated.currency || 'USD ($)',
      isConfigured: true,
      storeKey: 'primary_store'
    });

    // Create Initial Owner User (enforced single-owner by partial unique index on role at DB level)
    const owner = await User.create({
      fullName: validated.fullName,
      email: validated.email,
      password: validated.password,
      role: 'owner',
      isActive: true,
      lastLogin: new Date()
    });

    const token = generateToken(owner);

    return {
      user: owner,
      store,
      token
    };
  } catch (err) {
    if (err.code === 11000) {
      const isRoleOrStore = (err.keyPattern && (err.keyPattern.role || err.keyPattern.storeKey)) ||
                            err.message.includes('role') || err.message.includes('storeKey');
      if (isRoleOrStore) {
        const error = new Error('Initial store setup has already been completed. Public registration is permanently disabled.');
        error.statusCode = 403;
        throw error;
      }
      if ((err.keyPattern && err.keyPattern.email) || err.message.includes('email')) {
        const error = new Error('A user with this email address already exists.');
        error.statusCode = 400;
        throw error;
      }
    }
    throw err;
  }
};

const loginUser = async (data) => {
  const validated = loginSchema.parse(data);

  // Query user with password explicitly included
  const user = await User.findOne({ email: validated.email }).select('+password');
  if (!user) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  // Check password
  const isMatch = await user.matchPassword(validated.password);
  if (!isMatch) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  // Check active status
  if (!user.isActive) {
    const error = new Error('Your account has been deactivated. Please contact the store owner.');
    error.statusCode = 403;
    throw error;
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  const store = await Store.getStore();
  const token = generateToken(user);

  return {
    user,
    store,
    token
  };
};

module.exports = {
  getSetupStatus,
  setupInitialOwner,
  loginUser
};

