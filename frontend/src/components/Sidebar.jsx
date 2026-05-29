import React, { useState } from 'react';

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
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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
  loading,
  currentUser,
  onLogout,
  onBack,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);

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
          <h1 className="text-base font-bold text-zinc-100 tracking-tight">
            Investment Feed
          </h1>
          {onBack && (
            <button
              onClick={onBack}
              title="Back to home"
              className="text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
            >
              ← Home
            </button>
          )}
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
          <span className="text-sm font-medium">All Channels</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
              selectedChannelId === null
                ? 'bg-blue-600/40 text-blue-300'
                : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            {channels.reduce((acc, c) => acc + (c.video_count || 0), 0)}
          </span>
        </button>

        {/* Divider */}
        {channels.length > 0 && (
          <div className="mx-4 my-2 border-t border-zinc-800" />
        )}

        {/* Per-channel items */}
        {channels.map((channel) => (
          <div
            key={channel.id}
            className={`relative flex items-center group cursor-pointer transition-colors duration-100 ${
              selectedChannelId === channel.id
                ? 'bg-blue-600/20 border-r-2 border-blue-500'
                : 'hover:bg-zinc-800'
            }`}
            onClick={() => onSelect(channel.id)}
            onMouseEnter={() => setHoveredId(channel.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="flex-1 px-4 py-2.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-medium truncate ${
                    selectedChannelId === channel.id ? 'text-blue-300' : 'text-zinc-300'
                  }`}
                  title={channel.name}
                >
                  {channel.name}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-mono flex-shrink-0 ${
                    selectedChannelId === channel.id
                      ? 'bg-blue-600/40 text-blue-300'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  {channel.video_count || 0}
                </span>
              </div>
            </div>

            {/* Action buttons — only for admins, visible on hover */}
            {isAdmin && hoveredId === channel.id && (
              <div className="flex items-center gap-1 pr-3 flex-shrink-0">
                <button
                  onClick={(e) => handleRefresh(e, channel.id)}
                  disabled={refreshingId === channel.id}
                  title="Refresh channel"
                  className={`p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors ${
                    refreshingId === channel.id ? 'animate-spin text-blue-400' : ''
                  }`}
                >
                  <RefreshIcon />
                </button>
                <button
                  onClick={(e) => handleDelete(e, channel.id)}
                  title="Remove channel"
                  className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}

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

      {/* Footer — user info + logout */}
      <div className="p-4 border-t border-zinc-800">
        {currentUser && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-zinc-300 text-sm font-medium truncate">
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
              title="Sign out"
              className="flex-shrink-0 text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
