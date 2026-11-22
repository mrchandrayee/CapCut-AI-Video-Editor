"""
SQLAlchemy ORM models for Hindi Video Studio.
Database lives at ~/.hindi-video-studio/projects.db
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import (
    Column, DateTime, Enum, Float, ForeignKey, String, Text, create_engine
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

# ── Path setup ───────────────────────────────────────────────────────────────
_DEFAULT_DATA_DIR = (
    Path.home() / ".drishqan"
    if (Path.home() / ".drishqan").exists() or not (Path.home() / ".hindi-video-studio").exists()
    else Path.home() / ".hindi-video-studio"
)
_DB_PATH = os.environ.get(
    "DRISHQAN_DB",
    os.environ.get(
        "HINDI_STUDIO_DB",
        str(_DEFAULT_DATA_DIR / "projects.db"),
    ),
)
_DB_URL = f"sqlite:///{_DB_PATH}"

engine = create_engine(_DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    __allow_unmapped__ = True


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Models ───────────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=_new_id)
    name = Column(String, nullable=False)
    workflow_type = Column(
        Enum("script_to_video", "audio_to_video", name="workflow_type"),
        nullable=False,
        default="script_to_video",
    )
    script = Column(Text, nullable=True)
    audio_path = Column(String, nullable=True)
    srt_path = Column(String, nullable=True)
    status = Column(
        Enum(
            "pending", "tts", "llm", "video_gen", "assembly", "done", "error",
            name="project_status",
        ),
        nullable=False,
        default="pending",
    )
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    output_path = Column(String, nullable=True)

    scenes: list[Scene] = relationship(
        "Scene", back_populates="project", cascade="all, delete-orphan", order_by="Scene.scene_num"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "workflow_type": self.workflow_type,
            "script": self.script,
            "audio_path": self.audio_path,
            "srt_path": self.srt_path,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "output_path": self.output_path,
            "scenes": [s.to_dict() for s in (self.scenes or [])],
        }


class Scene(Base):
    __tablename__ = "scenes"

    id = Column(String, primary_key=True, default=_new_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    scene_num = Column(Float, nullable=False)
    prompt = Column(Text, nullable=True)
    scene_title = Column(String, nullable=True)
    start_s = Column(Float, nullable=True)
    end_s = Column(Float, nullable=True)
    video_path = Column(String, nullable=True)
    status = Column(
        Enum("pending", "generating", "done", "error", name="scene_status"),
        nullable=False,
        default="pending",
    )

    project: Optional[Project] = relationship("Project", back_populates="scenes")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "scene_num": self.scene_num,
            "prompt": self.prompt,
            "scene_title": self.scene_title,
            "start_s": self.start_s,
            "end_s": self.end_s,
            "video_path": self.video_path,
            "status": self.status,
        }


def init_db() -> None:
    """Create all tables (additive — never drops existing data)."""
    Path(_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db() -> Session:
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
