/**
 * Environment variable loader + validator.
 * Fails fast at startup if required config is missing, rather than
 * surfacing confusing errors deep in a request handler later.
 */
require('dotenv').config();

const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[config] Missing required environment variables: ${missing.join(', ')}\n` +
        'Copy .env.example to .env and fill in real values before starting the server.'
    );
    process.exit(1);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'KES',
};

module.exports = { env, validateEnv };
