import axios from 'axios'

// Asks the server for a one-time ticket, then lets the browser download the ZIP natively
export async function startZipDownload(ids: string[], name?: string) {
  const token = localStorage.getItem('vdrive_token') || ''
  const r = await axios.post<{ url: string }>('/api/zip/ticket', { ids, name }, {
    headers: { 'X-Auth-Token': token },
  })
  window.location.href = r.data.url
}
