import React, { useEffect, useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'
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

  const predictApi = useApi(predictCall)
  const sampleApi = useApi(getSample)
  const featApi = useApi(getFeatures)

  useEffect(() => {
    async function loadData() {
      const defs = await featApi.run()
      if (defs && defs.length > 0) {
        setFields(defs)
        const defaults = {}
        defs.forEach((f) => {
          defaults[f.field] = f.default ?? ''
        })
        setValues(defaults)
      }

      const sample = await sampleApi.run()
      if (sample) setValues(sample)
    }

    loadData()
  }, [])

  function handleChange(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  async function handlePredict() {
    const res = await predictApi.run(values)
    if (res) setResult(res)
  }

  async function handleLoadSample() {
    const sample = await sampleApi.run()
    if (sample) setValues(sample)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1.5rem', alignItems: 'start' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <SectionTitle sub="Fill in customer details to predict churn probability">
            Customer Profile
          </SectionTitle>
          <Button variant="ghost" size="sm" onClick={handleLoadSample} loading={sampleApi.loading}>
            <RefreshCw size={14} />
            Load Sample
          </Button>
        </div>

        {featApi.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Spinner />
          </div>
        ) : (
          <CustomerForm fields={fields} values={values} onChange={handleChange} />
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <Button onClick={handlePredict} loading={predictApi.loading} size="lg" style={{ flex: 1 }}>
            <Zap size={16} />
            {predictApi.loading ? 'Predicting...' : 'Predict Churn'}
          </Button>
        </div>

        <ErrorBox message={predictApi.error} />
      </Card>

      <div>
        {predictApi.loading && (
          <Card style={{ textAlign: 'center', padding: '3rem' }}>
            <Spinner size={32} />
            <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Running ensemble inference...
            </div>
          </Card>
        )}

        {!predictApi.loading && result && (
          <Card>
            <SectionTitle sub="Ensemble result from 5 fold models">
              Prediction Result
            </SectionTitle>
            <PredictionResult result={result} />
          </Card>
        )}

        {!predictApi.loading && !result && (
          <Card style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Fill in the form and click <strong style={{ color: 'var(--text-secondary)' }}>Predict Churn</strong> to see results.
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
