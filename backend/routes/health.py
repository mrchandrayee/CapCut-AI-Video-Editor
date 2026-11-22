"""
Health check route — probes all three external services.
GET /api/health
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Optional

import aiohttp
from fastapi import APIRouter

router = APIRouter()


async def _check_tts(url: str) -> dict:
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://")
    t0 = time.monotonic()
    try:
        import websockets
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            import json as _json
            msg = _json.loads(raw)
            latency_ms = int((time.monotonic() - t0) * 1000)
            return {"ok": msg.get("type") == "ready", "url": url, "latency_ms": latency_ms}
    except Exception as exc:
        return {"ok": False, "url": url, "latency_ms": int((time.monotonic() - t0) * 1000),
                "error": str(exc)}


async def _check_ollama(url: str) -> dict:
    t0 = time.monotonic()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{url}/api/tags", timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                data = await resp.json()
                latency_ms = int((time.monotonic() - t0) * 1000)
                models = [m["name"] for m in data.get("models", [])]
                # Find first preferred model
                preferred = ["llama3.2:3b", "gemma3:4b", "llama3:8b", "mistral:7b"]
                model = next((m for m in preferred if m in models), models[0] if models else None)
                return {"ok": True, "url": url, "latency_ms": latency_ms, "model": model, "models": models}
    except Exception as exc:
        return {"ok": False, "url": url, "error": str(exc), "model": None}


async def _check_video_studio(url: str) -> dict:
    t0 = time.monotonic()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{url}/api/health", timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                latency_ms = int((time.monotonic() - t0) * 1000)
                if resp.status == 200:
                    return {"ok": True, "url": url, "latency_ms": latency_ms}
                return {"ok": False, "url": url, "latency_ms": latency_ms, "error": f"HTTP {resp.status}"}
    except Exception as exc:
        return {"ok": False, "url": url, "error": str(exc)}


@router.get("/api/health")
async def health_check() -> dict:
    """Check this server and all three external services."""
    tts_url = os.environ.get("TTS_URL", "http://localhost:7700")
    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    video_url = os.environ.get("VIDEO_STUDIO_URL", "http://localhost:47872")

    tts_result, llm_result, video_result = await asyncio.gather(
        _check_tts(tts_url),
        _check_ollama(ollama_url),
        _check_video_studio(video_url),
    )

    return {
        "ok": True,
        "server": "hindi-video-studio",
        "tts": tts_result,
        "llm": llm_result,
        "video": video_result,
    }
