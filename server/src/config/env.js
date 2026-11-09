const dotenv = require('dotenv');

dotenv.config();

const normalizeOrigin = (urlStr) => {
  if (!urlStr || typeof urlStr !== 'string') return '';
  return urlStr.trim().replace(/\/+$/, '');
};

const parseAllowedOrigins = (clientUrlRaw, corsOriginsRaw, isProduction) => {
  const origins = new Set();
  const candidates = [
    ...(clientUrlRaw ? clientUrlRaw.split(',') : []),
    ...(corsOriginsRaw ? corsOriginsRaw.split(',') : [])
  ];

  for (const item of candidates) {
    const normalized = normalizeOrigin(item);
    if (!normalized) continue;
    try {
      origins.add(new URL(normalized).origin);
    } catch {
      origins.add(normalized);
    }
  }

  if (!isProduction && origins.size === 0) {
    origins.add('http://localhost:5173');
  }

  return Array.from(origins);
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const allowedClientOrigins = parseAllowedOrigins(
  process.env.CLIENT_URL || (isProduction ? '' : 'http://localhost:5173'),
  process.env.CORS_ORIGINS || '',
  isProduction
);

const primaryClientUrl =
  allowedClientOrigins[0] || (isProduction ? '' : 'http://localhost:5173');

const mongodbUri =
  (process.env.MONGODB_URI || '').trim() ||
  (isProduction ? '' : 'mongodb://localhost:27017/nearexpiry');

const jwtSecret =
  (process.env.JWT_SECRET || '').trim() ||
  (isProduction ? '' : 'fallback_secret_change_in_production');

const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
const emailFrom = (process.env.EMAIL_FROM || 'NearExpiry <onboarding@resend.dev>').trim();

const cloudinaryCloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

const rawCookieSameSite = (process.env.COOKIE_SAME_SITE || '').trim().toLowerCase();
const cookieSameSite = ['strict', 'lax', 'none'].includes(rawCookieSameSite)
  ? rawCookieSameSite
  : (isProduction ? 'none' : 'lax');

/**
 * Validate required and optional environment variables at application startup.
 * Fails fast in production when critical secrets or URLs are missing or invalid.
 * Never logs or exposes secret values.
 */
const validateEnv = (envOverride = process.env) => {
  const currentEnv = envOverride.NODE_ENV || 'development';
  const prod = currentEnv === 'production';
  const uri = (envOverride.MONGODB_URI || (prod ? '' : 'mongodb://localhost:27017/nearexpiry')).trim();
  const secret = (envOverride.JWT_SECRET || (prod ? '' : 'fallback_secret_change_in_production')).trim();
  const cUrl = (envOverride.CLIENT_URL || (prod ? '' : 'http://localhost:5173')).trim();

  const errors = [];
  const warnings = [];

  if (!uri) {
    errors.push('MONGODB_URI is required.');
  } else if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    errors.push('MONGODB_URI must begin with mongodb:// or mongodb+srv://.');
  } else if (prod && /localhost|127\.0\.0\.1/i.test(uri)) {
    warnings.push('MONGODB_URI points to localhost while NODE_ENV=production. Use MongoDB Atlas for cloud deployments.');
  }

  if (!secret || secret === 'fallback_secret_change_in_production') {
    if (prod) {
      errors.push('JWT_SECRET must be configured with a strong secret in production.');
    } else {
      warnings.push('Using development fallback JWT_SECRET. Set a strong secret before production.');
    }
  } else if (prod && secret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long in production.');
  }

  if (prod) {
    if (!cUrl) {
      errors.push('CLIENT_URL is required in production (e.g., https://your-app.vercel.app).');
    } else {
      const firstOrigin = normalizeOrigin(cUrl.split(',')[0]);
      try {
        const parsed = new URL(firstOrigin);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push('CLIENT_URL must use http:// or https://.');
        } else if (parsed.protocol !== 'https:') {
          warnings.push('CLIENT_URL is not HTTPS; browsers block SameSite=None; Secure cookies over plain HTTP.');
        }
      } catch {
        errors.push('CLIENT_URL must be a valid URL (e.g., https://your-app.vercel.app).');
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n - ${errors.join('\n - ')}`);
  }

  for (const warn of warnings) {
    console.warn(`[Config Warning] ${warn}`);
  }

  const hasResend = Boolean((envOverride.RESEND_API_KEY || '').trim());
  const hasCloudinary = Boolean(
    (envOverride.CLOUDINARY_CLOUD_NAME || '').trim() &&
    (envOverride.CLOUDINARY_API_KEY || '').trim() &&
    (envOverride.CLOUDINARY_API_SECRET || '').trim()
  );

  console.log(
    `[Config] Environment validated (${currentEnv}). Optional integrations -> Resend Email: ${
      hasResend ? 'configured' : 'not configured (optional)'
    }, Cloudinary Uploads: ${
      hasCloudinary ? 'configured' : 'not configured (optional)'
    }`
  );

  return { valid: true, warnings };
};

module.exports = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,
  isProduction,
  mongodbUri,
  jwtSecret,
  clientUrl: primaryClientUrl,
  allowedClientOrigins,
  resendApiKey,
  emailFrom,
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cookieSameSite,
  normalizeOrigin,
  parseAllowedOrigins,
  validateEnv
};
