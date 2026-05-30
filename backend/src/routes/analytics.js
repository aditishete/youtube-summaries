import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

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

  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.role,
      u.created_at,
      (SELECT count(*) FROM user_visits WHERE user_id = u.id) AS total_visits,
      (SELECT count(*) FROM user_visits WHERE user_id = u.id AND date(visited_at) = date('now')) AS visits_today,
      (SELECT count(*) FROM user_visits WHERE user_id = u.id AND visited_at >= datetime('now', '-7 days')) AS visits_week,
      (SELECT count(*) FROM user_visits WHERE user_id = u.id AND visited_at >= datetime('now', '-30 days')) AS visits_month,
      (SELECT count(*) FROM user_video_requests WHERE user_id = u.id) AS total_video_requests,
      (SELECT count(*) FROM user_video_requests WHERE user_id = u.id AND date(requested_at) = date('now')) AS video_requests_today,
      (SELECT count(*) FROM user_video_requests WHERE user_id = u.id AND requested_at >= datetime('now', '-7 days')) AS video_requests_week,
      (SELECT count(*) FROM user_video_requests WHERE user_id = u.id AND requested_at >= datetime('now', '-30 days')) AS video_requests_month,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id) AS total_briefs,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND date(created_at) = date('now')) AS briefs_today,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND created_at >= datetime('now', '-7 days')) AS briefs_week,
      (SELECT count(*) FROM user_summaries WHERE user_id = u.id AND created_at >= datetime('now', '-30 days')) AS briefs_month
    FROM users u
    ORDER BY total_visits DESC, total_video_requests DESC
    LIMIT 25
  `).all().map((u) => {
    const daysSinceJoined = Math.max(1, (Date.now() - new Date(u.created_at).getTime()) / 86400000);
    return {
      ...u,
      visits_per_day: +(u.total_visits / daysSinceJoined).toFixed(2),
      video_requests_per_day: +(u.total_video_requests / daysSinceJoined).toFixed(2),
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
    users,
  });
});

export default router;
