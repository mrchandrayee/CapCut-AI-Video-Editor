import React, { useState, useEffect, useRef } from 'react'
import { Card } from '../ui/index.js'

const SERVICES = [
  {
    key: 'videostudio',
    label: 'Video Engine',
    port: 47872,
    healthUrl: 'http://localhost:47872/api/catalog',
  },
  {
    key: 'vexyl-tts',
    label: 'Voice Engine',
    port: 7700,
    healthUrl: 'http://localhost:7700/health',
  },
  {
    key: 'backend',
    label: 'Studio Backend',
    port: 8765,
    healthUrl: 'http://localhost:8765/api/health',
  },
]

const POLL_INTERVAL = 5000

export default function Settings() {
  const [health, setHealth] = useState({})
  const [restarting, setRestarting] = useState({})
  const intervalRef = useRef(null)

  async function checkAll() {
    const results = {}
    await Promise.all(
      SERVICES.map(async (svc) => {
        const start = Date.now()
        try {
          const res = await fetch(svc.healthUrl, { signal: AbortSignal.timeout(3000) })
          results[svc.key] = { ok: res.ok, latency: Date.now() - start }
        } catch {
          results[svc.key] = { ok: false, latency: null }
        }
      })
    )
    setHealth(results)
  }

  useEffect(() => {
    checkAll()
    intervalRef.current = setInterval(checkAll, POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [])

  async function handleRestart(key) {
    setRestarting((prev) => ({ ...prev, [key]: true }))
    try {
      await window.electron?.restartService?.(key)
    } catch (err) {
      console.error('[Settings] restartService error:', err)
    }
    // Give the service 3 s to restart, then re-check
    setTimeout(() => {
      setRestarting((prev) => ({ ...prev, [key]: false }))
      checkAll()
    }, 3000)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Settings</h2>
        <button className="btn btn-secondary" onClick={checkAll}>
          🔄 Refresh
        </button>
      </div>

      <section className="settings-section">
        <h3>Service Health</h3>
        {SERVICES.map((svc) => {
          const status = health[svc.key]
          const isOk = status?.ok === true
          const isPending = status === undefined

          return (
            <Card
              key={svc.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: isPending ? '#888' : isOk ? '#22c55e' : '#ef4444',
                  boxShadow: isPending ? 'none' : isOk
                    ? '0 0 6px #22c55e'
                    : '0 0 6px #ef4444',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{svc.label}</div>
                <div style={{ color: '#666', fontSize: '0.75rem' }}>
                  Port {svc.port}
                  {status?.latency != null && ` · ${status.latency}ms`}
                  {!isPending && !isOk && ' · Offline'}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                disabled={restarting[svc.key]}
                onClick={() => handleRestart(svc.key)}
              >
                {restarting[svc.key] ? '⏳' : 'Restart'}
              </button>
            </Card>
          )
        })}
      </section>

      <section className="settings-section">
        <h3>About</h3>
        <p style={{ color: '#888', fontSize: '0.85rem', lineHeight: 1.6 }}>
          DRISHQAN (Drishya + Creation) runs entirely on your Mac. No cloud services, no API keys.
          <br />
          Video Engine (Lance 3B / LTX-Video / Wan 2.2 / CogVideoX) · Port 47872
          <br />
          Voice Engine (ai4bharat/indic-parler-tts, 22 Indian languages) · Port 7700
          <br />
          Studio Backend (orchestration &amp; project management) · Port 8765
        </p>
      </section>
    </div>
  )
}
