const {
  nodeEnv,
  allowedClientOrigins,
  normalizeOrigin,
  parseAllowedOrigins
} = require('../config/env');

const DEV_LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
]);

/**
 * Checks whether an origin is authorized.
 * Production: strictly permits explicitly configured CLIENT_URL / CORS_ORIGINS only.
 * Development: also permits localhost, loopback, and private RFC1918 LAN IPs.
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Direct non-browser requests or same-origin

  const normalized = normalizeOrigin(origin);
  const currentEnv = process.env.NODE_ENV || nodeEnv;
  const isProd = currentEnv === 'production';

  const configuredOrigins = new Set([
    ...allowedClientOrigins,
    ...parseAllowedOrigins(process.env.CLIENT_URL || '', process.env.CORS_ORIGINS || '', isProd)
  ]);

  if (configuredOrigins.has(normalized)) {
    return true;
  }

  // In production, do NOT allow arbitrary localhost or LAN IP origins
  if (isProd) {
    return false;
  }

  if (DEV_LOCAL_ORIGINS.has(normalized)) {
    return true;
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return true;
    }
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
      return true;
    }
  } catch (e) {
    return false;
  }

  return false;
};

/**
 * CSRF Protection Middleware:
 * Inspects state-changing HTTP methods (POST, PUT, PATCH, DELETE) for requests
 * authenticated via cookies and verifies that the Origin or Referer matches
 * an authorized frontend origin.
 */
const csrfProtection = (req, res, next) => {
  // Safe HTTP methods do not change state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Extract request origin
  const originHeader = req.headers['origin'];
  const refererHeader = req.headers['referer'];

  let requestOrigin = originHeader;

  if (!requestOrigin && refererHeader) {
    try {
      requestOrigin = new URL(refererHeader).origin;
    } catch (e) {
      requestOrigin = null;
    }
  }

  // If an Origin or Referer is present, it MUST match an authorized origin
  if (requestOrigin) {
    if (!isAllowedOrigin(requestOrigin)) {
      return res.status(403).json({
        success: false,
        message: 'Cross-Site Request Forgery (CSRF) protection: Untrusted request origin.'
      });
    }
  } else {
    // Reject cross-site cookie-bearing browser requests lacking Origin/Referer
    if (req.cookies && req.cookies.token && req.headers['user-agent']) {
      const secFetchSite = req.headers['sec-fetch-site'];
      if (secFetchSite && secFetchSite === 'cross-site') {
        return res.status(403).json({
          success: false,
          message: 'Cross-Site Request Forgery (CSRF) protection: Cross-site request rejected.'
        });
      }
    }
  }

  next();
};

module.exports = csrfProtection;
module.exports.isAllowedOrigin = isAllowedOrigin;
