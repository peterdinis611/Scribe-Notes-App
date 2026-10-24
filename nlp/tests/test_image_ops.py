import base64
import io
import unittest

from scribe_nlp import image_ops


def _tiny_png_bytes() -> bytes:
    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover
        raise unittest.SkipTest(f"Pillow not installed: {exc}") from None

    if not image_ops.pillow_is_patched():
        raise unittest.SkipTest(
            f"Pillow {image_ops.pillow_version()} is below 13.0.0 CVE floor"
        )

    buf = io.BytesIO()
    Image.new("RGB", (8, 6), color=(20, 40, 60)).save(buf, format="PNG")
    return buf.getvalue()


class ImageOpsTests(unittest.TestCase):
    def test_version_gate(self) -> None:
        if not image_ops.pillow_available():
            self.skipTest("Pillow not installed")
        # When present in CI after [image] install, must be patched.
        self.assertTrue(
            image_ops.pillow_is_patched(),
            f"vulnerable Pillow {image_ops.pillow_version()} — need >=13.0.0",
        )

    def test_inspect_and_prepare(self) -> None:
        raw = _tiny_png_bytes()
        b64 = base64.b64encode(raw).decode("ascii")
        meta = image_ops.inspect_image({"base64": b64})
        self.assertTrue(meta["ok"])
        self.assertEqual(meta["width"], 8)
        self.assertEqual(meta["height"], 6)
        self.assertEqual(meta["format"], "PNG")
        self.assertTrue(meta["patched"])

        prepared = image_ops.prepare_image_for_ocr({"base64": b64, "maxEdge": 1024})
        self.assertTrue(prepared["ok"])
        self.assertEqual(prepared["mime"], "image/png")
        self.assertGreater(len(prepared["base64"]), 16)
        decoded = base64.b64decode(prepared["base64"])
        self.assertGreater(len(decoded), 16)

    def test_rejects_empty(self) -> None:
        if not image_ops.pillow_is_patched():
            self.skipTest("Pillow not patched")
        with self.assertRaises(ValueError):
            image_ops.inspect_image({"base64": ""})


if __name__ == "__main__":
    unittest.main()
