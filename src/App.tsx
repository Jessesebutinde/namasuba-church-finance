import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import { Layout, type TabId } from './components/Layout'
import { Dashboard } from './components/Dashboard'
import { SundayForm } from './components/SundayForm'
import { ComparisonView } from './components/ComparisonView'
import { SettingsPanel } from './components/SettingsPanel'
import { ReportGenerator } from './components/ReportGenerator'
import { AuditLog } from './components/AuditLog'

function Shell() {
  const [tab, setTab] = useState<TabId>('dashboard')
  return (
    <Layout tab={tab} onTab={setTab}>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'entry' && <SundayForm />}
      {tab === 'comparison' && <ComparisonView />}
      {tab === 'reports' && <ReportGenerator />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'audit' && <AuditLog />}
    </Layout>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
