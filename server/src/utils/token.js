const jwt = require('jsonwebtoken');
const { jwtSecret, nodeEnv } = require('../config/env');

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role
    },
    jwtSecret,
    {
      expiresIn: '7d'
    }
  );
};

const getCookieOptions = () => {
  const currentEnv = process.env.NODE_ENV || nodeEnv;
  const isProd = currentEnv === 'production';
  const envSameSite = (process.env.COOKIE_SAME_SITE || '').trim().toLowerCase();
  const sameSite = ['strict', 'lax', 'none'].includes(envSameSite)
    ? envSameSite
    : (isProd ? 'none' : 'lax');

  return {
    httpOnly: true,
    secure: isProd || sameSite === 'none', // SameSite=None requires Secure=true (HTTPS)
    sameSite,
    path: '/'
  };
};

const sendTokenCookie = (res, token) => {
  res.cookie('token', token, {
    ...getCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const clearTokenCookie = (res) => {
  res.cookie('token', '', {
    ...getCookieOptions(),
    expires: new Date(0)
  });
};

module.exports = {
  generateToken,
  getCookieOptions,
  sendTokenCookie,
  clearTokenCookie
};
