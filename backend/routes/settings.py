"""
Settings routes:
  GET /api/settings
  PUT /api/settings
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

from config import get_settings_path

SETTINGS_PATH = get_settings_path()

DEFAULT_SETTINGS = {
    "tts_url": "http://localhost:7700",
    "ollama_url": "http://localhost:11434",
    "video_studio_url": "http://localhost:47872",
    "default_model": "lance-3b",
    "default_quality": "final",
    "background_music_enabled": False,
}


def _load_settings() -> dict:
    if SETTINGS_PATH.exists():
        try:
            return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_PATH.read_text())}
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)


def _save_settings(data: dict) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, indent=2))


class UpdateSettingsBody(BaseModel):
    tts_url: Optional[str] = None
    ollama_url: Optional[str] = None
    video_studio_url: Optional[str] = None
    default_model: Optional[str] = None
    default_quality: Optional[str] = None
    background_music_enabled: Optional[bool] = None


@router.get("/api/settings")
def get_settings() -> dict:
    return {"settings": _load_settings()}


@router.put("/api/settings")
def update_settings(body: UpdateSettingsBody) -> dict:
    current = _load_settings()
    updates = body.model_dump(exclude_none=True)
    current.update(updates)
    _save_settings(current)
    return {"settings": current}
