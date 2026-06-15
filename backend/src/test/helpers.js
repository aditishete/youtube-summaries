import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../app.js';
import db from '../db.js';

export const app = createApp();

export async function seedUsers() {
  const adminHash = await bcrypt.hash('adminpass', 4);
  const viewerHash = await bcrypt.hash('viewerpass', 4);
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', adminHash, 'admin');
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('viewer', viewerHash, 'viewer');
}

export async function getToken(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.token;
}

export function resetDB() {
  db.prepare('DELETE FROM user_summaries').run();
  db.prepare('DELETE FROM video_analyses').run();
  db.prepare('DELETE FROM user_visits').run();
  db.prepare('DELETE FROM user_video_requests').run();
  db.prepare('DELETE FROM user_logins').run();
  db.prepare('DELETE FROM user_page_views').run();
  db.prepare('DELETE FROM videos').run();
  db.prepare('DELETE FROM channels').run();
  db.prepare('DELETE FROM users').run();
}

export { db };
