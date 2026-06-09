# Video Brief Async Job Design

## Overview

Summarization via the Claude API can take more than a few seconds for long videos. To avoid browser timeouts and provide clear feedback to the user, the summarize flow is redesigned as an **async job with polling**. Jobs that complete quickly return inline; jobs that take longer are persisted to the database and polled by the frontend.

---

## Configurable Constants (backend)

| Constant | Default | Description |
|---|---|---|
| `BRIEF_INLINE_TIMEOUT_MS` | `60000` | How long the POST endpoint waits before returning `pending` |
| `BRIEF_JOB_TTL_MINUTES` | `10` | How long a completed/failed job is kept in DB before cleanup |

## Configurable Constants (frontend)

| Constant | Default | Description |
|---|---|---|
| `BRIEF_POLL_INTERVAL_MS` | `5000` | How often the frontend polls the status endpoint |
| `BRIEF_MAX_POLL_ATTEMPTS` | `5` | Max polls before reporting failure to user |

---

## API

### POST `/api/summarize`

Starts the summarization job. Waits up to `BRIEF_INLINE_TIMEOUT_MS` for it to finish.

**Response — completed inline:**
```json
{ "status": "done", "result": { ...summaryObject } }
```

**Response — still running after inline timeout:**
```json
{ "status": "pending", "jobId": "abc123" }
```

**Response — failed (transcript missing, AI error, etc.):**
```json
{ "status": "failed", "error": "No transcript available for this video." }
```

### GET `/api/summarize/status/:jobId`

Checks job status. Always reads from the database.

**Response — still running:**
```json
{ "status": "pending" }
```

**Response — completed:**
```json
{ "status": "done", "result": { ...summaryObject } }
```

**Response — failed:**
```json
{ "status": "failed", "error": "AI summarization failed." }
```

---

## Backend Job Lifecycle

```
POST /api/summarize
│
├─ Start job async (Promise, stored in in-memory Map keyed by jobId)
│
├─ Wait up to BRIEF_INLINE_TIMEOUT_MS
│   │
│   ├─ Job finishes in time
│   │   ├─ success → return { status: 'done', result }   (no DB job record written)
│   │   └─ failure → return { status: 'failed', error }  (no DB job record written)
│   │
│   └─ Timeout fires (job still running)
│       ├─ Write job record to DB: { jobId, user_id, status: 'pending', ... }
│       └─ Return { status: 'pending', jobId }
│
└─ Job continues running in background
    ├─ On success → UPDATE DB: status='done', result=JSON
    └─ On failure → UPDATE DB: status='failed', error=message
         └─ Log to videobriefs.log

GET /api/summarize/status/:jobId
└─ Read job row from DB
    ├─ status='pending' → return { status: 'pending' }
    ├─ status='done'    → return { status: 'done', result }
    └─ status='failed'  → return { status: 'failed', error }
```

---

## Database Schema

New table: `summary_jobs`

```sql
CREATE TABLE IF NOT EXISTS summary_jobs (
  id          TEXT PRIMARY KEY,          -- UUID jobId
  user_id     INTEGER NOT NULL,
  url         TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  result      TEXT,                      -- JSON-serialized summary object (nullable)
  error       TEXT,                      -- error message if failed (nullable)
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Notes:**
- A job row is only written if the job does NOT complete within `BRIEF_INLINE_TIMEOUT_MS`.
- Fast jobs (done inline) never touch this table — they follow the existing flow.
- A background cleanup pass (or TTL check on read) removes rows older than `BRIEF_JOB_TTL_MINUTES`.

---

## Frontend Flow

```
User submits URL
│
├─ POST /api/summarize
│   Show: "Fetching transcript & summarizing… this usually takes 5–10 seconds."
│   │
│   ├─ { status: 'done' }   → display summary, done
│   ├─ { status: 'failed' } → show error message, done
│   └─ { status: 'pending', jobId }
│       Show: "This is taking longer than expected — we'll check back shortly."
│       Start polling loop (pollAttempt = 0)
│
└─ Polling loop: GET /api/summarize/status/:jobId every BRIEF_POLL_INTERVAL_MS
    │
    ├─ { status: 'done' }
    │   → display summary in history, clear loading state, done
    │
    ├─ { status: 'failed' }
    │   → show error message, clear loading state, done
    │
    ├─ { status: 'pending' } and pollAttempt < BRIEF_MAX_POLL_ATTEMPTS
    │   → increment pollAttempt, wait, poll again
    │
    └─ { status: 'pending' } and pollAttempt >= BRIEF_MAX_POLL_ATTEMPTS
        → show: "Brief generation is taking too long. Please try again later."
        → clear loading state, done
```

---

## Logging

All errors during brief generation are written to **`videobriefs.log`** in the backend data directory (alongside `dashboard.db`), regardless of whether the job completed inline or ran async.

Log format (one JSON object per line):
```json
{ "ts": "2026-06-09T12:00:00.000Z", "jobId": "abc123", "userId": 42, "url": "https://...", "phase": "transcript|ai|parse|timeout", "error": "message" }
```

Phases:
- `transcript` — `fetchTranscript` failed or returned null (inline or async)
- `ai` — Anthropic API call failed or timed out (inline or async)
- `parse` — JSON parse of AI response failed (inline or async)
- `timeout` — job exceeded `BRIEF_INLINE_TIMEOUT_MS` and was promoted to async

This means even fast-failing inline jobs (e.g. bad URL, missing transcript) are logged.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `backend/src/db.js` | Add `summary_jobs` table migration |
| `backend/src/routes/summarize.js` | Rewrite POST handler; add GET `/status/:jobId`; add job runner; add logger |
| `frontend/src/api.js` | Add `pollBriefStatus(jobId)` function; update `summarizeVideo` return handling |
| `frontend/src/components/SummarizePage.jsx` | Handle `pending` response; implement polling loop with configurable constants; update loading messages |
