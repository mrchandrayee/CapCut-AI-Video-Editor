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

PROJECTS_DIR = Path.home() / ".hindi-video-studio" / "projects"


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
