import axios from 'axios'

// folder id -> id of the first photo inside it
export async function getFolderCovers(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const token = localStorage.getItem('vdrive_token') || ''
  const r = await axios.get<Record<string, string>>('/api/folders/covers', {
    params: { ids: ids.join(',') },
    headers: { 'X-Auth-Token': token },
  })
  return r.data
}
