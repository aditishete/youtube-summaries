import jwt from 'jsonwebtoken';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function recordVisit(userId) {
  const last = db.prepare(
    'SELECT visited_at FROM user_visits WHERE user_id = ? ORDER BY visited_at DESC LIMIT 1'
  ).get(userId);
  const now = Date.now();
  if (!last || now - new Date(last.visited_at).getTime() > 60 * 60 * 1000) {
    db.prepare('INSERT INTO user_visits (user_id) VALUES (?)').run(userId);
  }
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, username: payload.username, role: payload.role };
    recordVisit(payload.id);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}
