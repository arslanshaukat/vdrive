import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  getFolders, getFiles, createFolder, deleteFolder, renameFolder,
  uploadFile, deleteFile, renameFile, moveFile, searchAll, getFolderCounts, isAdmin, deleteFiles, isAdmin,
  Folder, DriveFile, formatBytes, fileIcon, isImage, getFileUrl, getThumbUrl
} from '../lib/api'
import { PreviewModal } from '../components/PreviewModal'
import { ShareModal } from '../components/ShareModal'
import { Breadcrumb } from '../components/Breadcrumb'
import { UploadQueue } from '../components/UploadQueue'
import { compressFiles } from '../lib/compress'

interface UploadItem {
  id: string; name: string; progress: number; done: boolean; error?: string
}

export function DrivePage() {
  const { folderId } = useParams<{ folderId?: string }>()
  const navigate = useNavigate()
  const currentFolder = folderId ?? null

  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const [showSearch, setShowSearch] = useState(!!searchParams.get('q'))
  const [preview, setPreview] = useState<DriveFile | null>(null)
  const [shareTarget, setShareTarget] = useState<{ type: 'file' | 'folder'; id: string; label: string } | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [crumbTrail] = useState<Folder[]>([])
  const [draggingFile, setDraggingFile] = useState<DriveFile | null>(null)
  const userIsAdmin = isAdmin()
  const [searchResults, setSearchResults] = useState<{ files: DriveFile[]; folders: Folder[] } | null>(null)
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const [searching, setSearching] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const newFolderRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, fi] = await Promise.all([getFolders(currentFolder), getFiles(currentFolder)])
      setFolders(f); setFiles(fi)
      // Load counts after folders are known
      if (f.length > 0) {
        getFolderCounts(f.map(folder => folder.id)).then(setFolderCounts)
      } else {
        setFolderCounts({})
      }
    } finally { setLoading(false) }
  }, [currentFolder])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(new Set()); setSelectMode(false); setSearchResults(null) }, [currentFolder])

  // Global search with debounce
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchAll(search.trim())
        setSearchResults(results)
      } finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const onDrop = useCallback(async (accepted: File[]) => {
    const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

    // Compress images first
    const hasImages = accepted.some(f => f.type.startsWith('image/') && f.size > 200 * 1024 || f.name.toLowerCase().endsWith('.heic') || f.name.toLowerCase().endsWith('.heif'))
    if (hasImages) setCompressing(true)
    const files = await compressFiles(accepted)
    setCompressing(false)

    const items: UploadItem[] = files.map(f => ({ id: genId(), name: f.name, progress: 0, done: false }))
    setUploads(prev => [...prev, ...items])
    await Promise.all(files.map(async (file, i) => {
      const item = items[i]
      try {
        await uploadFile(file, currentFolder, pct => {
          setUploads(prev => prev.map(u => u.id === item.id ? { ...u, progress: pct } : u))
        })
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, progress: 100, done: true } : u))
      } catch {
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, error: 'Failed' } : u))
      }
    }))
    load()
    setTimeout(() => setUploads(prev => prev.filter(u => !u.done)), 2500)
  }, [currentFolder, load])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, noClick: true, noKeyboard: true })

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await createFolder(newFolderName.trim(), currentFolder)
    setNewFolderMode(false); setNewFolderName(''); load()
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Delete this folder and all its contents?')) return
    await deleteFolder(id); load()
  }

  const handleDeleteFile = async (id: string) => {
    if (!confirm('Delete this file?')) return
    await deleteFile(id); load()
  }

  const downloadFiles = async (filesToDownload: DriveFile[]) => {
    setDownloading(true)
    for (const file of filesToDownload) {
      try {
        const a = document.createElement('a')
        a.href = getFileUrl(file.id); a.download = file.name; a.target = '_blank'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        await new Promise(r => setTimeout(r, 400))
      } catch { /* continue */ }
    }
    setDownloading(false)
  }

  const downloadFolderFiles = async (fid: string) => {
    const folderFiles = await getFiles(fid)
    if (!folderFiles.length) return alert('This folder is empty')
    await downloadFiles(folderFiles)
  }

  const handleFileDragStart = (file: DriveFile) => { if (!selectMode) setDraggingFile(file) }
  const handleFileDragEnd = () => { setDraggingFile(null); setDragOverFolder(null) }
  const handleFolderDragOver = (e: React.DragEvent, fid: string) => { e.preventDefault(); setDragOverFolder(fid) }
  const handleFolderDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault()
    if (draggingFile && draggingFile.folder_id !== targetFolderId) { await moveFile(draggingFile.id, targetFolderId); load() }
    setDraggingFile(null); setDragOverFolder(null)
  }

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll = () => selected.size === filteredFiles.length ? setSelected(new Set()) : setSelected(new Set(filteredFiles.map(f => f.id)))
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }
  const downloadSelected = () => downloadFiles(filteredFiles.filter(f => selected.has(f.id)))

  // Use global search results when searching, otherwise use current folder contents
  const filteredFolders = searchResults ? searchResults.folders : folders
  const filteredFiles = searchResults ? searchResults.files : files
  const allSelected = filteredFiles.length > 0 && selected.size === filteredFiles.length

  return (
    <div {...getRootProps()} className="flex flex-col h-full relative">
      <input {...getInputProps()} />

      {/* Upload drag overlay */}
      <AnimatePresence>
        {isDragActive && !draggingFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-surface-0/90 border-2 border-dashed border-accent rounded-xl m-2">
            <div className="text-center">
              <div className="text-5xl mb-3">📂</div>
              <p className="text-accent-bright text-xl font-semibold">Drop to upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar ── */}
      <div className="border-b border-surface-3 bg-surface-1/50 flex-shrink-0">

        {/* Search bar (mobile expands full width) */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="px-4 pt-3 pb-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">🔍</span>
                <input ref={searchRef} value={search} onChange={e => { const v = e.target.value; if (v) setSearchParams({ q: v }); else setSearchParams({}) }}
                  placeholder="Search files and folders…"
                  className="w-full pl-9 pr-10 py-2.5 bg-surface-2 border border-surface-3 rounded-xl text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50" />
                <button onClick={() => { setSearchParams({}); setShowSearch(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink">✕</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Normal select mode toolbar */}
        {!selectMode ? (
          <div className="flex items-center gap-2 px-4 py-3">
            {/* Breadcrumb - scrollable on mobile */}
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
              <Breadcrumb trail={crumbTrail} currentFolder={currentFolder}
                onNavigate={id => id ? navigate(`/drive/${id}`) : navigate('/drive')} />
            </div>

            {/* Desktop controls */}
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchRef.current?.focus(), 100) }}
                className="p-2 rounded-lg bg-surface-2 border border-surface-3 text-ink-muted hover:text-ink transition-colors">🔍</button>
              <div className="flex items-center bg-surface-2 border border-surface-3 rounded-lg overflow-hidden">
                {(['grid', 'list'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    className={`px-3 py-2 text-sm transition-colors ${viewMode === v ? 'bg-accent/20 text-accent-bright' : 'text-ink-muted hover:text-ink'}`}>
                    {v === 'grid' ? '⊞' : '≡'}
                  </button>
                ))}
              </div>
              {filteredFiles.length > 0 && (
                <button onClick={() => setSelectMode(true)}
                  className="px-3 py-2 bg-surface-2 border border-surface-3 rounded-lg text-sm text-ink-muted hover:text-ink transition-all">
                  ☑ Select
                </button>
              )}
              <button onClick={() => { setNewFolderMode(true); setTimeout(() => newFolderRef.current?.focus(), 50) }}
                className="px-3 py-2 bg-surface-2 border border-surface-3 rounded-lg text-sm text-ink-muted hover:text-ink transition-all whitespace-nowrap">
                📁 New
              </button>
              <button onClick={open}
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-accent/20 whitespace-nowrap">
                ↑ Upload
              </button>
            </div>

            {/* Mobile controls - icon row */}
            <div className="flex items-center gap-1 sm:hidden">
              <button onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchRef.current?.focus(), 100) }}
                className="p-2.5 rounded-xl bg-surface-2 border border-surface-3 text-ink-muted hover:text-ink transition-colors">🔍</button>
              <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
                className="p-2.5 rounded-xl bg-surface-2 border border-surface-3 text-ink-muted hover:text-ink transition-colors">
                {viewMode === 'grid' ? '≡' : '⊞'}
              </button>
              {filteredFiles.length > 0 && (
                <button onClick={() => setSelectMode(true)}
                  className="p-2.5 rounded-xl bg-surface-2 border border-surface-3 text-ink-muted hover:text-ink transition-colors">☑</button>
              )}
              <button onClick={open}
                className="p-2.5 rounded-xl bg-accent hover:bg-accent/80 text-white transition-all shadow-lg shadow-accent/20">↑</button>
            </div>
          </div>
        ) : (
          /* Selection toolbar */
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-4 py-3 flex-wrap">
            <button onClick={selectAll}
              className="px-3 py-2 bg-surface-2 border border-surface-3 rounded-lg text-sm text-ink-muted hover:text-ink transition-all">
              {allSelected ? '☑ All' : '☐ All'}
            </button>
            <span className="text-sm text-ink-muted">{selected.size} selected</span>
            <div className="flex-1" />
            <button onClick={downloadSelected} disabled={selected.size === 0 || downloading}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-all">
              {downloading ? '⏳' : '⬇'} {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
            {userIsAdmin && selected.size > 0 && (
              <button onClick={async () => {
                if (!confirm(`Delete ${selected.size} file${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
                await deleteFiles(Array.from(selected))
                setSelected(new Set()); setSelectMode(false); load()
              }}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-all">
                🗑 Delete ({selected.size})
              </button>
            )}
            <button onClick={exitSelectMode}
              className="px-3 py-2 bg-surface-2 border border-surface-3 rounded-lg text-sm text-ink-muted hover:text-ink transition-all">
              Cancel
            </button>
          </motion.div>
        )}
      </div>

      {/* Drag hint */}
      <AnimatePresence>
        {draggingFile && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-2 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg text-xs text-accent-bright flex items-center gap-2">
            ✋ Drop onto a folder to move <span className="font-medium truncate">"{draggingFile.name}"</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
        {loading ? <LoadingSkeleton /> : (
          <>
            {/* New folder input */}
            <AnimatePresence>
              {newFolderMode && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mb-4 flex items-center gap-2">
                  <input ref={newFolderRef} value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') } }}
                    placeholder="Folder name…"
                    className="flex-1 px-3 py-2.5 bg-surface-2 border border-accent/40 rounded-xl text-sm text-ink focus:outline-none focus:border-accent" />
                  <button onClick={handleCreateFolder} className="px-4 py-2.5 bg-accent text-white text-sm rounded-xl hover:bg-accent/80 whitespace-nowrap">Create</button>
                  <button onClick={() => { setNewFolderMode(false); setNewFolderName('') }} className="px-3 py-2.5 text-ink-muted text-sm hover:text-ink">✕</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile: new folder button inline */}
            {!newFolderMode && (
              <div className="flex sm:hidden mb-4">
                <button onClick={() => { setNewFolderMode(true); setTimeout(() => newFolderRef.current?.focus(), 50) }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-surface-2 border border-surface-3 rounded-xl text-sm text-ink-muted hover:text-ink transition-all w-full justify-center">
                  📁 New Folder
                </button>
              </div>
            )}

            {/* Folders */}
            {filteredFolders.length > 0 && (
              <section className="mb-5">
                <h2 className="text-ink-muted text-xs font-mono uppercase tracking-widest mb-3 px-1">Folders</h2>
                <div className={viewMode === 'grid'
                  ? 'grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3'
                  : 'space-y-1.5'}>
                  {filteredFolders.map((folder, i) => (
                    <FolderCard key={folder.id} folder={folder} viewMode={viewMode} index={i}
                      isDragOver={dragOverFolder === folder.id}
                      selectMode={selectMode}
                      userIsAdmin={userIsAdmin}
                      onOpen={() => navigate(`/drive/${folder.id}`)}
                      onDelete={() => handleDeleteFolder(folder.id)}
                      onRename={async name => { await renameFolder(folder.id, name); load() }}
                      onShare={() => setShareTarget({ type: 'folder', id: folder.id, label: folder.name })}
                      fileCount={folderCounts[folder.id] !== undefined ? folderCounts[folder.id] : null}
                      onDownload={() => downloadFolderFiles(folder.id)}
                      onDragOver={e => handleFolderDragOver(e, folder.id)}
                      onDrop={e => handleFolderDrop(e, folder.id)}
                      onDragLeave={() => setDragOverFolder(null)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Files */}
            {filteredFiles.length > 0 && (
              <section>
                <h2 className="text-ink-muted text-xs font-mono uppercase tracking-widest mb-3 px-1">
                  Files {selectMode && <span className="normal-case tracking-normal font-sans text-ink-faint ml-1">— tap to select</span>}
                </h2>
                <div className={viewMode === 'grid'
                  ? 'grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3'
                  : 'space-y-1.5'}>
                  {filteredFiles.map((file, i) => (
                    <FileCard key={file.id} file={file} viewMode={viewMode} index={i}
                      selectMode={selectMode} isSelected={selected.has(file.id)}
                      userIsAdmin={userIsAdmin}
                      onPreview={() => selectMode ? toggleSelect(file.id) : setPreview(file)}
                      onSelect={() => toggleSelect(file.id)}
                      onDelete={() => handleDeleteFile(file.id)}
                      onRename={async name => { await renameFile(file.id, name); load() }}
                      onShare={() => setShareTarget({ type: 'file', id: file.id, label: file.name })}
                      onDragStart={() => handleFileDragStart(file)}
                      onDragEnd={handleFileDragEnd}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredFolders.length === 0 && filteredFiles.length === 0 && <EmptyState onUpload={open} />}
          </>
        )}
      </div>

      <UploadQueue items={uploads} compressing={compressing} />
      {preview && <PreviewModal file={preview} allFiles={files} onClose={() => setPreview(null)} onNavigate={f => setPreview(f)} />}
      {shareTarget && <ShareModal type={shareTarget.type} targetId={shareTarget.id} label={shareTarget.label} onClose={() => setShareTarget(null)} />}
    </div>
  )
}


// ── Portal menu — renders outside overflow:hidden containers ──
function PortalMenu({ children, anchorRef, open, onClose }: {
  children: React.ReactNode
  anchorRef: React.RefObject<HTMLButtonElement>
  open: boolean
  onClose: () => void
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const menuWidth = 160
    const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) })
  }, [open, anchorRef])

  if (!open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[998]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ top: pos.top, left: pos.left, position: 'fixed', zIndex: 999, minWidth: 160 }}
        className="bg-surface-2 border border-surface-4 rounded-xl shadow-2xl overflow-hidden py-1"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>,
    document.body
  )
}

// ── Folder Card ──────────────────────────────────────────
function FolderCard({ folder, viewMode, index, isDragOver, selectMode, fileCount, userIsAdmin, onOpen, onDelete, onRename, onShare, onDownload, onDragOver, onDrop, onDragLeave }:
  {
    folder: Folder; viewMode: 'grid' | 'list'; index: number; isDragOver: boolean; selectMode: boolean; fileCount: number | null; userIsAdmin: boolean
    onOpen: () => void; onDelete: () => void; onRename: (n: string) => void; onShare: () => void; onDownload: () => void
    onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void; onDragLeave: () => void
  }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(folder.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const commit = () => { if (name.trim() && name !== folder.name) onRename(name.trim()); setEditing(false) }
  const dragClass = isDragOver ? 'ring-2 ring-accent bg-accent/10 scale-105' : ''

  const ActionMenu = () => (
    <div onClick={e => e.stopPropagation()}>
      <button ref={menuBtnRef} onClick={() => setMenuOpen(m => !m)}
        className="p-1.5 rounded-lg hover:bg-surface-4 text-ink-muted hover:text-ink transition-colors text-base">⋯</button>
      <AnimatePresence>
        {menuOpen && (
          <PortalMenu anchorRef={menuBtnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
            <MenuItem icon="✏️" label="Rename" onClick={() => { setEditing(true); setName(folder.name); setMenuOpen(false) }} />
            <MenuItem icon="🔗" label="Share" onClick={() => { onShare(); setMenuOpen(false) }} />
            <MenuItem icon="⬇️" label="Download all" onClick={() => { onDownload(); setMenuOpen(false) }} />
            <div className="h-px bg-surface-3 my-1" />
            <MenuItem icon="🗑" label="Delete" onClick={() => { onDelete(); setMenuOpen(false) }} danger />
          </PortalMenu>
        )}
      </AnimatePresence>
    </div>
  )

  if (viewMode === 'list') {
    return (
      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}
        className={`flex items-center gap-3 px-3 py-3 rounded-xl glass cursor-pointer group transition-all ${dragClass} ${!isDragOver ? 'glass-hover' : ''}`}
        onDoubleClick={onOpen} onClick={onOpen} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}>
        <span className="text-2xl flex-shrink-0">{isDragOver ? '📂' : '📁'}</span>
        {editing ? (
          <input value={name} onChange={e => setName(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(folder.name); setEditing(false) } }}
            className="flex-1 bg-surface-2 px-2 py-1 rounded-lg text-sm text-ink focus:outline-none border border-accent/40" autoFocus
            onClick={e => e.stopPropagation()} />
        ) : (
          <span className="flex-1 text-sm text-ink truncate">{folder.name}</span>
        )}
        {!selectMode && !editing && <ActionMenu />}
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
      className={`glass rounded-xl p-3 cursor-pointer group flex flex-col items-center text-center gap-2 transition-all relative ${dragClass} ${!isDragOver ? 'glass-hover' : ''}`}
      onDoubleClick={onOpen} onClick={onOpen} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}>
      {!selectMode && (
        <div className="absolute top-1.5 right-1.5 z-10" onClick={e => e.stopPropagation()}>
          <ActionMenu />
        </div>
      )}
      <span className="text-4xl mt-1">{isDragOver ? '📂' : '📁'}</span>
      {editing ? (
        <input value={name} onChange={e => setName(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(folder.name); setEditing(false) } }}
          className="w-full bg-surface-2 px-2 py-0.5 rounded text-xs text-ink focus:outline-none border border-accent/40 text-center" autoFocus
          onClick={e => e.stopPropagation()} />
      ) : (<>
        <span className="text-xs text-ink truncate w-full leading-tight">{folder.name}</span>
        {fileCount !== null && (
          <span className="text-xs text-ink-faint font-mono">{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
        )}
      </>)}
    </motion.div>
  )
}

// ── File Card ─────────────────────────────────────────────
function FileCard({ file, viewMode, index, selectMode, isSelected, userIsAdmin, onPreview, onSelect, onDelete, onRename, onShare, onDragStart, onDragEnd }:
  {
    file: DriveFile; viewMode: 'grid' | 'list'; index: number
    selectMode: boolean; isSelected: boolean; userIsAdmin: boolean
    onPreview: () => void; onSelect: () => void; onDelete: () => void
    onRename: (n: string) => void; onShare: () => void
    onDragStart: () => void; onDragEnd: () => void
  }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(file.name)
  const [dragging, setDragging] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const commit = () => { if (name.trim() && name !== file.name) onRename(name.trim()); setEditing(false) }

  const thumbUrl = isImage(file.mime_type) ? getThumbUrl(file.id) : null
  const serveUrl = getFileUrl(file.id)

  const handleDragStart = (e: React.DragEvent) => {
    if (selectMode) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'; setDragging(true); onDragStart()
  }

  const selRing = isSelected ? 'ring-2 ring-accent bg-accent/10' : ''

  const ActionMenu = () => (
    <div onClick={e => e.stopPropagation()}>
      <button ref={menuBtnRef} onClick={() => setMenuOpen(m => !m)}
        className="p-1.5 rounded-lg hover:bg-surface-4 text-ink-muted hover:text-ink transition-colors text-base">⋯</button>
      <AnimatePresence>
        {menuOpen && (
          <PortalMenu anchorRef={menuBtnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
            <MenuItem icon="👁" label="Preview" onClick={() => { onPreview(); setMenuOpen(false) }} />
            <MenuItem icon="✏️" label="Rename" onClick={() => { setEditing(true); setName(file.name); setMenuOpen(false) }} />
            <MenuItem icon="🔗" label="Share" onClick={() => { onShare(); setMenuOpen(false) }} />
            <a href={serveUrl} download={file.name} onClick={() => setMenuOpen(false)}>
              <MenuItem icon="⬇️" label="Download" onClick={() => {}} />
            </a>
            <div className="h-px bg-surface-3 my-1" />
            <MenuItem icon="🗑" label="Delete" onClick={() => { onDelete(); setMenuOpen(false) }} danger />
          </PortalMenu>
        )}
      </AnimatePresence>
    </div>
  )

  if (viewMode === 'list') {
    return (
      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}
        draggable={!selectMode} onDragStart={handleDragStart} onDragEnd={() => { setDragging(false); onDragEnd() }}
        onClick={selectMode ? onSelect : onPreview}
        className={`flex items-center gap-3 px-3 py-3 rounded-xl glass glass-hover cursor-pointer group transition-all ${dragging ? 'opacity-40 scale-95' : ''} ${selRing}`}>
        {selectMode && (
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent border-accent' : 'border-surface-4'}`}>
            {isSelected && <span className="text-white text-xs">✓</span>}
          </div>
        )}
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center flex-shrink-0">
          {thumbUrl ? <img src={thumbUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">{fileIcon(file.mime_type)}</span>}
        </div>
        {editing ? (
          <input value={name} onChange={e => setName(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(file.name); setEditing(false) } }}
            className="flex-1 bg-surface-2 px-2 py-1 rounded-lg text-sm text-ink focus:outline-none border border-accent/40" autoFocus
            onClick={e => e.stopPropagation()} />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink truncate">{file.name}</p>
            <p className="text-xs text-ink-muted font-mono">{formatBytes(file.size)}</p>
          </div>
        )}
        {!selectMode && !editing && <ActionMenu />}
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
      draggable={!selectMode} onDragStart={handleDragStart} onDragEnd={() => { setDragging(false); onDragEnd() }}
      onClick={selectMode ? onSelect : onPreview}
      className={`glass glass-hover rounded-xl p-2 sm:p-3 cursor-pointer group flex flex-col gap-1.5 sm:gap-2 transition-all relative ${dragging ? 'opacity-40 scale-95' : ''} ${selRing}`}>
      {selectMode && (
        <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow ${isSelected ? 'bg-accent border-accent' : 'bg-surface-1/80 border-surface-4'}`}>
          {isSelected && <span className="text-white text-xs font-bold">✓</span>}
        </div>
      )}
      {!selectMode && (
        <div className="absolute top-1.5 right-1.5 z-10" onClick={e => e.stopPropagation()}>
          <ActionMenu />
        </div>
      )}
      <div className="w-full aspect-square rounded-lg bg-surface-2 flex items-center justify-center overflow-hidden">
        {thumbUrl ? <img src={thumbUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl sm:text-4xl">{fileIcon(file.mime_type)}</span>}
      </div>
      {editing ? (
        <input value={name} onChange={e => setName(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(file.name); setEditing(false) } }}
          className="w-full bg-surface-2 px-2 py-0.5 rounded text-xs text-ink focus:outline-none border border-accent/40" autoFocus
          onClick={e => e.stopPropagation()} />
      ) : (
        <span className="text-xs text-ink truncate leading-tight px-0.5">{file.name}</span>
      )}
      <span className="text-xs text-ink-muted font-mono px-0.5">{formatBytes(file.size)}</span>
    </motion.div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-3 ${danger ? 'text-red-400' : 'text-ink'}`}>
      <span>{icon}</span>{label}
    </button>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-64 text-center px-4">
      <div className="text-6xl mb-4 opacity-30">📭</div>
      <p className="text-ink-muted text-sm mb-4">This folder is empty</p>
      <button onClick={onUpload}
        className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent-bright text-sm rounded-lg hover:bg-accent/30 transition-colors">
        Upload files
      </button>
    </motion.div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-3 animate-pulse-slow">
          <div className="w-full aspect-square rounded-lg bg-surface-3 mb-2" />
          <div className="h-3 bg-surface-3 rounded w-3/4" />
        </div>
      ))}
    </div>
  )
}
