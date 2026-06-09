import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken, db } from './helpers.js';

vi.mock('../transcript.js', () => ({
  fetchTranscript: vi.fn().mockResolvedValue('This is a test transcript.'),
}));

// Mock the Anthropic SDK used directly in summarize.js
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{
      text: JSON.stringify({
        summary: 'Test summary.',
        keyPoints: ['Point 1', 'Point 2'],
        tickers: ['AAPL'],
        trade_signals: [{ ticker: 'AAPL', signal: 'BUY', reasoning: 'Strong momentum' }],
        recommendations: [],
      }),
    }],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// Mock fetch so summarize.js doesn't make real HTTP calls for video metadata
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ title: 'Test Video', thumbnail_url: 'https://example.com/thumb.jpg' }),
  text: async () => '"publishDate":"2024-01-15"',
}));

beforeEach(async () => {
  resetDB();
  await seedUsers();
});

describe('GET /api/summarize/history', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/summarize/history');
    expect(res.status).toBe(401);
  });

  it('returns empty history for new user', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app).get('/api/summarize/history').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });
});

describe('POST /api/summarize', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/summarize').send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when url is missing', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid YouTube URL', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/not-a-video' });
    expect(res.status).toBe(400);
  });

  it('returns summary for valid YouTube URL', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.result.summary).toBe('Test summary.');
    expect(res.body.result.keyPoints).toEqual(['Point 1', 'Point 2']);
    expect(res.body.result.videoId).toBe('dQw4w9WgXcQ');
  });

  it('returns tickers and trade_signals in response', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(Array.isArray(res.body.result.tickers)).toBe(true);
    expect(Array.isArray(res.body.result.trade_signals)).toBe(true);
    expect(Array.isArray(res.body.result.recommendations)).toBe(true);
    expect(res.body.result.tickers).toContain('AAPL');
    expect(res.body.result.trade_signals[0].signal).toBe('BUY');
  });

  it('returns published_at in response', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.result).toHaveProperty('published_at');
  });

  it('saves summary to history', async () => {
    const token = await getToken('viewer', 'viewerpass');
    await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    const histRes = await request(app)
      .get('/api/summarize/history')
      .set('Authorization', `Bearer ${token}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.history).toHaveLength(1);
    expect(histRes.body.history[0].summary).toBe('Test summary.');
  });

  it('history entries include tickers and trade_signals', async () => {
    const token = await getToken('viewer', 'viewerpass');
    await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    const histRes = await request(app)
      .get('/api/summarize/history')
      .set('Authorization', `Bearer ${token}`);
    const entry = histRes.body.history[0];
    expect(Array.isArray(entry.tickers)).toBe(true);
    expect(Array.isArray(entry.trade_signals)).toBe(true);
    expect(Array.isArray(entry.recommendations)).toBe(true);
  });
});

describe('DELETE /api/summarize/history/:id', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).delete('/api/summarize/history/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent history entry', async () => {
    const token = await getToken('viewer', 'viewerpass');
    const res = await request(app)
      .delete('/api/summarize/history/9999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('deletes an existing history entry', async () => {
    const token = await getToken('viewer', 'viewerpass');
    await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    const histRes = await request(app)
      .get('/api/summarize/history')
      .set('Authorization', `Bearer ${token}`);
    const entryId = histRes.body.history[0].id;

    const delRes = await request(app)
      .delete(`/api/summarize/history/${entryId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    const afterRes = await request(app)
      .get('/api/summarize/history')
      .set('Authorization', `Bearer ${token}`);
    expect(afterRes.body.history).toHaveLength(0);
  });

  it('cannot delete another user\'s history entry', async () => {
    const viewerToken = await getToken('viewer', 'viewerpass');
    await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    const histRes = await request(app)
      .get('/api/summarize/history')
      .set('Authorization', `Bearer ${viewerToken}`);
    const entryId = histRes.body.history[0].id;

    const adminToken = await getToken('admin', 'adminpass');
    const delRes = await request(app)
      .delete(`/api/summarize/history/${entryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(404);
  });
});
