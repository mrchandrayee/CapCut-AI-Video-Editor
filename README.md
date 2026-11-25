# DRISHQAN — Visual Creation (दृश्य + Creation)

A fully self-contained desktop application for AI-powered video production. Built with local AI video generators (Lance 3B, LTX-Video, Wan 2.2, CogVideoX) + 22-language Indian TTS (Indic-Parler-TTS) + automated captions and timeline video creation.

No external services needed, no API keys, no cloud calls — runs locally on your computer.

---

## 🍎 macOS Installation & 1-Click Launch Guide

On macOS Sequoia & Sonoma, unsigned open-source apps downloaded from the internet are blocked by Apple Gatekeeper with a *"Malware Blocked"* warning.

### Step 1: Download & Open DMG
Download `DRISHQAN-0.1.1-mac-arm64.dmg` (for Apple Silicon M1/M2/M3/M4) or `DRISHQAN-0.1.1-mac-x64.dmg` (for Intel) from [Releases](https://github.com/mrchandrayee/CapCut-in-AI-Video-studio/releases). Double-click the DMG to open it.

### Step 2: 1-Click Run Command
Open **Terminal** and copy-paste this command:

```bash
xattr -cr /Applications/DRISHQAN.app && open /Applications/DRISHQAN.app
```

*(This clears the Gatekeeper quarantine attribute safely without modifying internal signatures, launching DRISHQAN instantly).*

---

## 🚀 Quick Start (Development & Local Engines)

```bash
bash start.sh
```

That's it. The script sets up Python virtual environments, installs npm dependencies, and launches the Electron app. On first run this takes several minutes as dependencies download.

## What's Included

### AI Video Generation
Four local video generation models (selected per scene):
- **Lance 3B** — fastest, optimised for 16 GB Apple Silicon
- **LTX-Video** — high motion fidelity
- **Wan 2.2** — cinematic quality (requires 24 GB+ RAM)
- **CogVideoX** — versatile scene generation

### 22-Language Indian TTS
Powered by **ai4bharat/indic-parler-tts** with natural male and female voices for Hindi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Urdu and more.

### Hindi Caption System
Cutflow-style caption rendering with:
- Noto Sans Devanagari, Hind, and Baloo Bhaijaan 2 fonts
- TikTok word-highlight, Neon Pop Duo, Essential, Impact Pop and 20+ caption presets
- ASS subtitle output with stroke, shadow and 300 ms fade in/out

### Scene Timeline
Read-only timeline showing generated scenes with scrubable playhead. Click anywhere to seek.

### Caption Style Presets
Full grid of Cutflow caption styles with live Hindi preview text.

## Architecture

The Studio is built directly on [Hamza Abika's Cutflow](https://github.com/hamzaabika/cutflow) open-source video editor architecture, upgraded with a native Python AI Studio backend:

| Component | Port / Type | Directory |
|-----------|-------------|-----------|
| Studio Backend (FastAPI: TTS + Video + LLM + Assembly) | 8765 | `backend/` |
| Cutflow Frontend (React + Vite + Cutflow Design System) | 5173 / SPA | `frontend/` |
| Electron Shell (Desktop Packaging) | Desktop | `electron/` |

The React + Vite frontend runs on port 5173 in development, or is served as a bundled SPA by the backend in production. Electron boots the unified backend and immediately opens the full Cutflow video editor window.

## Project Structure

```
CapCut-in-AI-Video-studio/
├── electron/          # Electron main process, preload, and loading screen
├── frontend/          # Cutflow React + Vite video editor
│   └── src/
│       ├── components/  # Cutflow Timeline, Captions, Script, Scenes
│       ├── lib/         # Cutflow engine (fonts, text, anim, timeline)
│       ├── ui/          # Cutflow UI kit (Button, Card, Section, Tabs)
│       └── styles/      # Cutflow production dark theme
├── backend/           # Unified AI backend (FastAPI, port 8765)
│   ├── routes/        # API endpoints (projects, pipeline, settings, health)
│   ├── services/      # TTS (Indic-Parler), Video AI, LLM, Assembly, Captions
│   └── db/            # SQLite models
└── start.sh           # One-command setup and launch
```

## Ports

- **8765** — Studio Backend (`backend/`)
- **5173** — Frontend dev server (Vite, development only)
