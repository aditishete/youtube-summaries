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

    let whereClause = '';
    const params = [];

    if (channelId) {
      whereClause = 'WHERE v.channel_id = ?';
      params.push(channelId);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM videos v
      ${whereClause}
    `;
    const { total } = db.prepare(countQuery).get(...params);

    // Get paginated videos joined with channel name
    const videosQuery = `
      SELECT
        v.*,
        c.name AS channel_name
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      ${whereClause}
      ORDER BY v.published_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(videosQuery).all(...params, limit, offset);

    // Parse JSON fields
    const videos = rows.map((row) => ({
      ...row,
      tickers: (() => {
        try { return JSON.parse(row.tickers || '[]'); } catch { return []; }
      })(),
      trade_signals: (() => {
        try { return JSON.parse(row.trade_signals || '[]'); } catch { return []; }
      })(),
    }));

    res.json({ videos, total });
  } catch (err) {
    console.error('GET /videos error:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
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

    const transcript = await fetchTranscript(row.youtube_id);
    const analysis = await analyzeVideo(
      { title: row.title, description: row.description, transcript, published_at: row.published_at },
      row.channel_name
    );

    db.prepare(`
      UPDATE videos SET summary = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(analysis.summary, JSON.stringify(analysis.tickers), JSON.stringify(analysis.trade_signals), row.id);

    res.json({
      ...analysis,
      analyzed_at: new Date().toISOString(),
      had_transcript: transcript.length > 0,
    });
  } catch (err) {
    console.error('POST /videos/:id/reanalyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/videos/:id
router.delete('/:id', requireAuth, (req, res) => {
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
