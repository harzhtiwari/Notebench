# Contributing to Notebench

Thank you for contributing to Notebench!

## Developer Certificate of Origin (DCO)

All commits must include a Signed-off-by line certifying that you wrote the code or have the right to submit it under the project's MIT license:

```bash
git commit -s -m "feat(contracts): add deck layout schema"
```

---

## Development Setup

1. **Prerequisites**:
   - Node.js `>= 22.0.0`
   - pnpm `>= 10.0.0`
   - Astral `uv` `>= 0.11.0`
   - Python `>= 3.12.0`

2. **Install & Verify**:
   ```bash
   pnpm install
   pnpm check:env   # Verifies runtime versions, ports, and permissions
   ```

3. **Start Development**:
   ```bash
   pnpm dev         # Probes and binds dynamic ports on 127.0.0.1
   ```

---

## Quality Gates

Before submitting a pull request, ensure all checks pass:

```bash
pnpm test          # Run Vitest unit & contract suites
pnpm typecheck     # TypeScript strict compilation
pnpm guard         # 32 AST architectural boundary checks
pnpm lint:licenses # Verify MIT/Apache/BSD/ISC license compatibility
pnpm knip          # Check for unused files and exports
```

---

## Architectural Rules

- **Zero AGPL**: All document tools in `tools/doc-tools` must use pure MIT or Apache-2.0 libraries (`pdfplumber`, `pypdf`, `python-pptx`, `python-docx`). PyMuPDF (`fitz`) is strictly forbidden.
- **Two-Folder Taxonomy**: All state must route into `.notebook/` or `.tmp/`. Never create other dot-folders or loose directories at the repository root.
- **Strict TDD**: Write red tests first, then write minimal code to pass them.
