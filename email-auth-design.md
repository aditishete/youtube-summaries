# Email Authentication & Verification — Design

## Summary

Collect email from all users (existing and new), require verification before app access,
and allow login by email or username. Phone is optional. Google OAuth deferred.

---

## User Groups & Behaviour

### Existing users (username + password, no email)
1. Log in with username as usual — this continues to work
2. Immediately after login, a **modal blocks the app** — they cannot dismiss it
3. Modal asks for email (required) and phone (optional)
4. On submit → verification email sent via Resend → modal switches to "Check your inbox"
5. They are logged out and cannot re-enter the app until they click the link
6. On verification → redirected to app, fully unlocked
7. Future logins: username OR email + password both work

### New users (registration going forward)
1. Registration requires: **email** (required), password (required), username (optional), phone (optional)
2. If username is omitted → auto-generated from email prefix, deduplicated with a suffix if taken
   - e.g. `john.doe@gmail.com` → `johndoe`, or `johndoe2` if taken
3. After submit → verification email sent → "Check your inbox" screen shown
4. App is fully blocked until the email link is clicked
5. Login with email + password (or username + password once they know their auto-generated name)

### Resend / verification email
- **From:** `noreply@inbrief.app`
- **Subject:** `Verify your InBrief email`
- **Body:** Plain link — `https://yt-summary-frontend.fly.dev/?verify=TOKEN`
- Token expires after **24 hours**
- Resend verification link available on the "check your inbox" screen

---

## Database Changes

```sql
-- users table additions
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

-- new table for verification tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Existing users: `email = NULL`, `email_verified = 0` → triggers modal on next login.
New users: `email` set at registration, `email_verified = 0` until link clicked.

---

## API Changes

### Auth routes

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/auth/register` | email required; username optional (auto-generated); phone optional; sends verification email; returns `{ status: 'pending_verification' }` |
| `POST` | `/api/auth/login` | accepts `identifier` (email or username) + password; returns `{ status: 'pending_email', token }` if not verified, `{ status: 'ok', token }` if verified |
| `POST` | `/api/auth/verify-email` | body `{ token }`; marks user verified; returns `{ token }` (fresh JWT) |
| `POST` | `/api/auth/resend-verification` | requires auth (the unverified token); resends email; rate-limited to 1/minute |
| `POST` | `/api/auth/add-email` | requires auth; existing user submits email + optional phone; sends verification email |

### JWT behaviour during verification
- After login (or registration), a JWT is issued immediately so the frontend can call `/api/auth/add-email` and `/api/auth/resend-verification` without re-authenticating
- The JWT carries `emailVerified: false` — middleware rejects all other routes with `403 Email not verified` until the verification step completes and a new token is issued

---

## Frontend Changes

### RegisterPage
- Add **Email** field (required, type=email)
- Add **Username** field (now optional — labelled "Username (optional)")
- Add **Phone** field (optional, type=tel)
- On success → switch to `EmailVerificationPending` screen (not navigate away)

### LoginPage
- Change label from "Username" to "Email or Username"
- `identifier` field accepts either

### New: EmailVerificationPending screen
- Shown after register or after existing user submits email in modal
- "We sent a verification link to **{email}**. Click it to continue."
- "Resend email" button (rate-limited)
- User is logged out of main app until verified

### New: post-login modal for existing users
- Triggered in `App.jsx` when `authStatus === 'authenticated'` and `currentUser.email === null`
- Full-screen overlay — cannot be dismissed
- Fields: Email (required), Phone (optional)
- On submit → `POST /api/auth/add-email` → switches to EmailVerificationPending screen

### Verification landing
- `App.jsx` detects `?verify=TOKEN` in URL on load (similar to share token handling)
- Calls `POST /api/auth/verify-email` with the token
- On success: stores new JWT, clears URL param, shows "Email verified! You're in." and navigates to landing
- On failure: shows "Link expired or invalid — request a new one"

---

## Environment Variables (backend)

```
RESEND_API_KEY=re_xxxxxxxxxxxx
APP_URL=https://yt-summary-frontend.fly.dev
```

---

## Migration / Rollout Notes

- All existing users have `email_verified = 0` — they will hit the modal on next login
- No existing sessions are invalidated — the gate is enforced at the modal level on next page load
- The username login path remains fully functional throughout the transition
- Once >90% of users have verified, the username-only registration path can be removed

---

## Out of Scope (this iteration)

- Google / social OAuth
- Email change after verification (requires re-verification flow)
- SMS verification for phone numbers
- Password reset via email (good next step once email is collected)

---

## Status: PAUSED — picking up later

### Blocking (must happen before any code is written)
- [ ] Register `inbrief.app` domain (recommend Cloudflare Registrar, ~$14–20/yr)
- [ ] Sign up at resend.com, add `inbrief.app` as a domain
- [ ] Add Resend's DNS records (SPF, DKIM, MX) to the domain's DNS
- [ ] Verify domain in Resend dashboard
- [ ] Create Resend API key
- [ ] Set `RESEND_API_KEY` and `APP_URL` as Fly.io secrets on the backend app

### Backend implementation
- [ ] DB migration in `db.js`: add `email`, `phone`, `email_verified` to `users`; create `email_verification_tokens` table (all wrapped in try/catch, additive only — see Database Changes section above)
- [ ] `npm install resend` in `backend/`
- [ ] New helper module (e.g. `backend/src/email.js`) wrapping `resend.emails.send(...)` for the verification email template
- [ ] `POST /api/auth/register` — require email, make username optional (auto-generate from email prefix + dedup suffix), optional phone, generate + store verification token, send email, return `{ status: 'pending_verification' }`
- [ ] `POST /api/auth/login` — accept `identifier` (email or username), return `{ status: 'pending_email', token }` if `email_verified = 0`
- [ ] `POST /api/auth/verify-email` — validate token + expiry, set `email_verified = 1`, delete used token, issue fresh JWT
- [ ] `POST /api/auth/resend-verification` — requires auth, rate-limited 1/minute, issues new token
- [ ] `POST /api/auth/add-email` — requires auth, for existing username-only users to submit email/phone, sends verification email
- [ ] Auth middleware: reject all routes except the verification/resend endpoints with `403 Email not verified` when JWT has `emailVerified: false`
- [ ] Tests: registration with/without username, login via email vs username, verify-email success/expired/invalid token, resend rate limit, add-email flow, middleware blocking unverified users

### Frontend implementation
- [ ] `RegisterPage.jsx` — add Email (required) and Phone (optional) fields; relabel Username to "Username (optional)"
- [ ] `LoginPage.jsx` — relabel Username field to "Email or Username"
- [ ] New `EmailVerificationPending.jsx` component — "check your inbox" screen with Resend button
- [ ] New post-login blocking modal component for existing users missing email (cannot be dismissed)
- [ ] `App.jsx` — detect `?verify=TOKEN` in URL (mirror the existing `?share=TOKEN` handling pattern), call verify-email endpoint, swap in fresh JWT, route to landing on success
- [ ] `App.jsx` — gate main app render behind `currentUser.email_verified` once email exists; show modal/pending screen otherwise
- [ ] `api.js` — add `addEmail()`, `verifyEmail()`, `resendVerification()`, update `login()`/`register()` signatures

### Rollout
- [ ] Deploy backend migration first (additive, safe with existing data)
- [ ] Confirm existing users still log in fine with username while `email IS NULL`
- [ ] Deploy frontend with modal + verification screens
- [ ] Monitor Resend dashboard for delivery/bounce rates during first wave of existing-user verifications

### Open decision for later
- Whether to eventually deprecate username-only login once most users have verified emails (mentioned in Migration Notes above) — revisit once adoption data is in.
