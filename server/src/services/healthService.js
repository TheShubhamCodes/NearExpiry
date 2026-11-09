const mongoose = require('mongoose');

const getDatabaseStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
  };

  const stateCode = mongoose.connection.readyState;
  return {
    state: states[stateCode] || 'unknown',
    connected: stateCode === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

const getSystemHealth = () => {
  const dbStatus = getDatabaseStatus();

  return {
    status: 'ok',
    app: 'NearExpiry API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStatus
  };
};

module.exports = {
  getSystemHealth,
  getDatabaseStatus
};

