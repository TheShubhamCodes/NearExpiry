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

const sendTokenCookie = (res, token) => {
  const isProduction = nodeEnv === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction, // false in dev so localhost HTTP works
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  };

  res.cookie('token', token, cookieOptions);
};

const clearTokenCookie = (res) => {
  const isProduction = nodeEnv === 'production';
  res.cookie('token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    expires: new Date(0),
    path: '/'
  });
};

module.exports = {
  generateToken,
  sendTokenCookie,
  clearTokenCookie
};

