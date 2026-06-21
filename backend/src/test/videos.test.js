import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken, db } from './helpers.js';

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

function insertChannel(youtubeId = 'UC123', name = 'Test Channel', { category = 'market', market = 'us' } = {}) {
  db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES (?, ?, ?, ?, ?)").run(youtubeId, name, 'http://rss', category, market);
  return db.prepare('SELECT * FROM channels ORDER BY id DESC LIMIT 1').get();
}

function insertVideo(channelId, youtubeId = 'vid001', title = 'Test Video', { analyzed = true } = {}) {
  db.prepare(`
    INSERT INTO videos (channel_id, youtube_id, title, url, published_at, analysis_status, analyzed_at)
    VALUES (?, ?, ?, ?, '2024-01-01T00:00:00Z', ?, ?)
  `).run(channelId, youtubeId, title, `https://www.youtube.com/watch?v=${youtubeId}`,
    analyzed ? 'done' : 'pending',
    analyzed ? '2024-01-01T00:00:00Z' : null);
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

describe('GET /api/videos — category and market filtering (all-channels query)', () => {
  it('?category=healthy returns only videos from health channels', async () => {
    const mktCh = insertChannel('UCmkt', 'Market Ch', { category: 'market' });
    const hltCh = insertChannel('UChlt', 'Health Ch', { category: 'healthy' });
    insertVideo(mktCh.id, 'vmkt', 'Market Video');
    insertVideo(hltCh.id, 'vhlt', 'Health Video');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get('/api/videos?category=healthy')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(1);
    expect(res.body.videos[0].title).toBe('Health Video');
  });

  it('?category=market returns only videos from market channels', async () => {
    const mktCh = insertChannel('UCmkt2', 'Market Ch2', { category: 'market' });
    const hltCh = insertChannel('UChlt2', 'Health Ch2', { category: 'healthy' });
    insertVideo(mktCh.id, 'vmkt2', 'Market Video 2');
    insertVideo(hltCh.id, 'vhlt2', 'Health Video 2');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get('/api/videos?category=market')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(1);
    expect(res.body.videos[0].title).toBe('Market Video 2');
  });

  it('?category=market&market=india returns only India market videos', async () => {
    const usCh = insertChannel('UCus', 'US Ch', { category: 'market', market: 'us' });
    const inCh = insertChannel('UCin', 'India Ch', { category: 'market', market: 'india' });
    insertVideo(usCh.id, 'vus', 'US Video');
    insertVideo(inCh.id, 'vin', 'India Video');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get('/api/videos?category=market&market=india')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(1);
    expect(res.body.videos[0].title).toBe('India Video');
  });

  it('?category=market&market=us does not return India videos', async () => {
    const usCh = insertChannel('UCus2', 'US Ch2', { category: 'market', market: 'us' });
    const inCh = insertChannel('UCin2', 'India Ch2', { category: 'market', market: 'india' });
    insertVideo(usCh.id, 'vus2', 'US Video 2');
    insertVideo(inCh.id, 'vin2', 'India Video 2');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get('/api/videos?category=market&market=us')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(1);
    expect(res.body.videos[0].title).toBe('US Video 2');
  });

  it('no market param returns videos from all market channels', async () => {
    const usCh = insertChannel('UCus3', 'US Ch3', { category: 'market', market: 'us' });
    const inCh = insertChannel('UCin3', 'India Ch3', { category: 'market', market: 'india' });
    insertVideo(usCh.id, 'vus3', 'US Video 3');
    insertVideo(inCh.id, 'vin3', 'India Video 3');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get('/api/videos?category=market')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(2);
  });
});

describe('GET /api/videos/:id', () => {
  it('returns a single analyzed video by id', async () => {
    const channel = insertChannel();
    const video = insertVideo(channel.id, 'vid_single', 'Single Video');

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get(`/api/videos/${video.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Single Video');
    expect(res.body.channel_name).toBe('Test Channel');
    expect(Array.isArray(res.body.key_points)).toBe(true);
    expect(Array.isArray(res.body.tickers)).toBe(true);
    expect(Array.isArray(res.body.trade_signals)).toBe(true);
  });

  it('returns 404 for a non-existent video id', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get('/api/videos/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for a video that is not yet analyzed', async () => {
    const channel = insertChannel();
    const video = insertVideo(channel.id, 'vid_pending', 'Pending Video', { analyzed: false });

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .get(`/api/videos/${video.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/videos/1');
    expect(res.status).toBe(401);
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
