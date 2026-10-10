# AGENTS.md — Canonical Operational Guidelines for Notebench

> Single Source of Truth for AI coding agents. Enforced by `pnpm guard` and CI.

## 1. Operational Verification Gates
Before declaring any task complete, verify with the relevant gates:

| Gate | Command | Purpose |
|---|---|---|
| **Unit / Contract** | `pnpm test` | Vitest in-memory unit tests |
| **AST Boundaries** | `pnpm guard` | 32 AST architectural boundary checks (`scripts/guard.ts`) |
| **Type Check** | `pnpm typecheck` | Turbo TypeScript check (`exactOptionalPropertyTypes`) |
| **Code Hygiene** | `pnpm lint` | ESLint rules across monorepo |
| **Dead Code** | `pnpm knip` | Detect unused exports and orphaned dependencies |

**TDD Discipline**: Follow Red-Green-Refactor. Author failing test (`RED`), implement minimum surgical code (`GREEN`), verify gates (`REFACTOR`).

## 2. Core Architectural Invariants (Grilled & Enforced)
- **Topology (ADR 0001)**: Decoupled client-daemon. Fastify (`apps/server`) is the sole execution entrypoint and production composition root serving REST, SSE, and static SPA export (`apps/web/out`). Next.js standalone server mode is banned.
- **Realtime Transport**: Strict HTTP REST + Server-Sent Events (SSE) via `@notebook/contracts`. WebSockets are banned. Large uploads stream direct-to-disk (`.notebook/uploads/`).
- **State Taxonomy (ADR 0004)**: Persistent data lives strictly in `.notebook/` (`db/`, `uploads/`, `artifacts/`, `vault/`); disposable data strictly in `.tmp/` (`cache/`, `run/`, `logs/`). Root dot-folders and root state dirs are banned.
- **Dual-Dialect Storage**: Drizzle ORM in `packages/infra-db` (SQLite WAL in dev, PostgreSQL in prod). `packages/infra-vectorstore` (`sqlite-vec` in dev, `pgvector` in prod). Domains connect solely via interfaces.
- **Python Worker (ADR 0003)**: `tools/doc-tools` managed via Astral `uv sync`. Bounded process pool communicating via line-delimited stdio JSON-RPC IPC. Pure MIT/Apache-2.0 only (`pdfplumber`, `pypdf`, `python-docx`, `python-pptx`). PyMuPDF (`fitz`) is strictly banned.
- **Living Media & Surgical Editing**: Artifact AST nodes have immutable UUIDs. Surgical updates modify target blocks only and MUST enforce bit-for-bit sibling invariance via RFC 8785 JCS SHA-256 canonical digests.
- **Security & SSRF Firewall**: Ingestion fetching must use Undici IP-pinned socket dispatching against private RFC1918 blocklists (anti-DNS rebinding). Model keys live in AES-256-GCM Vault (`.notebook/vault/`). Zero telemetry by default.
- **Version 0.1 Scope Boundary**: Active artifact types are strictly limited to the 5 P0 formats: Report, Study Guide, FAQ, Flashcards, Quiz.

## 3. Package Boundaries & Code Conventions
- **Web Perimeter (`apps/web`)**: Import only from `@notebook/contracts`, `@notebook/api-client`, `@notebook/hooks`, `@notebook/ui`, and `@notebook/editor`. Never import server, infra, or domain packages.
- **Infrastructure Isolation (`infra-*`)**: Never import from `domain-*` or `apps/*`. Adapters connect solely via contract interfaces.
- **Domain Encapsulation (`domain-*`)**: Import peer domains via package root (`index.ts`) only. Never import raw database drivers (`better-sqlite3`, `pg`).
- **Forbidden Packages**: `packages/shared` and `packages/common` are banned. Cross-cutting types belong in `@notebook/contracts`.
- **Module System & Types**: Pure ESM (`"type": "module"`). Backend packages and `apps/server` must include `.js` extension on relative imports. Use `unknown` and narrow explicitly. Explicit `any`, double assertions (`as unknown as T`), and non-null assertions (`!`) in domain packages are prohibited.
- **Errors**: Extend `NotebookError` with a typed `NotebookErrorCode` from `@notebook/contracts`.
- **Source-Driven Protocol**: Inspect official documentation before integrating third-party libraries (`search_web`, `read_url_content`). Never rely on hallucinated signatures.

## 4. Progressive Disclosure Pointers (Consult On Demand)
- **System Architecture**: Consult [`docs/Project/ARCHITECTURE.md`](./docs/Project/ARCHITECTURE.md) for full system topology, worker lifecycles, and decision matrices.
- **116 Grilled Decisions**: Consult [`docs/Project/prd 0.1/temp-prd.md`](./docs/Project/prd%200.1/temp-prd.md) for settled specifications across UI, RAG, Vault, and 6-level deletion.
- **Milestone Tickets (M1–M6)**: Consult [`docs/Project/prd 0.1/tickets/`](./docs/Project/prd%200.1/tickets/) for individual task specifications and acceptance criteria.
- **Scope Baseline**: Consult [`docs/Project/prd 0.1/SCOPE_0.1.md`](./docs/Project/prd%200.1/SCOPE_0.1.md) for P0 vs P1/P2 feature boundaries.
- **Domain Terminology**: Consult [`GLOSSARY.md`](./GLOSSARY.md) when naming entities, AST nodes, or DTOs (Notebook, Source, Artifact, Workbench, Block, Vault).
- **Architectural Decisions**: Consult [`docs/adr/`](./docs/adr/) when modifying storage (ADR 0004), container root (ADR 0001), or PDF parsing (ADR 0003).
- **Issue Triage**: Consult [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md) and [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md) for GitHub workflows.
- **Research Notes**: Consult [`docs/research/`](./docs/research/) for technical baseline investigations.
