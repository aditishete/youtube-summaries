import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import VideoFeed from './components/VideoFeed.jsx';
import AddChannelModal from './components/AddChannelModal.jsx';
import LoginPage from './components/LoginPage.jsx';
import RegisterPage from './components/RegisterPage.jsx';
import LandingPage from './components/LandingPage.jsx';
import SummarizePage from './components/SummarizePage.jsx';
import AnalyticsPage from './components/AnalyticsPage.jsx';
import { getChannels, getVideos, addChannel, deleteChannel, refreshChannel, getMe } from './api.js';

export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('checking'); // 'checking' | 'unauthenticated' | 'authenticated'
  const [currentUser, setCurrentUser] = useState(null);
  const [authPage, setAuthPage] = useState('login'); // 'login' | 'register'
  const [appPage, setAppPage] = useState('landing'); // 'landing' | 'dashboard' | 'summarize'

  // ── Dashboard state ─────────────────────────────────────────────────────────
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ── Pre-warm backend on page load to avoid cold-start delay ─────────────────
  useEffect(() => {
    fetch('/api/health').catch(() => {});
  }, []);

  // ── Auth: check token on mount ──────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setAuthStatus('unauthenticated');
      return;
    }
    getMe()
      .then(({ user }) => {
        setCurrentUser(user);
        setAuthStatus('authenticated');
      })
      .catch(() => {
        localStorage.removeItem('token');
        setAuthStatus('unauthenticated');
      });
  }, []);

  // ── Auth: listen for 401 events from api.js ─────────────────────────────────
  useEffect(() => {
    const handleAuthLogout = () => {
      localStorage.removeItem('token');
      setCurrentUser(null);
      setAuthStatus('unauthenticated');
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
    setAuthPage('login');
  }, []);

  const handleLoginSuccess = useCallback((user) => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
    setAppPage('landing');
  }, []);

  const handleRegisterSuccess = useCallback((user) => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
    setAppPage('landing');
  }, []);

  // ── Dashboard data loading ───────────────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    try {
      const data = await getChannels();
      setChannels(data);
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }, []);

  const loadVideos = useCallback(async (channelId = null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVideos(channelId);
      setVideos(data.videos || []);
    } catch (err) {
      console.error('Failed to load videos:', err);
      setError('Failed to load videos. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data once authenticated
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadChannels();
      loadVideos(null);
    }
  }, [authStatus, loadChannels, loadVideos]);

  // Reload videos when selected channel changes
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadVideos(selectedChannelId);
    }
  }, [selectedChannelId, loadVideos, authStatus]);

  // Auto-refresh every 5 minutes while on the dashboard
  useEffect(() => {
    if (authStatus !== 'authenticated' || appPage !== 'dashboard') return;
    const id = setInterval(() => {
      loadChannels();
      loadVideos(selectedChannelId);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [authStatus, appPage, selectedChannelId, loadChannels, loadVideos]);

  const handleChannelAdded = useCallback(async (url) => {
    await addChannel(url);
    await loadChannels();
    await loadVideos(selectedChannelId);
    setShowAddModal(false);
  }, [loadChannels, loadVideos, selectedChannelId]);

  const handleChannelDeleted = useCallback(async (id) => {
    try {
      await deleteChannel(id);
      if (selectedChannelId === id) {
        setSelectedChannelId(null);
      }
      await loadChannels();
      await loadVideos(selectedChannelId === id ? null : selectedChannelId);
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  }, [loadChannels, loadVideos, selectedChannelId]);

  const handleRefreshChannel = useCallback(async (id) => {
    try {
      await refreshChannel(id);
      await loadChannels();
      await loadVideos(selectedChannelId);
    } catch (err) {
      console.error('Failed to refresh channel:', err);
    }
  }, [loadChannels, loadVideos, selectedChannelId]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    if (authPage === 'register') {
      return (
        <RegisterPage
          onRegister={handleRegisterSuccess}
          onGoLogin={() => setAuthPage('login')}
        />
      );
    }
    return (
      <LoginPage
        onLogin={handleLoginSuccess}
        onGoRegister={() => setAuthPage('register')}
      />
    );
  }

  // Authenticated: route by appPage
  if (appPage === 'landing') {
    return (
      <LandingPage
        currentUser={currentUser}
        onNavigate={setAppPage}
        onLogout={handleLogout}
      />
    );
  }

  if (appPage === 'summarize') {
    return <SummarizePage onBack={() => setAppPage('landing')} onLogout={handleLogout} />;
  }

  if (appPage === 'analytics') {
    return <AnalyticsPage onBack={() => setAppPage('landing')} onLogout={handleLogout} />;
  }

  // appPage === 'dashboard'
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Desktop sidebar (hidden on mobile) */}
      <div className="hidden md:flex md:flex-shrink-0" style={{ width: '280px' }}>
        <Sidebar
          channels={channels}
          selectedChannelId={selectedChannelId}
          onSelect={setSelectedChannelId}
          onAdd={() => setShowAddModal(true)}
          onDelete={handleChannelDeleted}
          onRefresh={handleRefreshChannel}
          loading={loading}
          currentUser={currentUser}
          onLogout={handleLogout}
          onBack={() => setAppPage('landing')}
        />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative w-72 flex-shrink-0 z-10">
            <Sidebar
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelect={(id) => { setSelectedChannelId(id); setMobileSidebarOpen(false); }}
              onAdd={() => { setShowAddModal(true); setMobileSidebarOpen(false); }}
              onDelete={handleChannelDeleted}
              onRefresh={handleRefreshChannel}
              loading={loading}
              currentUser={currentUser}
              onLogout={handleLogout}
              onBack={() => setAppPage('landing')}
            />
          </div>
        </div>
      )}

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">
            {channels.find(c => c.id === selectedChannelId)?.name ?? 'All Channels'}
          </span>
          <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
            Sign out
          </button>
        </div>

        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 max-w-md text-center">
              <p className="text-red-300 font-medium">{error}</p>
              <p className="text-zinc-400 text-sm mt-2">
                Make sure the backend is running on port 3001.
              </p>
            </div>
          </div>
        ) : (
          <VideoFeed
            videos={videos}
            loading={loading}
            selectedChannelId={selectedChannelId}
            channels={channels}
            onBack={() => setAppPage('landing')}
            onLogout={handleLogout}
          />
        )}
      </main>

      {showAddModal && (
        <AddChannelModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleChannelAdded}
        />
      )}
    </div>
  );
}
