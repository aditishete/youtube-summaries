# Deploying to Fly.io

Two separate Fly.io apps: **yt-summary-backend** and **yt-summary-frontend**.

## Critical rule: always deploy from the app's own directory

Fly.io uses the **current working directory** as the Docker build context. Running `fly deploy` from the wrong directory will bundle the wrong files into the image and cause a crash.

```
# Correct
cd backend && fly deploy
cd frontend && fly deploy

# Wrong — DO NOT do this
fly deploy --config backend/fly.toml   # from project root or frontend dir
fly deploy --config frontend/fly.toml  # from project root or backend dir
```

---

## First-time setup

### 1. Install and log in

```bash
brew install flyctl
fly auth login
```

### 2. Create the apps (only needed once)

```bash
fly apps create yt-summary-backend
fly apps create yt-summary-frontend
```

### 3. Create the persistent volume for the database (only needed once)

```bash
fly volumes create summary_data --region iad --size 1 -a yt-summary-backend
```

### 4. Set secrets

```bash
fly secrets set JWT_SECRET=<your-secret> -a yt-summary-backend
fly secrets set ANTHROPIC_API_KEY=<your-key> -a yt-summary-backend
```

---

## Deploying

### Backend

```bash
cd backend
fly deploy
```

### Frontend

```bash
cd frontend
fly deploy
```

### Deploy both (from project root)

```bash
(cd backend && fly deploy) && (cd frontend && fly deploy)
```

---

## Useful commands

```bash
# Check machine status
fly machine list -a yt-summary-backend
fly machine list -a yt-summary-frontend

# View live logs
fly logs -a yt-summary-backend
fly logs -a yt-summary-frontend

# Start a stopped machine manually
fly machine start <machine-id> -a yt-summary-backend

# Open an SSH shell on the backend
fly ssh console -a yt-summary-backend

# Check secrets are set (shows names, not values)
fly secrets list -a yt-summary-backend
```

---

## Current configuration

| Setting | Backend | Frontend |
|---|---|---|
| App name | yt-summary-backend | yt-summary-frontend |
| Region | iad (US East) | iad (US East) |
| Machine size | shared-cpu-1x, 512 MB | shared-cpu-1x, 256 MB |
| Auto-stop | off (always running) | stop (sleeps when idle) |
| Min machines | 1 | 0 |
| Persistent volume | `/data/dashboard.db` | — |

The backend is configured to never sleep (`auto_stop_machines = 'off'`, `min_machines_running = 1`).
The frontend wakes on demand since it has no state and starts instantly.

---

## Video limit configuration

These values are hardcoded constants — change them in source and redeploy to take effect.

### Backend — `backend/src/routes/channels.js`

| Constant | Default | Description |
|---|---|---|
| `MAX_RETAINED_VIDEOS_PER_CHANNEL` | `30` | Max videos kept per channel in the database. Older videos are pruned when a channel is added or refreshed. |
| `MAX_INITIAL_FETCH_PER_CHANNEL` | `10` | Max videos fetched when a new channel is added (filtered to the past 7 days). Also used on manual channel refresh. |

### Frontend — `frontend/src/config.js`

| Constant | Default | Description |
|---|---|---|
| `MAX_VIDEOS_PER_CHANNEL` | `3` | Max videos shown per channel in the "All Channels" view. |
| `MAX_RETAINED_VIDEOS_PER_CHANNEL` | `30` | Controls the initial page size in single-channel view and the sidebar video count badge. Should match the backend value. |

### To change these values

1. Edit the constants in `backend/src/routes/channels.js` and/or `frontend/src/config.js`
2. Redeploy the affected app(s):
```bash
# Backend change only
cd backend && fly deploy

# Frontend change only
cd frontend && fly deploy

# Both changed
(cd backend && fly deploy) && (cd frontend && fly deploy)
```

---

## Troubleshooting

**Machine stopped after deploy and won't start**
```bash
fly machine start <machine-id> -a yt-summary-backend
```

**Smoke checks failed / app appears to be crashing**
This usually means the deploy ran from the wrong directory (wrong build context).
Always `cd` into the app directory before running `fly deploy`.

**"Server is starting up" on the frontend for a long time**
The backend machine is stopped. Start it with `fly machine start`.

**Database query from the CLI**
```bash
fly ssh console -a yt-summary-backend --command "node --input-type=module --eval \"
process.env.DB_PATH = '/data/dashboard.db';
const db = (await import('/app/src/db.js')).default;
const rows = db.prepare('SELECT id, username, role FROM users').all();
console.log(JSON.stringify(rows, null, 2));
\""
```
