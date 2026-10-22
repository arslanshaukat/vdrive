import crypto from 'crypto'
import archiver from 'archiver'
import fetch from 'node-fetch'
import { findShare, tokenOk } from './protected-shares.js'

const TICKET_TTL_MS = 2 * 60 * 1000
const MAX_FILES = 500
const MAX_ACTIVE = 4
const tickets = new Map()
let active = 0

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

export function registerShareZip(app, { pbFetch, getPBToken, PB_URL }) {
  // Visitor asks for a one-time ZIP ticket for files inside the shared folder
  app.post('/api/public/s/:code/zip-ticket', async (req, res) => {
    try {
      const share = await findShare(pbFetch, req.params.code)
      if (!share) return res.status(404).json({ error: 'Link not found' })
      if (share.password_hash && !tokenOk(share, req.headers['x-share-token']))
        return res.status(401).json({ error: 'Password required' })

      const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(clean).filter(Boolean))] : []
      if (ids.length < 1) return res.status(400).json({ error: 'No files selected' })
      if (ids.length > MAX_FILES) return res.status(400).json({ error: `Select at most ${MAX_FILES} files per ZIP` })

      const rootId = clean(share.target_id)
      const parentOf = new Map()
      const insideRoot = async folderId => {
        let cur = clean(folderId)
        for (let i = 0; i < 30 && cur; i++) {
          if (cur === rootId) return true
          if (!parentOf.has(cur)) {
            const r = await pbFetch(`/collections/vdrive_folders/records/${cur}?fields=id,parent_id`)
            parentOf.set(cur, r.ok ? clean((await r.json()).parent_id) : '')
          }
          cur = parentOf.get(cur)
        }
        return false
      }

      const allowed = []
      for (const id of ids) {
        if (share.type === 'file') { if (id === rootId) allowed.push(id); continue }
        const r = await pbFetch(`/collections/vdrive_files/records/${id}?fields=id,folder_id`)
        if (!r.ok) continue
        const f = await r.json()
        if (f.folder_id && await insideRoot(f.folder_id)) allowed.push(id)
      }
      if (!allowed.length) return res.status(400).json({ error: 'No valid files selected' })

      const ticket = crypto.randomBytes(24).toString('hex')
      tickets.set(ticket, {
        ids: allowed,
        name: safeName(String(req.body?.name || share.label || '').slice(0, 100)) || 'Shared files',
        exp: Date.now() + TICKET_TTL_MS,
      })
      res.json({ url: `/api/public/zip/${ticket}` })
    } catch { res.status(500).json({ error: 'Server error' }) }
  })

  // Browser navigates here; the single-use ticket is the authorisation
  app.get('/api/public/zip/:ticket', async (req, res) => {
    const t = tickets.get(req.params.ticket)
    tickets.delete(req.params.ticket)
    if (!t || t.exp < Date.now()) return res.status(410).send('This download link has expired. Please try again.')
    if (active >= MAX_ACTIVE) return res.status(503).send('Server is busy preparing other downloads. Please try again in a minute.')

    active++
    let closed = false
    let archive = null
    res.on('close', () => { closed = true; active = Math.max(0, active - 1); if (archive) archive.abort() })

    try {
      const records = []
      for (const id of t.ids) {
        const r = await pbFetch(`/collections/vdrive_files/records/${id}`)
        if (r.ok) records.push(await r.json())
      }
      if (!records.length) return res.status(404).send('No files found')

      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition',
        `attachment; filename="${t.name.replace(/[^\x20-\x7e]/g, '_')}.zip"; filename*=UTF-8''${encodeURIComponent(t.name)}.zip`)
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
      if (!closed) await archive.finalize()
    } catch (err) {
      console.error('share zip failed:', err.message)
      if (!res.headersSent) res.status(500).send('Could not create ZIP')
      else res.destroy()
    }
  })
}
