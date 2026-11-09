const mongoose = require('mongoose');
const { mongodbUri, port } = require('../config/env');
const User = require('../models/User');
const Store = require('../models/Store');

const BASE_URL = `http://localhost:${port}/api`;

const runTests = async () => {
  console.log('\n======================================================');
  console.log('--- STARTING COMPREHENSIVE AUTH & REGISTRATION TESTS ---');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, detail = '') => {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail}`);
      failed++;
    }
  };

  try {
    await mongoose.connect(mongodbUri);
    console.log(`[DB] Connected to MongoDB for test orchestration.\n`);

    // Ensure clean slate before test
    await User.deleteMany({});
    await Store.deleteMany({});

    // -----------------------------------------------------------------
    // Pre-Check: Setup status before registration
    // -----------------------------------------------------------------
    const preStatusRes = await fetch(`${BASE_URL}/auth/setup-status`);
    const preStatusJson = await preStatusRes.json();
    assert(
      preStatusRes.status === 200 && preStatusJson.data.isSetup === false,
      'Pre-Check: setup-status reports isSetup === false on fresh DB',
      JSON.stringify(preStatusJson)
    );

    // -----------------------------------------------------------------
    // TEST 1: Initial owner can create an account via registration
    // -----------------------------------------------------------------
    const ownerPayload = {
      fullName: 'Alice Test Owner',
      storeName: 'Alice Fresh Market',
      email: 'alice.owner@testmarket.local',
      password: 'OwnerPassword123!',
      currency: 'USD ($)',
      contactPhone: '+1 555-0100',
      address: { street: '100 Market St', city: 'Metropolis' }
    };

    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify(ownerPayload)
    });
    const regJson = await regRes.json();
    const regCookies = regRes.headers.get('set-cookie') || '';

    assert(
      regRes.status === 201 &&
      regJson.success === true &&
      regJson.data.user.role === 'owner' &&
      regJson.data.user.email === ownerPayload.email &&
      regJson.data.store.storeName === ownerPayload.storeName,
      'Test 1: Initial owner account created via /auth/register',
      `Status: ${regRes.status}, Body: ${JSON.stringify(regJson)}`
    );

    assert(
      regCookies.includes('token=') && regCookies.toLowerCase().includes('httponly'),
      'Test 1b: Secure HTTP-Only authentication cookie issued upon registration',
      `Set-Cookie: ${regCookies}`
    );

    // -----------------------------------------------------------------
    // TEST 2: Owner can log in with valid credentials
    // -----------------------------------------------------------------
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify({
        email: ownerPayload.email,
        password: ownerPayload.password
      })
    });
    const loginJson = await loginRes.json();
    const loginCookies = loginRes.headers.get('set-cookie') || '';
    const tokenMatch = loginCookies.match(/token=([^;]+)/);
    let ownerToken = tokenMatch ? tokenMatch[1] : '';

    assert(
      loginRes.status === 200 &&
      loginJson.success === true &&
      loginJson.data.user.role === 'owner',
      'Test 2: Owner can log in with valid credentials',
      `Status: ${loginRes.status}`
    );

    // Verify session with /auth/me using Cookie header
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Cookie': `token=${ownerToken}` }
    });
    const meJson = await meRes.json();
    assert(
      meRes.status === 200 &&
      meJson.data.user.email === ownerPayload.email &&
      meJson.data.user.role === 'owner',
      'Test 2b: Authenticated session returns owner profile (/auth/me)',
      JSON.stringify(meJson)
    );

    // -----------------------------------------------------------------
    // TEST 3: Invalid credentials are rejected
    // -----------------------------------------------------------------
    const invalidPwRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify({
        email: ownerPayload.email,
        password: 'CompletelyWrongPassword!'
      })
    });
    const invalidPwJson = await invalidPwRes.json();
    assert(
      invalidPwRes.status === 401 && invalidPwJson.message === 'Invalid email or password.',
      'Test 3a: Incorrect password rejected with HTTP 401',
      `Status: ${invalidPwRes.status}, Message: ${invalidPwJson.message}`
    );

    const nonExistentRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify({
        email: 'ghost@nowhere.local',
        password: 'AnyPassword123'
      })
    });
    const nonExistentJson = await nonExistentRes.json();
    assert(
      nonExistentRes.status === 401 && nonExistentJson.message === 'Invalid email or password.',
      'Test 3b: Non-existent user rejected with HTTP 401',
      `Status: ${nonExistentRes.status}`
    );

    // -----------------------------------------------------------------
    // TEST 4 & 5: Duplicate owner registration rejected & Public registration unavailable
    // -----------------------------------------------------------------
    const dupRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify({
        fullName: 'Bob Attacker',
        storeName: 'Bob Hijack Store',
        email: 'bob@hijack.local',
        password: 'Password123!'
      })
    });
    const dupJson = await dupRes.json();
    assert(
      dupRes.status === 403 &&
      dupJson.message.includes('Initial store setup has already been completed'),
      'Test 4: Subsequent owner registration rejected with HTTP 403',
      `Status: ${dupRes.status}, Message: ${dupJson.message}`
    );

    // Test Atomic Concurrency: Simultaneous owner registrations on clean state
    await User.deleteMany({});
    await Store.deleteMany({});

    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify(ownerPayload)
      }),
      fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
        body: JSON.stringify({
          ...ownerPayload,
          email: 'concurrent.owner@testmarket.local',
          storeName: 'Concurrent Store'
        })
      })
    ]);

    const raceStatuses = [raceRes1.status, raceRes2.status].sort();
    assert(
      raceStatuses[0] === 201 && raceStatuses[1] === 403,
      'Test 4b: Atomic Concurrency: Exactly one simultaneous setup succeeds (201), the other is rejected (403)',
      `Statuses: ${raceRes1.status}, ${raceRes2.status}`
    );

    const winningRes = raceRes1.status === 201 ? raceRes1 : raceRes2;
    const winningCookies = winningRes.headers.get('set-cookie') || '';
    const winningTokenMatch = winningCookies.match(/token=([^;]+)/);
    ownerToken = winningTokenMatch ? winningTokenMatch[1] : '';

    const ownerCountInDb = await User.countDocuments({ role: 'owner' });
    const storeCountInDb = await Store.countDocuments({});
    assert(
      ownerCountInDb === 1 && storeCountInDb === 1,
      'Test 4c: Database invariants preserved under race: exactly 1 owner and 1 store exist',
      `Owners: ${ownerCountInDb}, Stores: ${storeCountInDb}`
    );

    const postStatusRes = await fetch(`${BASE_URL}/auth/setup-status`);
    const postStatusJson = await postStatusRes.json();
    assert(
      postStatusRes.status === 200 &&
      postStatusJson.data.isSetup === true &&
      postStatusJson.data.storeName === ownerPayload.storeName,
      'Test 5: Public setup-status reports isSetup === true after initialization',
      JSON.stringify(postStatusJson)
    );

    // -----------------------------------------------------------------
    // TEST 6: Owner can create employee accounts (authenticated only)
    // -----------------------------------------------------------------
    const empPayload = {
      fullName: 'Eve Employee',
      email: 'eve.staff@testmarket.local',
      password: 'EmployeePass123!',
      role: 'employee'
    };

    // Public unauthorized attempt should fail
    const unauthEmpRes = await fetch(`${BASE_URL}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empPayload)
    });
    assert(
      unauthEmpRes.status === 401,
      'Test 6a: Public / unauthenticated employee creation rejected with HTTP 401',
      `Status: ${unauthEmpRes.status}`
    );

    // Owner creates employee
    const createEmpRes = await fetch(`${BASE_URL}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `token=${ownerToken}`,
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify(empPayload)
    });
    const createEmpJson = await createEmpRes.json();
    const createdEmployee = createEmpJson.data;

    assert(
      createEmpRes.status === 201 &&
      createdEmployee &&
      createdEmployee.role === 'employee' &&
      createdEmployee.email === empPayload.email &&
      createdEmployee.isActive === true,
      'Test 6b: Authenticated Owner can create employee account',
      `Status: ${createEmpRes.status}, Body: ${JSON.stringify(createEmpJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 7: Employees can log in
    // -----------------------------------------------------------------
    const empLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify({
        email: empPayload.email,
        password: empPayload.password
      })
    });
    const empLoginJson = await empLoginRes.json();
    const empCookies = empLoginRes.headers.get('set-cookie') || '';
    const empTokenMatch = empCookies.match(/token=([^;]+)/);
    const empToken = empTokenMatch ? empTokenMatch[1] : '';

    assert(
      empLoginRes.status === 200 &&
      empLoginJson.data.user.role === 'employee' &&
      empLoginJson.data.user.isActive === true,
      'Test 7: Employee can log in successfully with assigned credentials',
      `Status: ${empLoginRes.status}`
    );

    // Verify employee cannot access owner-only routes (e.g. GET /api/employees)
    const empRestrictedRes = await fetch(`${BASE_URL}/employees`, {
      headers: { 'Cookie': `token=${empToken}` }
    });
    assert(
      empRestrictedRes.status === 403,
      'Test 7b: Employee access to owner-only routes blocked with HTTP 403',
      `Status: ${empRestrictedRes.status}`
    );

    // -----------------------------------------------------------------
    // TEST 8: Inactive employees cannot log in
    // -----------------------------------------------------------------
    // Owner toggles employee active status to false
    const toggleRes = await fetch(`${BASE_URL}/employees/${createdEmployee._id}/status`, {
      method: 'PATCH',
      headers: {
        'Cookie': `token=${ownerToken}`,
        'Origin': 'http://localhost:5173'
      }
    });
    const toggleJson = await toggleRes.json();
    assert(
      toggleRes.status === 200 && toggleJson.data.isActive === false,
      'Test 8a: Owner successfully deactivates employee account',
      `Status: ${toggleRes.status}`
    );

    // Deactivated employee login attempt
    const deactLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
      body: JSON.stringify({
        email: empPayload.email,
        password: empPayload.password
      })
    });
    const deactLoginJson = await deactLoginRes.json();
    assert(
      deactLoginRes.status === 403 &&
      deactLoginJson.message.includes('deactivated'),
      'Test 8b: Deactivated employee login rejected with HTTP 403',
      `Status: ${deactLoginRes.status}, Message: ${deactLoginJson.message}`
    );

    // -----------------------------------------------------------------
    // TEST 9: Authentication cookies work correctly and securely
    // -----------------------------------------------------------------
    const cookieString = loginCookies.toLowerCase();
    assert(
      cookieString.includes('httponly') &&
      cookieString.includes('path=/') &&
      cookieString.includes('samesite=lax'),
      'Test 9: Cookie flags conform to HttpOnly, Path=/, SameSite=Lax standard',
      `Cookie: ${loginCookies}`
    );

    // Test logout clears the cookie
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Origin': 'http://localhost:5173', 'Cookie': `token=${ownerToken}` }
    });
    const logoutCookies = (logoutRes.headers.get('set-cookie') || '').toLowerCase();
    assert(
      logoutRes.status === 200 &&
      logoutCookies.includes('token=;') || logoutCookies.includes('expires='),
      'Test 9b: Logout endpoint clears the authentication cookie',
      `Logout Cookie: ${logoutCookies}`
    );

    // -----------------------------------------------------------------
    // TEST 10: Frontend and Backend communicate without network / CORS errors
    // -----------------------------------------------------------------
    const originsToTest = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://172.22.16.46:5173'
    ];

    for (const testOrigin of originsToTest) {
      const corsRes = await fetch(`${BASE_URL}/health`, {
        headers: { 'Origin': testOrigin }
      });
      const allowOrigin = corsRes.headers.get('access-control-allow-origin');
      const allowCreds = corsRes.headers.get('access-control-allow-credentials');

      assert(
        corsRes.status === 200 &&
        allowOrigin === testOrigin &&
        allowCreds === 'true',
        `Test 10: Seamless CORS communication for origin: ${testOrigin}`,
        `Allow-Origin: ${allowOrigin}, Allow-Creds: ${allowCreds}`
      );
    }

    // Untrusted origin is blocked
    const evilRes = await fetch(`${BASE_URL}/health`, {
      headers: { 'Origin': 'https://malicious-site.com' }
    });
    const evilAllowOrigin = evilRes.headers.get('access-control-allow-origin');
    assert(
      !evilAllowOrigin || evilAllowOrigin !== 'https://malicious-site.com',
      'Test 10b: Malicious cross-site origin blocked by CORS',
      `Allow-Origin: ${evilAllowOrigin}`
    );

    // -----------------------------------------------------------------
    // CLEANUP: Zero test records left in database
    // -----------------------------------------------------------------
    await User.deleteMany({});
    await Store.deleteMany({});

    const finalUsers = await User.countDocuments();
    const finalStores = await Store.countDocuments();
    assert(
      finalUsers === 0 && finalStores === 0,
      'Final Cleanliness: Zero leftover test records in MongoDB collections',
      `Users: ${finalUsers}, Stores: ${finalStores}`
    );

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log(`\n======================================================`);
    console.log(`--- TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
    console.log(`======================================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
};

runTests();
