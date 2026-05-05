# VDrive

A self-hosted cloud drive. No Telegram. No auth. Full file manager backed by a dedicated PocketBase instance.

**Stack:** React + Vite (frontend) · Node.js/Express (API) · PocketBase (storage + DB)

---

## Architecture

```
Browser
  ↓
Nginx (:80)
  ├── / → /var/www/vdrive (React build)
  └── /api/* → Node.js :3200
                    ↓
              PocketBase :8091   ← SEPARATE from your finance PB (:8090)
                    ↓
              /opt/vdrive/pb_data  (files stored here on disk)
```

---

## Quick Deploy (on your VPS: 45.63.121.184)

### Step 1 — Upload project to VPS

```bash
# From your local machine
scp -r ./vdrive root@45.63.121.184:/opt/
```

Or clone/upload however you prefer.

### Step 2 — Run deploy script

```bash
ssh root@45.63.121.184
cd /opt/vdrive
chmod +x deploy.sh scripts/*.sh
bash deploy.sh
```

### Step 3 — Create PocketBase admin

Visit: `http://45.63.121.184:8091/_/`

Create your admin account there.

### Step 4 — Update .env

```bash
nano /opt/vdrive/backend/.env
```

Set:
```
POCKETBASE_URL=http://localhost:8091
PB_ADMIN_EMAIL=your@email.com
PB_ADMIN_PASSWORD=your_password
PORT=3200
```

### Step 5 — Create collections

```bash
bash /opt/vdrive/scripts/create_collections.sh
```

This creates `vdrive_folders` and `vdrive_files` collections in PocketBase.

### Step 6 — Restart API

```bash
systemctl restart vdrive-api
```

### Step 7 — Verify

```bash
curl http://localhost:3200/api/health
# Should return: {"api":"ok","pocketbase":{"code":200,"message":"API is healthy."}}
```

Visit `http://45.63.121.184` — the drive should load.

---

## Local Development

### Backend

```bash
cd backend
npm install
cp .env .env.local   # edit as needed
node --watch server.js
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Vite proxies /api/* to localhost:3200
```

---

## PocketBase Collections

| Collection | Fields |
|---|---|
| `vdrive_folders` | `name` (text), `parent_id` (text) |
| `vdrive_files` | `name` (text), `file` (file), `size` (number), `mime_type` (text), `folder_id` (text) |

Files are stored in `/opt/vdrive/pb_data/storage/`.

---

## Ports Summary

| Service | Port | Notes |
|---|---|---|
| Nginx | 80 | Public |
| VDrive React build | — | Served via nginx from /var/www/vdrive |
| VDrive Node.js API | 3200 | Internal only |
| VDrive PocketBase | 8091 | Internal + admin UI |
| Finance PocketBase | 8090 | Your existing one, untouched |

---

## Systemd Services

```bash
systemctl status vdrive-pb     # PocketBase
systemctl status vdrive-api    # Node.js API

journalctl -u vdrive-api -f    # API logs
journalctl -u vdrive-pb -f     # PocketBase logs
```

---

## Rebuild Frontend After Changes

```bash
cd /opt/vdrive/frontend
npm run build
cp -r dist/* /var/www/vdrive/
```

---

## Optional: HTTPS with certbot

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d drive.yourdomain.com
```

---

## File Size Limits

Default: **500MB per file**. To change:
- `backend/server.js` → multer `fileSize` option
- `nginx/vdrive.conf` → `client_max_body_size`
- PocketBase admin UI → `vdrive_files` collection → `file` field → max size
