const { clientUrl, nodeEnv } = require('../config/env');

const allowedOrigins = new Set([
  clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
]);

/**
 * Checks whether an origin is authorized.
 * Permitted:
 * 1. Explicitly configured clientUrl
 * 2. Localhost & Loopback on any port (e.g. dev servers, tests)
 * 3. RFC1918 private LAN IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Direct non-browser requests or same-origin
  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Allow localhost, 127.0.0.1, IPv6 loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return true;
    }
    // Allow private LAN IPv4 ranges
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
      // Invalid referer URL format
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
    // If request has cookie authentication but neither Origin nor Referer is provided
    // in a browser context, reject cross-site forged requests
    if (req.cookies && req.cookies.token && req.headers['user-agent']) {
      // Standard automated API clients without cookies can proceed to authMiddleware
      // But cookie-bearing requests without origin/referer from browsers are blocked
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

