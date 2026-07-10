import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { Dashboard } from '@renderer/pages/Dashboard'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { TaskPage } from '@renderer/pages/TaskPage'
import { useSettings } from '@renderer/state/settings'

export default function App(): React.JSX.Element {
  const load = useSettings((s) => s.load)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void load()
    void window.vectormind?.getAppInfo().then((info) => setVersion(info.version))
  }, [load])

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">VECTORMIND</div>
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <div className="spacer" />
        {version && <div className="version">v{version}</div>}
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/task/:taskId" element={<TaskPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
