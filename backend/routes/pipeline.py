"""
Pipeline routes:
  POST /api/pipeline/{project_id}/run    — start pipeline async
  POST /api/pipeline/{project_id}/cancel — cancel
  GET  /api/pipeline/{project_id}/status — current status
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import get_projects_dir, get_settings_path
from db.models import Project, Scene, SessionLocal, get_db
from services.assembly import AssemblyService
from services.captions import CaptionsService
from services.llm import LLMService
from services.tts import TTSService
from services.video import VideoService

log = logging.getLogger(__name__)
router = APIRouter()

# Track active pipeline tasks: project_id → asyncio.Task
_active_tasks: dict[str, asyncio.Task] = {}


class RunPipelineBody(BaseModel):
    model: str = "lance-3b"
    quality: str = "final"
    music_path: Optional[str] = None
    speaker: str = "default"
    language: str = "hi-IN"


@router.post("/api/pipeline/{project_id}/run")
async def run_pipeline(project_id: str, body: RunPipelineBody) -> dict:
    """Start the full pipeline in the background. Returns immediately."""
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            log.info(f"[Pipeline] Project {project_id} auto-created for pipeline run")
            project = Project(
                id=project_id,
                name="मेरा पहला AI वीडियो" if project_id == "demo-project" else f"Project {project_id}",
                workflow_type="script_to_video",
                script="आज के इस वीडियो में हम जानेंगे कि AI की मदद से कैसे बिना कैमरे के शानदार वीडियो बनाए जा सकते हैं। कटफ्लो और दृश्यम तकनीक से आप सिर्फ एक प्रॉम्प्ट लिखकर पूरी रील तैयार कर सकते हैं।",
                status="pending",
            )
            db.add(project)
            db.commit()
            db.refresh(project)
        if project.status not in ("pending", "error", "done"):
            raise HTTPException(status_code=409, detail=f"Pipeline already running (status: {project.status})")
    finally:
        db.close()

    # Cancel existing task if any
    existing = _active_tasks.get(project_id)
    if existing and not existing.done():
        existing.cancel()

    task = asyncio.create_task(
        _run_pipeline(project_id, body),
        name=f"pipeline-{project_id}",
    )
    _active_tasks[project_id] = task

    return {"started": True, "project_id": project_id}


@router.post("/api/pipeline/{project_id}/cancel")
async def cancel_pipeline(project_id: str) -> dict:
    """Cancel the in-progress pipeline for a project."""
    task = _active_tasks.get(project_id)
    if not task or task.done():
        return {"cancelled": False, "reason": "No active pipeline"}
    task.cancel()

    # Mark project as error/pending so user can retry
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = "pending"
            db.commit()
    finally:
        db.close()

    return {"cancelled": True}


@router.get("/api/pipeline/{project_id}/status")
def pipeline_status(project_id: str, db: Session = Depends(get_db)) -> dict:
    """Return current project status and scene statuses."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    task = _active_tasks.get(project_id)
    running = bool(task and not task.done())
    return {
        "project_id": project_id,
        "status": project.status,
        "output_path": project.output_path,
        "running": running,
        "scenes": [s.to_dict() for s in project.scenes],
    }


# ── Pipeline orchestration ───────────────────────────────────────────────────

async def _run_pipeline(project_id: str, body: RunPipelineBody) -> None:
    """
    Full pipeline coroutine.
    Progress is broadcast via the WebSocket manager.
    All DB writes use a fresh session per stage.
    """
    from main import manager  # import here to avoid circular import

    async def ws_send(msg: dict) -> None:
        await manager.broadcast(project_id, msg)

    # Read settings for URLs
    tts_url = _read_setting("tts_url", os.environ.get("TTS_URL", "http://localhost:7700"))
    ollama_url = _read_setting("ollama_url", os.environ.get("OLLAMA_URL", "http://localhost:11434"))
    video_url = _read_setting("video_studio_url", os.environ.get("VIDEO_STUDIO_URL", "http://localhost:47872"))

    tts_service = TTSService(tts_url)
    llm_service = LLMService(ollama_url)
    video_service = VideoService(video_url)
    captions_service = CaptionsService()
    assembly_service = AssemblyService()

    # Determine WS URL for VEXYL-TTS
    ws_tts_url = tts_url.replace("http://", "ws://").replace("https://", "wss://")
    tts_service.ws_url = ws_tts_url

    try:
        # ── Load project ──────────────────────────────────────────────
        project = _get_project(project_id)

        await ws_send({"type": "stage_start", "stage": "init", "detail": "Starting pipeline..."})
        _set_project_status(project_id, "pending")

        # ── Workflow A: script_to_video ───────────────────────────────
        if project.workflow_type == "script_to_video":
            script = project.script
            if not script or not script.strip():
                raise RuntimeError("Script is empty. Add text in the Script Editor before running.")

            # Stage 1: TTS
            await ws_send({"type": "stage_start", "stage": "tts", "progress": 0,
                           "detail": "Generating narration audio..."})
            _set_project_status(project_id, "tts")

            tts_result = await tts_service.generate(
                script=script,
                project_id=project_id,
                speaker=body.speaker,
                language=body.language,
            )
            narration_path = tts_result["audio_path"]
            srt_path = tts_result["srt_path"]
            duration = tts_result["duration"]

            await ws_send({"type": "stage_done", "stage": "tts", "progress": 1.0,
                           "detail": f"Audio generated ({duration:.1f}s)"})

            # Stage 2: LLM scene segmentation
            await ws_send({"type": "stage_start", "stage": "llm", "progress": 0,
                           "detail": "Analysing script for scenes..."})
            _set_project_status(project_id, "llm")

            scenes = await llm_service.segment_script(script, duration, [])
            _save_scenes(project_id, scenes)

            await ws_send({"type": "stage_done", "stage": "llm", "progress": 1.0,
                           "detail": f"{len(scenes)} scenes identified"})

        else:
            # Workflow B: audio_to_video
            project = _get_project(project_id)
            narration_path = project.audio_path
            srt_path = project.srt_path
            duration = None

            # Stage 1: skip TTS (already have audio)
            await ws_send({"type": "stage_start", "stage": "tts", "progress": 1.0,
                           "detail": "Using provided audio"})
            await ws_send({"type": "stage_done", "stage": "tts", "progress": 1.0,
                           "detail": "Using provided audio file"})

            # Stage 2: LLM from SRT
            await ws_send({"type": "stage_start", "stage": "llm", "progress": 0,
                           "detail": "Analysing SRT for visual prompts..."})
            _set_project_status(project_id, "llm")

            srt_content = Path(srt_path).read_text(encoding="utf-8")
            scenes = await llm_service.prompts_from_srt(srt_content)
            _save_scenes(project_id, scenes)

            await ws_send({"type": "stage_done", "stage": "llm", "progress": 1.0,
                           "detail": f"{len(scenes)} scenes from SRT"})

        # ── Stage 3: Video generation (sequential) ───────────────────
        await ws_send({"type": "stage_start", "stage": "video_gen", "progress": 0,
                       "detail": f"Generating {len(scenes)} scene clips..."})
        _set_project_status(project_id, "video_gen")

        total = len(scenes)
        for i, scene in enumerate(scenes):
            _set_scene_status(project_id, scene["scene_num"], "generating")
            scene_duration = scene.get("end_s", 3.0) - scene.get("start_s", 0.0)

            try:
                video_path = await video_service.generate_scene(
                    scene_num=scene["scene_num"],
                    total=total,
                    prompt=scene["visual_prompt"],
                    model=body.model,
                    duration=scene_duration,
                    project_id=project_id,
                    ws_callback=ws_send,
                )
                _set_scene_video(project_id, scene["scene_num"], video_path, "done")
                # Update in-memory list for assembly
                scenes[i]["video_path"] = video_path

            except Exception as exc:
                log.error(f"[Pipeline] Scene {scene['scene_num']} failed: {exc}")
                _set_scene_status(project_id, scene["scene_num"], "error")
                await ws_send({
                    "type": "stage_error",
                    "stage": "video_gen",
                    "detail": f"Scene {scene['scene_num']} failed: {exc}",
                })
                # Continue with remaining scenes
                scenes[i]["video_path"] = None

            overall = (i + 1) / total
            await ws_send({
                "type": "stage_progress",
                "stage": "video_gen",
                "progress": overall,
                "detail": f"Generated {i + 1}/{total} scenes",
            })

        await ws_send({"type": "stage_done", "stage": "video_gen", "progress": 1.0,
                       "detail": "All scenes generated"})

        # ── Stage 4: Assembly ─────────────────────────────────────────
        await ws_send({"type": "stage_start", "stage": "assembly", "progress": 0,
                       "detail": "Assembling final video..."})
        _set_project_status(project_id, "assembly")

        # Reload scenes from DB with video_paths
        db_scenes = _load_scenes(project_id)

        # Generate ASS captions
        project_dir = get_projects_dir() / project_id
        ass_path = str(project_dir / "captions.ass")
        if srt_path and Path(srt_path).exists():
            captions_service.srt_to_ass(srt_path, ass_path)
        else:
            project = _get_project(project_id)
            captions_service.generate_placeholder_ass(
                project.script or "", duration or 60.0, ass_path
            )

        output_path = await assembly_service.assemble(
            project_id=project_id,
            scenes=db_scenes,
            narration_path=narration_path,
            srt_path=srt_path or "",
            music_path=body.music_path,
            quality=body.quality,
            ass_path=ass_path,
            ws_callback=ws_send,
        )

        # Mark done
        _set_project_status(project_id, "done", output_path=output_path)
        await ws_send({
            "type": "stage_done",
            "stage": "assembly",
            "progress": 1.0,
            "detail": f"Video ready: {output_path}",
        })
        await ws_send({
            "type": "pipeline_done",
            "output_path": output_path,
        })
        log.info(f"[Pipeline] Done: {output_path}")

    except asyncio.CancelledError:
        log.info(f"[Pipeline] Cancelled: {project_id}")
        _set_project_status(project_id, "pending")
        await ws_send({"type": "pipeline_cancelled"})

    except Exception as exc:
        log.error(f"[Pipeline] Error: {exc}", exc_info=True)
        _set_project_status(project_id, "error")
        await ws_send({
            "type": "pipeline_error",
            "error": str(exc),
        })


# ── DB helpers ───────────────────────────────────────────────────────────────

def _read_setting(key: str, default: str) -> str:
    import json
    settings_path = get_settings_path()
    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text())
            return data.get(key, default)
        except Exception:
            pass
    return default


def _get_project(project_id: str) -> Project:
    db = SessionLocal()
    try:
        p = db.query(Project).filter(Project.id == project_id).first()
        if not p:
            p = Project(
                id=project_id,
                name="मेरा पहला AI वीडियो" if project_id == "demo-project" else f"Project {project_id}",
                workflow_type="script_to_video",
                script="आज के इस वीडियो में हम जानेंगे कि AI की मदद से कैसे बिना कैमरे के शानदार वीडियो बनाए जा सकते हैं। कटफ्लो और दृश्यम तकनीक से आप सिर्फ एक प्रॉम्प्ट लिखकर पूरी रील तैयार कर सकते हैं।",
                status="pending",
            )
            db.add(p)
            db.commit()
            db.refresh(p)
        # Detach attributes we need
        project_copy = type("ProjectCopy", (), {
            "id": p.id,
            "workflow_type": p.workflow_type,
            "script": p.script,
            "audio_path": p.audio_path,
            "srt_path": p.srt_path,
        })()
        return project_copy
    finally:
        db.close()


def _set_project_status(project_id: str, status: str, output_path: str | None = None) -> None:
    db = SessionLocal()
    try:
        p = db.query(Project).filter(Project.id == project_id).first()
        if p:
            p.status = status
            if output_path:
                p.output_path = output_path
            db.commit()
    finally:
        db.close()


def _save_scenes(project_id: str, scenes: list[dict]) -> None:
    db = SessionLocal()
    try:
        # Delete existing scenes
        db.query(Scene).filter(Scene.project_id == project_id).delete()
        for s in scenes:
            scene = Scene(
                id=str(uuid.uuid4()),
                project_id=project_id,
                scene_num=s["scene_num"],
                prompt=s.get("visual_prompt", ""),
                scene_title=s.get("scene_title", ""),
                start_s=s.get("start_s"),
                end_s=s.get("end_s"),
                status="pending",
            )
            db.add(scene)
        db.commit()
    finally:
        db.close()


def _set_scene_status(project_id: str, scene_num: int, status: str) -> None:
    db = SessionLocal()
    try:
        s = db.query(Scene).filter(
            Scene.project_id == project_id,
            Scene.scene_num == scene_num
        ).first()
        if s:
            s.status = status
            db.commit()
    finally:
        db.close()


def _set_scene_video(project_id: str, scene_num: int, video_path: str, status: str) -> None:
    db = SessionLocal()
    try:
        s = db.query(Scene).filter(
            Scene.project_id == project_id,
            Scene.scene_num == scene_num
        ).first()
        if s:
            s.video_path = video_path
            s.status = status
            db.commit()
    finally:
        db.close()


def _load_scenes(project_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        scenes = db.query(Scene).filter(Scene.project_id == project_id).order_by(Scene.scene_num).all()
        return [s.to_dict() for s in scenes]
    finally:
        db.close()
