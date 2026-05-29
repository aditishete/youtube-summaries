import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import VideoFeed from './components/VideoFeed.jsx';
import AddChannelModal from './components/AddChannelModal.jsx';
import LoginPage from './components/LoginPage.jsx';
import RegisterPage from './components/RegisterPage.jsx';
import LandingPage from './components/LandingPage.jsx';
import SummarizePage from './components/SummarizePage.jsx';
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
    return <SummarizePage onBack={() => setAppPage('landing')} />;
  }

  // appPage === 'dashboard'
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Fixed sidebar */}
      <div className="w-70 flex-shrink-0" style={{ width: '280px' }}>
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

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto">
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
