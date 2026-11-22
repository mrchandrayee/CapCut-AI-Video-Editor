import React, { useState, useEffect } from 'react'
import '@fontsource/noto-sans-devanagari/400.css'
import '@fontsource/noto-sans-devanagari/700.css'
import '@fontsource/hind/400.css'
import '@fontsource/hind/700.css'
import '@fontsource/baloo-bhaijaan-2/400.css'
import '@fontsource/baloo-bhaijaan-2/800.css'
import { FONT_LIST } from '../lib/fonts.js'

const SPEAKERS = [
  { value: 'default', label: 'Default (Divya, Female)' },
  { value: 'warm', label: 'Warm (Divya, Friendly)' },
  { value: 'formal', label: 'Formal (Rohit, Male)' },
]

const MODELS = [
  { value: 'lance-3b', label: 'Lance 3B (Fastest, 16GB)' },
  { value: 'cogvideox-2b', label: 'CogVideoX 2B (Balanced)' },
  { value: 'wan-5b', label: 'Wan 2.2 5B (High Quality)' },
]

// Hindi / Devanagari-compatible fonts from the Cutflow font system
const HINDI_FONTS = [
  { id: 'noto-sans-devanagari', name: 'Noto Sans Devanagari', family: 'Noto Sans Devanagari' },
  { id: 'hind', name: 'Hind', family: 'Hind' },
  { id: 'baloo', name: 'Baloo Bhaijaan 2', family: 'Baloo Bhaijaan 2' },
  // Latin fallback that also renders Devanagari via system fallback
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat' },
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
  const [selectedFont, setSelectedFont] = useState('noto-sans-devanagari')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setScript(project.script || '')
  }, [project.id])

  const isWorkflowB = project.workflow_type === 'audio_to_video'
  const ratio = devanagariRatio(script)

  // Compute CSS font-family from selected font
  const activeFontFamily = HINDI_FONTS.find((f) => f.id === selectedFont)?.family || 'Noto Sans Devanagari'

  async function handleRun() {
    setRunning(true)
    setError('')
    try {
      const res = await fetch(`/api/pipeline/${project.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, quality, speaker, language }),
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
                <span className="lang-ratio" title="Devanagari character ratio">
                  {Math.round(ratio * 100)}% Devanagari
                </span>
              )}
            </div>
          </div>
          <textarea
            className="textarea script-textarea"
            style={{ fontFamily: `"${activeFontFamily}", serif`, fontSize: '1.05rem', lineHeight: 1.7 }}
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
        <div className="form-group form-group-inline">
          <label>Script Font</label>
          <select
            className="select"
            value={selectedFont}
            onChange={(e) => setSelectedFont(e.target.value)}
          >
            {HINDI_FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `"${f.family}", serif` }}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {!isWorkflowB && (
          <>
            <div className="form-group form-group-inline">
              <label>Voice / Speaker</label>
              <select className="select" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                {SPEAKERS.map((s) => (
                  <option key={s.value + s.label} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group form-group-inline">
              <label>Language</label>
              <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="en-IN">English India (en-IN)</option>
              </select>
            </div>
          </>
        )}

        <div className="form-group form-group-inline">
          <label>Video Model</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group form-group-inline">
          <label>Quality</label>
          <select className="select" value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="draft">Draft (720p, Fast)</option>
            <option value="final">Final (1080p, Slow)</option>
          </select>
        </div>
      </div>
    </div>
  )
}
