#!/bin/bash
# ============================================================
# Creates vdrive_folders and vdrive_files collections in PocketBase
# Run AFTER setting up admin credentials in .env
# ============================================================
set -e

source /opt/vdrive/backend/.env

echo "==> Authenticating with PocketBase..."
TOKEN=$(curl -s -X POST "${POCKETBASE_URL}/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not authenticate. Check your .env credentials."
  exit 1
fi
echo "==> Authenticated."

# ── Create vdrive_folders collection ────────────────────────
echo "==> Creating vdrive_folders collection..."
curl -s -X POST "${POCKETBASE_URL}/api/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vdrive_folders",
    "type": "base",
    "schema": [
      { "name": "name",      "type": "text",     "required": true  },
      { "name": "parent_id", "type": "text",     "required": false }
    ],
    "indexes": ["CREATE INDEX idx_vdrive_folders_parent ON vdrive_folders (parent_id)"]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Created:', d.get('name','ERROR'), d.get('message',''))"

# ── Create vdrive_files collection ──────────────────────────
echo "==> Creating vdrive_files collection..."
curl -s -X POST "${POCKETBASE_URL}/api/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vdrive_files",
    "type": "base",
    "schema": [
      { "name": "name",      "type": "text",     "required": true  },
      { "name": "file",      "type": "file",     "required": true, "options": { "maxSize": 524288000, "maxSelect": 1 } },
      { "name": "size",      "type": "number",   "required": false },
      { "name": "mime_type", "type": "text",     "required": false },
      { "name": "folder_id", "type": "text",     "required": false }
    ],
    "indexes": ["CREATE INDEX idx_vdrive_files_folder ON vdrive_files (folder_id)"]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Created:', d.get('name','ERROR'), d.get('message',''))"

echo ""
echo "==> Collections created successfully."
echo "    vdrive_folders — stores folder hierarchy"
echo "    vdrive_files   — stores files + binary data via PocketBase storage"

# ── Create vdrive_shares collection ─────────────────────────
echo "==> Creating vdrive_shares collection..."
curl -s -X POST "${POCKETBASE_URL}/api/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vdrive_shares",
    "type": "base",
    "schema": [
      { "name": "code",       "type": "text", "required": true },
      { "name": "type",       "type": "text", "required": true },
      { "name": "target_id",  "type": "text", "required": true },
      { "name": "label",      "type": "text", "required": false },
      { "name": "expires",    "type": "text", "required": false }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_vdrive_shares_code ON vdrive_shares (code)"
    ]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Created:', d.get('name','ERROR'), d.get('message',''))"
