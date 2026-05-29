# Architecture Notes

## System Overview

```
Browser
  │
  ▼
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (nginx)        │        │  Backend (Express)            │
│  yt-summary-frontend     │──/api/─▶  yt-summary-backend          │
│  Fly.io  :80             │        │  Fly.io  :3001 (internal)     │
│                          │        │                               │
│  React 18 + Vite 5       │        │  Node.js 20 + ES modules      │
│  Tailwind CSS 3          │        │  SQLite (node-sqlite3-wasm)   │
│  jsPDF + autotable       │        │  JWT auth (7-day tokens)      │
└─────────────────────────┘        │  Claude API (claude-sonnet-   │
                                    │    4-6)                       │
                                    │  YouTube RSS + transcripts    │
                                    └──────────────┬───────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Fly Volume      │
                                          │  /data/          │
                                          │  dashboard.db    │
                                          └─────────────────┘
```

The frontend and backend are two separate Fly.io apps. They communicate over Fly's private network (`*.internal`). The backend is not publicly reachable on port 3001 — all traffic goes through nginx on the frontend.

---

## Frontend

**Stack:** React 18, Vite 5, Tailwind CSS 3, React Router (none — manual state routing)

**Routing** is handled by an `appPage` state variable in `App.jsx` rather than a URL router:
- `landing` — home screen with feature cards
- `dashboard` — Market Feed (sidebar + video list)
- `summarize` — Video Brief page
- `analytics` — Admin analytics page

**nginx** serves the static build and proxies `/api/*` to the backend. The backend hostname is injected at container start via the `BACKEND_HOST` environment variable using `envsubst`. A custom `docker-entrypoint.sh` substitutes only `$BACKEND_HOST`, leaving nginx's own variables (`$host`, `$remote_addr`) untouched.

**PDF export** uses jsPDF with `willDrawCell` / `didDrawCell` hooks for custom cell rendering (bold tickers, clickable URLs). Characters outside Latin-1 are stripped before rendering because jsPDF's built-in Helvetica font cannot handle them.

---

## Backend

**Stack:** Node.js 20, Express, ES modules (`"type": "module"`)

### Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Returns JWT token |
| POST | `/api/auth/register` | public | Creates viewer account, returns JWT |
| GET | `/api/auth/me` | user | Returns current user |
| GET | `/api/channels` | user | List tracked channels |
| POST | `/api/channels` | admin | Add channel by YouTube URL |
| DELETE | `/api/channels/:id` | admin | Remove channel and its videos |
| POST | `/api/channels/:id/refresh` | admin | Re-poll a single channel |
| GET | `/api/videos` | user | List videos (filterable by channel\_id) |
| POST | `/api/summarize` | user | Summarize any YouTube URL, saves to history |
| GET | `/api/summarize/history` | user | Last 20 briefs for the current user |
| GET | `/api/analytics` | admin | User activity stats |

### Scheduler

On startup and every `POLL_INTERVAL_MINUTES` (default 30), the scheduler:
1. Fetches the RSS feed for each tracked channel (last 10 items)
2. Inserts any new videos into the database
3. Fetches the YouTube transcript for each new video
4. Sends title + description + transcript to Claude for analysis
5. Stores the summary, tickers array, and trade signals array back on the video row

If transcript or Claude analysis fails, the video is still saved — it just has no summary.

---

## Database

SQLite, managed via **node-sqlite3-wasm** (pure WASM build — no native compilation needed, works in any Docker image without build tools).

**Important:** node-sqlite3-wasm loads the database file into memory on open and flushes it back to disk on `close()`. The `close()` is called on `process.exit`, `SIGTERM`, and `SIGINT`. This means a hard kill (`SIGKILL`) could lose in-flight writes, but normal Fly.io stop/restart/deploy cycles use `SIGTERM` and are safe.

The database file lives at `../../data/dashboard.db` relative to `backend/src/db.js`, which resolves to:
- Local dev: `<repo-root>/data/dashboard.db`
- Docker / Fly.io: `/data/dashboard.db` (on the persistent volume)

### Schema

```sql
users (
  id, username UNIQUE, password_hash, role ('admin'|'viewer'), created_at
)

channels (
  id, youtube_id UNIQUE, name, rss_url, thumbnail_url, created_at, last_fetched_at
)

videos (
  id, channel_id FK, youtube_id UNIQUE, title, description, url,
  thumbnail_url, published_at, summary, tickers JSON, trade_signals JSON,
  analyzed_at, created_at
)

user_summaries (
  id, user_id FK, youtube_id, title, thumbnail, url,
  summary, key_points JSON, created_at
  -- max 20 rows per user, oldest pruned on insert
)

user_visits (
  id, user_id FK, visited_at
  -- one row per user per hour, recorded in auth middleware
)
```

---

## Authentication

JWT tokens signed with `JWT_SECRET`, expiring after 7 days. The token payload carries `{ id, username, role }`. Tokens are stored in `localStorage` on the client.

The auth middleware (`requireAuth`) also records a visit row for the user at most once per hour — this is how analytics visit counts are populated.

Role model:
- **viewer** — read all data, create own briefs
- **admin** — everything viewers can do, plus add/remove/refresh channels and view analytics

---

## Deployment

Two separate Fly.io apps in the `iad` (Virginia) region:

| App | Machine | Volume |
|---|---|---|
| `yt-summary-backend` | shared-cpu-1x 512 MB | `summary_data` mounted at `/data` |
| `yt-summary-frontend` | shared-cpu-1x 256 MB | none |

Both apps use `auto_stop_machines = 'stop'` and `auto_start_machines = true` — machines sleep when idle and wake on the first inbound request. Cold start is typically 2–5 seconds.

Secrets stored in Fly (not in code or config files):
- `ANTHROPIC_API_KEY` — backend
- `JWT_SECRET` — backend

The `BACKEND_HOST` for the frontend is set as a plain (non-secret) env var in `frontend/fly.toml`:
```
BACKEND_HOST = "yt-summary-backend.internal:3001"
```
This uses Fly's private IPv6 network — the backend is not exposed to the public internet on port 3001.
