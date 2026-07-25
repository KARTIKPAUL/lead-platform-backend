const { validationResult } = require('express-validator');
const Lead = require('../models/Lead');
const Note = require('../models/Note');
const ActivityLog = require('../models/ActivityLog');
const { logActivity } = require('../utils/activity');

const STATUSES = Lead.STATUSES;

/** A member may only see/act on leads assigned to them. Admins see everything. */
function canAccessLead(user, lead) {
  if (user.role === 'admin') return true;
  return lead.assignedTo && lead.assignedTo.toString() === user._id.toString();
}

/**
 * PUBLIC: capture a lead from the public-facing form. No auth, no PII beyond
 * what's needed, always created with status "new" and unassigned.
 */
async function captureLead(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ValidationError', details: errors.array() });
    }

    const { name, email, phone, company, source, message } = req.body;
    const lead = await Lead.create({
      name,
      email,
      phone,
      company,
      source,
      message,
      status: 'new',
      assignedTo: null,
      createdBy: null,
    });

    await logActivity(lead._id, null, 'lead.captured', { source: source || 'website' });

    res.status(201).json({
      message: 'Thanks — we received your request and a team member will reach out shortly.',
      leadId: lead._id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/leads
 * Pagination + filtering. Members are scoped server-side to their own assigned leads
 * regardless of what filters they pass (enforced permission, not just UI hiding).
 */
async function listLeads(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { status, assignedTo, q } = req.query;

    const filter = {};

    if (status) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ error: 'BadRequest', message: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
      }
      filter.status = status;
    }

    if (req.user.role === 'admin') {
      if (assignedTo) {
        filter.assignedTo = assignedTo === 'unassigned' ? null : assignedTo;
      }
    } else {
      // Member: hard server-side scope, ignore any assignedTo filter they send.
      filter.assignedTo = req.user._id;
    }

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex special chars
      const pattern = new RegExp(escaped, 'i'); // case-insensitive, partial match
      filter.$or = [
        { name: pattern },
        { email: pattern },
        { company: pattern },
      ];
    }

    const [items, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTo', 'name email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.status(200).json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getLead(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name email role');
    if (!lead) return res.status(404).json({ error: 'NotFound', message: 'Lead not found' });

    if (!canAccessLead(req.user, lead)) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this lead' });
    }

    res.status(200).json({ data: lead });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/leads/:id
 * Admin: can change status, assignedTo, and core fields.
 * Member: can change status only, and only on leads assigned to them.
 */
async function updateLead(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'NotFound', message: 'Lead not found' });

    if (!canAccessLead(req.user, lead)) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this lead' });
    }

    const allowedForMember = ['status'];
    const allowedForAdmin = ['status', 'assignedTo', 'name', 'email', 'phone', 'company', 'source'];
    const allowed = req.user.role === 'admin' ? allowedForAdmin : allowedForMember;

    const attemptedKeys = Object.keys(req.body);
    const disallowed = attemptedKeys.filter((k) => !allowed.includes(k));
    if (disallowed.length > 0 && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Members cannot modify: ${disallowed.join(', ')}`,
      });
    }

    if (req.body.status && !STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'BadRequest', message: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
    }

    const changes = {};
    for (const key of allowed) {
      if (key in req.body) changes[key] = req.body[key];
    }

    const before = { status: lead.status, assignedTo: lead.assignedTo };
    Object.assign(lead, changes);
    await lead.save();

    if ('status' in changes && changes.status !== before.status) {
      await logActivity(lead._id, req.user._id, 'status.changed', { from: before.status, to: changes.status });
    }
    if ('assignedTo' in changes && String(changes.assignedTo) !== String(before.assignedTo)) {
      await logActivity(lead._id, req.user._id, 'lead.assigned', { from: before.assignedTo, to: changes.assignedTo });
    }
    const otherFieldsChanged = Object.keys(changes).filter((k) => k !== 'status' && k !== 'assignedTo');
    if (otherFieldsChanged.length > 0) {
      await logActivity(lead._id, req.user._id, 'lead.updated', { fields: otherFieldsChanged });
    }

    const populated = await lead.populate('assignedTo', 'name email role');
    res.status(200).json({ data: populated });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/leads/:id — admin only (enforced at the route level too). */
async function deleteLead(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'NotFound', message: 'Lead not found' });

    await Promise.all([
      Lead.deleteOne({ _id: lead._id }),
      Note.deleteMany({ lead: lead._id }),
      ActivityLog.deleteMany({ lead: lead._id }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function addNote(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ValidationError', details: errors.array() });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'NotFound', message: 'Lead not found' });

    if (!canAccessLead(req.user, lead)) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this lead' });
    }

    const note = await Note.create({ lead: lead._id, author: req.user._id, text: req.body.text });
    await logActivity(lead._id, req.user._id, 'note.added', { noteId: note._id });

    const populated = await note.populate('author', 'name email role');
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
}

async function listNotes(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'NotFound', message: 'Lead not found' });

    if (!canAccessLead(req.user, lead)) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this lead' });
    }

    const notes = await Note.find({ lead: lead._id }).populate('author', 'name email role').sort({ createdAt: -1 });
    res.status(200).json({ data: notes });
  } catch (err) {
    next(err);
  }
}

async function listActivity(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'NotFound', message: 'Lead not found' });

    if (!canAccessLead(req.user, lead)) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this lead' });
    }

    const activity = await ActivityLog.find({ lead: lead._id }).populate('actor', 'name email role').sort({ createdAt: -1 });
    res.status(200).json({ data: activity });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  captureLead,
  listLeads,
  getLead,
  updateLead,
  deleteLead,
  addNote,
  listNotes,
  listActivity,
  canAccessLead,
};
