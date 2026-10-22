interface Props {
  folders: { id: string; name: string; count: number }[]
  path: { id: string; name: string }[]
  onOpen: (id: string | null) => void
}

export function ShareFolders({ folders, path, onOpen }: Props) {
  if (folders.length === 0 && path.length <= 1) return null
  return (
    <section className="mb-8">
      {path.length > 1 && (
        <nav className="flex items-center gap-1 flex-wrap text-sm mb-4">
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-white/20">/</span>}
              {i === path.length - 1 ? (
                <span className="text-white font-medium px-1">{p.name}</span>
              ) : (
                <button onClick={() => onOpen(i === 0 ? null : p.id)}
                  className="px-2 py-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                  {p.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      {folders.length > 0 && (
        <>
          <h2 className="text-white/30 text-xs font-mono uppercase tracking-widest mb-3">Folders</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {folders.map(f => (
              <button key={f.id} onClick={() => onOpen(f.id)}
                className="bg-gray-900 border border-white/6 hover:border-white/15 hover:bg-gray-800 rounded-xl p-4 flex flex-col items-center gap-1.5 text-center transition-all">
                <span className="text-4xl">📁</span>
                <span className="text-white text-xs leading-tight w-full truncate">{f.name}</span>
                <span className="text-white/30 text-xs font-mono">{f.count} {f.count === 1 ? 'file' : 'files'}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
