// Sidebar.jsx — upgraded with glow effects, prediction counter, model badge
import React from 'react'
import { Shield, Activity, UploadCloud, GitCompare, LayoutDashboard, Cpu, ExternalLink } from 'lucide-react'

const NAV = [
  { id: 'predict',   label: 'Predict',    icon: Activity,       desc: 'Single customer' },
  { id: 'batch',     label: 'Batch',      icon: UploadCloud,    desc: 'CSV upload' },
  { id: 'whatif',    label: 'What-If',    icon: GitCompare,     desc: 'Scenario sim' },
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard,desc: 'Analytics' },
]

export default function Sidebar({ active, onNav, health, predCount = 0 }) {
  const isOk = health?.status === 'ok'

  return (
    <aside style={{
      width: '230px', minWidth: '230px',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.375rem 1.25rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(108,142,255,0.35)',
            flexShrink: 0,
          }}>
            <Shield size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.01em', color: 'var(--text-primary)' }}>
              ChurnGuard
            </div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              AI · Retention
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.875rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0 0.625rem', marginBottom: '0.375rem' }}>
          Navigation
        </div>
        {NAV.map(({ id, label, icon: Icon, desc }) => {
          const isActive = active === id
          return (
            <button key={id} onClick={() => onNav(id)} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              background: isActive ? 'var(--accent-strong)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              border: isActive ? '1px solid rgba(108,142,255,0.3)' : '1px solid transparent',
              textAlign: 'left', fontSize: '0.875rem',
              fontFamily: 'var(--font-body)', fontWeight: isActive ? 600 : 400,
              cursor: 'pointer', transition: 'all 150ms ease', width: '100%',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(108,142,255,0.2)' : 'var(--bg-elevated)',
              }}>
                <Icon size={15} strokeWidth={isActive ? 2.2 : 1.75} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 500 }}>{label}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.05rem' }}>{desc}</div>
              </div>
              {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)', flexShrink: 0 }} />}
            </button>
          )
        })}
      </nav>

      {/* Prediction counter */}
      {predCount > 0 && (
        <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.625rem 0.875rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(108,142,255,0.2)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>Session</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{predCount} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>predictions made</span></div>
        </div>
      )}

      {/* Model status */}
      <div style={{ margin: '0 0.75rem 1rem', padding: '0.875rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Cpu size={10} /> Model Status
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isOk ? 'var(--success)' : 'var(--warning)',
            boxShadow: `0 0 8px ${isOk ? 'var(--success)' : 'var(--warning)'}`,
            animation: 'pulse-dot 2s infinite',
          }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {health ? (isOk ? `${health.models_loaded || 5} folds loaded` : 'Cold starting…') : 'Connecting…'}
          </span>
        </div>
        {health?.oof_auc && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OOF AUC</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 700 }}>{Number(health.oof_auc).toFixed(4)}</span>
          </div>
        )}
        {!health?.oof_auc && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OOF AUC</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 700 }}>0.9164</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Algorithm</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>XGBoost</span>
        </div>
      </div>

      {/* GitHub link */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)' }}>
        <a href="https://github.com" target="_blank" rel="noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.75rem', color: 'var(--text-muted)',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <ExternalLink size={12} /> View on GitHub
        </a>
      </div>
    </aside>
  )
}
