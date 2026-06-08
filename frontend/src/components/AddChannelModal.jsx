import React, { useState, useRef, useEffect } from 'react';

export default function AddChannelModal({ onClose, onAdd }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a YouTube channel URL or @handle.');
      return;
    }

    // Catch common mistakes before hitting the backend
    if (trimmed.includes('results?search_query') || trimmed.includes('/search')) {
      setError("That's a search results page. Go to the channel's page and copy the URL from there.");
      return;
    }
    if (trimmed.includes('/watch?') || trimmed.includes('youtu.be/')) {
      setError("That's a video URL. Open the video, click the channel name, then copy that page's URL.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await onAdd(trimmed);
      setResult(data);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to add channel. Please try again.');
      setLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !loading) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-100">Add YouTube Channel</h2>
          {!loading && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded-lg hover:bg-zinc-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="channel-url" className="block text-sm font-medium text-zinc-300 mb-2">
              Channel URL or Handle
            </label>
            <input
              id="channel-url"
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              placeholder="e.g. @TradingWithAshley or youtube.com/@handle"
              className="w-full bg-zinc-900 border border-zinc-600 text-zinc-100 placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Loading notice */}
          {loading && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5 h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0" />
              <div>
                <p className="text-blue-300 text-sm font-medium">Adding channel...</p>
                <p className="text-blue-400/70 text-xs mt-0.5">
                  Fetching &amp; analyzing up to 10 recent videos with Claude AI. This may take a few minutes.
                </p>
              </div>
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className={`border rounded-lg px-4 py-3 ${result.failed > 0 && result.analyzed === 0 ? 'bg-amber-900/30 border-amber-700' : 'bg-emerald-900/30 border-emerald-700'}`}>
              <p className={`text-sm font-medium ${result.failed > 0 && result.analyzed === 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                ✓ {result.channel?.name} added
              </p>
              {result.attempted === 0 ? (
                <p className="text-zinc-400 text-xs mt-1">No videos found from the past week — the channel will be picked up on the next scheduled poll.</p>
              ) : result.analyzed === result.attempted ? (
                <p className="text-zinc-400 text-xs mt-1">{result.analyzed} video{result.analyzed !== 1 ? 's' : ''} analyzed successfully.</p>
              ) : (
                <p className="text-zinc-400 text-xs mt-1">{result.analyzed} of {result.attempted} video{result.attempted !== 1 ? 's' : ''} analyzed.{result.failed > 0 ? ` ${result.failed} failed — check server logs.` : ''}</p>
              )}
            </div>
          )}

          {/* Hint */}
          {!loading && !error && !result && (
            <div className="text-zinc-500 text-xs space-y-1">
              <p className="font-medium text-zinc-400">How to find a channel URL:</p>
              <p>Go to the channel on YouTube → copy the URL from your browser. It should look like:</p>
              <ul className="space-y-0.5 pl-2">
                <li><span className="text-zinc-300">youtube.com/@handle</span></li>
                <li><span className="text-zinc-300">youtube.com/channel/UCxxxxx</span></li>
                <li>or just <span className="text-zinc-300">@handle</span></li>
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {result ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors"
                >
                  {loading ? 'Adding...' : 'Add Channel'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
