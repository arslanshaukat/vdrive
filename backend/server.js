import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import cors from 'cors'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { Readable } from 'stream'
import crypto from 'crypto'
import { registerProtectedShares } from './protected-shares.js'
import { registerZipDownload } from './zip-download.js'
import { registerShareBrowse } from './share-browse.js'

const app = express()
const PORT = process.env.PORT || 3200
const PB_URL = process.env.POCKETBASE_URL || 'http://localhost:8091'
const PB_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_PASS = process.env.PB_ADMIN_PASSWORD

app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'X-Auth-Token', 'Authorization'], exposedHeaders: ['Content-Disposition'] }))
app.use(express.json())
registerProtectedShares(app, { requireAuth, pbFetch, logActivity: typeof logActivity === 'function' ? logActivity : null })
registerZipDownload(app, { requireAuth, pbFetch, getPBToken, PB_URL, logActivity: typeof logActivity === 'function' ? logActivity : null })
registerShareBrowse(app, { requireAuth, pbFetch })

// ── Dynamic users from PocketBase ────────────────────────
async function findUser(email, password) {
  try {
    const filter = encodeURIComponent(`email="${email}"`)
    const r = await pbFetch(`/collections/vdrive_users/records?filter=${filter}&perPage=1`)
    const d = await r.json()
    const user = d.items?.[0]
    if (!user) return null
    if (user.password !== password) return null
    if (user.active === false) return null
    return user
  } catch (err) {
    console.error('findUser error:', err)
    return null
  }
}

// Simple in-memory session tokens
const sessions = new Map()

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token']
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  req.user = sessions.get(token)
  next()
}

// ── PocketBase Admin Auth ────────────────────────────────
let pbToken = null
let tokenExpiry = 0

async function getPBToken() {
  if (pbToken && Date.now() < tokenExpiry) return pbToken
  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS })
  })
  if (!res.ok) throw new Error('PocketBase admin auth failed')
  const data = await res.json()
  pbToken = data.token
  tokenExpiry = Date.now() + 50 * 60 * 1000
  return pbToken
}

async function pbFetch(path, options = {}) {
  const token = await getPBToken()
  return fetch(`${PB_URL}/api${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  })
}


// Fix mime types that come in as octet-stream based on extension
function fixMimeType(mime, filename) {
  if (mime && mime !== 'application/octet-stream') return mime
  const ext = (filename || '').split('.').pop().toLowerCase()
  const map = {
    'mov': 'video/quicktime',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'm4v': 'video/mp4',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'pdf': 'application/pdf',
  }
  return map[ext] || mime || 'application/octet-stream'
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } })

function mapFile(record) {
  return {
    id: record.id,
    name: record.name,
    size: record.size || 0,
    mime_type: fixMimeType(record.mime_type, record.name),
    folder_id: record.folder_id || null,
    created: record.created,
    updated: record.updated,
    // These URLs go through our API, not direct PocketBase
    url: `/api/files/${record.id}/serve`,
    thumb_url: (record.mime_type || '').startsWith('image/') ? `/api/files/${record.id}/thumb` : null,
    // Store internal PB info for our server-side use
    _collection_id: record.collectionId,
    _file_field: record.file
  }
}

function mapFolder(record) {
  return {
    id: record.id,
    name: record.name,
    parent_id: record.parent_id || null,
    created: record.created,
    updated: record.updated,
  }
}

// ══════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  const user = await findUser(email, password)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const token = generateToken()
  sessions.set(token, { email: user.email, name: user.name, role: user.role })
  setTimeout(() => sessions.delete(token), 12 * 60 * 60 * 1000)

  res.json({
    token,
    user: { email: user.email, name: user.name, role: user.role }
  })
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token']
  if (token) sessions.delete(token)
  res.json({ ok: true })
})


function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

async function logActivity(userEmail, action, target = '', detail = '') {
  try {
    await pbFetch('/collections/vdrive_activity/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: userEmail, action, target, detail })
    })
  } catch { /* non-blocking */ }
}




// ══════════════════════════════════════════════════════════
// FOLDER ROUTES (protected)
// ══════════════════════════════════════════════════════════

app.get('/api/folders', requireAuth, async (req, res) => {
  try {
    const parentId = req.query.parent_id || ''
    const filter = parentId
      ? encodeURIComponent(`parent_id="${parentId}"`)
      : encodeURIComponent('parent_id=""')
    const r = await pbFetch(`/collections/vdrive_folders/records?filter=${filter}&sort=name&perPage=500`)
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json((data.items || []).map(mapFolder))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/folders', requireAuth, async (req, res) => {
  try {
    const { name, parent_id } = req.body
    const r = await pbFetch('/collections/vdrive_folders/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parent_id || '' })
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json(mapFolder(data))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  try {
    const r = await pbFetch(`/collections/vdrive_folders/records/${req.params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json(mapFolder(data))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/folders/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await deleteFolderCascade(req.params.id)
    await logActivity(req.user.email, 'delete_folder', req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

async function deleteFolderCascade(folderId) {
  const subRes = await pbFetch(`/collections/vdrive_folders/records?filter=${encodeURIComponent(`parent_id="${folderId}"`)}&perPage=500`)
  const subData = await subRes.json()
  for (const sub of (subData.items || [])) await deleteFolderCascade(sub.id)
  const fileRes = await pbFetch(`/collections/vdrive_files/records?filter=${encodeURIComponent(`folder_id="${folderId}"`)}&perPage=500`)
  const fileData = await fileRes.json()
  for (const file of (fileData.items || [])) {
    await pbFetch(`/collections/vdrive_files/records/${file.id}`, { method: 'DELETE' })
  }
  await pbFetch(`/collections/vdrive_folders/records/${folderId}`, { method: 'DELETE' })
}

// ══════════════════════════════════════════════════════════
// FILE ROUTES (protected)
// ══════════════════════════════════════════════════════════

app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const folderId = req.query.folder_id || ''
    const filter = folderId
      ? encodeURIComponent(`folder_id="${folderId}"`)
      : encodeURIComponent('folder_id=""')
    const r = await pbFetch(`/collections/vdrive_files/records?filter=${filter}&sort=-created&perPage=500`)
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json((data.items || []).map(mapFile))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const folderId = req.body.folder_id || ''
    const file = req.file
    if (!file) return res.status(400).json({ error: 'No file provided' })

    const fd = new FormData()
    fd.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype })
    const correctedMime = fixMimeType(file.mimetype, file.originalname)
    fd.append('name', file.originalname)
    fd.append('size', String(file.size))
    fd.append('mime_type', correctedMime)
    fd.append('folder_id', folderId)

    const token = await getPBToken()
    const r = await fetch(`${PB_URL}/api/collections/vdrive_files/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...fd.getHeaders() },
      body: fd
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    await logActivity(req.user.email, 'upload', file.originalname, `${Math.round(file.size/1024)}KB`)
    // Restart WebDAV so new file appears immediately
    import('child_process').then(({exec}) => exec('systemctl restart vdrive-webdav'))
    res.json(mapFile(data))
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/files/:id', requireAuth, async (req, res) => {
  try {
    const r = await pbFetch(`/collections/vdrive_files/records/${req.params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json(mapFile(data))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/files/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pbFetch(`/collections/vdrive_files/records/${req.params.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json(); return res.status(r.status).json(d) }
    await logActivity(req.user.email, 'delete_file', req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── File serve / thumb / stream (no auth - URLs are unguessable UUIDs) ──
async function getPBFileUrl(id, thumb = false) {
  const recRes = await pbFetch(`/collections/vdrive_files/records/${id}`)
  const record = await recRes.json()
  if (!recRes.ok) return null
  const base = `${PB_URL}/api/files/${record.collectionId}/${record.id}/${record.file}`
  return { url: thumb ? `${base}?thumb=800x600` : base, mime: record.mime_type, filename: record.name }
}

app.get('/api/files/:id/serve', async (req, res) => {
  try {
    const result = await getPBFileUrl(req.params.id)
    if (!result) return res.status(404).json({ error: 'Not found' })
    const token = await getPBToken()
    const headers = { Authorization: `Bearer ${token}` }
    if (req.headers.range) headers['Range'] = req.headers.range
    const r = await fetch(result.url, { headers })
    res.status(r.status)
    r.headers.forEach((v, k) => { if (!['content-type'].includes(k)) res.setHeader(k, v) })
    // Normalise MOV mime type — browsers need video/mp4 or video/quicktime
    let mime = fixMimeType(result.mime, result.filename)
    if (mime === 'video/quicktime') mime = 'video/mp4'
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    Readable.from(r.body).pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/files/:id/thumb', async (req, res) => {
  try {
    const result = await getPBFileUrl(req.params.id, true)
    if (!result) return res.status(404).json({ error: 'Not found' })
    const token = await getPBToken()
    const r = await fetch(result.url, { headers: { Authorization: `Bearer ${token}` } })
    res.setHeader('Content-Type', result.mime || 'image/jpeg')
    Readable.from(r.body).pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/files/:id/stream', async (req, res) => {
  try {
    const result = await getPBFileUrl(req.params.id)
    if (!result) return res.status(404).json({ error: 'Not found' })
    const token = await getPBToken()
    const headers = { Authorization: `Bearer ${token}` }
    if (req.headers.range) headers['Range'] = req.headers.range
    const r = await fetch(result.url, { headers })
    res.status(r.status)
    r.headers.forEach((v, k) => res.setHeader(k, v))
    res.setHeader('Content-Type', result.mime || 'application/octet-stream')
    Readable.from(r.body).pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Health check ─────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const r = await fetch(`${PB_URL}/api/health`)
    const data = await r.json()
    res.json({ api: 'ok', pocketbase: data, sessions: sessions.size })
  } catch (err) {
    res.json({ api: 'ok', pocketbase: 'unreachable', error: err.message })
  }
})


// ══════════════════════════════════════════════════════════
// SHARE ROUTES
// ══════════════════════════════════════════════════════════

function generateShareCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// POST /api/shares — create share link
app.post('/api/shares', requireAuth, async (req, res) => {
  try {
    const { type, target_id, label } = req.body
    const code = generateShareCode()
    const r = await pbFetch('/collections/vdrive_shares/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, type, target_id, label })
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json({
      id: data.id,
      code: data.code,
      type: data.type,
      target_id: data.target_id,
      label: data.label,
      url: `https://drive.gtintl.com.ph/s/${data.code}?t=${Date.now()}`
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/shares?target_id=xxx — list shares for a file/folder
app.get('/api/shares', requireAuth, async (req, res) => {
  try {
    const targetId = req.query.target_id
    const filter = encodeURIComponent(`target_id="${targetId}"`)
    const r = await pbFetch(`/collections/vdrive_shares/records?filter=${filter}&perPage=50`)
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    res.json((data.items || []).map(s => ({
      id: s.id,
      code: s.code,
      type: s.type,
      target_id: s.target_id,
      label: s.label,
      url: `https://drive.gtintl.com.ph/s/${s.code}`
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/shares/:id — revoke share link
app.delete('/api/shares/:id', requireAuth, async (req, res) => {
  try {
    await pbFetch(`/collections/vdrive_shares/records/${req.params.id}`, { method: 'DELETE' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Public share endpoint (no auth) ──────────────────────
// GET /api/public/s/:code
app.get('/api/public/s/:code', async (req, res) => {
  try {
    const filter = encodeURIComponent(`code="${req.params.code}"`)
    const shareRes = await pbFetch(`/collections/vdrive_shares/records?filter=${filter}&perPage=1`)
    const shareData = await shareRes.json()
    if (!shareRes.ok || !shareData.items?.length) {
      return res.status(404).json({ error: 'Share link not found' })
    }
    const share = shareData.items[0]

    let files = []

    if (share.type === 'file') {
      // Single file share
      const fileRes = await pbFetch(`/collections/vdrive_files/records/${share.target_id}`)
      if (fileRes.ok) {
        const f = await fileRes.json()
        files = [{
          id: f.id,
          name: f.name,
          size: f.size || 0,
          mime_type: f.mime_type || 'application/octet-stream',
          url: `/api/files/${f.id}/serve`,
          thumb_url: (f.mime_type || '').startsWith('image/') ? `/api/files/${f.id}/thumb` : null
        }]
      }
    } else if (share.type === 'folder') {
      // All files in folder
      const filter2 = encodeURIComponent(`folder_id="${share.target_id}"`)
      const filesRes = await pbFetch(`/collections/vdrive_files/records?filter=${filter2}&sort=name&perPage=500`)
      if (filesRes.ok) {
        const filesData = await filesRes.json()
        files = (filesData.items || []).map(f => ({
          id: f.id,
          name: f.name,
          size: f.size || 0,
          mime_type: f.mime_type || 'application/octet-stream',
          url: `/api/files/${f.id}/serve`,
          thumb_url: (f.mime_type || '').startsWith('image/') ? `/api/files/${f.id}/thumb` : null
        }))
      }
    }

    res.json({
      type: share.type,
      label: share.label,
      files
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// ══════════════════════════════════════════════════════════
// SETTINGS ROUTES
// ══════════════════════════════════════════════════════════

app.get('/api/settings', async (req, res) => {
  try {
    const r = await pbFetch('/collections/vdrive_settings/records?perPage=100')
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    const settings = {}
    for (const item of (data.items || [])) settings[item.key] = item.value
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/settings', requireAuth, async (req, res) => {
  try {
    const updates = req.body
    const r = await pbFetch('/collections/vdrive_settings/records?perPage=100')
    const data = await r.json()
    const existing = {}
    for (const item of (data.items || [])) existing[item.key] = item.id
    for (const [key, value] of Object.entries(updates)) {
      if (existing[key]) {
        await pbFetch(`/collections/vdrive_settings/records/${existing[key]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: String(value) })
        })
      } else {
        await pbFetch('/collections/vdrive_settings/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: String(value) })
        })
      }
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// ══════════════════════════════════════════════════════════
// OPEN GRAPH — serve meta tags for share URLs so social
// apps (WhatsApp, iMessage, FB, Telegram) show previews
// ══════════════════════════════════════════════════════════
app.get('/s/:code', async (req, res) => {
  try {
    // Load share record
    const filter = encodeURIComponent(`code="${req.params.code}"`)
    const shareRes = await pbFetch(`/collections/vdrive_shares/records?filter=${filter}&perPage=1`)
    const shareData = await shareRes.json()
    const share = shareData.items?.[0]

    // Load company settings
    const settingsRes = await pbFetch('/collections/vdrive_settings/records?perPage=100')
    const settingsData = await settingsRes.json()
    const settings = {}
    for (const item of (settingsData.items || [])) settings[item.key] = item.value

    const companyName = settings.company_name || 'GT International INC'
    const companyTagline = settings.company_tagline || 'Quality Construction Equipment'

    let title = companyName
    let description = companyTagline
    let imageUrl = ''

    if (share) {
      const label = share.label || 'Shared files'
      const type = share.type === 'folder' ? 'Folder' : 'File'

      title = `${label} — ${companyName}`
      description = `${companyName} shared a ${type.toLowerCase()} with you: "${label}". Tap to view and download.`

      // Try to get a preview image (first image in the share)
      try {
        if (share.type === 'file') {
          const fileRes = await pbFetch(`/collections/vdrive_files/records/${share.target_id}`)
          if (fileRes.ok) {
            const file = await fileRes.json()
            if ((file.mime_type || '').startsWith('image/')) {
              imageUrl = `${process.env.POCKETBASE_URL}/api/files/${file.collectionId}/${file.id}/${file.file}`
            }
          }
        } else {
          const filter2 = encodeURIComponent(`folder_id="${share.target_id}"`)
          const filesRes = await pbFetch(`/collections/vdrive_files/records?filter=${filter2}&perPage=10`)
          if (filesRes.ok) {
            const filesData = await filesRes.json()
            const firstImage = (filesData.items || []).find(f => (f.mime_type || '').startsWith('image/'))
            if (firstImage) {
              imageUrl = `${process.env.POCKETBASE_URL}/api/files/${firstImage.collectionId}/${firstImage.id}/${firstImage.file}?thumb=600x400`
            }
          }
        }
      } catch {}
    }

    const pageUrl = `https://drive.gtintl.com.ph/s/${req.params.code}`

    // Read the actual index.html
    const fs = await import('fs')
    const path = await import('path')
    let html = fs.readFileSync(path.join('/var/www/vdrive', 'index.html'), 'utf8')

    // Inject OG meta tags into <head>
    const ogTags = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:site_name" content="${companyName}" />
    ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="600" />
    <meta property="og:image:height" content="400" />` : ''}
    <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : ''}
    `

    html = html.replace('<title>VDrive</title>', ogTags)

    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Cache-Control', 'no-cache')
    res.send(html)
  } catch (err) {
    // Fallback — just serve index.html normally
    const fs = await import('fs')
    const html = fs.readFileSync('/var/www/vdrive/index.html', 'utf8')
    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  }
})


// GET /api/search?q=keyword — search across ALL files and folders
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json({ files: [], folders: [] })

    const encoded = encodeURIComponent(`name~"${q}"`)

    const [filesRes, foldersRes] = await Promise.all([
      pbFetch(`/collections/vdrive_files/records?filter=${encoded}&perPage=100&sort=-created`),
      pbFetch(`/collections/vdrive_folders/records?filter=${encoded}&perPage=50&sort=name`)
    ])

    const filesData = await filesRes.json()
    const foldersData = await foldersRes.json()

    res.json({
      files: (filesData.items || []).map(mapFile),
      folders: (foldersData.items || []).map(mapFolder)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// GET /api/search?q=keyword — search across ALL files and folders
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json({ files: [], folders: [] })

    const encoded = encodeURIComponent(`name~"${q}"`)

    const [filesRes, foldersRes] = await Promise.all([
      pbFetch(`/collections/vdrive_files/records?filter=${encoded}&perPage=100&sort=-created`),
      pbFetch(`/collections/vdrive_folders/records?filter=${encoded}&perPage=50&sort=name`)
    ])

    const filesData = await filesRes.json()
    const foldersData = await foldersRes.json()

    res.json({
      files: (filesData.items || []).map(mapFile),
      folders: (foldersData.items || []).map(mapFolder)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// GET /api/folders/counts?ids=id1,id2,id3 — returns file counts for given folder IDs
app.get('/api/folders/counts', requireAuth, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean)
    if (!ids.length) return res.json({})

    // Fetch file count for each folder in parallel
    const counts = await Promise.all(ids.map(async id => {
      const r = await pbFetch(`/collections/vdrive_files/records?filter=${encodeURIComponent(`folder_id="${id}"`)}&perPage=1&skipTotal=false&fields=id`)
      const d = await r.json()
      return { id, count: d.totalItems ?? 0 }
    }))

    const result = {}
    for (const c of counts) result[c.id] = c.count
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// ══════════════════════════════════════════════════════════
// ACTIVITY LOG
// ══════════════════════════════════════════════════════════
app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const page = req.query.page || 1
    const r = await pbFetch(`/collections/vdrive_activity/records?sort=-created&perPage=50&page=${page}`)
    const data = await r.json()
    res.json({
      items: (data.items || []).map(item => ({
        id: item.id,
        user_email: item.user_email,
        action: item.action,
        target: item.target,
        detail: item.detail,
        created: item.created
      })),
      totalItems: data.totalItems,
      totalPages: data.totalPages
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/activity — clear log (admin only)
app.delete('/api/activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pbFetch('/collections/vdrive_activity/records?perPage=500')
    const data = await r.json()
    await Promise.all((data.items || []).map(item =>
      pbFetch(`/collections/vdrive_activity/records/${item.id}`, { method: 'DELETE' })
    ))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// ══════════════════════════════════════════════════════════
// ACTIVITY LOG
// ══════════════════════════════════════════════════════════
app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const page = req.query.page || 1
    const r = await pbFetch(`/collections/vdrive_activity/records?sort=-created&perPage=50&page=${page}`)
    const data = await r.json()
    res.json({
      items: (data.items || []).map(item => ({
        id: item.id,
        user_email: item.user_email,
        action: item.action,
        target: item.target,
        detail: item.detail,
        created: item.created
      })),
      totalItems: data.totalItems,
      totalPages: data.totalPages
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/activity — clear log (admin only)
app.delete('/api/activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pbFetch('/collections/vdrive_activity/records?perPage=500')
    const data = await r.json()
    await Promise.all((data.items || []).map(item =>
      pbFetch(`/collections/vdrive_activity/records/${item.id}`, { method: 'DELETE' })
    ))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// ══════════════════════════════════════════════════════════
// USER MANAGEMENT (admin only)
// ══════════════════════════════════════════════════════════

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pbFetch('/collections/vdrive_users/records?perPage=100&sort=name')
    const d = await r.json()
    res.json((d.items || []).map(u => ({
      id: u.id, email: u.email, name: u.name, role: u.role, active: u.active
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role } = req.body
    const r = await pbFetch('/collections/vdrive_users/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role: role || 'user', active: true })
    })
    const d = await r.json()
    if (!r.ok) return res.status(r.status).json(d)
    res.json({ id: d.id, email: d.email, name: d.name, role: d.role, active: d.active })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pbFetch(`/collections/vdrive_users/records/${req.params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const d = await r.json()
    if (!r.ok) return res.status(r.status).json(d)
    res.json({ id: d.id, email: d.email, name: d.name, role: d.role, active: d.active })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.user.email === req.body.email) return res.status(400).json({ error: 'Cannot delete yourself' })
    await pbFetch(`/collections/vdrive_users/records/${req.params.id}`, { method: 'DELETE' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})


// ══════════════════════════════════════════════════════════
// COPY & MOVE FOLDERS/FILES
// ══════════════════════════════════════════════════════════

// Move folder to new parent
app.patch('/api/folders/:id/move', requireAuth, async (req, res) => {
  try {
    const { parent_id } = req.body
    const r = await pbFetch(`/collections/vdrive_folders/records/${req.params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parent_id || '' })
    })
    const d = await r.json()
    if (!r.ok) return res.status(r.status).json(d)
    await logActivity(req.user.email, 'move_folder', d.name, `to ${parent_id || 'root'}`)
    res.json(mapFolder(d))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Move file to new folder
app.patch('/api/files/:id/move', requireAuth, async (req, res) => {
  try {
    const { folder_id } = req.body
    const r = await pbFetch(`/collections/vdrive_files/records/${req.params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folder_id || '' })
    })
    const d = await r.json()
    if (!r.ok) return res.status(r.status).json(d)
    await logActivity(req.user.email, 'move_file', d.name, `to ${folder_id || 'root'}`)
    res.json(mapFile(d))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Copy file to another folder
app.post('/api/files/:id/copy', requireAuth, async (req, res) => {
  try {
    const { folder_id } = req.body

    // Get original file record
    const origRes = await pbFetch(`/collections/vdrive_files/records/${req.params.id}`)
    const orig = await origRes.json()
    if (!origRes.ok) return res.status(origRes.status).json(orig)

    // Download the file from PocketBase
    const token = await getPBToken()
    const fileUrl = `${PB_URL}/api/files/${orig.collectionId}/${orig.id}/${orig.file}`
    const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } })
    const buffer = Buffer.from(await fileRes.arrayBuffer())

    // Re-upload as new record
    const fd = new FormData()
    fd.append('file', buffer, { filename: orig.file, contentType: orig.mime_type })
    fd.append('name', orig.name)
    fd.append('size', String(orig.size))
    fd.append('mime_type', orig.mime_type || 'application/octet-stream')
    fd.append('folder_id', folder_id || '')

    const newRes = await fetch(`${PB_URL}/api/collections/vdrive_files/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...fd.getHeaders() },
      body: fd
    })
    const newFile = await newRes.json()
    if (!newRes.ok) return res.status(newRes.status).json(newFile)

    await logActivity(req.user.email, 'copy_file', orig.name, `to ${folder_id || 'root'}`)
    res.json(mapFile(newFile))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/folders/all — returns flat list of all folders for picker
app.get('/api/folders/all', requireAuth, async (req, res) => {
  try {
    const r = await pbFetch('/collections/vdrive_folders/records?perPage=500&sort=name')
    const d = await r.json()
    res.json((d.items || []).map(mapFolder))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.listen(PORT, () => {
  console.log(`VDrive API running on port ${PORT}`)
  console.log(`PocketBase: ${PB_URL}`)
  console.log(`VDrive API started`)
})
