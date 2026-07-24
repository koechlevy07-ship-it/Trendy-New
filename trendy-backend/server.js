require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

const requiredEnv = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error('[FATAL] Missing required environment variables:');
  missingEnv.forEach(key => console.error(`  - ${key}`));
  process.exit(1);
}
console.log('[INFO] Environment variables validated.');

app.use(helmet());

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'https://trendy-frontend-ashen.vercel.app',
  'https://trendy-frontend-ashen.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (origin.includes('localhost') && origin.match(/^https?:\/\/localhost(:\d+)?$/)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));

app.use(morgan('dev'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.headers.authorization,
});
app.use('/api', limiter);

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    database: dbStatus,
  });
});

app.get('/api/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (dbReady) {
    res.status(200).json({ ready: true, database: 'connected' });
  } else {
    res.status(503).json({ ready: false, database: 'disconnected' });
  }
});

console.log('[INFO] Connecting to MongoDB Atlas...');

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('[INFO] MongoDB Atlas connection established.');
    try {
      const { startScheduler } = require('./services/promoScheduler');
      startScheduler();
    } catch (e) {
      console.warn('[WARN] Promo scheduler failed to start:', e.message);
    }
  })
  .catch((err) => {
    console.error('[FATAL] MongoDB connection failed:', err.message);
    process.exit(1);
  });

mongoose.connection.on('error', (err) => {
  console.error('[ERROR] MongoDB connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('[WARN] MongoDB disconnected.');
});

const routesPath = path.join(__dirname, 'routes');
if (fs.existsSync(routesPath)) {
  const routeFiles = fs.readdirSync(routesPath).filter(f => f.endsWith('.js'));
  console.log(`[INFO] Mounting ${routeFiles.length} route files...`);

  const pluralAliases = { category: 'categories' };
  const mounted = {};

  routeFiles.forEach(file => {
    try {
      const routeModule = require(path.join(routesPath, file));
      let basePath = file.replace(/\.routes\.js$/i, '').replace(/\.js$/i, '');
      const mount = (mod, base) => {
        if (typeof mod === 'function' && mod.name === 'router') {
          app.use(`/api/${base}`, mod);
        } else if (typeof mod === 'function') {
          const r = mod();
          app.use(`/api/${base}`, r && typeof r.use === 'function' ? r : mod);
        } else if (mod && typeof mod === 'object' && mod.router) {
          app.use(`/api/${base}`, mod.router);
        } else {
          app.use(`/api/${base}`, mod);
        }
      };
      mount(routeModule, basePath);
      mounted[basePath] = true;
      const plural = pluralAliases[basePath] || (basePath + 's');
      if (!mounted[plural]) {
        try { mount(routeModule, plural); } catch (e) { /* ignore */ }
        mounted[plural] = true;
      }
      console.log(`  ✓ /api/${basePath} (+/${plural}) <- ${file}`);
    } catch (err) {
      console.error(`  ✗ Failed to mount ${file}:`, err.message);
    }
  });
}

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled exception:', err.stack || err);
  const status = err.status || err.statusCode || 500;
  const response = { success: false, message: err.message || 'Internal server error' };
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }
  res.status(status).json(response);
});

app.listen(PORT, () => {
  console.log(`[INFO] Server listening on port ${PORT}`);
  console.log(`[INFO] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('[INFO] Trendy Wardrobe backend is ready.');
});

const gracefulShutdown = (signal) => {
  console.log(`[INFO] ${signal} received. Closing server and MongoDB...`);
  mongoose.connection.close(() => {
    console.log('[INFO] MongoDB connection closed.');
    process.exit(0);
  });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled Rejection:', err.stack || err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.stack || err);
  process.exit(1);
});

module.exports = app;
