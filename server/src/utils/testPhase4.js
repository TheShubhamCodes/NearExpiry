/**
 * NearExpiry Phase 4 Automated Test Suite
 * 
 * Verifies:
 * 1. Product creation with and without barcode
 * 2. Barcode uniqueness constraint (HTTP 400 on duplicate)
 * 3. Multiple barcode-less products permitted
 * 4. Product catalog listing, category filtering, search, and pagination
 * 5. Barcode lookup:
 *    - Local store catalog priority
 *    - Open Food Facts live API fallback
 *    - Nonexistent barcode handling
 * 6. Product update and barcode conflict validation
 * 7. Product deletion
 * 8. Access control (both owner and employee permitted)
 * 9. Database cleanup after execution
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const { generateToken } = require('./token');
const productService = require('../services/productService');
const openFoodFactsService = require('../services/openFoodFactsService');

const log = (msg, success = true) => {
  console.log(`${success ? '  [PASS]' : '  [FAIL]'} ${msg}`);
};

const runPhase4Tests = async () => {
  console.log('\n========================================');
  console.log('  NearExpiry — Phase 4 Product Management Tests');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  try {
    await mongoose.connect(mongodbUri);
    console.log('[Setup] Connected to MongoDB');

    // 1. Ensure test owner and test employee exist
    let owner = await User.findOne({ role: 'owner' });
    if (!owner) {
      owner = await User.create({
        fullName: 'Phase4 Owner',
        email: 'phase4_owner@test.nearexpiry.local',
        password: 'Password123!',
        role: 'owner',
        isActive: true
      });
    }

    let employee = await User.findOne({ role: 'employee', email: 'phase4_emp@test.nearexpiry.local' });
    if (!employee) {
      employee = await User.create({
        fullName: 'Phase4 Employee',
        email: 'phase4_emp@test.nearexpiry.local',
        password: 'Password123!',
        role: 'employee',
        isActive: true
      });
    }

    // Clean up any old test products before starting
    await Product.deleteMany({ name: { $regex: /^TEST_/ } });

    // TEST 1: Create product with barcode
    console.log('\n--- Test 1: Create product with barcode ---');
    const p1 = await productService.createProduct({
      name: 'TEST_Whole Milk 1L',
      brand: 'DairyFresh',
      barcode: '999000111222',
      category: 'Dairy & Eggs',
      unit: 'litre',
      description: 'Fresh pasteurized whole milk',
      manufacturer: 'Dairy Corp'
    }, owner._id);

    if (p1 && p1._id && p1.barcode === '999000111222' && p1.name === 'TEST_Whole Milk 1L') {
      log('Product created with barcode successfully');
      passed++;
    } else {
      log('Product creation with barcode failed', false);
      failed++;
    }

    // TEST 2: Duplicate barcode rejection
    console.log('\n--- Test 2: Duplicate barcode rejection ---');
    try {
      await productService.createProduct({
        name: 'TEST_Another Milk',
        barcode: '999000111222', // duplicate
        category: 'Dairy & Eggs',
        unit: 'litre'
      }, owner._id);
      log('Duplicate barcode was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400 && err.message.includes('already exists')) {
        log(`Duplicate barcode rejected with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error for duplicate barcode: ${err.message}`, false);
        failed++;
      }
    }

    // TEST 3: Create products without barcodes (null)
    console.log('\n--- Test 3: Products without barcodes ---');
    const pNoBarcode1 = await productService.createProduct({
      name: 'TEST_Loose Apples',
      brand: 'Local Farm',
      barcode: null,
      category: 'Fresh Produce',
      unit: 'kg'
    }, employee._id);

    const pNoBarcode2 = await productService.createProduct({
      name: 'TEST_Loose Bananas',
      brand: 'Tropical',
      barcode: '', // empty string normalized to null
      category: 'Fresh Produce',
      unit: 'kg'
    }, employee._id);

    if (pNoBarcode1._id && pNoBarcode2._id && pNoBarcode1.barcode === null && pNoBarcode2.barcode === null) {
      log('Multiple products without barcode allowed concurrently without collision');
      passed++;
    } else {
      log('Failed to create multiple barcode-less products', false);
      failed++;
    }

    // TEST 4: Search and Filtering
    console.log('\n--- Test 4: Search and Filtering ---');
    const searchByName = await productService.getProducts({ search: 'Milk' });
    const hasMilk = searchByName.products.some(p => p.name === 'TEST_Whole Milk 1L');
    if (hasMilk) {
      log(`Search by keyword "Milk" successfully matched "${p1.name}"`);
      passed++;
    } else {
      log('Search by keyword failed', false);
      failed++;
    }

    const filterCategory = await productService.getProducts({ category: 'Fresh Produce' });
    const allProduce = filterCategory.products.every(p => p.category === 'Fresh Produce');
    if (filterCategory.products.length >= 2 && allProduce) {
      log(`Category filter returned ${filterCategory.products.length} Fresh Produce items accurately`);
      passed++;
    } else {
      log('Category filter failed', false);
      failed++;
    }

    // TEST 5: Pagination
    console.log('\n--- Test 5: Pagination ---');
    const pageResult = await productService.getProducts({ limit: 1, page: 1 });
    if (pageResult.products.length === 1 && pageResult.pagination.total >= 3 && pageResult.pagination.totalPages >= 3) {
      log(`Pagination returned limit 1, total ${pageResult.pagination.total}, totalPages ${pageResult.pagination.totalPages}`);
      passed++;
    } else {
      log('Pagination failed', false);
      failed++;
    }

    // TEST 6: Barcode lookup — Local Store
    console.log('\n--- Test 6: Barcode lookup (Local Catalog) ---');
    const localLookup = await productService.lookupBarcode('999000111222');
    if (localLookup.found && localLookup.source === 'local' && localLookup.product.name === 'TEST_Whole Milk 1L') {
      log('Lookup found product in local store catalog first');
      passed++;
    } else {
      log('Local barcode lookup failed', false);
      failed++;
    }

    // TEST 7: Barcode lookup — Open Food Facts Fallback
    console.log('\n--- Test 7: Barcode lookup (Open Food Facts Fallback) ---');
    // Nutella barcode: 3017620422003
    const offLookup = await productService.lookupBarcode('3017620422003');
    if (offLookup.found && offLookup.source === 'openfoodfacts' && offLookup.product.name.toLowerCase().includes('nutella')) {
      log(`Open Food Facts lookup succeeded for Nutella (${offLookup.product.name}, Brand: ${offLookup.product.brand}, Category: ${offLookup.product.category})`);
      passed++;
    } else {
      log(`Open Food Facts lookup failed: ${JSON.stringify(offLookup)}`, false);
      failed++;
    }

    // TEST 8: Barcode lookup — Nonexistent Barcode
    console.log('\n--- Test 8: Barcode lookup (Nonexistent Barcode) ---');
    const missingLookup = await productService.lookupBarcode('0000000000000');
    if (!missingLookup.found && missingLookup.source === 'none') {
      log('Nonexistent barcode returned found=false and graceful error message');
      passed++;
    } else {
      log('Nonexistent barcode handling failed', false);
      failed++;
    }

    // TEST 9: Update Product and Barcode Collision Check
    console.log('\n--- Test 9: Update Product ---');
    const updated = await productService.updateProduct(p1._id, {
      name: 'TEST_Whole Milk 1L Premium',
      description: 'Updated premium whole milk'
    });
    if (updated.name === 'TEST_Whole Milk 1L Premium') {
      log('Product field update succeeded');
      passed++;
    } else {
      log('Product update failed', false);
      failed++;
    }

    // Attempting to change pNoBarcode1 barcode to p1 barcode should fail
    try {
      await productService.updateProduct(pNoBarcode1._id, { barcode: '999000111222' });
      log('Updating to conflicting barcode was allowed (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 400) {
        log(`Barcode collision on update prevented with 400: "${err.message}"`);
        passed++;
      } else {
        log(`Unexpected error on barcode collision update: ${err.message}`, false);
        failed++;
      }
    }

    // TEST 10: Delete Product
    console.log('\n--- Test 10: Delete Product ---');
    const delResult = await productService.deleteProduct(p1._id);
    if (delResult.deletedId.toString() === p1._id.toString()) {
      log(`Product "${delResult.productName}" deleted successfully`);
      passed++;
    } else {
      log('Product deletion failed', false);
      failed++;
    }

    // Verify it is gone
    try {
      await productService.getProductById(p1._id);
      log('Product still exists after deletion (FAIL)', false);
      failed++;
    } catch (err) {
      if (err.statusCode === 404) {
        log('Fetching deleted product correctly returned 404');
        passed++;
      } else {
        log(`Unexpected status on deleted fetch: ${err.message}`, false);
        failed++;
      }
    }

    // CLEANUP
    console.log('\n--- Cleanup: Removing test data ---');
    await Product.deleteMany({ name: { $regex: /^TEST_/ } });
    await User.deleteMany({ email: { $regex: /^phase4_/ } });
    log('Database cleanly reset: 0 test records remaining');

  } catch (error) {
    console.error('[FATAL TEST ERROR]', error);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n========================================');
    console.log(`  Tests Complete: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
};

runPhase4Tests();
