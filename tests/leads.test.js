process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const createApp = require('../src/app');
const User = require('../src/models/User');
const Lead = require('../src/models/Lead');
const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');

const app = createApp();

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearTestDB);

describe('Core flow: public capture -> lead lifecycle', () => {
  test('anonymous visitor can submit the public capture form', async () => {
    const res = await request(app).post('/api/leads/capture').send({
      name: 'Jamie Lee',
      email: 'jamie@lead.com',
      company: 'Lead Co',
      phone: '555-1212',
      message: 'Interested in the enterprise plan',
    });

    expect(res.status).toBe(201);
    expect(res.body.leadId).toBeDefined();

    const stored = await Lead.findById(res.body.leadId);
    expect(stored.status).toBe('new');
    expect(stored.assignedTo).toBeNull();
  });

  test('capture form rejects invalid input (400)', async () => {
    const res = await request(app).post('/api/leads/capture').send({ name: '', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('admin: assign lead, member updates status, notes + activity trail recorded', async () => {
    const admin = await User.create({ name: 'Admin', email: 'admin@test.com', password: 'Password123!', role: 'admin' });
    const member = await User.create({ name: 'Member', email: 'member@test.com', password: 'Password123!', role: 'member' });
    const lead = await Lead.create({ name: 'Prospect', email: 'prospect@test.com', createdBy: admin._id });

    const adminToken = await loginAs('admin@test.com', 'Password123!');
    const memberToken = await loginAs('member@test.com', 'Password123!');

    // Admin assigns the lead to the member
    const assignRes = await request(app)
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedTo: member._id.toString() });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.assignedTo._id).toBe(member._id.toString());

    // Member cannot reassign (not in their allowed field list)
    const reassignAttempt = await request(app)
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ assignedTo: admin._id.toString() });
    expect(reassignAttempt.status).toBe(403);

    // Member updates the status (allowed on their own assigned lead)
    const statusRes = await request(app)
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'contacted' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('contacted');

    // Member adds a timestamped note
    const noteRes = await request(app)
      .post(`/api/leads/${lead._id}/notes`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ text: 'Left a voicemail' });
    expect(noteRes.status).toBe(201);
    expect(noteRes.body.data.text).toBe('Left a voicemail');
    expect(noteRes.body.data.createdAt).toBeDefined();

    // Activity trail reflects assignment + status change + note
    const activityRes = await request(app)
      .get(`/api/leads/${lead._id}/activity`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activityRes.status).toBe(200);
    const actions = activityRes.body.data.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['lead.assigned', 'status.changed', 'note.added']));
  });

  test('pagination and status filtering on GET /api/leads', async () => {
    const admin = await User.create({ name: 'Admin', email: 'admin@test.com', password: 'Password123!', role: 'admin' });
    await Lead.create([
      { name: 'A', email: 'a@a.com', status: 'new', createdBy: admin._id },
      { name: 'B', email: 'b@b.com', status: 'won', createdBy: admin._id },
      { name: 'C', email: 'c@c.com', status: 'new', createdBy: admin._id },
    ]);

    const token = await loginAs('admin@test.com', 'Password123!');

    const res = await request(app)
      .get('/api/leads?status=new&page=1&limit=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  test('rejects an invalid status transition value (400)', async () => {
    const admin = await User.create({ name: 'Admin', email: 'admin@test.com', password: 'Password123!', role: 'admin' });
    const lead = await Lead.create({ name: 'X', email: 'x@x.com', createdBy: admin._id });
    const token = await loginAs('admin@test.com', 'Password123!');

    const res = await request(app)
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'not-a-real-status' });

    expect(res.status).toBe(400);
  });
});
