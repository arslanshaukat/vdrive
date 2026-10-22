import crypto from 'crypto'
import archiver from 'archiver'
import fetch from 'node-fetch'

const TICKET_TTL_MS = 2 * 60 * 1000
const MAX_FILES = 500
const tickets = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of tickets) if (v.exp < now) tickets.delete(k)
}, 60 * 1000).unref()

const clean = s => String(s ?? '').replace(/[^a-zA-Z0-9]/g, '')
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim()

function uniqueName(name, used) {
  let n = safeName(name) || 'file'
  if (!used.has(n)) { used.add(n); return n }
  const dot = n.lastIndexOf('.')
  const base = dot > 0 ? n.slice(0, dot) : n
  const ext = dot > 0 ? n.slice(dot) : ''
  let i = 2
  while (used.has(`${base} (${i})${ext}`)) i++
  n = `${base} (${i})${ext}`
  used.add(n)
  return n
}

export function registerZipDownload(app, { requireAuth, pbFetch, getPBToken, PB_URL, logActivity }) {
  // Step 1: logged-in user asks for a one-time download ticket
  app.post('/api/zip/ticket', requireAuth, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(clean).filter(Boolean))] : []
    if (ids.length < 1) return res.status(400).json({ error: 'No files selected' })
    if (ids.length > MAX_FILES) return res.status(400).json({ error: `Select at most ${MAX_FILES} files per ZIP` })
    const ticket = crypto.randomBytes(24).toString('hex')
    tickets.set(ticket, {
      ids,
      name: safeName(String(req.body?.name || '').slice(0, 100)),
      email: req.user.email,
      exp: Date.now() + TICKET_TTL_MS,
    })
    res.json({ url: `/api/zip/${ticket}` })
  })

  // Step 2: browser navigates here, the ticket is the authorisation (single use)
  app.get('/api/zip/:ticket', async (req, res) => {
    const t = tickets.get(req.params.ticket)
    tickets.delete(req.params.ticket)
    if (!t || t.exp < Date.now()) return res.status(410).send('This download link has expired. Please try again.')

    let closed = false
    let archive = null
    res.on('close', () => { closed = true; if (archive) archive.abort() })

    try {
      const records = []
      for (const id of t.ids) {
        const r = await pbFetch(`/collections/vdrive_files/records/${id}`)
        if (r.ok) records.push(await r.json())
      }
      if (!records.length) return res.status(404).send('No files found')

      let zipName = t.name
      if (!zipName) {
        try {
          const fid = clean(records[0].folder_id)
          if (fid) {
            const fr = await pbFetch(`/collections/vdrive_folders/records/${fid}`)
            if (fr.ok) zipName = safeName((await fr.json()).name)
          }
        } catch { /* fall back below */ }
      }
      zipName = zipName || 'VDrive-files'

      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition',
        `attachment; filename="${zipName.replace(/[^\x20-\x7e]/g, '_')}.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}.zip`)
      res.setHeader('X-Accel-Buffering', 'no')
      res.setHeader('Cache-Control', 'no-store')

      archive = archiver('zip', { store: true })
      archive.on('warning', err => console.warn('zip warning:', err.message))
      archive.on('error', err => { console.error('zip error:', err.message); closed = true; res.destroy() })
      archive.pipe(res)

      const addEntry = (stream, name) => new Promise((resolve, reject) => {
        const onEntry = () => { archive.off('error', onErr); resolve() }
        const onErr = e => { archive.off('entry', onEntry); reject(e) }
        archive.once('entry', onEntry)
        archive.once('error', onErr)
        archive.append(stream, { name })
      })

      const token = await getPBToken()
      const used = new Set()
      for (const rec of records) {
        if (closed) break
        const fr = await fetch(`${PB_URL}/api/files/${rec.collectionId}/${rec.id}/${rec.file}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!fr.ok) continue
        await addEntry(fr.body, uniqueName(rec.name || rec.file, used))
      }

      if (!closed) {
        await archive.finalize()
        if (typeof logActivity === 'function') {
          await logActivity(t.email, 'download_zip', zipName, `${records.length} files`)
        }
      }
    } catch (err) {
      console.error('zip failed:', err.message)
      if (!res.headersSent) res.status(500).send('Could not create ZIP')
      else res.destroy()
    }
  })
}
