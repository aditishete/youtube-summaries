import { Router } from 'express';
import { randomUUID } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { fetchTranscript } from '../transcript.js';
import { requireAuth } from '../middleware/auth.js';
import db from '../db.js';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Config ────────────────────────────────────────────────────────────────────
const BRIEF_INLINE_TIMEOUT_MS = parseInt(process.env.BRIEF_INLINE_TIMEOUT_MS || '60000', 10);
const BRIEF_JOB_TTL_MINUTES   = parseInt(process.env.BRIEF_JOB_TTL_MINUTES   || '10',    10);

// ── Logging ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir   = process.env.DB_PATH ? dirname(process.env.DB_PATH) : join(__dirname, '../../data');
const logPath   = join(dataDir, 'videobriefs.log');
mkdirSync(dataDir, { recursive: true });

function briefLog(jobId, userId, url, phase, error) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), jobId, userId, url, phase, error });
  try { appendFileSync(logPath, entry + '\n'); } catch (_) {}
  console.error(`[VideoBrief] job=${jobId} phase=${phase}: ${error}`);
  // Write to DB for observability — every analysis failure (not inline-timeout promotions)
  try {
    db.prepare('INSERT INTO video_brief_errors (user_id, url, phase, error) VALUES (?, ?, ?, ?)').run(userId, url, phase, error);
  } catch (_) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Core job runner ───────────────────────────────────────────────────────────
// Always resolves — never rejects. Returns { ok, result } or { ok, error }.
async function runSummarizeJob(jobId, userId, url, videoId) {
  try {
    // Phase: transcript
    let transcript;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (err) {
      briefLog(jobId, userId, url, 'transcript', err.message);
      await markJobFailed(jobId, 'Failed to fetch transcript.');
      return { ok: false, error: 'Failed to fetch transcript.' };
    }
    if (!transcript) {
      briefLog(jobId, userId, url, 'transcript', 'No transcript available');
      await markJobFailed(jobId, 'No transcript available for this video. It may be private, age-restricted, or have captions disabled.');
      return { ok: false, error: 'No transcript available for this video. It may be private, age-restricted, or have captions disabled.' };
    }

    // Phase: metadata
    const [{ title, thumbnail }, published_at] = await Promise.all([
      fetchVideoMeta(videoId),
      fetchVideoPublishedAt(videoId),
    ]);

    // Phase: AI summarization
    let aiResponse;
    try {
      aiResponse = await client.messages.create({
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
${transcript.slice(0, 24000)}

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
- summary: plain English, concise, covers the main topic; mention the key stocks or positions the speaker discusses
- keyPoints: 5-8 most important takeaways, including any specific stocks, trades, or price targets the speaker highlights
- tickers: every stock/ETF/crypto mentioned by ticker symbol OR company name — resolve company names to their correct exchange-listed ticker (e.g. "Vertiv" → "VRT", "Nvidia" → "NVDA", "Micron" → "MU", "Coherent" → "COHR", "Marvell" → "MRVL"); include all even if briefly mentioned
- speakers sometimes state the wrong ticker symbol for a company — if a company name and a ticker conflict, trust the company name and use the correct ticker (e.g. speaker says "ticker COR" but refers to Coherent → use "COHR", not "COR")
- trade_signals: only when the speaker makes a clear directional call; signal must be BUY, SELL, WATCH, or HOLD (empty array if none)
- Options signal mapping (critical — do not confuse "sold" with SELL):
  * Sold puts / buying calls / bull call spread = BUY (bullish)
  * Bought puts / sold calls / bear put spread = SELL (bearish)
  * "Sold puts on AAPL" → { ticker: "AAPL", signal: "BUY", reasoning: "sold puts — bullish, willing to own at strike" }
- Only emit a signal when the speaker makes a real directional commitment, not just a mention
- recommendations: 3-5 specific, actionable things the viewer should do based on this video — only for self-help, health, diet, fitness, productivity, or lifestyle videos; empty array for investment/finance videos or videos with no actionable viewer advice
- Write in English regardless of the transcript language`,
          },
        ],
      });
    } catch (err) {
      briefLog(jobId, userId, url, 'ai', err.message);
      await markJobFailed(jobId, 'AI summarization failed.');
      return { ok: false, error: 'AI summarization failed.' };
    }

    // Phase: parse AI response
    const text = aiResponse.content?.[0]?.text || '';
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    const cleaned = start !== -1 && end !== -1 ? text.slice(start, end + 1) : text.trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      briefLog(jobId, userId, url, 'parse', `Bad JSON from AI: ${text.slice(0, 200)}`);
      await markJobFailed(jobId, 'Failed to parse AI response.');
      return { ok: false, error: 'Failed to parse AI response.' };
    }

    const result = {
      videoId,
      title,
      thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      published_at: published_at || null,
      summary:         parsed.summary      || '',
      keyPoints:       Array.isArray(parsed.keyPoints)     ? parsed.keyPoints     : [],
      tickers:         Array.isArray(parsed.tickers)       ? parsed.tickers       : [],
      trade_signals:   Array.isArray(parsed.trade_signals) ? parsed.trade_signals : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };

    // Persist to user_summaries
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO user_summaries (user_id, youtube_id, title, thumbnail, url, published_at, summary, key_points, tickers, trade_signals, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, result.videoId, result.title, result.thumbnail, result.url, result.published_at,
      result.summary, JSON.stringify(result.keyPoints), JSON.stringify(result.tickers),
      JSON.stringify(result.trade_signals), JSON.stringify(result.recommendations)
    );

    db.prepare(`
      DELETE FROM user_summaries
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM user_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
      )
    `).run(userId, userId);

    db.prepare('INSERT INTO action_log (user_id, action, target) VALUES (?, ?, ?)')
      .run(userId, 'summarize_video', result.title || result.url);

    const fullResult = { ...result, id: lastInsertRowid };

    // Update DB job record if one was written (async path)
    const existing = db.prepare('SELECT id FROM summary_jobs WHERE id = ?').get(jobId);
    if (existing) {
      db.prepare(`
        UPDATE summary_jobs SET status='done', result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(JSON.stringify(fullResult), jobId);
    }

    return { ok: true, result: fullResult };

  } catch (err) {
    briefLog(jobId, userId, url, 'unexpected', err.message);
    await markJobFailed(jobId, 'Unexpected error during summarization.');
    return { ok: false, error: 'Unexpected error during summarization.' };
  }
}

function markJobFailed(jobId, error) {
  try {
    const existing = db.prepare('SELECT id FROM summary_jobs WHERE id = ?').get(jobId);
    if (existing) {
      db.prepare(`
        UPDATE summary_jobs SET status='failed', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(error, jobId);
    }
  } catch (_) {}
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/summarize
router.post('/', requireAuth, async (req, res) => {
  if (req.user.guestMode) {
    return res.status(403).json({ error: 'Video briefs are not available in guest mode. Please register for an account.' });
  }
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  const videoId = extractVideoId(url.trim());
  if (!videoId) return res.status(400).json({ error: 'Could not extract a video ID from that URL.' });

  // Prune expired jobs
  const cutoff = new Date(Date.now() - BRIEF_JOB_TTL_MINUTES * 60 * 1000).toISOString();
  db.prepare('DELETE FROM summary_jobs WHERE created_at < ?').run(cutoff);

  const jobId = randomUUID();

  const jobPromise = runSummarizeJob(jobId, req.user.id, url.trim(), videoId);

  const winner = await Promise.race([
    jobPromise,
    new Promise(resolve => setTimeout(() => resolve(null), BRIEF_INLINE_TIMEOUT_MS)),
  ]);

  if (winner === null) {
    // Job is still running — persist to DB and tell frontend to poll (not an error)
    db.prepare('INSERT INTO summary_jobs (id, user_id, url, status) VALUES (?, ?, ?, ?)').run(jobId, req.user.id, url.trim(), 'pending');
    // Ensure any late rejection is caught so it doesn't become an unhandled promise rejection
    jobPromise.catch(err => briefLog(jobId, req.user.id, url.trim(), 'unexpected', err.message));
    return res.json({ status: 'pending', jobId });
  }

  if (winner.ok) return res.json({ status: 'done', result: winner.result });
  return res.json({ status: 'failed', error: winner.error });
});

// GET /api/summarize/status/:jobId
router.get('/status/:jobId', requireAuth, (req, res) => {
  const job = db.prepare('SELECT * FROM summary_jobs WHERE id = ? AND user_id = ?').get(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.status === 'pending') return res.json({ status: 'pending' });
  if (job.status === 'done') return res.json({ status: 'done', result: JSON.parse(job.result) });
  return res.json({ status: 'failed', error: job.error || 'Summarization failed.' });
});

// GET /api/summarize/history
router.get('/history', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM user_summaries
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.user.id);

  const history = rows.map((r) => ({
    ...r,
    keyPoints:       (() => { try { return JSON.parse(r.key_points   || '[]'); } catch { return []; } })(),
    tickers:         (() => { try { return JSON.parse(r.tickers       || '[]'); } catch { return []; } })(),
    trade_signals:   (() => { try { return JSON.parse(r.trade_signals || '[]'); } catch { return []; } })(),
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
