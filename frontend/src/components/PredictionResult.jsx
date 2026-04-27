// src/components/PredictionResult.jsx
// Shows the full prediction result: probability gauge, risk badge,
// SHAP bar chart, and fold-agreement strip.

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'
import { fmtPct, riskColor } from '../utils/helpers'
import { RiskBadge, StatCell } from './ui'

/* ── Gauge (SVG arc) ─────────────────────────────────────────────────────── */
function ProbabilityGauge({ probability }) {
  const pct       = probability * 100
  const radius    = 72
  const cx        = 90
  const cy        = 90
  const startAngle = 200   // degrees
  const endAngle   = -20
  const totalAngle = startAngle - endAngle  // 220°

  function polarToXY(angleDeg, r) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
  }

  function describeArc(a1, a2, r) {
    const s  = polarToXY(a1, r)
    const e  = polarToXY(a2, r)
    const lg = a1 - a2 > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${lg} 0 ${e.x} ${e.y}`
  }

  const fillAngle = startAngle - totalAngle * probability
  const color     = probability >= 0.65 ? 'var(--risk-high)'
                  : probability >= 0.35 ? 'var(--risk-med)'
                  : 'var(--risk-low)'

  // Needle tip
  const needle = polarToXY(fillAngle, radius - 10)

  return (
    <svg viewBox="0 0 180 110" style={{ width: '100%', maxWidth: '220px', margin: '0 auto', display: 'block' }}>
      {/* Background track */}
      <path
        d={describeArc(startAngle, endAngle, radius)}
        fill="none"
        stroke="var(--border)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Fill arc */}
      <path
        d={describeArc(startAngle, fillAngle, radius)}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      {/* Needle dot */}
      <circle cx={needle.x} cy={needle.y} r="5" fill={color} />
      {/* Center text */}
      <text x={cx} y={cy - 8} textAnchor="middle"
        style={{ fontFamily: 'var(--font-display)', fill: color, fontSize: '24px', fontWeight: 800 }}>
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        style={{ fontFamily: 'var(--font-body)', fill: 'var(--text-secondary)', fontSize: '9px' }}>
        CHURN PROBABILITY
      </text>
    </svg>
  )
}

/* ── SHAP bar chart ──────────────────────────────────────────────────────── */
function ShapChart({ shapValues }) {
  if (!shapValues || shapValues.length === 0) return null

  // shapValues = [{ feature, shap_value, feature_value }, ...]
  const sorted = [...shapValues]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    const data = sorted.map(sv => ({
    name:  sv.feature,          // already cleaned in backend
    value: sv.impact,
    raw:   sv.raw_value,
    }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
        <XAxis type="number" tickFormatter={v => v.toFixed(2)}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130}
          tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-body)' }}
          axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="var(--border-bright)" />
        <Tooltip
          formatter={(val, name, props) => [
            `${val > 0 ? '+' : ''}${val.toFixed(3)}`,
            `Value: ${props.payload.raw}`,
          ]}
          contentStyle={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.value > 0 ? 'var(--danger)' : 'var(--success)'}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── Fold agreement ──────────────────────────────────────────────────────── */
function FoldStrip({ probs }) {
  if (!probs || probs.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        5-Fold Agreement
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {probs.map((p, i) => {
          const color = p >= 0.65 ? 'var(--risk-high)' : p >= 0.35 ? 'var(--risk-med)' : 'var(--risk-low)'
          return (
            <div key={i} style={{
              flex:          1,
              background:    'var(--bg-elevated)',
              border:        `1px solid var(--border)`,
              borderRadius:  'var(--radius-sm)',
              padding:       '0.5rem 0.25rem',
              textAlign:     'center',
            }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                F{i + 1}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color, fontWeight: 600 }}>
                {fmtPct(p, 0)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main result component ───────────────────────────────────────────────── */
export default function PredictionResult({ result }) {
  if (!result) return null

  const {
    churn_probability,
    churn_predicted,
    risk_tier,
    confidence,
    shap_values,
    fold_probabilities,
    latency_ms,
  } = result

  return (
    <div className="animate-slideUp" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Top: gauge + stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        alignItems: 'center',
      }}>
        <ProbabilityGauge probability={churn_probability} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.375rem' }}>
              Prediction
            </div>
            <RiskBadge tier={risk_tier} size="lg" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <StatCell label="Confidence" value={confidence} />
            <StatCell label="Latency" value={`${latency_ms}ms`} />
          </div>
          <div style={{
            padding: '0.625rem 0.875rem',
            background: churn_predicted ? 'var(--risk-high-bg)' : 'var(--risk-low-bg)',
            border: `1px solid ${churn_predicted ? 'var(--risk-high)' : 'var(--risk-low)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            color: churn_predicted ? 'var(--risk-high)' : 'var(--risk-low)',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
          }}>
            {churn_predicted ? '⚡ Will Churn — Intervene Now' : '✓ Retained — Monitor Periodically'}
          </div>
        </div>
      </div>

      {/* SHAP chart */}
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>
          Feature Impact (SHAP) — <span style={{ color: 'var(--danger)' }}>■ Increases risk</span> &nbsp; <span style={{ color: 'var(--success)' }}>■ Reduces risk</span>
        </div>
        <ShapChart shapValues={shap_values} />
      </div>

      {/* Fold agreement */}
      <FoldStrip probs={fold_probabilities} />
    </div>
  )
}
