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

    
def validate_scenes(
    scenes: list[dict],
    total_duration: Optional[float] = None,
    allow_gaps: bool = True,
    allow_overlap: bool = True,
) -> list[dict]:
    """
    Validate and sanitize LLM-generated scene storyboard.
    Enforces timestamp ordering, positive durations, non-empty prompts, and boundary limits.
    Configurable gap/overlap tolerance for flexible creative workflows.
    """
    if not isinstance(scenes, list) or len(scenes) == 0:
        raise ValueError("Scene list must be a non-empty array")

    required = {"scene_num", "start_s", "end_s", "visual_prompt", "scene_title"}
    validated = []

    for i, s in enumerate(scenes):
        missing = required - set(s.keys())
        if missing:
            raise ValueError(f"Scene {i + 1} is missing required fields: {missing}")

        try:
            start_s = float(s["start_s"])
            end_s = float(s["end_s"])
        except (ValueError, TypeError):
            raise ValueError(f"Scene {i + 1} timestamps must be valid numbers: start={s.get("start_s")}, end={s.get("end_s")}")

        if start_s < 0:
            raise ValueError(f"Scene {i + 1} start_s cannot be negative ({start_s})")
        if end_s <= start_s:
            raise ValueError(f"Scene {i + 1} end_s ({end_s}) must be strictly greater than start_s ({start_s})")

        prompt = str(s.get("visual_prompt", "")).strip()
        if not prompt:
            raise ValueError(f"Scene {i + 1} visual_prompt cannot be empty")

        title = str(s.get("scene_title", "")).strip() or f"Scene {i + 1}"

        if total_duration and total_duration > 0 and end_s > total_duration + 5.0:
            # Clamp if LLM overshoot total duration by more than 5s
            end_s = round(total_duration, 2)

        validated.append({
            "scene_num": i + 1,
            "start_s": round(start_s, 2),
            "end_s": round(end_s, 2),
            "visual_prompt": prompt,
            "scene_title": title,
        })

    # Validate ordering, overlaps, and gaps
    for i in range(1, len(validated)):
        prev = validated[i - 1]
        curr = validated[i]

        if curr["start_s"] < prev["start_s"]:
            raise ValueError(
                f"Scenes out of chronological order: Scene {curr["scene_num"]} starts at {curr["start_s"]}s before Scene {prev["scene_num"]} at {prev["start_s"]}s"
            )

        if not allow_overlap and curr["start_s"] < prev["end_s"]:
            raise ValueError(
                f"Overlapping scenes not permitted: Scene {curr["scene_num"]} starts at {curr["start_s"]}s while Scene {prev["scene_num"]} ends at {prev["end_s"]}s"
            )

        if not allow_gaps and curr["start_s"] > prev["end_s"]:
            raise ValueError(
                f"Scene gap detected: Scene {prev["scene_num"]} ends at {prev["end_s"]}s but Scene {curr["scene_num"]} starts at {curr["start_s"]}s"
            )

    return validated

    def _parse_scenes(self, raw: str, total_duration: Optional[float] = None) -> list[dict]:
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
        return validate_scenes(scenes, total_duration=total_duration)

    def _rule_based_segmentation(self, script: str, duration: float) -> list[dict]:
        """Smart fallback sentence-based scene segmenter when Ollama is offline."""
        import math, re
        sentences = [s.strip() for s in re.split(r"[।\.\!\?\n]+", script) if s.strip()]
        if not sentences:
            sentences = [script.strip() or "Cinematic Scene"]

        if len(sentences) > 6:
            chunk_size = math.ceil(len(sentences) / 5)
            sentences = [" ".join(sentences[i:i+chunk_size]) for i in range(0, len(sentences), chunk_size)]

        total_d = max(duration, 3.0)
        per_scene = total_d / len(sentences)
        scenes = []
        for i, s in enumerate(sentences):
            start = round(i * per_scene, 2)
            end = round(total_d if i == len(sentences) - 1 else (i + 1) * per_scene, 2)
            scenes.append({
                "scene_num": i + 1,
                "start_s": start,
                "end_s": end,
                "visual_prompt": f"Cinematic 4K shot, dynamic lighting, dramatic angle: {s[:50]}",
                "scene_title": f"Scene {i + 1}",
            })
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
        try:
            if not self._model:
                await self.probe_model()
        except Exception as exc:
            log.warning(f"[LLM] Ollama unavailable ({exc}). Using rule-based scene segmenter.")
            return self._rule_based_segmentation(script, duration)

        user_prompt = (
            f"Script (Hindi/Hinglish, {duration:.1f} seconds total):\n\n{script}\n\n"
            "Create a JSON scene breakdown for a cinematic video."
        )

        for attempt in range(2):
            try:
                raw = await self._call_ollama(self._model, SYSTEM_PROMPT_SEGMENT, user_prompt)
                scenes = self._parse_scenes(raw, total_duration=duration)
                log.info(f"[LLM] Segmented into {len(scenes)} scenes (attempt {attempt + 1})")
                return scenes
            except Exception as exc:
                if attempt == 0:
                    log.warning(f"[LLM] Parse failed (attempt 1): {exc}. Retrying...")
                else:
                    log.warning(f"[LLM] Parse failed after retries: {exc}. Using fallback.")
                    return self._rule_based_segmentation(script, duration)

        return self._rule_based_segmentation(script, duration)

    async def prompts_from_srt(self, srt_content: str) -> list[dict]:
        """
        Generate visual prompts from SRT content.
        Returns list of {scene_num, start_s, end_s, visual_prompt, scene_title}.
        Retries once on JSON parse failure.
        """
        try:
            if not self._model:
                await self.probe_model()
        except Exception as exc:
            log.warning(f"[LLM] Ollama unavailable ({exc}). Using fallback prompts.")
            return self._rule_based_segmentation(srt_content, 15.0)

        user_prompt = f"SRT content:\n\n{srt_content}\n\nCreate a JSON scene breakdown for a cinematic video."

        for attempt in range(2):
            try:
                raw = await self._call_ollama(self._model, SYSTEM_PROMPT_SRT, user_prompt)
                scenes = self._parse_scenes(raw, total_duration=15.0)
                log.info(f"[LLM] Generated {len(scenes)} prompts from SRT (attempt {attempt + 1})")
                return scenes
            except Exception as exc:
                if attempt == 0:
                    log.warning(f"[LLM] SRT parse failed (attempt 1): {exc}. Retrying...")
                else:
                    log.warning(f"[LLM] SRT prompt failed after retries: {exc}. Using fallback.")
                    return self._rule_based_segmentation(srt_content, 15.0)

        return self._rule_based_segmentation(srt_content, 15.0)

    async def health_check(self) -> dict:
        """Probe Ollama and return health info."""
        try:
            model = await self.probe_model()
            return {"ok": True, "url": self.ollama_url, "model": model}
        except Exception as exc:
            return {"ok": False, "url": self.ollama_url, "error": str(exc), "model": None}
