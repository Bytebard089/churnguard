import React, { useEffect, useState } from 'react'
import { GitCompare, RefreshCw } from 'lucide-react'
import { Button, Card, ErrorBox, SectionTitle, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { getSample, whatif } from '../api/client'

const OVERRIDE_FIELDS = [
  { field: 'Contract', options: ['Month-to-month', 'One year', 'Two year'] },
  { field: 'PaymentMethod', options: ['Electronic check', 'Mailed check', 'Bank transfer (automatic)', 'Credit card (automatic)'] },
  { field: 'InternetService', options: ['DSL', 'Fiber optic', 'No'] },
  { field: 'OnlineSecurity', options: ['Yes', 'No', 'No internet service'] },
  { field: 'TechSupport', options: ['Yes', 'No', 'No internet service'] },
]

export default function WhatIfPage() {
  const [baseCustomer, setBaseCustomer] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [result, setResult] = useState(null)

  const sampleApi = useApi(getSample)
  const whatifApi = useApi(whatif)

  useEffect(() => {
    sampleApi.run().then((s) => {
      if (s) setBaseCustomer(s)
    })
  }, [])

  function handleOverride(field, value) {
    setOverrides((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSimulate() {
    if (!baseCustomer || Object.keys(overrides).length === 0) return
    const res = await whatifApi.run(baseCustomer, overrides)
    if (res) setResult(res)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <SectionTitle sub="Change fields and compare prediction change">Scenario Editor</SectionTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => sampleApi.run().then((s) => {
              if (s) {
                setBaseCustomer(s)
                setOverrides({})
                setResult(null)
              }
            })}
            loading={sampleApi.loading}
          >
            <RefreshCw size={14} /> Reset
          </Button>
        </div>

        <div style={{ display: 'grid', gap: '0.875rem', marginBottom: '1.25rem' }}>
          {OVERRIDE_FIELDS.map(({ field, options }) => (
            <div key={field} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', alignItems: 'center' }}>
              <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{field}</label>
              <select value={overrides[field] ?? (baseCustomer?.[field] ?? '')} onChange={(e) => handleOverride(field, e.target.value)}>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <Button onClick={handleSimulate} loading={whatifApi.loading} disabled={!baseCustomer} size="lg" style={{ width: '100%' }}>
          <GitCompare size={16} /> {whatifApi.loading ? 'Simulating...' : 'Run Simulation'}
        </Button>
        <ErrorBox message={whatifApi.error} />
      </Card>

      <div>
        {whatifApi.loading && (
          <Card style={{ textAlign: 'center', padding: '3rem' }}>
            <Spinner size={32} />
          </Card>
        )}

        {!whatifApi.loading && result && (
          <Card>
            <SectionTitle sub="Original vs modified">Simulation Result</SectionTitle>
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  )
}
