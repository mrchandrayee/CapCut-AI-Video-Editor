import React, { useState } from 'react'

const STATUS_COLORS = {
  pending: '#6b7280',
  tts: '#3b82f6',
  llm: '#3b82f6',
  video_gen: '#3b82f6',
  assembly: '#3b82f6',
  done: '#10b981',
  error: '#ef4444',
}

const STATUS_LABELS = {
  pending: 'Pending',
  tts: 'TTS',
  llm: 'LLM',
  video_gen: 'Generating',
  assembly: 'Assembling',
  done: 'Done',
  error: 'Error',
}

export default function Sidebar({
  projects,
  selectedProject,
  onSelectProject,
  onNewProject,
  onNavigate,
  currentView,
  onProjectsRefresh,
}) {
  async function handleNew() {
    onNavigate('new-project')
    onSelectProject(null)
  }

  async function handleDelete(e, project) {
    e.stopPropagation()
    if (!confirm(`Delete "${project.name}"?`)) return
    try {
      await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      onProjectsRefresh()
      if (selectedProject?.id === project.id) {
        onSelectProject(null)
        onNavigate('projects')
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🎬</span>
          <span className="sidebar-logo-text">Hindi Studio</span>
        </div>
        <button className="btn-new" onClick={handleNew} title="New Project">
          +
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Projects</div>
        <div className="project-list">
          {projects.length === 0 && (
            <div className="sidebar-empty">No projects yet</div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`project-item ${selectedProject?.id === p.id ? 'selected' : ''}`}
              onClick={() => onSelectProject(p)}
            >
              <div className="project-item-left">
                <span
                  className="status-dot"
                  style={{ backgroundColor: STATUS_COLORS[p.status] || '#6b7280' }}
                  title={STATUS_LABELS[p.status] || p.status}
                />
                <div className="project-item-info">
                  <span className="project-name">{p.name}</span>
                  <span className="project-meta">
                    {p.workflow_type === 'script_to_video' ? 'Workflow A' : 'Workflow B'} ·{' '}
                    {STATUS_LABELS[p.status] || p.status}
                  </span>
                </div>
              </div>
              <button
                className="btn-delete"
                onClick={(e) => handleDelete(e, p)}
                title="Delete project"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </nav>

      {selectedProject && (
        <nav className="sidebar-project-nav">
          <div className="sidebar-section-label">Current Project</div>
          {[
            { view: 'editor', icon: '✏️', label: 'Script Editor' },
            { view: 'pipeline', icon: '⚡', label: 'Pipeline' },
            { view: 'gallery', icon: '🎞️', label: 'Scene Gallery' },
            { view: 'export', icon: '📤', label: 'Export' },
          ].map(({ view, icon, label }) => (
            <button
              key={view}
              className={`sidebar-nav-btn ${currentView === view ? 'active' : ''}`}
              onClick={() => onNavigate(view)}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="sidebar-footer">
        <button
          className={`sidebar-nav-btn ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <span>⚙️</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
