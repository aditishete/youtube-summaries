import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const VALID_PAGES = ['landing', 'market_brief', 'video_in_brief'];

// POST /api/analytics/pageview — called by frontend on each page navigation
router.post('/pageview', requireAuth, (req, res) => {
  const { page } = req.body || {};
  if (!page || !VALID_PAGES.includes(page)) {
    return res.status(400).json({ error: 'Invalid page' });
  }

  // Throttle: only record if user hasn't visited this page in the last 30 minutes
  const last = db.prepare(
    'SELECT viewed_at FROM user_page_views WHERE user_id = ? AND page = ? ORDER BY viewed_at DESC LIMIT 1'
  ).get(req.user.id, page);

  const now = Date.now();
  if (!last || now - new Date(last.viewed_at).getTime() > 30 * 60 * 1000) {
    db.prepare('INSERT INTO user_page_views (user_id, page) VALUES (?, ?)').run(req.user.id, page);
  }

  res.status(204).end();
});

// GET /api/analytics/timeseries?period=today|week|month
router.get('/timeseries', requireAdmin, (req, res) => {
  const period = req.query.period || 'week';
  const today = req.query.localDate && /^\d{4}-\d{2}-\d{2}$/.test(req.query.localDate)
    ? req.query.localDate
    : new Date().toISOString().slice(0, 10);
  const tzOffset = parseInt(req.query.tzOffset ?? '0', 10);
  const toLocal = Number.isFinite(tzOffset) ? `, '-${tzOffset} minutes'` : '';

  let bucketFn, since, labelFmt;
  if (period === 'today') {
    bucketFn = `strftime('%H:00', %col%${toLocal})`;
    since = `'${today}'`;  // start of local today
    labelFmt = 'hour';
  } else if (period === 'month') {
    bucketFn = "date(%col%)";
    since = "datetime('now', '-30 days')";
    labelFmt = 'day';
  } else {
    bucketFn = "date(%col%)";
    since = "datetime('now', '-7 days')";
    labelFmt = 'day';
  }

  function bucket(table, col) {
    const fn = bucketFn.replace(/%col%/g, col);
    return db._db.all(
      `SELECT ${fn} as t, count(*) as n FROM ${table} WHERE ${col} >= ${since} GROUP BY t ORDER BY t`
    );
  }

  function bucketPage(page) {
    const fn = bucketFn.replace(/%col%/g, 'viewed_at');
    return db._db.all(
      `SELECT ${fn} as t, count(*) as n FROM user_page_views WHERE page = ? AND viewed_at >= ${since} GROUP BY t ORDER BY t`,
      [page]
    );
  }

  res.json({
    period,
    labelFmt,
    market_brief_requests: bucket('user_video_requests', 'requested_at'),
    logins: bucket('user_logins', 'logged_in_at'),
    briefs_generated: bucket('user_summaries', 'created_at'),
    landing_views: bucketPage('landing'),
    market_brief_views: bucketPage('market_brief'),
    video_in_brief_views: bucketPage('video_in_brief'),
  });
});

router.get('/', requireAdmin, (req, res) => {
  // Use client's local date + UTC offset so "today" reflects local timezone, not UTC
  const today = req.query.localDate && /^\d{4}-\d{2}-\d{2}$/.test(req.query.localDate)
    ? req.query.localDate
    : new Date().toISOString().slice(0, 10);
  const tzOffset = parseInt(req.query.tzOffset ?? '0', 10);
  // SQLite modifier to convert stored UTC timestamps to local time: subtract tzOffset minutes
  const toLocal = Number.isFinite(tzOffset) ? `, '-${tzOffset} minutes'` : '';

  const totalUsers = db.prepare('SELECT count(*) as c FROM users').get().c;

  const uniqueVisitorsToday = db.prepare(
    `SELECT COUNT(DISTINCT user_id) as c FROM user_visits WHERE date(visited_at${toLocal}) = ?`
  ).get(today).c;

  const pageVisitsToday = db.prepare(
    `SELECT count(*) as c FROM user_visits WHERE date(visited_at${toLocal}) = ?`
  ).get(today).c;
  const pageVisitsWeek = db.prepare(
    "SELECT count(*) as c FROM user_visits WHERE visited_at >= datetime('now', '-7 days')"
  ).get().c;
  const pageVisitsMonth = db.prepare(
    "SELECT count(*) as c FROM user_visits WHERE visited_at >= datetime('now', '-30 days')"
  ).get().c;

  const videoRequestsToday = db.prepare(
    `SELECT count(*) as c FROM user_video_requests WHERE date(requested_at${toLocal}) = ?`
  ).get(today).c;
  const videoRequestsWeek = db.prepare(
    "SELECT count(*) as c FROM user_video_requests WHERE requested_at >= datetime('now', '-7 days')"
  ).get().c;
  const videoRequestsMonth = db.prepare(
    "SELECT count(*) as c FROM user_video_requests WHERE requested_at >= datetime('now', '-30 days')"
  ).get().c;

  const briefs_this_month = db.prepare(
    "SELECT count(*) as c FROM user_summaries WHERE created_at >= datetime('now', '-30 days')"
  ).get().c;

  // Aggregate login counts (all users including guest)
  const loginsToday = db.prepare(
    `SELECT count(*) as c FROM user_logins WHERE date(logged_in_at${toLocal}) = ?`
  ).get(today).c;
  const loginsWeek = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE logged_in_at >= datetime('now', '-7 days')"
  ).get().c;
  const loginsMonth = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE logged_in_at >= datetime('now', '-30 days')"
  ).get().c;

  // Guest visits — logins by the guest account specifically
  const guestId = db.prepare("SELECT id FROM users WHERE username = 'guest'").get()?.id ?? -1;
  const guestVisitsToday = db.prepare(
    `SELECT count(*) as c FROM user_logins WHERE user_id = ? AND date(logged_in_at${toLocal}) = ?`
  ).get(guestId, today).c;
  const guestVisitsWeek = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE user_id = ? AND logged_in_at >= datetime('now', '-7 days')"
  ).get(guestId).c;
  const guestVisitsMonth = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE user_id = ? AND logged_in_at >= datetime('now', '-30 days')"
  ).get(guestId).c;

  // Aggregate per-page view counts
  function pageViewCounts(page) {
    return {
      today: db.prepare(
        `SELECT count(*) as c FROM user_page_views WHERE page = ? AND date(viewed_at${toLocal}) = ?`
      ).get(page, today).c,
      week: db.prepare(
        "SELECT count(*) as c FROM user_page_views WHERE page = ? AND viewed_at >= datetime('now', '-7 days')"
      ).get(page).c,
      month: db.prepare(
        "SELECT count(*) as c FROM user_page_views WHERE page = ? AND viewed_at >= datetime('now', '-30 days')"
      ).get(page).c,
    };
  }

  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.role,
      u.created_at,
      (SELECT count(*) FROM user_logins WHERE user_id = u.id) AS total_logins,
      (SELECT count(*) FROM user_logins WHERE user_id = u.id AND date(logged_in_at${toLocal}) = '${today}') AS logins_today,
      (SELECT count(*) FROM user_logins WHERE user_id = u.id AND logged_in_at >= datetime('now', '-7 days')) AS logins_week,
      (SELECT count(*) FROM user_logins WHERE user_id = u.id AND logged_in_at >= datetime('now', '-30 days')) AS logins_month,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing') AS landing_total,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing' AND date(viewed_at${toLocal}) = '${today}') AS landing_today,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing' AND viewed_at >= datetime('now', '-7 days')) AS landing_week,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing' AND viewed_at >= datetime('now', '-30 days')) AS landing_month,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief') AS market_total,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief' AND date(viewed_at${toLocal}) = '${today}') AS market_today,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief' AND viewed_at >= datetime('now', '-7 days')) AS market_week,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief' AND viewed_at >= datetime('now', '-30 days')) AS market_month,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief') AS vib_total,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief' AND date(viewed_at${toLocal}) = '${today}') AS vib_today,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief' AND viewed_at >= datetime('now', '-7 days')) AS vib_week,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief' AND viewed_at >= datetime('now', '-30 days')) AS vib_month,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id) AS total_briefs,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND date(created_at${toLocal}) = '${today}') AS briefs_today,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND created_at >= datetime('now', '-7 days')) AS briefs_week,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND created_at >= datetime('now', '-30 days')) AS briefs_month
    FROM users u
    ORDER BY total_logins DESC
    LIMIT 25
  `).all().map((u) => {
    const daysSinceJoined = Math.max(1, (Date.now() - new Date(u.created_at).getTime()) / 86400000);
    return {
      ...u,
      logins_per_day: +(u.total_logins / daysSinceJoined).toFixed(2),
      briefs_per_day: +(u.total_briefs / daysSinceJoined).toFixed(2),
    };
  });

  res.json({
    total_users: totalUsers,
    unique_visitors_today: uniqueVisitorsToday,
    page_visits_today: pageVisitsToday,
    page_visits_week: pageVisitsWeek,
    page_visits_month: pageVisitsMonth,
    video_requests_today: videoRequestsToday,
    video_requests_week: videoRequestsWeek,
    video_requests_month: videoRequestsMonth,
    briefs_this_month,
    logins_today: loginsToday,
    logins_week: loginsWeek,
    logins_month: loginsMonth,
    guest_visits: { today: guestVisitsToday, week: guestVisitsWeek, month: guestVisitsMonth },
    landing_views: pageViewCounts('landing'),
    market_brief_views: pageViewCounts('market_brief'),
    video_in_brief_views: pageViewCounts('video_in_brief'),
    users,
  });
});

// GET /api/analytics/errors/video-brief?period=day|week|month&page=1
router.get('/errors/video-brief', requireAdmin, (req, res) => {
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'week';
  const page   = Math.max(1, parseInt(req.query.page || '1', 10));
  const PAGE_SIZE = 20;
  const offset = (page - 1) * PAGE_SIZE;

  const since = period === 'day'   ? "datetime('now', '-1 day')"
              : period === 'month' ? "datetime('now', '-30 days')"
              :                      "datetime('now', '-7 days')";

  const successCount = db.prepare(
    `SELECT COUNT(*) as c FROM action_log WHERE action = 'summarize_video' AND created_at >= ${since}`
  ).get().c;
  const errorCount = db.prepare(
    `SELECT COUNT(*) as c FROM video_brief_errors WHERE created_at >= ${since}`
  ).get().c;

  const totalPages = Math.max(1, Math.ceil(errorCount / PAGE_SIZE));
  const errors = db.prepare(`
    SELECT e.id, COALESCE(u.username, 'deleted') AS username, e.url, e.phase, e.error, e.created_at
    FROM video_brief_errors e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.created_at >= ${since}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(PAGE_SIZE, offset);

  const rateLimitByUser = db.prepare(`
    SELECT COALESCE(u.username, 'deleted') AS username, COALESCE(u.role, '—') AS role,
           COUNT(*) AS hits, MAX(r.created_at) AS last_hit
    FROM rate_limit_events r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.created_at >= ${since}
    GROUP BY r.user_id
    ORDER BY hits DESC
  `).all();

  res.json({ pie: { total: successCount + errorCount, errors: errorCount, period }, errors, errorPage: page, errorTotalPages: totalPages, rateLimitByUser });
});

// GET /api/analytics/errors/market-brief?period=day|week|month&page=1
router.get('/errors/market-brief', requireAdmin, (req, res) => {
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'week';
  const page   = Math.max(1, parseInt(req.query.page || '1', 10));
  const PAGE_SIZE = 20;
  const offset = (page - 1) * PAGE_SIZE;

  const since = period === 'day'   ? "datetime('now', '-1 day')"
              : period === 'month' ? "datetime('now', '-30 days')"
              :                      "datetime('now', '-7 days')";

  const doneCount   = db.prepare(`SELECT COUNT(*) as c FROM videos WHERE analysis_status = 'done'  AND created_at >= ${since}`).get().c;
  const failedCount = db.prepare(`SELECT COUNT(*) as c FROM videos WHERE analysis_status = 'failed' AND created_at >= ${since}`).get().c;

  const errorCount = db.prepare(`SELECT COUNT(*) as c FROM market_brief_errors WHERE created_at >= ${since}`).get().c;
  const totalPages = Math.max(1, Math.ceil(errorCount / PAGE_SIZE));
  const errors = db.prepare(`
    SELECT e.id,
           COALESCE(c.name, 'deleted') AS channel_name,
           COALESCE(v.title, e.video_id) AS video_title,
           'https://www.youtube.com/watch?v=' || e.video_id AS video_url,
           e.phase, e.error, e.created_at
    FROM market_brief_errors e
    LEFT JOIN channels c ON c.id = e.channel_id
    LEFT JOIN videos v ON v.youtube_id = e.video_id
    WHERE e.created_at >= ${since}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(PAGE_SIZE, offset);

  const channelErrors = db.prepare(`
    SELECT channel_name, COUNT(*) AS failures, MAX(created_at) AS last_failure,
           (SELECT error FROM channel_rss_errors c2
            WHERE c2.channel_name = cre.channel_name AND c2.created_at >= ${since}
            ORDER BY c2.created_at DESC LIMIT 1) AS last_error
    FROM channel_rss_errors cre
    WHERE created_at >= ${since}
    GROUP BY channel_name
    ORDER BY failures DESC
  `).all();

  res.json({ pie: { total: doneCount + failedCount, errors: failedCount, period }, errors, errorPage: page, errorTotalPages: totalPages, channelErrors });
});

// GET /api/analytics/action-log — recent 50 actions across all users
router.get('/action-log', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.id, a.action, a.target, a.created_at, u.username, u.role
      FROM action_log a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 50
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('GET /analytics/action-log error:', err);
    res.status(500).json({ error: 'Failed to fetch action log' });
  }
});

export default router;
