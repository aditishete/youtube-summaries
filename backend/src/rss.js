/**
 * YouTube channel video fetching via YouTube Data API v3.
 * Replaces RSS feed polling which is blocked on cloud IPs.
 *
 * Quota cost: ~1 unit per channel per poll (playlistItems.list).
 * With 8 channels × 144 polls/day = ~1,152 units/day (well within 10k free quota).
 */

/**
 * Resolves various YouTube inputs to a channel ID.
 * Accepts: channel URL, @handle, or raw UC... ID.
 */
export async function resolveChannelId(input) {
  const str = input.trim();

  // Match /channel/UCxxxxxx in URL
  const channelUrlMatch = str.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelUrlMatch) return channelUrlMatch[1];

  // Raw channel ID (starts with UC, 24 chars)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(str)) return str;

  // @handle in URL or bare @handle
  const handleMatch = str.match(/\/@([a-zA-Z0-9_.-]+)/) || str.match(/^@([a-zA-Z0-9_.-]+)$/);
  if (handleMatch) {
    const handle = handleMatch[1];
    try {
      const response = await fetch(`https://www.youtube.com/@${handle}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const patterns = [
        /"browseId":"(UC[a-zA-Z0-9_-]+)"/,
        /"externalId":"(UC[a-zA-Z0-9_-]+)"/,
        /"channelId":"(UC[a-zA-Z0-9_-]+)"/,
        /channel\/(UC[a-zA-Z0-9_-]{22})"/,
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m) return m[1];
      }
      throw new Error(`Could not find channel ID in page for @${handle}`);
    } catch (err) {
      throw new Error(`Failed to resolve @${handle}: ${err.message}`);
    }
  }

  throw new Error(
    `Unable to resolve channel ID from input: "${str}". ` +
    'Provide a YouTube channel URL, @handle, or UC... channel ID.'
  );
}

/**
 * Fetches recent videos from a YouTube channel using the YouTube Data API v3.
 * Requires YOUTUBE_API_KEY environment variable.
 *
 * @param {string} channelId - YouTube channel ID (UC...)
 * @param {number} limit - max videos to return
 * @param {Date|null} sinceDate - only return videos published on or after this date
 */
export async function fetchChannelVideos(channelId, limit = 5, sinceDate = null) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set — cannot fetch channel videos');

  // A channel's uploads playlist ID is the channel ID with UC → UU prefix
  const uploadsPlaylistId = channelId.replace(/^UC/, 'UU');

  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('playlistId', uploadsPlaylistId);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('maxResults', '50');

  let res;
  try {
    res = await fetch(url.toString());
  } catch (err) {
    throw new Error(`YouTube API request failed: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`YouTube API error ${res.status}: ${body.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const raw = (data.items || []).filter(
    item => item.snippet.title !== 'Deleted video' && item.snippet.title !== 'Private video'
  );

  const channelName = raw[0]?.snippet?.channelTitle || 'Unknown Channel';

  let items = raw.map(item => ({
    videoId:     item.snippet.resourceId.videoId,
    title:       item.snippet.title,
    description: item.snippet.description || '',
    publishedAt: item.snippet.publishedAt,
    thumbnail:   item.snippet.thumbnails?.high?.url
               || item.snippet.thumbnails?.medium?.url
               || item.snippet.thumbnails?.default?.url
               || `https://i.ytimg.com/vi/${item.snippet.resourceId.videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
  }));

  if (sinceDate) {
    items = items.filter(item => new Date(item.publishedAt) >= sinceDate);
  }

  return {
    channelName,
    channelId,
    items: items.slice(0, limit),
  };
}
