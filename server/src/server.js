const app = require('./app');
const connectDB = require('./config/db');
const { port, nodeEnv } = require('./config/env');
const { startScheduler } = require('./services/schedulerService');

const startServer = async () => {
  // Connect to Database
  await connectDB();

  // Initialize automated background scheduler for expiry tracking and alerts
  startScheduler();

  // Start HTTP Server
  const server = app.listen(port, () => {
    console.log(`[Server] NearExpiry API running in ${nodeEnv} mode on http://localhost:${port}`);
    console.log(`[Server] Health check endpoint: http://localhost:${port}/api/health`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error(`[Server] Unhandled Rejection: ${err.message}`);
    // server.close(() => process.exit(1));
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error(`[Server] Uncaught Exception: ${err.message}`);
  });
};

startServer();

