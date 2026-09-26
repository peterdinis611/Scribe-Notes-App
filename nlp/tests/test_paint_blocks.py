from scribe_nlp.paint_blocks import extract_paint_ocr


def test_extract_paint_ocr_from_tiptap() -> None:
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paintPad",
                "attrs": {"ocrText": "Hello ink", "strokes": "[]"},
            },
            {"type": "paragraph", "content": [{"type": "text", "text": "body"}]},
        ],
    }
    assert extract_paint_ocr(doc) == ["Hello ink"]
    assert extract_paint_ocr("{}") == []
