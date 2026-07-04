import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

let authToken: string | null = localStorage.getItem('vdrive_token')

api.interceptors.request.use(config => {
  if (authToken) config.headers['X-Auth-Token'] = authToken
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      authToken = null
      localStorage.removeItem('vdrive_token')
      localStorage.removeItem('vdrive_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export function setAuthToken(token: string, user: UserSession) {
  authToken = token
  localStorage.setItem('vdrive_token', token)
  localStorage.setItem('vdrive_user', JSON.stringify(user))
}

export function clearAuth() {
  authToken = null
  localStorage.removeItem('vdrive_token')
  localStorage.removeItem('vdrive_user')
}

export function getStoredUser(): UserSession | null {
  const s = localStorage.getItem('vdrive_user')
  return s ? JSON.parse(s) : null
}

export function isAuthenticated(): boolean {
  return !!authToken
}

export interface UserSession {
  email: string
  name: string
  role: string
}

export interface DriveFile {
  id: string
  name: string
  size: number
  mime_type: string
  folder_id: string | null
  created: string
  updated: string
  url: string
  thumb_url?: string
}

export interface Folder {
  id: string
  name: string
  parent_id: string | null
  created: string
  updated: string
}

export const login = (email: string, password: string) =>
  api.post<{ token: string; user: UserSession }>('/auth/login', { email, password }).then(r => r.data)

export const getFolders = (parentId?: string | null) =>
  api.get<Folder[]>('/folders', { params: { parent_id: parentId ?? '' } }).then(r => r.data)

export const createFolder = (name: string, parentId?: string | null) =>
  api.post<Folder>('/folders', { name, parent_id: parentId ?? null }).then(r => r.data)

export const renameFolder = (id: string, name: string) =>
  api.patch<Folder>('/folders/' + id, { name }).then(r => r.data)

export const deleteFolder = (id: string) =>
  api.delete('/folders/' + id)

export const getFiles = (folderId?: string | null) =>
  api.get<DriveFile[]>('/files', { params: { folder_id: folderId ?? '' } }).then(r => r.data)

export const uploadFile = (
  file: File,
  folderId: string | null,
  onProgress?: (pct: number) => void
) => {
  const fd = new FormData()
  fd.append('file', file)
  if (folderId) fd.append('folder_id', folderId)
  return api.post<DriveFile>('/files/upload', fd, {
    onUploadProgress: e => onProgress?.(Math.round((e.loaded * 100) / (e.total ?? 1)))
  }).then(r => r.data)
}

export const renameFile = (id: string, name: string) =>
  api.patch<DriveFile>('/files/' + id, { name }).then(r => r.data)

export const moveFile = (id: string, folderId: string | null) =>
  api.patch<DriveFile>('/files/' + id, { folder_id: folderId }).then(r => r.data)

export const deleteFile = (id: string) =>
  api.delete('/files/' + id)

export const getFileUrl = (id: string) => '/api/files/' + id + '/serve'
export const getThumbUrl = (id: string) => '/api/files/' + id + '/thumb'
export const getFileStreamUrl = (id: string) => '/api/files/' + id + '/stream'

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼'
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return '🗜'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  return '📁'
}

export function isImage(mime: string) { return mime.startsWith('image/') }
export function isVideo(mime: string) { return mime.startsWith('video/') }
export function isAudio(mime: string) { return mime.startsWith('audio/') }
export function isPdf(mime: string) { return mime === 'application/pdf' }

// ── Shares ───────────────────────────────────────────────
export interface ShareLink {
  id: string
  code: string
  type: 'file' | 'folder'
  target_id: string
  label: string
  url: string
}

export const createShare = (type: 'file' | 'folder', targetId: string, label: string) =>
  api.post<ShareLink>('/shares', { type, target_id: targetId, label }).then(r => r.data)

export const deleteShare = (id: string) =>
  api.delete('/shares/' + id)

export const getShares = (targetId: string) =>
  api.get<ShareLink[]>('/shares', { params: { target_id: targetId } }).then(r => r.data)

// ── Global search ────────────────────────────────────────
export const searchAll = (q: string) =>
  api.get<{ files: DriveFile[]; folders: Folder[] }>('/search', { params: { q } }).then(r => r.data)

// ── Folder file counts ───────────────────────────────────
export const getFolderCounts = (folderIds: string[]) =>
  folderIds.length === 0 ? Promise.resolve({} as Record<string, number>) :
  api.get<Record<string, number>>('/folders/counts', { params: { ids: folderIds.join(',') } }).then(r => r.data)

// ── Activity log ─────────────────────────────────────────
export interface ActivityItem {
  id: string
  user_email: string
  action: string
  target: string
  detail: string
  created: string
}

export const getActivity = (page = 1) =>
  api.get<{ items: ActivityItem[]; totalItems: number; totalPages: number }>('/activity', { params: { page } }).then(r => r.data)

export const clearActivity = () =>
  api.delete('/activity')

export const isAdmin = () => {
  const user = getStoredUser()
  return user?.role === 'admin'
}

// ── User management ──────────────────────────────────────
export interface VDriveUser {
  id: string
  email: string
  name: string
  role: string
  active: boolean
}

export const getUsers = () =>
  api.get<VDriveUser[]>('/users').then(r => r.data)

export const createUser = (data: Partial<VDriveUser> & { password: string }) =>
  api.post<VDriveUser>('/users', data).then(r => r.data)

export const updateUser = (id: string, data: Partial<VDriveUser> & { password?: string }) =>
  api.patch<VDriveUser>(`/users/${id}`, data).then(r => r.data)

export const deleteUser = (id: string) =>
  api.delete(`/users/${id}`)

// ── Bulk delete ──────────────────────────────────────────
export const deleteFiles = async (ids: string[]) => {
  await Promise.all(ids.map(id => api.delete(`/files/${id}`)))
}
