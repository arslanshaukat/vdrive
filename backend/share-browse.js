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
    fetchAll(pbFetch, 'vdrive_folders', 'id,name,parent_id,cover_id'),
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
  const covers = new Map()
  for (const [fid, list] of filesBy) {
    const imgs = list.filter(f => {
      const m = fixMime(f.mime_type, f.name)
      return m.startsWith('image/') && !/heic|heif/.test(m)
    })
    if (imgs.length) {
      const fol = folderMap.get(fid)
      const pick = fol && fol.cover_id ? imgs.find(f => f.id === fol.cover_id) : null
      covers.set(fid, (pick || imgs.slice().sort(byName)[0]).id)
    }
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
  const data = { folderMap, kids, filesBy, total, covers }
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

  app.get('/api/folders/covers', requireAuth, async (req, res) => {
    try {
      const ids = String(req.query.ids || '').split(',').map(clean).filter(Boolean).slice(0, 500)
      const t = await loadTree(pbFetch, 10000)
      const out = {}
      for (const id of ids) { const cv = t.covers.get(id); if (cv) out[id] = cv }
      res.json(out)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.put('/api/folders/:id/cover', requireAuth, async (req, res) => {
    try {
      const fid = clean(req.params.id)
      const fileId = clean(req.body?.file_id)
      if (!fid || !fileId) return res.status(400).json({ error: 'Invalid request' })
      const fr = await pbFetch(`/collections/vdrive_files/records/${fileId}?fields=id,name,folder_id,mime_type`)
      if (!fr.ok) return res.status(404).json({ error: 'File not found' })
      const f = await fr.json()
      if (clean(f.folder_id) !== fid) return res.status(400).json({ error: 'That photo is not inside this folder' })
      const mime = fixMime(f.mime_type, f.name)
      if (!mime.startsWith('image/') || /heic|heif/.test(mime))
        return res.status(400).json({ error: 'Choose a regular photo (JPG or PNG)' })
      const pr = await pbFetch(`/collections/vdrive_folders/records/${fid}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_id: fileId }),
      })
      const d = await pr.json()
      if (!pr.ok) return res.status(pr.status).json(d)
      if (d.cover_id !== fileId) return res.status(500).json({ error: 'cover_id field missing in PocketBase' })
      cache = { t: 0, data: null }
      res.json({ ok: true, cover: fileId })
    } catch { res.status(500).json({ error: 'Server error' }) }
  })

  app.delete('/api/folders/:id/cover', requireAuth, async (req, res) => {
    try {
      const fid = clean(req.params.id)
      const pr = await pbFetch(`/collections/vdrive_folders/records/${fid}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_id: '' }),
      })
      if (!pr.ok) return res.status(pr.status).json(await pr.json())
      cache = { t: 0, data: null }
      res.json({ ok: true })
    } catch { res.status(500).json({ error: 'Server error' }) }
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
        .map(f => ({ id: f.id, name: f.name, count: t.total(f.id), cover: t.covers.get(f.id) || null }))
      const files = (t.filesBy.get(wanted) || []).slice().sort(byName).map(fileView)

      res.json({
        type: 'folder',
        label: wanted === rootId ? share.label : path[path.length - 1].name,
        files, folders, path,
      })
    } catch (err) { res.status(500).json({ error: 'Server error' }) }
  })
}
