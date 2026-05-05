import 'dotenv/config'
import { v2 as webdav } from 'webdav-server'
import fetch from 'node-fetch'
import { Readable } from 'stream'

const PB_URL = process.env.POCKETBASE_URL || 'http://localhost:8091'
const PB_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_PASS = process.env.PB_ADMIN_PASSWORD
const PORT = 8095

let pbToken = null, tokenExpiry = 0
async function getToken() {
  if (pbToken && Date.now() < tokenExpiry) return pbToken
  const r = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS })
  })
  const d = await r.json()
  pbToken = d.token
  tokenExpiry = Date.now() + 50 * 60 * 1000
  return pbToken
}

async function pbGet(path) {
  const token = await getToken()
  const r = await fetch(`${PB_URL}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return r.json()
}

// ── Pre-build FULL cache before serving ──────────────────
const cache = {}     // path -> { type, record }
const children = {}  // path -> [names]

async function buildFullCache() {
  console.log('Scanning all folders from PocketBase...')
  cache['/'] = { type: 'dir' }
  children['/'] = []

  // Load ALL folders at once (no recursion needed)
  const allFolders = await pbGet('/collections/vdrive_folders/records?perPage=500&sort=name')
  const allFiles = await pbGet('/collections/vdrive_files/records?perPage=500&sort=name')

  // Build a map of id -> folder
  const folderMap = {}
  for (const f of (allFolders.items || [])) folderMap[f.id] = f

  // Build path for each folder
  const folderPaths = {}
  function getFolderPath(folder) {
    if (folderPaths[folder.id]) return folderPaths[folder.id]
    if (!folder.parent_id) {
      folderPaths[folder.id] = '/' + folder.name
    } else {
      const parent = folderMap[folder.parent_id]
      if (!parent) {
        folderPaths[folder.id] = '/' + folder.name
      } else {
        folderPaths[folder.id] = getFolderPath(parent) + '/' + folder.name
      }
    }
    return folderPaths[folder.id]
  }

  for (const folder of (allFolders.items || [])) {
    const p = getFolderPath(folder)
    cache[p] = { type: 'dir', record: folder }
    children[p] = []

    // Add to parent's children
    const parentPath = folder.parent_id && folderMap[folder.parent_id]
      ? getFolderPath(folderMap[folder.parent_id])
      : '/'
    if (!children[parentPath]) children[parentPath] = []
    if (!children[parentPath].includes(folder.name)) {
      children[parentPath].push(folder.name)
    }
  }

  // Now place all files
  for (const file of (allFiles.items || [])) {
    const parentFolder = file.folder_id ? folderMap[file.folder_id] : null
    const parentPath = parentFolder ? getFolderPath(parentFolder) : '/'
    const p = parentPath === '/' ? '/' + file.name : parentPath + '/' + file.name
    cache[p] = { type: 'file', record: file }
    if (!children[parentPath]) children[parentPath] = []
    if (!children[parentPath].includes(file.name)) {
      children[parentPath].push(file.name)
    }
  }

  const folderCount = Object.values(cache).filter(v => v.type === 'dir').length
  const fileCount = Object.values(cache).filter(v => v.type === 'file').length
  console.log(`Cache built: ${folderCount} folders, ${fileCount} files`)
}

// ── FileSystem ───────────────────────────────────────────
class PBFileSystem extends webdav.FileSystem {
  constructor() { super() }

  _type(path, ctx, callback) {
    const p = path.toString()
    if (p === '/' || p === '') return callback(null, webdav.ResourceType.Directory)
    const entry = cache[p]
    if (!entry) return callback(webdav.Errors.ResourceNotFound)
    callback(null, entry.type === 'dir' ? webdav.ResourceType.Directory : webdav.ResourceType.File)
  }

  _readDir(path, ctx, callback) {
    // Use same approach as VirtualFileSystem - match by path prefix and length
    const base = path.toString(true) // with trailing slash e.g. "/GT/GT TRUCKS/"
    const parentLen = path.paths.length
    const result = []
    for (const p in cache) {
      const cp = new webdav.Path(p)
      if (cp.paths.length === parentLen + 1) {
        // Check if this path starts with base
        const cpBase = cp.paths.slice(0, parentLen).join('/')
        const pathBase = path.paths.join('/')
        if (cpBase === pathBase) {
          result.push(cp)
        }
      }
    }
    // Also add root-level entries if path is root
    if (path.paths.length === 0) {
      for (const p in cache) {
        const cp = new webdav.Path(p)
        if (cp.paths.length === 1) result.push(cp)
      }
    }
    callback(null, result)
  }

  _size(path, ctx, callback) {
    const entry = cache[path.toString()]
    callback(null, entry?.record?.size || 0)
  }

  _lastModifiedDate(path, ctx, callback) {
    const entry = cache[path.toString()]
    const d = entry?.record?.updated ? new Date(entry.record.updated) : new Date()
    callback(null, d)
  }

  _creationDate(path, ctx, callback) {
    const entry = cache[path.toString()]
    const d = entry?.record?.created ? new Date(entry.record.created) : new Date()
    callback(null, d)
  }

  _openReadStream(path, ctx, callback) {
    const entry = cache[path.toString()]
    if (!entry || entry.type !== 'file') return callback(webdav.Errors.ResourceNotFound)
    const record = entry.record
    getToken().then(token => {
      const fileUrl = `${PB_URL}/api/files/${record.collectionId}/${record.id}/${record.file}`
      fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } }).then(r => {
        callback(null, Readable.from(r.body))
      }).catch(() => callback(webdav.Errors.ResourceNotFound))
    }).catch(() => callback(webdav.Errors.ResourceNotFound))
  }

  _lockManager(path, ctx, callback) {
    callback(null, new webdav.LocalLockManager())
  }

  _propertyManager(path, ctx, callback) {
    callback(null, new webdav.LocalPropertyManager())
  }

  _fastExistCheck(ctx, path, callback) {
    const p = path.toString()
    callback(p === '/' || p === '' || !!cache[p])
  }
}

// ── Start ────────────────────────────────────────────────
const userManager = new webdav.SimpleUserManager()
userManager.addUser('arslan', 'Taylors@12', false)
userManager.addUser('gtsubic', 'Subic@123', true)

const server = new webdav.WebDAVServer({
  port: PORT,
  httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, 'VDrive'),
  requireAuthentication: true,
})

// Build full cache FIRST, then start serving
buildFullCache().then(() => {
  server.setFileSystem('/', new PBFileSystem(), () => {
    server.start(() => {
      console.log(`VDrive WebDAV running on port ${PORT}`)
      console.log(`Connect: https://drive.gtintl.com.ph/dav/`)
    })
  })
}).catch(err => {
  console.error('Failed to build cache:', err)
  process.exit(1)
})
