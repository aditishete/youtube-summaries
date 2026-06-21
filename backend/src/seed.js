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

// Sentinel hash — valid bcrypt format but no plaintext can produce it.
// Used when GUEST_PASSWORD is unset so normal login always fails, but
// the guest row still satisfies the NOT NULL constraint.
const UNUSABLE_HASH = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function seedGuestUser() {
  const guestPassword = process.env.GUEST_PASSWORD;
  const hash = guestPassword ? await bcrypt.hash(guestPassword, 10) : UNUSABLE_HASH;

  const existing = db.prepare("SELECT id FROM users WHERE username = 'guest'").get();
  if (!existing) {
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
      'guest', hash, 'viewer'
    );
    console.log('[Seed] Guest user created');
  } else if (guestPassword) {
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'guest');
    console.log('[Seed] Guest user password updated');
  }
}
