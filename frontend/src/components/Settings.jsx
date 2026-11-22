import React, { useState, useEffect } from 'react'

const HOW_TO_START = {
  tts: {
    title: 'Start VEXYL-TTS',
    command: 'cd /Users/chandrayee/Documents/code/ecom/multilingual/vexyl-tts-main && pip install -r requirements.txt && python vexyl_tts_server.py',
    note: 'Runs on port 8080 (or 7700 if configured). Uses ai4bharat/indic-parler-tts.',
  },
  llm: {
    title: 'Start Ollama',
    command: 'ollama serve\n# Then pull a model:\nollama pull llama3.2:3b',
    note: 'Runs on port 11434. llama3.2:3b is recommended for 24 GB M5.',
  },
  video: {
    title: 'Start Video Studio KH',
    command: 'cd /Users/chandrayee/Documents/code/ecom/multilingual/videostudio-mac-main && python -m uvicorn app.backend.main:app --host 127.0.0.1 --port 47872',
    note: 'Runs on port 47872. Lance 3B model must be downloaded first.',
  },
}

export default function Settings() {
  const [settings, setSettings] = useState({
    tts_url: 'http://localhost:7700',
    ollama_url: 'http://localhost:11434',
    video_studio_url: 'http://localhost:47872',
    default_model: 'lance-3b',
    default_quality: 'final',
    background_music_enabled: false,
  })
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      setSettings(data.settings || {})
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      setSettings(data.settings || settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleHealthCheck() {
    setHealthLoading(true)
    setHealth(null)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setHealth(data)
    } catch (err) {
      console.error('Health check failed:', err)
    } finally {
      setHealthLoading(false)
    }
  }

  function update(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Settings</h2>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saved ? '✅ Saved' : saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <section className="settings-section">
        <h3>Service URLs</h3>
        <div className="form-group">
          <label>VEXYL-TTS URL</label>
          <div className="input-row">
            <input
              type="text"
              className="input"
              value={settings.tts_url || ''}
              onChange={(e) => update('tts_url', e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Ollama URL</label>
          <input
            type="text"
            className="input"
            value={settings.ollama_url || ''}
            onChange={(e) => update('ollama_url', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Video Studio KH URL</label>
          <input
            type="text"
            className="input"
            value={settings.video_studio_url || ''}
            onChange={(e) => update('video_studio_url', e.target.value)}
          />
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleHealthCheck}
          disabled={healthLoading}
        >
          {healthLoading ? '🔄 Checking...' : '🔍 Test All Connections'}
        </button>
      </section>

      {health && (
        <section className="settings-section">
          <h3>Service Health</h3>
          <HealthRow label="VEXYL-TTS" data={health.tts} serviceKey="tts" />
          <HealthRow label="Ollama" data={health.llm} serviceKey="llm" />
          <HealthRow label="Video Studio KH" data={health.video} serviceKey="video" />
        </section>
      )}

      <section className="settings-section">
        <h3>Defaults</h3>
        <div className="form-group">
          <label>Default Video Model</label>
          <select
            className="select"
            value={settings.default_model || 'lance-3b'}
            onChange={(e) => update('default_model', e.target.value)}
          >
            <option value="lance-3b">Lance 3B (Fastest, Apple Silicon)</option>
            <option value="cogvideox-2b">CogVideoX 2B (Balanced)</option>
            <option value="wan-5b">Wan 2.2 5B (Best quality, 32GB+)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Default Quality</label>
          <select
            className="select"
            value={settings.default_quality || 'final'}
            onChange={(e) => update('default_quality', e.target.value)}
          >
            <option value="draft">Draft (720p, Fast)</option>
            <option value="final">Final (1080p, Slow)</option>
          </select>
        </div>
      </section>
    </div>
  )
}

function HealthRow({ label, data, serviceKey }) {
  const info = HOW_TO_START[serviceKey]
  if (!data) return null

  return (
    <div className={`health-row ${data.ok ? 'health-ok' : 'health-fail'}`}>
      <div className="health-row-header">
        <span className={`health-dot ${data.ok ? 'dot-green' : 'dot-red'}`} />
        <span className="health-label">{label}</span>
        {data.ok ? (
          <span className="health-detail">
            {data.latency_ms != null ? `${data.latency_ms}ms` : ''}
            {data.model ? ` · Model: ${data.model}` : ''}
          </span>
        ) : (
          <span className="health-error">{data.error}</span>
        )}
      </div>
      {!data.ok && info && (
        <div className="health-howto">
          <strong>{info.title}:</strong>
          <pre className="code-block">{info.command}</pre>
          <p className="health-note">{info.note}</p>
        </div>
      )}
    </div>
  )
}
