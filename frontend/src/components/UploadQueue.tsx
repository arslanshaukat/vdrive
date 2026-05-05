import { AnimatePresence, motion } from 'framer-motion'

interface UploadItem {
  id: string
  name: string
  progress: number
  done: boolean
  error?: string
}

export function UploadQueue({ items, compressing }: { items: UploadItem[], compressing?: boolean }) {
  if (items.length === 0 && !compressing) return null
  return (
    <div className="fixed bottom-5 right-5 w-72 space-y-2 z-40">
      {compressing && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl px-4 py-3 shadow-xl shadow-black/30 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
          <span className="text-xs text-ink">Converting &amp; compressing images…</span>
        </motion.div>
      )}
      <AnimatePresence>
        {items.map(item => (
          <motion.div key={item.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="glass rounded-xl px-4 py-3 shadow-xl shadow-black/30">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm">{item.done ? '✅' : item.error ? '❌' : '⬆️'}</span>
              <span className="text-xs text-ink truncate flex-1">{item.name}</span>
              <span className="text-xs text-ink-muted font-mono">{item.progress}%</span>
            </div>
            {!item.done && !item.error && (
              <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${item.progress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            )}
            {item.error && <p className="text-xs text-red-400">{item.error}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
