import React, { useState } from 'react';
import { register } from '../api.js';

export default function RegisterPage({ onRegister, onGoLogin, pendingShare, pendingVideoLink }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await register(username.trim(), password);
      localStorage.setItem('token', token);
      onRegister(user);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* App title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
            MarketBrief
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Create an account to get started
          </p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-zinc-100 mb-5">Create Account</h2>

          {pendingShare && (
            <div className="bg-violet-900/30 border border-violet-700/50 rounded-lg px-4 py-3 mb-4 flex items-start gap-2.5">
              <span className="text-violet-400 flex-shrink-0 mt-0.5">▶</span>
              <p className="text-violet-200 text-sm leading-snug">
                Someone shared a video analysis with you. Create an account to view it.
              </p>
            </div>
          )}
          {pendingVideoLink && (
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-4 py-3 mb-4 flex items-start gap-2.5">
              <span className="text-blue-400 flex-shrink-0 mt-0.5">📈</span>
              <p className="text-blue-200 text-sm leading-snug">
                Someone shared a market brief with you. Create an account to view it.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="At least 3 characters"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="At least 6 characters"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors duration-150 mt-2"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* Viewer access note */}
          <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-4 py-3 mt-4">
            <p className="text-zinc-400 text-xs leading-relaxed">
              New accounts have viewer access. Contact admin to request additional permissions.
            </p>
          </div>

          <p className="text-center text-zinc-500 text-sm mt-4">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onGoLogin}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
