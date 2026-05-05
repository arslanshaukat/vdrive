#!/bin/bash
# ============================================================
# VDrive - Separate PocketBase Setup
# Runs on port 8091 (your existing finance PB is on 8090)
# ============================================================
set -e

VDRIVE_DIR="/opt/vdrive"
PB_VERSION="0.22.18"
PB_DIR="$VDRIVE_DIR/pocketbase"
DATA_DIR="$VDRIVE_DIR/pb_data"

echo "==> Creating VDrive directories..."
mkdir -p "$PB_DIR" "$DATA_DIR"

# Download PocketBase if not already present
if [ ! -f "$PB_DIR/pocketbase" ]; then
  echo "==> Downloading PocketBase $PB_VERSION..."
  cd "$PB_DIR"
  wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O pb.zip
  unzip -q pb.zip
  rm pb.zip
  chmod +x pocketbase
  echo "==> PocketBase downloaded."
else
  echo "==> PocketBase already present, skipping download."
fi

echo ""
echo "========================================================"
echo "  VDrive PocketBase is ready."
echo "  Start it with: systemctl start vdrive-pb"
echo "  Admin UI:      http://45.63.121.184:8091/_/"
echo "========================================================"
echo ""
echo "  After first start, go to the admin UI and:"
echo "  1. Create admin account"
echo "  2. Update /opt/vdrive/backend/.env with credentials"
echo "  3. Run: bash /opt/vdrive/scripts/create_collections.sh"
echo ""
