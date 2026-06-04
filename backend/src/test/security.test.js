import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { resetDB, seedUsers } from './helpers.js';

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

describe('Security headers (helmet)', () => {
  const app = createApp();

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Body size limit', () => {
  const app = createApp();

  it('rejects JSON body larger than 100kb with 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('accepts JSON body under 100kb', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'adminpass' });
    expect(res.status).toBe(200);
  });
});

describe('Rate limiting', () => {
  it('includes RateLimit headers on responses', async () => {
    const app = createApp({ testRateLimits: {} });
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'adminpass' });
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('blocks login after limit is exceeded (429)', async () => {
    const app = createApp({ testRateLimits: { auth: 3 } });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ username: 'admin', password: 'adminpass' });
    }
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'adminpass' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many login attempts/i);
  });

  it('blocks register after limit is exceeded (429)', async () => {
    const app = createApp({ testRateLimits: { register: 2 } });
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/auth/register').send({ username: `user${i}`, password: 'password123' });
    }
    const res = await request(app).post('/api/auth/register').send({ username: 'extra', password: 'password123' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many accounts/i);
  });

  it('blocks summarize after limit is exceeded (429)', async () => {
    const app = createApp({ testRateLimits: { summarize: 3 } });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/summarize').send({ url: 'https://youtube.com/watch?v=test' });
    }
    const res = await request(app).post('/api/summarize').send({ url: 'https://youtube.com/watch?v=test' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/summarize limit/i);
  });
});
