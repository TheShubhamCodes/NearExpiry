/**
 * Phase 12: Production Readiness & Deployment Verification Suite
 *
 * Safely executes in COMPLETE ISOLATION against `nearexpiry_test` DB.
 * Never connects to or modifies the primary `nearexpiry` database.
 */

// 1. Force isolated test DB and simulated production env BEFORE loading config/app
process.env.MONGODB_URI = 'mongodb://localhost:27017/nearexpiry_test';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'phase12_prod_verification_secret_key_at_least_32_chars';
process.env.CLIENT_URL = 'https://nearexpiry-prod.vercel.app/';
process.env.CORS_ORIGINS = 'https://custom-portal.nearexpiry.com/';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.RESEND_API_KEY = '';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const { validateEnv } = require('../config/env');
const { redactMongoUri } = require('../config/db');
const { getCookieOptions } = require('./token');
const { isAllowedOrigin } = require('../middleware/csrfProtection');
const errorHandler = require('../middleware/errorHandler');
const cloudinaryService = require('../services/cloudinaryService');

// Valid 1x1 transparent PNG binary signature + minimal chunks (for upload tests)
const VALID_PNG_BASE64 =
  'data:image/png;base64,' +
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]).toString('base64');

const PROD_ORIGIN = 'https://nearexpiry-prod.vercel.app';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function runPhase12Tests() {
  console.log('\n==============================================================');
  console.log('--- PHASE 12 PRODUCTION READINESS & SECURITY VERIFICATION ---');
  console.log('==============================================================\n');

  let server = null;

  try {
    // ---------------------------------------------------------
    // GROUP 1: Env Validation, Redaction & Cookie/CORS Policy
    // ---------------------------------------------------------
    await test('validateEnv succeeds with complete production config', async () => {
      const result = validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/nearexpiry?retryWrites=true&w=majority',
        JWT_SECRET: 'a_very_secure_production_secret_with_32_plus_chars',
        CLIENT_URL: 'https://nearexpiry.vercel.app'
      });
      assert.strictEqual(result.valid, true);
    });

    await test('validateEnv fails fast in production on missing MONGODB_URI / weak JWT / missing CLIENT_URL', async () => {
      assert.throws(
        () =>
          validateEnv({
            NODE_ENV: 'production',
            MONGODB_URI: '',
            JWT_SECRET: 'short',
            CLIENT_URL: ''
          }),
        /Environment validation failed/
      );

      assert.throws(
        () =>
          validateEnv({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://u:p@c.mongodb.net/db',
            JWT_SECRET: 'fallback_secret_change_in_production',
            CLIENT_URL: 'https://app.vercel.app'
          }),
        /JWT_SECRET/
      );
    });

    await test('redactMongoUri masks credentials cleanly', async () => {
      const redacted = redactMongoUri('mongodb+srv://adminUser:SuperSecret123@cluster0.xyz.mongodb.net/nearexpiry');
      assert(!redacted.includes('adminUser'), 'Username leaked');
      assert(!redacted.includes('SuperSecret123'), 'Password leaked');
      assert(redacted.includes('://***:***@cluster0.xyz.mongodb.net/nearexpiry'));
    });

    await test('getCookieOptions uses HttpOnly + Secure + SameSite=None in production and Lax in dev', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.COOKIE_SAME_SITE;
      const prodCookie = getCookieOptions();
      assert.strictEqual(prodCookie.httpOnly, true);
      assert.strictEqual(prodCookie.secure, true);
      assert.strictEqual(prodCookie.sameSite, 'none');

      process.env.NODE_ENV = 'development';
      const devCookie = getCookieOptions();
      assert.strictEqual(devCookie.httpOnly, true);
      assert.strictEqual(devCookie.secure, false);
      assert.strictEqual(devCookie.sameSite, 'lax');

      process.env.NODE_ENV = 'production';
    });

    await test('Production CORS/CSRF origin check normalizes slashes and blocks localhost/untrusted origins', async () => {
      process.env.NODE_ENV = 'production';
      assert.strictEqual(isAllowedOrigin('https://nearexpiry-prod.vercel.app'), true);
      assert.strictEqual(isAllowedOrigin('https://custom-portal.nearexpiry.com'), true);
      assert.strictEqual(isAllowedOrigin('http://localhost:5173'), false, 'Localhost must be rejected in production');
      assert.strictEqual(isAllowedOrigin('http://192.168.1.25:5173'), false, 'LAN IP must be rejected in production');
      assert.strictEqual(isAllowedOrigin('https://evil-phishing.example.com'), false);

      process.env.NODE_ENV = 'development';
      assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
      process.env.NODE_ENV = 'production';
    });

    await test('Cloudinary service validates magic bytes, MIME allowlist, size limit, and SHA-1 signatures', async () => {
      const sig = cloudinaryService.signUploadParams({ folder: 'nearexpiry/products', timestamp: 1700000000 }, 'my_secret');
      assert.strictEqual(sig.length, 40);

      // Spoofed PNG header (plain text pretending to be PNG)
      const spoofedPng = 'data:image/png;base64,' + Buffer.from('not-a-real-png-script-alert').toString('base64');
      assert.throws(() => cloudinaryService.validateImageDataUri(spoofedPng), /valid image signature/);

      // Disallowed SVG (potential stored XSS vector)
      const svgUri = 'data:image/svg+xml;base64,' + Buffer.from('<svg></svg>').toString('base64');
      assert.throws(() => cloudinaryService.validateImageDataUri(svgUri), /Unsupported image type/);

      // Oversized > 5MB file rejected with 413
      const hugePng = 'data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024 + 64, 0).toString('base64');
      assert.throws(
        () => cloudinaryService.validateImageDataUri(hugePng),
        (err) => err.statusCode === 413
      );

      // Unconfigured returns 503 operational error
      await assert.rejects(
        () => cloudinaryService.uploadProductImage(VALID_PNG_BASE64),
        (err) => err.statusCode === 503 && err.isOperational === true
      );
    });

    await test('Production errorHandler hides stack traces and masks internal 500 messages', async () => {
      let capturedStatus = null;
      let capturedBody = null;
      const mockRes = {
        statusCode: 200,
        status(code) {
          capturedStatus = code;
          return this;
        },
        json(body) {
          capturedBody = body;
          return this;
        }
      };
      errorHandler(
        new Error('Unexpected database crash at mongodb://user:secret@host/db'),
        { method: 'GET', originalUrl: '/api/test' },
        mockRes,
        () => {}
      );
      assert.strictEqual(capturedStatus, 500);
      assert.strictEqual(capturedBody.success, false);
      assert.strictEqual(capturedBody.stack, undefined, 'Stack trace must not leak in production');
      assert(!capturedBody.message.includes('mongodb://'), 'Internal DB string must not leak to client');
    });

    // ---------------------------------------------------------
    // GROUP 2: Isolated Database & Ephemeral Express HTTP Server
    // ---------------------------------------------------------
    await mongoose.connect(process.env.MONGODB_URI);
    assert.strictEqual(
      mongoose.connection.name,
      'nearexpiry_test',
      `Safety check failed: connected to ${mongoose.connection.name} instead of nearexpiry_test!`
    );
    await mongoose.connection.dropDatabase();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const BASE_URL = `http://127.0.0.1:${port}/api`;
    console.log(`[Setup] Ephemeral production test server running on port ${port} using DB "${mongoose.connection.name}"`);

    await test('GET /api/health returns 200 connected and hides internal host/db name in production', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.database.connected, true);
      assert.strictEqual(body.data.database.host, undefined);
      assert.strictEqual(body.data.database.name, undefined);

      // Verify Helmet security headers
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
      assert.strictEqual(res.headers.get('x-powered-by'), null);
    });

    await test('POST /api/auth/setup rejects untrusted/localhost origins in production (CSRF 403)', async () => {
      const evilRes = await fetch(`${BASE_URL}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil-attacker.com' },
        body: JSON.stringify({})
      });
      assert.strictEqual(evilRes.status, 403);

      const localhostRes = await fetch(`${BASE_URL}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({})
      });
      assert.strictEqual(localhostRes.status, 403);
    });

    let ownerCookie = '';
    let employeeCookie = '';

    await test('Owner registration sets HttpOnly; Secure; SameSite=None cookie over trusted HTTPS origin', async () => {
      const res = await fetch(`${BASE_URL}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN },
        body: JSON.stringify({
          fullName: 'Prod Owner',
          storeName: 'Phase 12 Production Mart',
          email: 'owner@p12prod.com',
          password: 'OwnerStrongPassword123!',
          currency: 'USD ($)'
        })
      });
      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);

      const setCookieHeader = res.headers.get('set-cookie') || '';
      assert(setCookieHeader.includes('HttpOnly'), 'Missing HttpOnly cookie flag');
      assert(setCookieHeader.includes('Secure'), 'Missing Secure cookie flag in production');
      assert(/SameSite=None/i.test(setCookieHeader), `Expected SameSite=None, got: ${setCookieHeader}`);

      ownerCookie = setCookieHeader.split(';')[0];

      // CORS preflight / Access-Control-Allow-Origin check
      assert.strictEqual(res.headers.get('access-control-allow-origin'), PROD_ORIGIN);
      assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    });

    await test('RBAC isolation: Owner creates employee; Employee blocked from owner-only endpoints (403)', async () => {
      const empCreate = await fetch(`${BASE_URL}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: ownerCookie },
        body: JSON.stringify({
          fullName: 'Prod Cashier',
          email: 'cashier@p12prod.com',
          password: 'CashierPassword123!'
        })
      });
      assert.strictEqual(empCreate.status, 201);

      const empLogin = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN },
        body: JSON.stringify({ email: 'cashier@p12prod.com', password: 'CashierPassword123!' })
      });
      assert.strictEqual(empLogin.status, 200);
      employeeCookie = (empLogin.headers.get('set-cookie') || '').split(';')[0];

      const forbiddenStorePut = await fetch(`${BASE_URL}/store`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: employeeCookie },
        body: JSON.stringify({ storeName: 'Hacked Store' })
      });
      assert.strictEqual(forbiddenStorePut.status, 403);
    });

    await test('Malformed JSON request returns clean 400 without leaking parser stack', async () => {
      const res = await fetch(`${BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: ownerCookie },
        body: '{"brokenJson": '
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.stack, undefined);
    });

    await test('Product image upload endpoint enforces auth, magic bytes, 503 fallback, and mocked Cloudinary flow', async () => {
      // Unauthenticated -> 401
      const unauth = await fetch(`${BASE_URL}/products/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN },
        body: JSON.stringify({ image: VALID_PNG_BASE64 })
      });
      assert.strictEqual(unauth.status, 401);

      // Unconfigured Cloudinary -> 503 with operational message intact
      const noCfg = await fetch(`${BASE_URL}/products/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: ownerCookie },
        body: JSON.stringify({ image: VALID_PNG_BASE64 })
      });
      assert.strictEqual(noCfg.status, 503);
      const noCfgBody = await noCfg.json();
      assert(noCfgBody.message.includes('Cloudinary'), '503 operational message should guide user');

      // Mock Cloudinary uploader (without hitting external Cloudinary API)
      cloudinaryService.setUploadHandler(async () => ({
        imageUrl: 'https://res.cloudinary.com/demo-store/image/upload/v1700000000/nearexpiry/products/test.png',
        publicId: 'nearexpiry/products/test',
        width: 1,
        height: 1,
        format: 'png',
        bytes: 67
      }));

      try {
        const uploaded = await fetch(`${BASE_URL}/products/upload-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: ownerCookie },
          body: JSON.stringify({ image: VALID_PNG_BASE64 })
        });
        assert.strictEqual(uploaded.status, 200);
        const uploadedBody = await uploaded.json();
        assert.strictEqual(
          uploadedBody.data.imageUrl,
          'https://res.cloudinary.com/demo-store/image/upload/v1700000000/nearexpiry/products/test.png'
        );

        // Create product referencing returned HTTPS Cloudinary URL
        const prodCreate = await fetch(`${BASE_URL}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: ownerCookie },
          body: JSON.stringify({
            name: 'P12 Fresh Yogurt 250g',
            category: 'Dairy & Eggs',
            unit: 'piece',
            imageUrl: uploadedBody.data.imageUrl
          })
        });
        assert.strictEqual(prodCreate.status, 201);

        // Reject unsafe javascript: URI in product imageUrl
        const xssProd = await fetch(`${BASE_URL}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: PROD_ORIGIN, Cookie: ownerCookie },
          body: JSON.stringify({
            name: 'XSS Product',
            category: 'General',
            unit: 'piece',
            imageUrl: 'javascript:alert(1)'
          })
        });
        assert.strictEqual(xssProd.status, 400);
      } finally {
        cloudinaryService.setUploadHandler(null);
      }
    });

    await test('GET /api/health returns 503 degraded when database connection drops', async () => {
      await mongoose.disconnect();
      const res = await fetch(`${BASE_URL}/health`);
      assert.strictEqual(res.status, 503);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.data.status, 'degraded');
      assert.strictEqual(body.data.database.connected, false);
    });
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI);
      }
      if (mongoose.connection.name === 'nearexpiry_test') {
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
    } catch (cleanupErr) {
      console.error('[Cleanup Warning]', cleanupErr.message);
    }

    console.log('\n==============================================================');
    console.log(`PHASE 12 RESULTS: ${passed} passed, ${failed} failed`);
    console.log('==============================================================\n');
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPhase12Tests();
