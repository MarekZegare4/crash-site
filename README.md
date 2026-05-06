# Crash Site

A community map for reporting lost and found drones. No app, no account required to browse — just open the map.

## Local development

### Requirements
- Node.js 22+

### Start

```bash
# Backend
cd backend
cp .env.example .env         # fill in at least AUTH_JWT_SECRET
npm install
npm run dev                  # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

The dev backend exposes a mock login endpoint (`AUTH_ENABLE_MOCK=true`) so you don't need real OAuth credentials locally.

---

## Features

### Map & listings
- Interactive map (MapLibre GL JS) — light, dark, and satellite layers.
- Public listing feed with free-text search and lost/found filter.
- Listing detail panel: photo lightbox, event date/time, reward, contact, coordinates.
- Location modes: single point, circle radius, or freehand polygon.
- Share link for every listing; private listings get a secret `/private/<token>` link.
- Listings expire automatically and disappear from the map; owner can restore them from their profile.

### Accounts & auth
- OAuth login via Google and GitHub (redirect flow, session stored in an httpOnly cookie — not accessible to JavaScript).
- First-login nick setup modal — required before posting.
- Nick change cooldown (default 30 days, configurable by admin); first-time setup is exempt.
- Per-user public profile page (`/u/<id>`) with active listings and a QR sticker.
- Printable QR sticker with nick, profile URL, and a call-to-action.
- Account deletion — removes all listings, uploaded photos, and user data.

### Listing management (owner)
- Create listings: title, description, event date/time, reward, contact info, optional photo, public/private toggle, expiry preset (7 / 14 / 30 / 90 days or never, default 30 days).
- Edit all fields after posting: replace photo, change expiry, toggle visibility.
- Mark as resolved.
- Delete listing.
- "My listings" panel shows all own listings including expired ones, with a one-click restore that opens the edit form.

### Admin panel (`/admin`)
- **Dashboard** — summary stats: listings by status/type, new users, pending reports.
- **Listings** — sortable/searchable table, detail modal with full info, status toggle, delete.
- **Users** — sortable/searchable table, detail modal with listing history, role toggle (user ↔ admin), ban/unban, manual nick override, nick-change cooldown reset, `nickChangedAt` visibility.
- **Reports** — user-submitted reports per listing, dismiss or delete reported listing.
- **Logs** — chronological audit log of every admin action with actor, target, and details.
- **Announcements** — publish info/warning/alert banners on the main page; per-device dismissible; long messages marquee-scroll; 30-second polling (no page refresh needed).
- **Config** — site URL override for generated share links; nick change cooldown in days.

### i18n
- English and Polish — switchable from settings without page reload.

### Mobile UX
- Panels render as bottom sheets with rounded top corners, a drag handle, and a slide-up animation.
- FAB moves above the open sheet with a smooth transition.
- Overscroll contained to the sheet so the map doesn't pan underneath forms.
- Minimum 44 px touch targets on interactive controls.

---

### Security
- Session token stored in an `httpOnly; SameSite=Lax` cookie — not reachable by JavaScript.
- Rate limiting on sensitive endpoints: auth redirects (20 req / 15 min), nick availability check (30 req / min), account deletion (5 req / hour).
- Uploaded files are written with a `.tmp` extension during Sharp processing — the original (potentially dangerous) extension never touches disk.
- HTTP security headers via Helmet: CSP, HSTS (production only), `Permissions-Policy`, `Referrer-Policy`.
- Request body size capped at 64 KB (except multipart upload); `expiresAt` validated server-side to be a future date.

---

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, MapLibre GL JS |
| Backend | Express, TypeScript, SQLite (better-sqlite3) |
| Auth | JWT in httpOnly cookie + OAuth 2.0 (Google, GitHub) |
| Images | Multer + Sharp (resize/convert on upload) |
| Infra | Docker, nginx |

---

## Deployment

See [docs/deployment.md](docs/deployment.md).

Set `VITE_API_URL` in the frontend build to point at your backend, then set the **Site URL** in the admin config panel so generated share links use the correct public origin.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
