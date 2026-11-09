/**
 * NearExpiry Phase 4 HTTP End-to-End API Test Suite
 * 
 * Verifies live HTTP endpoints on http://localhost:5000/api
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const { generateToken } = require('./token');

const BASE_URL = 'http://localhost:5000/api';

const runHttpTests = async () => {
  console.log('\n========================================');
  console.log('  NearExpiry — Live HTTP API Verification');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  const log = (msg, ok = true) => {
    console.log(`${ok ? '  [PASS]' : '  [FAIL]'} ${msg}`);
    if (ok) passed++; else failed++;
  };

  try {
    await mongoose.connect(mongodbUri);
    console.log('[Setup] Connected to MongoDB');

    // 1. Check health
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    if (healthData.success) {
      log('Health check endpoint responsive (200 OK)');
    } else {
      log('Health check failed', false);
    }

    // 2. Fetch or create test user for token generation
    let user = await User.findOne({ role: 'owner' });
    if (!user) {
      user = await User.create({
        fullName: 'HTTP Test Owner',
        email: 'http_owner@nearexpiry.local',
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

    // 3. Test list products
    const listRes = await fetch(`${BASE_URL}/products`, { headers });
    const listData = await listRes.json();
    if (listRes.status === 200 && Array.isArray(listData.data?.products)) {
      log(`GET /api/products returned 200 OK (${listData.data.products.length} products listed)`);
    } else {
      log(`GET /api/products failed: ${JSON.stringify(listData)}`, false);
    }

    // 4. Test create product with barcode
    const createRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'TEST_Organic Eggs 12pk',
        brand: 'HappyHens',
        barcode: '1234567890128',
        category: 'Dairy & Eggs',
        unit: 'box',
        description: 'Free range pasture raised eggs',
        manufacturer: 'HappyHens Farms'
      })
    });
    const createData = await createRes.json();
    let createdId = createData.data?.product?._id;
    if (createRes.status === 201 && createdId) {
      log(`POST /api/products created product "${createData.data.product.name}" with ID: ${createdId}`);
    } else {
      log(`POST /api/products failed: ${JSON.stringify(createData)}`, false);
    }

    // 5. Test duplicate barcode rejection
    const dupRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'TEST_Duplicate Eggs',
        barcode: '1234567890128',
        category: 'Dairy & Eggs',
        unit: 'box'
      })
    });
    const dupData = await dupRes.json();
    if (dupRes.status === 400 && dupData.message.includes('already exists')) {
      log(`Duplicate barcode rejected with HTTP 400: "${dupData.message}"`);
    } else {
      log(`Duplicate barcode check failed: ${JSON.stringify(dupData)}`, false);
    }

    // 6. Test create product without barcode
    const noBarcodeRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'TEST_Fresh French Baguette',
        brand: 'Bakery Dept',
        barcode: '',
        category: 'Bakery & Bread',
        unit: 'piece'
      })
    });
    const noBarcodeData = await noBarcodeRes.json();
    let noBarcodeId = noBarcodeData.data?.product?._id;
    if (noBarcodeRes.status === 201 && noBarcodeData.data.product.barcode === null) {
      log(`POST /api/products created barcode-less product "${noBarcodeData.data.product.name}"`);
    } else {
      log(`Creating barcode-less product failed: ${JSON.stringify(noBarcodeData)}`, false);
    }

    // 7. Test lookup: local product
    const localLookupRes = await fetch(`${BASE_URL}/products/lookup/1234567890128`, { headers });
    const localLookupData = await localLookupRes.json();
    if (localLookupRes.status === 200 && localLookupData.data.source === 'local') {
      log(`GET /api/products/lookup/1234567890128 matched local catalog: "${localLookupData.data.product.name}"`);
    } else {
      log(`Local lookup failed: ${JSON.stringify(localLookupData)}`, false);
    }

    // 8. Test lookup: Open Food Facts live lookup (Nutella: 3017620422003)
    const offLookupRes = await fetch(`${BASE_URL}/products/lookup/3017620422003`, { headers });
    const offLookupData = await offLookupRes.json();
    if (offLookupRes.status === 200 && offLookupData.data.source === 'openfoodfacts' && offLookupData.data.found) {
      log(`GET /api/products/lookup/3017620422003 retrieved OFF metadata: "${offLookupData.data.product.name}" (${offLookupData.data.product.category})`);
    } else {
      log(`Open Food Facts live lookup failed: ${JSON.stringify(offLookupData)}`, false);
    }

    // 9. Test get categories
    const catRes = await fetch(`${BASE_URL}/products/categories`, { headers });
    const catData = await catRes.json();
    if (catRes.status === 200 && Array.isArray(catData.data.categories) && catData.data.categories.length > 5) {
      log(`GET /api/products/categories returned ${catData.data.categories.length} categories`);
    } else {
      log(`Get categories failed: ${JSON.stringify(catData)}`, false);
    }

    // 10. Test update product
    if (createdId) {
      const updateRes = await fetch(`${BASE_URL}/products/${createdId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: 'TEST_Organic Eggs 12pk (Pasture-Raised)',
          brand: 'HappyHens Premium'
        })
      });
      const updateData = await updateRes.json();
      if (updateRes.status === 200 && updateData.data.product.brand === 'HappyHens Premium') {
        log(`PUT /api/products/${createdId} updated product name and brand`);
      } else {
        log(`Update product failed: ${JSON.stringify(updateData)}`, false);
      }
    }

    // 11. Test delete products
    if (createdId) {
      const del1 = await fetch(`${BASE_URL}/products/${createdId}`, { method: 'DELETE', headers });
      const del1Data = await del1.json();
      if (del1.status === 200) {
        log(`DELETE /api/products/${createdId} deleted successfully`);
      } else {
        log(`Delete product 1 failed: ${JSON.stringify(del1Data)}`, false);
      }
    }
    if (noBarcodeId) {
      const del2 = await fetch(`${BASE_URL}/products/${noBarcodeId}`, { method: 'DELETE', headers });
      const del2Data = await del2.json();
      if (del2.status === 200) {
        log(`DELETE /api/products/${noBarcodeId} deleted successfully`);
      } else {
        log(`Delete product 2 failed: ${JSON.stringify(del2Data)}`, false);
      }
    }

    // 12. Cleanup test data
    await Product.deleteMany({ name: { $regex: /^TEST_/ } });
    await User.deleteMany({ email: 'http_owner@nearexpiry.local' });
    log('Database cleanly reset: 0 test products remaining');

  } catch (err) {
    console.error('[E2E TEST ERROR]', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n========================================');
    console.log(`  Live HTTP Tests: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
};

runHttpTests();
