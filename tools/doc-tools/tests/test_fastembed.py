"""
Unit and contract tests for Notebench Python FastEmbed Local Embedding Engine (NB-M2-07).
Tests local ONNX inference, 384 dimensions, L2 normalization, and caching in .tmp/cache/models/.
"""

import pytest
from doc_tools.embedding import embed_batch, embed_query, unload_model


@pytest.fixture(autouse=True, scope="module")
def cleanup_fastembed_model():
    yield
    unload_model()



def test_embed_batch_returns_384_dim_normalized_vectors() -> None:
    texts = [
        "Distributed relational database with write-ahead logging.",
        "Clinical indicators for acute myocardial infarction.",
    ]
    result = embed_batch(texts)

    assert result["model"] == "BAAI/bge-small-en-v1.5"
    assert result["dimensions"] == 384
    embeddings = result["embeddings"]
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384
    assert len(embeddings[1]) == 384

    # Verify L2 unit normalization: sum(x^2) ≈ 1.0
    norm_0 = sum(x * x for x in embeddings[0])
    norm_1 = sum(x * x for x in embeddings[1])
    assert pytest.approx(norm_0, rel=1e-2) == 1.0
    assert pytest.approx(norm_1, rel=1e-2) == 1.0


def test_embed_batch_empty_list() -> None:
    result = embed_batch([])
    assert result["dimensions"] == 384
    assert len(result["embeddings"]) == 0


def test_embed_query_returns_384_dim_vector_with_prefix() -> None:
    query = "What database does Notebench use?"
    result = embed_query(query)

    assert result["model"] == "BAAI/bge-small-en-v1.5"
    assert result["dimensions"] == 384
    assert len(result["embedding"]) == 384

    norm = sum(x * x for x in result["embedding"])
    assert pytest.approx(norm, rel=1e-2) == 1.0

    # Verify asymmetric search prefixing
    prefixed_batch = embed_batch(["Represent this sentence for searching relevant passages: " + query])
    unprefixed_batch = embed_batch([query])

    # Must match the prefixed vector
    assert pytest.approx(result["embedding"], rel=1e-3) == prefixed_batch["embeddings"][0]
    # Must NOT match the raw unprefixed vector
    assert result["embedding"] != unprefixed_batch["embeddings"][0]

