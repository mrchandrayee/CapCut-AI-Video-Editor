import React from 'react'
import { TEXT_TEMPLATES } from '../lib/text/catalog.js'
import { Card } from '../ui/index.js'
import '@fontsource/noto-sans-devanagari/400.css'
import '@fontsource/noto-sans-devanagari/700.css'

const SAMPLE_HINDI = 'नमस्ते, यह एक परीक्षण वाक्य है।'

// Show only caption-category templates
const CAPTION_PRESETS = TEXT_TEMPLATES.filter((t) => t.caption)

function previewStyle(preset) {
  const p = preset.patch || {}
  return {
    fontFamily: `"Noto Sans Devanagari", serif`,
    fontSize: '1.1rem',
    fontWeight: p.bold ? 700 : 400,
    fontStyle: p.italic ? 'italic' : 'normal',
    color: p.color || '#ffffff',
    textShadow: p.shadow?.on !== false
      ? `0 ${p.shadow?.y ?? 4}px ${p.shadow?.blur ?? 10}px ${p.shadow?.color || '#000'}`
      : 'none',
    WebkitTextStroke: p.stroke?.width
      ? `${Math.min(p.stroke.width, 4)}px ${p.stroke.color || '#000'}`
      : undefined,
    letterSpacing: p.letterSpacing ? `${p.letterSpacing}px` : undefined,
    textTransform: p.uppercase ? 'uppercase' : 'none',
    padding: '8px 12px',
    borderRadius: 6,
    background: p.bg?.on ? `${p.bg.color}${Math.round((p.bg.opacity ?? 0.6) * 255).toString(16).padStart(2, '0')}` : 'transparent',
  }
}

/**
 * CaptionsTab — grid of caption style presets with live Hindi preview.
 *
 * Props:
 *   selectedStyle  – string preset id
 *   onStyleChange  – function(presetId)
 */
export default function CaptionsTab({ selectedStyle, onStyleChange }) {
  const activePreset = CAPTION_PRESETS.find((p) => p.id === selectedStyle) ?? CAPTION_PRESETS[0]

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Caption Styles</h2>
      </div>

      {/* Preview pane */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 10,
          padding: '32px 24px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 100,
        }}
      >
        <span style={previewStyle(activePreset)}>
          {activePreset?.patch?.previewText || SAMPLE_HINDI}
        </span>
      </div>

      <div style={{ marginBottom: 12, color: '#888', fontSize: '0.8rem' }}>
        Selected: <strong style={{ color: '#ccc' }}>{activePreset?.name}</strong>
      </div>

      {/* Style grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 10,
          maxHeight: 400,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {CAPTION_PRESETS.map((preset) => {
          const isActive = preset.id === (selectedStyle ?? activePreset?.id)
          return (
            <Card
              key={preset.id}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                border: isActive ? '2px solid #ff4fd8' : '2px solid transparent',
                background: isActive ? '#2a1a2e' : '#1e1e1e',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onClick={() => onStyleChange?.(preset.id)}
            >
              <div
                style={{
                  ...previewStyle(preset),
                  fontSize: '0.75rem',
                  padding: '4px 6px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  borderRadius: 4,
                }}
              >
                {preset.patch?.previewText
                  ? preset.patch.previewText.slice(0, 20)
                  : 'नमस्ते'}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 2 }}>
                {preset.name}
              </div>
            </Card>
          )
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={() => onStyleChange?.(activePreset?.id)}
        >
          Apply Style
        </button>
      </div>
    </div>
  )
}
