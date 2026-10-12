# AGENTS.md — Canonical Operational Guidelines for Notebench

> Single source of truth for every AI coding agent on this repo (Claude, Gemini, Codex, Copilot).
> `CLAUDE.md` / `GEMINI.md` are thin adapters that point here. Add new rules here, not there.
> Enforced by `pnpm guard` and CI.

## 0. What this project is

Notebench is an open-source, web-first NotebookLM alternative: source-grounded Q&A plus living,
editable artifacts with surgical block-level AI editing.

| Piece | Lives in | Rule |
|---|---|---|
| Daemon (sole backend entrypoint) | `apps/server` (Fastify: REST + SSE, serves static SPA) | Next.js standalone server mode is banned |
| Web UI (static SPA export) | `apps/web` → `apps/web/out` | Import only `@notebook/contracts`, `@notebook/api-client`, `@notebook/hooks`, `@notebook/ui`, `@notebook/editor` |
| Domain logic | `packages/domain-*` | Import peer domains via package root only; never raw DB drivers (`better-sqlite3`, `pg`) |
| Infra adapters | `packages/infra-*` | Never import `domain-*` or `apps/*`; connect via contract interfaces only |
| Shared types | `packages/contracts` | Cross-cutting types live here; `packages/shared` and `packages/common` are banned |
| Python doc worker | `tools/doc-tools` (Astral `uv sync`) | Line-delimited stdio JSON-RPC pool; pure MIT/Apache-2.0 only |

## 1. Start every task on this path (no fog)

Follow in order, before writing code:

1. **Read the ticket first.** Read the spec/ticket file the user pointed at, fully, before touching code.
   Keep its path in context; when lost, re-read it instead of improvising.
2. **Name things from `GLOSSARY.md`.** Use Notebook, Source, Artifact, Workbench, Block, Vault exactly
   as defined. Never invent synonyms.
3. **Orient with the graphs, not memory** (§9): `search_graph` → `trace_path` → read definitions.
   The file on disk is always right; memory of this codebase is always suspect.
4. **Load the matching skill** (§8). If one fits the task, follow it instead of improvising the workflow.
5. **Non-trivial work needs a plan** (§3). No code until the plan exists.

## 2. Do only what was asked (instruction fidelity)

- User instructions and corrections persist across the whole session. Obey them verbatim; a later
  message never silently cancels an earlier constraint.
- Ambiguous scope, destructive action, or two valid readings: **ask first, code second.** Guessing is a bug.
- One task, one diff. Never freelance: no extra features, no "while I'm here" refactors, no new files
  or docs beyond what the task requires.
- Stop and ask when: the ticket contradicts the spec or an ADR; the approved plan no longer fits what
  you found; a gate fails for reasons outside your diff; the task would need a banned technology (§6).

## 3. Plan before code

- **Non-trivial** (touches >1 file, adds behavior, or has any ambiguity): write a short plan — goal,
  files to touch, tests to add, gates to run — and get explicit user approval before coding.
- **Trivial** (single-file obvious fix, e.g. a typo): state intent in one line, then proceed.
- After approval, stay inside the approved plan. New findings that break it: stop, re-plan, re-approve.

## 4. Evidence before claims (no hallucination)

- **Tool-first, never memory-first.** Before asserting anything about code, APIs, configs, or project
  state, verify with a tool (read, graph, test output). Cite `file:line` for every factual claim.
- **One guess is the limit.** Never build a second conclusion on an unverified assumption. If the
  evidence is absent, say "I don't know" and go get it.
- **Source-driven third-party code.** Training memory of library APIs is stale by default. Before coding
  against any third-party package, fetch its official docs/changelog for the installed version via web
  tools and cite the URL + version in your plan.

## 5. TDD and verification gates (no done without proof)

- **Red-Green-Refactor, no exceptions.** Write the failing test first and show its failing output (RED);
  write the minimum code that turns it green (GREEN); then run the gates (REFACTOR).
- No production code before a failing test that proves the gap. Never delete or weaken a failing test
  to go green.

| Gate | Command | Purpose |
|---|---|---|
| **Unit / Contract** | `pnpm test` | Vitest in-memory unit tests |
| **AST Boundaries** | `pnpm guard` | Architectural boundary checks (`scripts/guard.ts`) |
| **Type Check** | `pnpm typecheck` | Turbo TypeScript check (`exactOptionalPropertyTypes`) |
| **Code Hygiene** | `pnpm lint` | ESLint rules across monorepo |
| **Dead Code** | `pnpm knip` | Detect unused exports and orphaned dependencies |

A task is done only when the relevant gates pass and their output is shown — never on self-review alone.

## 6. Core architectural invariants (grilled & enforced)

- **Topology (ADR 0001)**: Decoupled client-daemon. Fastify (`apps/server`) is the sole execution
  entrypoint and production composition root serving REST, SSE, and static SPA export (`apps/web/out`).
- **Realtime Transport**: Strict HTTP REST + Server-Sent Events (SSE) via `@notebook/contracts`.
  WebSockets are banned. Large uploads stream direct-to-disk (`.notebook/uploads/`).
- **State Taxonomy (ADR 0004)**: Persistent data strictly in `.notebook/` (`db/`, `uploads/`, `artifacts/`,
  `vault/`); disposable data strictly in `.tmp/` (`cache/`, `ports/`, `pids/`, `logs/`). Root dot-folders
  and root state dirs are banned.
- **Dual-Dialect Storage**: Drizzle ORM in `packages/infra-db` (SQLite WAL in dev, PostgreSQL in prod).
  `packages/infra-vectorstore` (`sqlite-vec` in dev, `pgvector` in prod). Domains connect solely via interfaces.
- **Python Worker (ADR 0003)**: `tools/doc-tools` managed via Astral `uv sync`. Bounded process pool over
  line-delimited stdio JSON-RPC IPC. Pure MIT/Apache-2.0 only (`pdfplumber`, `pypdf`, `python-docx`,
  `python-pptx`). PyMuPDF (`fitz`) is strictly banned.
- **Living Media & Surgical Editing**: Artifact AST nodes have immutable UUIDs. Surgical updates modify
  target blocks only and MUST enforce bit-for-bit sibling invariance via RFC 8785 JCS SHA-256 digests.
- **Security & SSRF Firewall**: Ingestion fetching must use Undici IP-pinned socket dispatching against
  private RFC1918 blocklists (anti-DNS rebinding). Model keys live in AES-256-GCM Vault
  (`.notebook/vault/`). Zero telemetry by default.
- **Version 0.1 Scope Boundary**: Active artifact types are strictly limited to the 5 P0 formats: Report,
  Study Guide, FAQ, Flashcards, Quiz.

## 7. Code conventions

- **Module System & Types**: Pure ESM (`"type": "module"`). Backend packages and `apps/server` must include
  `.js` extension on relative imports. Use `unknown` and narrow explicitly. Explicit `any`, double
  assertions (`as unknown as T`), and non-null assertions (`!`) in domain packages are prohibited.
- **Errors**: Extend `NotebookError` with a typed `NotebookErrorCode` from `@notebook/contracts`.
- **Surgical diffs**: Modify exactly the target blocks/files. Do not refactor unrelated code — it is the
  most common way agents break working repos.

## 8. Skills: load them, don't skip them

If the task matches an installed skill, load it with the skill tool and follow it end to end.
Do not skim, do not improvise its workflow.

| Task | Load first |
|---|---|
| Research a topic into a repo doc | `research` |
| Turn discussion into a spec / tickets | `to-spec` / `to-tickets` |
| Implement from tickets | `implement` / `implement-spec` |
| Hard bug or perf regression | `diagnosing-bugs` |
| Test-first feature or fix | `tdd` |
| Triage incoming issues | `triage` |
| Large multi-session effort | `wayfinder` (plus `handoff` between sessions) |
| Review a branch or PR | `code-review` |
| Name a concept or record a decision | `domain-modeling` |

## 9. Codebase search protocol (graph-first, token-efficient)

- **Priority 1 — codebase-memory-mcp**: Use MCP graph tools before grepping. `search_graph` (find
  functions/classes/routes), `trace_path` (callers/callees, impact analysis), `get_code_snippet` (read
  definitions), `query_graph` (complex multi-hop/Cypher queries), `get_architecture` (project overview).
  This project is indexed — never re-index unless asked.
- **Priority 2 — Graphify CLI**: For architecture/relationship questions use the local knowledge graph
  (`graphify-out/graph.json`): `graphify query "<question>"` (scoped subgraph), `graphify path "<A>" "<B>"`
  (how two concepts connect), `graphify explain "<concept>"` (focused summary). Read
  `graphify-out/GRAPH_REPORT.md` only for broad architecture review. After modifying code, run
  `graphify update .` (AST-only, no API cost) to keep the graph fresh.
- **Fallback — grep/glob/read**: Only for string literals, error messages, config values, non-code files,
  or when both graph layers return insufficient results.

## 10. Read on demand (all paths verified)

- **Spec (authoritative v0.1 master)**: [`docs/Project/prd 0.1/NOTEBENCH_0.1.md`](./docs/Project/prd%200.1/NOTEBENCH_0.1.md)
  — Part A requirements matrix, Part B 116 grilled decisions, Part C scope/build plan. (Its internal links
  to `temp-prd.md` / `SCOPE_0.1.md` are stale; treat this consolidated file as master.)
- **System Architecture**: [`docs/Project/ARCHITECTURE.md`](./docs/Project/ARCHITECTURE.md) for topology,
  worker lifecycles, and storage design. Product surface: [`docs/Project/PROJECT.md`](./docs/Project/PROJECT.md),
  [`docs/Project/FEATURES.md`](./docs/Project/FEATURES.md).
- **Domain Terminology**: [`GLOSSARY.md`](./GLOSSARY.md) when naming entities, AST nodes, or DTOs.
- **Architectural Decisions**: [`docs/adr/`](./docs/adr/) when modifying storage (ADR 0004), composition
  root (ADR 0001), or PDF parsing (ADR 0003).
- **Issue Tracker (local markdown)**: [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md),
  [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md),
  [`docs/agents/domain.md`](./docs/agents/domain.md). Issues live as files under `.scratch/`.
- **Research Notes**: [`docs/research/`](./docs/research/) for technical baseline investigations.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
