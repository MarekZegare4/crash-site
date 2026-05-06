# Deployment guide — VPS (Ubuntu 22.04)

## Requirements

- VPS running Ubuntu 22.04 LTS (min. 1 GB RAM)
- A domain pointing to the server IP (A record)
- SSH access as root or a user with `sudo`
- GitHub and/or Google OAuth application created in advance (see [OAuth callback URLs](#oauth-callback-urls))

---

## 1. Install dependencies

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Verify Docker Compose plugin
docker compose version

# nginx + Certbot
apt update && apt install -y nginx certbot python3-certbot-nginx
```

---

## 2. Clone the repository

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/crash-site.git
cd crash-site
```

---

## 3. Run the setup script

```bash
./scripts/setup.sh
```

The script handles everything interactively:

1. Checks that Docker, nginx, and Certbot are installed
2. Prompts for your domain, OAuth credentials, and generates a random JWT secret
3. Writes `.env` with permissions `600`
4. Creates `data/`, `uploads/`, `backups/` directories
5. Installs and enables the nginx config
6. Requests an SSL certificate via Certbot
7. Builds Docker containers and starts all services
8. Waits for the backend health check

> **Note:** `ADMIN_SOCIAL_IDS` is left blank intentionally — your provider user ID is not known until after first login. See [Setting the first admin](#setting-the-first-admin) below.

---

## 4. OAuth callback URLs

Set these in your provider dashboards **before** testing login.

### GitHub Developer Settings → OAuth Apps
- Authorization callback URL: `https://yourdomain.com/api/auth/github/callback`

### Google Cloud Console → Credentials → OAuth 2.0 Client
- Authorized redirect URI: `https://yourdomain.com/api/auth/google/callback`

---

## 5. Setting the first admin

After setup, open the site and log in once via GitHub or Google. Then:

```bash
./scripts/make-admin.sh
```

This lists every user in the database with their `social_key`, prompts you to enter the key(s) for admin access, updates `.env`, and tells you to restart the backend:

```bash
docker compose restart backend
```

To only list users without making changes:

```bash
./scripts/make-admin.sh --list
```

---

## 6. Verify

Open `https://yourdomain.com` — the map should load.
Log in — you should be redirected back and logged in.
If your `ADMIN_SOCIAL_IDS` is set, the admin panel is accessible from the hamburger menu.

---

## Environment variables reference

| Variable | Description |
|---|---|
| `AUTH_JWT_SECRET` | Random secret — generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | `https://yourdomain.com` |
| `OAUTH_CALLBACK_BASE` | `https://yourdomain.com` |
| `FRONTEND_URL` | `https://yourdomain.com` |
| `VITE_API_URL` | `https://yourdomain.com/api` |
| `SITE_URL` | Optional — public URL for share links; overrides the admin panel setting |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From GitHub Developer Settings |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `ADMIN_SOCIAL_IDS` | Comma-separated `provider:id` pairs, e.g. `github:123456,google:789`; set via `make-admin.sh` after first login |
| `PORT` | Backend port inside the container (default: `4000`) |
| `NODE_ENV` | Set to `production` |

---

## Scripts reference

All scripts live in `scripts/` and are designed to run from the repo root on the server.

### `setup.sh` — first-time setup

```bash
./scripts/setup.sh
```

Run once after cloning. Guides you through the full setup interactively (see [step 3](#3-run-the-setup-script) above).

---

### `deploy.sh` — update to latest code

```bash
./scripts/deploy.sh           # pull latest, rebuild, restart
./scripts/deploy.sh --no-pull # rebuild without git pull (redeploy current code)
```

What it does:

1. Creates a pre-deploy backup
2. Runs `git pull --ff-only` (unless `--no-pull`)
3. Rebuilds containers with `docker compose build --no-cache`
4. Restarts services with `docker compose up -d --remove-orphans`
5. Waits for the backend health check

---

### `make-admin.sh` — grant admin access

```bash
./scripts/make-admin.sh        # list users, then prompt for admin keys
./scripts/make-admin.sh --list # read-only: list users only
```

Reads the database, shows all users with their `provider:providerUserId` key, and updates `ADMIN_SOCIAL_IDS` in `.env`. Restart the backend after running.

---

### `backup.sh` — create a backup

```bash
./scripts/backup.sh
```

Creates a timestamped `.tar.gz` archive in `backups/` containing:
- A safe hot-copy of the SQLite database (no downtime required)
- All files from `uploads/`

Old backups are automatically pruned after `KEEP_DAYS` days (default: 30).

Environment overrides: `BACKUP_DIR`, `DATABASE_PATH`, `UPLOADS_DIR`, `KEEP_DAYS`.

---

### `restore.sh` — restore from backup

```bash
./scripts/restore.sh backups/crash-site-20260501-020000.tar.gz
```

Asks for confirmation, then:
- Saves the current database as `app.db.pre-restore`
- Restores the database and uploads from the archive

Restart the backend after restoring:

```bash
docker compose restart backend
```

Environment overrides: `DATA_DIR`, `DATABASE_PATH`, `UPLOADS_DIR`.

---

### `cleanup-uploads.sh` — remove orphaned photos

```bash
./scripts/cleanup-uploads.sh           # dry run — lists orphaned files
./scripts/cleanup-uploads.sh --delete  # actually deletes them
```

Compares every file in `uploads/` against image references in the database. Files no longer referenced by any listing are orphaned. Always do a dry run first.

Environment overrides: `UPLOADS_DIR`, `DATABASE_PATH`.

---

### `db-stats.sh` — database and disk summary

```bash
./scripts/db-stats.sh
```

Prints a quick overview. No flags, read-only.

Environment overrides: `DATABASE_PATH`, `UPLOADS_DIR`, `BACKUP_DIR`.

```bash
# Example: point at a different database
DATABASE_PATH=/mnt/backup/app.db ./scripts/db-stats.sh
```

Sample output:

```
=== Crash Site — 2026-05-01 12:00:00 ===

--- Listings ---
total:    142
active:   98
resolved: 31
expired:  13
...

--- Users ---
total:    67
admins:   2
...

--- Disk ---
db:       1.2M  (/opt/crash-site/data/app.db)
uploads:  84M   (312 files)
backups:  210M  (5 files)
```

---

## Maintenance

### Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### Restart

```bash
docker compose restart
```

### Automated backups (cron)

Add to crontab (`crontab -e`) to back up daily at 02:00:

```
0 2 * * * /opt/crash-site/scripts/backup.sh >> /var/log/crash-site-backup.log 2>&1
```

---

## Directory layout on the server

```
/opt/crash-site/
├── .env                  ← secrets, never commit
├── data/                 ← SQLite database (persistent volume)
├── uploads/              ← drone photos (persistent volume)
├── backups/              ← created by backup.sh
├── scripts/
│   ├── setup.sh          ← first-time setup
│   ├── deploy.sh         ← update and restart
│   ├── make-admin.sh     ← grant admin access after first login
│   ├── backup.sh         ← create backup
│   ├── restore.sh        ← restore from backup
│   ├── cleanup-uploads.sh← remove orphaned photos
│   └── db-stats.sh       ← database and disk summary
├── backend/
├── frontend/
├── nginx/crash-site.conf
└── docker-compose.yml
```
