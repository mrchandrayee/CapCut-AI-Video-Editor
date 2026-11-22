# Hindi Video Studio

A fully local, production-ready desktop application for generating Hindi/Hinglish AI videos. Write a script or provide existing audio, and the studio generates a narrated, scene-matched, caption-overlaid 1080p MP4 — no cloud, no API keys.

## What it does

**Workflow A — Script to Video**
Hindi/Hinglish text → VEXYL-TTS narration → Ollama scene segmentation → Video Studio KH video clips → FFmpeg assembly → 1080p MP4

**Workflow B — Audio/SRT to Video**
Existing MP3 + SRT → Ollama visual prompts → Video Studio KH video clips → FFmpeg assembly → 1080p MP4

Both workflows produce: animated Devanagari/Latin captions, transitions, optional background music, 1080p output.

---

## Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Python | 3.11+ | `brew install python` |
| Node.js | 20+ | `brew install node` |
| FFmpeg | any recent | `brew install ffmpeg` |
| Ollama | latest | https://ollama.com |

Machine: Apple M5 24 GB or similar (16 GB minimum for Lance 3B).

---

## Starting the services

You need four services running before using the studio. Open four terminal tabs.

### 1. VEXYL-TTS (Hindi TTS engine)

```bash
cd /Users/chandrayee/Documents/code/ecom/multilingual/vexyl-tts-main
pip install -r requirements.txt
python vexyl_tts_server.py
```

Runs on **port 8080** by default (configure `TTS_WS_URL=ws://localhost:8080` in backend env).

### 2. Ollama (scene segmentation LLM)

```bash
# Start the server
ollama serve

# Pull a model (in a new tab)
ollama pull llama3.2:3b
```

Runs on **port 11434**.

### 3. Video Studio KH (AI video generation)

```bash
cd /Users/chandrayee/Documents/code/ecom/multilingual/videostudio-mac-main
pip install -r requirements.txt
python -m uvicorn app.backend.main:app --host 127.0.0.1 --port 47872
```

Runs on **port 47872**. Download the Lance 3B model from its Models tab first (`mlx-community/Lance-3B-Video-bf16`).

### 4. Hindi Video Studio (this app)

```bash
cd /Users/chandrayee/Documents/code/ecom/multilingual/hindi-video-studio
bash start.sh
```

Or to run with Electron:
```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Start (backend must already be running)
npm start
```

---

## First video: Workflow A step-by-step

1. Open `http://localhost:5173` in your browser (or use the Electron app).
2. Click **+ New Project**.
3. Select **Workflow A: Script → Video**.
4. Enter a project name and your Hindi/Hinglish script.
5. Click **Create Project** — the Script Editor opens.
6. Choose your voice (Divya/Rohit), language (hi-IN), and video model (Lance 3B recommended).
7. Click **▶ Generate Video**.
8. Watch real-time progress in the **Pipeline** tab: TTS → LLM → Video Gen → Assembly.
9. When done, click **View Scenes** to preview individual clips.
10. Go to **Export** and click **📤 Export Video** for the final 1080p MP4.
11. Click **📁 Open in Finder** to locate the file.

---

## Workflow B: Audio/SRT to Video step-by-step

1. Click **+ New Project**.
2. Select **Workflow B: Audio + SRT → Video**.
3. Enter the full path to your `.mp3` or `.wav` narration file.
4. Enter the full path to the corresponding `.srt` subtitle file.
5. Click **Create Project**.
6. In the Script Editor, choose your video model and quality, then click **▶ Generate Video**.
7. The pipeline skips TTS (uses your audio), runs Ollama to generate visual prompts from the SRT, then generates and assembles video clips.

---

## Settings and health checks

Open **Settings** (⚙️ in the sidebar):

- **Service URLs** — configure where each service is running.
- **Test All Connections** — checks TTS, Ollama, and Video Studio KH. If any service is unreachable, the panel shows the exact command to start it.
- **Default Model** — Lance 3B (fastest on 24 GB), CogVideoX 2B, or Wan 2.2 5B.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                   Electron Desktop App                   │
│   BrowserWindow → http://localhost:5173 (Vite/React)    │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP + WebSocket
                            ▼
┌─────────────────────────────────────────────────────────┐
│          FastAPI Backend  127.0.0.1:8765                 │
│  Routes: /api/projects  /api/pipeline  /api/settings    │
│  WebSocket: /ws/{project_id}  (progress stream)         │
└──────┬───────────────┬──────────────┬───────────────────┘
       │               │              │
       ▼               ▼              ▼
  VEXYL-TTS        Ollama       Video Studio KH
  :8080 (WS)      :11434         :47872
  Hindi TTS      LLM scenes    txt2video API
                               (Lance 3B MLX)
                                     │
                               FFmpeg assembly
                               ~/.hindi-video-studio/
                               └── projects/{id}/
                                   ├── narration.wav
                                   ├── narration.srt
                                   ├── captions.ass
                                   ├── scenes/
                                   │   ├── scene_001.mp4
                                   │   └── scene_002.mp4
                                   └── output_final.mp4
```

---

## Data storage

All generated files live at `~/.hindi-video-studio/`:

```
~/.hindi-video-studio/
├── projects.db          SQLite database
├── settings.json        URL and preference overrides
└── projects/
    └── {project-uuid}/
        ├── narration.wav
        ├── narration.srt
        ├── captions.ass
        ├── concat.txt
        ├── scenes/
        │   ├── scene_001.mp4
        │   └── ...
        └── output_final.mp4
```

---

## Troubleshooting

**TTS not connecting** — VEXYL-TTS listens on port 8080 (WebSocket). The studio defaults to `ws://localhost:7700`. Update Settings → VEXYL-TTS URL to `http://localhost:8080` and the backend will derive `ws://localhost:8080`.

**Ollama model not found** — Run `ollama pull llama3.2:3b`. The service probes for `llama3.2:3b`, `gemma3:4b`, `llama3:8b`, `mistral:7b` in that order and uses the first available model.

**Video Studio returning 409** — The Lance 3B model must be fully downloaded. Open Video Studio KH at `http://localhost:47872` and download `mlx-community/Lance-3B-Video-bf16` from the Models tab.

**FFmpeg not found** — Run `brew install ffmpeg`.

**Port 8765 in use** — Another instance of the backend is running. Kill it with `lsof -ti:8765 | xargs kill`.
