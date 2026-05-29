import { YoutubeTranscript } from 'youtube-transcript';

/**
 * Fetches the transcript for a YouTube video and returns it as a plain string.
 * Returns empty string if no transcript is available.
 */
export async function fetchTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    return segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    try {
      // Retry without language preference (picks whatever's available)
      const segments = await YoutubeTranscript.fetchTranscript(videoId);
      return segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }
}
