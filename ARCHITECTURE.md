# Architecture — Hindi Video Studio

## Overview

Hindi Video Studio is a fully self-contained desktop application. Electron starts and manages three embedded Python services, then loads a React + Vite frontend.

## Three-Service Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      User's Mac (Apple Silicon)                     │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                 Electron App (electron/main.js)             │    │
│  │                                                             │    │
│  │  Spawns 3 Python services → shows loading screen           │    │
│  │  Polls each health endpoint → opens main window            │    │
│  │  Kills all processes on before-quit                        │    │
│  │  Exposes window.electron.restartService() via IPC          │    │
│  └───────────┬────────────────┬─────────────────┬────────────┘    │
│              │                │                 │                   │
│       starts │         starts │          starts │                   │
│              ▼                ▼                 ▼                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                Studio Backend (Unified Engine)            │    │
│  │                Port: 8765                                 │    │
│  │                                                           │    │
│  │                backend/                                   │    │
│  │                routes/                                    │    │
│  │                services/                                  │    │
│  │                db/ (SQLite)                               │    │
│  │                                                           │    │
│  │                • Indic TTS (ai4bharat / 22 languages)     │    │
│  │                • AI Video Diffusion (Lance 3B / CogVideo) │    │
│  │                • Devanagari Caption & ASS Assembly        │    │
│  │                • FFmpeg rendering pipeline                │    │
│  │                • WebSocket /ws/{id}                       │    │
│  └─────────────────────────────┬─────────────────────────────┘    │
│                                                  │                  │
│  ┌───────────────────────────────────────────────▼──────────────┐  │
│  │          React + Vite Frontend (port 5173 dev / 8765 prod)   │  │
│  │                                                               │  │
│  │  Tabs: Editor | Pipeline | Gallery | Timeline | Captions     │  │
│  │        Settings | Export                                      │  │
│  │                                                               │  │
│  │  lib/fonts.js        — Cutflow font system (60+ fonts)       │  │
│  │  lib/text/catalog.js — Caption style presets                 │  │
│  │  lib/text/render.js  — Canvas text renderer                  │  │
│  │  lib/text/duo.js     — Neon Pop Duo caption timing           │  │
│  │  lib/timelineView.js — Timeline virtualization math          │  │
│  │  lib/subtitles.js    — SRT parser                            │  │
│  │  lib/anim.js         — Clip animation system                 │  │
│  │  ui/                 — Cutflow UI kit (Button, Card, etc.)   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Layout

```
hindi-video-studio/
├── electron/
│   ├── main.js          # Starts 3 services, loading screen, IPC
│   └── preload.js       # Exposes window.electronAPI + window.electron
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Tab routing, caption state, timeline state
│   │   ├── components/
│   │   │   ├── ScriptEditor.jsx   # Script input with Devanagari font selector
│   │   │   ├── PipelineView.jsx   # Pipeline progress via WebSocket
│   │   │   ├── SceneGallery.jsx   # Generated scene thumbnails
│   │   │   ├── Timeline.jsx       # Read-only scene timeline (new)
│   │   │   ├── CaptionsTab.jsx    # Caption style preset grid (new)
│   │   │   ├── ExportPanel.jsx    # Final export controls
│   │   │   ├── Settings.jsx       # Service health + restart
│   │   │   └── Sidebar.jsx        # Navigation
│   │   ├── lib/                   # Cutflow rendering library
│   │   │   ├── fonts.js           # Font definitions + CSS imports
│   │   │   ├── subtitles.js       # SRT parser
│   │   │   ├── timelineView.js    # Timeline window math
│   │   │   ├── anim.js            # Clip animation system
│   │   │   └── text/
│   │   │       ├── catalog.js     # Text style presets
│   │   │       ├── render.js      # Canvas renderer
│   │   │       ├── duo.js         # Neon Pop Duo logic
│   │   │       └── units.js       # Animation unit math
│   │   ├── ui/                    # Cutflow UI kit
│   │   │   ├── Button.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── IconButton.jsx
│   │   │   ├── PanelHead.jsx
│   │   │   ├── Section.jsx
│   │   │   ├── Tabs.jsx
│   │   │   ├── Toggle.jsx
│   │   │   └── index.js
│   │   └── styles/
│   │       └── main.css           # Cutflow design tokens + component styles
│   └── package.json               # Includes all @fontsource/* deps
├── backend/                       # Studio orchestration (port 8765)
│   ├── main.py
│   ├── routes/
│   └── services/
│       ├── tts.py                 # Indic-Parler / VEXYL-TTS service
│       ├── video.py               # AI Video diffusion service
│       ├── assembly.py            # FFmpeg assembly
│       └── captions.py            # SRT→ASS with Noto Sans Devanagari
├── package.json                   # Electron app package
├── start.sh                       # One-command setup + launch
└── ARCHITECTURE.md
```

## Service Startup Sequence

1. Electron `app.whenReady()` fires
2. Loading screen BrowserWindow opens with three `⏳` rows
3. All three services start in parallel (`Promise.allSettled`)
4. As each service passes its health check, its row updates to `✅` or `❌`
5. If any service fails the user can Continue or Quit
6. Loading window closes; main BrowserWindow opens

## Port Assignments

| Port | Service | Health Endpoint |
|------|---------|----------------|
| 47872 | Video Engine | `GET /api/catalog` |
| 7700 | Voice Engine | `GET /health` |
| 8765 | Studio Backend | `GET /api/health` |

## Data Flow: Workflow A (Script → Video)

```
Script text
    │
    ▼  POST /api/pipeline/{id}/run
Studio Backend (8765)
    │
    ├─→ Voice Engine (7700): synthesize text → narration.wav + narration.srt
    ├─→ Ollama (11434): segment script → scene visual prompts
    ├─→ Video Engine (47872): generate MP4 per scene
    └─→ FFmpeg: concat + audio + captions.ass → output_final.mp4
```

## Caption Pipeline

`backend/services/captions.py` converts SRT → ASS format:
- Font: **Noto Sans Devanagari** (Devanagari lines) / **Inter** (Latin lines)
- Outline: 6px (matches Cutflow `TEXT_DEFAULTS.stroke.width`)
- Shadow: enabled (matches `TEXT_DEFAULTS.shadow.on = true`)
- Fade: `{\fad(300,300)}` — 300ms in/out (matches animIn/animOut dur: 0.3)
- Alignment: bottom-center (ASS Alignment=2)

## IPC Bridge

`electron/preload.js` exposes two global objects:

```js
window.electronAPI   // legacy: showItemInFinder, openFile, onNewProject, onExport
window.electron      // new: restartService(name) → Promise<{ok, error?}>
```

`restartService` sends `restart-service` IPC to main, which kills the old process and re-runs `startService()` with health polling.

## ASS Caption Style

```
Style: Devanagari,Noto Sans Devanagari,52,
  PrimaryColour=&H00FFFFFF,  (white)
  OutlineColour=&H00000000,  (black stroke)
  Outline=6, Shadow=1,
  Alignment=2 (bottom center), MarginV=30

Each line: {\fad(300,300)} + text
```

## WebSocket Messages (Backend → Frontend)

```typescript
{ type: "stage_start"|"stage_progress"|"stage_done"|"stage_error", stage, progress, detail }
{ type: "scene_progress", scene_num, total, progress, detail }
{ type: "pipeline_done", output_path }
{ type: "pipeline_error", error }
{ type: "pipeline_cancelled" }
```
