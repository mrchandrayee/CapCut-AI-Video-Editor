import React, { useState, useEffect } from 'react'

const SPEAKERS = [
  { value: 'default', label: 'Default (Divya, Female)' },
  { value: 'warm', label: 'Warm (Divya, Friendly)' },
  { value: 'formal', label: 'Formal (Rohit, Male)' },
]

const LANGUAGE_HINTS = [
  { value: 'hi-IN', label: 'Hindi (हिंदी)' },
  { value: 'hi-IN', label: 'Hinglish (mix)' },
  { value: 'en-IN', label: 'English (en-IN)' },
]

const MODELS = [
  { value: 'lance-3b', label: 'Lance 3B (Fastest, 16GB)' },
  { value: 'cogvideox-2b', label: 'CogVideoX 2B (Balanced)' },
  { value: 'wan-5b', label: 'Wan 2.2 5B (High Quality)' },
]

// Count Devanagari characters
function devanagariRatio(text) {
  if (!text) return 0
  const devChars = (text.match(/[\u0900-\u097F]/g) || []).length
  return devChars / Math.max(text.length, 1)
}

export default function ScriptEditor({ project, onUpdate, onRunPipeline }) {
  const [script, setScript] = useState(project.script || '')
  const [speaker, setSpeaker] = useState('default')
  const [language, setLanguage] = useState('hi-IN')
  const [model, setModel] = useState('lance-3b')
  const [quality, setQuality] = useState('final')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setScript(project.script || '')
  }, [project.id])

  const isWorkflowB = project.workflow_type === 'audio_to_video'
  const ratio = devanagariRatio(script)

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      // Update script via pipeline body is not needed; we save it via re-create or an edit.
      // For simplicity we patch the project by deleting and re-creating is not ideal,
      // so we just store it in state and pass to the run endpoint.
      setSaving(false)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleRun() {
    setRunning(true)
    setError('')
    try {
      const res = await fetch(`/api/pipeline/${project.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          quality,
          speaker,
          language,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to start pipeline')
      }
      onRunPipeline()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{project.name}</h2>
          <span className="badge badge-workflow">
            {isWorkflowB ? 'Workflow B: Audio → Video' : 'Workflow A: Script → Video'}
          </span>
        </div>
        <div className="panel-header-actions">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={running || (!script.trim() && !isWorkflowB)}
          >
            {running ? '⏳ Starting...' : '▶ Generate Video'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {!isWorkflowB && (
        <div className="form-group">
          <div className="script-header">
            <label>Script</label>
            <div className="script-meta">
              <span className="char-count">{script.length} characters</span>
              {script.length > 0 && (
                <span
                  className="lang-ratio"
                  title="Devanagari character ratio"
                >
                  {Math.round(ratio * 100)}% Devanagari
                </span>
              )}
            </div>
          </div>
          <textarea
            className="textarea devanagari script-textarea"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="यहाँ अपनी हिंदी / Hinglish स्क्रिप्ट लिखें...&#10;&#10;Example:&#10;नमस्ते, आज हम एक खूबसूरत सफर पर जाएंगे।&#10;यह वीडियो भारत की संस्कृति और परंपराओं के बारे में है।"
            rows={16}
          />
        </div>
      )}

      {isWorkflowB && (
        <div className="workflow-b-info">
          <div className="info-item">
            <span className="info-label">Audio File:</span>
            <span className="info-value monospace">{project.audio_path || '—'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">SRT File:</span>
            <span className="info-value monospace">{project.srt_path || '—'}</span>
          </div>
        </div>
      )}

      <div className="settings-row">
        {!isWorkflowB && (
          <>
            <div className="form-group form-group-inline">
              <label>Voice / Speaker</label>
              <select
                className="select"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              >
                {SPEAKERS.map((s) => (
                  <option key={s.value + s.label} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group form-group-inline">
              <label>Language</label>
              <select
                className="select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="en-IN">English India (en-IN)</option>
              </select>
            </div>
          </>
        )}

        <div className="form-group form-group-inline">
          <label>Video Model</label>
          <select
            className="select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group form-group-inline">
          <label>Quality</label>
          <select
            className="select"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
          >
            <option value="draft">Draft (720p, Fast)</option>
            <option value="final">Final (1080p, Slow)</option>
          </select>
        </div>
      </div>
    </div>
  )
}
