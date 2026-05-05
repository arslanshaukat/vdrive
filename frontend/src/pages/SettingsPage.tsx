import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'
import { getActivity, clearActivity, ActivityItem } from '../lib/api'

interface Settings {
  company_name: string
  company_tagline: string
  company_mission: string
  company_website: string
  company_email: string
  company_phone: string
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
  const [activeTab, setActiveTab] = useState<'company' | 'account' | 'activity'>('company')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityTotal, setActivityTotal] = useState(0)

  const loadActivity = async () => {
    setActivityLoading(true)
    try {
      const data = await getActivity(1)
      setActivity(data.items)
      setActivityTotal(data.totalItems)
    } finally { setActivityLoading(false) }
  }

  useEffect(() => {
    if (activeTab === 'activity') loadActivity()
  }, [activeTab])

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
        {(['company', 'account', 'activity'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-b-2 -mb-px capitalize
              ${activeTab === tab ? 'text-accent-bright border-accent bg-accent/5' : 'text-ink-muted border-transparent hover:text-ink'}`}>
            {tab === 'company' ? '🏢 Company' : tab === 'account' ? '👤 Account' : '📋 Activity'}
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
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink-muted">Phone / Mobile <span className="text-ink-faint">(tap-to-call on share pages)</span></label>
                    <input value={settings.company_phone} onChange={set('company_phone')} className={inp()} placeholder="+63 XXX XXX XXXX" type="tel" />
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

            {activeTab === 'activity' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-ink text-sm font-semibold">Activity Log</h3>
                    <p className="text-ink-muted text-xs mt-0.5">{activityTotal} total actions recorded</p>
                  </div>
                  <button onClick={async () => { await clearActivity(); setActivity([]); setActivityTotal(0) }}
                    className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 border border-red-400/20 rounded-lg transition-all">
                    Clear log
                  </button>
                </div>
                {activityLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  </div>
                ) : activity.length === 0 ? (
                  <div className="text-center py-12 text-ink-muted text-sm">No activity yet</div>
                ) : (
                  <div className="space-y-1.5">
                    {activity.map(item => (
                      <div key={item.id} className="flex items-start gap-3 px-4 py-3 glass rounded-xl">
                        <span className="text-lg flex-shrink-0 mt-0.5">
                          {item.action === 'upload' ? '⬆️' :
                           item.action === 'delete_file' ? '🗑' :
                           item.action === 'delete_folder' ? '🗑' :
                           item.action === 'create_folder' ? '📁' : '•'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-ink">{item.user_email.split('@')[0]}</span>
                            <span className="text-xs text-ink-muted">
                              {item.action === 'upload' ? 'uploaded' :
                               item.action === 'delete_file' ? 'deleted file' :
                               item.action === 'delete_folder' ? 'deleted folder' :
                               item.action === 'create_folder' ? 'created folder' : item.action}
                            </span>
                            {item.target && <span className="text-xs text-ink font-medium truncate max-w-[200px]">"{item.target}"</span>}
                            {item.detail && <span className="text-xs text-ink-faint">({item.detail})</span>}
                          </div>
                          <p className="text-xs text-ink-faint mt-0.5">{new Date(item.created).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
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

// ── Activity log section — append to tabs ────────────────
// This is imported and used inside SettingsPage activeTab === 'activity'
