import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { Folder } from '../lib/api'

const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(c => {
  const t = localStorage.getItem('vdrive_token')
  if (t) c.headers['X-Auth-Token'] = t
  return c
})

interface Props {
  title: string
  excludeId?: string  // folder to exclude (self + children)
  onSelect: (folder: Folder | null) => void  // null = root
  onClose: () => void
}

export function FolderPickerModal({ title, excludeId, onSelect, onClose }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get<Folder[]>('/folders/all').then(r => setFolders(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = folders
    .filter(f => f.id !== excludeId)
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  // Build display path for each folder
  const folderMap: Record<string, Folder> = {}
  folders.forEach(f => folderMap[f.id] = f)

  function getPath(f: Folder): string {
    if (!f.parent_id || !folderMap[f.parent_id]) return f.name
    return getPath(folderMap[f.parent_id]) + ' / ' + f.name
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass rounded-2xl w-full max-w-md flex flex-col max-h-[70vh]"
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3 flex-shrink-0">
            <p className="text-ink font-medium text-sm flex-1">{title}</p>
            <button onClick={onClose} className="text-ink-muted hover:text-ink p-1">✕</button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-surface-3 flex-shrink-0">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search folders…"
              className="w-full px-3 py-2 bg-surface-2 border border-surface-3 rounded-lg text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50" />
          </div>

          {/* Folder list */}
          <div className="overflow-y-auto flex-1 p-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
            ) : (
              <>
                {/* Root option */}
                <button onClick={() => onSelect(null)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-3 transition-colors text-left">
                  <span className="text-lg">🏠</span>
                  <span className="text-sm text-ink font-medium">Root (My Drive)</span>
                </button>

                {filtered.map(f => (
                  <button key={f.id} onClick={() => onSelect(f)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-3 transition-colors text-left">
                    <span className="text-lg">📁</span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{f.name}</p>
                      <p className="text-xs text-ink-muted truncate">{getPath(f)}</p>
                    </div>
                  </button>
                ))}

                {filtered.length === 0 && !loading && (
                  <p className="text-center text-ink-muted text-sm py-6">No folders found</p>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
