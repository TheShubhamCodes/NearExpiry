const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const { port, nodeEnv, validateEnv } = require('./config/env');
const { startScheduler, stopScheduler } = require('./services/schedulerService');

let server = null;
let isShuttingDown = false;

const gracefulShutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Server] ${signal} received. Starting graceful shutdown...`);

  // Force exit safeguard if connections hang beyond 10 seconds
  const forceExitTimer = setTimeout(() => {
    console.error('[Server] Forced exit after shutdown timeout.');
    process.exit(1);
  }, 10000);
  if (typeof forceExitTimer.unref === 'function') {
    forceExitTimer.unref();
  }

  try {
    stopScheduler();

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[Server] HTTP server closed.');
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      console.log('[Database] MongoDB connection closed cleanly.');
    }

    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  } catch (err) {
    console.error(`[Server] Error during shutdown: ${err.message}`);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    // 1. Validate required environment variables before connecting
    validateEnv();

    // 2. Connect to MongoDB (fail fast if DB cannot connect)
    await connectDB();

    // 3. Initialize automated background scheduler after DB connection succeeds
    startScheduler();

    // 4. Start HTTP Server
    server = app.listen(port, () => {
      console.log(`[Server] NearExpiry API running in ${nodeEnv} mode on port ${port}`);
      console.log(`[Server] Health check endpoint ready at /api/health`);
    });

    // Render sends SIGTERM on deploys/restarts; terminal Ctrl+C sends SIGINT
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

    process.on('unhandledRejection', (err) => {
      console.error(`[Server] Unhandled Rejection: ${err?.message || err}`);
      gracefulShutdown('unhandledRejection', 1);
    });

    process.on('uncaughtException', (err) => {
      console.error(`[Server] Uncaught Exception: ${err?.message || err}`);
      gracefulShutdown('uncaughtException', 1);
    });
  } catch (err) {
    console.error(`[Startup Failed] ${err.message}`);
    process.exit(1);
  }
};

startServer();
