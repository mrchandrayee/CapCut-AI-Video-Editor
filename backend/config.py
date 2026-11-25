"""
Configuration and directory resolution for DRISHQAN / Studio Backend.
Safely resolves data directories without crashing on permission errors.
"""
from __future__ import annotations

import os
from pathlib import Path


def get_data_dir() -> Path:
    env_dir = os.environ.get("STUDIO_DATA_DIR")
    if env_dir:
        p = Path(env_dir)
        try:
            p.mkdir(parents=True, exist_ok=True)
            return p
        except Exception:
            pass

    try:
        drishqan = Path.home() / ".drishqan"
        if drishqan.exists():
            return drishqan
    except Exception:
        pass

    try:
        hindi = Path.home() / ".hindi-video-studio"
        hindi.mkdir(parents=True, exist_ok=True)
        return hindi
    except Exception:
        pass

    fallback = Path("/tmp/.hindi-video-studio")
    try:
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback
    except Exception:
        return Path(".")


def get_projects_dir() -> Path:
    p = get_data_dir() / "projects"
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return p


def get_settings_path() -> Path:
    return get_data_dir() / "settings.json"


def get_db_path() -> str:
    return os.environ.get(
        "DRISHQAN_DB",
        os.environ.get("HINDI_STUDIO_DB", str(get_data_dir() / "projects.db")),
    )
