"""Optional ONNX Runtime MiniLM embeddings (faster than full PyTorch).

Looks for a cached ONNX model + tokenizer under ~/.cache/scribe-nlp/models/onnx-minilm/.
When missing and huggingface_hub is available, downloads Xenova's ONNX MiniLM.
Falls back to None so embed_backend can use sentence-transformers.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from .extras import has_onnx, has_tokenizers

ONNX_MODEL_ID = "scribe-minilm-onnx-v1"
ONNX_DIMS = 384
HF_REPO = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"


def onnx_cache_dir() -> Path:
    override = os.environ.get("SCRIBE_ONNX_CACHE", "").strip()
    if override:
        path = Path(override).expanduser()
    else:
        path = Path.home() / ".cache" / "scribe-nlp" / "models" / "onnx-minilm"
    path.mkdir(parents=True, exist_ok=True)
    return path


def onnx_model_path() -> Path:
    env = os.environ.get("SCRIBE_ONNX_MODEL", "").strip()
    if env:
        return Path(env).expanduser()
    return onnx_cache_dir() / "model.onnx"


def onnx_tokenizer_path() -> Path:
    return onnx_cache_dir() / "tokenizer.json"


def onnx_available() -> bool:
    if not has_onnx() or not has_tokenizers():
        return False
    return onnx_model_path().is_file() and onnx_tokenizer_path().is_file()


def ensure_onnx_assets() -> bool:
    """Download ONNX model + tokenizer once when possible."""
    if onnx_available():
        return True
    if not has_onnx() or not has_tokenizers():
        return False
    try:
        from huggingface_hub import hf_hub_download
    except Exception:
        return False

    cache = onnx_cache_dir()
    try:
        # Xenova ships quantized ONNX under onnx/
        model_src = hf_hub_download(
            repo_id=HF_REPO,
            filename="onnx/model.onnx",
            local_dir=str(cache),
            local_dir_use_symlinks=False,
        )
        tok_src = hf_hub_download(
            repo_id=HF_REPO,
            filename="tokenizer.json",
            local_dir=str(cache),
            local_dir_use_symlinks=False,
        )
        # Normalize paths to expected names.
        import shutil

        dest_model = onnx_model_path()
        dest_tok = onnx_tokenizer_path()
        if Path(model_src).resolve() != dest_model.resolve():
            dest_model.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(model_src, dest_model)
        if Path(tok_src).resolve() != dest_tok.resolve():
            shutil.copy2(tok_src, dest_tok)
        _session.cache_clear()
        _tokenizer.cache_clear()
        return onnx_available()
    except Exception:
        return False


@lru_cache(maxsize=1)
def _tokenizer():
    from tokenizers import Tokenizer

    return Tokenizer.from_file(str(onnx_tokenizer_path()))


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.inter_op_num_threads = 1
    opts.intra_op_num_threads = max(1, (os.cpu_count() or 2) // 2)
    providers = ["CPUExecutionProvider"]
    return ort.InferenceSession(str(onnx_model_path()), sess_options=opts, providers=providers)


def _mean_pool(last_hidden: "object", attention_mask: "object") -> "object":
    import numpy as np

    mask = np.expand_dims(attention_mask, -1).astype(np.float32)
    masked = last_hidden * mask
    summed = masked.sum(axis=1)
    counts = np.clip(mask.sum(axis=1), 1e-9, None)
    return summed / counts


def _l2_normalize(vectors: "object") -> "object":
    import numpy as np

    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.clip(norms, 1e-12, None)
    return vectors / norms


def embed_onnx_batch(texts: list[str], *, max_length: int = 128) -> list[list[float]] | None:
    if not texts:
        return []
    if not ensure_onnx_assets():
        return None
    try:
        import numpy as np

        tok = _tokenizer()
        sess = _session()
        encoded = tok.encode_batch([(text or "")[:2000] for text in texts])
        # Pad to batch max (capped).
        lengths = [min(len(item.ids), max_length) for item in encoded]
        width = max(lengths) if lengths else 1
        width = max(1, min(width, max_length))
        input_ids = np.zeros((len(texts), width), dtype=np.int64)
        attention = np.zeros((len(texts), width), dtype=np.int64)
        for row, item in enumerate(encoded):
            ids = item.ids[:width]
            input_ids[row, : len(ids)] = ids
            attention[row, : len(ids)] = 1

        inputs = {}
        for inp in sess.get_inputs():
            name = inp.name
            if "mask" in name.lower():
                inputs[name] = attention
            elif "type" in name.lower() or "token_type" in name.lower():
                inputs[name] = np.zeros_like(input_ids)
            else:
                inputs[name] = input_ids

        outputs = sess.run(None, inputs)
        hidden = outputs[0]
        # Some ONNX exports return (last_hidden,) or (last_hidden, pooler).
        if getattr(hidden, "ndim", 2) == 2:
            pooled = hidden
        else:
            pooled = _mean_pool(hidden, attention)
        pooled = _l2_normalize(pooled)
        return [[float(value) for value in row.tolist()] for row in pooled]
    except Exception:
        return None


def embed_onnx(text: str) -> list[float] | None:
    batch = embed_onnx_batch([text or ""])
    if not batch:
        return None
    return batch[0]
