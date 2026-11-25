import React, { useRef, useCallback } from 'react'

const PPS = 50 // pixels per second
const TRACK_H = 44
const RULER_H = 26

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  const ms = Math.floor((secs % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${ms}`
}

export default function Timeline({
  scenes = [],
  currentTime = 0,
  onSeek,
  selectedSceneId = null,
  onSelectScene,
}) {
  const scrollRef = useRef(null)

  // Compute scene layout
  const sceneSlots = []
  let cursor = 0
  for (const scene of scenes) {
    sceneSlots.push({ ...scene, start: cursor })
    cursor += scene.duration || 5
  }
  const totalDuration = Math.max(cursor, 15)
  const totalWidth = Math.max(900, totalDuration * PPS + 120)

  const handleTimelineClick = useCallback((e) => {
    if (!scrollRef.current) return
    const rect = scrollRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft
    const t = Math.max(0, Math.min(totalDuration, x / PPS))
    onSeek?.(t)
  }, [totalDuration, onSeek])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: 'var(--surface-1, #12121d)',
      borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
      userSelect: 'none',
    }}>
      {/* Timeline Control Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
        background: 'var(--surface-2, #181826)',
        fontSize: '0.82rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, letterSpacing: 0.5, color: '#eef0f5' }}>
            🎞️ CUTFLOW TIMELINE
          </span>
          <span style={{
            background: 'rgba(130, 92, 251, 0.15)',
            color: '#a78bfa',
            padding: '2px 8px',
            borderRadius: 4,
            fontWeight: 600,
            fontFamily: 'monospace',
          }}>
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => onSeek?.(0)}
            title="Rewind to zero"
          >
            ⏮️
          </button>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => onSeek?.(Math.max(0, currentTime - 1))}
            title="Step Back 1s"
          >
            ◀ 1s
          </button>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => onSeek?.(Math.min(totalDuration, currentTime + 1))}
            title="Step Forward 1s"
          >
            1s ▶
          </button>
          <span style={{ color: '#6f7789', fontSize: 11, marginLeft: 8 }}>
            {scenes.length} Scenes • 4 Tracks
          </span>
        </div>
      </div>

      {/* Main Multi-Track Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Track Headers (Left sidebar) */}
        <div style={{
          width: 110,
          flexShrink: 0,
          background: 'var(--surface-2, #181826)',
          borderRight: '1px solid var(--border, rgba(255,255,255,0.08))',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 5,
        }}>
          {/* Header spacer for ruler */}
          <div style={{ height: RULER_H, borderBottom: '1px solid rgba(255,255,255,0.06)' }} />

          {/* V1 Track Header */}
          <div style={{
            height: TRACK_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: 11,
            color: '#a8afc0',
            fontWeight: 600,
          }}>
            <span>🎬 V1 Video</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>👁️</span>
          </div>

          {/* T1 Subtitles Track Header */}
          <div style={{
            height: TRACK_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: 11,
            color: '#a8afc0',
            fontWeight: 600,
          }}>
            <span>💬 T1 Captions</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>अ/A</span>
          </div>

          {/* A1 Narration Track Header */}
          <div style={{
            height: TRACK_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: 11,
            color: '#a8afc0',
            fontWeight: 600,
          }}>
            <span>🎙️ A1 Voice</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>🔊</span>
          </div>

          {/* A2 Music Track Header */}
          <div style={{
            height: TRACK_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: 11,
            color: '#a8afc0',
            fontWeight: 600,
          }}>
            <span>🎵 A2 Music</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>🔊</span>
          </div>
        </div>

        {/* Scrollable Tracks Canvas */}
        <div
          ref={scrollRef}
          onClick={handleTimelineClick}
          style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            position: 'relative',
            background: 'var(--canvas, #07070e)',
            cursor: 'crosshair',
          }}
        >
          {/* Ruler Row */}
          <div style={{
            position: 'relative',
            height: RULER_H,
            width: totalWidth,
            background: 'var(--surface-3, #20202f)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: i * PPS,
                  top: 0,
                  height: '100%',
                  borderLeft: i % 5 === 0 ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
                  paddingLeft: 4,
                  color: i % 5 === 0 ? '#eef0f5' : '#6f7789',
                  fontSize: 9,
                  fontWeight: i % 5 === 0 ? 600 : 400,
                  lineHeight: `${RULER_H}px`,
                  pointerEvents: 'none',
                }}
              >
                {i % 2 === 0 ? formatTime(i) : ''}
              </div>
            ))}
          </div>

          {/* ── TRACK V1 (Video / Visuals) ─────────────────────────────── */}
          <div style={{
            position: 'relative',
            height: TRACK_H,
            width: totalWidth,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(255,255,255,0.01)',
          }}>
            {sceneSlots.map((slot, idx) => {
              const w = (slot.duration || 5) * PPS
              const isSelected = selectedSceneId === (slot.id ?? idx)
              return (
                <div
                  key={slot.id ?? idx}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectScene?.(slot.id ?? idx)
                    onSeek?.(slot.start)
                  }}
                  title={`${slot.title || `Scene ${idx + 1}`}: ${slot.prompt || ''}`}
                  style={{
                    position: 'absolute',
                    left: slot.start * PPS,
                    width: Math.max(12, w - 3),
                    top: 3,
                    height: TRACK_H - 6,
                    background: slot.thumbnailUrl
                      ? `url(${slot.thumbnailUrl}) center/cover no-repeat`
                      : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                    borderRadius: 4,
                    border: isSelected ? '2px solid #a855f7' : '1px solid rgba(130, 92, 251, 0.4)',
                    boxShadow: isSelected ? '0 0 10px rgba(168, 85, 247, 0.5)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ marginRight: 6 }}>🎬</span>
                  <span>{slot.title || `Scene ${idx + 1}`} ({slot.duration}s)</span>
                </div>
              )
            })}
          </div>

          {/* ── TRACK T1 (Captions / Hindi Subtitles) ───────────────────── */}
          <div style={{
            position: 'relative',
            height: TRACK_H,
            width: totalWidth,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            {sceneSlots.map((slot, idx) => {
              const w = (slot.duration || 5) * PPS
              const captionText = slot.text || slot.title || `उपशीर्षक ${idx + 1}`
              return (
                <div
                  key={`cap-${slot.id ?? idx}`}
                  style={{
                    position: 'absolute',
                    left: slot.start * PPS,
                    width: Math.max(12, w - 3),
                    top: 4,
                    height: TRACK_H - 8,
                    background: 'linear-gradient(135deg, #4c1d95 0%, #581c87 100%)',
                    borderRadius: 4,
                    border: '1px solid rgba(192, 132, 252, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#f5d0fe',
                    fontSize: 11,
                    fontFamily: '"Noto Sans Devanagari", sans-serif',
                    fontWeight: 500,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ marginRight: 5, fontSize: 10 }}>💬</span>
                  <span>{captionText}</span>
                </div>
              )
            })}
          </div>

          {/* ── TRACK A1 (Voiceover / TTS Narration) ────────────────────── */}
          <div style={{
            position: 'relative',
            height: TRACK_H,
            width: totalWidth,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(255,255,255,0.01)',
          }}>
            {sceneSlots.map((slot, idx) => {
              const w = (slot.duration || 5) * PPS
              return (
                <div
                  key={`tts-${slot.id ?? idx}`}
                  style={{
                    position: 'absolute',
                    left: slot.start * PPS,
                    width: Math.max(12, w - 3),
                    top: 4,
                    height: TRACK_H - 8,
                    background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
                    borderRadius: 4,
                    border: '1px solid rgba(52, 211, 153, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#a7f3d0',
                    fontSize: 10,
                    fontWeight: 600,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ marginRight: 5 }}>🎙️</span>
                  <span>Indic-TTS • {slot.duration}s [WAV 44.1kHz]</span>
                </div>
              )
            })}
          </div>

          {/* ── TRACK A2 (Background Music / BGM) ────────────────────────── */}
          <div style={{
            position: 'relative',
            height: TRACK_H,
            width: totalWidth,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                width: totalWidth - 40,
                top: 4,
                height: TRACK_H - 8,
                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
                borderRadius: 4,
                border: '1px solid rgba(96, 165, 250, 0.35)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                color: '#bfdbfe',
                fontSize: 10,
                fontWeight: 600,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
              }}
            >
              <span style={{ marginRight: 6 }}>🎵</span>
              <span>BGM: Lofi Cinematic Beats (Volume: 25% • Auto-Ducking on speech)</span>
            </div>
          </div>

          {/* ── Scrubbable Playhead Needle across all tracks ───────────── */}
          <div
            style={{
              position: 'absolute',
              left: currentTime * PPS,
              top: 0,
              bottom: 0,
              width: 2,
              background: '#ec4899',
              boxShadow: '0 0 8px #ec4899',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            {/* Playhead handle top marker */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: -5,
              width: 12,
              height: 12,
              background: '#ec4899',
              clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
            }} />
          </div>
        </div>
      </div>
    </div>
  )
}
