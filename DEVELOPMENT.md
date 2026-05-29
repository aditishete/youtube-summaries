# Development Guide

## Prerequisites

- Node.js 20+
- Docker Desktop (for local containerised runs)
- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) (for remote deploys)
- An Anthropic API key

---

## Running Locally

### Option A — Docker Compose (recommended, mirrors production)

```bash
# From the repo root
cp .env.example .env          # fill in ANTHROPIC_API_KEY and JWT_SECRET
docker compose up --build
```

App is at http://localhost:3000. The SQLite database is stored in a Docker named volume (`db_data`) and persists across restarts.

To stop:
```bash
docker compose down           # keeps data
docker compose down -v        # also deletes the database volume
```

### Option B — Run processes directly

**Backend**
```bash
cd backend
cp .env.example .env          # fill in values
npm install
node src/index.js
```
Backend runs on http://localhost:3001. Database is written to `../data/dashboard.db` relative to the repo root.

**Frontend** (separate terminal)
```bash
cd frontend
npm install
npm run dev
```
Dev server runs on http://localhost:5173 and proxies `/api/*` to `http://localhost:3001`.

---

## Environment Variables

### Backend (`.env` or Docker/Fly secrets)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Claude API key for AI analysis |
| `JWT_SECRET` | yes | `dev-secret-change-me` | Secret for signing JWT tokens |
| `PORT` | no | `3001` | Port the Express server listens on |
| `POLL_INTERVAL_MINUTES` | no | `30` | How often to poll YouTube RSS feeds |

### Frontend (build-time / Docker env)

| Variable | Required | Description |
|---|---|---|
| `BACKEND_HOST` | yes (Docker/Fly) | Hostname:port nginx proxies `/api/` to. Set to `backend:3001` locally, `yt-summary-backend.internal:3001` on Fly. Not needed for `npm run dev` (Vite proxy handles it). |

---

## Building

### Frontend production build
```bash
cd frontend
npm run build        # output in frontend/dist/
```

### Docker images
```bash
docker compose build                     # both services
docker compose build backend             # backend only
docker compose build frontend            # frontend only
```

---

## Testing

There is no automated test suite. Manual test checklist:

**Auth**
- [ ] Register a new account
- [ ] Log in / log out
- [ ] Token persists across page refresh

**Market Feed (admin)**
- [ ] Add a YouTube channel by URL
- [ ] Verify videos appear after refresh
- [ ] Refresh a channel manually
- [ ] Delete a channel

**Market Feed (viewer)**
- [ ] Browse all channels and per-channel views
- [ ] Download CSV and PDF exports

**Video Brief**
- [ ] Paste a YouTube URL and get a brief
- [ ] History table shows up to 20 past briefs
- [ ] Download CSV and PDF exports

**Analytics (admin only)**
- [ ] Analytics card visible on landing page for admin, hidden for viewers
- [ ] Stat cards show correct totals
- [ ] Viewer role gets 403 when hitting `/api/analytics` directly

---

## Deploying to Fly.io

Both apps must be deployed separately. Fly.io config files live at `backend/fly.toml` and `frontend/fly.toml`.

### First-time setup

```bash
flyctl auth login

# Backend
flyctl apps create yt-summary-backend --region iad
flyctl volumes create summary_data --app yt-summary-backend --region iad --size 1
flyctl secrets set ANTHROPIC_API_KEY=<key> JWT_SECRET=<secret> --app yt-summary-backend

# Frontend
flyctl apps create yt-summary-frontend --region iad
```

### Deploy

```bash
# Backend
cd backend
flyctl deploy --config fly.toml

# Frontend
cd frontend
flyctl deploy --config fly.toml
```

### Useful Fly commands

```bash
# View logs
flyctl logs --app yt-summary-backend

# SSH into backend machine
flyctl ssh console --app yt-summary-backend

# Check machine status
flyctl status --app yt-summary-backend
flyctl status --app yt-summary-frontend

# Update a secret
flyctl secrets set ANTHROPIC_API_KEY=<new-key> --app yt-summary-backend

# List secrets (names only, not values)
flyctl secrets list --app yt-summary-backend
```

---

## Exporting / Importing Data

These utility scripts live in `backend/` and are not part of the app.

**Export local database to JSON** (run from `backend/`):
```bash
node export_local.mjs   # writes ../fly_import.json
```

**Import JSON into the running remote machine**:
```bash
# Upload files
flyctl sftp shell --app yt-summary-backend <<EOF
put fly_import.json /tmp/fly_import.json
put backend/do_import.mjs /tmp/do_import.mjs
EOF

# Run import
flyctl ssh console --app yt-summary-backend --command "/bin/sh -c 'node /tmp/do_import.mjs'"
```
