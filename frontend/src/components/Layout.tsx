import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { clearAuth, getStoredUser, getFolders, Folder } from '../lib/api'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex overflow-hidden bg-surface-0" style={{ height: '100dvh' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-surface-3 bg-surface-1">
        <SidebarContent onClose={() => {}} />
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-60 flex flex-col border-r border-surface-3 bg-surface-1 md:hidden"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-3 bg-surface-1/80 md:hidden flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors text-lg">
            ☰
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white text-xs font-bold">V</div>
            <span className="text-ink font-semibold text-sm">VDrive</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

// ── Recursive folder tree ────────────────────────────────
interface FolderNodeProps {
  folder: Folder
  depth: number
  activeFolderId: string | null
  onClose: () => void
}

function FolderNode({ folder, depth, activeFolderId, onClose }: FolderNodeProps) {
  const [open, setOpen] = useState(activeFolderId === folder.id)
  const [children, setChildren] = useState<Folder[]>([])
  const [loaded, setLoaded] = useState(false)
  const navigate = useNavigate()
  const isActive = activeFolderId === folder.id

  // Auto-expand if a child is active
  useEffect(() => {
    if (activeFolderId === folder.id) setOpen(true)
  }, [activeFolderId, folder.id])

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!loaded) {
      const subs = await getFolders(folder.id)
      setChildren(subs)
      setLoaded(true)
    }
    setOpen(o => !o)
  }

  const handleClick = async () => {
    navigate(`/drive/${folder.id}`)
    onClose()
    // Load children when navigating into folder
    if (!loaded) {
      const subs = await getFolders(folder.id)
      setChildren(subs)
      setLoaded(true)
      if (subs.length > 0) setOpen(true)
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg cursor-pointer group transition-all pr-2
          ${isActive ? 'bg-accent/15 text-accent-bright' : 'text-ink-muted hover:text-ink hover:bg-surface-3'}`}
        style={{ paddingLeft: `${12 + depth * 14}px`, paddingTop: 6, paddingBottom: 6 }}
        onClick={handleClick}
      >
        {/* Expand toggle */}
        <button
          onClick={handleToggle}
          className={`w-4 h-4 flex items-center justify-center flex-shrink-0 rounded text-xs transition-all
            ${open ? 'rotate-90' : ''} hover:bg-surface-4`}
        >
          ▶
        </button>
        <span className="text-base flex-shrink-0">{open ? '📂' : '📁'}</span>
        <span className="text-xs font-medium truncate flex-1">{folder.name}</span>
      </div>

      {/* Children */}
      <AnimatePresence>
        {open && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {children.map(child => (
              <FolderNode key={child.id} folder={child} depth={depth + 1}
                activeFolderId={activeFolderId} onClose={onClose} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Sidebar content ──────────────────────────────────────
function SidebarContent({ onClose }: { onClose: () => void }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { folderId } = useParams<{ folderId?: string }>()
  const user = getStoredUser()
  const [rootFolders, setRootFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const activeFolderId = folderId ?? null

  useEffect(() => {
    getFolders(null).then(f => { setRootFolders(f); setLoading(false) })
  }, [loc.pathname]) // reload when navigation changes

  const handleLogout = () => { clearAuth(); navigate('/login') }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-accent/30">V</div>
          <span className="text-ink font-semibold tracking-tight text-lg">VDrive</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 min-h-0">
        {/* All Files root */}
        <Link to="/drive" onClick={onClose}
          className={'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ' +
            (!activeFolderId && loc.pathname.startsWith('/drive')
              ? 'bg-accent/15 text-accent-bright border border-accent/20'
              : 'text-ink-muted hover:text-ink hover:bg-surface-3')}>
          <span>🗂</span> All Files
        </Link>

        <Link to="/settings" onClick={onClose}
            className={'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ' +
              (loc.pathname === '/settings'
                ? 'bg-accent/15 text-accent-bright border border-accent/20'
                : 'text-ink-muted hover:text-ink hover:bg-surface-3')}>
            <span>⚙️</span> Settings
          </Link>

                  {/* Folder tree */}
        {loading ? (
          <div className="space-y-1 px-3 pt-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-7 bg-surface-3 rounded-lg animate-pulse-slow" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : rootFolders.length > 0 ? (
          <div className="pt-1 space-y-0.5">
            {rootFolders.map(folder => (
              <FolderNode key={folder.id} folder={folder} depth={0}
                activeFolderId={activeFolderId} onClose={onClose} />
            ))}
          </div>
        ) : null}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-surface-3 flex-shrink-0 space-y-2">
        {user && (
          <div className="px-1">
            <p className="text-xs text-ink font-medium truncate">{user.name}</p>
            <p className="text-xs text-ink-muted truncate">{user.email}</p>
          </div>
        )}
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ink-muted hover:text-red-400 hover:bg-red-400/10 transition-all">
          <span>⎋</span> Sign out
        </button>
      </div>
    </div>
  )
}
