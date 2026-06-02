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

  let bucketFn, since, labelFmt;
  if (period === 'today') {
    bucketFn = "strftime('%H:00', %col%)";
    since = "datetime('now', '-1 day')";
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
  const totalUsers = db.prepare('SELECT count(*) as c FROM users').get().c;

  const uniqueVisitorsToday = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as c FROM user_visits WHERE date(visited_at) = date('now')"
  ).get().c;

  const pageVisitsToday = db.prepare(
    "SELECT count(*) as c FROM user_visits WHERE date(visited_at) = date('now')"
  ).get().c;
  const pageVisitsWeek = db.prepare(
    "SELECT count(*) as c FROM user_visits WHERE visited_at >= datetime('now', '-7 days')"
  ).get().c;
  const pageVisitsMonth = db.prepare(
    "SELECT count(*) as c FROM user_visits WHERE visited_at >= datetime('now', '-30 days')"
  ).get().c;

  const videoRequestsToday = db.prepare(
    "SELECT count(*) as c FROM user_video_requests WHERE date(requested_at) = date('now')"
  ).get().c;
  const videoRequestsWeek = db.prepare(
    "SELECT count(*) as c FROM user_video_requests WHERE requested_at >= datetime('now', '-7 days')"
  ).get().c;
  const videoRequestsMonth = db.prepare(
    "SELECT count(*) as c FROM user_video_requests WHERE requested_at >= datetime('now', '-30 days')"
  ).get().c;

  const briefs_this_month = db.prepare(
    "SELECT count(*) as c FROM user_summaries WHERE created_at >= datetime('now', '-30 days')"
  ).get().c;

  // Aggregate login counts
  const loginsToday = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE date(logged_in_at) = date('now')"
  ).get().c;
  const loginsWeek = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE logged_in_at >= datetime('now', '-7 days')"
  ).get().c;
  const loginsMonth = db.prepare(
    "SELECT count(*) as c FROM user_logins WHERE logged_in_at >= datetime('now', '-30 days')"
  ).get().c;

  // Aggregate per-page view counts
  function pageViewCounts(page) {
    return {
      today: db.prepare(
        "SELECT count(*) as c FROM user_page_views WHERE page = ? AND date(viewed_at) = date('now')"
      ).get(page).c,
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
      (SELECT count(*) FROM user_logins WHERE user_id = u.id AND date(logged_in_at) = date('now')) AS logins_today,
      (SELECT count(*) FROM user_logins WHERE user_id = u.id AND logged_in_at >= datetime('now', '-7 days')) AS logins_week,
      (SELECT count(*) FROM user_logins WHERE user_id = u.id AND logged_in_at >= datetime('now', '-30 days')) AS logins_month,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing') AS landing_total,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing' AND date(viewed_at) = date('now')) AS landing_today,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing' AND viewed_at >= datetime('now', '-7 days')) AS landing_week,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'landing' AND viewed_at >= datetime('now', '-30 days')) AS landing_month,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief') AS market_total,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief' AND date(viewed_at) = date('now')) AS market_today,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief' AND viewed_at >= datetime('now', '-7 days')) AS market_week,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'market_brief' AND viewed_at >= datetime('now', '-30 days')) AS market_month,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief') AS vib_total,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief' AND date(viewed_at) = date('now')) AS vib_today,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief' AND viewed_at >= datetime('now', '-7 days')) AS vib_week,
      (SELECT count(*) FROM user_page_views WHERE user_id = u.id AND page = 'video_in_brief' AND viewed_at >= datetime('now', '-30 days')) AS vib_month,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id) AS total_briefs,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND date(created_at) = date('now')) AS briefs_today,
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
    landing_views: pageViewCounts('landing'),
    market_brief_views: pageViewCounts('market_brief'),
    video_in_brief_views: pageViewCounts('video_in_brief'),
    users,
  });
});

export default router;
