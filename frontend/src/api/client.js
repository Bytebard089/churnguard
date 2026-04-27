// src/api/client.js
// All API calls to the ChurnGuard backend go through here.
// The Vite proxy rewrites /api -> http://localhost:8000

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

async function request(method, path, body = null, isForm = false) {
  const options = {
    method,
    headers: isForm ? {} : { 'Content-Type': 'application/json' },
  }

  if (body) {
    options.body = isForm ? body : JSON.stringify(body)
  }

  const res = await fetch(`${BASE_URL}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  return res
}

export async function getHealth() {
  const res = await request('GET', '/health')
  return res.json()
}

export async function getSample() {
  const res = await request('GET', '/sample')
  return res.json()
}

export async function getFeatures() {
  const res = await request('GET', '/features')
  return res.json()
}

export async function predict(customerData) {
  const res = await request('POST', '/predict', customerData)
  return res.json()
}

export async function whatif(customerData, overrides) {
  const res = await request('POST', '/whatif', {
    customer: customerData,
    overrides,
  })
  return res.json()
}

export async function batchPredict(csvFile) {
  const form = new FormData()
  form.append('file', csvFile)
  const res = await request('POST', '/batch', form, true)
  return res.blob()
}
