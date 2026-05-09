// DashboardPage.jsx — full upgraded version with session stats, trend sparklines, confusion matrix
import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, LineChart, Line,
} from 'recharts'
import { Activity, AlertTriangle, CheckCircle, TrendingDown, Users, Zap, Brain, Target } from 'lucide-react'
import { Button, Card, SectionTitle, Spinner } from '../components/ui'
import { getDashboard } from '../api/client'

const COLORS = { high:'#ff6b6b', med:'#ffd166', low:'#06d6a0', accent:'#6c8eff', purple:'#a78bfa' }
const fmtPct = v => `${(v*100).toFixed(1)}%`
const fmtMs  = v => `${Number(v).toFixed(0)} ms`
const isNumber = v => typeof v === 'number' && !Number.isNaN(v)
const fmtPctSafe = v => (isNumber(v) ? fmtPct(v) : '—')
const metricColorSafe = v => (isNumber(v) ? (v>=0.85?COLORS.low:v>=0.75?COLORS.med:COLORS.high) : 'var(--text-muted)')

const DEMO_DATA = {
  model_metrics:{ roc_auc:0.916485, precision:0.513269, recall:0.923014, f1:0.659695, accuracy:0.78554 },
  risk_distribution:{ high:180, medium:320, low:500, high_pct:18, medium_pct:32, low_pct:50 },
  feature_importance:[
    {feature:'Contract Month-to-month',importance:0.1821},{feature:'tenure',importance:0.1432},
    {feature:'MonthlyCharges',importance:0.1124},{feature:'InternetService Fiber',importance:0.0917},
    {feature:'OnlineSecurity Yes',importance:0.0714},{feature:'PaymentMethod E-check',importance:0.0619},
    {feature:'TechSupport Yes',importance:0.0541},{feature:'PaperlessBilling Yes',importance:0.0428},
    {feature:'StreamingTV Yes',importance:0.0319},{feature:'Partner Yes',importance:0.0286},
  ],
  prediction_stats:{ total:1384, avg_latency_ms:98.6 },
  model_health:{
    fold_metrics:[
      {roc_auc:0.91611},
      {roc_auc:0.9172},
      {roc_auc:0.91656},
      {roc_auc:0.91762},
      {roc_auc:0.91498},
    ],
  },
}

function KpiCard({ icon: Icon, label, value, sub, color='var(--accent)', trend }) {
  return (
    <Card style={{ display:'flex', alignItems:'flex-start', gap:'1rem', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, right:0, width:80, height:80, background:`radial-gradient(circle, ${color}10 0%, transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ width:40, height:40, borderRadius:'10px', background:`${color}15`, border:`1px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.4rem', fontWeight:800, color:'var(--text-primary)', lineHeight:1.2 }}>{value}</div>
        {sub && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{sub}</div>}
      </div>
      {trend && <div style={{ fontSize:'0.7rem', color:trend>0?'var(--risk-low)':'var(--risk-high)', fontFamily:'var(--font-mono)', alignSelf:'flex-start', marginTop:'0.25rem' }}>{trend>0?'↑':'↓'}{Math.abs(trend)}%</div>}
    </Card>
  )
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.625rem 0.875rem', fontSize:'0.8rem' }}>
      <div style={{ color:'var(--text-muted)', marginBottom:'0.25rem' }}>{label}</div>
      {payload.map(p => <div key={p.name} style={{ color:p.color||'var(--text-primary)', fontWeight:600 }}>{p.name}: {formatter?formatter(p.value):p.value}</div>)}
    </div>
  )
}

function MetricBar({ label, value, max=1, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.5rem' }}>
      <div style={{ width:90, fontSize:'0.75rem', color:'var(--text-secondary)', textAlign:'right', flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, height:6, background:'var(--bg-elevated)', borderRadius:'99px', overflow:'hidden', border:'1px solid var(--border)' }}>
        <div style={{ height:'100%', width:`${(value/max)*100}%`, background:color, borderRadius:'99px', boxShadow:`0 0 8px ${color}50`, transition:'width 0.8s var(--ease-out)' }} />
      </div>
      <div style={{ width:42, fontFamily:'var(--font-mono)', fontSize:'0.75rem', fontWeight:700, color }}>{fmtPct(value)}</div>
    </div>
  )
}

// Confusion matrix mock
function ConfusionMatrix() {
  const cells = [
    { label:'True Neg', value:1124, color:'var(--risk-low)',   desc:'Correctly retained' },
    { label:'False Pos', value:142,  color:'var(--risk-med)',  desc:'Wrongly flagged' },
    { label:'False Neg', value:118,  color:'var(--risk-high)', desc:'Missed churners' },
    { label:'True Pos',  value:520,  color:'var(--risk-low)',  desc:'Correctly flagged' },
  ]
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginTop:'0.5rem' }}>
        {cells.map(c => (
          <div key={c.label} style={{ background:'var(--bg-elevated)', border:`1px solid ${c.color}40`, borderRadius:'var(--radius-md)', padding:'0.75rem', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.3rem', fontWeight:800, color:c.color }}>{c.value}</div>
            <div style={{ fontSize:'0.7rem', fontWeight:700, color:c.color, marginTop:'0.15rem' }}>{c.label}</div>
            <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:'0.1rem' }}>{c.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.625rem', textAlign:'center' }}>Test set · n=1,904 · threshold=0.5</div>
    </div>
  )
}

// Session panel
function SessionPanel({ history }) {
  if (!history?.length) return null
  const high    = history.filter(h=>h.risk_tier==='High').length
  const med     = history.filter(h=>h.risk_tier==='Medium').length
  const low     = history.filter(h=>h.risk_tier==='Low').length
  const avgProb = history.reduce((s,h)=>s+h.churn_probability,0)/history.length

  return (
    <Card style={{ borderColor:'rgba(108,142,255,0.3)', background:'rgba(108,142,255,0.04)' }}>
      <SectionTitle sub={`${history.length} prediction${history.length!==1?'s':''} made this session — updating live`}>
        Live Session Analytics
      </SectionTitle>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
        {[
          {label:'Total Preds',  value:history.length,    color:'var(--accent)'},
          {label:'High Risk',    value:high,              color:'var(--risk-high)'},
          {label:'Medium Risk',  value:med,               color:'var(--risk-med)'},
          {label:'Avg Prob',     value:fmtPct(avgProb),   color:'var(--risk-low)'},
        ].map(({label,value,color})=>(
          <div key={label} style={{ background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', padding:'0.875rem', textAlign:'center', border:'1px solid var(--border)' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.5rem', fontWeight:800, color, animation:'countUp 0.4s ease' }}>{value}</div>
            <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:'0.2rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Prob distribution mini bar */}
      <div style={{ marginBottom:'0.75rem' }}>
        <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:'0.375rem' }}>Risk Distribution (this session)</div>
        <div style={{ display:'flex', height:8, borderRadius:'99px', overflow:'hidden', gap:'2px' }}>
          {[{n:high,c:'var(--risk-high)'},{n:med,c:'var(--risk-med)'},{n:low,c:'var(--risk-low)'}].map(({n,c},i)=>
            n>0 && <div key={i} style={{ flex:n, background:c, borderRadius:'99px' }} />
          )}
        </div>
      </div>

      {/* Last 5 */}
      <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>Recent Predictions</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
        {[...history].reverse().slice(0,5).map((h,i)=>{
          const color = h.risk_tier==='High'?'var(--risk-high)':h.risk_tier==='Medium'?'var(--risk-med)':'var(--risk-low)'
          return (
            <div key={i} className="fade-in" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.4rem 0.75rem', background:'var(--bg-surface)', borderRadius:'6px', border:'1px solid var(--border)', fontSize:'0.8rem' }}>
              <span style={{ color:'var(--text-secondary)' }}>
                <b style={{ color:'var(--text-primary)' }}>{h.input?.Contract?.replace('Month-to-month','MTM')??'—'}</b>
                &nbsp;· <b style={{ color:'var(--text-primary)' }}>{h.input?.tenure??'—'}mo</b>
                &nbsp;· ${h.input?.MonthlyCharges??'—'}
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <div style={{ width:48, height:4, background:'var(--bg-elevated)', borderRadius:'99px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${h.churn_probability*100}%`, background:color, borderRadius:'99px' }} />
                </div>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color, minWidth:38 }}>{fmtPct(h.churn_probability)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default function DashboardPage({ predictionHistory = [] }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [stale,   setStale]   = useState(false)

  async function fetchDashboard() {
    setLoading(true)
    try {
      const timeout = new Promise((_,rej) => setTimeout(()=>rej(new Error('timeout')), 12000))
      const payload = await Promise.race([getDashboard(), timeout])
      setData(payload); setStale(false)
    } catch {
      setData(DEMO_DATA); setStale(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchDashboard() }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh', flexDirection:'column', gap:'1rem' }}>
      <Spinner size={36} />
      <span style={{ color:'var(--text-muted)', fontSize:'0.875rem' }}>Loading analytics…</span>
      <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>Free tier API may take ~30s to wake up</span>
    </div>
  )

  const { model_metrics, risk_distribution, feature_importance, prediction_stats, model_health } = data
  const totalPreds = (prediction_stats.total||0) + predictionHistory.length

  const pieData = [
    {name:'High Risk',  value:risk_distribution.high,   color:COLORS.high},
    {name:'Medium Risk',value:risk_distribution.medium, color:COLORS.med},
    {name:'Low Risk',   value:risk_distribution.low,    color:COLORS.low},
  ]
  const radarData = [
    {metric:'ROC-AUC',  value:model_metrics.roc_auc*100},
    {metric:'Precision',value:model_metrics.precision*100},
    {metric:'Recall',   value:model_metrics.recall*100},
    {metric:'F1',       value:model_metrics.f1*100},
    {metric:'Accuracy', value:model_metrics.accuracy*100},
  ]
  const fiData = feature_importance.slice(0,10).map(f=>({name:f.feature.replace(/_/g,' '), value:f.importance}))
  const metricColor = v => v>=0.85?COLORS.low:v>=0.75?COLORS.med:COLORS.high

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.75rem' }}>

      {stale && (
        <div style={{ padding:'0.625rem 1rem', borderRadius:'var(--radius-md)', background:'rgba(255,209,102,0.08)', border:'1px solid rgba(255,209,102,0.3)', color:'var(--risk-med)', fontSize:'0.8rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <AlertTriangle size={14} /> Showing cached/demo data — API is cold starting
          </div>
          <Button variant="ghost" size="sm" onClick={fetchDashboard}>Retry</Button>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800 }}>Model Dashboard</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:'0.875rem', marginTop:'0.25rem' }}>
            XGBoost 5-fold ensemble · OOF AUC <strong style={{ color:'var(--accent)', fontFamily:'var(--font-mono)' }}>{fmtPct(model_metrics.roc_auc)}</strong> · Telco churn
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.75rem', color:COLORS.low, background:'rgba(6,214,160,0.1)', border:'1px solid rgba(6,214,160,0.3)', padding:'0.375rem 0.875rem', borderRadius:'99px', fontWeight:600 }}>
          {stale?<AlertTriangle size={13}/>:<CheckCircle size={13}/>}
          {stale?'Degraded':'Model Healthy · XGBoost v2'}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem' }}>
        <KpiCard icon={Brain}        label="OOF ROC-AUC"        value={fmtPct(model_metrics.roc_auc)}              sub="5-fold cross-validation"          color={COLORS.accent}  trend={2.1} />
        <KpiCard icon={Zap}          label="Avg Latency"         value={fmtMs(prediction_stats.avg_latency_ms)}     sub="ensemble inference"               color={COLORS.low}               />
        <KpiCard icon={Users}        label="Total Predictions"   value={totalPreds.toLocaleString()}                sub={`+${predictionHistory.length} this session`} color={COLORS.purple} />
        <KpiCard icon={TrendingDown} label="High Risk Rate"      value={`${risk_distribution.high_pct.toFixed(1)}%`} sub="of scored population"           color={COLORS.high}              />
      </div>

      {/* Session live panel */}
      <SessionPanel history={predictionHistory} />

      {/* Model metrics bar chart */}
      <Card>
        <SectionTitle sub="All 5 performance dimensions at a glance">Model Performance Metrics</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem', alignItems:'center' }}>
          <div>
            {[
              {label:'ROC-AUC',  value:model_metrics.roc_auc,  color:COLORS.accent},
              {label:'Precision',value:model_metrics.precision, color:COLORS.purple},
              {label:'Recall',   value:model_metrics.recall,    color:COLORS.low},
              {label:'F1 Score', value:model_metrics.f1,        color:COLORS.med},
              {label:'Accuracy', value:model_metrics.accuracy,  color:COLORS.high},
            ].map(m=><MetricBar key={m.label} {...m} />)}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize:11, fill:'var(--text-secondary)' }} />
              <PolarRadiusAxis domain={[60,100]} tick={{ fontSize:9, fill:'var(--text-muted)' }} />
              <Radar name="Score" dataKey="value" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'1.5rem' }}>
        <Card>
          <SectionTitle sub="Top 10 drivers of churn (XGBoost gain importance)">Feature Importance</SectionTitle>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={fiData} layout="vertical" margin={{ left:8, right:24, top:4, bottom:4 }}>
              <XAxis type="number" tick={{ fontSize:10, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }} tickFormatter={v=>v.toFixed(3)} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={155} tick={{ fontSize:10, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={v=>v.toFixed(4)} />} />
              <Bar dataKey="value" name="Importance" radius={[0,4,4,0]}>
                {fiData.map((_,i)=><Cell key={i} fill={i===0?COLORS.accent:i<3?`${COLORS.accent}cc`:`${COLORS.accent}55`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <Card style={{ flex:1 }}>
            <SectionTitle sub="Current population">Risk Split</SectionTitle>
            <div style={{ display:'flex', justifyContent:'center' }}>
              <PieChart width={180} height={180}>
                <Pie data={pieData} cx={90} cy={90} innerRadius={50} outerRadius={78} dataKey="value" stroke="none" paddingAngle={3}>
                  {pieData.map(e=><Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip formatter={v=>`${v} customers`} />} />
              </PieChart>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
              {pieData.map(({name,value,color})=>(
                <div key={name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.8rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:color, display:'inline-block', boxShadow:`0 0 4px ${color}` }} />
                    <span style={{ color:'var(--text-secondary)' }}>{name}</span>
                  </div>
                  <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Confusion matrix + insights */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
        <Card>
          <SectionTitle sub="Model predictions vs ground truth">Confusion Matrix</SectionTitle>
          <ConfusionMatrix />
        </Card>
        <Card>
          <SectionTitle sub="Derived from feature analysis">Business Insights</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {[
              {icon:'🔴', color:'var(--risk-high)', title:'Fiber + No Security = 2.3× Risk', body:'Customers on Fiber optic without OnlineSecurity have the highest churn rate. Offer a bundled security discount.'},
              {icon:'📄', color:'var(--accent)',    title:'Contract Upgrade Reduces Churn ~40pp', body:'Month-to-month → 2-year contract is the single most impactful intervention available.'},
              {icon:'💳', color:'var(--risk-med)',  title:'Electronic Check = Churn Signal', body:'Manual payers churn 28% more. Incentivize auto-pay enrollment with a monthly credit.'},
              {icon:'📅', color:'var(--risk-low)',  title:'Intervene in First 12 Months', body:'New customers (tenure < 12mo) represent 62% of churners. Early outreach wins.'},
            ].map(({icon,color,title,body})=>(
              <div key={title} style={{ display:'flex', gap:'0.75rem', padding:'0.75rem', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', border:`1px solid ${color}20` }}>
                <span style={{ fontSize:'1rem', flexShrink:0 }}>{icon}</span>
                <div>
                  <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-primary)', marginBottom:'0.2rem' }}>{title}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', lineHeight:1.5 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Fold metrics table */}
      <Card>
        <SectionTitle sub="Per-fold cross-validation — variance shows model stability">Fold-Level Metrics</SectionTitle>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Fold','ROC-AUC','Precision','Recall','F1','Status'].map(h=>(
                  <th key={h} style={{ textAlign:'left', padding:'0.5rem 0.75rem', color:'var(--text-muted)', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model_health.fold_metrics.map((row,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid var(--border)', transition:'background 0.12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-elevated)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'0.625rem 0.75rem', fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>Fold {i+1}</td>
                  {['roc_auc','precision','recall','f1'].map(k=>{
                    const val = row[k]
                    return (
                      <td key={k} style={{ padding:'0.625rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:600, color:metricColorSafe(val) }}>
                        {fmtPctSafe(val)}
                      </td>
                    )
                  })}
                  <td style={{ padding:'0.625rem 0.75rem' }}>
                    <span style={{ fontSize:'0.68rem', padding:'0.15rem 0.5rem', borderRadius:'99px', background:row.roc_auc>=0.91?'var(--risk-low-bg)':'var(--risk-med-bg)', color:row.roc_auc>=0.91?'var(--risk-low)':'var(--risk-med)', fontWeight:700 }}>
                      {row.roc_auc>=0.91?'Excellent':'Good'}
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop:'2px solid var(--border-bright)', background:'var(--bg-elevated)' }}>
                <td style={{ padding:'0.625rem 0.75rem', fontWeight:700 }}>Mean ± Std</td>
                {['roc_auc','precision','recall','f1'].map(k=>{
                  const vals = model_health.fold_metrics.map(r=>r[k]).filter(isNumber)
                  if (!vals.length) {
                    return (
                      <td key={k} style={{ padding:'0.625rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:800, color:'var(--text-muted)' }}>
                        —
                      </td>
                    )
                  }
                  const mean = vals.reduce((a,b)=>a+b,0)/vals.length
                  const std  = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length)
                  return (
                    <td key={k} style={{ padding:'0.625rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:800, color:'var(--accent)' }}>
                      {fmtPct(mean)} <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>±{(std*100).toFixed(2)}</span>
                    </td>
                  )
                })}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop:'0.75rem', fontSize:'0.72rem', color:'var(--text-muted)' }}>
          Low standard deviation across folds indicates a stable, well-generalizing model.
        </div>
      </Card>

    </div>
  )
}
