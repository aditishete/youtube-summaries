# Multi-Platform Video Support & WhatsApp Integration

## Overview

Extend InBrief beyond YouTube to support video content from any platform, delivered via WhatsApp or the existing Video In Brief UI.

---

## Use Case

Users forward video clips (WhatsApp videos, Instagram Reels, Facebook clips, CNBC/Bloomberg snippets, etc.) to a WhatsApp number and receive an AI-generated summary and trade signals back in the chat. The same pipeline also powers a universal "paste any URL" upgrade to Video In Brief.

---

## Architecture

```
Input (WhatsApp media file or any video URL)
  → yt-dlp      — download video from any platform
  → ffmpeg       — extract audio track (drop video)
  → Groq Whisper — transcribe audio to text (free)
  → Claude       — summarize + extract tickers/signals (existing pipeline)
  → Output       — WhatsApp reply or Video In Brief result
```

### Key tools

| Tool | Purpose | Cost |
|---|---|---|
| **yt-dlp** | Download video from 1,000+ platforms given a URL | Free, open-source |
| **ffmpeg** | Extract audio from video file | Free, open-source |
| **Groq Whisper API** | Speech-to-text transcription (large-v3 model) | Free tier; same interface as OpenAI Whisper API |
| **WhatsApp Business API** | Receive/send messages (via Twilio or Meta Cloud API) | Per-message cost |

Both `yt-dlp` and `ffmpeg` are Linux binaries — add to Dockerfile with one line each.

---

## WhatsApp Integration

### Flow

1. User forwards a video (file or URL) to the InBrief WhatsApp number
2. Webhook fires to `POST /api/whatsapp/webhook`
3. Backend downloads/receives the media, runs the pipeline above
4. Summary + tickers sent back to the user's WhatsApp number

### WhatsApp API options

- **Twilio** — easier setup, better dev experience, slightly higher per-message cost
- **Meta Cloud API** — direct integration, lower cost, more complex setup

### Message format

WhatsApp has a 4,096 character limit. Response format:

```
📹 [Video title or source]

Summary:
[2-3 sentence summary]

Tickers: AAPL · NVDA · SPY
Signals: AAPL: BUY — Strong momentum
```

### Rate limiting

Rate limit by phone number to prevent abuse — e.g. 10 summaries/day per number.

---

## Video In Brief upgrade

Replace the current YouTube-only transcript approach with the yt-dlp + Whisper pipeline. This makes "paste any URL" work for YouTube, Instagram, Facebook, TikTok, Twitter/X, Vimeo, Rumble, and more.

**Current:** URL → YouTube transcript API → Claude  
**New:** URL → yt-dlp → ffmpeg → Groq Whisper → Claude

YouTube would still use the existing transcript API when available (faster, free, no audio processing) — fall back to yt-dlp + Whisper only when no transcript exists.

---

## Platform notes

### Instagram / Facebook
- Public posts and Reels work with yt-dlp
- Private content requires stored login credentials (not recommended)
- Against Meta ToS at scale — acceptable for personal/demo use

### WhatsApp video files
- Max 16MB per clip (WhatsApp compression limit)
- yt-dlp not needed — media file received directly via webhook
- ffmpeg + Whisper pipeline applies directly

### YouTube
- Prefer existing transcript API (free, fast, accurate)
- yt-dlp + Whisper as fallback for videos with no captions

---

## Infrastructure changes

**Dockerfile additions:**
```dockerfile
RUN apk add --no-cache ffmpeg yt-dlp
```

**New env var:**
```
GROQ_API_KEY=<key>
```

**New backend routes:**
- `POST /api/whatsapp/webhook` — receive and process WhatsApp messages
- Existing `POST /api/summarize` — extended to handle non-YouTube URLs via yt-dlp

---

## Fly.io considerations

- Current backend: 512MB RAM, shared CPU
- `whisper.cpp` tiny model could run locally but accuracy is lower and memory is tight
- **Groq API recommended** — no memory pressure, free tier, high quality
- If WhatsApp volume grows, may need to upgrade machine size for concurrent yt-dlp + ffmpeg jobs

---

## What's deferred

- Multi-language support (Whisper handles it natively, no extra work)
- Speaker identification / diarization
- Audio-only content (podcasts, Spotify) — same pipeline, skip ffmpeg step
- WhatsApp group support
- Storing WhatsApp summaries per phone number (vs per user account)
