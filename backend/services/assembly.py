"""
Assembly Service — FFmpeg pipeline to combine scene clips into the final MP4.

Pipeline:
1. Write a concat list file for the scene clips.
2. Run FFmpeg:
   - Input 0: concatenated clips (via concat demuxer), padded with last frame
   - Input 1: narration WAV
   - Input 2: background music MP3 (optional)
   - Subtitle overlay via ASS filter
   - Scale to 1920x1080 (or 1280x720 for draft)
   - Output H.264 MP4
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Callable, Optional

import aiofiles

log = logging.getLogger(__name__)

QUALITY_PRESETS = {
    "final": {
        "scale": "1920:1080",
        "crf": "18",
        "preset": "slow",
        "label": "1080p",
    },
    "draft": {
        "scale": "1280:720",
        "crf": "28",
        "preset": "fast",
        "label": "720p",
    },
}

# Font directory containing Noto Sans Devanagari (system fonts on macOS)
MACOS_FONT_DIRS = [
    "/Library/Fonts",
    "/System/Library/Fonts",
    os.path.expanduser("~/Library/Fonts"),
    "/System/Library/Fonts/Supplemental",
]


def _find_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "FFmpeg not found. Install with: brew install ffmpeg"
        )
    return ffmpeg


def _find_font_dir() -> str:
    """Return the first font directory that contains a Noto Devanagari font."""
    for d in MACOS_FONT_DIRS:
        p = Path(d)
        if p.exists():
            if list(p.glob("*Devanagari*")) or list(p.glob("*Noto*")):
                return str(p)
    return MACOS_FONT_DIRS[0]


class AssemblyService:
    async def assemble(
        self,
        project_id: str,
        scenes: list[dict],
        narration_path: str,
        srt_path: str,
        music_path: Optional[str],
        quality: str,
        ass_path: str,
        ws_callback: Optional[Callable] = None,
    ) -> str:
        """
        Assemble all scene clips into a final MP4.

        Args:
            project_id: used for output directory
            scenes: list of {scene_num, video_path, ...} — only entries with video_path are used
            narration_path: path to narration WAV
            srt_path: path to narration SRT (used if ass_path not ready)
            music_path: optional background music MP3
            quality: 'final' or 'draft'
            ass_path: path to ASS caption file
            ws_callback: coroutine called with progress dict

        Returns:
            path to output MP4
        """
        ffmpeg = _find_ffmpeg()
        preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["final"])
        projects_dir = Path.home() / ".hindi-video-studio" / "projects" / project_id
        projects_dir.mkdir(parents=True, exist_ok=True)
        output_path = projects_dir / f"output_{quality}.mp4"

        # Filter scenes that have a valid video clip
        ready_scenes = [s for s in scenes if s.get("video_path") and Path(s["video_path"]).exists()]
        if not ready_scenes:
            raise RuntimeError("No scene clips available to assemble")

        if ws_callback:
            await ws_callback({
                "type": "stage_progress",
                "stage": "assembly",
                "progress": 0.1,
                "detail": f"Preparing {len(ready_scenes)} clips...",
            })

        # Write concat list
        concat_file = projects_dir / "concat.txt"
        async with aiofiles.open(concat_file, "w") as f:
            for scene in sorted(ready_scenes, key=lambda s: s["scene_num"]):
                vp = Path(scene["video_path"]).resolve()
                await f.write(f"file '{vp}'\n")

        log.info(f"[Assembly] Concat list: {concat_file}")

        # Build FFmpeg command
        cmd = await self._build_ffmpeg_cmd(
            ffmpeg=ffmpeg,
            concat_file=str(concat_file),
            narration_path=narration_path,
            music_path=music_path,
            ass_path=ass_path,
            scale=preset["scale"],
            crf=preset["crf"],
            preset_name=preset["preset"],
            output_path=str(output_path),
        )

        if ws_callback:
            await ws_callback({
                "type": "stage_progress",
                "stage": "assembly",
                "progress": 0.2,
                "detail": "Running FFmpeg...",
            })

        log.info(f"[Assembly] FFmpeg command: {' '.join(cmd)}")

        # Run FFmpeg
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace")
            log.error(f"[Assembly] FFmpeg failed:\n{err}")
            raise RuntimeError(f"FFmpeg assembly failed (exit {proc.returncode}):\n{err[-2000:]}")

        if ws_callback:
            await ws_callback({
                "type": "stage_done",
                "stage": "assembly",
                "progress": 1.0,
                "detail": f"Output: {output_path}",
            })

        log.info(f"[Assembly] Done: {output_path}")
        return str(output_path)

    async def _build_ffmpeg_cmd(
        self,
        ffmpeg: str,
        concat_file: str,
        narration_path: str,
        music_path: Optional[str],
        ass_path: str,
        scale: str,
        crf: str,
        preset_name: str,
        output_path: str,
    ) -> list[str]:
        """Build the FFmpeg command list."""
        font_dir = _find_font_dir()
        has_music = music_path and Path(music_path).exists()

        # Escape paths for FFmpeg subtitles filter (colons and backslashes need escaping)
        ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:")

        # Build input list
        inputs = [
            ffmpeg, "-y",
            "-f", "concat", "-safe", "0", "-i", concat_file,
            "-i", narration_path,
        ]
        if has_music:
            inputs += ["-i", music_path]

        # Build filter complex
        # 1. Pad shorter clips with last frame
        # 2. Scale with letterbox
        # 3. Apply captions
        scale_w, scale_h = scale.split(":")
        vf = (
            f"tpad=stop_mode=clone,"
            f"scale={scale}:force_original_aspect_ratio=decrease,"
            f"pad={scale}:(ow-iw)/2:(oh-ih)/2,"
            f"subtitles='{ass_escaped}':fontsdir='{font_dir}'"
        )

        cmd = inputs[:]

        if has_music:
            # Mix narration and music: narration at 1.0, music at 0.15 (-20dB relative)
            cmd += [
                "-filter_complex",
                f"[1:a][2:a]amix=inputs=2:weights='1 0.15':duration=first[aout];[0:v]{vf}[vout]",
                "-map", "[vout]",
                "-map", "[aout]",
            ]
        else:
            cmd += [
                "-vf", vf,
                "-map", "0:v:0",
                "-map", "1:a:0",
            ]

        # Output codec settings
        cmd += [
            "-c:v", "libx264",
            "-crf", crf,
            "-preset", preset_name,
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            "-shortest",
            output_path,
        ]

        return cmd
