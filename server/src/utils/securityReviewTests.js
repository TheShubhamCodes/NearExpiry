const http = require('http');
const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');

const BASE_URL = 'http://localhost:5000/api';

const request = ({ method, path, data, headers = {}, cookie = '' }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyStr = data ? JSON.stringify(data) : null;

    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    if (cookie) {
      reqHeaders['Cookie'] = cookie;
    }

    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
};

const getCookie = (res) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  return Array.isArray(setCookie) ? setCookie[0].split(';')[0] : setCookie.split(';')[0];
};

async function runSecurityReview() {
  console.log('===========================================================');
  console.log('  NearExpiry Security & Authorization Review Verification  ');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  };

  try {
    // Connect to DB directly for state assertions & index syncing
    await mongoose.connect(mongodbUri);
    await User.syncIndexes();
    await Store.syncIndexes();

    // Clean any prior records
    await User.deleteMany({});
    await Store.deleteMany({});

    // -----------------------------------------------------------------
    // TEST 1: Concurrency & Race Condition on Initial Setup
    // -----------------------------------------------------------------
    console.log('--- Testing Concurrency on Initial Setup ---');
    const concurrentPayloads = Array.from({ length: 8 }).map((_, i) => ({
      method: 'POST',
      path: '/auth/setup',
      data: {
        storeName: `Simultaneous Store ${i}`,
        currency: 'USD ($)',
        fullName: `Owner Candidate ${i}`,
        email: `candidate_${i}@supermarket.local`,
        password: 'Password123!'
      },
      headers: {
        'Origin': 'http://localhost:5173'
      }
    }));

    // Fire all 8 setup requests simultaneously
    const setupResults = await Promise.all(concurrentPayloads.map((p) => request(p)));
    const successCount = setupResults.filter((r) => r.status === 201).length;
    // Non-successful requests are blocked either by single-owner/store concurrency (400/403) or rate limiter (429)
    const blockedCount = setupResults.filter((r) => [400, 403, 429].includes(r.status)).length;

    const dbOwnerCount = await User.countDocuments({ role: 'owner' });
    const dbStoreCount = await Store.countDocuments({});

    assert(
      successCount === 1 &&
      blockedCount === 7 &&
      dbOwnerCount === 1 &&
      dbStoreCount === 1,
      '1. Simultaneous setup race condition: Exactly 1 succeeds, other 7 blocked (403/429); DB has exactly 1 store & 1 owner',
      `Success: ${successCount}, Blocked: ${blockedCount}, DB owners: ${dbOwnerCount}, DB stores: ${dbStoreCount}`
    );

    // Get the created owner's email
    const winnerOwner = await User.findOne({ role: 'owner' });
    const ownerEmail = winnerOwner.email;

    // -----------------------------------------------------------------
    // TEST 2: CSRF Protection on State-Changing Requests
    // -----------------------------------------------------------------
    console.log('\n--- Testing CSRF Protection ---');
    // Login as owner with valid Origin
    const ownerLoginRes = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: ownerEmail,
        password: 'Password123!'
      },
      headers: {
        'Origin': 'http://localhost:5173'
      }
    });
    const ownerCookie = getCookie(ownerLoginRes);

    // Attempt state-changing POST from malicious origin
    const csrfAttack = await request({
      method: 'POST',
      path: '/employees',
      data: {
        fullName: 'Attacker Staff',
        email: 'attacker@evil.com',
        password: 'Password123!'
      },
      headers: {
        'Origin': 'http://evil-attacker.com'
      },
      cookie: ownerCookie
    });

    assert(
      csrfAttack.status === 403 &&
      csrfAttack.data.message.includes('CSRF'),
      '2a. CSRF attack simulation: Untrusted Origin header is rejected with HTTP 403',
      JSON.stringify(csrfAttack.data)
    );

    // Legitimate state-changing request from allowed origin
    const legitimateCreateEmp = await request({
      method: 'POST',
      path: '/employees',
      data: {
        fullName: 'Charlie Employee',
        email: 'charlie.emp@supermarket.local',
        password: 'StaffPassword456!'
      },
      headers: {
        'Origin': 'http://localhost:5173'
      },
      cookie: ownerCookie
    });

    const empId = legitimateCreateEmp.data?.data?._id;
    assert(
      legitimateCreateEmp.status === 201 && legitimateCreateEmp.data.success,
      '2b. Authorized state-changing request from allowed Origin succeeds (HTTP 201)'
    );

    // -----------------------------------------------------------------
    // TEST 3: Employee Access Boundary (Owner-Only vs Employee)
    // -----------------------------------------------------------------
    console.log('\n--- Testing Employee Authorization Boundaries ---');
    // Login as Employee
    const empLoginRes = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: 'charlie.emp@supermarket.local',
        password: 'StaffPassword456!'
      },
      headers: {
        'Origin': 'http://localhost:5173'
      }
    });
    const empCookie = getCookie(empLoginRes);

    const empTryGetEmployees = await request({ method: 'GET', path: '/employees', cookie: empCookie });
    const empTryCreateEmp = await request({
      method: 'POST',
      path: '/employees',
      data: { fullName: 'X', email: 'x@x.com', password: '123' },
      cookie: empCookie,
      headers: { 'Origin': 'http://localhost:5173' }
    });
    const empTryUpdateStore = await request({
      method: 'PUT',
      path: '/store',
      data: { storeName: 'Hacked Store' },
      cookie: empCookie,
      headers: { 'Origin': 'http://localhost:5173' }
    });
    const empReadStore = await request({ method: 'GET', path: '/store', cookie: empCookie });
    const empGetMe = await request({ method: 'GET', path: '/auth/me', cookie: empCookie });

    assert(
      empTryGetEmployees.status === 403 &&
      empTryCreateEmp.status === 403 &&
      empTryUpdateStore.status === 403 &&
      empReadStore.status === 200 &&
      empGetMe.status === 200 &&
      empGetMe.data.data.user.role === 'employee',
      '3. Employee cannot access owner APIs (HTTP 403) but can read store info & session (HTTP 200)'
    );

    // -----------------------------------------------------------------
    // TEST 4: Immediate Revocation of Inactive Employees
    // -----------------------------------------------------------------
    console.log('\n--- Testing Immediate Session Revocation on Deactivation ---');
    // Verify employee cookie works currently
    const beforeDeactivation = await request({ method: 'GET', path: '/auth/me', cookie: empCookie });
    assert(beforeDeactivation.status === 200, '4a. Employee session is currently valid');

    // Owner deactivates employee
    const deactRes = await request({
      method: 'PATCH',
      path: `/employees/${empId}/status`,
      cookie: ownerCookie,
      headers: { 'Origin': 'http://localhost:5173' }
    });
    assert(deactRes.status === 200 && deactRes.data.data.isActive === false, '4b. Owner deactivates employee account');

    // Immediate next request with the EXISTING employee cookie MUST FAIL with 403
    const afterDeactivation = await request({ method: 'GET', path: '/auth/me', cookie: empCookie });
    assert(
      afterDeactivation.status === 403 &&
      afterDeactivation.data.message.includes('deactivated'),
      '4c. Existing session token immediately rejected with HTTP 403 on next request'
    );

    // -----------------------------------------------------------------
    // TEST 5: Cookie Security & Absence of Token in JSON Body
    // -----------------------------------------------------------------
    console.log('\n--- Testing Cookie Security & Token Isolation ---');
    const setCookieHeader = ownerLoginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : setCookieHeader;

    const hasHttpOnly = /HttpOnly/i.test(cookieStr);
    const hasSameSite = /SameSite=(Lax|Strict)/i.test(cookieStr);
    const hasPath = /Path=\//i.test(cookieStr);
    const hasMaxAgeOrExpires = /Max-Age|Expires/i.test(cookieStr);

    // Verify token is NOT exposed in the JSON response body
    const bodyExposesToken = Boolean(ownerLoginRes.data?.data?.token);

    assert(
      hasHttpOnly && hasSameSite && hasPath && hasMaxAgeOrExpires && !bodyExposesToken,
      '5. Cookie attributes verified (HttpOnly, SameSite, Path, Max-Age) & token is NOT in JSON body'
    );

    // -----------------------------------------------------------------
    // TEST 6: Bcrypt Password Hash Storage
    // -----------------------------------------------------------------
    console.log('\n--- Testing Password Hashing & Sanitization ---');
    const storedUser = await User.findOne({ email: ownerEmail }).select('+password');
    const isBcrypt = storedUser.password.startsWith('$2a$') || storedUser.password.startsWith('$2b$');
    const noPlaintext = storedUser.password !== 'Password123!';

    assert(
      isBcrypt && noPlaintext,
      '6. Password in MongoDB is verified as strong bcrypt hash ($2b$...)'
    );

    // Clean up test records
    await User.deleteMany({});
    await Store.deleteMany({});
    console.log('\n[CLEANUP] All security test records purged. Database left in clean state.');
    await mongoose.disconnect();

  } catch (err) {
    console.error('Security test run failed:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  Security Review Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('===========================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runSecurityReview();
