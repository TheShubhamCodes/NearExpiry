const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const employeeRoutes = require('./employeeRoutes');
const storeRoutes = require('./storeRoutes');
const productRoutes = require('./productRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const expiryRoutes = require('./expiryRoutes');
const notificationRoutes = require('./notificationRoutes');
const actionRoutes = require('./actionRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const aiRoutes = require('./aiRoutes');

const router = express.Router();

// Mount API routes
router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/store', storeRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/expiry', expiryRoutes);
router.use('/notifications', notificationRoutes);
router.use('/actions', actionRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/ai', aiRoutes);
router.use('/', healthRoutes);

module.exports = router;
