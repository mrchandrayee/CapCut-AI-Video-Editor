import React, { useState, useEffect } from 'react'

export default function ExportPanel({ project, wsMessages, onUpdate }) {
  const [quality, setQuality] = useState('final')
  const [musicPath, setMusicPath] = useState('')
  const [model, setModel] = useState('lance-3b')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outputPath, setOutputPath] = useState(project.output_path || '')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setOutputPath(project.output_path || '')
    setDone(!!project.output_path)
  }, [project.id, project.output_path])

  // Listen for assembly progress
  useEffect(() => {
    if (!wsMessages.length) return
    const msg = wsMessages[wsMessages.length - 1]
    if (msg.type === 'stage_progress' && msg.stage === 'assembly') {
      setProgress(msg.progress || 0)
    }
    if (msg.type === 'stage_done' && msg.stage === 'assembly') {
      setProgress(1)
    }
    if (msg.type === 'pipeline_done') {
      setOutputPath(msg.output_path || '')
      setDone(true)
      setExporting(false)
    }
    if (msg.type === 'pipeline_error') {
      setError(msg.error || 'Pipeline failed')
      setExporting(false)
    }
  }, [wsMessages])

  async function handleExport() {
    setExporting(true)
    setError('')
    setDone(false)
    setProgress(0)
    try {
      const body = { model, quality }
      if (musicPath.trim()) body.music_path = musicPath.trim()
      const res = await fetch(`/api/pipeline/${project.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to start export')
      }
    } catch (err) {
      setError(err.message)
      setExporting(false)
    }
  }

  function handleOpenInFinder() {
    if (!outputPath) return
    // In Electron we use the exposed API; in browser we just show the path
    if (window.electronAPI?.showItemInFinder) {
      window.electronAPI.showItemInFinder(outputPath)
    } else {
      alert(`Output file location:\n${outputPath}`)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Export</h2>
          <span className="project-meta-inline">{project.name}</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {done && outputPath && (
        <div className="success-message">
          ✅ Export complete!
          <br />
          <span className="monospace">{outputPath}</span>
          <br />
          <button className="btn btn-secondary" style={{ marginTop: '8px' }} onClick={handleOpenInFinder}>
            📁 Open in Finder
          </button>
        </div>
      )}

      <div className="settings-section">
        <h3>Export Settings</h3>

        <div className="form-group">
          <label>Quality Preset</label>
          <div className="quality-toggle">
            <button
              type="button"
              className={`quality-btn ${quality === 'draft' ? 'active' : ''}`}
              onClick={() => setQuality('draft')}
            >
              <strong>Draft</strong>
              <span>720p · Fast encode</span>
            </button>
            <button
              type="button"
              className={`quality-btn ${quality === 'final' ? 'active' : ''}`}
              onClick={() => setQuality('final')}
            >
              <strong>Final</strong>
              <span>1080p · Slow encode</span>
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Video Model</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="lance-3b">Lance 3B (Fastest)</option>
            <option value="cogvideox-2b">CogVideoX 2B (Balanced)</option>
            <option value="wan-5b">Wan 2.2 5B (High Quality)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Background Music (optional)</label>
          <input
            type="text"
            className="input monospace"
            placeholder="/path/to/background.mp3"
            value={musicPath}
            onChange={(e) => setMusicPath(e.target.value)}
          />
          <span className="form-hint">Music will be mixed at -20dB (quiet background)</span>
        </div>

        {exporting && (
          <div className="form-group">
            <label>Progress</label>
            <div className="progress-bar-wrap progress-bar-large">
              <div
                className="progress-bar"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="progress-label">{Math.round(progress * 100)}%</span>
          </div>
        )}

        <div className="export-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '⏳ Exporting...' : '📤 Export Video'}
          </button>
        </div>
      </div>
    </div>
  )
}
