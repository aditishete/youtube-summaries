import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken, db } from './helpers.js';

const mockAnalysis = {
  summary: 'Test summary mentioning AAPL and NVDA.',
  keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
  tickers: ['AAPL', 'NVDA'],
  trade_signals: [{ ticker: 'AAPL', signal: 'BUY', reasoning: 'Strong momentum' }],
};

const mockVideos = [
  {
    videoId: 'vid001',
    title: 'Test Video 1',
    description: 'Description 1',
    publishedAt: new Date().toISOString(),
    thumbnail: 'https://i.ytimg.com/vi/vid001/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=vid001',
  },
  {
    videoId: 'vid002',
    title: 'Test Video 2',
    description: 'Description 2',
    publishedAt: new Date().toISOString(),
    thumbnail: 'https://i.ytimg.com/vi/vid002/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=vid002',
  },
];

// Prevent real network calls
vi.mock('../youtube.js', () => ({
  resolveChannelId: vi.fn().mockResolvedValue('UCtest1234567890123456'),
  fetchChannelVideos: vi.fn().mockResolvedValue({ channelName: 'Mock Channel', items: [] }),
}));
vi.mock('../claude.js', () => ({ analyzeVideo: vi.fn() }));
vi.mock('../transcript.js', () => ({ fetchTranscript: vi.fn().mockResolvedValue('Mock transcript text.') }));

import { fetchChannelVideos } from '../youtube.js';
import { analyzeVideo } from '../claude.js';

beforeEach(async () => {
  resetDB();
  await seedUsers();
  vi.clearAllMocks();
  vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [] });
  vi.mocked(analyzeVideo).mockResolvedValue(mockAnalysis);
});

// ── GET /api/channels ─────────────────────────────────────────────────────────

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

  it('?category=healthy returns only health channels', async () => {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category) VALUES ('UCmkt', 'Market Ch', 'http://rss1', 'market')").run();
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category) VALUES ('UChlt', 'Health Ch', 'http://rss2', 'healthy')").run();

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels?category=healthy').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Health Ch');
  });

  it('?category=market returns only market channels', async () => {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category) VALUES ('UCmkt2', 'Market Ch2', 'http://rss3', 'market')").run();
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category) VALUES ('UChlt2', 'Health Ch2', 'http://rss4', 'healthy')").run();

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels?category=market').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Market Ch2');
  });

  it('defaults to category=market when no param given', async () => {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category) VALUES ('UCmkt3', 'Market Ch3', 'http://rss5', 'market')").run();
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category) VALUES ('UChlt3', 'Health Ch3', 'http://rss6', 'healthy')").run();

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.every(c => c.category === 'market')).toBe(true);
  });

  it('?market=india returns only India channels', async () => {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES ('UCus1', 'US Channel', 'http://rss7', 'market', 'us')").run();
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES ('UCin1', 'India Channel', 'http://rss8', 'market', 'india')").run();

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels?category=market&market=india').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('India Channel');
  });

  it('?market=us returns only US channels', async () => {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES ('UCus2', 'US Channel 2', 'http://rss9', 'market', 'us')").run();
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES ('UCin2', 'India Channel 2', 'http://rss10', 'market', 'india')").run();

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels?category=market&market=us').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('US Channel 2');
  });

  it('no market param returns all market channels regardless of market column', async () => {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES ('UCus3', 'US Ch3', 'http://rss11', 'market', 'us')").run();
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, category, market) VALUES ('UCin3', 'India Ch3', 'http://rss12', 'market', 'india')").run();

    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/channels?category=market').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// ── POST /api/channels ────────────────────────────────────────────────────────

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

  it('stores category=healthy when specified', async () => {
    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel', category: 'healthy' });
    expect(res.status).toBe(201);
    const ch = db.prepare('SELECT * FROM channels LIMIT 1').get();
    expect(ch.category).toBe('healthy');
  });

  it('defaults to category=market when not specified', async () => {
    const token = await getToken('admin', 'adminpass');
    await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel' });
    const ch = db.prepare('SELECT * FROM channels LIMIT 1').get();
    expect(ch.category).toBe('market');
  });

  it('stores market=india when specified', async () => {
    const token = await getToken('admin', 'adminpass');
    await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel', market: 'india' });
    const ch = db.prepare('SELECT * FROM channels LIMIT 1').get();
    expect(ch.market).toBe('india');
  });

  it('defaults market to us when not specified', async () => {
    const token = await getToken('admin', 'adminpass');
    await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel' });
    const ch = db.prepare('SELECT * FROM channels LIMIT 1').get();
    expect(ch.market).toBe('us');
  });

  it('saves videos with analysis_status=done and key_points on add', async () => {
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: mockVideos });

    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel' });

    expect(res.status).toBe(201);
    expect(res.body.analyzed).toBe(2);

    const video = db.prepare("SELECT * FROM videos WHERE youtube_id = 'vid001'").get();
    expect(video.analysis_status).toBe('done');
    expect(JSON.parse(video.key_points)).toEqual(mockAnalysis.keyPoints);
    expect(JSON.parse(video.tickers)).toEqual(mockAnalysis.tickers);
    expect(JSON.parse(video.trade_signals)).toEqual(mockAnalysis.trade_signals);
    expect(video.analyzed_at).toBeTruthy();
  });

  it('sets analysis_status=failed when analysis throws on add', async () => {
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });
    vi.mocked(analyzeVideo).mockRejectedValue(new Error('Claude API error'));

    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/@testchannel' });

    expect(res.status).toBe(201);
    expect(res.body.failed).toBe(1);

    const video = db.prepare("SELECT * FROM videos WHERE youtube_id = 'vid001'").get();
    expect(video.analysis_status).toBe('failed');
    expect(video.analyzed_at).toBeNull();
  });
});

// ── DELETE /api/channels/:id ──────────────────────────────────────────────────

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

// ── PATCH /api/channels/:id (resubscribe) ────────────────────────────────────

describe('PATCH /api/channels/:id — resubscribe', () => {
  function insertChannel() {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, subscribed) VALUES ('UCtest1234567890123456', 'Mock Channel', 'http://rss', 0)").run();
    return db.prepare('SELECT * FROM channels LIMIT 1').get();
  }

  it('saves new videos with analysis_status=done and key_points on resubscribe', async () => {
    const channel = insertChannel();
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });

    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .patch(`/api/channels/${channel.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: true });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);

    const video = db.prepare("SELECT * FROM videos WHERE youtube_id = 'vid001'").get();
    expect(video.analysis_status).toBe('done');
    expect(JSON.parse(video.key_points)).toEqual(mockAnalysis.keyPoints);
    expect(JSON.parse(video.tickers)).toEqual(mockAnalysis.tickers);
    expect(video.analyzed_at).toBeTruthy();
  });

  it('sets analysis_status=failed when analysis throws on resubscribe', async () => {
    const channel = insertChannel();
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });
    vi.mocked(analyzeVideo).mockRejectedValue(new Error('Claude timeout'));

    const token = await getToken('admin', 'adminpass');
    await request(app)
      .patch(`/api/channels/${channel.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: true });

    const video = db.prepare("SELECT * FROM videos WHERE youtube_id = 'vid001'").get();
    expect(video.analysis_status).toBe('failed');
  });

  it('skips videos already in DB on resubscribe', async () => {
    const channel = insertChannel();
    db.prepare("INSERT INTO videos (channel_id, youtube_id, title, url, published_at, analysis_status) VALUES (?, 'vid001', 'Existing', 'http://y.com', '2024-01-01', 'done')").run(channel.id);
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });

    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .patch(`/api/channels/${channel.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: true });

    expect(res.body.added).toBe(0);
    expect(vi.mocked(analyzeVideo)).not.toHaveBeenCalled();
  });
});

// ── POST /api/channels/:id/refresh ────────────────────────────────────────────

describe('POST /api/channels/:id/refresh', () => {
  function insertChannel() {
    db.prepare("INSERT INTO channels (youtube_id, name, rss_url, subscribed) VALUES ('UCtest1234567890123456', 'Mock Channel', 'http://rss', 1)").run();
    return db.prepare('SELECT * FROM channels LIMIT 1').get();
  }

  it('saves new videos with analysis_status=done and key_points on refresh', async () => {
    const channel = insertChannel();
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });

    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post(`/api/channels/${channel.id}/refresh`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);

    const video = db.prepare("SELECT * FROM videos WHERE youtube_id = 'vid001'").get();
    expect(video.analysis_status).toBe('done');
    expect(JSON.parse(video.key_points)).toEqual(mockAnalysis.keyPoints);
    expect(JSON.parse(video.tickers)).toEqual(mockAnalysis.tickers);
    expect(video.analyzed_at).toBeTruthy();
  });

  it('sets analysis_status=failed when analysis throws on refresh', async () => {
    const channel = insertChannel();
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });
    vi.mocked(analyzeVideo).mockRejectedValue(new Error('Parse error'));

    const token = await getToken('admin', 'adminpass');
    await request(app)
      .post(`/api/channels/${channel.id}/refresh`)
      .set('Authorization', `Bearer ${token}`);

    const video = db.prepare("SELECT * FROM videos WHERE youtube_id = 'vid001'").get();
    expect(video.analysis_status).toBe('failed');
  });

  it('skips videos already in DB on refresh', async () => {
    const channel = insertChannel();
    db.prepare("INSERT INTO videos (channel_id, youtube_id, title, url, published_at, analysis_status) VALUES (?, 'vid001', 'Existing', 'http://y.com', '2024-01-01', 'done')").run(channel.id);
    vi.mocked(fetchChannelVideos).mockResolvedValue({ channelName: 'Mock Channel', items: [mockVideos[0]] });

    const token = await getToken('admin', 'adminpass');
    const res = await request(app)
      .post(`/api/channels/${channel.id}/refresh`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.added).toBe(0);
    expect(vi.mocked(analyzeVideo)).not.toHaveBeenCalled();
  });
});
