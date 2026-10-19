"""
Notebench Python Doc-Worker stdio JSON-RPC 2.0 server.
Communicates strictly over line-delimited stdio JSON-RPC.
"""

import json
import os
import signal
import sys
import time
from typing import Any, Dict, Optional

from doc_tools.docx import extract_docx
from doc_tools.embedding import embed_batch, embed_query
from doc_tools.pdf import extract_pdf, preflight_pdf


JSON_RPC_VERSION = "2.0"

# Standard JSON-RPC error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603


def make_success_response(req_id: Any, result: Any) -> Dict[str, Any]:
    return {
        "jsonrpc": JSON_RPC_VERSION,
        "id": req_id,
        "result": result,
    }


def make_error_response(
    req_id: Any, code: int, message: str, data: Optional[Any] = None
) -> Dict[str, Any]:
    res: Dict[str, Any] = {
        "jsonrpc": JSON_RPC_VERSION,
        "id": req_id,
        "error": {
            "code": code,
            "message": message,
        },
    }
    if data is not None:
        res["error"]["data"] = data
    return res


def handle_ping(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "pong": True,
        "timestamp": int(time.time() * 1000),
        "pythonVersion": sys.version.split()[0],
        "workerPid": os.getpid(),
    }


def handle_get_worker_info(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "name": "doc-tools",
        "version": "0.1.0",
        "pythonVersion": sys.version.split()[0],
        "workerPid": os.getpid(),
        "capabilities": ["pdfplumber", "pypdf", "docx", "pptx", "fastembed"],
    }


def handle_pdf_preflight(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:

    if not params or not params.get("filePath"):
        raise ValueError("Missing 'filePath' in params")
    return preflight_pdf(params["filePath"])


def handle_pdf_extract(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not params or not params.get("filePath"):
        raise ValueError("Missing 'filePath' in params")
    max_pages = params.get("maxPages")
    if max_pages is not None:
        max_pages = int(max_pages)
    return extract_pdf(params["filePath"], max_pages=max_pages)


def handle_docx_extract(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not params or not params.get("filePath"):
        raise ValueError("Missing 'filePath' in params")
    return extract_docx(params["filePath"])


def handle_embedding_embed_batch(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not params or "texts" not in params:
        raise ValueError("Missing 'texts' in params")
    texts = params["texts"]
    if not isinstance(texts, list):
        raise ValueError("'texts' must be a list of strings")
    model = params.get("model")
    if model:
        return embed_batch(texts, model_name=str(model))
    return embed_batch(texts)


def handle_embedding_embed_query(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not params or "text" not in params:
        raise ValueError("Missing 'text' in params")
    text = params["text"]
    if not isinstance(text, str):
        raise ValueError("'text' must be a string")
    model = params.get("model")
    if model:
        return embed_query(text, model_name=str(model))
    return embed_query(text)


HANDLERS = {
    "ping": handle_ping,
    "get_worker_info": handle_get_worker_info,
    "pdf_preflight": handle_pdf_preflight,
    "pdf_extract": handle_pdf_extract,
    "docx_extract": handle_docx_extract,
    "embedding_embed_batch": handle_embedding_embed_batch,
    "embedding.embed_batch": handle_embedding_embed_batch,
    "embedding_embed_query": handle_embedding_embed_query,
    "embedding.embed_query": handle_embedding_embed_query,
}



def dispatch_request(req: Dict[str, Any]) -> Dict[str, Any]:
    if req.get("jsonrpc") != JSON_RPC_VERSION:
        return make_error_response(
            req.get("id"),
            INVALID_REQUEST,
            f"Invalid JSON-RPC version: expected '{JSON_RPC_VERSION}'",
        )

    method = req.get("method")
    req_id = req.get("id")

    if not isinstance(method, str):
        return make_error_response(req_id, INVALID_REQUEST, "Missing or invalid 'method'")

    handler = HANDLERS.get(method)
    if not handler:
        return make_error_response(
            req_id,
            METHOD_NOT_FOUND,
            f"Method '{method}' not found",
            {"availableMethods": list(HANDLERS.keys())},
        )

    try:
        params = req.get("params")
        result = handler(params)
        return make_success_response(req_id, result)
    except Exception as exc:
        sys.stderr.write(f"[doc-worker:{os.getpid()}] Error handling {method}: {exc}\n")
        sys.stderr.flush()
        return make_error_response(
            req_id,
            INTERNAL_ERROR,
            f"Internal error executing method '{method}': {str(exc)}",
        )


def main() -> None:
    # Handle graceful termination
    def handle_signal(signum: int, _frame: Any) -> None:
        sys.stderr.write(f"[doc-worker:{os.getpid()}] Received signal {signum}, exiting gracefully.\n")
        sys.stderr.flush()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Ensure UTF-8 stdio
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    sys.stderr.write(f"[doc-worker:{os.getpid()}] Started stdio JSON-RPC worker (Python {sys.version.split()[0]})\n")
    sys.stderr.flush()

    for line in sys.stdin:
        trimmed = line.strip()
        if not trimmed:
            continue

        try:
            req = json.loads(trimmed)
        except json.JSONDecodeError as err:
            err_res = make_error_response(None, PARSE_ERROR, f"Invalid JSON payload: {err.msg}")
            sys.stdout.write(json.dumps(err_res) + "\n")
            sys.stdout.flush()
            continue

        res = dispatch_request(req)
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
