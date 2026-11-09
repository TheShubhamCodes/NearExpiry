const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nearexpiry',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_change_in_production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'NearExpiry <onboarding@resend.dev>'
};

