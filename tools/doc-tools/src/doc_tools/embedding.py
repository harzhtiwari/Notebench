"""
Notebench Pure MIT/Apache FastEmbed Local Embedding Engine.
Executes BAAI/bge-small-en-v1.5 INT8 ONNX embeddings locally on CPU.
Models cached in .tmp/cache/models/fastembed/ obeying ADR 0004 taxonomy.
"""

import os
from typing import Any, Dict, List, Optional
from fastembed import TextEmbedding

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
_model_instance: Optional[TextEmbedding] = None


def _resolve_cache_dir() -> str:
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    # Walk up from tools/doc-tools/src/doc_tools to repo root
    curr = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(curr, "..", "..", "..", ".."))
    cache_dir = os.path.join(repo_root, ".tmp", "cache", "models", "fastembed")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def get_embedding_model(model_name: str = DEFAULT_MODEL) -> TextEmbedding:
    global _model_instance
    if _model_instance is None:
        cache_dir = _resolve_cache_dir()
        _model_instance = TextEmbedding(model_name=model_name, cache_dir=cache_dir)
    return _model_instance


def embed_batch(texts: List[str], model_name: str = DEFAULT_MODEL) -> Dict[str, Any]:
    if not texts:
        return {
            "model": model_name,
            "dimensions": 384,
            "embeddings": [],
        }

    model = get_embedding_model(model_name)
    vectors_gen = model.embed(texts)
    embeddings = [v.tolist() for v in vectors_gen]
    dimensions = len(embeddings[0]) if embeddings else 384

    return {
        "model": model_name,
        "dimensions": dimensions,
        "embeddings": embeddings,
    }


def embed_query(text: str, model_name: str = DEFAULT_MODEL) -> Dict[str, Any]:
    if not text:
        return {
            "model": model_name,
            "dimensions": 384,
            "embedding": [0.0] * 384,
        }

    model = get_embedding_model(model_name)
    prefixed_query = f"{BGE_QUERY_PREFIX}{text}"
    vectors = list(model.embed([prefixed_query]))
    embedding = vectors[0].tolist() if vectors else [0.0] * 384

    return {
        "model": model_name,
        "dimensions": len(embedding),
        "embedding": embedding,
    }


def unload_model() -> Dict[str, Any]:
    import gc
    global _model_instance
    if _model_instance is not None:
        _model_instance = None
        gc.collect()
    return {"unloaded": True}


