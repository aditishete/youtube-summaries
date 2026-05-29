# MarketBrief

AI-powered YouTube investment intelligence dashboard. MarketBrief tracks investment YouTube channels, extracts trade signals and ticker mentions from new videos using Claude AI, and lets any user get an instant AI summary of any YouTube video.

---

## Features

### Market Feed
- Tracks subscribed YouTube channels via RSS
- Automatically fetches new videos every 30 minutes and on startup
- Each video is analyzed by Claude AI to produce:
  - Plain-English summary
  - Ticker symbols mentioned (e.g. AAPL, TSLA)
  - Trade signals: **BUY / SELL / WATCH** with reasoning
- View by channel or across all channels
- Export to CSV or PDF

### Video Brief
- Paste any YouTube URL to get an instant AI summary in English
- Works regardless of the video's original language
- Keeps the last 20 briefs per user
- Export history to CSV or PDF

### Analytics *(admin only)*
- Total users, visits today, briefs this month
- Top 25 most active users: visit counts and brief counts broken down by today / week / month / all-time / per-day average

---

## Remote Access

| | URL |
|---|---|
| App | https://yt-summary-frontend.fly.dev |
| API | https://yt-summary-backend.fly.dev |

### Accounts

| Username | Password | Role |
|---|---|---|
| `summary-app-admin` | `pa$$w0rd` | admin |

New accounts can self-register via the sign-up page. All self-registered users get the **viewer** role. Only admins can add/remove/refresh channels and view analytics.

---

## Usage

1. Open https://yt-summary-frontend.fly.dev and sign in (or register)
2. **Market Feed** — click "Open feed →" to browse tracked channels and their AI-analyzed videos
3. **Video Brief** — click "Get a video brief →", paste a YouTube URL, click "Get Brief"
4. **Analytics** — admin only, click "View analytics →" on the landing page

### Admin tasks
- **Add a channel**: in the Market Feed sidebar click "+ Add Channel" and paste a YouTube channel URL
- **Refresh a channel**: hover over it in the sidebar and click the refresh icon
- **Remove a channel**: hover and click the trash icon (also deletes its videos)
