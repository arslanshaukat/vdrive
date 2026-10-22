const clean = s => String(s ?? '').replace(/[^a-zA-Z0-9]/g, '')

const EXT_MIME = { mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' }
const fixMime = (mime, name) => {
  if (mime && mime !== 'application/octet-stream') return mime
  const ext = String(name || '').split('.').pop().toLowerCase()
  return EXT_MIME[ext] || mime || 'application/octet-stream'
}
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })

const fileView = f => {
  const mime = fixMime(f.mime_type, f.name)
  return {
    id: f.id, name: f.name, size: f.size || 0, mime_type: mime,
    url: `/api/files/${f.id}/serve`,
    thumb_url: mime.startsWith('image/') ? `/api/files/${f.id}/thumb` : null,
  }
}

async function fetchAll(pbFetch, collection, fields) {
  const out = []
  for (let page = 1; page <= 40; page++) {
    const r = await pbFetch(`/collections/${collection}/records?perPage=500&page=${page}&sort=created&fields=${fields}`)
    if (!r.ok) throw new Error(`${collection} load failed (${r.status})`)
    const d = await r.json()
    const items = d.items || []
    out.push(...items)
    if (items.length < 500) break
  }
  return out
}

let cache = { t: 0, data: null }

async function loadTree(pbFetch, maxAgeMs = 0) {
  if (maxAgeMs && cache.data && Date.now() - cache.t < maxAgeMs) return cache.data
  const [folders, files] = await Promise.all([
    fetchAll(pbFetch, 'vdrive_folders', 'id,name,parent_id'),
    fetchAll(pbFetch, 'vdrive_files', 'id,name,size,mime_type,folder_id'),
  ])
  const folderMap = new Map(folders.map(f => [f.id, f]))
  const kids = new Map()
  for (const f of folders) {
    const p = f.parent_id || ''
    if (!kids.has(p)) kids.set(p, [])
    kids.get(p).push(f)
  }
  const filesBy = new Map()
  for (const f of files) {
    const k = f.folder_id || ''
    if (!filesBy.has(k)) filesBy.set(k, [])
    filesBy.get(k).push(f)
  }
  const totals = new Map()
  const total = (id, seen = new Set()) => {
    if (totals.has(id)) return totals.get(id)
    if (seen.has(id)) return 0
    seen.add(id)
    let n = (filesBy.get(id) || []).length
    for (const k of kids.get(id) || []) n += total(k.id, seen)
    totals.set(id, n)
    return n
  }
  const data = { folderMap, kids, filesBy, total }
  cache = { t: Date.now(), data }
  return data
}

export function registerShareBrowse(app, { requireAuth, pbFetch }) {
  // Folder badge: total files inside, including all subfolders
  app.get('/api/folders/counts', requireAuth, async (req, res) => {
    try {
      const ids = String(req.query.ids || '').split(',').map(clean).filter(Boolean).slice(0, 500)
      const t = await loadTree(pbFetch, 0)
      const out = {}
      for (const id of ids) out[id] = t.total(id)
      res.json(out)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // Public share listing with subfolder navigation (password gate runs before this)
  app.get('/api/public/s/:code', async (req, res) => {
    try {
      const filter = encodeURIComponent(`code="${clean(req.params.code)}"`)
      const sr = await pbFetch(`/collections/vdrive_shares/records?filter=${filter}&perPage=1`)
      const share = (await sr.json()).items?.[0]
      if (!share) return res.status(404).json({ error: 'Share link not found' })

      if (share.type === 'file') {
        const r = await pbFetch(`/collections/vdrive_files/records/${clean(share.target_id)}`)
        if (!r.ok) return res.status(404).json({ error: 'File not found' })
        return res.json({ type: 'file', label: share.label, files: [fileView(await r.json())], folders: [], path: [] })
      }

      const t = await loadTree(pbFetch, 10000)
      const rootId = clean(share.target_id)
      const wanted = clean(req.query.folder) || rootId

      // Walk up from the requested folder; it must lead back to the shared folder
      const path = []
      let cur = wanted
      let inside = false
      for (let i = 0; i < 30 && cur; i++) {
        const f = t.folderMap.get(cur)
        if (!f) break
        path.unshift({ id: f.id, name: f.name })
        if (f.id === rootId) { inside = true; break }
        cur = f.parent_id
      }
      if (!inside) return res.status(404).json({ error: 'Folder not found' })

      const folders = (t.kids.get(wanted) || []).slice().sort(byName)
        .map(f => ({ id: f.id, name: f.name, count: t.total(f.id) }))
      const files = (t.filesBy.get(wanted) || []).slice().sort(byName).map(fileView)

      res.json({
        type: 'folder',
        label: wanted === rootId ? share.label : path[path.length - 1].name,
        files, folders, path,
      })
    } catch (err) { res.status(500).json({ error: 'Server error' }) }
  })
}
