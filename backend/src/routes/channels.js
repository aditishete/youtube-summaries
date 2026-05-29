import { Router } from 'express';
import db from '../db.js';
import { resolveChannelId, fetchChannelVideos } from '../rss.js';
import { analyzeVideo } from '../claude.js';
import { fetchTranscript } from '../transcript.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/channels — list all channels with video counts
router.get('/', requireAuth, (req, res) => {
  try {
    const channels = db
      .prepare(`
        SELECT
          c.*,
          COUNT(v.id) AS video_count
        FROM channels c
        LEFT JOIN videos v ON v.channel_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `)
      .all();

    res.json(channels);
  } catch (err) {
    console.error('GET /channels error:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// POST /api/channels — add a new channel
router.post('/', requireAdmin, async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string' || url.trim() === '') {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    // Resolve to a channel ID
    const channelId = await resolveChannelId(url.trim());

    // Check if already exists
    const existing = db.prepare('SELECT * FROM channels WHERE youtube_id = ?').get(channelId);
    if (existing) {
      return res.status(409).json({ error: 'Channel already added' });
    }

    // Fetch channel info and initial videos
    const { channelName, items } = await fetchChannelVideos(channelId, 5);

    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    // Insert channel
    const insertChannel = db.prepare(`
      INSERT INTO channels (youtube_id, name, rss_url, last_fetched_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const channelResult = insertChannel.run(channelId, channelName, rssUrl);
    const newChannelId = channelResult.lastInsertRowid;

    // Fetch the inserted channel row
    const channelRow = db.prepare('SELECT * FROM channels WHERE id = ?').get(newChannelId);

    // Insert and analyze each video
    const insertedVideos = [];

    for (const item of items) {
      try {
        const insertVideo = db.prepare(`
          INSERT OR IGNORE INTO videos (channel_id, youtube_id, title, description, url, thumbnail_url, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const videoResult = insertVideo.run(
          newChannelId,
          item.videoId,
          item.title,
          item.description || '',
          item.url,
          item.thumbnail,
          item.publishedAt
        );

        if (videoResult.changes === 0) continue; // Already existed

        const videoRowId = videoResult.lastInsertRowid;

        // Analyze with Claude (use transcript for richer content)
        const transcript = await fetchTranscript(item.videoId);
        const analysis = await analyzeVideo(
          {
            title: item.title,
            description: item.description,
            transcript,
            published_at: item.publishedAt,
          },
          channelName
        );

        db.prepare(`
          UPDATE videos
          SET summary = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          analysis.summary,
          JSON.stringify(analysis.tickers),
          JSON.stringify(analysis.trade_signals),
          videoRowId
        );

        const videoRow = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoRowId);
        insertedVideos.push({
          ...videoRow,
          tickers: JSON.parse(videoRow.tickers || '[]'),
          trade_signals: JSON.parse(videoRow.trade_signals || '[]'),
        });
      } catch (videoErr) {
        console.error(`Error processing video ${item.videoId}:`, videoErr.message);
      }
    }

    // Update last_fetched_at
    db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      newChannelId
    );

    return res.status(201).json({ channel: channelRow, videos: insertedVideos });
  } catch (err) {
    console.error('POST /channels error:', err);
    res.status(500).json({ error: err.message || 'Failed to add channel' });
  }
});

// DELETE /api/channels/:id
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /channels/:id error:', err);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// POST /api/channels/:id/refresh — manually refresh a channel
router.post('/:id/refresh', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const { channelName, items } = await fetchChannelVideos(channel.youtube_id, 10);
    let added = 0;

    for (const item of items) {
      const existing = db
        .prepare('SELECT id FROM videos WHERE youtube_id = ?')
        .get(item.videoId);
      if (existing) continue;

      const insertVideo = db.prepare(`
        INSERT OR IGNORE INTO videos (channel_id, youtube_id, title, description, url, thumbnail_url, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const videoResult = insertVideo.run(
        channel.id,
        item.videoId,
        item.title,
        item.description || '',
        item.url,
        item.thumbnail,
        item.publishedAt
      );

      if (videoResult.changes === 0) continue;

      const videoRowId = videoResult.lastInsertRowid;
      added++;

      try {
        const transcript = await fetchTranscript(item.videoId);
        const analysis = await analyzeVideo(
          {
            title: item.title,
            description: item.description,
            transcript,
            published_at: item.publishedAt,
          },
          channelName
        );

        db.prepare(`
          UPDATE videos
          SET summary = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          analysis.summary,
          JSON.stringify(analysis.tickers),
          JSON.stringify(analysis.trade_signals),
          videoRowId
        );
      } catch (analysisErr) {
        console.error(`Error analyzing video ${item.videoId}:`, analysisErr.message);
      }
    }

    db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      channel.id
    );

    res.json({ added });
  } catch (err) {
    console.error('POST /channels/:id/refresh error:', err);
    res.status(500).json({ error: err.message || 'Failed to refresh channel' });
  }
});

export default router;
