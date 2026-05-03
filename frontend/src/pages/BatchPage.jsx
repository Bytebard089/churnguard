import React, { useRef, useState } from 'react'
import { Download, FileText, UploadCloud, X } from 'lucide-react'
import { Button, Card, ErrorBox, SectionTitle, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { batchPredict } from '../api/client'
import { downloadBlob } from '../utils/helpers'

export default function BatchPage() {
  const [file, setFile] = useState(null)
  const [done, setDone] = useState(false)
  const [summary, setSummary] = useState(null)
  const [results, setResults] = useState([])
  const fileRef = useRef()
  const batchApi = useApi(batchPredict)

  function parseCsvLine(line) {
    const matches = line.match(/("([^"]|"")*"|[^,]+)/g) || []
    return matches.map((val) => {
      const trimmed = val.trim()
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"')
      }
      return trimmed
    })
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) return []
    const headers = parseCsvLine(lines[0])
    return lines.slice(1).map((line) => {
      const cols = parseCsvLine(line)
      const row = {}
      headers.forEach((h, i) => {
        row[h] = cols[i]
      })
      return row
    })
  }

  function normalizeRow(row) {
    const numeric = new Set(['tenure', 'MonthlyCharges', 'TotalCharges'])
    const normalized = {}
    Object.entries(row).forEach(([k, v]) => {
      if (numeric.has(k)) {
        const num = v === '' ? null : Number(v)
        normalized[k] = Number.isNaN(num) ? null : num
        return
      }
      if (k === 'SeniorCitizen') {
        if (v === '1' || v === 1) normalized[k] = 1
        else if (v === '0' || v === 0) normalized[k] = 0
        else normalized[k] = v
        return
      }
      normalized[k] = v
    })
    return normalized
  }

  function handleFileDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0]
    if (f && f.name.endsWith('.csv')) {
      setFile(f)
      setDone(false)
      setSummary(null)
      setResults([])
    }
  }

  async function handleRun() {
    if (!file) return
    const text = await file.text()
    const rows = parseCsv(text).map(normalizeRow)
    const res = await batchApi.run(rows)
    if (res) {
      setSummary(res.summary)
      setResults(res.results || [])
      setDone(true)
      const csvLines = [
        ['index', 'churn_probability', 'churn_prediction', 'risk_tier'].join(','),
        ...res.results.map((r) => [
          r.index,
          r.churn_probability,
          r.churn_prediction,
          r.risk_tier,
        ].join(',')),
      ]
      const out = new Blob([csvLines.join('\n')], { type: 'text/csv' })
      downloadBlob(out, 'churnguard_predictions.csv')
    }
  }

  function clearFile() {
    setFile(null)
    setDone(false)
    setSummary(null)
    setResults([])
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <Card>
        <SectionTitle sub="Upload a customer CSV and get predictions for all rows">
          Batch Prediction
        </SectionTitle>

        <div
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${file ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '3rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? 'var(--success-dim)' : 'var(--bg-elevated)',
            marginBottom: '1.5rem',
          }}
        >
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileDrop} />

          {file ? (
            <div>
              <FileText size={40} style={{ color: 'var(--success)', marginBottom: '0.75rem' }} />
              <div style={{ color: 'var(--text-primary)' }}>{file.name}</div>
            </div>
          ) : (
            <div>
              <UploadCloud size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
              <div style={{ color: 'var(--text-primary)' }}>Drop your CSV here, or click to browse</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button onClick={handleRun} loading={batchApi.loading} disabled={!file} size="lg" style={{ flex: 1 }}>
            {batchApi.loading ? (
              <>
                <Spinner size={16} /> Processing...
              </>
            ) : (
              <>
                <UploadCloud size={16} /> Run Batch Predictions
              </>
            )}
          </Button>

          {file && (
            <Button variant="ghost" onClick={clearFile} size="lg">
              <X size={16} /> Clear
            </Button>
          )}
        </div>

        <ErrorBox message={batchApi.error} />

        {summary && (
          <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[
              { label: 'Total', value: summary.total, color: 'var(--text-primary)' },
              { label: 'High Risk', value: summary.high_risk, color: 'var(--risk-high)' },
              { label: 'Medium Risk', value: summary.medium_risk, color: 'var(--risk-med)' },
              { label: 'Low Risk', value: summary.low_risk, color: 'var(--risk-low)' },
            ].map((kpi) => (
              <div key={kpi.label} style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        )}

        {summary && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Avg churn probability: <strong style={{ color: 'var(--text-primary)' }}>{summary.avg_churn_probability}</strong>
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: '1.25rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Index', 'Probability', 'Prediction', 'Risk'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '0.5rem 0.75rem',
                      color: 'var(--text-muted)', fontFamily: 'var(--font-display)',
                      fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{row.index}</td>
                    <td style={{ padding: '0.625rem 0.75rem', fontFamily: 'var(--font-mono)' }}>{row.churn_probability}</td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>{row.churn_prediction ? 'Will Churn' : 'Retained'}</td>
                    <td style={{ padding: '0.625rem 0.75rem', color: row.risk_tier === 'High' ? 'var(--risk-high)' : row.risk_tier === 'Medium' ? 'var(--risk-med)' : 'var(--risk-low)', fontWeight: 600 }}>{row.risk_tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {done && (
          <div className="animate-slideUp" style={{ marginTop: '1rem', color: 'var(--success)' }}>
            <Download size={18} /> Download started: churnguard_predictions.csv
          </div>
        )}
      </Card>
    </div>
  )
}
