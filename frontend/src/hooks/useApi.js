// src/hooks/useApi.js
// Generic hook for wrapping async API calls with loading + error state.
// Usage:
//   const { run, loading, error, data } = useApi(predict)
//   await run(customerObj)

import { useState, useCallback } from 'react'

/**
 * @param {Function} apiFn  Any async function that returns data or throws
 * @returns {{ run, loading, error, data, reset }}
 */
export function useApi(apiFn) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const run = useCallback(
    async (...args) => {
      setLoading(true)
      setError(null)
      try {
        const result = await apiFn(...args)
        setData(result)
        return result
      } catch (err) {
        setError(err.message || 'Something went wrong')
        return null
      } finally {
        setLoading(false)
      }
    },
    [apiFn],
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { run, loading, error, data, reset }
}
