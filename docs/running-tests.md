# Running Tests

---

## Backend Tests (Vitest)

Backend tests are self-contained — they spin up an in-memory SQLite database and mock all external APIs. **No running server is required.**

### Requirements

- Node.js 20+
- `ANTHROPIC_API_KEY` in the environment — **only** for the quality test suite (all other tests mock the Claude API)

### Run all backend tests

```bash
cd backend
npm test
```

### Run a specific test file

```bash
cd backend
npx vitest run src/test/summarize.test.js
```

### Quality tests (real Claude API + real YouTube)

`src/test/summarize.quality.test.js` calls the real Claude API and real YouTube transcript API to verify AI output quality (correct tickers, signal direction for options trades, etc.). These are automatically skipped when `ANTHROPIC_API_KEY` is not set.

```bash
cd backend
ANTHROPIC_API_KEY=sk-ant-... npm test
```

To run quality tests in isolation:

```bash
cd backend
ANTHROPIC_API_KEY=sk-ant-... npx vitest run src/test/summarize.quality.test.js
```

### Test files

| File | What it covers |
|---|---|
| `src/test/auth.test.js` | Login, register, guest access, JWT validation |
| `src/test/channels.test.js` | Add/delete/refresh channels, subscription toggle |
| `src/test/videos.test.js` | Video feed, pagination, per-channel queries |
| `src/test/summarize.test.js` | Summarize endpoint (inline + async paths), history CRUD, job status polling |
| `src/test/security.test.js` | Rate limiting, CORS, auth headers |
| `src/test/summarize.quality.test.js` | Real AI output quality — requires `ANTHROPIC_API_KEY` |

---

## Frontend Tests (Playwright)

Playwright tests drive a real Chromium browser against the live running app. **A running server is required before tests can start.**

### Why a running server is required

The Playwright config (`frontend/playwright.config.js`) points all tests at `http://localhost:3000`:

```js
// frontend/playwright.config.js
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:3000',  // ← every page.goto('/') resolves here
    headless: true,
  },
});
```

There is no `webServer` directive in the config, so Playwright does **not** start the server itself. If nothing is listening on port 3000, every test will immediately fail with a connection error.

### Architecture of the running stack

```
Playwright (host)
    │  HTTP on localhost:3000
    ▼
Docker: nginx (frontend container, port 3000→80)
    │  proxies /api/* to backend
    ▼
Docker: Node.js Express (backend container, port 3001)
    │
    ├── SQLite DB at /data/dashboard.db (Docker volume: db_data)
    └── Claude API (external, real calls during E2E tests)
```

Both containers are defined in `docker-compose.yml` at the repo root.

---

### Step-by-step: first time setup

**1. Install Playwright browsers (one-time)**

```bash
cd frontend
npx playwright install
```

This downloads Chromium (and optionally Firefox/WebKit) into the local Playwright cache. Only needs to be done once, or after a Playwright version upgrade.

**2. Create the test user account**

The tests log in as `test1` / `pa$$w0rd`. This user must exist in the live database. Register once via the app UI at `http://localhost:3000`, or use the API directly after the stack is running:

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"pa$$w0rd"}'
```

The user persists in the Docker volume (`db_data`) across container restarts. You only need to do this once unless the volume is deleted.

**3. Build and start the stack**

```bash
# From the repo root
docker compose up --build -d
```

- `--build` rebuilds the Docker images from source. Required after any code change to `backend/src/` or `frontend/src/`.
- `-d` runs in detached mode (background).
- First build takes ~60s. Subsequent builds with no dependency changes take ~10s (Docker layer cache).

**4. Verify the stack is healthy**

```bash
curl -s http://localhost:3000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"pa$$w0rd"}'
```

Expected response:
```json
{"token":"eyJ...","user":{"id":...,"username":"test1","role":"viewer"}}
```

If you get a connection error, wait a few seconds and retry — the backend takes ~2s to initialise SQLite on first start.

---

### Running the tests

**Run all Playwright tests**

```bash
cd frontend
npx playwright test
```

**Run a specific test file**

```bash
cd frontend
npx playwright test tests/videobrief.spec.js
```

**Run with a visible browser (useful for debugging)**

```bash
cd frontend
npx playwright test --headed
```

**Run in debug mode (step through interactions)**

```bash
cd frontend
npx playwright test --debug
```

**Override the smoke-test video URL**

The smoke test defaults to `https://www.youtube.com/watch?v=20Y1OG5SFfo`. To test a different video pass the URL as an environment variable:

```bash
cd frontend
VIDEO_BRIEF_TEST_URL=https://www.youtube.com/watch?v=<videoId> npx playwright test
```

---

### Typical run after a code change

```bash
# 1. Rebuild and restart containers with the new code
docker compose up --build -d

# 2. Wait ~3s for backend to start, then run tests
cd frontend && npx playwright test
```

---

### Test files

| File | What it covers |
|---|---|
| `tests/videobrief.spec.js` | **Smoke test** — submits a configurable video URL, verifies a non-empty brief appears in history, deletes it. **Quality test** — submits a known selling-options video (`QQWouCIEAtk`), asserts specific tickers (VRT, CRDO, MU, GLW) and BUY signals for sold-puts positions, deletes the entry. |

---

## Timeouts

| Test type | Timeout | Reason |
|---|---|---|
| Backend Vitest | 5s per test | All external calls are mocked |
| Backend quality tests | 65s per test | Real Claude API + transcript fetch |
| Frontend Playwright | 120s per test | 60s backend inline timeout + up to 25s polling (5 checks × 5s) + buffer |

The 120s Playwright timeout is set in `frontend/playwright.config.js`. Individual locator waits inside the tests use shorter timeouts (3–10s) for UI interactions, and `BRIEF_COMPLETE_TIMEOUT = 100000` (100s) specifically for waiting on the brief to complete.

---

## Rate limits

The backend rate-limits summarize calls to **10 per hour per IP** using an in-memory counter. Running both Playwright tests back-to-back uses 2 calls. After ~5 full test runs within an hour the limit is reached and tests will fail with:

```
Error: Summarize limit reached. You can generate up to 10 briefs per hour.
```

**Fix:** restart the backend container to reset the in-memory counter:

```bash
docker compose restart backend
```

Or rebuild the full stack if you also have code changes:

```bash
docker compose up --build -d
```

---

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Connection refused` on port 3000 | Stack not running | `docker compose up --build -d` |
| `Login failed` / 401 in tests | `test1` user doesn't exist | Register the user (see step 2 above) |
| Brief never completes, test times out | Docker running old code | `docker compose up --build -d` |
| `Summarize limit reached` | 10 briefs/hr rate limit hit | `docker compose restart backend` |
| Row count assertion fails | History from a previous failed run was not cleaned up | Log in as `test1`, manually delete history entries, re-run |

---

## Notes

- **Backend tests are isolated** — they use a fresh in-memory DB per test run and never touch `data/dashboard.db`.
- **Playwright tests use real data** — they write to and read from the live `db_data` Docker volume using the real `test1` account. Each test cleans up the summary it creates (deletes it at the end). If a test fails before the delete step, a leftover entry will remain but future runs handle this correctly via `beforeCount`.
- **Code changes require a Docker rebuild** — the frontend and backend are built into Docker images at `docker compose up --build` time. Editing source files on the host does not affect the running containers until a rebuild.
