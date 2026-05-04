// App.jsx — passes predCount to Sidebar, improved TopBar
import React, { useState, useEffect, useCallback } from 'react'
import Sidebar       from './components/Sidebar'
import PredictPage   from './pages/PredictPage'
import BatchPage     from './pages/BatchPage'
import WhatIfPage    from './pages/WhatIfPage'
import DashboardPage from './pages/DashboardPage'
import { getHealth, predict } from './api/client'

const PAGE_TITLES = {
  predict:   'Single Prediction',
  batch:     'Batch Predictions',
  whatif:    'What-If Simulator',
  dashboard: 'Dashboard',
}
const PAGE_SUBS = {
  predict:   'Run the 5-fold XGBoost ensemble on one customer',
  batch:     'Score hundreds of customers from a CSV upload',
  whatif:    'Compare scenarios — see how interventions affect churn',
  dashboard: 'Model health, feature importance & business insights',
}

function TopBar({ title, page, predCount }) {
  return (
    <div style={{
      padding: '0 2rem', height: '58px',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--bg-surface)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
          {title}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.05rem' }}>
          {PAGE_SUBS[page]}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {predCount > 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid rgba(108,142,255,0.2)', padding: '0.25rem 0.625rem', borderRadius: '99px' }}>
            {predCount} pred{predCount !== 1 ? 's' : ''} this session
          </div>
        )}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          XGBoost · 5-Fold · v2.0
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [page,    setPage]    = useState('predict')
  const [health,  setHealth]  = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    async function check() {
      try { setHealth(await getHealth()) } catch { setHealth({ status: 'error' }) }
    }
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [])

  const trackedPredict = useCallback(async (data) => {
    const result = await predict(data)
    if (result) setHistory(prev => [...prev, { ...result, input: data, ts: Date.now() }])
    return result
  }, [])

  function renderPage() {
    switch (page) {
      case 'predict':   return <PredictPage predictFn={trackedPredict} />
      case 'batch':     return <BatchPage />
      case 'whatif':    return <WhatIfPage />
      case 'dashboard': return <DashboardPage predictionHistory={history} />
      default:          return null
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active={page} onNav={setPage} health={health} predCount={history.length} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <TopBar title={PAGE_TITLES[page]} page={page} predCount={history.length} />
        <main style={{ flex: 1, padding: '1.75rem 2rem', overflowY: 'auto' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
