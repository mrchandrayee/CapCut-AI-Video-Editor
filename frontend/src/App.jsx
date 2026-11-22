import React, { useState, useRef, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ScriptEditor from './components/ScriptEditor.jsx'
import PipelineView from './components/PipelineView.jsx'
import SceneGallery from './components/SceneGallery.jsx'
import Settings from './components/Settings.jsx'
import ExportPanel from './components/ExportPanel.jsx'

const WS_BASE = 'ws://localhost:8765'

export default function App() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [view, setView] = useState('projects') // projects | editor | pipeline | gallery | settings | export
  const [wsMessages, setWsMessages] = useState([])
  const wsRef = useRef(null)

  // Load projects on mount
  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  // Connect WebSocket when a project is selected
  const connectWebSocket = useCallback((projectId) => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (!projectId) return

    const ws = new WebSocket(`${WS_BASE}/ws/${projectId}`)
    ws.onopen = () => console.log(`[WS] Connected for project ${projectId}`)
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        setWsMessages((prev) => [...prev.slice(-99), msg])
        // Refresh project status on terminal events
        if (['pipeline_done', 'pipeline_error', 'pipeline_cancelled'].includes(msg.type)) {
          fetchProjects()
        }
      } catch (e) {
        console.error('[WS] Parse error:', e)
      }
    }
    ws.onerror = (err) => console.error('[WS] Error:', err)
    ws.onclose = () => console.log('[WS] Closed')
    wsRef.current = ws
  }, [])

  // Disconnect on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  function selectProject(project) {
    setSelectedProject(project)
    setWsMessages([])
    connectWebSocket(project?.id)
    if (project) {
      setView('editor')
    }
  }

  function handleNewProject(project) {
    setProjects((prev) => [project, ...prev])
    selectProject(project)
  }

  function handleProjectUpdate(updated) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    if (selectedProject?.id === updated.id) {
      setSelectedProject(updated)
    }
  }

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={selectProject}
        onNewProject={handleNewProject}
        onNavigate={setView}
        currentView={view}
        onProjectsRefresh={fetchProjects}
      />
      <main className="main-content">
        {view === 'projects' && !selectedProject && (
          <div className="welcome">
            <h1>Hindi Video Studio</h1>
            <p className="welcome-subtitle">हिंदी / Hinglish स्क्रिप्ट से वीडियो बनाएं</p>
            <button
              className="btn btn-primary btn-large"
              onClick={() => setView('new-project')}
            >
              + New Project
            </button>
          </div>
        )}

        {view === 'new-project' && (
          <NewProjectWizard
            onCreated={handleNewProject}
            onCancel={() => setView('projects')}
          />
        )}

        {selectedProject && view === 'editor' && (
          <ScriptEditor
            project={selectedProject}
            onUpdate={handleProjectUpdate}
            onRunPipeline={() => setView('pipeline')}
          />
        )}

        {selectedProject && view === 'pipeline' && (
          <PipelineView
            project={selectedProject}
            wsMessages={wsMessages}
            onViewGallery={() => setView('gallery')}
            onViewExport={() => setView('export')}
          />
        )}

        {selectedProject && view === 'gallery' && (
          <SceneGallery project={selectedProject} />
        )}

        {view === 'settings' && (
          <Settings />
        )}

        {selectedProject && view === 'export' && (
          <ExportPanel
            project={selectedProject}
            wsMessages={wsMessages}
            onUpdate={handleProjectUpdate}
          />
        )}
      </main>
    </div>
  )
}

// ── New Project Wizard ───────────────────────────────────────────────────────
function NewProjectWizard({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [workflowType, setWorkflowType] = useState('script_to_video')
  const [script, setScript] = useState('')
  const [audioPath, setAudioPath] = useState('')
  const [srtPath, setSrtPath] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Project name is required'); return }
    if (workflowType === 'script_to_video' && !script.trim()) {
      setError('Script is required for Workflow A'); return
    }
    if (workflowType === 'audio_to_video' && (!audioPath.trim() || !srtPath.trim())) {
      setError('Audio path and SRT path are required for Workflow B'); return
    }

    setLoading(true)
    try {
      const body = { name: name.trim(), workflow_type: workflowType }
      if (workflowType === 'script_to_video') body.script = script
      else { body.audio_path = audioPath; body.srt_path = srtPath }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to create project')
      }
      const data = await res.json()
      onCreated(data.project)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wizard">
      <h2>New Project</h2>
      <form onSubmit={handleSubmit} className="wizard-form">
        <div className="form-group">
          <label>Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="मेरा पहला वीडियो"
            className="input"
          />
        </div>

        <div className="form-group">
          <label>Workflow</label>
          <div className="workflow-toggle">
            <button
              type="button"
              className={`workflow-btn ${workflowType === 'script_to_video' ? 'active' : ''}`}
              onClick={() => setWorkflowType('script_to_video')}
            >
              <span className="workflow-icon">📝</span>
              <span>Workflow A</span>
              <span className="workflow-desc">Script → Video</span>
            </button>
            <button
              type="button"
              className={`workflow-btn ${workflowType === 'audio_to_video' ? 'active' : ''}`}
              onClick={() => setWorkflowType('audio_to_video')}
            >
              <span className="workflow-icon">🎵</span>
              <span>Workflow B</span>
              <span className="workflow-desc">Audio + SRT → Video</span>
            </button>
          </div>
        </div>

        {workflowType === 'script_to_video' && (
          <div className="form-group">
            <label>Script (Hindi / Hinglish)</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="यहाँ अपनी स्क्रिप्ट लिखें..."
              className="textarea devanagari"
              rows={8}
            />
          </div>
        )}

        {workflowType === 'audio_to_video' && (
          <>
            <div className="form-group">
              <label>Audio File Path (.mp3 / .wav)</label>
              <input
                type="text"
                value={audioPath}
                onChange={(e) => setAudioPath(e.target.value)}
                placeholder="/path/to/narration.mp3"
                className="input monospace"
              />
            </div>
            <div className="form-group">
              <label>SRT File Path</label>
              <input
                type="text"
                value={srtPath}
                onChange={(e) => setSrtPath(e.target.value)}
                placeholder="/path/to/subtitles.srt"
                className="input monospace"
              />
            </div>
          </>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  )
}
