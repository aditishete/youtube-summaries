import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    feed: [['yt:channelId', 'channelId']],
    item: [['yt:videoId', 'videoId'], ['media:group', 'mediaGroup']],
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

/**
 * Resolves various YouTube inputs to a channel ID.
 * Accepts: channel URL, @handle, or raw UC... ID.
 */
export async function resolveChannelId(input) {
  const str = input.trim();

  // Match /channel/UCxxxxxx in URL
  const channelUrlMatch = str.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelUrlMatch) {
    return channelUrlMatch[1];
  }

  // If it looks like a raw channel ID (starts with UC, 24 chars)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(str)) {
    return str;
  }

  // Match /@handle in URL or bare @handle
  const handleMatch = str.match(/\/@([a-zA-Z0-9_.-]+)/) || str.match(/^@([a-zA-Z0-9_.-]+)$/);
  if (handleMatch) {
    const handle = handleMatch[1];
    const pageUrl = `https://www.youtube.com/@${handle}`;
    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching YouTube page for @${handle}`);
      }
      const html = await response.text();
      // YouTube pages use different keys depending on page version
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
 * Fetches recent videos from a YouTube channel's RSS feed.
 * @param {string} channelId
 * @param {number} limit - max number of videos to return
 * @param {Date|null} sinceDate - if set, only return videos published on or after this date
 */
export async function fetchChannelVideos(channelId, limit = 5, sinceDate = null) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch (err) {
    // Retry once after 5s — YouTube occasionally returns transient 404/500 from cloud IPs
    await new Promise(r => setTimeout(r, 5000));
    try {
      feed = await parser.parseURL(feedUrl);
    } catch (retryErr) {
      throw new Error(`Failed to fetch RSS feed for channel ${channelId}: ${retryErr.message}`);
    }
  }

  const channelName = feed.title || 'Unknown Channel';
  const resolvedChannelId = feed.channelId || channelId;

  let feedItems = feed.items || [];
  if (sinceDate) {
    feedItems = feedItems.filter(item => item.isoDate && new Date(item.isoDate) >= sinceDate);
  }

  const items = feedItems.slice(0, limit).map((item) => {
    // Extract videoId from item or from URL
    let videoId = item.videoId;
    if (!videoId && item.link) {
      const match = item.link.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      if (match) videoId = match[1];
    }

    const description =
      item.mediaGroup?.['media:description']?.[0] ||
      item.contentSnippet ||
      '';

    return {
      videoId,
      title: item.title || 'Untitled',
      url: item.link || `https://www.youtube.com/watch?v=${videoId}`,
      description,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: item.isoDate || new Date().toISOString(),
    };
  });

  return {
    channelName,
    channelId: resolvedChannelId,
    items,
  };
}
