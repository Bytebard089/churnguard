// src/pages/DashboardPage.jsx  — STEP 4: Advanced Feature
// Shows model health, OOF metrics, and a live prediction history tracker.
// Prediction history is stored in React state (session-only).

import React, { useState, useEffect } from 'react'
import { Activity, Cpu, Clock, BarChart2, RefreshCw } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Card, SectionTitle, Button, Spinner, StatCell } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { getHealth } from '../api/client'
import { fmtPct } from '../utils/helpers'

const RISK_COLORS = {
  High:   '#ef4444',
  Medium: '#f97316',
  Low:    '#22c55e',
}

export default function DashboardPage({ predictionHistory = [] }) {
  const healthApi = useApi(getHealth)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  function refresh() {
    healthApi.run()
    setLastRefresh(new Date())
  }

  useEffect(() => {
    healthApi.run()
    const timer = setInterval(refresh, 30_000)  // auto-refresh every 30s
    return () => clearInterval(timer)
  }, [])

  const health = healthApi.data

  // Build risk distribution from prediction history
  const riskCounts = predictionHistory.reduce((acc, p) => {
    acc[p.risk_tier] = (acc[p.risk_tier] || 0) + 1
    return acc
  }, {})
  const pieData = Object.entries(riskCounts).map(([name, value]) => ({ name, value }))

  // Build probability timeline from history
  const timelineData = predictionHistory.slice(-20).map((p, i) => ({
    idx:  i + 1,
    prob: +(p.churn_probability * 100).toFixed(1),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Model health and prediction session analytics
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} loading={healthApi.loading}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Model health cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.875rem' }}>
        <StatCell
          label="Model Status"
          value={health ? (health.status === 'ok' ? '✓ Online' : '⚠ Degraded') : '…'}
          accent={health?.status === 'ok'}
        />
        <StatCell
          label="Folds Loaded"
          value={health?.models_loaded ?? '—'}
          sub="ensemble size"
        />
        <StatCell
          label="OOF AUC"
          value={health?.oof_auc ? Number(health.oof_auc).toFixed(4) : '—'}
          accent
          sub="out-of-fold"
        />
        <StatCell
          label="Features"
          value={health?.n_features ?? '—'}
          sub="engineered"
        />
      </div>

      {/* Session stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem' }}>
        <StatCell
          label="Predictions (Session)"
          value={predictionHistory.length}
        />
        <StatCell
          label="Avg Churn Prob"
          value={predictionHistory.length > 0
            ? fmtPct(predictionHistory.reduce((s, p) => s + p.churn_probability, 0) / predictionHistory.length)
            : '—'
          }
        />
        <StatCell
          label="High Risk Count"
          value={riskCounts['High'] ?? 0}
          sub="this session"
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>

        {/* Probability timeline */}
        <Card>
          <SectionTitle sub="Last 20 predictions in this session">
            Churn Probability Timeline
          </SectionTitle>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timelineData}>
                <XAxis dataKey="idx" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={v => [`${v}%`, 'Churn Prob']}
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}
                />
                <Line
                  type="monotone"
                  dataKey="prob"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--accent)' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No predictions yet — run some predictions to see the timeline
            </div>
          )}
        </Card>

        {/* Risk distribution pie */}
        <Card>
          <SectionTitle sub="Distribution by risk tier">
            Risk Distribution
          </SectionTitle>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={RISK_COLORS[entry.name] || 'var(--text-muted)'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
              No data yet
            </div>
          )}
        </Card>
      </div>

      {/* Recent predictions table */}
      {predictionHistory.length > 0 && (
        <Card>
          <SectionTitle sub="Most recent 10 predictions this session">
            Prediction History
          </SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr>
                  {['#', 'Contract', 'Internet', 'Tenure', 'Monthly $', 'Probability', 'Risk', 'Latency'].map(h => (
                    <th key={h} style={{
                      padding: '0.5rem 0.875rem',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      fontSize: '0.6875rem',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid var(--border)',
                      fontFamily: 'var(--font-display)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {predictionHistory.slice(-10).reverse().map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '0.625rem 0.875rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {predictionHistory.length - i}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', color: 'var(--text-secondary)' }}>{p.input?.Contract ?? '—'}</td>
                    <td style={{ padding: '0.625rem 0.875rem', color: 'var(--text-secondary)' }}>{p.input?.InternetService ?? '—'}</td>
                    <td style={{ padding: '0.625rem 0.875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{p.input?.tenure ?? '—'}mo</td>
                    <td style={{ padding: '0.625rem 0.875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>${p.input?.MonthlyCharges ?? '—'}</td>
                    <td style={{ padding: '0.625rem 0.875rem', fontFamily: 'var(--font-mono)', color: RISK_COLORS[p.risk_tier] || 'var(--text-primary)', fontWeight: 600 }}>
                      {fmtPct(p.churn_probability)}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem' }}>
                      <span style={{
                        fontSize: '0.6875rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '99px',
                        background: p.risk_tier === 'High' ? 'var(--risk-high-bg)' : p.risk_tier === 'Low' ? 'var(--risk-low-bg)' : 'var(--risk-med-bg)',
                        color: RISK_COLORS[p.risk_tier],
                        fontWeight: 600,
                        fontFamily: 'var(--font-display)',
                      }}>
                        {p.risk_tier}
                      </span>
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {p.latency_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Model version info */}
      {health && (
        <Card>
          <SectionTitle>System Info</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.8125rem' }}>
            {[
              ['Model Version', health.model_version || 'v1.0-5fold'],
              ['Last Checked', new Date(lastRefresh).toLocaleTimeString()],
              ['Server Timestamp', health.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '—'],
              ['API Status', health.status === 'ok' ? '✓ Operational' : '⚠ Degraded'],
            ].map(([k, v]) => (
              <div key={k} style={{
                display:      'flex',
                justifyContent: 'space-between',
                padding:      '0.625rem 0.875rem',
                background:   'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                border:       '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
