import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken, db } from './helpers.js';

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

function insertChannel(youtubeId = 'UC123', name = 'Test Channel') {
  db.prepare("INSERT INTO channels (youtube_id, name, rss_url) VALUES (?, ?, ?)").run(youtubeId, name, 'http://rss');
  return db.prepare('SELECT * FROM channels ORDER BY id DESC LIMIT 1').get();
}

function insertVideo(channelId, youtubeId = 'vid001', title = 'Test Video') {
  db.prepare(`
    INSERT INTO videos (channel_id, youtube_id, title, url, published_at)
    VALUES (?, ?, ?, ?, '2024-01-01T00:00:00Z')
  `).run(channelId, youtubeId, title, `https://www.youtube.com/watch?v=${youtubeId}`);
  return db.prepare('SELECT * FROM videos ORDER BY id DESC LIMIT 1').get();
}

describe('GET /api/videos', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/videos');
    expect(res.status).toBe(401);
  });

  it('returns empty list when no videos exist', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/videos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.videos).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns videos for authenticated user', async () => {
    const channel = insertChannel();
    insertVideo(channel.id, 'vid001', 'Video One');
    insertVideo(channel.id, 'vid002', 'Video Two');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/videos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.videos).toHaveLength(2);
    expect(res.body.videos[0].channel_name).toBe('Test Channel');
  });

  it('filters by channel_id', async () => {
    const ch1 = insertChannel('UC111', 'Channel One');
    const ch2 = insertChannel('UC222', 'Channel Two');
    insertVideo(ch1.id, 'v1', 'Ch1 Video');
    insertVideo(ch2.id, 'v2', 'Ch2 Video');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get(`/api/videos?channel_id=${ch1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.videos[0].title).toBe('Ch1 Video');
  });

  it('respects limit and offset pagination for single channel', async () => {
    const channel = insertChannel();
    for (let i = 1; i <= 5; i++) insertVideo(channel.id, `v00${i}`, `Video ${i}`);

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get(`/api/videos?channel_id=${channel.id}&limit=2&offset=0`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(2);
    expect(res.body.total).toBe(5);
  });

  it('records a user_video_request on normal fetch', async () => {
    const token = await getToken('viewer', 'viewerpass');
    await request(app).get('/api/videos').set('Authorization', `Bearer ${token}`);

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('viewer');
    const count = db.prepare('SELECT count(*) as c FROM user_video_requests WHERE user_id = ?').get(user.id).c;
    expect(count).toBe(1);
  });

  it('does not record a user_video_request when auto=1', async () => {
    const token = await getToken('viewer', 'viewerpass');
    await request(app).get('/api/videos?auto=1').set('Authorization', `Bearer ${token}`);

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('viewer');
    const count = db.prepare('SELECT count(*) as c FROM user_video_requests WHERE user_id = ?').get(user.id).c;
    expect(count).toBe(0);
  });
});

describe('DELETE /api/videos/:id', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).delete('/api/videos/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent video', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app).delete('/api/videos/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('deletes an existing video', async () => {
    const channel = insertChannel();
    const video = insertVideo(channel.id, 'vid001', 'To Delete');

    const token = await getToken('admin', 'adminpass');
    const res = await request(app).delete(`/api/videos/${video.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const check = db.prepare('SELECT id FROM videos WHERE id = ?').get(video.id);
    expect(check).toBeNull();
  });
});
