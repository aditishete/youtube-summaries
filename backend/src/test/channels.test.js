import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken, db } from './helpers.js';

// Prevent real network calls
vi.mock('../rss.js', () => ({
  resolveChannelId: vi.fn().mockResolvedValue('UCtest1234567890123456'),
  fetchChannelVideos: vi.fn().mockResolvedValue({ channelName: 'Mock Channel', items: [] }),
}));
vi.mock('../claude.js', () => ({ analyzeVideo: vi.fn() }));
vi.mock('../transcript.js', () => ({ fetchTranscript: vi.fn().mockResolvedValue('') }));

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

describe('GET /api/channels', () => {
  it('returns empty array when no channels exist', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/channels');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/channels', () => {
  it('allows admin to add a channel', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel' });
    expect(res.status).toBe(201);
    expect(res.body.channel.name).toBe('Mock Channel');
  });

  it('rejects viewer from adding a channel', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel' });
    expect(res.status).toBe(403);
  });

  it('rejects missing url', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects duplicate channel', async () => {
    const token = await getToken('admin', 'adminpass');
    await request(app).post('/api/channels').set('Authorization', `Bearer ${token}`).send({ url: 'https://www.youtube.com/@testchannel' });
    const res = await request(app).post('/api/channels').set('Authorization', `Bearer ${token}`).send({ url: 'https://www.youtube.com/@testchannel' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/channels/:id', () => {
  it('allows admin to delete a channel', async () => {
    const token = await getToken('admin', 'adminpass');
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url) VALUES ('UC123', 'Test', 'http://rss')").run();
    const channel = db.prepare('SELECT * FROM channels LIMIT 1').get();
    const res = await request(app).delete(`/api/channels/${channel.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(db.prepare('SELECT * FROM channels WHERE id = ?').get(channel.id)).toBeFalsy();
  });

  it('rejects viewer from deleting', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).delete('/api/channels/1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
