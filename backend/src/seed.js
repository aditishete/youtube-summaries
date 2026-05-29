import bcrypt from 'bcryptjs';
import db from './db.js';

export async function seedAdminUser() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('summary-app-admin');
  if (!existing) {
    const hash = await bcrypt.hash('pa$$w0rd', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
      'summary-app-admin', hash, 'admin'
    );
    console.log('[Seed] Admin user created: summary-app-admin');
  }
}
