import React, { useState } from 'react';
import Tooltip from './Tooltip.jsx';

const Tip = ({ label, children }) => <Tooltip label={label}>{children}</Tooltip>;

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ReanalyzeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10" />
      <polyline points="22 2 22 8 16 8" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function UnsubscribeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function ResubscribeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export default function Sidebar({
  channels,
  selectedChannelId,
  onSelect,
  onAdd,
  onDelete,
  onRefresh,
  onReanalyze,
  onToggleSubscription,
  loading,
  currentUser,
  onLogout,
  onBack,
  visibleCountByChannel = {},
  allChannelsVisibleCount = 0,
  category = 'market',
  market = 'us',
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [reanalyzingId, setReanalyzingId] = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  const handleRefresh = async (e, channelId) => {
    e.stopPropagation();
    setRefreshingId(channelId);
    try {
      await onRefresh(channelId);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleReanalyze = async (e, channelId, channelName) => {
    e.stopPropagation();
    if (!window.confirm(`Re-analyze all videos in "${channelName}" with Claude? This may take a few minutes.`)) return;
    setReanalyzingId(channelId);
    try {
      await onReanalyze(channelId);
    } finally {
      setReanalyzingId(null);
    }
  };

  const handleDelete = (e, channelId) => {
    e.stopPropagation();
    if (window.confirm('Remove this channel and all its videos?')) {
      onDelete(channelId);
    }
  };

  return (
    <div className="h-full bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">
            {category === 'healthy' ? 'Health Briefs' : 'Market Briefs'}
          </h1>
        </div>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors duration-150"
          >
            + Add Channel
          </button>
        )}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* All Channels item */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full text-left px-4 py-2.5 flex items-center justify-between group transition-colors duration-100 ${
            selectedChannelId === null
              ? 'bg-blue-600/20 text-blue-300 border-r-2 border-blue-500'
              : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
          }`}
        >
          <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">Overview</span>
                <div className="relative group/ov">
                  <span className="text-zinc-600 text-xs cursor-default select-none">ⓘ</span>
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-200 rounded whitespace-nowrap opacity-0 group-hover/ov:opacity-100 transition-opacity z-50">
                    {category === 'healthy'
                      ? 'Most recent briefs across all health channels'
                      : `Most recent briefs across all ${market === 'india' ? 'India' : 'US'} channels`}
                  </div>
                </div>
              </div>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
              selectedChannelId === null
                ? 'bg-blue-600/40 text-blue-300'
                : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            {allChannelsVisibleCount}
          </span>
        </button>

        {/* Divider */}
        {channels.length > 0 && (
          <div className="mx-4 my-2 border-t border-zinc-800" />
        )}

        {/* Per-channel items */}
        {channels.map((channel) => {
          const isSubscribed = channel.subscribed !== 0;
          return (
            <div
              key={channel.id}
              className={`relative flex flex-col cursor-pointer transition-colors duration-100 ${
                selectedChannelId === channel.id
                  ? 'bg-blue-600/20 border-r-2 border-blue-500'
                  : 'hover:bg-zinc-800'
              }`}
              onClick={() => onSelect(channel.id)}
            >
              {/* Channel name row */}
              <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {!isSubscribed && (
                    <span className="text-xs text-amber-500 flex-shrink-0" title="Unsubscribed — not polling for new videos">⏸</span>
                  )}
                  <span
                    className={`text-sm font-medium truncate ${
                      selectedChannelId === channel.id
                        ? 'text-blue-300'
                        : isSubscribed ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                    title={channel.name}
                  >
                    {channel.name}
                  </span>
                </div>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-mono flex-shrink-0 ${
                    selectedChannelId === channel.id
                      ? 'bg-blue-600/40 text-blue-300'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  {visibleCountByChannel[channel.id] ?? channel.video_count ?? 0}
                </span>
              </div>

              {/* Admin action buttons — always visible */}
              {isAdmin && (
                <div className="flex items-center gap-1.5 px-4 pb-2" onClick={e => e.stopPropagation()}>
                  {isSubscribed && (
                    <Tip label="Fetch new videos now">
                      <button
                        onClick={(e) => handleRefresh(e, channel.id)}
                        disabled={refreshingId === channel.id}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors
                          bg-zinc-800 border-zinc-600 text-blue-400 hover:bg-blue-900/40 hover:border-blue-500 hover:text-blue-300
                          disabled:opacity-50 ${refreshingId === channel.id ? 'animate-spin' : ''}`}
                      >
                        <RefreshIcon />
                      </button>
                    </Tip>
                  )}
                  <Tip label="Re-analyze all videos with Claude">
                    <button
                      onClick={(e) => handleReanalyze(e, channel.id, channel.name)}
                      disabled={reanalyzingId === channel.id}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors
                        bg-zinc-800 border-zinc-600 text-violet-400 hover:bg-violet-900/40 hover:border-violet-500 hover:text-violet-300
                        disabled:opacity-50 ${reanalyzingId === channel.id ? 'animate-spin' : ''}`}
                    >
                      <ReanalyzeIcon />
                    </button>
                  </Tip>
                  <Tip label={isSubscribed ? 'Pause polling (keep videos)' : 'Resume polling'}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleSubscription(channel.id, !isSubscribed); }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors
                        ${isSubscribed
                          ? 'bg-zinc-800 border-zinc-600 text-amber-400 hover:bg-amber-900/40 hover:border-amber-500 hover:text-amber-300'
                          : 'bg-amber-900/30 border-amber-700 text-amber-400 hover:bg-emerald-900/40 hover:border-emerald-500 hover:text-emerald-300'
                        }`}
                    >
                      {isSubscribed ? <UnsubscribeIcon /> : <ResubscribeIcon />}
                    </button>
                  </Tip>
                  <Tip label="Remove channel and all videos">
                    <button
                      onClick={(e) => handleDelete(e, channel.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors
                        bg-zinc-800 border-zinc-600 text-red-400 hover:bg-red-900/40 hover:border-red-500 hover:text-red-300"
                    >
                      <TrashIcon />
                    </button>
                  </Tip>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {channels.length === 0 && !loading && (
          <div className="px-4 py-6 text-center">
            <p className="text-zinc-500 text-sm">No channels yet.</p>
            {isAdmin && (
              <p className="text-zinc-600 text-xs mt-1">Add a YouTube channel to get started.</p>
            )}
          </div>
        )}
      </div>

      {/* Footer — user info + sign out */}
      <div className="p-4 border-t border-zinc-800 space-y-3">
        {currentUser && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-zinc-200 text-sm font-semibold truncate">
                  {currentUser.username}
                </p>
                <span
                  className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono mt-0.5 ${
                    currentUser.role === 'admin'
                      ? 'bg-blue-600/30 text-blue-300'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="flex-shrink-0 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
            <p className="text-zinc-600 text-xs leading-snug">
              ☕ <a href="https://ko-fi.com/inbrief" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">Support via Ko-fi</a> — voluntary, not tax-deductible.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
