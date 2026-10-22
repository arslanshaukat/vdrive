import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ShareFolders } from '../components/ShareFolders'
import { motion, AnimatePresence } from 'framer-motion'
import { formatBytes, fileIcon, isImage, isVideo, isAudio, isPdf } from '../lib/api'

interface PublicFile {
  id: string; name: string; size: number; mime_type: string; url: string; thumb_url?: string | null
}
interface ShareData {
  type: 'file' | 'folder'; label: string; files: PublicFile[]; folders?: { id: string; name: string; count: number }[]; path?: { id: string; name: string }[]
}
interface Company {
  name: string; tagline: string; mission: string; website: string; email: string; phone: string; logo: string
}

const DEFAULT_COMPANY: Company = {
  name: 'GT International INC',
  tagline: 'Quality Construction Equipment',
  mission: 'At GT International INC, our mission is to provide the construction industry with the highest quality used and new construction equipment. We aim to be the go-to source for Trucks, cranes, excavators, bulldozers, graders, wheel loaders, compactors, and more.',
  website: 'https://gtintl.com.ph',
  email: 'gtsubic@gmail.com',
  phone: '',
  logo: 'GTI',
}

export function SharePage() {
  // Track touch to distinguish tap from scroll
  const touchStartY = useRef<number>(0)
  const touchStartX = useRef<number>(0)
  const { code } = useParams<{ code: string }>()
  const [sp, setSp] = useSearchParams()
  const folderParam = sp.get('folder') || ''
  const [data, setData] = useState<ShareData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company>(DEFAULT_COMPANY)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => setCompany({
        name: s.company_name || DEFAULT_COMPANY.name,
        tagline: s.company_tagline || DEFAULT_COMPANY.tagline,
        mission: s.company_mission || DEFAULT_COMPANY.mission,
        website: s.company_website || DEFAULT_COMPANY.website,
        email: s.company_email || DEFAULT_COMPANY.email,
        phone: s.company_phone || '',
        logo: s.company_logo || DEFAULT_COMPANY.logo,
      }))
      .catch(() => {})

    fetch(`/api/public/s/${code}${folderParam ? '?folder=' + encodeURIComponent(folderParam) : ''}`, { headers: { 'X-Share-Token': sessionStorage.getItem('share_token_' + code) || '' } })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || 'Not found')))
      .then(setData)
      .catch(e => setError(typeof e === 'string' ? e : 'Link not found or expired'))
      .finally(() => setLoading(false))
  }, [code, folderParam])

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const selectAll = () => {
    if (!data) return
    selected.size === data.files.length ? setSelected(new Set()) : setSelected(new Set(data.files.map(f => f.id)))
  }

  const downloadFiles = async (filesToDl: PublicFile[]) => {
    setDownloading(true)
    for (const file of filesToDl) {
      const a = document.createElement('a')
      a.href = file.url; a.download = file.name; a.target = '_blank'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      await new Promise(r => setTimeout(r, 400))
    }
    setDownloading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 shadow-lg shadow-accent/30">{DEFAULT_COMPANY.logo}</div>
        <p className="text-white/40 text-sm animate-pulse">Loading…</p>
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-xl mx-auto mb-6">{company.logo}</div>
      <p className="text-white font-semibold mb-2">Link not found</p>
      <p className="text-white/40 text-sm">{error}</p>
    </div>
  )

  const imageFiles = data.files.filter(f => isImage(f.mime_type))
  const otherFiles = data.files.filter(f => !isImage(f.mime_type))
  const allSelected = data.files.length > 0 && selected.size === data.files.length

  return (
    <div className="bg-gray-950" style={{ minHeight: "100dvh" }}>

      {/* Company top bar */}
      <div className="bg-gray-900 border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white text-xs font-bold shadow shadow-accent/30 flex-shrink-0">
            {company.logo}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">{company.name}</p>
            <p className="text-white/40 text-xs leading-tight">{company.tagline}</p>
          </div>
          <div className="flex-1" />
          {company.website && (
            <a href={company.website} target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs rounded-lg transition-all">
              🌐 Visit Website
            </a>
          )}
        </div>
      </div>

      {/* Share header */}
      <div className="bg-gray-900/60 border-b border-white/8 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">{data.type === 'folder' ? '📂' : '📄'}</span>
              <p className="text-white font-medium text-sm truncate">{data.label}</p>
            </div>
            <p className="text-white/30 text-xs mt-0.5 pl-7">
              {data.files.length} file{data.files.length !== 1 ? 's' : ''} · shared by {company.name}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!selectMode && data.files.length > 1 && (
              <>
                <button onClick={() => setSelectMode(true)}
                  className="px-3 py-1.5 bg-white/8 border border-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs rounded-lg transition-all">
                  ☑ Select
                </button>
                <button onClick={() => downloadFiles(data.files)} disabled={downloading}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all">
                  {downloading ? '⏳' : '⬇'} Download all ({data.files.length})
                </button>
              </>
            )}
            {!selectMode && data.files.length === 1 && (
              <a href={data.files[0].url} download={data.files[0].name}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent/80 text-white text-xs font-medium rounded-lg transition-all">
                ⬇ Download
              </a>
            )}
            {selectMode && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 flex-wrap">
                <button onClick={selectAll}
                  className="px-3 py-1.5 bg-white/8 border border-white/10 text-white/70 text-xs rounded-lg hover:bg-white/15 transition-all">
                  {allSelected ? '☑ Deselect all' : '☐ Select all'}
                </button>
                <span className="text-xs text-white/40">{selected.size} selected</span>
                <button onClick={() => downloadFiles(data.files.filter(f => selected.has(f.id)))}
                  disabled={selected.size === 0 || downloading}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-all">
                  {downloading ? '⏳' : `⬇ (${selected.size})`}
                </button>
                <button onClick={() => { setSelectMode(false); setSelected(new Set()) }}
                  className="px-3 py-1.5 bg-white/8 border border-white/10 text-white/70 text-xs rounded-lg hover:bg-white/15 transition-all">
                  Cancel
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Files */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
        <ShareFolders folders={data.folders || []} path={data.path || []} onOpen={id => id ? setSp({ folder: id }) : setSp({})} />
        {imageFiles.length > 0 && (
          <section className="mb-8">
            {otherFiles.length > 0 && <h2 className="text-white/30 text-xs font-mono uppercase tracking-widest mb-3">Images</h2>}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
              {imageFiles.map((file, i) => {
                const isSel = selected.has(file.id)
                const globalIndex = data.files.indexOf(file)
                return (
                  <motion.div key={file.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className={`group relative aspect-square rounded-xl overflow-hidden bg-gray-900 cursor-pointer transition-all
                      ${isSel ? 'ring-2 ring-accent scale-[0.97]' : 'hover:scale-[1.02]'}`}
                    onTouchStart={e => { touchStartY.current = e.touches[0].clientY; touchStartX.current = e.touches[0].clientX }}
                    onTouchEnd={e => {
                      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
                      const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current)
                      if (dy < 10 && dx < 10) {
                        if (selectMode) toggleSelect(file.id)
                        else setPreviewIndex(globalIndex)
                      }
                    }}
                    onClick={() => {
                      if (!('ontouchstart' in window)) {
                        if (selectMode) toggleSelect(file.id)
                        else setPreviewIndex(globalIndex)
                      }
                    }}
                    style={{ touchAction: 'pan-y' }}
                    >
                    <img src={file.thumb_url || file.url} alt={file.name} className="w-full h-full object-cover pointer-events-none" />
                    {selectMode && (
                      <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow transition-all
                        ${isSel ? 'bg-accent border-accent' : 'bg-black/60 border-white/30'}`}>
                        {isSel && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                    )}
                    {!selectMode && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                        <div className="w-full px-3 py-3">
                          <p className="text-white text-xs truncate mb-1.5 font-medium">{file.name}</p>
                          <a href={file.url} download={file.name} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg transition-colors">
                            ⬇ Download
                          </a>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </section>
        )}

        {otherFiles.length > 0 && (
          <section className="mb-8">
            {imageFiles.length > 0 && <h2 className="text-white/30 text-xs font-mono uppercase tracking-widest mb-3">Files</h2>}
            <div className="space-y-2">
              {otherFiles.map((file, i) => {
                const isSel = selected.has(file.id)
                const globalIndex = data.files.indexOf(file)
                return (
                  <motion.div key={file.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={selectMode ? () => toggleSelect(file.id) : undefined}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900 border border-white/6 hover:border-white/12 hover:bg-gray-800 transition-all group
                      ${selectMode ? 'cursor-pointer' : ''} ${isSel ? 'ring-2 ring-accent' : ''}`}>
                    {selectMode && (
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-accent border-accent' : 'border-white/20'}`}>
                        {isSel && <span className="text-white text-xs">✓</span>}
                      </div>
                    )}
                    <span className="text-2xl flex-shrink-0">{fileIcon(file.mime_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate font-medium">{file.name}</p>
                      <p className="text-white/30 text-xs font-mono">{formatBytes(file.size)}</p>
                    </div>
                    {!selectMode && (
                      <div className="flex items-center gap-2">
                        {(isVideo(file.mime_type) || isAudio(file.mime_type) || isPdf(file.mime_type)) && (
                          <button onClick={() => setPreviewIndex(globalIndex)}
                            className="px-3 py-1.5 bg-white/8 hover:bg-white/15 text-white/60 hover:text-white text-xs rounded-lg transition-all">
                            Preview
                          </button>
                        )}
                        <a href={file.url} download={file.name}
                          className="px-3 py-1.5 bg-accent/20 border border-accent/30 hover:bg-accent/30 text-accent-bright text-xs rounded-lg transition-all">
                          ⬇ Download
                        </a>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* Company footer */}
      <div className="border-t border-white/8 bg-gray-900/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
            <div className="flex-shrink-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-white font-bold shadow shadow-accent/30">{company.logo}</div>
                <div>
                  <p className="text-white font-semibold text-sm">{company.name}</p>
                  <p className="text-white/40 text-xs">{company.tagline}</p>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-white/40 text-xs leading-relaxed">{company.mission}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-6 pt-5 border-t border-white/6">
            <div className="flex items-center gap-4 text-xs text-white/30">
              {company.phone && <a href={`tel:${company.phone.replace(/\s/g,'')}`} className="hover:text-white/60 transition-colors">📞 {company.phone}</a>}
              {company.email && <a href={`mailto:${company.email}`} className="hover:text-white/60 transition-colors">✉ {company.email}</a>}
              {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">🌐 {company.website.replace('https://', '')}</a>}
            </div>
            <p className="text-white/20 text-xs">© {new Date().getFullYear()} {company.name}</p>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {previewIndex !== null && data && (
          <ShareLightbox
            file={data.files[previewIndex]}
            index={previewIndex}
            total={data.files.length}
            hasPrev={previewIndex > 0}
            hasNext={previewIndex < data.files.length - 1}
            onClose={() => setPreviewIndex(null)}
            onPrev={() => setPreviewIndex(i => i !== null ? i - 1 : null)}
            onNext={() => setPreviewIndex(i => i !== null ? i + 1 : null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Lightbox with prev/next + swipe ─────────────────────
function ShareLightbox({ file, index, total, hasPrev, hasNext, onClose, onPrev, onNext }:
  { file: PublicFile; index: number; total: number; hasPrev: boolean; hasNext: boolean
    onClose: () => void; onPrev: () => void; onNext: () => void }) {

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [hasPrev, hasNext, onClose, onPrev, onNext])

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0))
    touchStartX.current = null; touchStartY.current = null
    if (Math.abs(dx) < 50 || dy > Math.abs(dx)) return
    if (dx < 0 && hasNext) onNext()
    if (dx > 0 && hasPrev) onPrev()
  }

  const isImg = isImage(file.mime_type)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      style={{ height: '100dvh' }}
      onClick={onClose}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 sm:px-5 border-b border-white/10 bg-black/60 flex-shrink-0"
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg flex-shrink-0">✕</button>
        <div className="flex-1 min-w-0 px-1">
          <p className="text-white text-sm font-medium truncate">{file.name}</p>
          <p className="text-white/40 text-xs font-mono">
            {formatBytes(file.size)}
            {total > 1 && <span className="ml-2">{index + 1} / {total}</span>}
          </p>
        </div>
        <a href={file.url} download={file.name} onClick={e => e.stopPropagation()}
          className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded-xl transition-colors flex-shrink-0">
          ⬇ <span className="hidden sm:inline">Download</span>
        </a>
      </div>

      {/* Content + arrows */}
      <div className="flex-1 relative min-h-0 overflow-hidden" onClick={onClose}>
        {hasPrev && (
          <button onClick={e => { e.stopPropagation(); onPrev() }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white text-3xl border border-white/20 select-none"
            style={{ touchAction: 'manipulation' }}>‹</button>
        )}
        {hasNext && (
          <button onClick={e => { e.stopPropagation(); onNext() }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white text-3xl border border-white/20 select-none"
            style={{ touchAction: 'manipulation' }}>›</button>
        )}
        <motion.div
          key={index}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
          className="absolute inset-0 flex items-center justify-center p-4 sm:p-10 pointer-events-none"
        >
          {isImg && (
            <img src={file.url} alt={file.name}
              className="max-w-full max-h-full object-contain rounded-xl select-none"
              onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
              style={{ pointerEvents: 'auto' }} draggable={false} />
          )}
          {isVideo(file.mime_type) && (
            <video controls autoPlay playsInline className="max-w-full max-h-full rounded-xl"
              style={{ pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}
              onError={e => {
                const el = e.currentTarget; el.style.display = 'none'
                const div = document.createElement('div')
                div.innerHTML = '<div style="text-align:center"><div style="font-size:4rem;margin-bottom:1rem">🎬</div><p style="color:rgba(255,255,255,0.5);font-size:0.875rem;margin-bottom:1rem">Cannot preview this video format</p><a href="' + file.url + '" download style="display:inline-block;padding:0.75rem 1.5rem;background:rgba(108,99,255,0.2);border:1px solid rgba(108,99,255,0.3);color:#9d97ff;border-radius:0.75rem;text-decoration:none">⬇ Download to play</a></div>'
                el.parentNode?.appendChild(div)
              }}>
              <source src={file.url} type={file.mime_type === 'video/quicktime' ? 'video/mp4' : file.mime_type} />
              <source src={file.url} type="video/quicktime" />
            </video>
          )}
          {isAudio(file.mime_type) && (
            <div className="text-center" style={{ pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="text-6xl mb-5">🎵</div>
              <p className="text-white text-sm mb-5 truncate max-w-xs">{file.name}</p>
              <audio src={file.url} controls autoPlay className="w-full max-w-xs" />
            </div>
          )}
          {isPdf(file.mime_type) && (
            <iframe src={file.url} title={file.name} className="w-full rounded-xl border-0"
              style={{ height: 'calc(100dvh - 140px)', pointerEvents: 'auto' }}
              onClick={e => e.stopPropagation()} />
          )}
          {!isImg && !isVideo(file.mime_type) && !isAudio(file.mime_type) && !isPdf(file.mime_type) && (
            <div className="text-center" style={{ pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="text-6xl mb-4">📄</div>
              <p className="text-white/50 text-sm mb-6">No preview available</p>
              <a href={file.url} download={file.name}
                className="inline-block px-6 py-3 bg-accent/20 border border-accent/30 text-accent-bright text-sm rounded-xl hover:bg-accent/30 transition-colors">
                ⬇ Download
              </a>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
