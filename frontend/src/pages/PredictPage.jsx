// PredictPage.jsx — adds risk color border on card, animated result, copy JSON button
import React, { useEffect, useState } from 'react'
import { RefreshCw, Zap, Copy, Check } from 'lucide-react'
import CustomerForm from '../components/CustomerForm'
import PredictionResult from '../components/PredictionResult'
import { Button, Card, ErrorBox, SectionTitle, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { getFeatures, getSample, predict as defaultPredict } from '../api/client'

export default function PredictPage({ predictFn }) {
  const predictCall = predictFn || defaultPredict
  const [fields, setFields] = useState([])
  const [values, setValues] = useState({})
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const predictApi = useApi(predictCall)
  const sampleApi  = useApi(getSample)
  const featApi    = useApi(getFeatures)

  async function loadFeatures() {
    const defs = await featApi.run()
    if (defs?.length) {
      setFields(defs)
      const defaults = {}
      defs.forEach(f => { defaults[f.field] = f.default ?? '' })
      setValues(prev => ({ ...defaults, ...prev }))
    }
  }

  useEffect(() => {
    async function init() {
      await loadFeatures()
      const sample = await sampleApi.run()
      if (sample) setValues(sample)
    }
    init()
  }, [])

  async function handlePredict() {
    const res = await predictApi.run(values)
    if (res) setResult(res)
  }

  async function handleLoadSample() {
    const sample = await sampleApi.run()
    if (sample) { setValues(sample); setResult(null) }
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const riskBorderColor = result
    ? result.risk_tier === 'High' ? 'var(--risk-high)'
    : result.risk_tier === 'Medium' ? 'var(--risk-med)'
    : 'var(--risk-low)'
    : 'var(--border)'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 430px', gap: '1.5rem', alignItems: 'start' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <SectionTitle sub="Fill in customer details to predict churn probability">
            Customer Profile
          </SectionTitle>
          <Button variant="ghost" size="sm" onClick={handleLoadSample} loading={sampleApi.loading}>
            <RefreshCw size={13} /> Sample
          </Button>
        </div>

        {featApi.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner /></div>
        ) : featApi.error ? (
          <div style={{ padding: '1rem 0' }}>
            <ErrorBox message={`Failed to load form: ${featApi.error}`} />
            <Button variant="secondary" size="sm" onClick={loadFeatures} style={{ marginTop: '0.75rem' }}>
              <RefreshCw size={13} /> Retry
            </Button>
          </div>
        ) : (
          <CustomerForm fields={fields} values={values} onChange={(f, v) => setValues(p => ({ ...p, [f]: v }))} />
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <Button onClick={handlePredict} loading={predictApi.loading} size="lg" style={{ flex: 1 }}>
            <Zap size={16} />
            {predictApi.loading ? 'Running ensemble…' : 'Predict Churn'}
          </Button>
        </div>
        <ErrorBox message={predictApi.error} />
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {predictApi.loading && (
          <Card style={{ textAlign: 'center', padding: '3rem' }}>
            <Spinner size={32} />
            <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Running 5-fold ensemble inference…
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
              Averaging probabilities across all folds
            </div>
          </Card>
        )}

        {!predictApi.loading && result && (
          <Card style={{ borderColor: riskBorderColor, transition: 'border-color 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <SectionTitle sub="5-fold XGBoost ensemble result">Prediction Result</SectionTitle>
              <button onClick={handleCopyJson} style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.3rem 0.625rem', borderRadius: '6px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: copied ? 'var(--success)' : 'var(--text-muted)',
                fontSize: '0.7rem', cursor: 'pointer', transition: 'color 0.2s',
              }}>
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'JSON'}
              </button>
            </div>
            <PredictionResult result={result} />
          </Card>
        )}

        {!predictApi.loading && !result && (
          <Card style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.3 }}>⚡</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              Fill in the form and click<br />
              <strong style={{ color: 'var(--text-secondary)' }}>Predict Churn</strong> to see results.
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              The result card border changes color based on risk tier.
            </div>
          </Card>
        )}

        {/* ML explainability note */}
        {result && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>How it works: </span>
            5 XGBoost models trained on independent data folds each produce a churn probability. The ensemble average reduces variance. SHAP values show which features pushed this customer's score up or down.
          </div>
        )}
      </div>
    </div>
  )
}
