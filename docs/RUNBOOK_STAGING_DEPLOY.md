# Staging Deployment Runbook

> **Audience:** DevOps / Platform engineer performing first-time staging setup.
> **Target:** Ubuntu 22.04 LTS, single VM (2 vCPU / 4 GB RAM minimum), internet-accessible.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 22.x LTS | Use `nvm` or `nodesource` |
| pnpm | 9.x | `npm i -g pnpm` |
| MySQL | 8.0+ | Managed (PlanetScale / RDS) or self-hosted |
| Nginx | 1.24+ | Reverse proxy + SSL termination |
| Certbot | latest | Let's Encrypt TLS |
| PM2 | 5.x | Process manager for Node workers |
| Git | 2.x | For deployment pulls |

---

## 2. System Preparation

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2
npm install -g pm2

# Install Nginx
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

---

## 3. Application Setup

```bash
# Clone repository
git clone https://github.com/zarjun247/247-customer-app.git /opt/247-pharmacy
cd /opt/247-pharmacy

# Install dependencies (production only)
pnpm install --frozen-lockfile --prod

# Build the application
pnpm run build
```

---

## 4. Environment Configuration

Copy `.env.example` to `.env` and fill in all required values:

```bash
cp .env.example .env
nano .env
```

**Required variables (application will refuse to start without these in production):**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:3306/db247` |
| `JWT_SECRET` | ≥32-char random string | `openssl rand -hex 32` |
| `SESSION_SECRET` | ≥32-char random string | `openssl rand -hex 32` |
| `CSRF_SECRET` | ≥32-char random string | `openssl rand -hex 32` |
| `PII_ENCRYPTION_MASTER_KEY` | ≥32-char random string | `openssl rand -hex 32` |
| `RAZORPAY_KEY_ID` | Razorpay live key ID | From Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | Razorpay live key secret | From Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | ≥32-char webhook secret | Set in Razorpay dashboard |
| `COOKIE_DOMAIN` | Production domain | `.247pharmacy.in` |
| `CORS_ORIGINS` | Allowed origins | `https://app.247pharmacy.in` |

**Optional but recommended:**

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Error monitoring DSN from Sentry |
| `SESSION_TTL_DAYS` | Session lifetime in days (default: 30) |
| `OUTBOX_DISPATCH_ENABLED` | Defaults to `true` in production |
| `PAYMENT_WEBHOOK_ENABLED` | Defaults to `true` in production |
| `ONCALL_PAGERDUTY_INTEGRATION_KEY` | PagerDuty integration key |
| `ONCALL_ALERT_EMAIL` | Fallback alert email |

---

## 5. Database Migration

```bash
# Run all pending migrations
cd /opt/247-pharmacy
pnpm run db:migrate

# Verify migrations completed successfully
node scripts/verify-migrations.mjs
# Expected: "0 blocking issue(s), 0 warning(s)"
```

---

## 6. Environment Validation

```bash
# Validate all production environment variables
node scripts/validate-production-env.mjs
# Expected: "4 pass, 8 warn, 0 critical failure(s)"
# All 8 warns must be resolved before go-live (see Section 4)
```

---

## 7. PM2 Process Configuration

Create `/opt/247-pharmacy/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: "247-pharmacy-api",
      script: "dist/index.js",
      cwd: "/opt/247-pharmacy",
      instances: 2,
      exec_mode: "cluster",
      env_file: "/opt/247-pharmacy/.env",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "/var/log/247-pharmacy/error.log",
      out_file: "/var/log/247-pharmacy/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
```

```bash
# Create log directory
sudo mkdir -p /var/log/247-pharmacy
sudo chown ubuntu:ubuntu /var/log/247-pharmacy

# Start application
cd /opt/247-pharmacy
pm2 start ecosystem.config.cjs

# Save PM2 process list for auto-restart on reboot
pm2 save
pm2 startup
# Follow the output command to enable PM2 on boot
```

---

## 8. Nginx Configuration

Create `/etc/nginx/sites-available/247-pharmacy`:

```nginx
upstream pharmacy_api {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name app.247pharmacy.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.247pharmacy.in;

    ssl_certificate /etc/letsencrypt/live/app.247pharmacy.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.247pharmacy.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # File upload limit (prescriptions)
    client_max_body_size 10M;

    location / {
        proxy_pass http://pharmacy_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://pharmacy_api;
        access_log off;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/247-pharmacy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain TLS certificate
sudo certbot --nginx -d app.247pharmacy.in
```

---

## 9. Automated Backups

Create `/opt/scripts/backup-247-pharmacy.sh`:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/247-pharmacy"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="db247"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Database backup
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$DB_NAME" | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# Prune old backups
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup completed: db_${TIMESTAMP}.sql.gz"
```

```bash
sudo chmod +x /opt/scripts/backup-247-pharmacy.sh

# Schedule daily backup at 02:00 IST (20:30 UTC)
echo "30 20 * * * ubuntu /opt/scripts/backup-247-pharmacy.sh >> /var/log/247-pharmacy/backup.log 2>&1" | sudo tee -a /etc/cron.d/247-pharmacy-backup
```

---

## 10. Health Check Verification

After deployment, verify all systems are healthy:

```bash
# Application health
curl -s https://app.247pharmacy.in/health | jq .

# Expected response structure:
# {
#   "status": "ok",
#   "db": "ok",
#   "workers": { "outbox": { "running": true, ... }, ... },
#   "version": "..."
# }

# Check PM2 process status
pm2 status

# Check application logs
pm2 logs 247-pharmacy-api --lines 50
```

---

## 11. Monitoring Integration

**Sentry (error monitoring):**
1. Create a project at [sentry.io](https://sentry.io)
2. Copy the DSN and set `SENTRY_DSN=https://...@sentry.io/...` in `.env`
3. Restart the application: `pm2 restart 247-pharmacy-api`

**Uptime monitoring (recommended: BetterUptime / UptimeRobot):**
- Monitor: `https://app.247pharmacy.in/health`
- Expected status: 200
- Alert threshold: 2 consecutive failures

**Log aggregation (recommended: Papertrail / Loki):**
```bash
# Stream PM2 logs to syslog for external aggregation
pm2 install pm2-syslog
```

---

## 12. Rollback Procedure

```bash
# Identify the previous working commit
git log --oneline -10

# Roll back to previous commit
git checkout <previous-commit-hash>
pnpm install --frozen-lockfile --prod
pnpm run build
pm2 restart 247-pharmacy-api

# Verify health
curl -s https://app.247pharmacy.in/health | jq .status
```

---

## 13. Go-Live Checklist

Before switching production DNS:

- [ ] All 8 `env:validate` warnings resolved (credentials in place)
- [ ] `pnpm run check` exits 0
- [ ] `pnpm run lint:ci` exits 0
- [ ] `pnpm test` — 142 files pass, 0 failures
- [ ] `pnpm run build` exits 0
- [ ] `node scripts/verify-migrations.mjs` — 0 blocking issues
- [ ] `node scripts/validate-production-env.mjs` — 0 critical failures
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Razorpay test payment completes successfully
- [ ] OTP delivery confirmed via WhatsApp/SMS
- [ ] Prescription upload and signed URL retrieval tested
- [ ] Backup script tested and first backup verified
- [ ] Sentry DSN configured and test error captured
- [ ] PM2 startup hook enabled (`pm2 startup` + `pm2 save`)
- [ ] Nginx TLS certificate valid and auto-renewing
- [ ] CORS origins restricted to production domain only
