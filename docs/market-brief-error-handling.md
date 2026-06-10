# Market Brief Error Handling Design

## Overview

The Market Brief page shows videos from subscribed YouTube channels, each analyzed by Claude for summary, tickers, and trade signals. This document covers how analysis errors are handled, what users see, and how errors are logged.

---

## User Experience

**Users never see analysis errors.** The Market Brief page only displays videos that have been successfully analyzed. If a video fails analysis it is invisible to the user — it does not appear in the feed. No error message, no placeholder card, no indication that any video was skipped.

This is intentional. Analysis failures are an infrastructure concern, not a user concern. The page simply shows fewer videos until failed videos are successfully analyzed.

**Observability for admins is a separate future concern** and is not part of this implementation.

---

## Analysis Status

A new `analysis_status` column is added to the `videos` table to track the state of each video through the analysis pipeline.

| Value | Meaning |
|---|---|
| `pending` | Inserted from RSS feed, analysis not yet attempted or still in progress |
| `done` | Successfully analyzed — visible to users |
| `failed` | Analysis failed and will not be retried automatically |

Default on insert: `pending`.

**The user-facing visibility rule is: `analysis_status = 'done'` only.**

This replaces the previous implicit rule of `analyzed_at IS NOT NULL`, which was insufficient because it gave no way to distinguish "not yet attempted" from "permanently failed."

---

## Retry Behaviour

**On server restart**, a single catch-up pass runs for videos that meet both conditions:
1. `analysis_status = 'pending'`
2. `DATE(created_at) = DATE('now')` — inserted today only

Each qualifying video is attempted **once**:
- Success → `analysis_status = 'done'`, `analyzed_at = CURRENT_TIMESTAMP`
- Failure → `analysis_status = 'failed'`, error logged to `marketbrief.log`

**Videos from previous days are never automatically retried.** A video marked `failed` is never touched again by the scheduler. To force a retry, an admin must use the `/api/videos/:id/reanalyze` endpoint, which resets the status to `pending` and runs analysis immediately.

This design prevents the scheduler from endlessly retrying permanently unanalyzable videos (private videos, missing transcripts, persistent API failures).

---

## Error Phases

Each error is tagged with the phase in which it occurred:

| Phase | Where | Meaning |
|---|---|---|
| `rss` | `scheduler.js` | RSS feed fetch failed — entire channel skipped for this poll cycle |
| `transcript` | `scheduler.js` | Transcript fetch returned empty — soft warning only, analysis continues using video description as fallback |
| `ai` | `claude.js` | Claude API call failed (network error, API error) |
| `timeout` | `claude.js` | Claude API call exceeded `MARKET_BRIEF_AI_TIMEOUT_MS` |
| `parse` | `claude.js` | Claude returned a response that could not be parsed as JSON |
| `unexpected` | `scheduler.js` | Uncaught error not covered by the above phases |

---

## Log File

All errors are written to **`marketbrief.log`** in the backend data directory (`/data/`, same volume as `dashboard.db` and `videobriefs.log`). Errors are also echoed to `console.error` (Docker logs).

One JSON object per line:

```json
{ "ts": "2026-06-09T23:00:00.000Z", "channelId": 1, "channelName": "Some Channel", "videoId": "abc123", "videoTitle": "Video Title", "phase": "ai", "error": "Connection timeout" }
```

For `rss` phase errors (no specific video):

```json
{ "ts": "2026-06-09T23:00:00.000Z", "channelId": 1, "channelName": "Some Channel", "phase": "rss", "error": "Failed to fetch RSS feed: 404" }
```

---

## Video Lifecycle

```
RSS feed poll
│
├─ fetchChannelVideos fails
│   └─ log phase=rss, skip channel, retry next poll cycle
│
└─ New video found → INSERT into videos (analysis_status='pending')
    │
    ├─ fetchTranscript returns empty
    │   └─ log phase=transcript (warning only), continue with description fallback
    │
    └─ analyzeVideo (Claude)
        ├─ timeout    → log phase=timeout, set analysis_status='failed', never shown to users
        ├─ AI error   → log phase=ai,      set analysis_status='failed', never shown to users
        ├─ parse fail → log phase=parse,   set analysis_status='failed', never shown to users
        └─ success    → set analysis_status='done', analyzed_at=NOW, video visible to users

Server restart catch-up (today's pending videos only, attempted once)
│
└─ WHERE analysis_status='pending' AND DATE(created_at)=DATE('now')
    ├─ success → analysis_status='done'
    └─ failure → analysis_status='failed', logged, never retried automatically
```

---

## Admin Manual Retry

The existing `POST /api/videos/:id/reanalyze` endpoint (admin only) will be updated to:
1. Reset `analysis_status = 'pending'`
2. Run analysis immediately
3. On success: set `analysis_status = 'done'`, `analyzed_at = CURRENT_TIMESTAMP`
4. On failure: set `analysis_status = 'failed'`, return error to caller

This is the only way to retry a `failed` video after the automatic catch-up window has passed.

---

## Timeout Configuration

| Constant | Env var | Default | Where |
|---|---|---|---|
| `MARKET_BRIEF_AI_TIMEOUT_MS` | `MARKET_BRIEF_AI_TIMEOUT_MS` | `45000` (45s) | `claude.js` |

---

## Database Migration

New column added to `videos` table via `ALTER TABLE` (safe, non-destructive):

```sql
ALTER TABLE videos ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending';
```

Existing rows with `analyzed_at IS NOT NULL` are migrated to `analysis_status = 'done'`:

```sql
UPDATE videos SET analysis_status = 'done' WHERE analyzed_at IS NOT NULL;
```

Existing rows with `analyzed_at IS NULL` keep `analysis_status = 'pending'` — they will be eligible for the next startup catch-up if they were created today, or remain as `pending` indefinitely otherwise (visible only to admins via reanalyze).

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/db.js` | Add `analysis_status` column migration; backfill existing analyzed videos to `done` |
| `backend/src/claude.js` | Add timeout via `AbortSignal.timeout()`; throw tagged errors (`err.phase`) instead of returning empty data |
| `backend/src/scheduler.js` | Add `marketBriefLog()`; log all phases to `marketbrief.log`; update `analysis_status` on success/failure; restrict catch-up to today's pending videos only |
| `backend/src/routes/videos.js` | Filter `analysis_status = 'done'` in both video queries and the COUNT query; update reanalyze endpoint to reset and set status |
