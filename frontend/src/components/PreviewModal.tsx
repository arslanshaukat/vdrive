import { useEffect, useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DriveFile, isImage, isVideo, isAudio, isPdf, formatBytes, getFileStreamUrl, getFileUrl, getThumbUrl } from '../lib/api'

interface Props {
  file: DriveFile
  allFiles: DriveFile[]
  onClose: () => void
  onNavigate: (file: DriveFile) => void
}

export function PreviewModal({ file, allFiles, onClose, onNavigate }: Props) {
  const currentIndex = allFiles.findIndex(f => f.id === file.id)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < allFiles.length - 1
  const prevFile = hasPrev ? allFiles[currentIndex - 1] : null
  const nextFile = hasNext ? allFiles[currentIndex + 1] : null
  const [slideDir, setSlideDir] = useState<number>(0)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const goNext = useCallback(() => {
    if (nextFile) { setSlideDir(-1); onNavigate(nextFile) }
  }, [nextFile, onNavigate])

  const goPrev = useCallback(() => {
    if (prevFile) { setSlideDir(1); onNavigate(prevFile) }
  }, [prevFile, onNavigate])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft') goPrev()
    if (e.key === 'ArrowRight') goNext()
  }, [onClose, goPrev, goNext])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  useEffect(() => { setSlideDir(0) }, [file.id])

  const onImgTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  const onImgTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0))
    touchStartX.current = null; touchStartY.current = null
    if (Math.abs(dx) < 50 || dy > Math.abs(dx)) return
    if (dx < 0) goNext(); else goPrev()
  }

  const serveUrl = getFileUrl(file.id)
  const streamUrl = getFileStreamUrl(file.id)
  const isImg = isImage(file.mime_type)
  const imageFiles = allFiles.filter(f => isImage(f.mime_type))

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-black/92"
        style={{ height: '100dvh' }}
      >
        {/* Header — clicking here does NOT close */}
        <div className="flex items-center gap-2 px-3 py-3 sm:px-5 sm:py-4 border-b border-white/10 bg-black/60 flex-shrink-0 z-10">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0 text-lg"
          >✕</button>
          <div className="flex-1 min-w-0 px-1">
            <p className="text-white text-sm font-medium truncate">{file.name}</p>
            <p className="text-white/40 text-xs font-mono">
              {formatBytes(file.size)}
              {allFiles.length > 1 && <span className="ml-2">{currentIndex + 1} / {allFiles.length}</span>}
            </p>
          </div>
          <a href={serveUrl} download={file.name}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded-xl transition-colors flex-shrink-0">
            ⬇ <span className="hidden sm:inline">Download</span>
          </a>
        </div>

        {/* Content + arrows — outer div is the backdrop (click to close) */}
        <div
          className="flex-1 relative min-h-0 overflow-hidden cursor-default"
          onClick={onClose}
        >
          {/* Prev arrow — stopPropagation so it doesn't close */}
          {hasPrev && (
            <button
              onClick={e => { e.stopPropagation(); goPrev() }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white text-3xl border border-white/20 select-none"
              style={{ touchAction: 'manipulation' }}
            >‹</button>
          )}

          {/* Next arrow — stopPropagation so it doesn't close */}
          {hasNext && (
            <button
              onClick={e => { e.stopPropagation(); goNext() }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white text-3xl border border-white/20 select-none"
              style={{ touchAction: 'manipulation' }}
            >›</button>
          )}

          {/* Animated content — pointer-events-none so clicks fall to backdrop */}
          <motion.div
            key={file.id}
            initial={{ opacity: 0, x: slideDir * 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-10 pointer-events-none"
          >
            {isImg && (
              <img
                src={serveUrl} alt={file.name}
                className="max-w-full max-h-full object-contain rounded-xl select-none"
                onTouchStart={onImgTouchStart}
                onTouchEnd={onImgTouchEnd}
                style={{ pointerEvents: 'auto' }}
                draggable={false}
              />
            )}
            {isVideo(file.mime_type) && (
              <video src={streamUrl} controls autoPlay
                className="max-w-full max-h-full rounded-xl"
                style={{ pointerEvents: 'auto' }}
                onClick={e => e.stopPropagation()} />
            )}
            {isAudio(file.mime_type) && (
              <div className="text-center" style={{ pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="text-6xl mb-5">🎵</div>
                <p className="text-white text-sm mb-5 truncate max-w-xs">{file.name}</p>
                <audio src={streamUrl} controls autoPlay className="w-full max-w-xs" />
              </div>
            )}
            {isPdf(file.mime_type) && (
              <iframe src={serveUrl} title={file.name} className="w-full rounded-xl border-0"
                style={{ height: 'calc(100dvh - 140px)', pointerEvents: 'auto' }}
                onClick={e => e.stopPropagation()} />
            )}
            {!isImg && !isVideo(file.mime_type) && !isAudio(file.mime_type) && !isPdf(file.mime_type) && (
              <div className="text-center" style={{ pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="text-6xl mb-4">📄</div>
                <p className="text-white/50 text-sm mb-6">No preview available</p>
                <a href={serveUrl} download={file.name}
                  className="inline-block px-6 py-3 bg-accent/20 border border-accent/30 text-accent-bright text-sm rounded-xl hover:bg-accent/30 transition-colors">
                  ⬇ Download
                </a>
              </div>
            )}
          </motion.div>
        </div>

        {/* Thumbnail strip */}
        {imageFiles.length > 1 && isImg && (
          <div className="flex-shrink-0 border-t border-white/10 bg-black/60 px-3 py-2.5">
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {imageFiles.map((f, i) => (
                <button key={f.id}
                  onClick={() => { setSlideDir(i > currentIndex ? -1 : 1); onNavigate(f) }}
                  className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all
                    ${f.id === file.id ? 'border-accent scale-110' : 'border-transparent opacity-40 hover:opacity-80'}`}>
                  <img src={getThumbUrl(f.id)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
