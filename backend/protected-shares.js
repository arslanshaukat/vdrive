import crypto from 'crypto'
import fs from 'fs'

const SECRET = crypto.randomBytes(32)
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000
const MAX_ATTEMPTS = 5
const WINDOW_MS = 10 * 60 * 1000
const SITE = 'https://drive.gtintl.com.ph'
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const attempts = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k)
}, WINDOW_MS).unref()

const clean = s => String(s ?? '').replace(/[^a-zA-Z0-9]/g, '')
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')

function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(pw, salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(String(pw).slice(0, 200), Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

const sign = (code, hash, exp) =>
  crypto.createHmac('sha256', SECRET).update(`${code}.${hash.slice(0, 32)}.${exp}`).digest('hex')

function issueToken(share) {
  const exp = Date.now() + TOKEN_TTL_MS
  return `${exp}.${sign(share.code, share.password_hash, exp)}`
}

function tokenOk(share, token) {
  const [exp, sig] = String(token || '').split('.')
  if (!exp || !sig || !(Number(exp) > Date.now())) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(share.code, share.password_hash, exp))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const shareView = s => ({
  id: s.id, code: s.code, type: s.type, target_id: s.target_id, label: s.label,
  protected: !!s.password_hash,
  url: `${SITE}/s/${s.code}?t=${Date.parse(s.created) || 0}`,
})

async function findShare(pbFetch, code) {
  const filter = encodeURIComponent(`code="${clean(code)}"`)
  const r = await pbFetch(`/collections/vdrive_shares/records?filter=${filter}&perPage=1`)
  const d = await r.json()
  return d.items?.[0] || null
}

async function loadSettings(pbFetch) {
  try {
    const r = await pbFetch('/collections/vdrive_settings/records?perPage=100')
    const d = await r.json()
    const s = {}
    for (const i of (d.items || [])) s[i.key] = i.value
    return s
  } catch { return {} }
}

export function registerProtectedShares(app, { requireAuth, pbFetch, logActivity }) {
  const log = typeof logActivity === 'function' ? logActivity : null
  const json = { 'Content-Type': 'application/json' }

  app.post('/api/shares', requireAuth, async (req, res) => {
    try {
      const { type, target_id, label } = req.body || {}
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!['file', 'folder'].includes(type) || !clean(target_id)) return res.status(400).json({ error: 'Invalid share' })
      if (password && password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' })

      const r = await pbFetch('/collections/vdrive_shares/records', {
        method: 'POST', headers: json,
        body: JSON.stringify({
          code: newCode(), type, target_id: clean(target_id),
          label: String(label || '').slice(0, 200),
          password_hash: password ? hashPassword(password) : '',
        }),
      })
      const d = await r.json()
      if (!r.ok) return res.status(r.status).json(d)

      if (password && !d.password_hash) {
        await pbFetch(`/collections/vdrive_shares/records/${d.id}`, { method: 'DELETE' })
        return res.status(500).json({ error: 'password_hash field missing in PocketBase' })
      }
      if (log) await log(req.user.email, 'create_share', d.label, password ? 'password protected' : 'public')
      res.json(shareView(d))
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.get('/api/shares', requireAuth, async (req, res) => {
    try {
      const filter = encodeURIComponent(`target_id="${clean(req.query.target_id)}"`)
      const r = await pbFetch(`/collections/vdrive_shares/records?filter=${filter}&perPage=50`)
      const d = await r.json()
      if (!r.ok) return res.status(r.status).json(d)
      res.json((d.items || []).map(shareView))
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.patch('/api/shares/:id/password', requireAuth, async (req, res) => {
    try {
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      if (password && password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' })
      const r = await pbFetch(`/collections/vdrive_shares/records/${clean(req.params.id)}`, {
        method: 'PATCH', headers: json,
        body: JSON.stringify({ password_hash: password ? hashPassword(password) : '' }),
      })
      const d = await r.json()
      if (!r.ok) return res.status(r.status).json(d)
      if (password && !d.password_hash) return res.status(500).json({ error: 'password_hash field missing in PocketBase' })
      if (log) await log(req.user.email, password ? 'set_share_password' : 'remove_share_password', d.label)
      res.json(shareView(d))
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.get('/api/public/s/:code/status', async (req, res) => {
    try {
      const share = await findShare(pbFetch, req.params.code)
      if (!share) return res.status(404).json({ error: 'Link not found' })
      res.json({
        protected: !!share.password_hash,
        unlocked: !share.password_hash || tokenOk(share, req.headers['x-share-token']),
      })
    } catch { res.status(500).json({ error: 'Server error' }) }
  })

  app.post('/api/public/s/:code/unlock', async (req, res) => {
    try {
      const share = await findShare(pbFetch, req.params.code)
      if (!share) return res.status(404).json({ error: 'Link not found' })
      if (!share.password_hash) return res.json({ token: '' })

      const key = `${req.headers['x-real-ip'] || req.ip}:${share.code}`
      const now = Date.now()
      const a = attempts.get(key)
      const active = a && now - a.first < WINDOW_MS ? a : null
      if (active && active.count >= MAX_ATTEMPTS)
        return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })

      const pw = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!verifyPassword(pw, share.password_hash)) {
        const cur = active || { count: 0, first: now }
        cur.count++
        attempts.set(key, cur)
        return res.status(401).json({ error: 'Incorrect password' })
      }
      attempts.delete(key)
      res.json({ token: issueToken(share) })
    } catch { res.status(500).json({ error: 'Server error' }) }
  })

  app.get('/api/public/s/:code', async (req, res, next) => {
    try {
      const share = await findShare(pbFetch, req.params.code)
      if (!share || !share.password_hash) return next()
      if (tokenOk(share, req.headers['x-share-token'])) return next()
      return res.status(401).json({ locked: true, error: 'Password required' })
    } catch { return res.status(500).json({ error: 'Server error' }) }
  })

  app.get('/s/:code', async (req, res) => {
    let html
    try { html = fs.readFileSync('/var/www/vdrive/index.html', 'utf8') }
    catch { return res.status(500).send('App not built') }

    try {
      const share = await findShare(pbFetch, req.params.code)
      const settings = await loadSettings(pbFetch)
      const company = settings.company_name || 'GT International INC'
      let title = company
      let description = settings.company_tagline || ''
      let image = ''

      if (share && share.password_hash) {
        title = `Protected link — ${company}`
        description = `${company} shared a password-protected link with you.`
      } else if (share) {
        const noun = share.type === 'folder' ? 'folder' : 'file'
        title = `${share.label || 'Shared files'} — ${company}`
        description = `${company} shared a ${noun} with you: "${share.label}". Tap to view and download.`
        try {
          const tid = clean(share.target_id)
          let imgId = null
          if (share.type === 'file') {
            const fr = await pbFetch(`/collections/vdrive_files/records/${tid}`)
            if (fr.ok) { const f = await fr.json(); if ((f.mime_type || '').startsWith('image/')) imgId = f.id }
          } else {
            const filter = encodeURIComponent(`folder_id="${tid}" && mime_type~"image/"`)
            const fr = await pbFetch(`/collections/vdrive_files/records?filter=${filter}&perPage=1`)
            const fd = await fr.json()
            imgId = fd.items?.[0]?.id || null
          }
          if (imgId) image = `${SITE}/api/files/${imgId}/thumb`
        } catch { /* preview image is optional */ }
      }

      const url = `${SITE}/s/${clean(req.params.code)}`
      const tags = `<title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:site_name" content="${esc(company)}" />
    ${image ? `<meta property="og:image" content="${esc(image)}" />` : ''}
    <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    ${image ? `<meta name="twitter:image" content="${esc(image)}" />` : ''}`

      html = html.replace('<title>VDrive</title>', () => tags)
    } catch { /* fall through with the plain index.html */ }

    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Cache-Control', 'no-cache')
    res.send(html)
  })
}
