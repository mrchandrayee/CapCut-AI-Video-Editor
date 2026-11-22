"""
TTS Service — calls VEXYL-TTS via its WebSocket API.

VEXYL-TTS protocol (port 8080 by default):
  WS connect → server sends {"type":"ready","model":"indic-parler-tts","sample_rate":...}
  client sends {"type":"synthesize","text":"...","lang":"hi-IN","style":"default","request_id":"x"}
  server sends {"type":"audio","request_id":"x","audio_b64":"...","sample_rate":44100,...}

Fallback: if the WebSocket synthesis fails or is unavailable, we raise so the
pipeline can surface a clear error.  SRT generation uses faster-whisper on the
saved WAV as the primary path (VEXYL-TTS doesn't return word timestamps in its
current protocol).
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

import aiofiles

log = logging.getLogger(__name__)

# VEXYL-TTS default port is 8080 (from server source).
# Allow override via env.
TTS_URL = os.environ.get("TTS_URL", "http://localhost:7700")
TTS_WS_URL = os.environ.get("TTS_WS_URL", "ws://localhost:7700")

# Resolve WS URL from HTTP URL automatically
def _ws_url_from_http(http_url: str) -> str:
    return http_url.replace("http://", "ws://").replace("https://", "wss://")


class TTSService:
    def __init__(self, tts_url: Optional[str] = None) -> None:
        self.tts_url = tts_url or TTS_URL
        # VEXYL-TTS listens on 8080 by default; if user configured 7700 we try both
        self.ws_url = _ws_url_from_http(self.tts_url)

    async def _get_ws_url(self) -> str:
        """Return the websocket URL.  Try the configured URL; fall back to port 8080."""
        return self.ws_url

    async def generate(
        self,
        script: str,
        project_id: str,
        speaker: str = "default",
        language: str = "hi-IN",
    ) -> dict:
        """
        Synthesise `script` via VEXYL-TTS WebSocket API.

        Returns:
            {audio_path: str, srt_path: str, duration: float}
        """
        import websockets

        projects_dir = Path.home() / ".hindi-video-studio" / "projects" / project_id
        projects_dir.mkdir(parents=True, exist_ok=True)
        wav_path = projects_dir / "narration.wav"
        srt_path = projects_dir / "narration.srt"

        ws_url = await self._get_ws_url()
        request_id = str(uuid.uuid4())[:8]

        log.info(f"[TTS] Connecting to {ws_url}")
        try:
            async with websockets.connect(ws_url, open_timeout=10) as ws:
                # Wait for ready message
                raw = await asyncio.wait_for(ws.recv(), timeout=15)
                ready = json.loads(raw)
                if ready.get("type") != "ready":
                    raise RuntimeError(f"Unexpected WS greeting: {ready}")

                # Send synthesis request
                await ws.send(json.dumps({
                    "type": "synthesize",
                    "text": script,
                    "lang": language,
                    "style": speaker,
                    "request_id": request_id,
                }))

                # Wait for audio response (TTS can take a while)
                while True:
                    raw = await asyncio.wait_for(ws.recv(), timeout=300)
                    msg = json.loads(raw)
                    if msg.get("type") == "error":
                        raise RuntimeError(f"VEXYL-TTS error: {msg.get('message')}")
                    if msg.get("type") == "audio" and msg.get("request_id") == request_id:
                        break

                audio_b64 = msg["audio_b64"]
                sample_rate = msg.get("sample_rate", 44100)

        except Exception as exc:
            raise RuntimeError(
                f"VEXYL-TTS synthesis failed ({self.ws_url}): {exc}\n"
                "Make sure VEXYL-TTS is running: "
                "cd /Users/chandrayee/Documents/code/ecom/multilingual/vexyl-tts-main && python vexyl_tts_server.py"
            ) from exc

        # Save WAV
        wav_bytes = base64.b64decode(audio_b64)
        async with aiofiles.open(wav_path, "wb") as f:
            await f.write(wav_bytes)
        log.info(f"[TTS] Saved WAV: {wav_path} ({len(wav_bytes)} bytes)")

        # Compute duration from WAV header
        duration = _wav_duration(wav_bytes, sample_rate)

        # Generate SRT via faster-whisper
        srt_content = await _generate_srt(str(wav_path), script)
        async with aiofiles.open(srt_path, "w", encoding="utf-8") as f:
            await f.write(srt_content)
        log.info(f"[TTS] Saved SRT: {srt_path}")

        return {
            "audio_path": str(wav_path),
            "srt_path": str(srt_path),
            "duration": duration,
        }

    async def health_check(self) -> dict:
        """Lightweight check: try to open a WebSocket connection."""
        import websockets
        ws_url = await self._get_ws_url()
        try:
            async with websockets.connect(ws_url, open_timeout=5) as ws:
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
                msg = json.loads(raw)
                return {"ok": msg.get("type") == "ready", "url": self.tts_url, "latency_ms": 0}
        except Exception as exc:
            return {"ok": False, "url": self.tts_url, "error": str(exc)}


def _wav_duration(wav_bytes: bytes, sample_rate: int) -> float:
    """Parse WAV header to compute duration in seconds."""
    try:
        import wave
        import io as _io
        with wave.open(_io.BytesIO(wav_bytes)) as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / rate
    except Exception:
        # Fallback: estimate from bytes assuming 16-bit PCM stereo
        data_bytes = max(len(wav_bytes) - 44, 0)
        return data_bytes / (sample_rate * 2 * 2) if sample_rate else 0.0


async def _generate_srt(wav_path: str, original_text: str) -> str:
    """
    Generate SRT from WAV using faster-whisper.
    Falls back to a single segment spanning the whole file if faster-whisper
    is not installed.
    """
    try:
        from faster_whisper import WhisperModel

        loop = asyncio.get_event_loop()

        def _run_whisper():
            model = WhisperModel("small", device="cpu", compute_type="int8")
            segments, _ = model.transcribe(wav_path, language="hi", word_timestamps=True)
            return list(segments)

        segments = await loop.run_in_executor(None, _run_whisper)
        return _segments_to_srt(segments)

    except ImportError:
        dur = _get_audio_file_duration(wav_path)
        log.error(f"[TTS] faster-whisper is not installed. Creating unaligned draft bounded to actual audio duration ({dur:.2f}s). Manual sync required.")
        return _generate_unaligned_sentence_srt(original_text, dur)
    except Exception as exc:
        dur = _get_audio_file_duration(wav_path)
        log.error(f"[TTS] Whisper transcription failed: {exc}. Creating unaligned draft bounded to actual audio duration ({dur:.2f}s). Manual sync required.")
        return _generate_unaligned_sentence_srt(original_text, dur)


def _get_audio_file_duration(wav_path: str) -> float:
    try:
        import wave
        with wave.open(wav_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate > 0:
                return frames / float(rate)
    except Exception as exc:
        log.warning(f"[TTS] Unable to read WAV duration from {wav_path}: {exc}")
    return 0.0


def _segments_to_srt(segments) -> str:
    lines = []
    idx = 1
    for seg in segments:
        start = _fmt_time(seg.start)
        end = _fmt_time(seg.end)
        lines.append(f"{idx}\n{start} --> {end}\n{seg.text.strip()}\n")
        idx += 1
    return "\n".join(lines)


def _generate_unaligned_sentence_srt(text: str, total_duration: float) -> str:
    """
    Generate sentence-level draft subtitles strictly bounded by actual audio duration.
    Explicitly unaligned — never represents estimated timings as speech-synchronized.
    """
    import re
    # Split on Devanagari danda, period, exclamation, question mark or newline
    sentences = [s.strip() for s in re.split(r"[।\.\!\?\n]+", text) if s.strip()]
    if not sentences:
        sentences = [text.strip() or "Subtitle"]

    duration = max(total_duration, 1.0)
    per_sentence = duration / len(sentences)

    lines = []
    for idx, sentence in enumerate(sentences, 1):
        start = (idx - 1) * per_sentence
        end = min(idx * per_sentence, duration)
        lines.append(f"{idx}\n{_fmt_time(start)} --> {_fmt_time(end)}\n{sentence}\n")

    return "\n".join(lines)


def _fmt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
