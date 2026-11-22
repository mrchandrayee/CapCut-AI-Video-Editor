# Architecture — Hindi Video Studio

## Service topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      User's Machine                             │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                 Electron App (optional)                 │    │
│  │  spawns backend process, loads http://localhost:5173   │    │
│  └────────────────────────┬───────────────────────────────┘    │
│                           │ loads URL                           │
│  ┌────────────────────────▼───────────────────────────────┐    │
│  │      React + Vite Frontend (localhost:5173)             │    │
│  │                                                         │    │
│  │  Sidebar │ ScriptEditor │ PipelineView │ SceneGallery   │    │
│  │  Settings │ ExportPanel                                 │    │
│  │                                                         │    │
│  │  ← /api/* HTTP calls (proxied to :8765)                │    │
│  │  ← /ws/{id} WebSocket (proxied to :8765)               │    │
│  └────────────────────────┬───────────────────────────────┘    │
│                           │                                     │
│  ┌────────────────────────▼───────────────────────────────┐    │
│  │      FastAPI Backend (127.0.0.1:8765)                   │    │
│  │                                                         │    │
│  │  routes/health.py     GET  /api/health                  │    │
│  │  routes/projects.py   CRUD /api/projects                │    │
│  │  routes/pipeline.py   POST /api/pipeline/{id}/run       │    │
│  │  routes/settings.py   GET/PUT /api/settings             │    │
│  │  main.py              WS   /ws/{project_id}             │    │
│  │                                                         │    │
│  │  services/            Business logic layer              │    │
│  │    tts.py             → VEXYL-TTS                       │    │
│  │    llm.py             → Ollama                          │    │
│  │    video.py           → Video Studio KH                 │    │
│  │    assembly.py        → FFmpeg                          │    │
│  │    captions.py        → ASS subtitle conversion         │    │
│  │                                                         │    │
│  │  db/models.py         SQLAlchemy ORM (SQLite)           │    │
│  └───┬───────────────┬──────────────┬────────────────────┘    │
│      │               │              │                           │
│  ┌───▼───┐       ┌───▼───┐    ┌────▼────┐                     │
│  │VEXYL  │       │Ollama │    │VideoStd │                     │
│  │ TTS   │       │:11434 │    │  KH     │                     │
│  │:8080  │       │       │    │:47872   │                     │
│  │(WS)   │       │REST   │    │REST     │                     │
│  └───────┘       └───────┘    └────┬────┘                     │
│                                    │ generates MP4s            │
│  ┌─────────────────────────────────▼────────────────────────┐ │
│  │                   FFmpeg (system binary)                  │ │
│  │  concat → overlay audio → subtitles → scale → H.264 MP4  │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data flow: Workflow A (Script to Video)

```
User inputs script
       │
       ▼
POST /api/pipeline/{id}/run
       │
       ▼  (background async task)
┌─────────────────────────────────────────────────────────┐
│  Stage 1: TTS                                           │
│  services/tts.py                                        │
│  WebSocket ws://localhost:8080                          │
│  → {"type":"synthesize","text":...,"lang":"hi-IN"}      │
│  ← {"type":"audio","audio_b64":...,"sample_rate":44100} │
│  Saves: narration.wav                                   │
│  Runs faster-whisper → narration.srt                    │
└───────────────────────────┬─────────────────────────────┘
                            │ ws_callback progress
                            ▼ {"type":"stage_done","stage":"tts"}
┌─────────────────────────────────────────────────────────┐
│  Stage 2: LLM scene segmentation                       │
│  services/llm.py                                        │
│  POST http://localhost:11434/api/generate               │
│  Body: {model:"llama3.2:3b", system:<JSON schema>,     │
│         prompt:<script+duration>, format:"json"}        │
│  Response: [{scene_num,start_s,end_s,                   │
│              visual_prompt,scene_title}, ...]           │
│  Retry once on JSON parse failure                       │
│  Saves: Scene rows in SQLite                            │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3: Video generation (sequential per scene)      │
│  services/video.py                                      │
│  POST http://localhost:47872/api/generate/txt2video     │
│  Body: {repo:"mlx-community/Lance-3B-Video-bf16",      │
│         prompt:<visual_prompt>, width:512, height:512,  │
│         frames:17, fps:12, steps:30, guidance:4.0}      │
│  Polls GET /api/generate/jobs/{id} every 2s             │
│  Downloads GET /api/generate/jobs/{id}/video → MP4      │
│  Saves: scenes/scene_001.mp4, scene_002.mp4, ...        │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 4: Assembly                                      │
│  services/captions.py → captions.ass (ASS format)      │
│  services/assembly.py → FFmpeg                          │
│                                                         │
│  FFmpeg pipeline:                                       │
│    -f concat -i concat.txt          (scene clips)       │
│    -i narration.wav                 (narration audio)   │
│    [-i music.mp3]                   (optional music)    │
│    tpad=stop_mode=clone             (pad last frame)    │
│    scale=1920:1080,pad              (letterbox)         │
│    subtitles=captions.ass           (Devanagari text)   │
│    amix weights='1 0.15'            (music at -20dB)    │
│    libx264 -crf 18 -preset slow     (H.264 output)      │
│  Saves: output_final.mp4                                │
└─────────────────────────────────────────────────────────┘
```

## WebSocket message schema

All messages from backend → frontend over `/ws/{project_id}`:

```typescript
// Stage lifecycle
{ type: "stage_start",    stage: StageId, progress: 0,   detail: string }
{ type: "stage_progress", stage: StageId, progress: 0-1, detail: string }
{ type: "stage_done",     stage: StageId, progress: 1,   detail: string }
{ type: "stage_error",    stage: StageId, detail: string }

// Per-scene progress (during video_gen stage)
{ type: "scene_progress", stage: "video_gen",
  scene_num: number, total: number, progress: 0-1, detail: string }

// Terminal events
{ type: "pipeline_done",      output_path: string }
{ type: "pipeline_error",     error: string }
{ type: "pipeline_cancelled"  }

type StageId = "tts" | "llm" | "video_gen" | "assembly"
```

## API contracts

### VEXYL-TTS (WebSocket ws://localhost:8080)

```
Client connects → Server sends:
{"type":"ready","model":"indic-parler-tts","sample_rate":44100,"languages":[...]}

Client sends:
{"type":"synthesize","text":"...","lang":"hi-IN","style":"default","request_id":"xyz"}

Server responds:
{"type":"audio","request_id":"xyz","audio_b64":"...","sample_rate":44100,"cached":false,"latency_ms":1500}
```

### Ollama (HTTP http://localhost:11434)

```
GET  /api/tags
  → {"models":[{"name":"llama3.2:3b",...},...]}

POST /api/generate
  Body: {"model":"llama3.2:3b","system":"...","prompt":"...","stream":false,"format":"json"}
  → {"response":"[{...}]","done":true,...}
```

### Video Studio KH (HTTP http://localhost:47872)

```
GET  /api/health
  → {"ok":true,"version":"..."}

POST /api/generate/txt2video
  Body: {"repo":"mlx-community/Lance-3B-Video-bf16","prompt":"...","width":512,"height":512,
         "frames":17,"fps":12,"steps":30,"guidance":4.0,"seed":-1}
  → {"job":{"id":"abc","state":"queued","progress":0,...}}

GET  /api/generate/jobs/{id}
  → {"job":{"id":"abc","state":"done|running|error","progress":0.0-1.0,
             "stage":"generating","output_url":"/api/generate/jobs/{id}/video"}}

GET  /api/generate/jobs/{id}/video
  → MP4 binary (Content-Type: video/mp4)
```

## Database schema

**SQLite at `~/.hindi-video-studio/projects.db`**

```sql
CREATE TABLE projects (
  id           TEXT PRIMARY KEY,         -- UUID
  name         TEXT NOT NULL,
  workflow_type TEXT NOT NULL,           -- 'script_to_video' | 'audio_to_video'
  script       TEXT,
  audio_path   TEXT,
  srt_path     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'|'tts'|'llm'|'video_gen'|'assembly'|'done'|'error'
  created_at   DATETIME,
  output_path  TEXT
);

CREATE TABLE scenes (
  id           TEXT PRIMARY KEY,         -- UUID
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  scene_num    REAL NOT NULL,
  prompt       TEXT,
  scene_title  TEXT,
  start_s      REAL,
  end_s        REAL,
  video_path   TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
  -- 'pending'|'generating'|'done'|'error'
);
```

## File storage layout

```
~/.hindi-video-studio/
├── projects.db
├── settings.json
└── projects/
    └── {uuid}/
        ├── narration.wav        (VEXYL-TTS output)
        ├── narration.srt        (faster-whisper transcription)
        ├── captions.ass         (ASS subtitle file for FFmpeg)
        ├── concat.txt           (FFmpeg concat demuxer list)
        ├── scenes/
        │   ├── scene_001.mp4    (Video Studio KH output)
        │   ├── scene_002.mp4
        │   └── ...
        └── output_{quality}.mp4 (Final assembled video)
```

## ASS caption format

Generated by `services/captions.py`. Key style settings:

```
Style: Devanagari,Noto Sans Devanagari,52,
  PrimaryColour=&H00FFFFFF,  (white text)
  OutlineColour=&H00000000,  (black outline)
  Outline=2, Shadow=1,
  Alignment=2,               (bottom center)
  MarginV=30

Style: Latin,Inter,52,...    (same styling for Latin segments)
```

Each dialogue line carries `{\fad(150,100)}` for 150ms fade-in and 100ms fade-out.
Script detection: if a line contains Unicode U+0900–U+097F it uses the Devanagari style, otherwise Latin.

## Settings file

`~/.hindi-video-studio/settings.json`:
```json
{
  "tts_url": "http://localhost:7700",
  "ollama_url": "http://localhost:11434",
  "video_studio_url": "http://localhost:47872",
  "default_model": "lance-3b",
  "default_quality": "final",
  "background_music_enabled": false
}
```

The backend reads these settings at pipeline start. The TTS WebSocket URL is derived from `tts_url` by replacing `http://` → `ws://`.
