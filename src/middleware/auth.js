const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifies the Bearer JWT and attaches req.user (safe, no password).
 * Rejects with 401 if missing/invalid/expired, or if the user no longer exists/active.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing bearer token' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Account not found or disabled' });
    }

    req.user = user; // full mongoose doc (server trusts this, never the client)
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role gate. Usage: requireRole('admin') or requireRole('admin', 'member')
 * Must run after requireAuth.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient role for this action' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
