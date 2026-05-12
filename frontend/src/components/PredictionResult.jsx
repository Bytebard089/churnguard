// PredictionResult.jsx — animated gauge, ROI calculator, intervention tips
import React, { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import { fmtPct, riskColor } from '../utils/helpers'
import { RiskBadge, StatCell } from './ui'

function ProbabilityGauge({ probability }) {
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(probability), 80)
    return () => clearTimeout(t)
  }, [probability])

  const radius = 72, cx = 90, cy = 90, startAngle = 200, endAngle = -20
  const totalAngle = startAngle - endAngle
  const toXY = (a,r) => ({ x: cx + r*Math.cos(a*Math.PI/180), y: cy - r*Math.sin(a*Math.PI/180) })
  const arc  = (a1,a2,r) => { const s=toXY(a1,r),e=toXY(a2,r); return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a1-a2>180?1:0} 0 ${e.x} ${e.y}` }

  const fillAngle = startAngle - totalAngle * displayed
  const color = displayed >= 0.65 ? 'var(--risk-high)' : displayed >= 0.35 ? 'var(--risk-med)' : 'var(--risk-low)'
  const needle = toXY(fillAngle, radius - 10)

  // Tick marks at 35% and 65%
  const tick35 = toXY(startAngle - totalAngle*0.35, radius+6)
  const tick65 = toXY(startAngle - totalAngle*0.65, radius+6)

  return (
    <svg viewBox="0 0 180 115" style={{ width:'100%', maxWidth:220, margin:'0 auto', display:'block' }}>
      <path d={arc(startAngle,endAngle,radius)} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
      {/* Green zone */}
      <path d={arc(startAngle, startAngle-totalAngle*0.35, radius)} fill="none" stroke="rgba(6,214,160,0.15)" strokeWidth="10" strokeLinecap="round" />
      {/* Red zone */}
      <path d={arc(startAngle-totalAngle*0.65, endAngle, radius)} fill="none" stroke="rgba(255,107,107,0.15)" strokeWidth="10" strokeLinecap="round" />
      {/* Fill */}
      <path d={arc(startAngle,fillAngle,radius)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{ filter:`drop-shadow(0 0 8px ${color})`, transition:'d 0.6s var(--ease-out)' }} />
      <circle cx={needle.x} cy={needle.y} r="5" fill={color} style={{ transition:'cx 0.6s var(--ease-out), cy 0.6s var(--ease-out)' }} />
      {/* Labels */}
      <text x={toXY(startAngle-totalAngle*0.35,radius+16).x} y={toXY(startAngle-totalAngle*0.35,radius+16).y} textAnchor="middle" style={{ fill:'var(--text-muted)', fontSize:'7px' }}>35%</text>
      <text x={toXY(startAngle-totalAngle*0.65,radius+16).x} y={toXY(startAngle-totalAngle*0.65,radius+16).y} textAnchor="middle" style={{ fill:'var(--text-muted)', fontSize:'7px' }}>65%</text>
      <text x={cx} y={cy-8} textAnchor="middle" style={{ fontFamily:'var(--font-display)', fill:color, fontSize:'26px', fontWeight:800 }}>
        {(displayed*100).toFixed(1)}%
      </text>
      <text x={cx} y={cy+10} textAnchor="middle" style={{ fontFamily:'var(--font-body)', fill:'var(--text-muted)', fontSize:'8px' }}>
        CHURN PROBABILITY
      </text>
    </svg>
  )
}

function ShapChart({ shapValues }) {
  if (!shapValues?.length) return null
  const data = [...shapValues]
    .sort((a,b) => Math.abs(b.shap_val ?? b.impact ?? 0)-Math.abs(a.shap_val ?? a.impact ?? 0))
    .slice(0,8)
    .map(sv => ({ name:sv.feature, value:sv.shap_val ?? sv.impact ?? 0, raw:sv.value??sv.raw_value??'' }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left:10, right:40, top:0, bottom:0 }}>
        <XAxis type="number" tickFormatter={v=>v.toFixed(2)} tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fill:'var(--text-secondary)', fontSize:10 }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="var(--border-bright)" />
        <Tooltip formatter={(val,_n,props) => [`${val>0?'+':''}${val.toFixed(3)}`, props.payload.raw?`Value: ${props.payload.raw}`:'']}
          contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'11px', color:'var(--text-primary)', fontFamily:'var(--font-mono)' }} />
        <Bar dataKey="value" radius={[0,3,3,0]}>
          {data.map((e,i) => <Cell key={i} fill={e.value>0?'var(--danger)':'var(--success)'} fillOpacity={0.85} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function FoldStrip({ probs }) {
  if (!probs?.length) return null
  const avg = probs.reduce((a,b)=>a+b,0)/probs.length
  const std = Math.sqrt(probs.reduce((a,b)=>a+(b-avg)**2,0)/probs.length)
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
        <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>5-Fold Agreement</div>
        <div style={{ fontSize:'0.68rem', fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>
          std={((std)*100).toFixed(1)}% · {std<0.05?'✓ High agreement':'⚠ High variance'}
        </div>
      </div>
      <div style={{ display:'flex', gap:'0.5rem' }}>
        {probs.map((p,i)=>{
          const color = p>=0.65?'var(--risk-high)':p>=0.35?'var(--risk-med)':'var(--risk-low)'
          return (
            <div key={i} style={{ flex:1, background:'var(--bg-elevated)', border:`1px solid ${color}30`, borderRadius:'var(--radius-sm)', padding:'0.5rem 0.25rem', textAlign:'center' }}>
              <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:'0.2rem' }}>F{i+1}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color, fontWeight:700 }}>{fmtPct(p,0)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ROI calculator
function RoiCard({ probability }) {
  const cac       = 150   // cost to acquire
  const revenue   = 1200  // annual revenue per customer
  const saveCost  = 25    // cost of intervention (discount/call)
  const saveRate  = 0.35  // % of high-risk customers saved by intervention
  const expectedLoss = probability * revenue
  const roi = probability >= 0.35
    ? Math.round((probability * saveRate * revenue - saveCost) / saveCost * 100)
    : 0

  return (
    <div style={{ padding:'0.875rem', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', border:'1px solid var(--border)' }}>
      <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.625rem' }}>
        💰 ROI Estimate — Should You Intervene?
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', fontSize:'0.75rem' }}>
        <div>Expected revenue at risk<br /><strong style={{ fontFamily:'var(--font-mono)', color:'var(--risk-high)', fontSize:'1rem' }}>${expectedLoss.toFixed(0)}</strong></div>
        <div>Intervention ROI<br /><strong style={{ fontFamily:'var(--font-mono)', color:roi>0?'var(--risk-low)':'var(--text-muted)', fontSize:'1rem' }}>{roi>0?`+${roi}%`:'N/A'}</strong></div>
      </div>
      <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:'0.5rem', lineHeight:1.5 }}>
        {probability >= 0.65
          ? '⚡ High ROI — prioritize this customer for immediate outreach'
          : probability >= 0.35
          ? '📊 Moderate ROI — worth a targeted email or offer'
          : '✓ Low risk — monitor periodically, no immediate action needed'}
      </div>
    </div>
  )
}

export default function PredictionResult({ result }) {
  if (!result) return null
  const { churn_probability, churn_prediction, risk_tier, confidence, shap_values, shap_top_features, fold_probabilities, latency_ms } = result
  const shapData  = shap_values || shap_top_features || []
  const confDisp  = typeof confidence === 'number' ? (confidence > 1 ? confidence.toFixed(1)+'%' : fmtPct(confidence)) : (confidence ?? '—')

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

      {/* Gauge + quick stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', alignItems:'center' }}>
        <ProbabilityGauge probability={churn_probability} />
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.375rem' }}>Prediction</div>
            <RiskBadge tier={risk_tier} size="lg" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
            <StatCell label="Confidence" value={confDisp} />
            <StatCell label="Latency"    value={`${latency_ms}ms`} />
          </div>
          <div style={{
            padding:'0.625rem 0.875rem', borderRadius:'var(--radius-md)', fontSize:'0.8125rem', fontWeight:600,
            background: churn_prediction ? 'var(--risk-high-bg)' : 'var(--risk-low-bg)',
            border:     `1px solid ${churn_prediction ? 'var(--risk-high)' : 'var(--risk-low)'}`,
            color:      churn_prediction ? 'var(--risk-high)' : 'var(--risk-low)',
            fontFamily: 'var(--font-display)',
          }}>
            {churn_prediction ? '⚡ Will Churn — Intervene Now' : '✓ Retained — Monitor Periodically'}
          </div>
        </div>
      </div>

      {/* ROI calculator */}
      <RoiCard probability={churn_probability} />

      {/* SHAP */}
      {shapData.length > 0 && (
        <div>
          <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.625rem' }}>
            Feature Impact (SHAP) &nbsp;
            <span style={{ color:'var(--danger)' }}>■ Increases risk</span> &nbsp;
            <span style={{ color:'var(--success)' }}>■ Reduces risk</span>
          </div>
          <ShapChart shapValues={shapData} />
        </div>
      )}

      {/* Fold strip */}
      <FoldStrip probs={fold_probabilities} />

    </div>
  )
}
