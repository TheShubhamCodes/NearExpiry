const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./middleware/csrfProtection');
const { isAllowedOrigin } = csrfProtection;
const routes = require('./routes');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Trust proxy for secure cookies and rate limiting if behind reverse proxy
app.set('trust proxy', 1);

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

// Middleware: Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware: CSRF Protection for state-changing requests
app.use(csrfProtection);

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
