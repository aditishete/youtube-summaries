import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken, db } from './helpers.js';

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
    expect(res.body).toHaveProperty('briefs_this_month');
    expect(res.body).toHaveProperty('logins_today');
    expect(res.body).toHaveProperty('logins_week');
    expect(res.body).toHaveProperty('logins_month');
    expect(res.body).toHaveProperty('landing_views');
    expect(res.body).toHaveProperty('market_brief_views');
    expect(res.body).toHaveProperty('video_in_brief_views');
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('reports correct total_users count', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.body.total_users).toBe(2); // admin + viewer seeded
  });

  it('user entries include per-day stats and login counts', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    const user = res.body.users[0];
    expect(user).toHaveProperty('logins_per_day');
    expect(user).toHaveProperty('briefs_per_day');
    expect(user).toHaveProperty('total_logins');
    expect(user).toHaveProperty('total_briefs');
    expect(user).toHaveProperty('logins_today');
    expect(user).toHaveProperty('logins_week');
    expect(user).toHaveProperty('logins_month');
  });

  it('user entries include per-page view breakdown', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    const user = res.body.users[0];
    expect(user).toHaveProperty('landing_today');
    expect(user).toHaveProperty('landing_week');
    expect(user).toHaveProperty('landing_month');
    expect(user).toHaveProperty('market_today');
    expect(user).toHaveProperty('market_week');
    expect(user).toHaveProperty('market_month');
    expect(user).toHaveProperty('vib_today');
    expect(user).toHaveProperty('vib_week');
    expect(user).toHaveProperty('vib_month');
  });

  it('logins_today increments when user logs in', async () => {
    await getToken('viewer', 'viewerpass');
    const adminToken = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${adminToken}`);
    const viewerEntry = res.body.users.find((u) => u.username === 'viewer');
    expect(viewerEntry.logins_today).toBeGreaterThanOrEqual(1);
  });

  it('page view counts are structured with today/week/month', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.body.landing_views).toHaveProperty('today');
    expect(res.body.landing_views).toHaveProperty('week');
    expect(res.body.landing_views).toHaveProperty('month');
  });
});

describe('POST /api/analytics/pageview', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/analytics/pageview').send({ page: 'landing' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid page', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/analytics/pageview')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 'unknown_page' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when page is missing', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/analytics/pageview')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('records a page view for valid page', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/analytics/pageview')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 'landing' });
    expect(res.status).toBe(204);

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('viewer');
    const count = db.prepare('SELECT count(*) as c FROM user_page_views WHERE user_id = ? AND page = ?').get(user.id, 'landing').c;
    expect(count).toBe(1);
  });

  it('does not double-record within 30 minutes', async () => {
    const token = await getToken('viewer', 'viewerpass');
    await request(app)
      .post('/api/analytics/pageview')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 'market_brief' });
    await request(app)
      .post('/api/analytics/pageview')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 'market_brief' });

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('viewer');
    const count = db.prepare('SELECT count(*) as c FROM user_page_views WHERE user_id = ? AND page = ?').get(user.id, 'market_brief').c;
    expect(count).toBe(1);
  });

  it('accepts all valid page values', async () => {
    const token = await getToken('viewer', 'viewerpass');
    for (const page of ['landing', 'market_brief', 'video_in_brief']) {
      const res = await request(app)
        .post('/api/analytics/pageview')
        .set('Authorization', `Bearer ${token}`)
        .send({ page });
      expect(res.status).toBe(204);
    }
  });
});

describe('GET /api/analytics/timeseries', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/timeseries');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/analytics/timeseries').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns timeseries data for admin with default period', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics/timeseries').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('period', 'week');
    expect(res.body).toHaveProperty('labelFmt');
    expect(res.body).toHaveProperty('logins');
    expect(res.body).toHaveProperty('market_brief_requests');
    expect(res.body).toHaveProperty('briefs_generated');
    expect(res.body).toHaveProperty('landing_views');
    expect(res.body).toHaveProperty('market_brief_views');
    expect(res.body).toHaveProperty('video_in_brief_views');
    expect(Array.isArray(res.body.logins)).toBe(true);
  });

  it('returns today period with hour labelFmt', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics/timeseries?period=today').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('today');
    expect(res.body.labelFmt).toBe('hour');
  });

  it('returns month period with day labelFmt', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).get('/api/analytics/timeseries?period=month').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('month');
    expect(res.body.labelFmt).toBe('day');
  });
});
