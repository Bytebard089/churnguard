// src/pages/WhatIfPage.jsx
// What-If Simulator — proper side-by-side comparison UI
// Shows original vs modified prediction with delta, color-coded change bars,
// and a human-readable intervention summary.

import React, { useEffect, useState } from 'react'
import { GitCompare, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Button, Card, ErrorBox, SectionTitle, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { getSample, whatif } from '../api/client'
import { fmtPct, riskColor } from '../utils/helpers'

const OVERRIDE_FIELDS = [
  {
    field: 'Contract',
    label: 'Contract Type',
    options: ['Month-to-month', 'One year', 'Two year'],
    icon: '📄',
    tip: 'Upgrading contract is the #1 churn reducer',
  },
  {
    field: 'PaymentMethod',
    label: 'Payment Method',
    options: [
      'Electronic check',
      'Mailed check',
      'Bank transfer (automatic)',
      'Credit card (automatic)',
    ],
    icon: '💳',
    tip: 'Auto-pay reduces churn risk significantly',
  },
  {
    field: 'InternetService',
    label: 'Internet Service',
    options: ['DSL', 'Fiber optic', 'No'],
    icon: '🌐',
    tip: 'Fiber optic with no security is high risk',
  },
  {
    field: 'OnlineSecurity',
    label: 'Online Security',
    options: ['Yes', 'No', 'No internet service'],
    icon: '🔒',
    tip: 'Adding security reduces churn for fiber users',
  },
  {
    field: 'TechSupport',
    label: 'Tech Support',
    options: ['Yes', 'No', 'No internet service'],
    icon: '🛟',
    tip: 'Customers with tech support churn less',
  },
]

function DeltaBar({ original, modified }) {
  const delta = modified - original
  const absDelta = Math.abs(delta)
  const improved = delta < 0

  if (absDelta < 0.001)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--text-muted)',
          fontSize: '0.8rem',
        }}
      >
        <Minus size={14} /> No change
      </div>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: improved ? 'var(--risk-low)' : 'var(--risk-high)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '1.1rem',
        }}
      >
        {improved ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
        {improved ? '' : '+'}
        {(delta * 100).toFixed(1)}% churn probability
      </div>
      <div
        style={{
          fontSize: '0.8125rem',
          padding: '0.4rem 0.75rem',
          borderRadius: '6px',
          background: improved ? 'var(--risk-low-bg)' : 'var(--risk-high-bg)',
          color: improved ? 'var(--risk-low)' : 'var(--risk-high)',
          border: `1px solid ${improved ? 'var(--risk-low)' : 'var(--risk-high)'}`,
          fontWeight: 600,
        }}
      >
        {improved
          ? `✓ ${(absDelta * 100).toFixed(1)}pp reduction — recommend this intervention`
          : `⚠ Risk increased by ${(absDelta * 100).toFixed(1)}pp — avoid this change`}
      </div>
    </div>
  )
}

function ProbBar({ value, label, highlight }) {
  const color =
    value >= 0.65
      ? 'var(--risk-high)'
      : value >= 0.35
      ? 'var(--risk-med)'
      : 'var(--risk-low)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontFamily: 'var(--font-display)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.25rem',
            fontWeight: 800,
            color: highlight ? color : 'var(--text-secondary)',
          }}
        >
          {fmtPct(value)}
        </span>
      </div>
      <div
        style={{
          height: '8px',
          background: 'var(--bg-elevated)',
          borderRadius: '99px',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${value * 100}%`,
            background: color,
            borderRadius: '99px',
            transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      </div>
    </div>
  )
}

function RiskTag({ tier }) {
  return (
    <span
      style={{
        fontSize: '0.75rem',
        padding: '0.2rem 0.625rem',
        borderRadius: '99px',
        background:
          tier === 'High'
            ? 'var(--risk-high-bg)'
            : tier === 'Low'
            ? 'var(--risk-low-bg)'
            : 'var(--risk-med-bg)',
        color: riskColor(tier),
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        border: `1px solid ${riskColor(tier)}`,
        letterSpacing: '0.04em',
      }}
    >
      {tier} Risk
    </span>
  )
}

export default function WhatIfPage() {
  const [baseCustomer, setBaseCustomer] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [result, setResult] = useState(null)
  const [touched, setTouched] = useState({})

  const sampleApi = useApi(getSample)
  const whatifApi = useApi(whatif)

  useEffect(() => {
    sampleApi.run().then((s) => {
      if (s) setBaseCustomer(s)
    })
  }, [])

  // Clear results when overrides reset to original values
  useEffect(() => {
    if (!baseCustomer) return
    const changed = Object.keys(overrides).some(
      (k) => overrides[k] !== baseCustomer?.[k]
    )
    if (!changed) setResult(null)
  }, [baseCustomer, overrides])

  function handleOverride(field, value) {
    setOverrides((prev) => ({ ...prev, [field]: value }))
    setTouched((prev) => ({ ...prev, [field]: true }))
    setResult(null)
  }

  async function handleSimulate() {
    if (!baseCustomer) return
    const res = await whatifApi.run(baseCustomer, overrides)
    if (res) setResult(res)
  }

  function handleReset() {
    sampleApi.run().then((s) => {
      if (s) {
        setBaseCustomer(s)
        setOverrides({})
        setTouched({})
        setResult(null)
      }
    })
  }

  const changedCount = Object.keys(overrides).filter(
    (k) => overrides[k] !== baseCustomer?.[k]
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 800,
          }}
        >
          What-If Simulator
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            marginTop: '0.25rem',
          }}
        >
          Change customer parameters and see how churn probability responds in
          real time
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left: Scenario Editor */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
            }}
          >
            <SectionTitle sub="Tweak fields below — then run simulation">
              Scenario Editor
            </SectionTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              loading={sampleApi.loading}
            >
              <RefreshCw size={14} /> Reset
            </Button>
          </div>

          {/* Current customer context */}
          {baseCustomer && (
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem 1.25rem',
              }}
            >
              <span>
                📅 Tenure:{' '}
                <b style={{ color: 'var(--text-primary)' }}>
                  {baseCustomer.tenure}mo
                </b>
              </span>
              <span>
                💰 Monthly:{' '}
                <b style={{ color: 'var(--text-primary)' }}>
                  ${baseCustomer.MonthlyCharges}
                </b>
              </span>
              <span>
                📡 Internet:{' '}
                <b style={{ color: 'var(--text-primary)' }}>
                  {baseCustomer.InternetService}
                </b>
              </span>
              <span>
                📝 Contract:{' '}
                <b style={{ color: 'var(--text-primary)' }}>
                  {baseCustomer.Contract}
                </b>
              </span>
            </div>
          )}

          {/* Override fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {OVERRIDE_FIELDS.map(({ field, label, options, icon, tip }) => {
              const currentVal = overrides[field] ?? baseCustomer?.[field] ?? ''
              const originalVal = baseCustomer?.[field]
              const changed = currentVal !== originalVal

              return (
                <div
                  key={field}
                  style={{
                    padding: '0.875rem 1rem',
                    border: `1px solid ${changed ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: changed
                      ? 'var(--accent-glow)'
                      : 'var(--bg-elevated)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <label
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      {icon} {label}
                    </label>
                    {changed && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          background: 'var(--accent)',
                          color: '#0a0b0e',
                          padding: '0.1rem 0.5rem',
                          borderRadius: '99px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-display)',
                        }}
                      >
                        CHANGED
                      </span>
                    )}
                  </div>
                  <select
                    value={currentVal}
                    onChange={(e) => handleOverride(field, e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.875rem',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.35rem',
                    }}
                  >
                    💡 {tip}
                  </p>
                </div>
              )
            })}
          </div>

          <Button
            onClick={handleSimulate}
            loading={whatifApi.loading}
            disabled={!baseCustomer || changedCount === 0}
            size="lg"
            style={{ width: '100%', marginTop: '1.25rem' }}
          >
            <GitCompare size={16} />{' '}
            {whatifApi.loading
              ? 'Simulating...'
              : `Run Simulation (${changedCount} change${changedCount !== 1 ? 's' : ''})`}
          </Button>
          {changedCount === 0 && (
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                marginTop: '0.5rem',
              }}
            >
              Change at least one field above to enable simulation
            </p>
          )}
          <ErrorBox message={whatifApi.error} />
        </Card>

        {/* Right: Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {whatifApi.loading && (
            <Card style={{ textAlign: 'center', padding: '3rem' }}>
              <Spinner size={32} />
              <div
                style={{
                  marginTop: '1rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem',
                }}
              >
                Running ensemble inference on both scenarios...
              </div>
            </Card>
          )}

          {!whatifApi.loading && result && (
            <>
              {/* Probability comparison */}
              <Card>
                <SectionTitle sub="Before vs after your changes">
                  Churn Probability Comparison
                </SectionTitle>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                  }}
                >
                  <ProbBar
                    value={result.original_probability}
                    label="Original"
                    highlight={false}
                  />
                  <ProbBar
                    value={result.modified_probability}
                    label="Modified"
                    highlight={true}
                  />
                  <DeltaBar
                    original={result.original_probability}
                    modified={result.modified_probability}
                  />
                </div>
              </Card>

              {/* Risk tier comparison */}
              <Card>
                <SectionTitle sub="Risk classification change">
                  Risk Tier Impact
                </SectionTitle>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Before
                    </span>
                    <RiskTag tier={result.original_risk_tier} />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: riskColor(result.original_risk_tier),
                      }}
                    >
                      {fmtPct(result.original_probability)}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '1.5rem',
                      color: 'var(--text-muted)',
                      padding: '0 0.5rem',
                    }}
                  >
                    →
                  </div>

                  <div
                    style={{
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      After
                    </span>
                    <RiskTag tier={result.modified_risk_tier} />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: riskColor(result.modified_risk_tier),
                      }}
                    >
                      {fmtPct(result.modified_probability)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Changes applied */}
              <Card>
                <SectionTitle sub="What was changed in this simulation">
                  Applied Changes
                </SectionTitle>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                  }}
                >
                  {Object.entries(result.overrides || overrides).map(
                    ([field, newVal]) => {
                      const oldVal = baseCustomer?.[field]
                      return (
                        <div
                          key={field}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.625rem 0.875rem',
                            background: 'var(--bg-elevated)',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          <span
                            style={{
                              flex: '0 0 120px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                            }}
                          >
                            {field}
                          </span>
                          <span
                            style={{
                              color: 'var(--text-secondary)',
                              textDecoration: 'line-through',
                            }}
                          >
                            {String(oldVal)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>→</span>
                          <span
                            style={{
                              color: 'var(--accent)',
                              fontWeight: 600,
                            }}
                          >
                            {String(newVal)}
                          </span>
                        </div>
                      )
                    }
                  )}
                </div>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.75rem',
                  }}
                >
                  Latency: {result.latency_ms}ms · 5-fold ensemble inference
                </p>
              </Card>
            </>
          )}

          {!whatifApi.loading && !result && (
            <Card
              style={{
                textAlign: 'center',
                padding: '3rem',
                border: '1px dashed var(--border)',
              }}
            >
              <GitCompare
                size={40}
                style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}
              />
              <div
                style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}
              >
                Adjust fields on the left and click{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>
                  Run Simulation
                </strong>{' '}
                to compare scenarios.
              </div>
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  marginTop: '0.75rem',
                }}
              >
                Try: Contract Month-to-month → Two year
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
