import React, { useState, useEffect } from 'react'

const STAGES = [
  { id: 'tts', label: 'Text-to-Speech', icon: '🎙️', desc: 'Indian TTS speech synthesis (44.1kHz)' },
  { id: 'llm', label: 'Scene Segmentation', icon: '🧠', desc: 'AI scene prompts & timing breakdown' },
  { id: 'video_gen', label: 'Video Generation', icon: '🎬', desc: 'Rendering cinematic scene clips' },
  { id: 'assembly', label: 'Final Assembly', icon: '🎞️', desc: 'FFmpeg merging video, audio & Hindi subtitles' },
]

function initialStageState() {
  return Object.fromEntries(
    STAGES.map((s) => [s.id, { status: 'idle', progress: 0, detail: '' }])
  )
}

export default function PipelineView({
  project = {},
  wsMessages = [],
  onViewGallery,
  onViewExport,
  onPipelineComplete,
}) {
  const [stageState, setStageState] = useState(initialStageState())
  const [sceneProgress, setSceneProgress] = useState({})
  const [pipelineDone, setPipelineDone] = useState(false)
  const [pipelineError, setPipelineError] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  // Reset when project changes
  useEffect(() => {
    setStageState(initialStageState())
    setSceneProgress({})
    setPipelineDone(false)
    setPipelineError('')
    setOutputPath('')
  }, [project?.id])

  // Process WebSocket messages safely
  useEffect(() => {
    if (!wsMessages || !Array.isArray(wsMessages) || wsMessages.length === 0) return
    const msg = wsMessages[wsMessages.length - 1]
    if (!msg || typeof msg !== 'object') return

    setStageState((prev) => {
      const next = { ...prev }

      if (msg.type === 'stage_start' && next[msg.stage]) {
        next[msg.stage] = { status: 'running', progress: msg.progress || 0, detail: msg.detail || '' }
      } else if (msg.type === 'stage_progress' && next[msg.stage]) {
        next[msg.stage] = {
          status: 'running',
          progress: msg.progress || 0,
          detail: msg.detail || '',
        }
      } else if (msg.type === 'stage_done' && next[msg.stage]) {
        next[msg.stage] = { status: 'done', progress: 1.0, detail: msg.detail || 'Complete' }
      } else if (msg.type === 'stage_error' && next[msg.stage]) {
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
      onPipelineComplete?.(msg.output_path)
    }
    if (msg.type === 'pipeline_error') {
      setPipelineError(msg.error || 'Pipeline failed')
    }
  }, [wsMessages, onPipelineComplete])

  async function handleStartPipeline() {
    setIsStarting(true)
    setPipelineError('')
    setPipelineDone(false)
    try {
      const res = await fetch(`/api/pipeline/${project.id || 'demo-project'}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'lance-3b',
          quality: 'final',
          speaker: 'divya',
          language: 'hi-IN',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Server returned ${res.status}`)
      }
    } catch (err) {
      setPipelineError(err.message || 'Failed to start pipeline')
    } finally {
      setIsStarting(false)
    }
  }

  async function handleCancel() {
    try {
      await fetch(`/api/pipeline/${project.id || 'demo-project'}/cancel`, { method: 'POST' })
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  const isRunning = Object.values(stageState).some((s) => s.status === 'running') || isStarting

  return (
    <div style={{
      background: 'var(--surface-1, #12121d)',
      border: '1px solid var(--border-strong, rgba(255,255,255,0.12))',
      borderRadius: 12,
      padding: 20,
      color: '#eef0f5',
      boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
        paddingBottom: 14,
        marginBottom: 16,
      }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚡ AI Video Production Pipeline
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#a8afc0' }}>
            {project?.name || 'Project'} • Indian TTS + Visuals + Subtitles
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {!isRunning && !pipelineDone && (
            <button
              className="btn btn-primary"
              onClick={handleStartPipeline}
              disabled={isStarting}
            >
              {isStarting ? '⏳ Starting...' : '▶ Start Generation'}
            </button>
          )}
          {isRunning && (
            <button className="btn btn-danger" onClick={handleCancel}>
              ⏹ Cancel
            </button>
          )}
          {pipelineDone && (
            <button className="btn btn-primary" onClick={onViewExport}>
              🚀 Export Video
            </button>
          )}
        </div>
      </div>

      {pipelineError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: 8,
          padding: '10px 14px',
          color: '#fca5a5',
          fontSize: '0.85rem',
          marginBottom: 16,
        }}>
          <b>Pipeline Error:</b> {pipelineError}
        </div>
      )}

      {pipelineDone && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.15)',
          border: '1px solid #22c55e',
          borderRadius: 8,
          padding: '12px 14px',
          color: '#86efac',
          fontSize: '0.9rem',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span>✅</span>
          <div>
            <b>Video Generated Successfully!</b>
            <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: 2 }}>{outputPath}</div>
          </div>
        </div>
      )}

      {/* Stages Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STAGES.map((stage) => {
          const state = stageState[stage.id] || { status: 'idle', progress: 0, detail: '' }
          const { status, progress, detail } = state
          const isDone = status === 'done'
          const isCurrent = status === 'running'
          const isErr = status === 'error'

          return (
            <div
              key={stage.id}
              style={{
                background: isCurrent ? 'var(--surface-3, #20202f)' : 'var(--surface-2, #181826)',
                border: isCurrent ? '1px solid #8b5cf6' : '1px solid var(--border, rgba(255,255,255,0.06))',
                borderRadius: 8,
                padding: '12px 14px',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{stage.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>
                      {stage.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                      {stage.desc}
                    </div>
                  </div>
                </div>

                <div>
                  {isCurrent && (
                    <span style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 600 }}>
                      ⚡ In Progress ({Math.round(progress * 100)}%)
                    </span>
                  )}
                  {isDone && <span style={{ color: '#22c55e', fontWeight: 700 }}>✅ Done</span>}
                  {isErr && <span style={{ color: '#ef4444', fontWeight: 700 }}>❌ Failed</span>}
                  {status === 'idle' && <span style={{ color: '#666', fontSize: '0.78rem' }}>Waiting</span>}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{
                height: 4,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 2,
                overflow: 'hidden',
                margin: '6px 0',
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round(progress * 100)}%`,
                  background: isDone ? '#22c55e' : (isErr ? '#ef4444' : 'linear-gradient(90deg, #8b5cf6, #ec4899)'),
                  transition: 'width 0.3s ease',
                }} />
              </div>

              {detail && (
                <div style={{ fontSize: '0.75rem', color: '#a8afc0', marginTop: 4 }}>
                  {detail}
                </div>
              )}

              {/* Individual Scene Progress for video_gen */}
              {stage.id === 'video_gen' && Object.keys(sceneProgress).length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {Object.entries(sceneProgress).map(([sNum, sp]) => (
                    <div key={sNum} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#ccc', marginBottom: 4 }}>
                      <span style={{ width: 60 }}>Scene {sNum}:</span>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                        <div style={{ width: `${Math.round(sp.progress * 100)}%`, height: '100%', background: '#8b5cf6' }} />
                      </div>
                      <span style={{ width: 35, textAlign: 'right' }}>{Math.round(sp.progress * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
