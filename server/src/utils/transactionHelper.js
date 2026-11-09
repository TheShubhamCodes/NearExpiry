const mongoose = require('mongoose');

let _transactionsSupported = null;

/**
 * Detect whether the active MongoDB connection topology supports multi-document ACID transactions.
 * Tests actual server response because client driver allows startTransaction() in memory,
 * but standalone mongod server rejects it with "Transaction numbers are only allowed on a replica set member or mongos".
 */
const checkTransactionSupport = async () => {
  if (_transactionsSupported !== null) {
    return _transactionsSupported;
  }

  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return false;
  }

  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      // Execute an actual operation on the database using session
      await mongoose.connection.db.collection('stores').findOne({}, { session });
      await session.abortTransaction();
      _transactionsSupported = true;
    } catch (err) {
      // Only treat standalone topology rejections as permanent non-transactional mode
      const isStandaloneError =
        err.code === 20 ||
        err.codeName === 'IllegalOperation' ||
        /Transaction numbers are only allowed/i.test(err.message || '');

      if (isStandaloneError) {
        _transactionsSupported = false;
      } else {
        // Transient error: do not permanently cache false
        return false;
      }
    } finally {
      await session.endSession();
    }
  } catch (err) {
    _transactionsSupported = false;
  }

  return _transactionsSupported;
};

/**
 * Execute an operation with ACID multi-document transaction support when available (replica set),
 * gracefully falling back to atomic conditional operations and compensating rollback
 * on standalone instances where transactions are not supported by the database engine.
 *
 * @param {Function} executionFn - Async function taking (session)
 * @param {Function} [compensationFn] - Optional compensation logic if non-transactional execution fails
 */
const runWithTransaction = async (executionFn, compensationFn = null) => {
  const supportsTx = await checkTransactionSupport();

  if (supportsTx) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await executionFn(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone fallback: execute directly with atomic single-document queries & compensation
    try {
      return await executionFn(null);
    } catch (err) {
      if (compensationFn) {
        try {
          await compensationFn();
        } catch (compErr) {
          console.error('[Compensation Error]', compErr.message);
        }
      }
      throw err;
    }
  }
};

module.exports = {
  checkTransactionSupport,
  runWithTransaction
};
