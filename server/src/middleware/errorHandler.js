const { nodeEnv } = require('../config/env');
const { ZodError } = require('zod');

const redactSensitiveMsg = (msg = '') => {
  return String(msg).replace(/:\/\/[^@\s]+@/g, '://***:***@');
};

// Centralized error handling middleware
const errorHandler = (err, req, res, next) => {
  const currentEnv = process.env.NODE_ENV || nodeEnv;
  const isProd = currentEnv === 'production';

  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || 500);
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || undefined;

  // Handle malformed JSON payloads
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON request body.';
  }

  // Handle oversized request payloads
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request payload exceeds maximum allowed size.';
  }

  // Handle Zod validation errors
  if (err instanceof ZodError || err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = (err.errors || []).map((e) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message
    }));
  }

  // Handle Mongoose duplicate key errors (code 11000)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with this ${field} already exists.`;
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID format.';
  }

  // Log unexpected server errors server-side (redacted) without exposing internals in production
  if (statusCode >= 500) {
    console.error(`[Error ${statusCode}] ${req.method} ${req.originalUrl}: ${redactSensitiveMsg(err.message)}`);
    if (isProd && !err.isOperational) {
      message = 'Internal Server Error. Please try again later.';
      errors = undefined;
    }
  }

  const response = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(currentEnv === 'development' && { stack: err.stack })
  };

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
