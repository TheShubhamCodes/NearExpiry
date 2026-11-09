/**
 * NearExpiry Phase 5 Live HTTP Integration Tests
 * 
 * Verifies live Express HTTP endpoints on http://localhost:5000/api/inventory
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Product = require('../models/Product');
const InventoryBatch = require('../models/InventoryBatch');
const StockMovement = require('../models/StockMovement');
const { generateToken } = require('./token');

const BASE_URL = 'http://localhost:5000/api';

const runHttpTests = async () => {
  console.log('\n======================================================');
  console.log('  NearExpiry — Live HTTP Phase 5 API Verification');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  const log = (msg, ok = true) => {
    console.log(`${ok ? '  [PASS]' : '  [FAIL]'} ${msg}`);
    if (ok) passed++; else failed++;
  };

  try {
    await mongoose.connect(mongodbUri);
    console.log('[Setup] Connected to MongoDB');

    let user = await User.findOne({ role: 'owner' });
    if (!user) {
      user = await User.create({
        fullName: 'HTTP Phase 5 Owner',
        email: 'http_p5_owner@nearexpiry.local',
        password: 'Password123!',
        role: 'owner',
        isActive: true
      });
    }

    const token = generateToken(user);
    const headers = {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173',
      'Cookie': `token=${token}`,
      'Authorization': `Bearer ${token}`
    };

    // 1. Create a test product
    const product = await Product.create({
      name: 'HTTP_TEST_Cereal Box 500g',
      brand: 'CrispyFlakes',
      category: 'Pantry Staples',
      unit: 'box',
      createdBy: user._id
    });
    console.log(`[Setup] Created test product: ${product.name} (${product._id})`);

    // 2. Test POST /api/inventory/receive
    const expDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const receiveRes = await fetch(`${BASE_URL}/inventory/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productId: product._id.toString(),
        batchNumber: 'HTTP-LOT-1',
        quantityReceived: 40,
        purchasePrice: 2.20,
        sellingPrice: 3.49,
        expiryDate: expDate,
        supplierName: 'Grain Corp',
        notes: 'HTTP test stock receipt'
      })
    });
    const receiveData = await receiveRes.json();
    const batchId = receiveData.data?.batch?._id;
    if (receiveRes.status === 201 && batchId && receiveData.data.batch.currentQuantity === 40) {
      log(`POST /api/inventory/receive created batch ${receiveData.data.batch.batchNumber} with 40 units`);
    } else {
      log(`POST /api/inventory/receive failed: ${JSON.stringify(receiveData)}`, false);
    }

    // 3. Test GET /api/inventory/batches
    const listRes = await fetch(`${BASE_URL}/inventory/batches?product=${product._id}`, { headers });
    const listData = await listRes.json();
    if (listRes.status === 200 && listData.data.batches.length >= 1) {
      log(`GET /api/inventory/batches listed batches (found: ${listData.data.batches.length})`);
    } else {
      log(`GET /api/inventory/batches failed: ${JSON.stringify(listData)}`, false);
    }

    // 4. Test GET /api/inventory/summary
    const summaryRes = await fetch(`${BASE_URL}/inventory/summary`, { headers });
    const summaryData = await summaryRes.json();
    if (summaryRes.status === 200 && summaryData.data.totalUnitsInStock >= 40) {
      log(`GET /api/inventory/summary returned totalUnitsInStock: ${summaryData.data.totalUnitsInStock}`);
    } else {
      log(`GET /api/inventory/summary failed: ${JSON.stringify(summaryData)}`, false);
    }

    // 5. Test GET /api/inventory/products/:productId/batches
    const productBatchesRes = await fetch(`${BASE_URL}/inventory/products/${product._id}/batches`, { headers });
    const productBatchesData = await productBatchesRes.json();
    if (productBatchesRes.status === 200 && productBatchesData.data.summary.totalAvailableUnits === 40) {
      log(`GET /api/inventory/products/:id/batches returned 40 available units for ${product.name}`);
    } else {
      log(`GET product batches failed: ${JSON.stringify(productBatchesData)}`, false);
    }

    // 6. Test POST /api/inventory/batches/:id/adjust
    const adjustRes = await fetch(`${BASE_URL}/inventory/batches/${batchId}/adjust`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        adjustmentType: 'STOCK_DAMAGED',
        quantity: 4,
        reason: 'Water leak damaged 4 boxes'
      })
    });
    const adjustData = await adjustRes.json();
    if (adjustRes.status === 200 && adjustData.data.batch.currentQuantity === 36) {
      log(`POST /api/inventory/batches/:id/adjust decreased stock to 36 (${adjustData.data.movement.movementType})`);
    } else {
      log(`POST stock adjustment failed: ${JSON.stringify(adjustData)}`, false);
    }

    // 7. Test Protected Product Deletion
    const delProdRes = await fetch(`${BASE_URL}/products/${product._id}`, {
      method: 'DELETE',
      headers
    });
    const delProdData = await delProdRes.json();
    if (delProdRes.status === 400 && delProdData.message.includes('associated inventory batch(es)')) {
      log(`Product deletion blocked via HTTP 400: "${delProdData.message}"`);
    } else {
      log(`Product deletion protection failed: ${JSON.stringify(delProdData)}`, false);
    }

    // 8. Test GET /api/inventory/movements
    const movementsRes = await fetch(`${BASE_URL}/inventory/movements?batch=${batchId}`, { headers });
    const movementsData = await movementsRes.json();
    if (movementsRes.status === 200 && movementsData.data.movements.length === 2) {
      log(`GET /api/inventory/movements returned 2 audit movements (STOCK_RECEIVED, STOCK_DAMAGED)`);
    } else {
      log(`GET movements failed: ${JSON.stringify(movementsData)}`, false);
    }

    // Cleanup
    await InventoryBatch.deleteMany({ product: product._id });
    await StockMovement.deleteMany({ product: product._id });
    await Product.findByIdAndDelete(product._id);
    await User.deleteMany({ email: 'http_p5_owner@nearexpiry.local' });
    log('Database cleanly reset: 0 test records remaining');

  } catch (err) {
    console.error('[HTTP E2E TEST ERROR]', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n======================================================');
    console.log(`  Live HTTP Tests: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
};

runHttpTests();

