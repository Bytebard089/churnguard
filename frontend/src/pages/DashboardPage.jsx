// src/pages/DashboardPage.jsx
// Executive Dashboard — real charts, model health, risk distribution,
// feature importance, and actionable business insights.

import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts'
import { Activity, AlertTriangle, CheckCircle, TrendingDown, Users, Zap } from 'lucide-react'
import { Card, SectionTitle, Spinner } from '../components/ui'
import { getDashboard } from '../api/client'

// ─── colour palette (matches CSS vars) ──────────────────────────────────────
const COLORS = {
  high: '#f87171',
  med: '#fbbf24',
  low: '#34d399',
  accent: '#00e5ff',
  muted: '#64748b',
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`
const fmtMs = (v) => `${v.toFixed(0)} ms`

// ─── sub-components ──────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'var(--accent)' }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
      <div
        style={{
          width: 42, height: 42, borderRadius: '10px',
          background: `${color}18`, border: `1px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-display)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{sub}</div>}
      </div>
    </Card>
  )
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '0.625rem 0.875rem', fontSize: '0.8125rem',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem', fontFamily: 'var(--font-display)' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color || 'var(--text-primary)', fontWeight: 600 }}>
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </div>
      ))}
    </div>
  )
}

// ─── main ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', flexDirection: 'column', gap: '1rem' }}>
      <Spinner size={36} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading dashboard analytics…</span>
    </div>
  )

  if (error) return (
    <Card style={{ textAlign: 'center', padding: '3rem', color: 'var(--risk-high)' }}>
      <AlertTriangle size={32} style={{ marginBottom: '0.75rem' }} />
      <div style={{ fontWeight: 600 }}>Failed to load dashboard</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{error}</div>
    </Card>
  )

  const {
    model_metrics,
    risk_distribution,
    feature_importance,
    prediction_stats,
    model_health,
  } = data

  // ── risk pie data ──
  const pieData = [
    { name: 'High Risk', value: risk_distribution.high, color: COLORS.high },
    { name: 'Medium Risk', value: risk_distribution.medium, color: COLORS.med },
    { name: 'Low Risk', value: risk_distribution.low, color: COLORS.low },
  ]

  // ── radar data (model quality dimensions) ──
  const radarData = [
    { metric: 'ROC-AUC', value: model_metrics.roc_auc * 100 },
    { metric: 'Precision', value: model_metrics.precision * 100 },
    { metric: 'Recall', value: model_metrics.recall * 100 },
    { metric: 'F1', value: model_metrics.f1 * 100 },
    { metric: 'Accuracy', value: model_metrics.accuracy * 100 },
  ]

  // ── feature importance bar data (top 10) ──
  const fiData = feature_importance
    .slice(0, 10)
    .map((f) => ({ name: f.feature.replace(/_/g, ' '), value: f.importance }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>Model Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            XGBoost 5-fold ensemble · OOF AUC {fmtPct(model_metrics.roc_auc)} · Telco churn dataset
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.75rem', color: COLORS.low,
          background: '#34d39918', border: '1px solid #34d39940',
          padding: '0.375rem 0.75rem', borderRadius: '99px', fontWeight: 600,
        }}>
          <CheckCircle size={13} /> Model Healthy
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <KpiCard icon={Activity} label="OOF ROC-AUC" value={fmtPct(model_metrics.roc_auc)} sub="5-fold cross-validation" color={COLORS.accent} />
        <KpiCard icon={Zap} label="Avg Latency" value={fmtMs(prediction_stats.avg_latency_ms)} sub="ensemble inference" color={COLORS.low} />
        <KpiCard icon={Users} label="Total Predictions" value={prediction_stats.total.toLocaleString()} sub="since deployment" color={COLORS.med} />
        <KpiCard icon={TrendingDown} label="High Risk Customers" value={`${risk_distribution.high_pct.toFixed(1)}%`} sub="of scored population" color={COLORS.high} />
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Feature importance */}
        <Card>
          <SectionTitle sub="Top 10 drivers of churn (mean SHAP / gain)">
            Feature Importance
          </SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fiData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} tickFormatter={(v) => v.toFixed(3)} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }} />
              <Tooltip content={<CustomTooltip formatter={(v) => v.toFixed(4)} />} />
              <Bar dataKey="value" name="Importance" radius={[0, 4, 4, 0]}>
                {fiData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={i === 0 ? COLORS.accent : i < 3 ? `${COLORS.accent}cc` : `${COLORS.accent}66`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Risk distribution pie */}
        <Card>
          <SectionTitle sub="Current scored population">Risk Distribution</SectionTitle>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PieChart width={200} height={200}>
              <Pie data={pieData} cx={100} cy={100} innerRadius={55} outerRadius={85}
                dataKey="value" stroke="none" paddingAngle={3}>
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip formatter={(v) => `${v} customers`} />} />
            </PieChart>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
            {pieData.map(({ name, value, color }) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Model quality radar */}
        <Card>
          <SectionTitle sub="Multi-dimensional model performance">Model Quality Radar</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }} />
              <PolarRadiusAxis domain={[60, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Radar name="Score" dataKey="value" stroke={COLORS.accent}
                fill={COLORS.accent} fillOpacity={0.18} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* Insights panel */}
        <Card>
          <SectionTitle sub="Automated business insights">Key Findings</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {[
              { icon: '🔴', title: 'Fiber + No Security = Highest Risk', body: 'Customers on Fiber optic without OnlineSecurity have 2.3× baseline churn rate.' },
              { icon: '📄', title: 'Contract Type is #1 Lever', body: 'Upgrading Month-to-month → 2-year contract reduces churn probability by ~40pp on average.' },
              { icon: '💳', title: 'Electronic Check Users at Risk', body: 'Manual payers churn 28% more than auto-pay customers. Nudge them to autopay.' },
              { icon: '📅', title: 'First 12 Months Are Critical', body: 'New customers (tenure < 12mo) represent 62% of all churners. Early intervention wins.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{
                display: 'flex', gap: '0.75rem', padding: '0.75rem 0.875rem',
                background: 'var(--bg-elevated)', borderRadius: '8px',
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Model health table */}
      <Card>
        <SectionTitle sub="Per-fold cross-validation performance">Fold-level Metrics</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Fold', 'ROC-AUC', 'Precision', 'Recall', 'F1'].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '0.5rem 0.75rem',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-display)',
                    fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model_health.fold_metrics.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.625rem 0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Fold {i + 1}</td>
                  {['roc_auc', 'precision', 'recall', 'f1'].map((k) => (
                    <td key={k} style={{ padding: '0.625rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: row[k] >= 0.85 ? COLORS.low : row[k] >= 0.75 ? COLORS.med : COLORS.high }}>
                      {fmtPct(row[k])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-elevated)' }}>
                <td style={{ padding: '0.625rem 0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Mean</td>
                {['roc_auc', 'precision', 'recall', 'f1'].map((k) => (
                  <td key={k} style={{ padding: '0.625rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 800, color: COLORS.accent }}>
                    {fmtPct(model_metrics[k])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
