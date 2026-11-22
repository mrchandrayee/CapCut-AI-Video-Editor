import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.llm import validate_scenes
from services.tts import _generate_unaligned_sentence_srt


class TestP0Fixes(unittest.TestCase):

    def test_scene_validation_valid(self):
        scenes = [
            {"scene_num": 1, "start_s": 0.0, "end_s": 4.5, "visual_prompt": "Prompt 1", "scene_title": "Title 1"},
            {"scene_num": 2, "start_s": 4.5, "end_s": 9.0, "visual_prompt": "Prompt 2", "scene_title": "Title 2"}
        ]
        res = validate_scenes(scenes, total_duration=9.0)
        self.assertEqual(len(res), 2)
        self.assertEqual(res[0]["start_s"], 0.0)
        self.assertEqual(res[1]["end_s"], 9.0)

    def test_scene_validation_negative_timestamp(self):
        scenes = [
            {"scene_num": 1, "start_s": -1.0, "end_s": 4.0, "visual_prompt": "Test", "scene_title": "Test"}
        ]
        with self.assertRaises(ValueError):
            validate_scenes(scenes)

    def test_scene_validation_invalid_duration(self):
        scenes = [
            {"scene_num": 1, "start_s": 5.0, "end_s": 3.0, "visual_prompt": "Test", "scene_title": "Test"}
        ]
        with self.assertRaises(ValueError):
            validate_scenes(scenes)

    def test_scene_validation_chronological_order(self):
        scenes = [
            {"scene_num": 1, "start_s": 5.0, "end_s": 8.0, "visual_prompt": "Test 1", "scene_title": "T1"},
            {"scene_num": 2, "start_s": 2.0, "end_s": 6.0, "visual_prompt": "Test 2", "scene_title": "T2"}
        ]
        with self.assertRaises(ValueError):
            validate_scenes(scenes)

    def test_scene_validation_configurable_gaps(self):
        scenes = [
            {"scene_num": 1, "start_s": 0.0, "end_s": 3.0, "visual_prompt": "Test 1", "scene_title": "T1"},
            {"scene_num": 2, "start_s": 5.0, "end_s": 8.0, "visual_prompt": "Test 2", "scene_title": "T2"}
        ]
        # With allow_gaps=True, should pass
        res = validate_scenes(scenes, allow_gaps=True)
        self.assertEqual(len(res), 2)

        # With allow_gaps=False, should raise
        with self.assertRaises(ValueError):
            validate_scenes(scenes, allow_gaps=False)

    def test_srt_fallback_bounded_duration(self):
        text = "Namaste. Yeh pehla sentence hai. Aur yeh doosra sentence hai."
        duration = 6.0
        srt = _generate_unaligned_sentence_srt(text, duration)
        self.assertIn("00:00:00,000", srt)
        self.assertIn("00:00:06,000", srt)
        # Verify 10-minute placeholder is NOT present
        self.assertNotIn("00:10:00,000", srt)

    def test_srt_fallback_single_line(self):
        text = "One line text"
        duration = 3.5
        srt = _generate_unaligned_sentence_srt(text, duration)
        self.assertIn("00:00:03,500", srt)


if __name__ == "__main__":
    unittest.main()
