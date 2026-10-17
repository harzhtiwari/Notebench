# packages/ — Deep Modules

Every workspace package under `packages/` is a **deep module**: a lot of behaviour
behind a small interface. One immediate child directory per package (flat, no nesting).

## The public surface is the entry point

| Surface | File | Notes |
|---|---|---|
| Source entry | `src/index.ts` | The only place `tsdown` compiles from. |
| Built entry | `dist/index.js` | What `package.json#exports` resolves to for consumers. |
| Extra public files | e.g. `packages/ui/tokens.css` | Package-root files listed in `exports`. |

Everything else inside `src/` (and `dist/`) is **internal**: not importable from
outside the owning package — neither by relative path nor by package subpath.

## The one rule

Import another package **only by its bare specifier**:

```ts
import { NotebookError } from "@notebook/contracts"; // ✅ entry point
import { upload } from "../../domain-ingest/src/upload.js"; // ❌ internal file
import { X } from "@notebook/ui/src/lib/theme.js"; // ❌ internal subpath
```

Inside your own package: relative imports freely. Colocated `*.test.ts` files may
reach their **own** package's internals (that is what unit tests are for) but
exercise every other package through its entry point.

## Enforcement

| Gate | Command | Scope |
|---|---|---|
| Interface boundaries | `pnpm lint:boundaries` | dependency-cruiser (`.dependency-cruiser.cjs`): entry-point rules, no cycles, orphan report (`warn`). |
| Layering | `pnpm guard` | `scripts/guard.ts`: which package may depend on which (web import perimeter, infra/domain isolation, …). |

Both run in the lefthook pre-commit hook and in the CI quality gate. The two split
deliberately: dependency-cruiser owns *how* you import (through entry points);
the guard script owns *whether* you may (layering). Add new checks to whichever
one they belong to — do not duplicate.

Note: dependency-cruiser analyses TS with its own nested `typescript@6` shim
(see `packageExtensions` in `pnpm-workspace.yaml`) because the repo compiles
with TS 7, whose stable JS API dependency-cruiser does not support yet. The
workspace itself keeps using the root TypeScript.

## Adding a package

1. Create `packages/<name>/src/index.ts` as the only entry point.
2. Point `package.json#exports` at `./dist/index.js` (and `./dist/index.d.ts` for types).
3. If the package participates in a layered boundary, register it in `scripts/guard.ts`
   next to the existing checks.
