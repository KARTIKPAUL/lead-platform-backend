const { validationResult } = require('express-validator');
const User = require('../models/User');
const { signToken } = require('../utils/token');

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ValidationError', details: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.status(200).json({ token, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.status(200).json({ user: req.user.toSafeObject() });
}

/**
 * Admin-only: create a new user (admin or member).
 * There is intentionally no public self-registration endpoint —
 * a sales team's roster is provisioned by an admin.
 */
async function createUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ValidationError', details: errors.array() });
    }

    const { name, email, password, role } = req.body;
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role === 'admin' ? 'admin' : 'member',
    });

    res.status(201).json({ user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ users: users.map((u) => u.toSafeObject()) });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, createUser, listUsers };
