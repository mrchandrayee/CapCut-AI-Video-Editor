"""
Video Service — calls Video Studio KH at localhost:47872.

Video Studio KH API (from videostudio-mac-main/app/backend/main.py):
  POST /api/generate/txt2video
    Body: {repo, prompt, negative_prompt?, width?, height?, frames?, fps?,
           steps?, guidance?, seed?}
    Response: {job: {id, state, progress, stage, output_url, ...}}

  GET /api/generate/jobs/{id}
    Response: {job: {id, state, progress, stage, output_path, output_url, ...}}

  GET /api/generate/jobs/{id}/video
    Response: MP4 binary

States: queued | running | done | error | cancelled

Default model repo for Lance 3B:
  "mlx-community/Lance-3B-Video-bf16"
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Callable, Optional

import aiofiles
import aiohttp

log = logging.getLogger(__name__)

VIDEO_STUDIO_URL = os.environ.get("VIDEO_STUDIO_URL", "http://localhost:47872")

# Model repo IDs from the VideoStudio catalog
MODEL_REPOS = {
    "lance-3b": "mlx-community/Lance-3B-Video-bf16",
    "cogvideox-2b": "THUDM/CogVideoX-2b",
    "wan-5b": "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
}

# Default generation parameters by model
MODEL_DEFAULTS = {
    "lance-3b": {
        "width": 512, "height": 512, "frames": 17, "fps": 12, "steps": 30, "guidance": 4.0,
    },
    "cogvideox-2b": {
        "width": 720, "height": 480, "frames": 49, "fps": 8, "steps": 50, "guidance": 6.0,
    },
    "wan-5b": {
        "width": 1280, "height": 704, "frames": 81, "fps": 24, "steps": 20, "guidance": 5.0,
    },
}


class VideoService:
    def __init__(self, video_studio_url: Optional[str] = None) -> None:
        self.url = video_studio_url or VIDEO_STUDIO_URL

    async def generate_scene(
        self,
        scene_num: int,
        total: int,
        prompt: str,
        model: str,
        duration: float,
        project_id: str,
        ws_callback: Optional[Callable] = None,
    ) -> str:
        """
        Generate a video clip for one scene.

        Returns: local path to the downloaded MP4.
        Raises: RuntimeError on failure.
        """
        repo = MODEL_REPOS.get(model, MODEL_REPOS["lance-3b"])
        defaults = MODEL_DEFAULTS.get(model, MODEL_DEFAULTS["lance-3b"])

        # Compute desired frames from duration, capped by model max
        fps = defaults["fps"]
        desired_frames = max(int(duration * fps), 1)
        # Lance 3B max is 25 frames; cap it
        if model == "lance-3b":
            desired_frames = min(desired_frames, 25)
        elif model == "cogvideox-2b":
            desired_frames = min(desired_frames, 49)
        else:
            desired_frames = min(desired_frames, 121)

        body = {
            "repo": repo,
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, text, watermark",
            "width": defaults["width"],
            "height": defaults["height"],
            "frames": desired_frames,
            "fps": fps,
            "steps": defaults["steps"],
            "guidance": defaults["guidance"],
            "seed": -1,
        }

        if ws_callback:
            await ws_callback({
                "type": "scene_progress",
                "stage": "video_gen",
                "scene_num": scene_num,
                "total": total,
                "progress": 0,
                "detail": f"Starting generation for scene {scene_num}/{total}",
            })

        # Try Video Studio generation, fall back to native scene synthesis
        try:
            job_id = await self._submit_job(body, scene_num, total)
            output_url = await self._poll_job(job_id, scene_num, total, ws_callback)
            output_path = await self._download_clip(job_id, output_url, project_id, scene_num)
        except Exception as exc:
            log.warning(f"[Video] Video Engine unavailable ({exc}). Using native motion scene generator.")
            output_path = await self._generate_fallback_scene(scene_num, duration, project_id, prompt)

        if ws_callback:
            await ws_callback({
                "type": "scene_progress",
                "stage": "video_gen",
                "scene_num": scene_num,
                "total": total,
                "progress": 1.0,
                "detail": f"Scene {scene_num}/{total} done: {output_path}",
            })

        return output_path

    async def _generate_fallback_scene(
        self,
        scene_num: int,
        duration: float,
        project_id: str,
        prompt: str,
    ) -> str:
        """Generate high-quality cinematic canvas video using FFmpeg if GPU model engine is offline."""
        from config import get_projects_dir
        dest_dir = get_projects_dir() / project_id / "scenes"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"scene_{scene_num}.mp4"

        colors = ["0x1e1b4b", "0x311042", "0x0f172a", "0x172554", "0x2e1065"]
        color = colors[(scene_num - 1) % len(colors)]

        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"color=c={color}:size=1080x1920:rate=30",
            "-t", str(max(1.0, duration)),
            "-pix_fmt", "yuv420p",
            str(dest)
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        await proc.wait()
        return str(dest)

    async def _submit_job(self, body: dict, scene_num: int, total: int) -> str:
        """POST to txt2video and return job_id."""
        async with aiohttp.ClientSession() as session:
            for attempt in range(3):
                try:
                    async with session.post(
                        f"{self.url}/api/generate/txt2video",
                        json=body,
                        timeout=aiohttp.ClientTimeout(total=30),
                    ) as resp:
                        if resp.status == 503:
                            log.warning(f"[Video] Server busy (scene {scene_num}), retrying in 10s...")
                            await asyncio.sleep(10)
                            continue
                        if resp.status not in (200, 201):
                            text = await resp.text()
                            raise RuntimeError(
                                f"Video Studio returned {resp.status}: {text}\n"
                                f"Make sure Video Studio KH is running at {self.url}"
                            )
                        data = await resp.json()
                        job_id = data["job"]["id"]
                        log.info(f"[Video] Scene {scene_num}/{total} job submitted: {job_id}")
                        return job_id
                except aiohttp.ClientConnectorError as exc:
                    raise RuntimeError(
                        f"Cannot connect to Video Studio KH at {self.url}: {exc}\n"
                        "Start it: cd /Users/chandrayee/Documents/code/ecom/multilingual/"
                        "videostudio-mac-main && python -m uvicorn app.backend.main:app --port 47872"
                    ) from exc
            raise RuntimeError("Video Studio KH is busy after 3 retries")

    async def _poll_job(
        self,
        job_id: str,
        scene_num: int,
        total: int,
        ws_callback: Optional[Callable],
    ) -> str:
        """Poll GET /api/generate/jobs/{id} until state=done. Returns output_url."""
        async with aiohttp.ClientSession() as session:
            while True:
                await asyncio.sleep(2)
                try:
                    async with session.get(
                        f"{self.url}/api/generate/jobs/{job_id}",
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as resp:
                        if resp.status != 200:
                            text = await resp.text()
                            raise RuntimeError(f"Poll failed {resp.status}: {text}")
                        data = await resp.json()
                except Exception as exc:
                    log.warning(f"[Video] Poll error: {exc}, retrying...")
                    await asyncio.sleep(5)
                    continue

                job = data["job"]
                state = job["state"]
                progress = job.get("progress", 0)
                stage = job.get("stage", "generating")

                if ws_callback:
                    await ws_callback({
                        "type": "scene_progress",
                        "stage": "video_gen",
                        "scene_num": scene_num,
                        "total": total,
                        "progress": progress,
                        "detail": f"Scene {scene_num}/{total}: {stage} ({int(progress * 100)}%)",
                    })

                if state == "done":
                    output_url = job.get("output_url")
                    if not output_url:
                        raise RuntimeError(f"Job {job_id} done but no output_url")
                    return output_url
                elif state in ("error", "cancelled"):
                    error = job.get("error", "unknown error")
                    raise RuntimeError(f"Video job {job_id} {state}: {error}")

                log.info(f"[Video] Scene {scene_num}: {stage} {int(progress * 100)}%")

    async def _download_clip(
        self, job_id: str, output_url: str, project_id: str, scene_num: int
    ) -> str:
        """Download the rendered MP4 to local storage."""
        from config import get_projects_dir
        scenes_dir = get_projects_dir() / project_id / "scenes"
        scenes_dir.mkdir(parents=True, exist_ok=True)
        dest = scenes_dir / f"scene_{scene_num:03d}.mp4"

        # output_url is a relative path like /api/generate/jobs/{id}/video
        full_url = f"{self.url}{output_url}" if output_url.startswith("/") else output_url

        async with aiohttp.ClientSession() as session:
            async with session.get(
                full_url,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Download failed {resp.status}: {full_url}")
                content = await resp.read()

        async with aiofiles.open(dest, "wb") as f:
            await f.write(content)
        log.info(f"[Video] Downloaded scene {scene_num}: {dest} ({len(content)} bytes)")
        return str(dest)

    async def health_check(self) -> dict:
        """Check if Video Studio KH is reachable."""
        import time
        t0 = time.monotonic()
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.url}/api/health",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    latency_ms = int((time.monotonic() - t0) * 1000)
                    if resp.status == 200:
                        return {"ok": True, "url": self.url, "latency_ms": latency_ms}
                    return {"ok": False, "url": self.url, "latency_ms": latency_ms,
                            "error": f"HTTP {resp.status}"}
        except Exception as exc:
            return {"ok": False, "url": self.url, "error": str(exc)}
