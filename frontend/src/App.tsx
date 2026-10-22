import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DrivePage } from './pages/DrivePage'
import { LoginPage } from './pages/LoginPage'
import { ShareGate } from './pages/ShareGate'
import { isAuthenticated } from './lib/api'
import { SettingsPage } from './pages/SettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/s/:code" element={<ShareGate />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/drive" replace />} />
        <Route path="/drive" element={<DrivePage />} />
        <Route path="/drive/:folderId" element={<DrivePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
