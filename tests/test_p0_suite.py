import os
import sys
import tempfile
import json
import subprocess
import pytest
from pathlib import Path

# Setup paths
repo_root = Path(__file__).resolve().parent.parent
backend_dir = repo_root / "backend"
sys.path.insert(0, str(backend_dir))

# Configure temporary data and DB directory
temp_data_dir = tempfile.mkdtemp()
os.environ["STUDIO_DATA_DIR"] = temp_data_dir
os.environ["HINDI_STUDIO_DB"] = str(Path(temp_data_dir) / "test_suite.db")

from db.models import init_db, SessionLocal, Project, Scene
from routes.projects import update_project, UpdateProjectBody
from services.llm import validate_scenes
from services.tts import _generate_unaligned_sentence_srt, _get_audio_file_duration
from fastapi import HTTPException


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()
    yield


# ── 1. start.sh Dynamic Directory Tests ─────────────────────────────────────

def test_start_sh_has_dynamic_root():
    start_sh = (repo_root / "start.sh").read_text()
    assert "BASH_SOURCE[0]" in start_sh and "pwd" in start_sh
    assert "Users/chandrayee" not in start_sh


def test_start_sh_execution_in_foreign_dir():
    temp_dir = Path(tempfile.mkdtemp())
    test_sh = temp_dir / "test_exec.sh"
    test_sh.write_text("""#!/bin/bash
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "RESOLVED=$ROOT"
""")
    test_sh.chmod(0o755)
    out = subprocess.check_output([str(test_sh)]).decode().strip()
    assert out == f"RESOLVED={temp_dir}"


# ── 2. Project PATCH API & Persistence Tests ─────────────────────────────────

def test_project_patch_api_valid_update():
    db = SessionLocal()
    proj_id = "test-patch-valid-1"
    p = Project(id=proj_id, name="Initial Title", script="Old script", workflow_type="script_to_video")
    db.add(p)
    db.commit()

    body = UpdateProjectBody(name="New Title", script="New persisted script")
    res = update_project(proj_id, body, db)

    assert res["saved"] is True
    assert res["project"]["name"] == "New Title"
    assert res["project"]["script"] == "New persisted script"

    # Verify DB persistence
    db.refresh(p)
    assert p.name == "New Title"
    assert p.script == "New persisted script"

    # Verify Disk file persistence
    script_file = Path(temp_data_dir) / "projects" / proj_id / "script.txt"
    assert script_file.exists()
    assert script_file.read_text(encoding="utf-8") == "New persisted script"
    db.close()


def test_project_patch_api_invalid_id_raises_404():
    db = SessionLocal()
    body = UpdateProjectBody(name="Any")
    with pytest.raises(HTTPException) as excinfo:
        update_project("non-existent-proj-id-xyz", body, db)
    assert excinfo.value.status_code == 404
    db.close()


def test_project_patch_api_empty_name_raises_400():
    db = SessionLocal()
    proj_id = "test-patch-empty-name"
    p = Project(id=proj_id, name="Good Name", script="Script", workflow_type="script_to_video")
    db.add(p)
    db.commit()

    body = UpdateProjectBody(name="    ")
    with pytest.raises(HTTPException) as excinfo:
        update_project(proj_id, body, db)
    assert excinfo.value.status_code == 400
    db.close()


# ── 3. Safe SRT Fallback Tests ───────────────────────────────────────────────

def test_srt_fallback_strictly_bounded_by_audio_duration():
    text = "Yeh pehla sentence hai. Yeh doosra sentence hai. Yeh teesra sentence hai."
    audio_duration = 7.5
    srt = _generate_unaligned_sentence_srt(text, audio_duration)

    assert "00:00:00,000" in srt
    assert "00:00:07,500" in srt
    # Crucial check: 10-minute placeholder must NEVER appear
    assert "00:10:00,000" not in srt


def test_srt_fallback_single_sentence():
    text = "Short narration without punctuation"
    audio_duration = 3.2
    srt = _generate_unaligned_sentence_srt(text, audio_duration)
    assert "00:00:03,200" in srt


# ── 4. Scene Validation Tests ───────────────────────────────────────────────

def test_validate_scenes_valid():
    scenes = [
        {"scene_num": 1, "start_s": 0.0, "end_s": 4.0, "visual_prompt": "Cinematic mountain view", "scene_title": "Scene 1"},
        {"scene_num": 2, "start_s": 4.0, "end_s": 8.0, "visual_prompt": "River flowing sunset", "scene_title": "Scene 2"}
    ]
    res = validate_scenes(scenes, total_duration=8.0)
    assert len(res) == 2
    assert res[0]["scene_num"] == 1
    assert res[1]["scene_num"] == 2


def test_validate_scenes_negative_start_raises():
    scenes = [
        {"scene_num": 1, "start_s": -2.0, "end_s": 4.0, "visual_prompt": "Prompt", "scene_title": "Title"}
    ]
    with pytest.raises(ValueError, match="negative"):
        validate_scenes(scenes)


def test_validate_scenes_end_before_start_raises():
    scenes = [
        {"scene_num": 1, "start_s": 6.0, "end_s": 2.0, "visual_prompt": "Prompt", "scene_title": "Title"}
    ]
    with pytest.raises(ValueError, match="strictly greater"):
        validate_scenes(scenes)


def test_validate_scenes_empty_prompt_raises():
    scenes = [
        {"scene_num": 1, "start_s": 0.0, "end_s": 3.0, "visual_prompt": "   ", "scene_title": "Title"}
    ]
    with pytest.raises(ValueError, match="empty"):
        validate_scenes(scenes)


def test_validate_scenes_chronological_order_raises():
    scenes = [
        {"scene_num": 1, "start_s": 5.0, "end_s": 8.0, "visual_prompt": "P1", "scene_title": "T1"},
        {"scene_num": 2, "start_s": 2.0, "end_s": 6.0, "visual_prompt": "P2", "scene_title": "T2"}
    ]
    with pytest.raises(ValueError, match="chronological"):
        validate_scenes(scenes)


def test_validate_scenes_configurable_gaps():
    scenes = [
        {"scene_num": 1, "start_s": 0.0, "end_s": 3.0, "visual_prompt": "P1", "scene_title": "T1"},
        {"scene_num": 2, "start_s": 5.0, "end_s": 8.0, "visual_prompt": "P2", "scene_title": "T2"}
    ]
    # Gaps allowed by default
    res = validate_scenes(scenes, allow_gaps=True)
    assert len(res) == 2

    # Gaps disallowed when configured
    with pytest.raises(ValueError, match="gap detected"):
        validate_scenes(scenes, allow_gaps=False)


# ── 5. Packaging & Metadata Integrity Tests ─────────────────────────────────

def test_package_json_metadata():
    pkg = json.loads((repo_root / "package.json").read_text())
    assert pkg["repository"]["url"] == "https://github.com/mrchandrayee/CapCut-in-AI-Video-studio.git"
    assert pkg["name"] == "drishqan"
    assert pkg["productName"] == "DRISHQAN"
    assert pkg["build"]["productName"] == "DRISHQAN"
    assert pkg["build"]["appId"] == "com.mrchandrayee.drishqan"
    assert "electron" in pkg["devDependencies"]
    assert "electron" not in pkg.get("dependencies", {})


def test_attribution_file_exists_and_contains_mit_notices():
    attr_file = repo_root / "ATTRIBUTION.md"
    assert attr_file.exists()
    content = attr_file.read_text(encoding="utf-8")
    assert "MIT License" in content
    assert "Hamza Abika" in content
    assert "Cutflow" in content
