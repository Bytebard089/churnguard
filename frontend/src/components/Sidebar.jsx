// src/components/Sidebar.jsx
import React from 'react'
import { Shield, Activity, UploadCloud, GitCompare, LayoutDashboard } from 'lucide-react'

const NAV = [
  { id: 'predict',   label: 'Predict',    icon: Activity },
  { id: 'batch',     label: 'Batch',      icon: UploadCloud },
  { id: 'whatif',    label: 'What-If',    icon: GitCompare },
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
]

export default function Sidebar({ active, onNav, health }) {
  const isOk = health?.status === 'ok'

  return (
    <aside style={{
      width:          '220px',
      minWidth:       '220px',
      background:     'var(--bg-surface)',
      borderRight:    '1px solid var(--border)',
      display:        'flex',
      flexDirection:  'column',
      padding:        '1.5rem 0',
      height:         '100vh',
      position:       'sticky',
      top:            0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 1.5rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'var(--accent)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={18} color="#0a0b0e" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.0625rem',
              letterSpacing: '0.02em',
              color: 'var(--text-primary)',
            }}>
              ChurnGuard
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              RETENTION ANALYTICS
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '0.625rem',
                padding:      '0.625rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                background:   isActive ? 'var(--accent-glow)' : 'transparent',
                color:        isActive ? 'var(--accent)' : 'var(--text-secondary)',
                border:       isActive ? '1px solid rgba(245,158,11,0.25)' : '1px solid transparent',
                textAlign:    'left',
                fontSize:     '0.875rem',
                fontFamily:   'var(--font-body)',
                fontWeight:   isActive ? 500 : 400,
                cursor:       'pointer',
                transition:   'all 150ms ease',
                width:        '100%',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Model status */}
      <div style={{
        margin:       '0 0.75rem',
        padding:      '0.875rem',
        background:   'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        border:       '1px solid var(--border)',
      }}>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          Model Status
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '8px', height: '8px',
            borderRadius: '50%',
            background: isOk ? 'var(--success)' : 'var(--warning)',
            boxShadow: isOk ? '0 0 6px var(--success)' : '0 0 6px var(--warning)',
            animation: 'pulseSlow 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {health ? (isOk ? `${health.models_loaded} folds loaded` : 'Degraded') : 'Connecting…'}
          </span>
        </div>
        {health?.oof_auc && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            OOF AUC: <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
              {Number(health.oof_auc).toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
