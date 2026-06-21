import { Router } from 'express';
import db from '../db.js';
import { analyzeVideo } from '../claude.js';
import { fetchTranscript } from '../transcript.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/videos
// Query params: channel_id, limit (default 50), offset (default 0)
router.get('/', requireAuth, (req, res) => {
  try {
    if (req.query.auto !== '1') {
      db.prepare('INSERT INTO user_video_requests (user_id) VALUES (?)').run(req.user.id);
    }

    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const channelId = req.query.channel_id ? parseInt(req.query.channel_id, 10) : null;

    let rows, total;

    if (channelId) {
      // Single channel: return successfully analyzed videos paginated
      const { count } = db.prepare("SELECT COUNT(*) as count FROM videos WHERE channel_id = ? AND analysis_status = 'done'").get(channelId);
      total = count;
      rows = db.prepare(`
        SELECT v.*, c.name AS channel_name
        FROM videos v JOIN channels c ON c.id = v.channel_id
        WHERE v.channel_id = ? AND v.analysis_status = 'done'
        ORDER BY v.published_at DESC
        LIMIT ? OFFSET ?
      `).all(channelId, limit, offset);
    } else {
      // All channels: top 3 analyzed videos per channel, deduped by title, filtered by category + market
      const category = req.query.category || 'market';
      const market = req.query.market || null;
      const chanFilter = market
        ? 'AND channel_id IN (SELECT id FROM channels WHERE category = ? AND market = ?)'
        : 'AND channel_id IN (SELECT id FROM channels WHERE category = ?)';
      const chanParams = market ? [category, market] : [category];
      rows = db.prepare(`
        SELECT v.*, c.name AS channel_name
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY published_at DESC) AS rn
          FROM (
            SELECT *,
              ROW_NUMBER() OVER (PARTITION BY channel_id, title ORDER BY published_at DESC) AS title_rn
            FROM videos
            WHERE analysis_status = 'done'
              ${chanFilter}
          ) deduped
          WHERE title_rn = 1
        ) v
        JOIN channels c ON c.id = v.channel_id
        WHERE v.rn <= 3
        ORDER BY v.published_at DESC
      `).all(chanParams);
      total = rows.length;
    }

    // Parse JSON fields
    const videos = rows.map((row) => ({
      ...row,
      key_points:   (() => { try { return JSON.parse(row.key_points   || '[]'); } catch { return []; } })(),
      tickers:      (() => { try { return JSON.parse(row.tickers      || '[]'); } catch { return []; } })(),
      trade_signals:(() => { try { return JSON.parse(row.trade_signals|| '[]'); } catch { return []; } })(),
    }));

    res.json({ videos, total });
  } catch (err) {
    console.error('GET /videos error:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// GET /api/videos/:id — fetch a single video by internal id
router.get('/:id', requireAuth, (req, res) => {
  try {
    const row = db.prepare(`
      SELECT v.*, c.name AS channel_name
      FROM videos v JOIN channels c ON c.id = v.channel_id
      WHERE v.id = ? AND v.analysis_status = 'done'
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Video not found' });
    res.json({
      ...row,
      key_points:    (() => { try { return JSON.parse(row.key_points    || '[]'); } catch { return []; } })(),
      tickers:       (() => { try { return JSON.parse(row.tickers       || '[]'); } catch { return []; } })(),
      trade_signals: (() => { try { return JSON.parse(row.trade_signals || '[]'); } catch { return []; } })(),
    });
  } catch (err) {
    console.error('GET /videos/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// POST /api/videos/:id/reanalyze — re-run Claude on a single video using its transcript
router.post('/:id/reanalyze', requireAdmin, async (req, res) => {
  try {
    const row = db.prepare(`
      SELECT v.*, c.name AS channel_name
      FROM videos v JOIN channels c ON c.id = v.channel_id
      WHERE v.id = ?
    `).get(req.params.id);

    if (!row) return res.status(404).json({ error: 'Video not found' });

    // Reset to pending so this run counts as the authoritative attempt
    db.prepare("UPDATE videos SET analysis_status = 'pending' WHERE id = ?").run(row.id);

    const transcript = await fetchTranscript(row.youtube_id);
    const analysis = await analyzeVideo(
      { title: row.title, description: row.description, transcript, published_at: row.published_at },
      row.channel_name
    );

    db.prepare(`
      UPDATE videos SET summary = ?, key_points = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP, analysis_status = 'done'
      WHERE id = ?
    `).run(analysis.summary, JSON.stringify(analysis.keyPoints || []), JSON.stringify(analysis.tickers), JSON.stringify(analysis.trade_signals), row.id);
    db.prepare('INSERT INTO action_log (user_id, action, target) VALUES (?, ?, ?)').run(req.user.id, 'reanalyze_video', row.title);

    res.json({
      summary:      analysis.summary,
      key_points:   analysis.keyPoints || [],
      tickers:      analysis.tickers,
      trade_signals: analysis.trade_signals,
      analyzed_at:  new Date().toISOString(),
      had_transcript: !!transcript,
    });
  } catch (err) {
    // Mark failed if the video record exists and analysis errored out
    try {
      db.prepare("UPDATE videos SET analysis_status = 'failed' WHERE id = ? AND analysis_status = 'pending'").run(req.params.id);
    } catch (_) {}
    console.error('POST /videos/:id/reanalyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/videos/:id
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Video not found' });
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /videos/:id error:', err);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

export default router;
