const express = require('express');
const { body } = require('express-validator');
const { login, me, createUser, listUsers } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/login',
  [body('email').isEmail(), body('password').isString().notEmpty()],
  login
);

router.get('/me', requireAuth, me);

// Admin-only user management (needed so an admin can staff the "member" role)
router.get('/users', requireAuth, requireRole('admin'), listUsers);
router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  [
    body('name').isString().trim().notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('role').optional().isIn(['admin', 'member']),
  ],
  createUser
);

module.exports = router;
