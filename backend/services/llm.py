"""
LLM Service — calls Ollama to segment a script into scenes with visual prompts.

Ollama API:
  POST /api/generate  {model, prompt, stream:false, format:"json"}
  → {response: "<json string>", ...}

The system prompt enforces strict JSON output.  On parse failure we retry once.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

import aiohttp

log = logging.getLogger(__name__)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# Preference order for model selection
PREFERRED_MODELS = ["llama3.2:3b", "gemma3:4b", "llama3:8b", "mistral:7b"]

SCENE_JSON_SCHEMA = """[
  {
    "scene_num": 1,
    "start_s": 0.0,
    "end_s": 10.0,
    "visual_prompt": "Cinematic wide shot of mountains at sunrise, golden light, 4K",
    "scene_title": "Opening Scene"
  }
]"""

SYSTEM_PROMPT_SEGMENT = """You are a video director's assistant. Given a Hindi/Hinglish narration script and its total duration in seconds, divide it into scenes and create a detailed English visual prompt for each scene.

RULES:
1. Output ONLY valid JSON. No explanation, no markdown, no code fences.
2. The JSON must be an array matching this exact schema:
{schema}
3. scene_num starts at 1 and increments by 1.
4. start_s and end_s must be in seconds, covering the full duration.
5. end_s of one scene must equal start_s of the next.
6. visual_prompt must be in English, cinematic, detailed (20-50 words). Describe what is visually shown — not what is said.
7. scene_title must be a short English label (3-6 words).
8. Create between 3 and 8 scenes.

Output ONLY the JSON array. Nothing else.""".format(schema=SCENE_JSON_SCHEMA)

SYSTEM_PROMPT_SRT = """You are a video director's assistant. Given SRT subtitle content from a Hindi/Hinglish narration, create a detailed English visual prompt for each subtitle segment.

RULES:
1. Output ONLY valid JSON. No explanation, no markdown, no code fences.
2. The JSON must be an array matching this exact schema:
{schema}
3. scene_num starts at 1 and increments by 1.
4. Parse start_s and end_s from the SRT timestamps (HH:MM:SS,mmm format).
5. visual_prompt must be in English, cinematic, detailed (20-50 words). Describe what is visually shown.
6. scene_title must be a short English label (3-6 words).
7. Group nearby SRT segments into logical scenes (aim for 3-8 scenes total).

Output ONLY the JSON array. Nothing else.""".format(schema=SCENE_JSON_SCHEMA)


class LLMService:
    def __init__(self, ollama_url: Optional[str] = None) -> None:
        self.ollama_url = ollama_url or OLLAMA_URL
        self._model: Optional[str] = None

    async def probe_model(self) -> str:
        """Return the first available model from PREFERRED_MODELS."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    f"{self.ollama_url}/api/tags", timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    data = await resp.json()
            except Exception as exc:
                raise RuntimeError(
                    f"Cannot reach Ollama at {self.ollama_url}: {exc}\n"
                    "Start it with: ollama serve"
                ) from exc

        available = {m["name"] for m in data.get("models", [])}
        for pref in PREFERRED_MODELS:
            if pref in available:
                self._model = pref
                log.info(f"[LLM] Using model: {pref}")
                return pref

        # If none of the preferred models are available, use whatever is first
        if available:
            first = next(iter(available))
            self._model = first
            log.warning(f"[LLM] None of preferred models found; using {first}")
            return first

        raise RuntimeError(
            "No models found in Ollama. Pull one with: ollama pull llama3.2:3b"
        )

    async def _call_ollama(self, model: str, system: str, user_prompt: str) -> str:
        """POST to /api/generate and return the response string."""
        payload = {
            "model": model,
            "system": system,
            "prompt": user_prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.3, "num_predict": 2048},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"Ollama returned {resp.status}: {text}")
                data = await resp.json()
        return data.get("response", "")

    def _parse_scenes(self, raw: str) -> list[dict]:
        """Parse JSON from LLM response; handle common wrapping issues."""
        text = raw.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.splitlines()
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        # Find the JSON array
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            raise ValueError(f"No JSON array found in LLM response: {text[:200]}")
        scenes = json.loads(text[start:end + 1])
        if not isinstance(scenes, list):
            raise ValueError("LLM response is not a list")
        required = {"scene_num", "start_s", "end_s", "visual_prompt", "scene_title"}
        for i, s in enumerate(scenes):
            missing = required - set(s.keys())
            if missing:
                raise ValueError(f"Scene {i} missing fields: {missing}")
        return scenes

    async def segment_script(
        self,
        script: str,
        duration: float,
        timestamps: list,
    ) -> list[dict]:
        """
        Divide a script into scenes.
        Returns list of {scene_num, start_s, end_s, visual_prompt, scene_title}.
        Retries once on JSON parse failure.
        """
        if not self._model:
            await self.probe_model()

        user_prompt = (
            f"Script (Hindi/Hinglish, {duration:.1f} seconds total):\n\n{script}\n\n"
            "Create a JSON scene breakdown for a cinematic video."
        )

        for attempt in range(2):
            try:
                raw = await self._call_ollama(self._model, SYSTEM_PROMPT_SEGMENT, user_prompt)
                scenes = self._parse_scenes(raw)
                log.info(f"[LLM] Segmented into {len(scenes)} scenes (attempt {attempt + 1})")
                return scenes
            except Exception as exc:
                if attempt == 0:
                    log.warning(f"[LLM] Parse failed (attempt 1): {exc}. Retrying...")
                else:
                    raise RuntimeError(f"LLM scene segmentation failed after 2 attempts: {exc}") from exc

        return []  # unreachable

    async def prompts_from_srt(self, srt_content: str) -> list[dict]:
        """
        Generate visual prompts from SRT content.
        Returns list of {scene_num, start_s, end_s, visual_prompt, scene_title}.
        Retries once on JSON parse failure.
        """
        if not self._model:
            await self.probe_model()

        user_prompt = f"SRT content:\n\n{srt_content}\n\nCreate a JSON scene breakdown for a cinematic video."

        for attempt in range(2):
            try:
                raw = await self._call_ollama(self._model, SYSTEM_PROMPT_SRT, user_prompt)
                scenes = self._parse_scenes(raw)
                log.info(f"[LLM] Generated {len(scenes)} prompts from SRT (attempt {attempt + 1})")
                return scenes
            except Exception as exc:
                if attempt == 0:
                    log.warning(f"[LLM] SRT parse failed (attempt 1): {exc}. Retrying...")
                else:
                    raise RuntimeError(f"LLM SRT prompting failed after 2 attempts: {exc}") from exc

        return []  # unreachable

    async def health_check(self) -> dict:
        """Probe Ollama and return health info."""
        try:
            model = await self.probe_model()
            return {"ok": True, "url": self.ollama_url, "model": model}
        except Exception as exc:
            return {"ok": False, "url": self.ollama_url, "error": str(exc), "model": None}
