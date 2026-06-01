const BASE = '/api';

// ── Auth helpers ─────────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem('token');
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Safely parse JSON — if the server returns HTML (e.g. nginx 502 during cold start),
// throw a friendly message instead of a confusing parse error.
async function safeJSON(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('Server is starting up, please try again in a moment.');
  }
  return res.json();
}

/**
 * Wraps fetch for authenticated requests.
 * If the response is 401, dispatches 'auth:logout' so App can clear state.
 */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:logout'));
  }

  return res;
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data; // { token, user }
}

export async function register(username, password) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data; // { token, user }
}

export async function getMe() {
  const res = await apiFetch(`${BASE}/auth/me`);
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Not authenticated');
  return data; // { user }
}

// ── Channels API ──────────────────────────────────────────────────────────────

export const getChannels = async () => {
  const res = await apiFetch(`${BASE}/channels`);
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to fetch channels');
  return data;
};

export const addChannel = async (url) => {
  const res = await apiFetch(`${BASE}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to add channel');
  return data;
};

export const deleteChannel = async (id) => {
  const res = await apiFetch(`${BASE}/channels/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete channel');
  }
  return res;
};

export const refreshChannel = async (id) => {
  const res = await apiFetch(`${BASE}/channels/${id}/refresh`, { method: 'POST' });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to refresh channel');
  return data;
};

// ── Videos API ────────────────────────────────────────────────────────────────

export const getVideos = async (channelId = null, limit = 50, offset = 0) => {
  const params = new URLSearchParams({ limit, offset });
  if (channelId) params.set('channel_id', channelId);
  const res = await apiFetch(`${BASE}/videos?${params}`);
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to fetch videos');
  return data;
};

export const summarizeVideo = async (url) => {
  const res = await apiFetch(`${BASE}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Summarization failed');
  return data;
};

export const getSummaryHistory = async () => {
  const res = await apiFetch(`${BASE}/summarize/history`);
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to fetch history');
  return data;
};

export const deleteVideo = async (id) => {
  const res = await apiFetch(`${BASE}/videos/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete video');
  }
  return res;
};

export const deleteSummaryItem = async (id) => {
  const res = await apiFetch(`${BASE}/summarize/history/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete summary');
  }
  return res;
};

export const reanalyzeVideo = async (id) => {
  const res = await apiFetch(`${BASE}/videos/${id}/reanalyze`, { method: 'POST' });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Reanalysis failed');
  return data;
};

export const trackPageView = async (page) => {
  try {
    await apiFetch(`${BASE}/analytics/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page }),
    });
  } catch {}
};

export const getAnalytics = async () => {
  const res = await apiFetch(`${BASE}/analytics`);
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to fetch analytics');
  return data;
};
