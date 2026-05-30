import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers } from './helpers.js';

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

describe('POST /api/auth/register', () => {
  it('creates a new viewer account and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'newuser', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('newuser');
    expect(res.body.user.role).toBe('viewer');
  });

  it('rejects a duplicate username', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'viewer', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects a username shorter than 3 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'ab', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('rejects a password shorter than 6 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'newuser', password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'adminpass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown username', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with a valid token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'viewer', password: 'viewerpass' });
    const token = loginRes.body.token;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('viewer');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
