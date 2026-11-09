// In-memory rate limiter for authentication attempts
const attemptsMap = new Map();

// Cleanup stale rate limit entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of attemptsMap.entries()) {
    if (now - data.firstAttempt > 15 * 60 * 1000) {
      attemptsMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);

const authRateLimiter = (maxAttempts = 10, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = attemptsMap.get(ip);

    if (!record || now - record.firstAttempt > windowMs) {
      record = { count: 1, firstAttempt: now };
      attemptsMap.set(ip, record);
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
    attemptsMap.set(ip, record);
    next();
  };
};

const resetAuthRateLimit = (ip) => {
  if (ip) {
    attemptsMap.delete(ip);
  }
};

module.exports = {
  authRateLimiter,
  resetAuthRateLimit
};

