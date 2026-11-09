const http = require('http');
const mongoose = require('mongoose');
const { mongodbUri } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');

const BASE_URL = 'http://localhost:5000/api';

// Helper to make HTTP requests
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

// Helper to extract cookie from response
const getCookie = (res) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  return Array.isArray(setCookie) ? setCookie[0].split(';')[0] : setCookie.split(';')[0];
};

async function runTests() {
  console.log('====================================================');
  console.log('  NearExpiry Phase 3 Automated Verification Suite   ');
  console.log('====================================================\n');

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
    // Clean store and test users so setup can run freshly
    await mongoose.connect(mongodbUri);
    await User.deleteMany({ email: { $in: ['alice.owner@supermarket.local', 'charlie.staff@supermarket.local'] } });
    await Store.deleteMany({});
    await mongoose.disconnect();

    let ownerCookie = '';
    let employeeCookie = '';
    let employeeId = '';

    // 1. First owner can register
    const setupRes = await request({
      method: 'POST',
      path: '/auth/setup',
      data: {
        storeName: 'Downtown Supermarket',
        currency: 'USD ($)',
        fullName: 'Alice Storekeeper',
        email: 'alice.owner@supermarket.local',
        password: 'Password123!',
        contactPhone: '+1-555-0199'
      }
    });

    ownerCookie = getCookie(setupRes);
    assert(
      setupRes.status === 201 &&
      setupRes.data.success &&
      setupRes.data.data.user.role === 'owner' &&
      setupRes.data.data.user.password === undefined &&
      ownerCookie.includes('token='),
      '1. First owner can register and receives HTTP-only token cookie',
      JSON.stringify(setupRes.data)
    );

    // 2. Second public owner registration is blocked
    const duplicateSetupRes = await request({
      method: 'POST',
      path: '/auth/setup',
      data: {
        storeName: 'Intruder Supermarket',
        fullName: 'Bob Intruder',
        email: 'bob.intruder@domain.local',
        password: 'Password123!'
      }
    });
    assert(
      duplicateSetupRes.status === 403 &&
      duplicateSetupRes.data.success === false,
      '2. Second public owner registration is permanently blocked (HTTP 403)',
      JSON.stringify(duplicateSetupRes.data)
    );

    // 3. Correct login works
    const loginRes = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: 'alice.owner@supermarket.local',
        password: 'Password123!'
      }
    });
    const newOwnerCookie = getCookie(loginRes);
    assert(
      loginRes.status === 200 &&
      loginRes.data.success &&
      loginRes.data.data.user.role === 'owner' &&
      loginRes.data.data.user.password === undefined,
      '3. Correct login works and yields owner profile without password hash',
      JSON.stringify(loginRes.data)
    );
    if (newOwnerCookie) ownerCookie = newOwnerCookie;

    // 4. Incorrect password is rejected
    const badLoginRes = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: 'alice.owner@supermarket.local',
        password: 'WrongPassword999'
      }
    });
    assert(
      badLoginRes.status === 401 && badLoginRes.data.success === false,
      '4. Incorrect password is rejected with HTTP 401',
      JSON.stringify(badLoginRes.data)
    );

    // 5. Logout clears the session
    const logoutRes = await request({
      method: 'POST',
      path: '/auth/logout',
      cookie: ownerCookie
    });
    const logoutCookie = getCookie(logoutRes);
    assert(
      logoutRes.status === 200 &&
      logoutRes.data.success &&
      (logoutCookie === 'token=' || logoutRes.headers['set-cookie'][0].includes('Expires=Thu, 01 Jan 1970')),
      '5. Logout clears the session cookie',
      JSON.stringify(logoutRes.headers['set-cookie'])
    );

    // Re-login as owner to continue test suite
    const reLogin = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: 'alice.owner@supermarket.local',
        password: 'Password123!'
      }
    });
    ownerCookie = getCookie(reLogin);

    // 6. Protected endpoints reject unauthenticated requests
    const unauthMe = await request({ method: 'GET', path: '/auth/me' });
    const unauthEmp = await request({ method: 'GET', path: '/employees' });
    const unauthStore = await request({ method: 'GET', path: '/store' });
    assert(
      unauthMe.status === 401 && unauthEmp.status === 401 && unauthStore.status === 401,
      '6. Protected endpoints strictly reject unauthenticated requests (HTTP 401)'
    );

    // 7. Employees cannot access owner-only APIs
    // Create an employee as owner
    const createEmpRes = await request({
      method: 'POST',
      path: '/employees',
      data: {
        fullName: 'Charlie Cashier',
        email: 'charlie.staff@supermarket.local',
        password: 'StaffPassword456!'
      },
      cookie: ownerCookie
    });
    employeeId = createEmpRes.data?.data?._id;

    // Login as employee
    const empLoginRes = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: 'charlie.staff@supermarket.local',
        password: 'StaffPassword456!'
      }
    });
    employeeCookie = getCookie(empLoginRes);

    // Employee attempts owner-only endpoints
    const empAccessEmpList = await request({
      method: 'GET',
      path: '/employees',
      cookie: employeeCookie
    });
    const empCreateOwner = await request({
      method: 'POST',
      path: '/employees',
      data: {
        fullName: 'Fake Owner',
        email: 'fake@fake.local',
        password: 'password123'
      },
      cookie: employeeCookie
    });
    const empUpdateStore = await request({
      method: 'PUT',
      path: '/store',
      data: { storeName: 'Hacked Store' },
      cookie: employeeCookie
    });
    const empReadStore = await request({
      method: 'GET',
      path: '/store',
      cookie: employeeCookie
    });

    assert(
      empAccessEmpList.status === 403 &&
      empCreateOwner.status === 403 &&
      empUpdateStore.status === 403 &&
      empReadStore.status === 200,
      '7. Employees cannot access owner-only APIs (HTTP 403), but can read store info (HTTP 200)'
    );

    // 8. Inactive employees cannot log in
    // Owner toggles employee status to inactive
    const toggleRes = await request({
      method: 'PATCH',
      path: `/employees/${employeeId}/status`,
      cookie: ownerCookie
    });
    assert(
      toggleRes.status === 200 && toggleRes.data.data.isActive === false,
      '8a. Owner can toggle employee to inactive status'
    );

    // Deactivated employee tries to login
    const inactiveLogin = await request({
      method: 'POST',
      path: '/auth/login',
      data: {
        email: 'charlie.staff@supermarket.local',
        password: 'StaffPassword456!'
      }
    });
    assert(
      inactiveLogin.status === 403 && inactiveLogin.data.message.includes('deactivated'),
      '8b. Inactive employee login is rejected with HTTP 403 (deactivated notice)'
    );

    // 9. Duplicate email registration is rejected
    const dupEmp = await request({
      method: 'POST',
      path: '/employees',
      data: {
        fullName: 'Another Person',
        email: 'alice.owner@supermarket.local', // same email as owner
        password: 'Password999!'
      },
      cookie: ownerCookie
    });
    assert(
      dupEmp.status === 400 && dupEmp.data.success === false,
      '9. Duplicate email registration is rejected with HTTP 400',
      JSON.stringify(dupEmp.data)
    );

    // 10. Passwords are stored as hashes in MongoDB
    await mongoose.connect(mongodbUri);
    const dbOwner = await User.findOne({ email: 'alice.owner@supermarket.local' }).select('+password');
    const isBcrypt = dbOwner.password.startsWith('$2a$') || dbOwner.password.startsWith('$2b$');
    assert(
      isBcrypt && dbOwner.password !== 'Password123!',
      '10. Passwords in MongoDB are stored as strong bcrypt hashes ($2b$...)'
    );
    await mongoose.disconnect();

    // 11. Refreshing a page preserves a valid session
    const refreshSession = await request({
      method: 'GET',
      path: '/auth/me',
      cookie: ownerCookie
    });
    assert(
      refreshSession.status === 200 &&
      refreshSession.data.success &&
      refreshSession.data.data.user.email === 'alice.owner@supermarket.local',
      '11. Refreshing a page preserves valid authenticated session via cookie'
    );

    // 12. Frontend and backend continue communicating correctly
    const healthRes = await request({
      method: 'GET',
      path: '/health'
    });
    assert(
      healthRes.status === 200 &&
      healthRes.data.data.database.connected === true,
      '12. Frontend and backend continue communicating; database is connected'
    );

    // Clean up test records after verification so no dummy accounts remain in the database
    await mongoose.connect(mongodbUri);
    await User.deleteMany({ email: { $in: ['alice.owner@supermarket.local', 'charlie.staff@supermarket.local'] } });
    await Store.deleteMany({ storeName: 'Downtown Supermarket' });
    console.log('[CLEANUP] Test records safely purged. Zero dummy accounts left in database.');
    await mongoose.disconnect();

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`  Tests Completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
