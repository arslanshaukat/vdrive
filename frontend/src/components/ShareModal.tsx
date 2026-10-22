import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'

const http = axios.create({ baseURL: '/api' })
http.interceptors.request.use(c => {
  const t = localStorage.getItem('vdrive_token')
  if (t) c.headers['X-Auth-Token'] = t
  return c
})

interface ShareLink {
  id: string; code: string; type: 'file' | 'folder'; target_id: string
  label: string; protected: boolean; url: string
}

interface Props {
  type: 'file' | 'folder'
  targetId: string
  label: string
  onClose: () => void
}

export function ShareModal({ type, targetId, label, onClose }: Props) {
  const [shares, setShares] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await http.get<ShareLink[]>('/shares', { params: { target_id: targetId } })
      setShares(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [targetId])

  const handleCreate = async () => {
    setError('')
    if (usePassword && password.length < 4) { setError('Password must be at least 4 characters'); return }
    setCreating(true)
    try {
      await http.post('/shares', { type, target_id: targetId, label, password: usePassword ? password : '' })
      setPassword(''); setUsePassword(false)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not create link')
    } finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    await http.delete('/shares/' + id)
    setShares(prev => prev.filter(s => s.id !== id))
  }

  const handleSetPassword = async (share: ShareLink) => {
    setError('')
    const input = window.prompt(
      share.protected ? 'New password (leave blank to remove protection):' : 'Set a password (min 4 characters):'
    )
    if (input === null) return
    if (input && input.length < 4) { setError('Password must be at least 4 characters'); return }
    try {
      const r = await http.patch<ShareLink>(`/shares/${share.id}/password`, { password: input })
      setShares(prev => prev.map(s => s.id === share.id ? r.data : s))
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not update password')
    }
  }

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="glass rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3">
            <span className="text-xl">{type === 'folder' ? '📂' : '🔗'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">Share "{label}"</p>
              <p className="text-xs text-ink-muted">Public links · view & download only</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-3 rounded-lg text-ink-muted hover:text-ink transition-colors">✕</button>
          </div>

          <div className="p-5 space-y-4">
            {loading ? (
              <div className="h-16 bg-surface-2 rounded-xl animate-pulse-slow" />
            ) : shares.length > 0 ? (
              <div className="space-y-2">
                {shares.map(share => (
                  <div key={share.id} className="bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      {share.protected && <span title="Password protected">🔒</span>}
                      <span className="text-accent-bright font-mono text-xs flex-1 truncate">{share.url}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopy(share.url)}
                        className={'px-2.5 py-1 rounded-lg text-xs font-medium transition-all ' +
                          (copied === share.url ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-accent/20 text-accent-bright border border-accent/30 hover:bg-accent/30')}>
                        {copied === share.url ? '✓ Copied' : 'Copy link'}
                      </button>
                      <button onClick={() => handleSetPassword(share)}
                        className="px-2.5 py-1 rounded-lg text-xs border border-surface-4 text-ink-muted hover:text-ink hover:bg-surface-3 transition-all">
                        {share.protected ? '🔑 Change / remove password' : '🔑 Add password'}
                      </button>
                      <div className="flex-1" />
                      <button onClick={() => handleDelete(share.id)}
                        className="p-1.5 hover:bg-red-400/10 text-ink-muted hover:text-red-400 rounded-lg transition-colors text-sm" title="Revoke link">
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-ink-muted text-sm">No share links yet</div>
            )}

            <div className="bg-surface-2 border border-surface-3 rounded-xl px-4 py-3 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={usePassword} onChange={e => setUsePassword(e.target.checked)}
                  className="w-4 h-4 accent-[#6c63ff]" />
                <span className="text-sm text-ink">Protect new link with a password</span>
              </label>
              {usePassword && (
                <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Choose a password (min 4 characters)" autoComplete="off"
                  className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50" />
              )}
              <p className="text-xs text-ink-muted">
                {usePassword
                  ? '🔒 Visitors must enter the password before they can see or download anything.'
                  : '🌐 Anyone with the link can view and download. They cannot edit, rename, or delete.'}
              </p>
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button onClick={handleCreate} disabled={creating}
              className="w-full py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-accent/20">
              {creating ? 'Generating link…' : usePassword ? '+ Generate protected link' : '+ Generate new link'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
