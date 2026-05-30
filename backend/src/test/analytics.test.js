import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken } from './helpers.js';

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

describe('GET /api/analytics', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns analytics summary for admin', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_users');
    expect(res.body).toHaveProperty('visits_today');
    expect(res.body).toHaveProperty('briefs_this_month');
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('reports correct total_users count', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.body.total_users).toBe(2); // admin + viewer seeded
  });

  it('user entries include per-day stats', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    const user = res.body.users[0];
    expect(user).toHaveProperty('visits_per_day');
    expect(user).toHaveProperty('briefs_per_day');
    expect(user).toHaveProperty('total_visits');
    expect(user).toHaveProperty('total_briefs');
  });
});
