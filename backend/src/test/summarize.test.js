import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, resetDB, seedUsers, getToken } from './helpers.js';

vi.mock('../transcript.js', () => ({
  fetchTranscript: vi.fn().mockResolvedValue('This is a test transcript.'),
}));

// Mock the Anthropic SDK used directly in summarize.js
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ text: '{"summary":"Test summary.","keyPoints":["Point 1","Point 2"]}' }],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

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
    expect(res.body.summary).toBe('Test summary.');
    expect(res.body.keyPoints).toEqual(['Point 1', 'Point 2']);
    expect(res.body.videoId).toBe('dQw4w9WgXcQ');
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
});
