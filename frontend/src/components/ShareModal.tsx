import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createShare, deleteShare, getShares, ShareLink } from '../lib/api'

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

  const load = async () => {
    setLoading(true)
    try { setShares(await getShares(targetId)) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [targetId])

  const handleCreate = async () => {
    setCreating(true)
    try { await createShare(type, targetId, label); await load() } finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    await deleteShare(id)
    setShares(prev => prev.filter(s => s.id !== id))
  }

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.93, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="glass rounded-2xl w-full max-w-md"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3">
            <span className="text-xl">{type === 'folder' ? '📂' : '🔗'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">Share "{label}"</p>
              <p className="text-xs text-ink-muted">Public links · view & download only</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-3 rounded-lg text-ink-muted hover:text-ink transition-colors">✕</button>
          </div>

          <div className="p-5 space-y-4">
            {/* Existing share links */}
            {loading ? (
              <div className="h-16 bg-surface-2 rounded-xl animate-pulse-slow" />
            ) : shares.length > 0 ? (
              <div className="space-y-2">
                {shares.map(share => (
                  <div key={share.id} className="flex items-center gap-2 bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5">
                    <span className="text-accent-bright font-mono text-xs flex-1 truncate">{share.url}</span>
                    <button
                      onClick={() => handleCopy(share.url)}
                      className={'px-2.5 py-1 rounded-lg text-xs font-medium transition-all ' +
                        (copied === share.url ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-accent/20 text-accent-bright border border-accent/30 hover:bg-accent/30')}
                    >
                      {copied === share.url ? '✓ Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleDelete(share.id)}
                      className="p-1.5 hover:bg-red-400/10 text-ink-muted hover:text-red-400 rounded-lg transition-colors text-sm"
                      title="Revoke link"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-ink-muted text-sm">
                No share links yet
              </div>
            )}

            {/* Info box */}
            <div className="bg-surface-2 border border-surface-3 rounded-xl px-4 py-3 text-xs text-ink-muted space-y-1">
              <p>🌐 Anyone with the link can view and download</p>
              <p>🚫 They cannot edit, rename, or delete anything</p>
              {type === 'folder' && <p>📂 All files inside the folder are included</p>}
            </div>

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-accent/20"
            >
              {creating ? 'Generating link…' : '+ Generate new link'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
