# Notebench Document Processing Worker (`tools/doc-tools`)

Pure MIT/Apache-2.0 / BSD document extraction and generation subprocess worker pool.

## Licensing
Per ADR 0003 and Guard Check 27:
- All libraries (`pdfplumber`, `pypdf`, `python-docx`, `python-pptx`) are strictly permissive (MIT / Apache-2.0 / BSD).
- PyMuPDF (`fitz`) is strictly banned.

## Architecture
- Managed via Astral `uv sync`.
- Line-delimited stdio JSON-RPC 2.0 communication with the Fastify Node.js daemon.
- Bounded concurrency with auto-respawn supervision.
