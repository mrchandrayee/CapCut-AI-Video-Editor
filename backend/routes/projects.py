"""
Projects routes:
  GET  /api/projects
  POST /api/projects
  GET  /api/projects/{id}
  DELETE /api/projects/{id}
"""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.models import Project, Scene, get_db

router = APIRouter()

import os
_DEFAULT_DATA_DIR = (
    Path.home() / ".drishqan"
    if (Path.home() / ".drishqan").exists() or not (Path.home() / ".hindi-video-studio").exists()
    else Path.home() / ".hindi-video-studio"
)
_DATA_DIR = Path(
    os.environ.get(
        "DRISHQAN_DATA_DIR",
        os.environ.get("STUDIO_DATA_DIR", str(_DEFAULT_DATA_DIR)),
    )
)
PROJECTS_DIR = _DATA_DIR / "projects"


class CreateProjectBody(BaseModel):
    name: str
    workflow_type: str = "script_to_video"
    script: str | None = None
    audio_path: str | None = None
    srt_path: str | None = None


@router.get("/api/projects")
def list_projects(db: Session = Depends(get_db)) -> dict:
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return {"projects": [p.to_dict() for p in projects]}


@router.post("/api/projects")
def create_project(body: CreateProjectBody, db: Session = Depends(get_db)) -> dict:
    if body.workflow_type not in ("script_to_video", "audio_to_video"):
        raise HTTPException(status_code=400, detail="workflow_type must be 'script_to_video' or 'audio_to_video'")
    if body.workflow_type == "script_to_video" and not body.script:
        raise HTTPException(status_code=400, detail="script is required for script_to_video workflow")
    if body.workflow_type == "audio_to_video" and not (body.audio_path and body.srt_path):
        raise HTTPException(status_code=400, detail="audio_path and srt_path are required for audio_to_video workflow")

    project = Project(
        id=str(uuid.uuid4()),
        name=body.name,
        workflow_type=body.workflow_type,
        script=body.script,
        audio_path=body.audio_path,
        srt_path=body.srt_path,
        status="pending",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Create project directory
    project_dir = PROJECTS_DIR / project.id
    project_dir.mkdir(parents=True, exist_ok=True)

    return {"project": project.to_dict()}


@router.get("/api/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project": project.to_dict()}


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete files from disk
    project_dir = PROJECTS_DIR / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir)

    db.delete(project)
    db.commit()
    return {"deleted": project_id}


class UpdateProjectBody(BaseModel):
    name: str | None = None
    script: str | None = None
    status: str | None = None
    workflow_type: str | None = None


@router.patch("/api/projects/{project_id}")
def update_project(project_id: str, body: UpdateProjectBody, db: Session = Depends(get_db)) -> dict:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.name is not None:
        cleaned = body.name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Project name cannot be empty")
        project.name = cleaned

    if body.script is not None:
        project.script = body.script
        # Persist script to project directory file for parity
        try:
            project_dir = PROJECTS_DIR / project_id
            project_dir.mkdir(parents=True, exist_ok=True)
            (project_dir / "script.txt").write_text(body.script, encoding="utf-8")
        except Exception as exc:
            pass

    if body.status is not None:
        project.status = body.status

    if body.workflow_type is not None:
        if body.workflow_type not in ("script_to_video", "audio_to_video"):
            raise HTTPException(status_code=400, detail="Invalid workflow_type")
        project.workflow_type = body.workflow_type

    db.commit()
    db.refresh(project)
    return {"project": project.to_dict(), "saved": True}
