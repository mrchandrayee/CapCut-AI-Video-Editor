import React, { useState, useEffect, useRef, useCallback } from 'react'
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

const HINDI_FONTS = [
  { id: 'noto-sans-devanagari', name: 'Noto Sans Devanagari', family: 'Noto Sans Devanagari' },
  { id: 'hind', name: 'Hind', family: 'Hind' },
  { id: 'baloo', name: 'Baloo Bhaijaan 2', family: 'Baloo Bhaijaan 2' },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat' },
]

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
  const [saveStatus, setSaveStatus] = useState('saved') // saved | unsaved | saving | error
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const autosaveTimerRef = useRef(null)

  useEffect(() => {
    setScript(project.script || '')
    setSaveStatus('saved')
  }, [project.id])

  const isWorkflowB = project.workflow_type === 'audio_to_video'
  const ratio = devanagariRatio(script)
  const activeFontFamily = HINDI_FONTS.find((f) => f.id === selectedFont)?.family || 'Noto Sans Devanagari'

  // Explicit Save to Backend
  const saveScript = useCallback(async (textToSave) => {
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: textToSave }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to save project script')
      }
      const data = await res.json()
      setSaveStatus('saved')
      if (onUpdate && data.project) {
        onUpdate(data.project)
      }
      return true
    } catch (err) {
      console.error('Save error:', err)
      setSaveStatus('error')
      setError(err.message)
      return false
    }
  }, [project.id, onUpdate])

  // Handle textarea change with autosave debounce (1200ms)
  function handleScriptChange(e) {
    const nextText = e.target.value
    setScript(nextText)
    setSaveStatus('unsaved')

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = setTimeout(() => {
      saveScript(nextText)
    }, 1200)
  }

  // Cleanup autosave timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])

  async function handleRun() {
    setRunning(true)
    setError('')

    // Always ensure latest script is saved before running pipeline
    if (saveStatus !== 'saved' && !isWorkflowB) {
      const saved = await saveScript(script)
      if (!saved) {
        setRunning(false)
        return
      }
    }

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
        <div className="panel-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isWorkflowB && (
            <div className="save-status-indicator" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {saveStatus === 'saved' && <span style={{ color: '#10b981' }}>✓ Saved</span>}
              {saveStatus === 'unsaved' && <span style={{ color: '#f59e0b' }}>● Unsaved changes</span>}
              {saveStatus === 'saving' && <span style={{ color: '#60a5fa' }}>⏳ Saving...</span>}
              {saveStatus === 'error' && <span style={{ color: '#ef4444' }}>⚠️ Save error</span>}
            </div>
          )}
          {!isWorkflowB && (
            <button
              className="btn btn-secondary"
              onClick={() => saveScript(script)}
              disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              title="Manual Save"
            >
              💾 Save
            </button>
          )}
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
            onChange={handleScriptChange}
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
