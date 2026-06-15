import cron from 'node-cron';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { fetchChannelVideos } from './youtube.js';
import { analyzeVideo } from './claude.js';
import { fetchTranscript } from './transcript.js';

// ── Logging ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir  = process.env.DB_PATH ? dirname(process.env.DB_PATH) : join(__dirname, '../../data');
const logPath  = join(dataDir, 'marketbrief.log');
mkdirSync(dataDir, { recursive: true });

function marketBriefLog(phase, error, context = {}) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), ...context, phase, error });
  try { appendFileSync(logPath, entry + '\n'); } catch (_) {}
  console.error(`[MarketBrief] phase=${phase} error=${error}`, context.videoId ? `video=${context.videoId}` : `channel=${context.channelName}`);
  // Write to appropriate observability table
  try {
    if (phase === 'youtube_fetch') {
      db.prepare('INSERT INTO channel_rss_errors (channel_id, channel_name, error) VALUES (?, ?, ?)')
        .run(context.channelId || null, context.channelName || 'Unknown', error);
    } else if (context.videoId) {
      db.prepare('INSERT INTO market_brief_errors (channel_id, video_id, phase, error) VALUES (?, ?, ?, ?)')
        .run(context.channelId || null, context.videoId, phase, error);
    }
  } catch (_) {}
}

// ── Analysis helpers ──────────────────────────────────────────────────────────
async function runAnalysis(video, channelName, context) {
  const transcript = await fetchTranscript(video.youtube_id ?? video.videoId);
  if (!transcript) {
    marketBriefLog('transcript', 'Transcript unavailable — falling back to description', context);
  }

  const analysis = await analyzeVideo(
    { title: video.title, description: video.description, transcript, published_at: video.publishedAt ?? video.published_at },
    channelName
  );

  return analysis;
}

function markDone(videoId, analysis) {
  db.prepare(`
    UPDATE videos SET summary = ?, key_points = ?, tickers = ?, trade_signals = ?, analyzed_at = CURRENT_TIMESTAMP, analysis_status = 'done'
    WHERE id = ?
  `).run(analysis.summary, JSON.stringify(analysis.keyPoints || []), JSON.stringify(analysis.tickers), JSON.stringify(analysis.trade_signals), videoId);
}

function markFailed(videoId) {
  db.prepare(`UPDATE videos SET analysis_status = 'failed' WHERE id = ?`).run(videoId);
}

// ── Startup catch-up: today's pending videos only, attempted once ─────────────
async function catchUpPendingToday() {
  const videos = db.prepare(`
    SELECT v.*, c.name AS channel_name, c.id AS channel_id
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE v.analysis_status = 'pending'
      AND DATE(v.created_at) = DATE('now')
  `).all();

  if (videos.length === 0) return;
  console.log(`[Scheduler] ${videos.length} pending video(s) from today — catching up (one attempt each)...`);

  for (const video of videos) {
    const context = { channelId: video.channel_id, channelName: video.channel_name, videoId: video.youtube_id, videoTitle: video.title };
    try {
      const analysis = await runAnalysis(video, video.channel_name, context);
      markDone(video.id, analysis);
      console.log(`[Scheduler] Caught up: ${video.title}`);
    } catch (err) {
      marketBriefLog(err.phase || 'unexpected', err.message, context);
      markFailed(video.id);
    }
  }
}

// ── Regular poll ──────────────────────────────────────────────────────────────
async function pollChannels(limit = 10) {
  const channels = db.prepare('SELECT * FROM channels WHERE subscribed = 1').all();
  console.log(`[Scheduler] Polling ${channels.length} channel(s)...`);

  for (const channel of channels) {
    const channelContext = { channelId: channel.id, channelName: channel.name };

    try {
      console.log(`[Scheduler] Fetching videos for: ${channel.name} (${channel.youtube_id})`);
      const { channelName, items } = await fetchChannelVideos(channel.youtube_id, limit);

      let newCount = 0;

      for (const item of items) {
        const existing = db.prepare('SELECT id FROM videos WHERE youtube_id = ?').get(item.videoId);
        if (existing) continue;

        const result = db.prepare(`
          INSERT INTO videos (channel_id, youtube_id, title, description, url, thumbnail_url, published_at, analysis_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(channel.id, item.videoId, item.title, item.description || '', item.url, item.thumbnail, item.publishedAt);

        newCount++;
        const videoDbId = result.lastInsertRowid;
        const context = { ...channelContext, videoId: item.videoId, videoTitle: item.title };

        try {
          const analysis = await runAnalysis(item, channelName, context);
          markDone(videoDbId, analysis);
        } catch (err) {
          marketBriefLog(err.phase || 'unexpected', err.message, context);
          markFailed(videoDbId);
        }
      }

      db.prepare('UPDATE channels SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?').run(channel.id);
      console.log(`[Scheduler] Channel "${channel.name}": ${newCount} new video(s) processed.`);

    } catch (err) {
      marketBriefLog('youtube_fetch', err.message, channelContext);
    }
  }

  console.log('[Scheduler] Poll cycle complete.');
}

// ── Orphan cleanup ────────────────────────────────────────────────────────────
function pruneOrphanedAnalyses() {
  try {
    const { changes } = db.prepare(`
      DELETE FROM video_analyses
      WHERE id NOT IN (
        SELECT video_analysis_id FROM user_summaries WHERE video_analysis_id IS NOT NULL
      )
      AND created_at < datetime('now', '-10 days')
    `).run();
    if (changes > 0) console.log(`[Scheduler] Pruned ${changes} orphaned video_analyses row(s).`);
  } catch (err) {
    console.error('[Scheduler] Orphan prune error:', err.message);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function startScheduler() {
  const interval = parseInt(process.env.POLL_INTERVAL_MINUTES || '10', 10);
  const cronExpression = `*/${interval} * * * *`;

  console.log(`[Scheduler] Starting — polling every ${interval} minute(s). Cron: ${cronExpression}`);

  (async () => {
    try {
      await catchUpPendingToday();
      await pollChannels(50);
    } catch (err) {
      console.error('[Scheduler] Startup error:', err.message);
    }
  })();

  cron.schedule(cronExpression, () => {
    pollChannels(50).catch((err) => {
      console.error('[Scheduler] Unexpected poll error:', err.message);
    });
  });

  // Run orphan cleanup once a day at 03:00
  cron.schedule('0 3 * * *', pruneOrphanedAnalyses);
}
