process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const createApp = require('../src/app');
const User = require('../src/models/User');
const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');

const app = createApp();

async function createAdmin() {
  return User.create({ name: 'Admin', email: 'admin@test.com', password: 'Password123!', role: 'admin' });
}
async function createMember() {
  return User.create({ name: 'Member', email: 'member@test.com', password: 'Password123!', role: 'member' });
}

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearTestDB);

describe('Auth rules', () => {
  test('rejects login with wrong password', async () => {
    await createAdmin();
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('logs in with correct credentials and returns a token', async () => {
    await createAdmin();
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.password).toBeUndefined();
  });

  test('rejects requests to protected routes without a token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('rejects requests with a malformed/invalid token', async () => {
    const res = await request(app).get('/api/leads').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('non-admin cannot create users (403)', async () => {
    await createMember();
    const login = await request(app).post('/api/auth/login').send({ email: 'member@test.com', password: 'Password123!' });
    const token = login.body.token;

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Guy', email: 'new@test.com', password: 'Password123!', role: 'member' });

    expect(res.status).toBe(403);
  });

  test('admin can create users', async () => {
    await createAdmin();
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'Password123!' });
    const token = login.body.token;

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Guy', email: 'new@test.com', password: 'Password123!', role: 'member' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@test.com');
  });

  test('non-admin cannot delete a lead (403)', async () => {
    const member = await createMember();
    const Lead = require('../src/models/Lead');
    const lead = await Lead.create({ name: 'X', email: 'x@x.com', assignedTo: member._id });

    const login = await request(app).post('/api/auth/login').send({ email: 'member@test.com', password: 'Password123!' });
    const token = login.body.token;

    const res = await request(app).delete(`/api/leads/${lead._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('member cannot access a lead assigned to someone else (403)', async () => {
    const admin = await createAdmin();
    const member = await createMember();
    const Lead = require('../src/models/Lead');
    const otherMember = await User.create({ name: 'Other', email: 'other@test.com', password: 'Password123!', role: 'member' });
    const lead = await Lead.create({ name: 'X', email: 'x@x.com', assignedTo: otherMember._id, createdBy: admin._id });

    const login = await request(app).post('/api/auth/login').send({ email: 'member@test.com', password: 'Password123!' });
    const token = login.body.token;

    const res = await request(app).get(`/api/leads/${lead._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
