import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fetchTranscript } from '../transcript.js';
import { requireAuth } from '../middleware/auth.js';
import db from '../db.js';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function fetchVideoMeta(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) return { title: '', thumbnail: '', published_at: null };
    const data = await res.json();
    return { title: data.title || '', thumbnail: data.thumbnail_url || '', published_at: null };
  } catch {
    return { title: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, published_at: null };
  }
}

async function fetchVideoPublishedAt(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'en-US', 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const match = html.match(/"publishDate"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// POST /api/summarize
router.post('/', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  const videoId = extractVideoId(url.trim());
  if (!videoId) return res.status(400).json({ error: 'Could not extract a video ID from that URL.' });

  const transcript = await fetchTranscript(videoId);
  if (!transcript) return res.status(422).json({ error: 'No transcript available for this video. It may be private, age-restricted, or have captions disabled.' });

  const [{ title, thumbnail }, published_at] = await Promise.all([
    fetchVideoMeta(videoId),
    fetchVideoPublishedAt(videoId),
  ]);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: 'You summarize YouTube video transcripts clearly and concisely in English.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Summarize this YouTube video transcript.

Title: ${title || 'Unknown'}
Transcript:
${transcript.slice(0, 14000)}

Respond with ONLY a JSON object, no markdown fences:
{
  "summary": "3-5 sentence overall summary of the video",
  "keyPoints": ["Key point 1", "Key point 2"],
  "tickers": ["AAPL", "BTC"],
  "trade_signals": [
    { "ticker": "AAPL", "signal": "BUY", "reasoning": "reason under 120 chars" }
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"]
}

Rules:
- summary: plain English, concise, covers the main topic
- keyPoints: 5-8 most important takeaways from the video
- tickers: every stock/ETF/crypto symbol explicitly mentioned (empty array if none)
- trade_signals: only when the speaker makes a clear directional call; signal must be BUY, SELL, WATCH, or HOLD (empty array if none)
- recommendations: 3-5 specific, actionable things the viewer should do based on this video — only for self-help, health, diet, fitness, productivity, or lifestyle videos; empty array for investment/finance videos or videos with no actionable viewer advice
- Write in English regardless of the transcript language`,
        },
      ],
    });

    const text = response.content?.[0]?.text || '';

    // Extract the JSON object robustly — find the first { and last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const cleaned = start !== -1 && end !== -1 ? text.slice(start, end + 1) : text.trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI response. Raw text:', text.slice(0, 500));
      return res.status(500).json({ error: 'Failed to parse AI response.' });
    }

    const result = {
      videoId,
      title,
      thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      published_at: published_at || null,
      summary: parsed.summary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      tickers: Array.isArray(parsed.tickers) ? parsed.tickers : [],
      trade_signals: Array.isArray(parsed.trade_signals) ? parsed.trade_signals : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };

    // Save to history and prune to last 20 for this user
    db.prepare(`
      INSERT INTO user_summaries (user_id, youtube_id, title, thumbnail, url, published_at, summary, key_points, tickers, trade_signals, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, result.videoId, result.title, result.thumbnail, result.url, result.published_at, result.summary, JSON.stringify(result.keyPoints), JSON.stringify(result.tickers), JSON.stringify(result.trade_signals), JSON.stringify(result.recommendations));

    db.prepare(`
      DELETE FROM user_summaries
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM user_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
      )
    `).run(req.user.id, req.user.id);

    res.json(result);
  } catch (err) {
    console.error('Summarize error:', err.message);
    res.status(500).json({ error: 'AI summarization failed.' });
  }
});

// GET /api/summarize/history — last 20 summaries for the logged-in user
router.get('/history', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM user_summaries
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.user.id);

  const history = rows.map((r) => ({
    ...r,
    keyPoints: (() => { try { return JSON.parse(r.key_points || '[]'); } catch { return []; } })(),
    tickers: (() => { try { return JSON.parse(r.tickers || '[]'); } catch { return []; } })(),
    trade_signals: (() => { try { return JSON.parse(r.trade_signals || '[]'); } catch { return []; } })(),
    recommendations: (() => { try { return JSON.parse(r.recommendations || '[]'); } catch { return []; } })(),
    published_at: r.published_at || null,
  }));

  res.json({ history });
});

// DELETE /api/summarize/history/:id
router.delete('/history/:id', requireAuth, (req, res) => {
  const result = db.prepare(
    'DELETE FROM user_summaries WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
