"""
Captions Service — convert SRT to ASS subtitle format with Devanagari/Latin styling.

ASS format reference:
  [Script Info] header
  [V4+ Styles] with one style per script type
  [Events] with Dialogue lines carrying fade effects

Devanagari detection: Unicode block U+0900–U+097F
TEXT_DEFAULTS alignment: stroke width 6, shadow enabled, fade animIn/animOut 300ms,
font Noto Sans Devanagari for Hindi text.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

log = logging.getLogger(__name__)

# Unicode range for Devanagari script
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")

# Fade in/out ms matching Cutflow render.js TEXT_DEFAULTS animIn/animOut dur (0.3s / 0.3s)
FADE_IN_MS = 300
FADE_OUT_MS = 300

# ASS colour: &HAABBGGRR  (alpha 00 = fully opaque, FF = transparent)
# Primary white, outline black, back colour semi-transparent black (&H80000000)
ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Devanagari,Noto Sans Devanagari,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,6,1,2,10,10,30,1
Style: Latin,Inter,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,6,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


class CaptionsService:
    def srt_to_ass(
        self,
        srt_path: str,
        output_path: str,
        font_name: str = "Noto Sans Devanagari",
    ) -> str:
        """
        Convert SRT file to ASS with per-line script detection.
        Applies stroke width 6, shadow, and 300ms fade in/out per TEXT_DEFAULTS.
        Returns the output_path.
        """
        srt_content = Path(srt_path).read_text(encoding="utf-8")
        blocks = _parse_srt(srt_content)

        dialogue_lines = []
        for block in blocks:
            start = _srt_time_to_ass(block["start"])
            end = _srt_time_to_ass(block["end"])
            text = block["text"].replace("\n", "\\N")
            # Detect script
            style = "Devanagari" if DEVANAGARI_RE.search(text) else "Latin"
            # Add fade-in / fade-out effect matching animIn: {dur:0.3} / animOut: {dur:0.3}
            styled_text = r"{\fad(" + str(FADE_IN_MS) + r"," + str(FADE_OUT_MS) + r")}" + text
            dialogue_lines.append(
                f"Dialogue: 0,{start},{end},{style},,0,0,0,,{styled_text}"
            )

        ass_content = ASS_HEADER + "\n".join(dialogue_lines) + "\n"
        Path(output_path).write_text(ass_content, encoding="utf-8")
        log.info(f"[Captions] ASS written: {output_path} ({len(blocks)} entries)")
        return output_path

    def generate_placeholder_ass(
        self, text: str, duration: float, output_path: str
    ) -> str:
        """Create a single-entry ASS file from plain text, used when no SRT exists."""
        end_time = _seconds_to_ass(duration)
        style = "Devanagari" if DEVANAGARI_RE.search(text) else "Latin"
        line = r"{\fad(" + str(FADE_IN_MS) + r"," + str(FADE_OUT_MS) + r")}" + text.replace("\n", "\\N")
        dialogue = f"Dialogue: 0,0:00:00.00,{end_time},{style},,0,0,0,,{line}"
        ass_content = ASS_HEADER + dialogue + "\n"
        Path(output_path).write_text(ass_content, encoding="utf-8")
        return output_path


def _parse_srt(content: str) -> list[dict]:
    """Parse SRT into list of {index, start, end, text}."""
    blocks = []
    # Normalize line endings
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    # Split on blank lines
    raw_blocks = re.split(r"\n\n+", content.strip())
    time_re = re.compile(
        r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})"
    )
    for raw in raw_blocks:
        lines = raw.strip().splitlines()
        if len(lines) < 3:
            continue
        m = None
        text_start = 2
        for i, line in enumerate(lines):
            m = time_re.match(line)
            if m:
                text_start = i + 1
                break
        if not m:
            continue
        start = m.group(1)
        end = m.group(2)
        text = " ".join(lines[text_start:]).strip()
        blocks.append({"start": start, "end": end, "text": text})
    return blocks


def _srt_time_to_ass(srt_time: str) -> str:
    """Convert SRT timestamp (HH:MM:SS,mmm) to ASS timestamp (H:MM:SS.cc)."""
    srt_time = srt_time.replace(",", ".")
    parts = srt_time.split(".")
    main = parts[0]  # HH:MM:SS
    ms_str = parts[1] if len(parts) > 1 else "000"
    centiseconds = int(ms_str[:2])  # first 2 digits
    h, m, s = main.split(":")
    return f"{int(h)}:{m}:{s}.{centiseconds:02d}"


def _seconds_to_ass(seconds: float) -> str:
    """Convert total seconds to ASS timestamp."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"
