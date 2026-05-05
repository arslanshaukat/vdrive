#!/bin/bash
# ============================================================
# VDrive Full Deploy Script
# Run on: 45.63.121.184 as root
# Usage:  bash deploy.sh
# ============================================================
set -e

VDRIVE_DIR="/opt/vdrive"
REPO_FRONTEND="$VDRIVE_DIR/frontend"
REPO_BACKEND="$VDRIVE_DIR/backend"

echo "======================================================"
echo "  VDrive Deploy"
echo "======================================================"

# ── Node.js (if not installed) ───────────────────────────
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

NODE_VER=$(node -v)
echo "==> Node.js: $NODE_VER"

# ── Copy project files ────────────────────────────────────
echo "==> Copying project to $VDRIVE_DIR..."
mkdir -p "$VDRIVE_DIR/scripts"
cp -r . "$VDRIVE_DIR/"

# ── Backend deps ──────────────────────────────────────────
echo "==> Installing backend dependencies..."
cd "$REPO_BACKEND"
npm install --omit=dev

# ── Frontend build ─────────────────────────────────────────
echo "==> Installing frontend dependencies..."
cd "$REPO_FRONTEND"
npm install

echo "==> Building frontend..."
npm run build

echo "==> Copying build to /var/www/vdrive..."
mkdir -p /var/www/vdrive
cp -r dist/* /var/www/vdrive/

# ── PocketBase setup ──────────────────────────────────────
echo "==> Setting up VDrive PocketBase..."
bash "$VDRIVE_DIR/scripts/setup_pocketbase.sh"

# ── Systemd services ──────────────────────────────────────
echo "==> Installing systemd services..."
cp "$VDRIVE_DIR/systemd/vdrive-pb.service" /etc/systemd/system/
cp "$VDRIVE_DIR/systemd/vdrive-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable vdrive-pb vdrive-api
systemctl restart vdrive-pb vdrive-api

# ── Nginx config ──────────────────────────────────────────
echo "==> Installing nginx config..."
cp "$VDRIVE_DIR/nginx/vdrive.conf" /etc/nginx/sites-available/vdrive
ln -sf /etc/nginx/sites-available/vdrive /etc/nginx/sites-enabled/vdrive
nginx -t && systemctl reload nginx

echo ""
echo "======================================================"
echo "  Deploy complete!"
echo "  App:           http://drive.yourdomain.com"
echo "  PocketBase UI: http://45.63.121.184:8091/_/"
echo "======================================================"
echo ""
echo "  Next steps:"
echo "  1. Visit PocketBase UI and create admin account"
echo "  2. Edit /opt/vdrive/backend/.env with credentials"
echo "  3. Run: bash /opt/vdrive/scripts/create_collections.sh"
echo "  4. Restart API: systemctl restart vdrive-api"
echo ""
