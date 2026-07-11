import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { Dashboard } from '@renderer/pages/Dashboard'
import { ExamPage } from '@renderer/pages/ExamPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { StatsPage } from '@renderer/pages/StatsPage'
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
        <NavLink to="/exam">Exam simulation</NavLink>
        <NavLink to="/stats">Statistics</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <div className="spacer" />
        {version && <div className="version">v{version}</div>}
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/task/:taskId" element={<TaskPage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
