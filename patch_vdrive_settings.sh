#!/bin/bash
# Run this on the VPS: bash patch_vdrive_settings.sh
set -e

echo "==> Step 1: Create settings collection in PocketBase..."
source /opt/vdrive/backend/.env

TOKEN=$(curl -s -X POST "${POCKETBASE_URL}/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST "${POCKETBASE_URL}/api/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vdrive_settings",
    "type": "base",
    "schema": [
      { "name": "key",   "type": "text", "required": true },
      { "name": "value", "type": "text", "required": false }
    ],
    "indexes": ["CREATE UNIQUE INDEX idx_vdrive_settings_key ON vdrive_settings (key)"]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Collection:', d.get('name', d.get('message')))"

echo "==> Step 2: Seed default settings..."
seed() {
  curl -s -X POST "${POCKETBASE_URL}/api/collections/vdrive_settings/records" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$1\",\"value\":\"$2\"}" > /dev/null
  echo "  Seeded: $1"
}
seed "company_name"    "GT International INC"
seed "company_tagline" "Quality Construction Equipment"
seed "company_mission" "At GT International INC, our mission is to provide the construction industry with the highest quality used and new construction equipment. We aim to be the go-to source for Trucks, cranes, excavators, bulldozers, graders, wheel loaders, compactors, and more."
seed "company_website" "https://gtintl.com.ph"
seed "company_email"   "gtsubic@gmail.com"
seed "company_logo"    "GTI"

echo "==> Step 3: Add settings routes to backend..."
python3 - << 'PYEOF'
with open('/opt/vdrive/backend/server.js', 'r') as f:
    c = f.read()

if '/api/settings' in c:
    print("  Settings routes already exist, skipping.")
else:
    routes = '''
// ══════════════════════════════════════════════════════════
// SETTINGS ROUTES
// ══════════════════════════════════════════════════════════

app.get('/api/settings', async (req, res) => {
  try {
    const r = await pbFetch('/collections/vdrive_settings/records?perPage=100')
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    const settings = {}
    for (const item of (data.items || [])) settings[item.key] = item.value
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/settings', requireAuth, async (req, res) => {
  try {
    const updates = req.body
    const r = await pbFetch('/collections/vdrive_settings/records?perPage=100')
    const data = await r.json()
    const existing = {}
    for (const item of (data.items || [])) existing[item.key] = item.id
    for (const [key, value] of Object.entries(updates)) {
      if (existing[key]) {
        await pbFetch(`/collections/vdrive_settings/records/${existing[key]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: String(value) })
        })
      } else {
        await pbFetch('/collections/vdrive_settings/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: String(value) })
        })
      }
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

'''
    c = c.replace("app.listen(PORT, () => {", routes + "app.listen(PORT, () => {")
    with open('/opt/vdrive/backend/server.js', 'w') as f:
        f.write(c)
    print("  Settings routes added.")
PYEOF

echo "==> Step 4: Add Settings page and route..."

cat > /opt/vdrive/frontend/src/pages/SettingsPage.tsx << 'TSX'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'

interface Settings {
  company_name: string
  company_tagline: string
  company_mission: string
  company_website: string
  company_email: string
  company_logo: string
}

const DEFAULT: Settings = { company_name: '', company_tagline: '', company_mission: '', company_website: '', company_email: '', company_logo: '' }

const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(c => { const t = localStorage.getItem('vdrive_token'); if (t) c.headers['X-Auth-Token'] = t; return c })

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT)
  const [original, setOriginal] = useState<Settings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'company' | 'account'>('company')

  useEffect(() => {
    api.get<Settings>('/settings').then(r => {
      const s = { ...DEFAULT, ...r.data }
      setSettings(s); setOriginal(s)
    }).finally(() => setLoading(false))
  }, [])

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch('/settings', settings)
      setOriginal({ ...settings })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings(prev => ({ ...prev, [key]: e.target.value }))

  const inp = (extra = '') => `w-full px-3 py-2.5 bg-surface-2 border border-surface-3 rounded-xl text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 transition-colors ${extra}`

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-4 px-4 sm:px-6 py-4 border-b border-surface-3 bg-surface-1/50 flex-shrink-0">
        <div>
          <h1 className="text-ink font-semibold text-lg">Settings</h1>
          <p className="text-ink-muted text-xs">Manage your VDrive configuration</p>
        </div>
        <div className="flex-1" />
        {saved && !isDirty && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-3 py-2 bg-green-500/15 border border-green-500/30 rounded-lg">
            <span className="text-green-400 text-sm">✓ Saved</span>
          </motion.div>
        )}
        {isDirty && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
            <button onClick={() => setSettings({ ...original })}
              className="px-3 py-2 text-sm text-ink-muted hover:text-ink bg-surface-2 border border-surface-3 rounded-lg transition-all">Reset</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/80 disabled:opacity-50 rounded-lg transition-all shadow-lg shadow-accent/20">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </motion.div>
        )}
      </div>

      <div className="flex gap-1 px-4 sm:px-6 pt-4 border-b border-surface-3 flex-shrink-0">
        {(['company', 'account'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-b-2 -mb-px capitalize
              ${activeTab === tab ? 'text-accent-bright border-accent bg-accent/5' : 'text-ink-muted border-transparent hover:text-ink'}`}>
            {tab === 'company' ? '🏢 Company' : '👤 Account'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            {activeTab === 'company' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

                {/* Live preview */}
                <div className="glass rounded-2xl p-5">
                  <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mb-4">Live preview — share page appearance</p>
                  <div className="bg-gray-900 rounded-xl p-4 border border-white/8 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white text-sm font-bold shadow shadow-accent/30 flex-shrink-0">
                        {settings.company_logo || '?'}
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">{settings.company_name || 'Company Name'}</p>
                        <p className="text-white/40 text-xs">{settings.company_tagline || 'Your tagline here'}</p>
                      </div>
                    </div>
                    {settings.company_mission && (
                      <p className="text-white/40 text-xs leading-relaxed line-clamp-2 border-t border-white/8 pt-3">{settings.company_mission}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-white/30 border-t border-white/8 pt-3">
                      {settings.company_email && <span>✉ {settings.company_email}</span>}
                      {settings.company_website && <span>🌐 {settings.company_website.replace('https://', '')}</span>}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-ink text-sm font-semibold">Brand</h3>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Logo text <span className="text-ink-faint">(2–4 chars shown in badge)</span></label>
                    <input value={settings.company_logo} onChange={set('company_logo')} maxLength={4} className={inp()} placeholder="GTI" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Company name</label>
                    <input value={settings.company_name} onChange={set('company_name')} className={inp()} placeholder="GT International INC" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Tagline</label>
                    <input value={settings.company_tagline} onChange={set('company_tagline')} className={inp()} placeholder="Quality Construction Equipment" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-ink text-sm font-semibold">Contact</h3>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Website URL</label>
                    <input value={settings.company_website} onChange={set('company_website')} className={inp()} placeholder="https://gtintl.com.ph" type="url" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Email</label>
                    <input value={settings.company_email} onChange={set('company_email')} className={inp()} placeholder="gtsubic@gmail.com" type="email" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-ink text-sm font-semibold">About</h3>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Mission statement <span className="text-ink-faint">(shown in share page footer)</span></label>
                    <textarea value={settings.company_mission} onChange={set('company_mission')} rows={5} className={inp('resize-none')} placeholder="Describe your company…" />
                  </div>
                </div>

                {isDirty && (
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving}
                      className="px-6 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 disabled:opacity-50 rounded-xl transition-all shadow-lg shadow-accent/20">
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button onClick={() => setSettings({ ...original })}
                      className="px-4 py-2.5 text-sm text-ink-muted hover:text-ink bg-surface-2 border border-surface-3 rounded-xl transition-all">
                      Reset
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'account' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-ink text-sm font-semibold">Users</h3>
                  {[
                    { name: 'Arslan Shaukat', email: 'arslanshaukat@hotmail.com', role: 'Admin' },
                    { name: 'GT Subic', email: 'gtsubic@gmail.com', role: 'User' },
                  ].map(u => (
                    <div key={u.email} className="flex items-center gap-3 px-4 py-3 glass rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent-bright font-semibold text-sm flex-shrink-0">
                        {u.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink text-sm font-medium">{u.name}</p>
                        <p className="text-ink-muted text-xs truncate">{u.email}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${u.role === 'Admin' ? 'bg-accent/15 text-accent-bright border border-accent/20' : 'bg-surface-3 text-ink-muted'}`}>
                        {u.role}
                      </span>
                    </div>
                  ))}
                  <p className="text-ink-faint text-xs px-1">To add or remove users, edit the USERS array in <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">/opt/vdrive/backend/server.js</code></p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-ink text-sm font-semibold">System</h3>
                  <div className="glass rounded-xl divide-y divide-surface-3">
                    {[
                      ['PocketBase', 'localhost:8091'],
                      ['Max file size', '500 MB'],
                      ['Image compression', 'Enabled · max 2048px · 82% quality'],
                      ['HEIC conversion', 'Enabled → JPEG'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-4 py-3">
                        <span className="text-ink-muted text-sm">{k}</span>
                        <span className="text-ink text-xs font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
TSX

echo "==> Step 5: Update App.tsx with settings route..."
python3 - << 'PYEOF'
with open('/opt/vdrive/frontend/src/App.tsx', 'r') as f:
    c = f.read()

if 'SettingsPage' not in c:
    c = c.replace(
        "import { isAuthenticated } from './lib/api'",
        "import { isAuthenticated } from './lib/api'\nimport { SettingsPage } from './pages/SettingsPage'"
    )
    c = c.replace(
        "        <Route path=\"/drive/:folderId\" element={<DrivePage />} />",
        "        <Route path=\"/drive/:folderId\" element={<DrivePage />} />\n        <Route path=\"/settings\" element={<SettingsPage />} />"
    )
    with open('/opt/vdrive/frontend/src/App.tsx', 'w') as f:
        f.write(c)
    print("  App.tsx updated.")
else:
    print("  SettingsPage already in App.tsx, skipping.")
PYEOF

echo "==> Step 6: Add Settings link to sidebar..."
python3 - << 'PYEOF'
with open('/opt/vdrive/frontend/src/components/Layout.tsx', 'r') as f:
    c = f.read()

if '/settings' not in c:
    c = c.replace(
        "          <Link to=\"/drive\" onClick={onClose}",
        """          <Link to=\"/drive\" onClick={onClose}"""
    )
    # Add settings nav item after All Files link
    c = c.replace(
        "          {/* Folder tree */}",
        """          <Link to=\"/settings\" onClick={onClose}
            className={'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ' +
              (loc.pathname === '/settings'
                ? 'bg-accent/15 text-accent-bright border border-accent/20'
                : 'text-ink-muted hover:text-ink hover:bg-surface-3')}>
            <span>⚙️</span> Settings
          </Link>

          {/* Folder tree */}"""
    )
    with open('/opt/vdrive/frontend/src/components/Layout.tsx', 'w') as f:
        f.write(c)
    print("  Layout.tsx updated.")
else:
    print("  Settings already in Layout.tsx, skipping.")
PYEOF

echo "==> Step 7: Update SharePage to load settings from API..."
python3 - << 'PYEOF'
import re

with open('/opt/vdrive/frontend/src/pages/SharePage.tsx', 'r') as f:
    c = f.read()

# Replace the hardcoded COMPANY const with a dynamic one loaded from API
old = """const COMPANY = {
  name: 'GT International INC',
  tagline: 'Quality Construction Equipment',
  mission: 'At GT International INC, our mission is to provide the construction industry with the highest quality used and new construction equipment. We aim to be the go-to source for Trucks, cranes, excavators, bulldozers, graders, wheel loaders, compactors, and more.',
  website: 'https://gtintl.com.ph',
  email: 'gtsubic@gmail.com',
  logo: 'GTI',
}"""

new = """interface Company { name: string; tagline: string; mission: string; website: string; email: string; logo: string }
const DEFAULT_COMPANY: Company = { name: 'GT International INC', tagline: 'Quality Construction Equipment', mission: '', website: '', email: '', logo: 'GTI' }"""

if 'DEFAULT_COMPANY' not in c:
    c = c.replace(old, new)

    # Load company from API alongside share data
    c = c.replace(
        "  const [downloading, setDownloading] = useState(false)",
        "  const [downloading, setDownloading] = useState(false)\n  const [company, setCompany] = useState<Company>(DEFAULT_COMPANY)"
    )
    c = c.replace(
        "    fetch(`/api/public/s/${code}`)",
        "    fetch('/api/settings').then(r => r.json()).then(s => setCompany({ name: s.company_name || DEFAULT_COMPANY.name, tagline: s.company_tagline || DEFAULT_COMPANY.tagline, mission: s.company_mission || '', website: s.company_website || '', email: s.company_email || '', logo: s.company_logo || DEFAULT_COMPANY.logo })).catch(() => {})\n    fetch(`/api/public/s/${code}`)"
    )

    # Replace all COMPANY. references with company.
    c = c.replace('COMPANY.logo', 'company.logo')
    c = c.replace('COMPANY.name', 'company.name')
    c = c.replace('COMPANY.tagline', 'company.tagline')
    c = c.replace('COMPANY.mission', 'company.mission')
    c = c.replace('COMPANY.website', 'company.website')
    c = c.replace('COMPANY.email', 'company.email')

    with open('/opt/vdrive/frontend/src/pages/SharePage.tsx', 'w') as f:
        f.write(c)
    print("  SharePage.tsx updated to load settings dynamically.")
else:
    print("  SharePage already dynamic, skipping.")
PYEOF

echo "==> Step 8: Restart backend and rebuild frontend..."
systemctl restart vdrive-api
cd /opt/vdrive/frontend
npm run build && cp -r dist/* /var/www/vdrive/

echo ""
echo "✅ Settings feature deployed!"
echo "   → Open the app and click ⚙️ Settings in the sidebar"
