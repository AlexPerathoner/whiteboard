import { useCallback, useEffect, useState } from 'react'

/**
 * Two routes and no query strings, so a router dependency would be all cost
 * and no benefit.
 */
export function navigate(path: string) {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
}

export function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  return path
}

/** `/b/:id` -> the board id, otherwise null (the dashboard). */
export function boardIdFromPath(path: string): string | null {
  const m = path.match(/^\/b\/([^/]+)$/)
  return m ? m[1] : null
}

export function useNavigate() {
  return useCallback(navigate, [])
}
