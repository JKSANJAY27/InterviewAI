import { useCallback, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useWebSocket() {
  const ws = useRef(null)
  const [connected, setConnected] = useState(false)
  const listeners = useRef({})

  const on = useCallback((type, fn) => {
    listeners.current[type] = fn
  }, [])

  const connect = useCallback((sessionId) => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL}/ws/${sessionId}`
    ws.current = new WebSocket(url)
    ws.current.binaryType = 'arraybuffer'

    ws.current.onopen = () => {
      setConnected(true)
      console.log('[WS] connected', url)
    }

    ws.current.onclose = () => {
      setConnected(false)
      console.log('[WS] disconnected')
    }

    ws.current.onerror = (e) => {
      console.error('[WS] error', e)
    }

    ws.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const handler = listeners.current[msg.type]
        if (handler) handler(msg)
        // Wildcard handler
        if (listeners.current['*']) listeners.current['*'](msg)
      } catch {
        // binary frame — handled separately
      }
    }
  }, [])

  const sendJson = useCallback((payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(payload))
    }
  }, [])

  const sendBinary = useCallback((buffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(buffer)
    }
  }, [])

  const disconnect = useCallback(() => {
    ws.current?.close()
  }, [])

  return { connect, disconnect, sendJson, sendBinary, connected, on }
}
