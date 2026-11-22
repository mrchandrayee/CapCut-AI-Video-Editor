import React, { useRef, useCallback } from 'react'
import { visibleWindow, clipInWindow, timesInWindow, TIMELINE_OVERSCAN_SECONDS } from '../lib/timelineView.js'
import { Card } from '../ui/index.js'

const PPS = 60 // pixels per second
const TRACK_HEIGHT = 56
const RULER_HEIGHT = 24

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Read-only scene timeline with scrubable playhead.
 *
 * Props:
 *   scenes       – Array of { id, title, duration, thumbnailUrl? }
 *   currentTime  – number (seconds)
 *   onSeek       – function(seconds)
 */
export default function Timeline({ scenes = [], currentTime = 0, onSeek }) {
  const containerRef = useRef(null)
  const scrollRef = useRef(null)

  // Build cumulative start times
  const sceneSlots = []
  let cursor = 0
  for (const scene of scenes) {
    sceneSlots.push({ ...scene, start: cursor })
    cursor += scene.duration || 0
  }
  const totalDuration = cursor

  const handleClick = useCallback((e) => {
    if (!scrollRef.current) return
    const rect = scrollRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft
    const t = Math.max(0, Math.min(totalDuration, x / PPS))
    onSeek?.(t)
  }, [totalDuration, onSeek])

  const totalWidth = Math.max(800, totalDuration * PPS + 100)

  return (
    <div className="panel" style={{ userSelect: 'none' }}>
      <div className="panel-header">
        <h2>Timeline</h2>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{ overflowX: 'auto', position: 'relative', borderRadius: 8, background: '#1a1a1a' }}
        onClick={handleClick}
      >
        {/* Ruler */}
        <div style={{ position: 'relative', height: RULER_HEIGHT, width: totalWidth, background: '#111' }}>
          {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: i * PPS,
              top: 0,
              height: '100%',
              borderLeft: '1px solid #333',
              paddingLeft: 3,
              color: '#666',
              fontSize: 10,
              lineHeight: `${RULER_HEIGHT}px`,
              pointerEvents: 'none',
            }}>
              {formatTime(i)}
            </div>
          ))}
        </div>

        {/* Scene track */}
        <div style={{ position: 'relative', height: TRACK_HEIGHT, width: totalWidth }}>
          {sceneSlots.map((slot, idx) => {
            const w = (slot.duration || 0) * PPS
            if (w < 1) return null
            return (
              <div
                key={slot.id ?? idx}
                title={slot.title ?? `Scene ${idx + 1}`}
                style={{
                  position: 'absolute',
                  left: slot.start * PPS,
                  width: w - 2,
                  top: 4,
                  height: TRACK_HEIGHT - 8,
                  background: slot.thumbnailUrl
                    ? `url(${slot.thumbnailUrl}) center/cover no-repeat`
                    : `hsl(${(idx * 47) % 360}, 55%, 30%)`,
                  borderRadius: 4,
                  boxSizing: 'border-box',
                  border: '1px solid rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 6,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                  pointerEvents: 'none',
                }}
              >
                {!slot.thumbnailUrl && (slot.title ?? `S${idx + 1}`)}
              </div>
            )
          })}

          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              left: currentTime * PPS - 1,
              top: 0,
              width: 2,
              height: TRACK_HEIGHT,
              background: '#ff4fd8',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        </div>
      </div>

      {scenes.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', padding: '24px 0', fontSize: '0.9rem' }}>
          No scenes yet. Generate a video to populate the timeline.
        </div>
      )}
    </div>
  )
}
