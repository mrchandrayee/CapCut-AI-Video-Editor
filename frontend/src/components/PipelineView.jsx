import React, { useState, useEffect } from 'react'

const STAGES = [
  { id: 'tts', label: 'Text-to-Speech', icon: '🎙️', desc: 'Generating narration audio' },
  { id: 'llm', label: 'Scene Analysis', icon: '🧠', desc: 'LLM segmentation & visual prompts' },
  { id: 'video_gen', label: 'Video Generation', icon: '🎬', desc: 'Generating scene clips' },
  { id: 'assembly', label: 'Assembly', icon: '🎞️', desc: 'Combining clips, audio & captions' },
]

function initialStageState() {
  return Object.fromEntries(
    STAGES.map((s) => [s.id, { status: 'idle', progress: 0, detail: '' }])
  )
}

export default function PipelineView({ project, wsMessages, onViewGallery, onViewExport }) {
  const [stageState, setStageState] = useState(initialStageState())
  const [sceneProgress, setSceneProgress] = useState({})
  const [pipelineDone, setPipelineDone] = useState(false)
  const [pipelineError, setPipelineError] = useState('')
  const [outputPath, setOutputPath] = useState('')

  // Reset when project changes
  useEffect(() => {
    setStageState(initialStageState())
    setSceneProgress({})
    setPipelineDone(false)
    setPipelineError('')
    setOutputPath('')
  }, [project.id])

  // Process WebSocket messages
  useEffect(() => {
    if (!wsMessages.length) return
    const msg = wsMessages[wsMessages.length - 1]

    setStageState((prev) => {
      const next = { ...prev }

      if (msg.type === 'stage_start') {
        next[msg.stage] = { status: 'running', progress: msg.progress || 0, detail: msg.detail || '' }
      } else if (msg.type === 'stage_progress') {
        if (next[msg.stage]) {
          next[msg.stage] = {
            status: 'running',
            progress: msg.progress || 0,
            detail: msg.detail || '',
          }
        }
      } else if (msg.type === 'stage_done') {
        next[msg.stage] = { status: 'done', progress: 1.0, detail: msg.detail || '' }
      } else if (msg.type === 'stage_error') {
        next[msg.stage] = { status: 'error', progress: 0, detail: msg.detail || 'Error' }
      }

      return next
    })

    if (msg.type === 'scene_progress') {
      setSceneProgress((prev) => ({
        ...prev,
        [msg.scene_num]: {
          progress: msg.progress || 0,
          detail: msg.detail || '',
          total: msg.total,
        },
      }))
    }

    if (msg.type === 'pipeline_done') {
      setPipelineDone(true)
      setOutputPath(msg.output_path || '')
    }
    if (msg.type === 'pipeline_error') {
      setPipelineError(msg.error || 'Pipeline failed')
    }
  }, [wsMessages])

  async function handleCancel() {
    try {
      await fetch(`/api/pipeline/${project.id}/cancel`, { method: 'POST' })
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  const isRunning = Object.values(stageState).some((s) => s.status === 'running')

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Pipeline</h2>
          <span className="project-meta-inline">{project.name}</span>
        </div>
        <div className="panel-header-actions">
          {isRunning && (
            <button className="btn btn-danger" onClick={handleCancel}>
              Cancel
            </button>
          )}
          {pipelineDone && (
            <>
              <button className="btn btn-secondary" onClick={onViewGallery}>
                View Scenes
              </button>
              <button className="btn btn-primary" onClick={onViewExport}>
                Export
              </button>
            </>
          )}
        </div>
      </div>

      {pipelineError && (
        <div className="error-message">
          <strong>Pipeline Error:</strong> {pipelineError}
        </div>
      )}

      {pipelineDone && (
        <div className="success-message">
          ✅ Video ready! {outputPath}
        </div>
      )}

      <div className="stages-grid">
        {STAGES.map((stage) => {
          const state = stageState[stage.id]
          return (
            <StageCard
              key={stage.id}
              stage={stage}
              state={state}
              sceneProgress={stage.id === 'video_gen' ? sceneProgress : null}
            />
          )
        })}
      </div>
    </div>
  )
}

function StageCard({ stage, state, sceneProgress }) {
  const { status, progress, detail } = state

  const statusIcon =
    status === 'running' ? <span className="spinner" />
    : status === 'done' ? '✅'
    : status === 'error' ? '❌'
    : '⏸️'

  return (
    <div className={`stage-card stage-${status}`}>
      <div className="stage-card-header">
        <span className="stage-icon">{stage.icon}</span>
        <div className="stage-card-info">
          <span className="stage-label">{stage.label}</span>
          <span className="stage-desc">{stage.desc}</span>
        </div>
        <span className="stage-status-icon">{statusIcon}</span>
      </div>

      <div className="progress-bar-wrap">
        <div
          className="progress-bar"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="stage-detail">{detail || (status === 'idle' ? 'Waiting...' : '')}</div>

      {sceneProgress && Object.keys(sceneProgress).length > 0 && (
        <div className="scene-progress-list">
          {Object.entries(sceneProgress)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([num, sp]) => (
              <div key={num} className="scene-progress-row">
                <span className="scene-progress-label">Scene {num}</span>
                <div className="progress-bar-wrap progress-bar-wrap-sm">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.round(sp.progress * 100)}%` }}
                  />
                </div>
                <span className="scene-progress-pct">{Math.round(sp.progress * 100)}%</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
