const mongoose = require('mongoose');

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
];

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    source: { type: String, trim: true, default: 'website' },
    message: { type: String, trim: true },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: 'new',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null when created via public capture form
    },
  },
  { timestamps: true }
);

leadSchema.index({ name: 'text', email: 'text', company: 'text' });

leadSchema.statics.STATUSES = LEAD_STATUSES;

module.exports = mongoose.model('Lead', leadSchema);
