import { Folder } from '../lib/api'

interface Props {
  trail: Folder[]
  currentFolder: string | null
  onNavigate: (id: string | null) => void
}

export function Breadcrumb({ trail, currentFolder, onNavigate }: Props) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <button onClick={() => onNavigate(null)}
        className={`px-2 py-1 rounded hover:bg-surface-3 transition-colors ${!currentFolder ? 'text-ink font-medium' : 'text-ink-muted'}`}>
        My Drive
      </button>
      {trail.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          <span className="text-ink-faint">/</span>
          <button onClick={() => onNavigate(f.id)}
            className={`px-2 py-1 rounded hover:bg-surface-3 transition-colors ${i === trail.length - 1 ? 'text-ink font-medium' : 'text-ink-muted'}`}>
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  )
}
