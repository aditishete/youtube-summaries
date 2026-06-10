import { Router } from 'express';
import db from '../db.js';
import { resolveChannelId, fetchChannelVideos } from '../rss.js';
import { analyzeVideo } from '../claude.js';
import { fetchTranscript } from '../transcript.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const MAX_RETAINED_VIDEOS_PER_CHANNEL = 30;
const MAX_INITIAL_FETCH_PER_CHANNEL = 10;
const MAX_CHANNELS = 20;

function pruneChannelVideos(channelId) {
  db.prepare(`
    DELETE FROM videos
    WHERE channel_id = ?
      AND id NOT IN (
        SELECT id FROM videos
        WHERE channel_id = ?
        ORDER BY published_at DESC
        LIMIT ${MAX_RETAINED_VIDEOS_PER_CHANNEL}
      )
  `).run(channelId, channelId);
}

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
    // Enforce channel cap
    const { count } = db.prepare('SELECT COUNT(*) as count FROM channels').get();
    if (count >= MAX_CHANNELS) {
      return res.status(400).json({ error: `Channel limit reached. Maximum ${MAX_CHANNELS} channels allowed.` });
    }

    // Resolve to a channel ID
    const channelId = await resolveChannelId(url.trim());

    // Check if already exists
    const existing = db.prepare('SELECT * FROM channels WHERE youtube_id = ?').get(channelId);
    if (existing) {
      return res.status(409).json({ error: 'Channel already added' });
    }

    // Fetch channel info and initial videos — last 7 days, max 10
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { channelName, items } = await fetchChannelVideos(channelId, MAX_INITIAL_FETCH_PER_CHANNEL, oneWeekAgo);

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
    let analyzed = 0;
    let failed = 0;

    for (const item of items) {
      let videoRowId;
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

        videoRowId = videoResult.lastInsertRowid;

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
          SET summary = ?, key_points = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP, analysis_status = 'done'
          WHERE id = ?
        `).run(
          analysis.summary,
          JSON.stringify(analysis.keyPoints || []),
          JSON.stringify(analysis.tickers),
          JSON.stringify(analysis.trade_signals),
          videoRowId
        );

        const videoRow = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoRowId);
        insertedVideos.push({
          ...videoRow,
          key_points:    JSON.parse(videoRow.key_points   || '[]'),
          tickers:       JSON.parse(videoRow.tickers      || '[]'),
          trade_signals: JSON.parse(videoRow.trade_signals|| '[]'),
        });
        analyzed++;
      } catch (videoErr) {
        console.error(`Error processing video ${item.videoId}:`, videoErr.message);
        db.prepare("UPDATE videos SET analysis_status = 'failed' WHERE id = ? AND analysis_status = 'pending'").run(videoRowId);
        failed++;
      }
    }

    // Update last_fetched_at and enforce 30-video cap
    db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      newChannelId
    );
    pruneChannelVideos(newChannelId);
    db.prepare('INSERT INTO action_log (user_id, action, target) VALUES (?, ?, ?)').run(req.user.id, 'add_channel', channelName);

    return res.status(201).json({ channel: channelRow, videos: insertedVideos, analyzed, failed, attempted: items.length });
  } catch (err) {
    console.error('POST /channels error:', err);
    res.status(500).json({ error: err.message || 'Failed to add channel' });
  }
});

// PATCH /api/channels/:id — toggle subscription
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subscribed } = req.body || {};
    if (typeof subscribed !== 'boolean') {
      return res.status(400).json({ error: 'subscribed (boolean) is required' });
    }
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    db.prepare('UPDATE channels SET subscribed = ? WHERE id = ?').run(subscribed ? 1 : 0, id);
    db.prepare('INSERT INTO action_log (user_id, action, target) VALUES (?, ?, ?)').run(
      req.user.id, subscribed ? 'subscribe_channel' : 'unsubscribe_channel', channel.name
    );

    // On resubscribe, catch up on any videos missed in the last 2 days
    let added = 0;
    if (subscribed) {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const { channelName, items } = await fetchChannelVideos(channel.youtube_id, MAX_INITIAL_FETCH_PER_CHANNEL, twoDaysAgo);

      for (const item of items) {
        const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(item.videoId);
        if (existing) continue;

        const videoResult = db.prepare(`
          INSERT OR IGNORE INTO videos (channel_id, youtube_id, title, description, url, thumbnail_url, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(channel.id, item.videoId, item.title, item.description || '', item.url, item.thumbnail, item.publishedAt);

        if (videoResult.changes === 0) continue;

        added++;
        try {
          const transcript = await fetchTranscript(item.videoId);
          const analysis = await analyzeVideo(
            { title: item.title, description: item.description, transcript, published_at: item.publishedAt },
            channelName
          );
          db.prepare(`
            UPDATE videos SET summary = ?, key_points = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP, analysis_status = 'done' WHERE id = ?
          `).run(analysis.summary, JSON.stringify(analysis.keyPoints || []), JSON.stringify(analysis.tickers), JSON.stringify(analysis.trade_signals), videoResult.lastInsertRowid);
        } catch (analysisErr) {
          console.error(`Error analyzing video ${item.videoId}:`, analysisErr.message);
          db.prepare("UPDATE videos SET analysis_status = 'failed' WHERE id = ? AND analysis_status = 'pending'").run(videoResult.lastInsertRowid);
        }
      }

      db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(channel.id);
      pruneChannelVideos(channel.id);
    }

    res.json({ ...channel, subscribed: subscribed ? 1 : 0, added });
  } catch (err) {
    console.error('PATCH /channels/:id error:', err);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /api/channels/:id
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const channel = db.prepare('SELECT name FROM channels WHERE id = ?').get(id);
    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    if (channel) db.prepare('INSERT INTO action_log (user_id, action, target) VALUES (?, ?, ?)').run(req.user.id, 'delete_channel', channel.name);
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

    const { channelName, items } = await fetchChannelVideos(channel.youtube_id, MAX_INITIAL_FETCH_PER_CHANNEL);
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
          SET summary = ?, key_points = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP, analysis_status = 'done'
          WHERE id = ?
        `).run(
          analysis.summary,
          JSON.stringify(analysis.keyPoints || []),
          JSON.stringify(analysis.tickers),
          JSON.stringify(analysis.trade_signals),
          videoRowId
        );
      } catch (analysisErr) {
        console.error(`Error analyzing video ${item.videoId}:`, analysisErr.message);
        db.prepare("UPDATE videos SET analysis_status = 'failed' WHERE id = ? AND analysis_status = 'pending'").run(videoRowId);
      }
    }

    db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      channel.id
    );
    pruneChannelVideos(channel.id);
    db.prepare('INSERT INTO action_log (user_id, action, target) VALUES (?, ?, ?)').run(req.user.id, 'refresh_channel', channel.name);

    res.json({ added });
  } catch (err) {
    console.error('POST /channels/:id/refresh error:', err);
    res.status(500).json({ error: err.message || 'Failed to refresh channel' });
  }
});

export default router;
