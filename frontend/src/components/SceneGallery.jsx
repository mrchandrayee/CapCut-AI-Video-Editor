import React, { useState, useEffect } from 'react'

const STATUS_COLORS = {
  pending: '#6b7280',
  generating: '#3b82f6',
  done: '#10b981',
  error: '#ef4444',
}

export default function SceneGallery({ project }) {
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScenes()
    const interval = setInterval(fetchScenes, 3000)
    return () => clearInterval(interval)
  }, [project.id])

  async function fetchScenes() {
    try {
      const res = await fetch(`/api/projects/${project.id}`)
      const data = await res.json()
      setScenes(data.project?.scenes || [])
    } catch (err) {
      console.error('Failed to load scenes:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-header"><h2>Scene Gallery</h2></div>
        <div className="loading">Loading scenes...</div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Scene Gallery</h2>
          <span className="project-meta-inline">{project.name}</span>
        </div>
        <button className="btn btn-secondary" onClick={fetchScenes}>
          ↻ Refresh
        </button>
      </div>

      {scenes.length === 0 ? (
        <div className="empty-state">
          <p>No scenes yet. Run the pipeline to generate scene clips.</p>
        </div>
      ) : (
        <div className="scene-gallery-grid">
          {scenes.map((scene) => (
            <SceneCard key={scene.id} scene={scene} />
          ))}
        </div>
      )}
    </div>
  )
}

function SceneCard({ scene }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="scene-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="scene-card-preview">
        {scene.video_path && hovered ? (
          <video
            src={`file://${scene.video_path}`}
            autoPlay
            loop
            muted
            className="scene-video-preview"
          />
        ) : scene.video_path ? (
          <div className="scene-preview-placeholder">
            <span>🎬 Hover to preview</span>
          </div>
        ) : (
          <div className="scene-preview-placeholder">
            {scene.status === 'generating' ? (
              <span className="spinner" />
            ) : scene.status === 'error' ? (
              <span>❌</span>
            ) : (
              <span>⏸️</span>
            )}
          </div>
        )}
        <span
          className="scene-status-badge"
          style={{ backgroundColor: STATUS_COLORS[scene.status] || '#6b7280' }}
        >
          {scene.status}
        </span>
        <span className="scene-num-badge">#{scene.scene_num}</span>
      </div>

      <div className="scene-card-info">
        <div className="scene-title">{scene.scene_title || `Scene ${scene.scene_num}`}</div>
        <div className="scene-timing">
          {scene.start_s != null && scene.end_s != null
            ? `${scene.start_s.toFixed(1)}s — ${scene.end_s.toFixed(1)}s`
            : ''}
        </div>
        <div className="scene-prompt">{scene.prompt}</div>
      </div>
    </div>
  )
}
