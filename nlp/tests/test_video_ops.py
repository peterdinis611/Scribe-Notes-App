import unittest
from unittest import mock

from scribe_nlp import video_ops


class VideoOpsGateTests(unittest.TestCase):
    def test_moviepy_requires_patched_pillow(self) -> None:
        with mock.patch("scribe_nlp.video_ops.pillow_is_patched", return_value=False):
            self.assertFalse(video_ops.moviepy_available())
            with self.assertRaises(video_ops.VideoOpsUnavailable):
                video_ops.probe_video({"sourcePath": "/tmp/x.mp4"})

    def test_missing_source_rejected(self) -> None:
        if not video_ops.moviepy_available():
            self.skipTest("MoviePy + patched Pillow not installed")
        with self.assertRaises(Exception):
            video_ops.probe_video({})


if __name__ == "__main__":
    unittest.main()
