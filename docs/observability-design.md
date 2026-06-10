# Observability — Analytics Errors Tab Design

## Overview

The Analytics page gains a second top-level tab: **Errors**. The existing content moves into a **Usage** tab unchanged. The Errors tab is **admin-only**, matching the existing analytics access control (`requireAdmin` on all endpoints).

---

## Page Structure

```
Analytics Page (admin only)
├── Tab: Usage          (existing content, unchanged)
└── Tab: Errors         (new)
    ├── Sub-tab: Video Brief
    └── Sub-tab: Market Brief
```

---

## Usage Tab — Existing Components

All components below are already implemented and remain unchanged.

### Data source
`GET /api/analytics` — requires admin. Timezone-aware: passes `localDate` (YYYY-MM-DD) and `tzOffset` (minutes) so "today" reflects the user's local timezone, not UTC.

`GET /api/analytics/timeseries?period=today|week|month` — returns bucketed time series data per activity type.

`GET /api/analytics/action-log` — returns the 50 most recent admin/user actions.

---

### 1. Summary Stat Cards (top row)
Four cards in a 2×2 / 4-column grid:

| Card | Value | Data source |
|---|---|---|
| Unique Visitors Today | Distinct users with a visit record for today | `user_visits` DISTINCT `user_id` |
| Logins Today | Total successful logins today | `user_logins` |
| Total Users | Count of all registered accounts | `users` |
| Briefs This Month | Video briefs generated in the last 30 days | `user_summaries` |

---

### 2. Activity Group Cards (second row)
Four colour-coded cards, each showing **Today / This Week / This Month** counts:

| Card | Colour | Data source |
|---|---|---|
| Logins | Amber | `user_logins` |
| Landing Visits | Blue | `user_page_views` WHERE `page = 'landing'` |
| Market Brief Visits | Violet | `user_page_views` WHERE `page = 'market_brief'` |
| Video Brief Visits | Emerald | `user_page_views` WHERE `page = 'video_in_brief'` |

Page views are throttled at the recording level: a visit to the same page within 30 minutes of a previous visit by the same user is not counted again.

---

### 3. Activity Over Time — Line Chart
A Recharts `LineChart` with a **Today / Last 7 Days / Last 30 Days** period toggle. Six lines plotted simultaneously:

| Series | Colour | Data source |
|---|---|---|
| Market Brief Requests | Indigo | `user_video_requests` |
| Market Brief Visits | Blue | `user_page_views` (`market_brief`) |
| Video Brief Visits | Emerald | `user_page_views` (`video_in_brief`) |
| Briefs Generated | Violet | `user_summaries` |
| Logins | Amber | `user_logins` |
| Landing Visits | Pink | `user_page_views` (`landing`) |

X-axis buckets: hourly for "Today", daily for "Last 7 Days" and "Last 30 Days".

---

### 4. Users by Activity Table
A wide scrollable table showing up to 25 users sorted by total login count descending. Columns grouped by category:

| Group | Columns | Data source |
|---|---|---|
| — | # / Username / Role | `users` |
| Logins | Today / Week / Month | `user_logins` |
| Landing Visits | Today / Week / Month | `user_page_views` (`landing`) |
| Market Brief Visits | Today / Week / Month | `user_page_views` (`market_brief`) |
| Video Brief Visits | Today / Week / Month | `user_page_views` (`video_in_brief`) |
| Video Briefs Requested | Today / Week / Month | `user_summaries` |

Each user row also carries computed `logins_per_day` and `briefs_per_day` rates (not currently displayed in the table but available in the API response).

---

### 5. Action Log Table
The 50 most recent user and admin actions across all users, most recent first.

| Column | Value |
|---|---|
| Time | Formatted timestamp |
| User | Username + role badge |
| Action | Colour-coded action label |
| Target | Video title, channel name, or blank |

Tracked action types and their display colours:

| Action key | Display label | Colour |
|---|---|---|
| `add_channel` | Add Channel | Emerald |
| `delete_channel` | Delete Channel | Red |
| `refresh_channel` | Refresh Channel | Blue |
| `unsubscribe_channel` | Unsubscribe | Amber |
| `subscribe_channel` | Resubscribe | Emerald |
| `reanalyze_video` | Reanalyze Video | Violet |
| `summarize_video` | Summarize Video | Zinc |

---

---

## Video Brief Sub-tab

### Pie Chart — Analysis Requests vs Errors
- Period toggle: Day / Week / Month
- **Total** = successful analyses (`action_log` WHERE `action = 'summarize_video'`) + analysis errors (`video_brief_errors`) for the selected period
- **Errors** = rows in `video_brief_errors` for the selected period
- Rate-limited requests are **excluded** from this chart — they never reached the analysis pipeline
- Slices: Successful (green) / Failed (red)

### Rate Limit Events Table
A separate section below the pie chart. One row per user who hit the summarize rate limit in the selected period. Immediately shows which users are repeatedly hitting the cap.

| Username | Role | Hits | Last Hit |
|---|---|---|---|
| user1 | viewer | 4 | Jun 9, 3:14 PM |
| user2 | viewer | 1 | Jun 9, 1:02 PM |

- Period toggle: **Day / Week / Month** — filters `rate_limit_events.created_at` to last 1 / 7 / 30 days
- Grouped by user (`GROUP BY user_id`), sorted by hits descending
- No pagination — data set is inherently small
- Query shape: `SELECT username, role, COUNT(*) as hits, MAX(created_at) as last_hit FROM rate_limit_events JOIN users ... WHERE created_at >= ? GROUP BY user_id ORDER BY hits DESC`

### Analysis Error Table
Most recent errors first, 20 per page with numbered pagination.

| Username | Video URL | Phase | Error | Time |
|---|---|---|---|---|
| user1 | youtube.com/... | ai | Claude API timed out | Jun 9 3:14 PM |

- Period toggle: Day / Week / Month
- Phase values: `transcript`, `ai`, `timeout`, `parse`, `unexpected`
- Username joined from `users` table via `user_id`

---

## Market Brief Sub-tab

### Pie Chart — Analysis Attempts vs Errors
- Period toggle: Day / Week / Month
- **Total** = `videos` WHERE `analysis_status IN ('done','failed')` AND `DATE(created_at)` in period
- **Errors** = `videos` WHERE `analysis_status = 'failed'` AND `DATE(created_at)` in period
- Slices: Successful (green) / Failed (red)

### Video Analysis Error Table
Most recent errors first, 20 per page with numbered pagination.

| Channel | Video Title | Video URL | Phase | Error | Time |
|---|---|---|---|---|---|
| Some Channel | Video Title | youtube.com/... | timeout | AI timed out | Jun 9 3:14 PM |

- Period toggle: Day / Week / Month
- Channel name joined from `channels` table; video URL constructed from `video_id` on join with `videos`

### Channel Feed Error Table
RSS fetch failures displayed separately — one row per channel that had feed failures in the selected period. Surfaces persistent polling problems at a glance.

| Channel | Failures | Last Error Message | Last Failure |
|---|---|---|---|
| Some Channel | 5 | Failed to fetch RSS: 404 | Jun 9, 3:00 PM |
| Other Channel | 1 | Connection timeout | Jun 9, 1:00 AM |

- Period toggle: **Day / Week / Month** — filters `channel_rss_errors.created_at` to last 1 / 7 / 30 days
- Grouped by channel (`GROUP BY channel_id`), sorted by failures descending
- No pagination — one row per subscribed channel at most
- Last Error Message shows the most recent error string for that channel in the period
- Query shape: `SELECT channel_name, COUNT(*) as failures, MAX(created_at) as last_failure, ... FROM channel_rss_errors WHERE created_at >= ? GROUP BY channel_id ORDER BY failures DESC`

---

## Database Tables

### `video_brief_errors`
Written on every analysis failure (transcript/ai/timeout/parse/unexpected phases). Both the inline path (< 60s) and the async polling path write here.

```sql
CREATE TABLE IF NOT EXISTS video_brief_errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  phase      TEXT NOT NULL,
  error      TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `market_brief_errors`
Written on every video analysis failure in the scheduler.

```sql
CREATE TABLE IF NOT EXISTS market_brief_errors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  video_id     TEXT NOT NULL,
  phase        TEXT NOT NULL,
  error        TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `channel_rss_errors`
Written when an RSS feed fetch fails for an entire channel.

```sql
CREATE TABLE IF NOT EXISTS channel_rss_errors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id   INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  channel_name TEXT NOT NULL,
  error        TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

*Note: `channel_id` is nullable with ON DELETE SET NULL so RSS errors survive channel deletion.*

### `rate_limit_events`
Written when a user hits the summarize rate limit (10/hr). Captured via a custom `handler` on the express-rate-limit middleware.

```sql
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint   TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

*Note: `user_id` nullable — rate limit can fire before auth in some edge cases.*

---

## API Endpoints

All endpoints are `requireAdmin`.

| Endpoint | Returns |
|---|---|
| `GET /api/analytics/errors/video-brief?period=day&page=1` | Pie data, analysis error list (paginated), rate limit summary |
| `GET /api/analytics/errors/market-brief?period=day&page=1&channel_page=1` | Pie data, analysis error list (paginated), channel RSS error list (paginated) |

Period parameter: `day` = last 24 hours, `week` = last 7 days, `month` = last 30 days.

**Video brief response shape:**
```json
{
  "pie": { "total": 42, "errors": 3, "period": "week" },
  "errors": [ { "username": "...", "url": "...", "phase": "ai", "error": "...", "created_at": "..." } ],
  "errorPage": 1,
  "errorTotalPages": 2,
  "rateLimitByUser": [
    { "username": "user1", "role": "viewer", "hits": 4, "lastHit": "2026-06-09T15:14:00Z" }
  ]
}
```

**Market brief response shape:**
```json
{
  "pie": { "total": 120, "errors": 5, "period": "week" },
  "errors": [ { "channelName": "...", "videoTitle": "...", "videoUrl": "...", "phase": "timeout", "error": "...", "created_at": "..." } ],
  "errorPage": 1,
  "errorTotalPages": 3,
  "channelErrors": [
    { "channelName": "Some Channel", "failures": 5, "lastError": "Failed to fetch RSS: 404", "lastFailure": "2026-06-09T15:00:00Z" }
  ]
}
```

---

## Where Errors Are Written

| Error source | Written by | Table |
|---|---|---|
| Video brief analysis failure (inline) | `routes/summarize.js` POST handler | `video_brief_errors` |
| Video brief analysis failure (async job) | `routes/summarize.js` `runSummarizeJob()` | `video_brief_errors` |
| Market brief video analysis failure | `scheduler.js` `pollChannels()` and `catchUpPendingToday()` | `market_brief_errors` |
| Market brief RSS feed failure | `scheduler.js` `pollChannels()` | `channel_rss_errors` |
| Summarize rate limit hit | `app.js` rate limit handler | `rate_limit_events` |

**Log files remain unchanged** (`videobriefs.log`, `marketbrief.log`) for raw debugging. The DB tables are the source of truth for the UI.

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/db.js` | Add 4 new tables |
| `backend/src/app.js` | Add custom rate limit handler to write to `rate_limit_events` |
| `backend/src/routes/summarize.js` | Write to `video_brief_errors` on analysis failure in both inline and async paths |
| `backend/src/scheduler.js` | Write to `market_brief_errors` and `channel_rss_errors` on failure |
| `backend/src/routes/analytics.js` | Add two new error endpoints |
| `frontend/src/api.js` | Add `getVideoErrors()` and `getMarketErrors()` |
| `frontend/src/components/AnalyticsPage.jsx` | Add Usage/Errors top tabs, Video Brief/Market Brief sub-tabs, pie charts, error tables, rate limit table |
