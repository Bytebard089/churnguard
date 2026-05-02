// src/components/CustomerForm.jsx
// Dynamically renders the form from the /features API endpoint.
// Groups fields by category. Handles select + number inputs.

import React from 'react'
import { groupBy } from '../utils/helpers'

// Field group order
const GROUP_ORDER = ['Account', 'Charges', 'Demographics', 'Services']

function FormField({ field, value, onChange }) {
  if (field.type === 'number') {
    return (
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.field === 'tenure' ? 1 : 0.01}
        value={values[field.field] ?? field.default ?? ''}
        onChange={e => {
          const raw = e.target.value
          onChange(field.field, raw === '' ? '' : Number(raw))
        }}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <select value={values[field.field] ?? field.default ?? ''} onChange={e => {
        // SeniorCitizen is 0/1 integer
        let v = e.target.value
        if (Array.isArray(field.options) && typeof field.options[0] === 'number') {
          v = Number(v)
        }
        onChange(field.field, v)
      }}>
        {(field.options || []).map((opt, i) => (
          <option key={i} value={opt}>
            {field.optionLabels ? field.optionLabels[i] : String(opt)}
          </option>
        ))}
      </select>
    )
  }

  return null
}

export default function CustomerForm({ fields, values, onChange }) {
  if (!fields || fields.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>
        Loading form fields…
      </div>
    )
  }

  const grouped = groupBy(fields, f => f.group)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {GROUP_ORDER.map(group => {
        const groupFields = grouped[group]
        if (!groupFields) return null
        return (
          <div key={group}>
            {/* Group header */}
            <div style={{
              display:       'flex',
              alignItems:    'center',
              gap:           '0.625rem',
              marginBottom:  '0.875rem',
            }}>
              <span style={{
                fontSize:      '0.6875rem',
                fontFamily:    'var(--font-display)',
                fontWeight:    700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         'var(--text-muted)',
              }}>
                {group}
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            {/* Fields grid */}
            <div style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap:                 '0.75rem',
            }}>
              {groupFields.map(field => (
                <div key={field.field}>
                  <label style={{
                    display:      'block',
                    fontSize:     '0.75rem',
                    color:        'var(--text-secondary)',
                    marginBottom: '0.375rem',
                    fontWeight:   500,
                  }}>
                    {field.label}
                  </label>
                  <FormField
                    field={field}
                    value={values[field.field] ?? field.default ?? ''}
                    onChange={onChange}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
