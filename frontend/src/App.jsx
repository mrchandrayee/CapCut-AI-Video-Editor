import React, { useState, useRef, useEffect, useCallback } from 'react'
import Timeline from './components/Timeline.jsx'
import CaptionsTab from './components/CaptionsTab.jsx'
import ScriptEditor from './components/ScriptEditor.jsx'
import SceneGallery from './components/SceneGallery.jsx'
import Settings from './components/Settings.jsx'
import PipelineView from './components/PipelineView.jsx'
import ExportPanel from './components/ExportPanel.jsx'
import { TEXT_TEMPLATES } from './lib/text/catalog.js'
import '@fontsource/noto-sans-devanagari/400.css'
import '@fontsource/noto-sans-devanagari/700.css'
import '@fontsource/hind/400.css'
import '@fontsource/hind/700.css'
import '@fontsource/baloo-bhaijaan-2/400.css'
import '@fontsource/baloo-bhaijaan-2/800.css'

const WS_BASE = 'ws://localhost:8765'

const HINDI_FONTS = [
  { id: 'noto-sans-devanagari', name: 'Noto Sans Devanagari', family: 'Noto Sans Devanagari' },
  { id: 'hind', name: 'Hind', family: 'Hind' },
  { id: 'baloo', name: 'Baloo Bhaijaan 2', family: 'Baloo Bhaijaan 2' },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat' },
]

const DEFAULT_PROJECT = {
  id: 'demo-project',
  name: 'मेरा पहला AI वीडियो',
  aspect_ratio: '9:16',
  workflow_type: 'script_to_video',
  script: 'आज के इस वीडियो में हम जानेंगे कि AI की मदद से कैसे बिना कैमरे के शानदार वीडियो बनाए जा सकते हैं। कटफ्लो और दृश्यम तकनीक से आप सिर्फ एक प्रॉम्प्ट लिखकर पूरी रील तैयार कर सकते हैं।',
  scenes: [
    {
      id: 1,
      title: 'Scene 1: Cutflow AI Studio',
      prompt: 'Cinematic futuristic AI video studio with glowing purple neon lights, 4k ultra-realistic',
      duration: 5,
      text: 'नमस्ते दोस्तों! आज हम जानेंगे AI से वीडियो कैसे बनाएं।',
    },
    {
      id: 2,
      title: 'Scene 2: Script to Video',
      prompt: 'Digital brain generating visuals, floating holograms, high detail motion graphics',
      duration: 5,
      text: 'सिर्फ एक हिंदी स्क्रिप्ट लिखकर पूरी रील तैयार हो जाती है।',
    },
    {
      id: 3,
      title: 'Scene 3: Indian TTS & Captions',
      prompt: 'Modern smartphone displaying viral shorts video with animated subtitles, clean gradient background',
      duration: 5,
      text: 'हिंदी वॉयस और वायरल कैप्शन के साथ अभी शुरू करें!',
    },
  ],
}

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  const ms = Math.floor((secs % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${ms}`
}

function computeCaptionStyle(preset, fontName) {
  const p = preset?.patch || {}
  return {
    fontFamily: `"${fontName}", "Noto Sans Devanagari", sans-serif`,
    fontSize: '1.25rem',
    fontWeight: p.bold ? 700 : 500,
    fontStyle: p.italic ? 'italic' : 'normal',
    color: p.color || '#ffffff',
    textShadow: p.shadow?.on !== false
      ? `0 ${p.shadow?.y ?? 4}px ${p.shadow?.blur ?? 12}px ${p.shadow?.color || '#000000'}`
      : 'none',
    WebkitTextStroke: p.stroke?.width
      ? `${Math.min(p.stroke.width, 3.5)}px ${p.stroke.color || '#000000'}`
      : 'none',
    letterSpacing: p.letterSpacing ? `${p.letterSpacing}px` : 'normal',
    textTransform: p.uppercase ? 'uppercase' : 'none',
    padding: '8px 16px',
    borderRadius: 8,
    background: p.bg?.on
      ? `${p.bg.color}${Math.round((p.bg.opacity ?? 0.7) * 255).toString(16).padStart(2, '0')}`
      : 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(4px)',
    display: 'inline-block',
    maxWidth: '90%',
    lineHeight: 1.4,
    textAlign: 'center',
    transition: 'all 0.2s ease',
  }
}

export default function App() {
  const [projects, setProjects] = useState([DEFAULT_PROJECT])
  const [project, setProject] = useState(DEFAULT_PROJECT)
  const [leftTab, setLeftTab] = useState('script') // media | script | captions | voice | video_ai | effects | scenes | settings
  const [selectedCaptionStyle, setSelectedCaptionStyle] = useState('cap-classic')
  const [selectedFont, setSelectedFont] = useState('noto-sans-devanagari')
  const [selectedModel, setSelectedModel] = useState('lance-3b')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState(1)
  const [importedMedia, setImportedMedia] = useState([
    { id: 'm1', name: 'intro_bg.mp4', type: 'video', duration: '0:15', size: '4.2 MB' },
    { id: 'm2', name: 'voiceover_hi.wav', type: 'audio', duration: '0:15', size: '1.3 MB' },
    { id: 'm3', name: 'logo_badge.png', type: 'image', duration: '—', size: '120 KB' },
  ])
  const [activeEffect, setActiveEffect] = useState('none')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showPipeline, setShowPipeline] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const playTimerRef = useRef(null)
  const wsRef = useRef(null)

  // Fetch projects from backend if available
  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects)
          setProject(data.projects[0])
        }
      })
      .catch(() => {
        // Backend offline, working with local default project
      })
  }, [])

  // Total duration calculation
  const totalDuration = (project.scenes || []).reduce((acc, s) => acc + (s.duration || 5), 0)

  // Find active scene based on currentTime
  let accumulated = 0
  let activeScene = project.scenes?.[0] || null
  for (const s of project.scenes || []) {
    const dur = s.duration || 5
    if (currentTime >= accumulated && currentTime < accumulated + dur) {
      activeScene = s
      break
    }
    accumulated += dur
  }

  // Playhead interval timer
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false)
            return 0
          }
          return Math.min(totalDuration, prev + 0.1)
        })
      }, 100)
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
  }, [isPlaying, totalDuration])

  // Active caption preset
  const activeCaptionPreset = TEXT_TEMPLATES.find((t) => t.id === selectedCaptionStyle) || TEXT_TEMPLATES[0]
  const activeFontFamily = HINDI_FONTS.find((f) => f.id === selectedFont)?.family || 'Noto Sans Devanagari'
  const currentCaptionText = activeScene?.text || activeScene?.title || project.script?.slice(0, 60)

  function updateProject(patch) {
    setProject((prev) => {
      const updated = { ...prev, ...patch }
      setProjects((all) => all.map((p) => (p.id === updated.id ? updated : p)))
      return updated
    })
  }

  const timelineScenes = (project.scenes || []).map((s, i) => ({
    id: s.id ?? i + 1,
    title: s.title ?? `Scene ${i + 1}`,
    duration: s.duration ?? 5,
    prompt: s.prompt ?? '',
    text: s.text ?? '',
    thumbnailUrl: s.thumbnail_url ?? null,
  }))

  return (
    <div className="app">
      {/* ── Top Bar (Cutflow Header) ─────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            boxShadow: '0 2px 10px rgba(139, 92, 246, 0.4)',
          }}>
            🎬
          </div>
          <span className="brand-name" style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: 0.5 }}>
            CUTFLOW <span style={{ color: '#a78bfa', fontSize: '0.82em', fontWeight: 500 }}>• AI STUDIO</span>
          </span>
        </div>

        <div className="project-meta" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            className="project-name input"
            value={project.name}
            onChange={(e) => updateProject({ name: e.target.value })}
            title="Click to rename project"
            style={{ fontWeight: 600, maxWidth: 220 }}
          />
          <select
            className="ratio-select select"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            <option value="9:16">📱 9:16 (Shorts / Reels)</option>
            <option value="16:9">🖥️ 16:9 (Landscape / YouTube)</option>
            <option value="1:1">⏹️ 1:1 (Square / Post)</option>
          </select>
          <span className="pill">
            {project.scenes?.length || 0} Scenes • {totalDuration.toFixed(1)}s
          </span>
        </div>

        <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowNewModal(true)}>
            + New Project
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowPipeline(true)}>
            ⚡ Generate AI Video
          </button>
          <button className="btn btn-sm" onClick={() => setShowExport(true)}>
            🚀 Export Video
          </button>
        </div>
      </header>

      {/* ── Main Workspace: 3 Columns (Left Tools | Player | Inspector) ──── */}
      <div className="workspace">
        {/* Left Column: Rail + Tab Views */}
        <div className="left">
          <div className="panel-head">
            <span className="panel-title">
              {leftTab === 'media' && '📁 Media & Asset Library'}
              {leftTab === 'script' && '📝 AI Script & Story'}
              {leftTab === 'captions' && '💬 Devanagari Captions & Presets'}
              {leftTab === 'voice' && '🎙️ 22-Language Indian TTS'}
              {leftTab === 'video_ai' && '🎬 AI Video Prompt Generator'}
              {leftTab === 'effects' && '✨ Video Filters & Transitions'}
              {leftTab === 'scenes' && '🎞️ Scene Gallery'}
              {leftTab === 'settings' && '⚙️ Engine Settings'}
            </span>
          </div>

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Tool Rail (Cutflow Left Icons) */}
            <div className="rail">
              <button
                className={`rail-btn ${leftTab === 'media' ? 'active' : ''}`}
                onClick={() => setLeftTab('media')}
                title="Media Library"
              >
                <span style={{ fontSize: 18 }}>📁</span>
                <span>Media</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'script' ? 'active' : ''}`}
                onClick={() => setLeftTab('script')}
                title="Script & AI Story"
              >
                <span style={{ fontSize: 18 }}>📝</span>
                <span>Script</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'captions' ? 'active' : ''}`}
                onClick={() => setLeftTab('captions')}
                title="Animated Captions"
              >
                <span style={{ fontSize: 18 }}>💬</span>
                <span>Captions</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'voice' ? 'active' : ''}`}
                onClick={() => setLeftTab('voice')}
                title="Indian TTS Voiceover"
              >
                <span style={{ fontSize: 18 }}>🎙️</span>
                <span>Voice</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'video_ai' ? 'active' : ''}`}
                onClick={() => setLeftTab('video_ai')}
                title="AI Video Generation"
              >
                <span style={{ fontSize: 18 }}>🎬</span>
                <span>AI Video</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'effects' ? 'active' : ''}`}
                onClick={() => setLeftTab('effects')}
                title="Effects & Filters"
              >
                <span style={{ fontSize: 18 }}>✨</span>
                <span>Effects</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'scenes' ? 'active' : ''}`}
                onClick={() => setLeftTab('scenes')}
                title="Scenes"
              >
                <span style={{ fontSize: 18 }}>🎞️</span>
                <span>Scenes</span>
              </button>
              <button
                className={`rail-btn ${leftTab === 'settings' ? 'active' : ''}`}
                onClick={() => setLeftTab('settings')}
                title="Settings"
              >
                <span style={{ fontSize: 18 }}>⚙️</span>
                <span>Engines</span>
              </button>
            </div>

            {/* Tool Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>
              {/* Media Tab */}
              {leftTab === 'media' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{
                    border: '2px dashed var(--border-strong)',
                    borderRadius: 8,
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>
                      Drag & Drop Video / Audio / Image
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#888' }}>
                      Supports MP4, MOV, MP3, WAV, PNG, JPG
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ marginTop: 12 }}
                      onClick={() => {
                        const name = prompt('Enter media file name (e.g. clip_intro.mp4):')
                        if (name) {
                          setImportedMedia((prev) => [
                            ...prev,
                            { id: `m${Date.now()}`, name, type: 'video', duration: '0:10', size: '3.1 MB' },
                          ])
                        }
                      }}
                    >
                      + Import File
                    </button>
                  </div>

                  <h4 style={{ fontSize: '0.85rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Project Assets ({importedMedia.length})
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {importedMedia.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'var(--surface-2)',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: '0.82rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16 }}>
                            {m.type === 'video' ? '🎬' : (m.type === 'audio' ? '🎵' : '🖼️')}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, color: '#eef0f5' }}>{m.name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#888' }}>{m.duration} • {m.size}</div>
                          </div>
                        </div>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => alert(`Added ${m.name} to timeline!`)}
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Script Tab */}
              {leftTab === 'script' && (
                <ScriptEditor
                  project={project}
                  onUpdate={updateProject}
                  onRunPipeline={() => setShowPipeline(true)}
                />
              )}

              {/* Captions Tab */}
              {leftTab === 'captions' && (
                <CaptionsTab
                  selectedStyle={selectedCaptionStyle}
                  onStyleChange={setSelectedCaptionStyle}
                />
              )}

              {/* Voice / TTS Tab */}
              {leftTab === 'voice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: 4 }}>
                      🇮🇳 22-Language Indian TTS (Indic-Parler)
                    </h3>
                    <p style={{ color: '#aaa', fontSize: '0.82rem' }}>
                      High quality Indian voices for Hindi, Hinglish, Marathi, Tamil, Bengali, Telugu, and more.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#ccc' }}>Language</label>
                    <select className="select" style={{ width: '100%' }}>
                      <option value="hi-IN">Hindi (हिन्दी)</option>
                      <option value="en-IN">Indian English (Hinglish)</option>
                      <option value="mr-IN">Marathi (मराठी)</option>
                      <option value="bn-IN">Bengali (বাংলা)</option>
                      <option value="ta-IN">Tamil (தமிழ்)</option>
                      <option value="te-IN">Telugu (తెలుగు)</option>
                      <option value="gu-IN">Gujarati (ગુજરાતી)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#ccc' }}>Speaker Voice</label>
                    <select className="select" style={{ width: '100%' }}>
                      <option value="divya">Divya (Female, Warm & Natural Hindi)</option>
                      <option value="rohit">Rohit (Male, Confident Reel Style)</option>
                      <option value="priya">Priya (Female, Energetic & Bright)</option>
                      <option value="amit">Amit (Male, Storytelling Deep Voice)</option>
                      <option value="kavya">Kavya (Female, Professional Narrator)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#ccc' }}>Speech Pace (Speed)</label>
                    <input type="range" min="0.8" max="1.4" step="0.05" defaultValue="1.0" style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#888', marginTop: 4 }}>
                      <span>0.8x (Slow)</span>
                      <span>1.0x (Normal)</span>
                      <span>1.4x (Fast)</span>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      alert('Synthesizing Hindi Speech sample with natural tone...')
                    }}
                  >
                    ▶️ Preview Voice Sample
                  </button>
                </div>
              )}

              {/* AI Video Gen Tab */}
              {leftTab === 'video_ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: 4 }}>
                      🎬 AI Video Generation
                    </h3>
                    <p style={{ color: '#aaa', fontSize: '0.82rem' }}>
                      Generate high-definition video clips from prompts using local diffusion or cloud models.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#ccc' }}>Diffusion Model</label>
                    <select
                      className="select"
                      style={{ width: '100%' }}
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      <option value="lance-3b">Lance 3B (Fastest • Apple Silicon MLX)</option>
                      <option value="cogvideox-2b">CogVideoX 2B (High Quality)</option>
                      <option value="wan-5b">Wan 2.2 5B (Cinematic Diffuser)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#ccc' }}>Visual Prompt for Scene</label>
                    <textarea
                      className="textarea"
                      rows={4}
                      style={{ width: '100%', resize: 'vertical' }}
                      value={activeScene?.prompt || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        updateProject({
                          scenes: project.scenes.map((s) => (s.id === activeScene?.id ? { ...s, prompt: val } : s)),
                        })
                      }}
                      placeholder="Cinematic 4K shot, detailed lighting..."
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => setShowPipeline(true)}
                  >
                    ⚡ Render Scene with AI
                  </button>
                </div>
              )}

              {/* Effects Tab */}
              {leftTab === 'effects' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h3 style={{ fontSize: '1rem', color: '#fff' }}>✨ Video Effects & Filters</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { id: 'none', name: 'Normal', icon: '🎨' },
                      { id: 'cinematic', name: 'Cinematic Teal', icon: '🎬' },
                      { id: 'vibrant', name: 'Vibrant Reel', icon: '🌈' },
                      { id: 'noir', name: 'Classic Noir', icon: '🕶️' },
                      { id: 'vhs', name: 'Retro VHS', icon: '📼' },
                      { id: 'glow', name: 'Neon Glow', icon: '✨' },
                    ].map((eff) => (
                      <div
                        key={eff.id}
                        onClick={() => setActiveEffect(eff.id)}
                        style={{
                          padding: '12px 10px',
                          borderRadius: 8,
                          background: activeEffect === eff.id ? 'var(--primary-soft)' : 'var(--surface-2)',
                          border: activeEffect === eff.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 22, marginBottom: 4 }}>{eff.icon}</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{eff.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scenes Tab */}
              {leftTab === 'scenes' && (
                <SceneGallery project={project} />
              )}

              {/* Settings Tab */}
              {leftTab === 'settings' && (
                <Settings />
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Live Stage / Video Player */}
        <div className="player">
          <div className="panel-head">
            <span className="panel-title">Video Canvas Preview</span>
            <span className="pill">{aspectRatio}</span>
          </div>

          <div className="stage-wrap">
            <div
              className="stage"
              style={{
                aspectRatio: aspectRatio === '9:16' ? '9 / 16' : (aspectRatio === '1:1' ? '1 / 1' : '16 / 9'),
                height: aspectRatio === '9:16' ? '92%' : '78%',
                maxHeight: '100%',
                maxWidth: '100%',
                background: activeScene?.thumbnailUrl
                  ? `url(${activeScene.thumbnailUrl}) center/cover no-repeat`
                  : 'radial-gradient(circle at 50% 35%, #2e1065, #09090b)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 16px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                position: 'relative',
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                filter: activeEffect === 'noir' ? 'grayscale(100%)' : (activeEffect === 'vibrant' ? 'saturate(160%)' : 'none'),
              }}
            >
              {/* Scene Header Tag */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: 4, backdropFilter: 'blur(4px)' }}>
                  {activeScene?.title || 'Scene 1'}
                </span>
                <span style={{ background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: 4, backdropFilter: 'blur(4px)' }}>
                  {selectedModel.toUpperCase()}
                </span>
              </div>

              {/* Center Visual Mockup */}
              {!activeScene?.thumbnailUrl && (
                <div style={{ textAlign: 'center', padding: '0 16px', color: '#fff' }}>
                  <div style={{ fontSize: 38, marginBottom: 8, filter: 'drop-shadow(0 0 16px rgba(168, 85, 247, 0.6))' }}>
                    🎬
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>
                    {activeScene?.title || 'AI Video Scene'}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, maxWidth: 280, margin: '0 auto', lineHeight: 1.4, color: '#d8b4fe' }}>
                    {activeScene?.prompt || 'Click "Generate Video" to render scene visuals.'}
                  </div>
                </div>
              )}

              {/* Live Styled Caption Overlay */}
              <div style={{ width: '100%', textAlign: 'center', paddingBottom: 16 }}>
                <span style={computeCaptionStyle(activeCaptionPreset, activeFontFamily)}>
                  {currentCaptionText}
                </span>
              </div>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="transport">
            <div className="tc">
              <b>{formatTime(currentTime)}</b> / {formatTime(totalDuration)}
            </div>
            <div className="transport-btns">
              <button
                className="btn btn-sm"
                onClick={() => setCurrentTime(Math.max(0, currentTime - 2))}
                title="Rewind 2s"
              >
                ⏪
              </button>
              <button
                className="play-btn"
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setCurrentTime(Math.min(totalDuration, currentTime + 2))}
                title="Forward 2s"
              >
                ⏩
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setCurrentTime(0)} title="Rewind to start">
                ⏮️ Start
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Inspector / Properties */}
        <div className="inspector">
          <div className="panel-head">
            <span className="panel-title">Properties & Inspector</span>
          </div>
          <div className="inspector-body" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#aaa', fontWeight: 600 }}>
                ACTIVE SCENE
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={activeScene?.title || ''}
                onChange={(e) => {
                  const val = e.target.value
                  updateProject({
                    scenes: project.scenes.map((s) => (s.id === activeScene?.id ? { ...s, title: val } : s)),
                  })
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#aaa', fontWeight: 600 }}>
                SCENE DURATION: {(activeScene?.duration || 5)}s
              </label>
              <input
                type="range"
                min="2"
                max="15"
                step="0.5"
                value={activeScene?.duration || 5}
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  updateProject({
                    scenes: project.scenes.map((s) => (s.id === activeScene?.id ? { ...s, duration: val } : s)),
                  })
                }}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#aaa', fontWeight: 600 }}>
                DEVNAGARI FONT
              </label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={selectedFont}
                onChange={(e) => setSelectedFont(e.target.value)}
              >
                {HINDI_FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#aaa', fontWeight: 600 }}>
                AI VIDEO MODEL
              </label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                <option value="lance-3b">Lance 3B (Fastest • 16GB RAM)</option>
                <option value="cogvideox-2b">CogVideoX 2B (Balanced)</option>
                <option value="wan-5b">Wan 2.2 (Cinematic High-Res)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: '#aaa', fontWeight: 600 }}>
                CAPTION STYLE PRESET
              </label>
              <div style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>
                {activeCaptionPreset?.name}
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setShowPipeline(true)}
              >
                ⚡ Render Current Video
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Full Multi-Track Timeline (Always Visible) ────────────── */}
      <div className="timeline">
        <Timeline
          scenes={timelineScenes}
          currentTime={currentTime}
          onSeek={setCurrentTime}
          selectedSceneId={selectedSceneId}
          onSelectScene={setSelectedSceneId}
        />
      </div>

      {/* ── Modals / Overlays ──────────────────────────────────────────────── */}
      {showNewModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div className="card" style={{ width: 440, padding: 24 }}>
            <h3>+ Create New Project</h3>
            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Project Title</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                defaultValue="नया AI वीडियो प्रोजेक्ट"
                id="new-proj-title"
              />
            </div>
            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Aspect Ratio</label>
              <select className="select" style={{ width: '100%' }} id="new-proj-ratio">
                <option value="9:16">📱 9:16 (Shorts, Reels, TikTok)</option>
                <option value="16:9">🖥️ 16:9 (YouTube, Landscape)</option>
                <option value="1:1">⏹️ 1:1 (Square, Post)</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const title = document.getElementById('new-proj-title').value
                  const ratio = document.getElementById('new-proj-ratio').value
                  const newP = {
                    id: `proj-${Date.now()}`,
                    name: title,
                    aspect_ratio: ratio,
                    script: '',
                    scenes: [
                      { id: 1, title: 'Scene 1', prompt: 'Cinematic visual scene...', duration: 5, text: '' },
                    ],
                  }
                  setProjects((prev) => [newP, ...prev])
                  setProject(newP)
                  setAspectRatio(ratio)
                  setShowNewModal(false)
                }}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {showPipeline && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{ width: 620, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-sm" onClick={() => setShowPipeline(false)}>✕ Close</button>
            </div>
            <PipelineView project={project} />
          </div>
        </div>
      )}

      {showExport && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{ width: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-sm" onClick={() => setShowExport(false)}>✕ Close</button>
            </div>
            <ExportPanel project={project} />
          </div>
        </div>
      )}
    </div>
  )
}
