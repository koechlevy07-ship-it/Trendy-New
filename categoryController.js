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
  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
    env: process.env.MPESA_ENV || 'sandbox', // 'sandbox' | 'production'
  },
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromAddress: process.env.EMAIL_FROM || 'no-reply@trendywardrobe.co.ke',
    fromName: process.env.EMAIL_FROM_NAME || 'Trendy Wardrobe',
  },
  sms: {
    provider: process.env.SMS_PROVIDER || 'africastalking',
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
    senderId: process.env.AT_SENDER_ID,
  },
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'KES',
};

module.exports = { env, validateEnv };
