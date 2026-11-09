const Store = require('../models/Store');
const { updateStoreSchema } = require('../utils/validators');

const getStore = async (req, res, next) => {
  try {
    const store = await Store.getStore();
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store configuration not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: store
    });
  } catch (error) {
    next(error);
  }
};

const updateStore = async (req, res, next) => {
  try {
    const validated = updateStoreSchema.parse(req.body);

    let store = await Store.getStore();
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store record not found.'
      });
    }

    if (validated.storeName) store.storeName = validated.storeName;
    if (validated.contactEmail) store.contactEmail = validated.contactEmail;
    if (validated.contactPhone !== undefined) store.contactPhone = validated.contactPhone;
    if (validated.currency) store.currency = validated.currency;
    if (validated.address) {
      store.address = {
        ...store.address,
        ...validated.address
      };
    }
    if (validated.expiryWarningDays !== undefined) store.expiryWarningDays = validated.expiryWarningDays;
    if (validated.expiryCriticalDays !== undefined) store.expiryCriticalDays = validated.expiryCriticalDays;
    if (validated.lowStockThreshold !== undefined) store.lowStockThreshold = validated.lowStockThreshold;
    if (validated.timezone) store.timezone = validated.timezone;
    if (validated.notificationSettings) {
      store.notificationSettings = {
        ...store.notificationSettings,
        ...validated.notificationSettings
      };
    }

    // Cross-validate warning and critical days against each other
    if (store.expiryCriticalDays > store.expiryWarningDays) {
      return res.status(400).json({
        success: false,
        message: 'Expiry critical days cannot exceed expiry warning days.'
      });
    }

    await store.save();

    return res.status(200).json({
      success: true,
      message: 'Store settings updated successfully.',
      data: store
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStore,
  updateStore
};

