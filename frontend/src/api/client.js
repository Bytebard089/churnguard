// src/api/client.js
// Centralised API client for ChurnGuard frontend.
// All requests go through axiosInstance so the base URL is set once.

import axios from 'axios'

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  'https://churnguard-api.onrender.com'

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── request interceptor: log in dev ─────────────────────────────────────────
axiosInstance.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data ?? '')
  }
  return config
})

// ─── response interceptor: normalise errors ───────────────────────────────────
axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err.response?.data?.detail ||
      err.message ||
      'Unknown API error'
    return Promise.reject(new Error(msg))
  },
)

// ─── API methods ─────────────────────────────────────────────────────────────

/**
 * Fetch a sample customer input for demo / auto-fill.
 * @returns {Promise<Object>} Raw customer fields
 */
export async function getSample() {
  const { data } = await axiosInstance.get('/sample')
  return data
}

/**
 * Fetch dynamic form field definitions.
 * @returns {Promise<Object[]>} Field definition list
 */
export async function getFeatures() {
  const { data } = await axiosInstance.get('/features')
  return data
}

/**
 * Predict churn probability for a single customer.
 * @param {Object} customer Raw CustomerInput fields
 * @returns {Promise<Object>} PredictionResponse
 */
export async function predict(customer) {
  const { data } = await axiosInstance.post('/predict', customer)
  return data
}

/**
 * Run a what-if simulation — compare original vs modified customer.
 * @param {Object} base      Original customer record
 * @param {Object} overrides Fields to change
 * @returns {Promise<Object>} WhatIfResponse
 */
export async function whatif(base, overrides) {
  const { data } = await axiosInstance.post(
    '/whatif',
    { ...base },
    { params: overrides },       // overrides sent as query params
  )
  return data
}

/**
 * POST /whatif with overrides in request body (alternative approach).
 * Used when overrides object is complex.
 */
export async function whatifPost(base, overrides) {
  const { data } = await axiosInstance.post('/whatif', base, {
    params: overrides,
  })
  return data
}

/**
 * Score a batch of customers.
 * @param {Object[]} customers Array of CustomerInput objects
 * @returns {Promise<Object>} BatchResponse
 */
export async function batchPredict(customers) {
  const { data } = await axiosInstance.post('/batch', { customers })
  return data
}

/**
 * Fetch dashboard analytics (model metrics, risk distribution, feature importance).
 * @returns {Promise<Object>} Dashboard data
 */
export async function getDashboard() {
  const { data } = await axiosInstance.get('/dashboard')
  return data
}

/**
 * Health check — useful for showing backend status in UI.
 * @returns {Promise<Object>} Health response
 */
export async function getHealth() {
  const { data } = await axiosInstance.get('/health')
  return data
}
