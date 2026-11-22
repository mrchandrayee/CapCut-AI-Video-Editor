# Hindi Video Studio — Code Review (Pass 2)

## Evidence Summary

**Commits reviewed:** `424af3f` (HEAD — fix B1 and B2), `125d47b` (gitignore), `758c1c5` (initial implementation).  
**Verification evidence:** Commit message records `python3 -m py_compile` on all 11 non-empty backend `.py` files — zero syntax errors.  
**Prior blockers:** B1 (duplicate `-map 0:v:0` in assembly.py) and B2 (health.py ignoring settings.json) were raised in the previous review pass and are both addressed in `424af3f`.

---

## Prior Blocker Resolution

### B1 — Duplicate `-map 0:v:0` (RESOLVED)

**File:** `backend/services/assembly.py`  
**Fix:** `cmd = inputs + ["-map", "0:v:0"]` was replaced with `cmd = inputs[:]`, removing the unconditional pre-branch mapping. The `else` (no-music) branch now explicitly adds `-map 0:v:0` alongside `-vf` and `-map 1:a:0`. The `has_music` branch continues to map only `[vout]` and `[aout]` from `filter_complex`.  
**Verified:** Lines 214–228 of assembly.py match the corrected structure exactly. No duplicate video map remains in either branch. ✅

### B2 — Health endpoint ignoring settings.json (RESOLVED)

**File:** `backend/routes/health.py`  
**Fix:** A `_load_settings()` function (matching the pattern in `settings.py`) was added that reads `~/.hindi-video-studio/settings.json` with key-merged defaults. `health_check()` now reads all three service URLs from that merged dict, with `os.environ.get()` as a final fallback for any unset key.  
**Verified:** Lines 17–94 of the updated `health.py` show `_load_settings()` returning the merged dict, and the three URL variables using `settings.get(...) or os.environ.get(...)`. ✅

---

## Full Requirement Check (Pass 2)

### 1. Correctness — backend binding
`backend/main.py` line 103: `uvicorn.run("main:app", host="127.0.0.1", port=8765, ...)`. No `0.0.0.0` anywhere. ✅

### 2. Services do not start external processes
`TTSService`, `LLMService`, `VideoService` — all use `websockets.connect` or `aiohttp` HTTP calls only. No `subprocess`/`spawn` for external services. ✅

### 3. Completeness — required files
All files from the project structure are present and non-empty:
- `backend/main.py`, `backend/db/models.py`, `backend/requirements.txt`
- `backend/services/`: tts.py, llm.py, video.py, assembly.py, captions.py
- `backend/routes/`: health.py, pipeline.py, projects.py, settings.py
- `frontend/src/components/`: Sidebar, ScriptEditor, PipelineView, SceneGallery, Settings, ExportPanel
- `electron/main.js`, `electron/preload.js`
- Both workflow types implemented in `pipeline.py`
✅

### 4. API contracts
- **VEXYL-TTS:** WS connect → `{"type":"ready"}` → send `{"type":"synthesize",...}` → recv `{"type":"audio",...}`. Protocol matches server implementation. ✅
- **Video Studio KH:** `POST /api/generate/txt2video`, `GET /api/generate/jobs/{id}`, video download via `output_url`. All fields match the server's `Txt2VideoBody` and `VideoJob.serialize()`. ✅
- **Ollama:** `GET /api/tags`, `POST /api/generate` with standard fields. ✅

### 5. Safety
No hardcoded secrets, passwords, tokens, or API keys. All external URLs are env-var overridable. Backend binds to `127.0.0.1`. ✅

### 6. Frontend Settings.jsx
- URL input fields for all three services. ✅
- "Test All Connections" calls `GET /api/health`. ✅
- `HealthRow` renders status dot, latency, model name. ✅
- When a service is down, `HOW_TO_START` block shows title, `<pre>`-formatted command, and note for each service. ✅
- Backend `health.py` now reads from settings.json, so the probed URLs match what the user configured. ✅

### 7. FFmpeg — `tpad=stop_mode=clone` and captions
- `tpad=stop_mode=clone` present in `vf` string at line 208. ✅
- No-music path: `-vf vf -map 0:v:0 -map 1:a:0`. ✅
- Music path: `filter_complex` with `[0:v]{vf}[vout]` and `amix`→`[aout]`, mapped via `[vout]`/`[aout]`. ✅
- `captions.py` produces valid ASS with `[Script Info]`, `[V4+ Styles]`, `[Events]` sections, correct timestamp format, and per-line Devanagari/Latin style detection. ✅

### 8. Electron — Python process kill on quit
- `app.on('before-quit')` → `stopBackend()` ✅
- `app.on('will-quit')` → `stopBackend()` ✅
- `stopBackend()`: SIGTERM → 3s → SIGKILL ✅

### 9. SQLite path
`~/.hindi-video-studio/projects.db` per requirement. ✅

---

## Pre-existing items (out of scope for this pass)

- `ScriptEditor.jsx` `handleSave` is a no-op; there is no PATCH endpoint to update the script after project creation. Changes typed in the editor after creation are not persisted to the DB and are therefore silently ignored by the pipeline. This was present in the initial commit and is unchanged by the HEAD commit.
- `scale_w, scale_h = scale.split(":")` in `assembly.py` line 206 is an unused destructuring. Pre-existing; not introduced by this change.

---

## Verdict

**APPROVED.** Both prior blockers (B1, B2) are correctly resolved. No new blockers introduced. All reviewed requirements are met.
