const { env } = require('../config/env');
const { sendError } = require('../utils/apiResponse');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors;

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => e.message);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} is already in use` : 'Duplicate value';
  }

  // Mongoose invalid ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  }

  if (env.nodeEnv !== 'production' && statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return sendError(res, statusCode, message, errors);
}

function notFoundHandler(req, res) {
  return sendError(res, 404, `Route ${req.originalUrl} not found`);
}

module.exports = { errorHandler, notFoundHandler };
