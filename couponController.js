const { User } = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../services/tokenService');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { env } = require('../config/env');

const REFRESH_COOKIE_NAME = 'tw_refresh_token';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth',
  };
}

async function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return accessToken;
}

async function register(req, res, next) {
  try {
    const { firstName, lastName, email, phone, password } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists');
    }

    const user = await User.create({ firstName, lastName, email, phone, password });
    const accessToken = await issueSession(res, user);

    return sendSuccess(res, 201, { user: user.toSafeJSON(), accessToken });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      throw new ApiError(401, 'Invalid email or password');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'This account has been deactivated');
    }

    const accessToken = await issueSession(res, user);
    return sendSuccess(res, 200, { user: user.toSafeJSON(), accessToken });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new ApiError(401, 'No refresh token provided');

    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.sub).select('+refreshTokenHash');

    if (!user || !user.isActive || user.refreshTokenHash !== hashToken(token)) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    const accessToken = signAccessToken(user);
    return sendSuccess(res, 200, { accessToken });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Invalid or expired refresh token'));
    }
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.user) {
      req.user.refreshTokenHash = undefined;
      await req.user.save({ validateBeforeSave: false });
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    return sendSuccess(res, 200, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  return sendSuccess(res, 200, { user: req.user.toSafeJSON() });
}

module.exports = { register, login, refresh, logout, me };
