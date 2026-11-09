const crypto = require('crypto');
const {
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret
} = require('../config/env');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB strict cap
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

let customUploadHandler = null;

/**
 * Inject a custom upload handler (for isolated tests without hitting external Cloudinary API)
 */
const setUploadHandler = (handler) => {
  customUploadHandler = handler;
};

const getCloudinaryCredentials = () => {
  const rawName = 'CLOUDINARY_CLOUD_NAME' in process.env ? process.env.CLOUDINARY_CLOUD_NAME : cloudinaryCloudName;
  const rawKey = 'CLOUDINARY_API_KEY' in process.env ? process.env.CLOUDINARY_API_KEY : cloudinaryApiKey;
  const rawSecret = 'CLOUDINARY_API_SECRET' in process.env ? process.env.CLOUDINARY_API_SECRET : cloudinaryApiSecret;

  const cloudName = (rawName || '').trim();
  const apiKey = (rawKey || '').trim();
  const apiSecret = (rawSecret || '').trim();
  return { cloudName, apiKey, apiSecret };
};

const isCloudinaryConfigured = () => {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  return Boolean(cloudName && apiKey && apiSecret);
};

/**
 * Verify file binary signature (magic bytes) so spoofed extensions or MIME headers are rejected.
 */
const verifyImageMagicBytes = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isGif =
    buffer.slice(0, 6).toString('ascii') === 'GIF87a' ||
    buffer.slice(0, 6).toString('ascii') === 'GIF89a';
  const isWebp =
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP';

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return isJpeg;
  if (mimeType === 'image/png') return isPng;
  if (mimeType === 'image/gif') return isGif;
  if (mimeType === 'image/webp') return isWebp;
  return false;
};

/**
 * Parse and strictly validate a base64 image Data URI before sending to Cloudinary.
 */
const validateImageDataUri = (dataUri) => {
  if (!dataUri || typeof dataUri !== 'string') {
    const err = new Error('Image payload is required.');
    err.statusCode = 400;
    throw err;
  }

  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    const err = new Error('Invalid image format. Expected a base64-encoded image (JPEG, PNG, WEBP, or GIF).');
    err.statusCode = 400;
    throw err;
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    const err = new Error('Unsupported image type. Allowed formats: JPEG, PNG, WEBP, GIF.');
    err.statusCode = 400;
    throw err;
  }

  const base64Clean = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64Clean, 'base64');

  if (buffer.length === 0) {
    const err = new Error('Uploaded image file is empty.');
    err.statusCode = 400;
    throw err;
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error('Image file exceeds maximum allowed size of 5 MB.');
    err.statusCode = 413;
    throw err;
  }

  if (!verifyImageMagicBytes(buffer, mimeType)) {
    const err = new Error('File content does not match a valid image signature.');
    err.statusCode = 400;
    throw err;
  }

  return { mimeType, buffer, sizeBytes: buffer.length };
};

/**
 * Generate Cloudinary SHA-1 signature cleanly on the backend without exposing apiSecret.
 */
const signUploadParams = (params, apiSecret) => {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
};

/**
 * Validate and upload product image via backend Cloudinary credentials.
 */
const uploadProductImage = async (dataUri) => {
  const { mimeType, buffer, sizeBytes } = validateImageDataUri(dataUri);

  if (customUploadHandler) {
    return await customUploadHandler({ dataUri, mimeType, sizeBytes });
  }

  if (!isCloudinaryConfigured()) {
    const err = new Error(
      'Image upload is not configured on the server. Set Cloudinary environment variables or paste an external image URL manually.'
    );
    err.statusCode = 503;
    err.isOperational = true;
    throw err;
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'nearexpiry/products';

  const signature = signUploadParams({ folder, timestamp }, apiSecret);

  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob, `product-${timestamp}.${mimeType.split('/')[1]}`);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', folder);
  formData.append('signature', signature);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      {
        method: 'POST',
        body: formData,
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.secure_url) {
      const errMsg = payload?.error?.message || `Cloudinary upload failed with HTTP ${response.status}`;
      const err = new Error(errMsg);
      err.statusCode = 502;
      err.isOperational = true;
      throw err;
    }

    return {
      imageUrl: payload.secure_url,
      publicId: payload.public_id,
      width: payload.width,
      height: payload.height,
      format: payload.format,
      bytes: payload.bytes
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Image upload timed out while connecting to image storage.');
      timeoutErr.statusCode = 504;
      timeoutErr.isOperational = true;
      throw timeoutErr;
    }
    throw err;
  }
};

module.exports = {
  uploadProductImage,
  validateImageDataUri,
  signUploadParams,
  isCloudinaryConfigured,
  setUploadHandler,
  MAX_IMAGE_BYTES
};
