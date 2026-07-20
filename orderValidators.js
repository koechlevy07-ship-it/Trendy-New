const { User } = require('../models/User');
const { verifyAccessToken } = require('../services/tokenService');
const { ApiError } = require('../utils/ApiError');

/**
 * Requires a valid access token. Attaches the authenticated user to req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new ApiError(401, 'Authentication required');
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new ApiError(401, 'Invalid or expired session');
    }

    if (user.changedPasswordAfter(payload.iat)) {
      throw new ApiError(401, 'Session invalidated by recent password change');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Invalid or expired token'));
    }
    next(err);
  }
}

/**
 * Restricts access to specific roles. Use after requireAuth.
 * e.g. router.post('/products', requireAuth, requireRole('admin', 'super_admin'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
