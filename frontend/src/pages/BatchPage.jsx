import React, { useRef, useState } from 'react'
import { Download, FileText, UploadCloud, X } from 'lucide-react'
import { Button, Card, ErrorBox, SectionTitle, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { batchPredict } from '../api/client'
import { downloadBlob } from '../utils/helpers'

export default function BatchPage() {
  const [file, setFile] = useState(null)
  const [done, setDone] = useState(false)
  const fileRef = useRef()
  const batchApi = useApi(batchPredict)

  function handleFileDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0]
    if (f && f.name.endsWith('.csv')) {
      setFile(f)
      setDone(false)
    }
  }

  async function handleRun() {
    if (!file) return
    const blob = await batchApi.run(file)
    if (blob) {
      setDone(true)
      downloadBlob(blob, 'churnguard_predictions.csv')
    }
  }

  function clearFile() {
    setFile(null)
    setDone(false)
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

        {done && (
          <div className="animate-slideUp" style={{ marginTop: '1rem', color: 'var(--success)' }}>
            <Download size={18} /> Download started: churnguard_predictions.csv
          </div>
        )}
      </Card>
    </div>
  )
}
