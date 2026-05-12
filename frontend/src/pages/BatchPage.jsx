// BatchPage.jsx — drag & drop zone with preview, row-level probability bars, export button
import React, { useRef, useState } from 'react'
import { Download, FileText, UploadCloud, X, CheckCircle } from 'lucide-react'
import { Button, Card, ErrorBox, SectionTitle, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { batchPredict } from '../api/client'
import { downloadBlob } from '../utils/helpers'

function parseCsvLine(line) {
  const m = line.match(/(\"([^\"]|\"\")*\"|[^,]+)/g)||[]
  return m.map(v=>{ const t=v.trim(); return t.startsWith('"')&&t.endsWith('"')?t.slice(1,-1).replace(/""/g,'"'):t })
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length<2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line=>{ const cols=parseCsvLine(line); const row={}; headers.forEach((h,i)=>{ row[h]=cols[i] }); return row })
}
function normalizeRow(row) {
  const num = new Set(['tenure','MonthlyCharges','TotalCharges'])
  const out={}
  Object.entries(row).forEach(([k,v])=>{
    if(num.has(k)){ const n=Number(v); out[k]=isNaN(n)?null:n }
    else if(k==='SeniorCitizen'){ out[k]=(v==='1'||v===1)?1:(v==='0'||v===0)?0:v }
    else out[k]=v
  })
  return out
}

export default function BatchPage() {
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState([])
  const [done,    setDone]    = useState(false)
  const [summary, setSummary] = useState(null)
  const [results, setResults] = useState([])
  const [dragOver,setDragOver]= useState(false)
  const [rowCount,setRowCount]= useState(0)
  const fileRef = useRef()
  const batchApi = useApi(batchPredict)

  async function handleFile(f) {
    if (!f||!f.name.endsWith('.csv')) return
    setFile(f); setDone(false); setSummary(null); setResults([])
    const text = await f.text()
    const rows = parseCsv(text)
    setPreview(rows.slice(0,3))
    setRowCount(rows.length)
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    handleFile(e.dataTransfer?.files?.[0]||e.target.files?.[0])
  }

  async function handleRun() {
    if (!file) return
    const text  = await file.text()
    const rows  = parseCsv(text).map(normalizeRow)
    const res   = await batchApi.run(rows)
    if (res) {
      setSummary(res.summary); setResults(res.results||[]); setDone(true)
      const csv = ['index,churn_probability,churn_prediction,risk_tier',
        ...res.results.map(r=>[r.index,r.churn_probability,r.churn_prediction,r.risk_tier].join(','))
      ].join('\n')
      downloadBlob(new Blob([csv],{type:'text/csv'}), 'churnguard_predictions.csv')
    }
  }

  function clearFile() {
    setFile(null); setPreview([]); setDone(false); setSummary(null); setResults([]); setRowCount(0)
    if(fileRef.current) fileRef.current.value=''
  }

  const riskColor = r => r==='High'?'var(--risk-high)':r==='Medium'?'var(--risk-med)':'var(--risk-low)'

  return (
    <div style={{ maxWidth:780 }}>
      <div style={{ marginBottom:'1.5rem' }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800 }}>Batch Prediction</h1>
        <p style={{ color:'var(--text-secondary)', fontSize:'0.875rem', marginTop:'0.25rem' }}>Upload a CSV with customer data — score all rows in one request</p>
      </div>

      <Card>
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onClick={()=>fileRef.current?.click()}
          style={{
            border:`2px dashed ${dragOver?'var(--accent)':file?'var(--success)':'var(--border)'}`,
            borderRadius:'var(--radius-lg)', padding:'2.5rem', textAlign:'center',
            cursor:'pointer', background:dragOver?'var(--accent-glow)':file?'var(--success-dim)':'var(--bg-elevated)',
            marginBottom:'1.25rem', transition:'all 0.2s ease',
          }}>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e=>handleFile(e.target.files?.[0])} />
          {file ? (
            <div>
              <CheckCircle size={36} style={{ color:'var(--success)', marginBottom:'0.625rem' }} />
              <div style={{ fontWeight:700, color:'var(--text-primary)' }}>{file.name}</div>
              <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.25rem' }}>
                {preview.length} rows previewed · Click to replace
              </div>
            </div>
          ) : (
            <div>
              <UploadCloud size={36} style={{ color:dragOver?'var(--accent)':'var(--text-muted)', marginBottom:'0.625rem' }} />
              <div style={{ color:'var(--text-primary)', fontWeight:600 }}>Drop your CSV here, or click to browse</div>
              <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.375rem' }}>Expects Telco churn dataset schema · Max 500 rows</div>
            </div>
          )}
        </div>

        {/* CSV Preview */}
        {preview.length>0 && !done && (
          <div style={{ marginBottom:'1.25rem' }}>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>
              CSV Preview (first {preview.length} rows)
            </div>
            <div style={{ overflowX:'auto', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', border:'1px solid var(--border)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {Object.keys(preview[0]).slice(0,6).map(h=>(
                      <th key={h} style={{ padding:'0.5rem 0.75rem', textAlign:'left', color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'0.68rem' }}>{h}</th>
                    ))}
                    {Object.keys(preview[0]).length>6 && <th style={{ padding:'0.5rem 0.75rem', color:'var(--text-muted)' }}>+{Object.keys(preview[0]).length-6} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row,i)=>(
                    <tr key={i} style={{ borderBottom:i<preview.length-1?'1px solid var(--border)':'none' }}>
                      {Object.values(row).slice(0,6).map((v,j)=>(
                        <td key={j} style={{ padding:'0.5rem 0.75rem', fontFamily:'var(--font-mono)', color:'var(--text-secondary)', fontSize:'0.75rem' }}>{v}</td>
                      ))}
                      {Object.keys(row).length>6 && <td style={{ padding:'0.5rem 0.75rem', color:'var(--text-muted)' }}>…</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
          <Button onClick={handleRun} loading={batchApi.loading} disabled={!file} size="lg" style={{ flex:1 }}>
            {batchApi.loading ? <><Spinner size={16} /> Processing…</> : <><UploadCloud size={16} /> Run Batch ({rowCount} rows)</>}
          </Button>
          {file && <Button variant="ghost" onClick={clearFile} size="lg"><X size={16} /> Clear</Button>}
        </div>
        <ErrorBox message={batchApi.error} />

        {/* Summary KPIs */}
        {summary && (
          <div style={{ marginTop:'1.25rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'0.75rem', marginBottom:'0.75rem' }}>
              {[
                {label:'Total',       value:summary.total,                 color:'var(--text-primary)'},
                {label:'High Risk',   value:summary.high_risk,             color:'var(--risk-high)'},
                {label:'Medium Risk', value:summary.medium_risk,           color:'var(--risk-med)'},
                {label:'Low Risk',    value:summary.low_risk,              color:'var(--risk-low)'},
                {label:'High Risk %', value:`${summary.high_risk_pct}%`,   color:'var(--risk-high)'},
              ].map(k=>(
                <div key={k.label} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', padding:'0.75rem', textAlign:'center' }}>
                  <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.25rem' }}>{k.label}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontWeight:800, fontSize:'1.2rem', color:k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>
              Avg churn probability: <strong style={{ color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>{(summary.avg_churn_probability*100).toFixed(1)}%</strong>
              &nbsp; · Latency: <strong style={{ fontFamily:'var(--font-mono)' }}>{summary.latency_ms ? `${summary.latency_ms.toFixed(0)}ms` : '—'}</strong>
            </div>
          </div>
        )}

        {/* Results table with prob bars */}
        {results.length>0 && (
          <div style={{ marginTop:'1.25rem', overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['#','Probability','Risk','Verdict'].map(h=>(
                    <th key={h} style={{ textAlign:'left', padding:'0.5rem 0.75rem', color:'var(--text-muted)', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0,20).map(row=>(
                  <tr key={row.index} style={{ borderBottom:'1px solid var(--border)', transition:'background 0.12s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-elevated)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'0.5rem 0.75rem', fontFamily:'var(--font-mono)', color:'var(--text-muted)', fontSize:'0.75rem' }}>{row.index}</td>
                    <td style={{ padding:'0.5rem 0.75rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <div style={{ width:80, height:5, background:'var(--bg-elevated)', borderRadius:'99px', overflow:'hidden', border:'1px solid var(--border)', flexShrink:0 }}>
                          <div style={{ height:'100%', width:`${row.churn_probability*100}%`, background:riskColor(row.risk_tier), borderRadius:'99px' }} />
                        </div>
                        <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, fontSize:'0.8rem' }}>{(row.churn_probability*100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ padding:'0.5rem 0.75rem' }}>
                      <span style={{ fontSize:'0.7rem', padding:'0.15rem 0.5rem', borderRadius:'99px', fontWeight:700, background:`${riskColor(row.risk_tier)}18`, color:riskColor(row.risk_tier), border:`1px solid ${riskColor(row.risk_tier)}40` }}>
                        {row.risk_tier}
                      </span>
                    </td>
                    <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem', color:row.churn_prediction?'var(--risk-high)':'var(--risk-low)', fontWeight:600 }}>
                      {row.churn_prediction?'⚡ Will Churn':'✓ Retained'}
                    </td>
                  </tr>
                ))}
                {results.length>20 && (
                  <tr><td colSpan={4} style={{ padding:'0.625rem 0.75rem', color:'var(--text-muted)', fontSize:'0.75rem', textAlign:'center' }}>
                    …and {results.length-20} more rows in the downloaded CSV
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {done && (
          <div className="fade-in" style={{ marginTop:'1rem', display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--success)', fontSize:'0.8rem', fontWeight:600 }}>
            <Download size={16} /> churnguard_predictions.csv downloaded
          </div>
        )}
      </Card>
    </div>
  )
}
