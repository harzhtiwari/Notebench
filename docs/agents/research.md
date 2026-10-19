# Research Notes

How the `research` skill should save web / primary-source investigations in this repo.

Research outputs are committed baseline docs, not scratch work. Specs and tickets live in `.scratch/` (see `issue-tracker.md`); researched findings live in `docs/research/`.

## Conventions

- One report per topic: `docs/research/<YYYY-MM-DD>/NN-<kebab-slug>.md`
- Date folder is the day the research ran (`2026-10-13`). Create it if missing.
- `NN` restarts at `01` inside each date folder, numbered in creation order.
- Registry is `docs/research/README.md` — append the file to the timeline tree plus a row in the matching phase table.
- Report header is `# <Topic>`, then `Author:`, `Date:`, `Target:`, and a primary-sources table/list. Every factual claim cites its source (`file:line` or URL + version).

## When a skill says "save it where the repo already keeps such notes"

Use the path above. Never write research reports to `.scratch/`, repo root, or `docs/Project/`.

## When a skill says "investigate against primary sources"

Per `AGENTS.md` §4: official docs / RFC / spec / installed-version source only, no secondary write-ups. For third-party packages, fetch the docs for the installed version and cite URL + version. For repo internals, cite `file:line` from disk (see `2026-10-13/05-notebench-gap-vs-opendesign.md` for the pattern).
