# Roles Design

## Four roles (ordered by privilege)

| Role | Who | How assigned |
|---|---|---|
| `guest` | Unauthenticated visitors | No account needed |
| `viewer` | Registered users (current default) | Self-register |
| `member` | Trusted users with higher limits | Admin-promoted |
| `admin` | Site owner | Manually set in DB |

## Permissions

| Capability | guest | viewer | member | admin |
|---|---|---|---|---|
| Browse videos & briefs | ✓ | ✓ | ✓ | ✓ |
| Read full summaries | ✓ | ✓ | ✓ | ✓ |
| Summarize new videos | — | ✓ (5/mo) | ✓ (25/mo) | unlimited |
| Add channels | — | — | ✓ | ✓ |
| Delete videos | — | — | — | ✓ |
| Re-analyze videos | — | — | — | ✓ |
| View analytics | — | — | — | ✓ |
| Manage users | — | — | — | ✓ |

## Implementation plan

### 1. Monthly quota via existing user_summaries table

Derive the monthly count from `user_summaries` (already tracked) — count rows in the current calendar month. No new DB column needed.

Quota limits live in a config object, not hardcoded, so they're easy to tune:

```js
const ROLE_LIMITS = {
  viewer: { monthlySummarize: 5 },
  member: { monthlySummarize: 25 },
  admin: { monthlySummarize: Infinity },
};
```

### 2. Guest access via optionalAuth middleware

Add `optionalAuth` alongside `requireAuth` — sets `req.user` if a valid token is present, otherwise sets `req.user = null` and continues. Read-only routes (`GET /api/videos`, `GET /api/summarize/history`) switch to `optionalAuth` and scope their response accordingly.

### 3. Replace requireAdmin with requireRole(...roles)

```js
requireRole('admin')            // admin only
requireRole('member', 'admin')  // member or admin
```

### 4. User promotion endpoint

`PATCH /api/users/:id/role` — admin-only endpoint to promote a user to `member` or demote back to `viewer`. No invite/email flow needed; admin promotes manually.

## DB changes

None required for the role column — it is already `TEXT` and accepts any string value. `member` is a new valid value alongside existing `viewer` and `admin`.

## What's deferred

- Email verification or invite codes for member promotion
- Per-user custom limits (role-based config is sufficient for now)
