import cron from 'node-cron';
import db from './db.js';
import { fetchChannelVideos } from './rss.js';
import { analyzeVideo } from './claude.js';
import { fetchTranscript } from './transcript.js';

// On startup: re-analyze any videos that were inserted but never analyzed (e.g. crashed mid-run)
async function reanalyzeUnanalyzed() {
  const videos = db.prepare(`
    SELECT v.*, c.name AS channel_name FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.analyzed_at IS NULL
  `).all();

  if (videos.length === 0) return;
  console.log(`[Scheduler] ${videos.length} unanalyzed video(s) found — catching up...`);

  for (const video of videos) {
    try {
      const transcript = await fetchTranscript(video.youtube_id);
      const analysis = await analyzeVideo(
        { title: video.title, description: video.description, transcript },
        video.channel_name
      );
      db.prepare(`
        UPDATE videos SET summary = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(analysis.summary, JSON.stringify(analysis.tickers), JSON.stringify(analysis.trade_signals), video.id);
      console.log(`[Scheduler] Caught up: ${video.title}`);
    } catch (err) {
      console.error(`[Scheduler] Catch-up analysis failed for ${video.youtube_id}:`, err.message);
    }
  }
}

async function pollChannels(limit = 10) {
  const channels = db.prepare('SELECT * FROM channels WHERE subscribed = 1').all();
  console.log(`[Scheduler] Polling ${channels.length} channel(s)...`);

  for (const channel of channels) {
    try {
      console.log(`[Scheduler] Fetching videos for: ${channel.name} (${channel.youtube_id})`);
      const { channelName, items } = await fetchChannelVideos(channel.youtube_id, limit);

      let newCount = 0;

      for (const item of items) {
        // Check if this video already exists
        const existing = db
          .prepare('SELECT id FROM videos WHERE youtube_id = ?')
          .get(item.videoId);

        if (existing) continue;

        // Insert the new video
        const insertVideo = db.prepare(`
          INSERT INTO videos (channel_id, youtube_id, title, description, url, thumbnail_url, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertVideo.run(
          channel.id,
          item.videoId,
          item.title,
          item.description || '',
          item.url,
          item.thumbnail,
          item.publishedAt
        );

        newCount++;
        const videoId = result.lastInsertRowid;

        // Analyze with Claude (use transcript for richer content)
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
            videoId
          );
        } catch (analysisErr) {
          console.error(
            `[Scheduler] Failed to analyze video ${item.videoId}:`,
            analysisErr.message
          );
        }
      }

      // Update last_fetched_at
      db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        channel.id
      );

      console.log(
        `[Scheduler] Channel "${channel.name}": ${newCount} new video(s) added and analyzed.`
      );
    } catch (err) {
      console.error(`[Scheduler] Error polling channel ${channel.name}:`, err.message);
    }
  }

  console.log('[Scheduler] Poll cycle complete.');
}

export function startScheduler() {
  const interval = parseInt(process.env.POLL_INTERVAL_MINUTES || '30', 10);
  const cronExpression = `*/${interval} * * * *`;

  console.log(`[Scheduler] Starting — polling every ${interval} minute(s). Cron: ${cronExpression}`);

  // On startup: catch up on anything missed during downtime
  (async () => {
    try {
      await reanalyzeUnanalyzed();   // re-analyze videos that crashed mid-analysis
      await pollChannels(15);        // fetch up to 15 (RSS max) to catch missed videos
    } catch (err) {
      console.error('[Scheduler] Startup catch-up error:', err.message);
    }
  })();

  cron.schedule(cronExpression, () => {
    pollChannels().catch((err) => {
      console.error('[Scheduler] Unexpected error during poll:', err.message);
    });
  });
}
