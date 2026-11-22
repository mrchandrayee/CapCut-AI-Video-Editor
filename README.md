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

Three Python services started and managed by Electron at launch:

| Service | Port | Directory |
|---------|------|-----------|
| Video Engine (FastAPI + AI models) | 47872 | `engines/videostudio/` |
| Voice Engine (VEXYL-TTS / Parler-TTS) | 7700 | `engines/vexyl-tts/` |
| Studio Backend (orchestration + projects) | 8765 | `backend/` |

The React + Vite frontend runs on port 5173 in development, or is served by the backend in production. Electron loads the loading screen, starts all three services in parallel, then opens the main window once all three pass their health checks.

## Project Structure

```
hindi-video-studio/
├── electron/          # Electron main process and preload
├── frontend/          # React + Vite app
│   └── src/
│       ├── components/  # UI components
│       ├── lib/         # Cutflow rendering library (fonts, text, timeline)
│       └── ui/          # Cutflow UI kit (Button, Card, etc.)
├── backend/           # Studio orchestration backend (FastAPI, port 8765)
├── engines/
│   ├── videostudio/   # AI video generation backend (FastAPI, port 47872)
│   └── vexyl-tts/     # Indian TTS server (FastAPI, port 7700)
└── start.sh           # One-command setup and launch
```

## Ports

- **47872** — Video Engine (`engines/videostudio/`)
- **7700** — Voice Engine (`engines/vexyl-tts/`)
- **8765** — Studio Backend (`backend/`)
- **5173** — Frontend dev server (Vite, development only)
