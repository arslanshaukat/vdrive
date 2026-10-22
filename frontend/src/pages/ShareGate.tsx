import { useEffect, useState, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { SharePage } from './SharePage'

export function ShareGate() {
  const { code } = useParams<{ code: string }>()
  const tokenKey = `share_token_${code}`
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [company, setCompany] = useState({ name: 'GT International INC', logo: 'GTI' })

  useEffect(() => {
    fetch('/api/settings').then(r => r.json())
      .then(s => setCompany({ name: s.company_name || 'GT International INC', logo: s.company_logo || 'GTI' }))
      .catch(() => {})

    fetch(`/api/public/s/${code}/status`, { headers: { 'X-Share-Token': sessionStorage.getItem(tokenKey) || '' } })
      .then(r => r.json())
      .then(s => setState(s.protected && !s.unlocked ? 'locked' : 'open'))
      .catch(() => setState('open'))
  }, [code])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const r = await fetch(`/api/public/s/${code}/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        sessionStorage.setItem(tokenKey, d.token || '')
        setState('open')
      } else {
        setError(d.error || 'Incorrect password')
      }
    } catch { setError('Connection problem. Please try again.') }
    finally { setBusy(false) }
  }

  if (state === 'open') return <SharePage />

  if (state === 'checking') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-lg mx-auto mb-4 shadow-lg shadow-accent/30">
          {company.logo}
        </div>
        <p className="text-white font-semibold">{company.name}</p>
        <p className="text-white/40 text-sm mt-1 mb-6">🔒 This link is password protected</p>
        <form onSubmit={submit} className="bg-gray-900 border border-white/10 rounded-2xl p-5 space-y-3">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Enter password" autoFocus autoComplete="off"
            className="w-full px-3 py-2.5 bg-gray-950 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/60" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={busy || !password}
            className="w-full py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
