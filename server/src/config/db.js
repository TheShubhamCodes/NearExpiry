const mongoose = require('mongoose');
const { mongodbUri } = require('./env');

const redactMongoUri = (msg = '') => {
  return String(msg).replace(/:\/\/[^@\s]+@/g, '://***:***@');
};

const connectDB = async () => {
  if (!mongodbUri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  try {
    const conn = await mongoose.connect(mongodbUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      autoIndex: true
    });

    console.log(`[Database] MongoDB Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[Database] MongoDB Connection Error: ${redactMongoUri(error.message)}`);
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[Database] MongoDB connection lost');
});

mongoose.connection.on('reconnected', () => {
  console.log('[Database] MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`[Database] MongoDB runtime error: ${redactMongoUri(err?.message || 'Unknown error')}`);
});

connectDB.redactMongoUri = redactMongoUri;
module.exports = connectDB;
