// In-memory rate limiters for authentication and general API traffic
const authAttemptsMap = new Map();
const apiAttemptsMap = new Map();

// Cleanup stale rate limit entries every 10 minutes (unref so process can exit cleanly)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, data] of authAttemptsMap.entries()) {
    if (now - data.firstAttempt > 15 * 60 * 1000) {
      authAttemptsMap.delete(key);
    }
  }
  for (const [key, data] of apiAttemptsMap.entries()) {
    if (now - data.firstAttempt > 15 * 60 * 1000) {
      apiAttemptsMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

const getClientIp = (req) => {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
};

const authRateLimiter = (maxAttempts = 10, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();

    let record = authAttemptsMap.get(ip);

    if (!record || now - record.firstAttempt > windowMs) {
      record = { count: 1, firstAttempt: now };
      authAttemptsMap.set(ip, record);
      return next();
    }

    if (record.count >= maxAttempts) {
      const waitMinutes = Math.ceil((windowMs - (now - record.firstAttempt)) / 60000);
      return res.status(429).json({
        success: false,
        message: `Too many authentication attempts. Please try again in ${waitMinutes} minute(s).`
      });
    }

    record.count += 1;
    authAttemptsMap.set(ip, record);
    next();
  };
};

const resetAuthRateLimit = (ip) => {
  if (ip) {
    authAttemptsMap.delete(ip);
  }
};

/**
 * General API rate limiter to prevent abuse/flooding in production.
 * Skips /api/health probes so Render platform health checks are never throttled.
 */
const apiRateLimiter = (maxRequests = 500, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    if (req.path === '/health' || req.originalUrl === '/api/health') {
      return next();
    }

    const ip = getClientIp(req);
    const now = Date.now();

    let record = apiAttemptsMap.get(ip);

    if (!record || now - record.firstAttempt > windowMs) {
      record = { count: 1, firstAttempt: now };
      apiAttemptsMap.set(ip, record);
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests from this IP. Please slow down and try again shortly.'
      });
    }

    record.count += 1;
    apiAttemptsMap.set(ip, record);
    next();
  };
};

module.exports = {
  authRateLimiter,
  resetAuthRateLimit,
  apiRateLimiter
};
