const express = require('express');
const { body } = require('express-validator');
const {
  captureLead,
  listLeads,
  getLead,
  updateLead,
  deleteLead,
  addNote,
  listNotes,
  listActivity,
} = require('../controllers/leadController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public capture form — no auth required.
router.post(
  '/capture',
  [
    body('name').isString().trim().notEmpty(),
    body('email').isEmail(),
    body('phone').optional().isString().trim(),
    body('company').optional().isString().trim(),
    body('source').optional().isString().trim(),
    body('message').optional().isString().trim(),
  ],
  captureLead
);

// Everything below requires authentication.
router.use(requireAuth);

router.get('/', listLeads);
router.get('/:id', getLead);
router.patch('/:id', updateLead);
router.delete('/:id', requireRole('admin'), deleteLead);

router.get('/:id/notes', listNotes);
router.post('/:id/notes', [body('text').isString().trim().notEmpty()], addNote);

router.get('/:id/activity', listActivity);

module.exports = router;
