const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDatabase() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongodbUri);
    // eslint-disable-next-line no-console
    console.log(`[database] Connected to MongoDB (${env.nodeEnv})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[database] Connection failed:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[database] Connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[database] Disconnected from MongoDB');
  });
}

module.exports = { connectDatabase };
