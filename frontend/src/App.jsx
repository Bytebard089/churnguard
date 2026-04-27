// src/App.jsx
// Root component. Manages routing between pages, health polling,
// and prediction history (passed down to Dashboard).

import React, { useState, useEffect, useCallback } from 'react'
import Sidebar       from './components/Sidebar'
import PredictPage   from './pages/PredictPage'
import BatchPage     from './pages/BatchPage'
import WhatIfPage    from './pages/WhatIfPage'
import DashboardPage from './pages/DashboardPage'
import { getHealth } from './api/client'

// Intercept the predict API to track history.
// We wrap PredictPage so it reports results up here.
import { predict } from './api/client'

const PAGE_TITLES = {
  predict:   'Single Prediction',
  batch:     'Batch Predictions',
  whatif:    'What-If Simulator',
  dashboard: 'Dashboard',
}

function TopBar({ title, page }) {
  return (
    <div style={{
      padding:        '0 2rem',
      height:         '60px',
      borderBottom:   '1px solid var(--border)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      background:     'var(--bg-surface)',
      position:       'sticky',
      top:            0,
      zIndex:         10,
    }}>
      <div>
        <h1 style={{
          fontFamily:    'var(--font-display)',
          fontSize:      '1rem',
          fontWeight:    700,
          letterSpacing: '0.02em',
          color:         'var(--text-primary)',
        }}>
          {title}
        </h1>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   '0.75rem',
        color:      'var(--text-muted)',
        letterSpacing: '0.04em',
      }}>
        ChurnGuard&nbsp;·&nbsp;v1.0
      </div>
    </div>
  )
}

export default function App() {
  const [page,    setPage]    = useState('predict')
  const [health,  setHealth]  = useState(null)
  const [history, setHistory] = useState([])   // prediction history for dashboard

  // Poll health every 30s
  useEffect(() => {
    async function check() {
      try {
        const h = await getHealth()
        setHealth(h)
      } catch {
        setHealth({ status: 'error' })
      }
    }
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [])

  // Wrap predict to capture history
  const trackedPredict = useCallback(async (data) => {
    const result = await predict(data)
    if (result) {
      setHistory(prev => [...prev, { ...result, input: data }])
    }
    return result
  }, [])

  function renderPage() {
    switch (page) {
      case 'predict':
        return <PredictPage predictFn={trackedPredict} />
      case 'batch':
        return <BatchPage />
      case 'whatif':
        return <WhatIfPage />
      case 'dashboard':
        return <DashboardPage predictionHistory={history} />
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active={page} onNav={setPage} health={health} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <TopBar title={PAGE_TITLES[page]} page={page} />

        <main style={{ flex: 1, padding: '1.75rem 2rem', overflowY: 'auto' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
