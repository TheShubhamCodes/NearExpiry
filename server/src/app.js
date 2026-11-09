const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./middleware/csrfProtection');
const { isAllowedOrigin } = csrfProtection;
const { apiRateLimiter } = require('./middleware/rateLimiter');
const routes = require('./routes');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Trust proxy for secure cookies and rate limiting behind Render / Vercel reverse proxies
app.set('trust proxy', 1);

// Middleware: HTTP Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Middleware: CORS
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Middleware: Cookie parser
app.use(cookieParser());

// Middleware: Body parser with strict size limits (allow 8mb ONLY for authenticated image upload)
app.use((req, res, next) => {
  const limit = req.originalUrl && req.originalUrl.startsWith('/api/products/upload-image') ? '8mb' : '1mb';
  express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Middleware: CSRF Protection for state-changing requests
app.use(csrfProtection);

// Middleware: General API rate limiting (excludes /api/health)
app.use('/api', apiRateLimiter(500, 15 * 60 * 1000));

// Root welcome endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to NearExpiry API. Use /api/health to inspect system health.'
  });
});

// Mount API routes
app.use('/api', routes);

// 404 & Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
