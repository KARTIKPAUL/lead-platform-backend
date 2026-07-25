const ActivityLog = require('../models/ActivityLog');

async function logActivity(leadId, actorId, action, meta = {}) {
  return ActivityLog.create({ lead: leadId, actor: actorId || null, action, meta });
}

module.exports = { logActivity };
