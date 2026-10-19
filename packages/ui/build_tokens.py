"""Generate every token output from tokens.json, the single source of truth.

Usage:  python3 -I build_tokens.py
Writes: tokens.css, tokens.theme.css, tokens.media.css, src/tokens.ts,
        tailwind.preset.cjs (next to this script, in packages/ui/).
Never edit those five files by hand. Edit tokens.json and run this again.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
T = json.loads((HERE / "tokens.json").read_text(encoding="utf-8"))
P = T["$meta"]["prefix"]


def slug(k):
    return k.replace(".", "-")


def var(name):
    return f"--{P}-{slug(name)}"


def resolve(value):
    """{radius.xl} -> var(--nb-radius-xl)"""
    def sub(m):
        group, key = m.group(1).split(".", 1)
        return f"var({var(group + '-' + key)})"
    return re.sub(r"\{([a-z0-9.-]+)\}", sub, value)


def decls(items, group=None, indent="  ", pad=22):
    out = []
    for k, v in items.items():
        name = var(f"{group}-{k}" if group else k)
        out.append(f"{indent}{name}:".ljust(pad + len(indent)) + f" {resolve(v)};")
    return out


# ---------------------------------------------------------------- tokens.css
def theme_block(mode):
    lines = []
    lines += decls(T["color"][mode])
    lines += decls(T["shadow"][mode], "shadow")
    return lines


css = []
css.append(f"""/*
  GENERATED FILE. Do not edit. Source: tokens.json, build: build_tokens.py

  Naming rule: --{P}-<role>[-<variant>]
  Name the role, never the look.  --{P}-ground: yes.  --background: no.

  Theme rule
  - Light is defined on :root and on [data-theme="light"].
  - Dark redefines the same names twice: once for the OS setting and once for
    [data-theme="dark"]. Put the attribute on <html> for the whole app, or on
    any element to preview that theme inside the other one.
  - color-scheme is set in each theme so native controls follow.

  Components read only these variables. A literal color, size, radius, shadow
  or z-index in a component is a bug (lint_tokens.py fails the build on it).
*/
""")

css.append(":root, [data-theme=\"light\"] {\n  color-scheme: light;\n")
css.append("  /* Color */")
css += decls(T["color"]["light"])
css.append("\n  /* Elevation: only things that float get a shadow */")
css += decls(T["shadow"]["light"], "shadow")
css.append("}\n")
css.append(":root {")
css.append("  /* Type */")

css += decls(T["font"], "font")
css += decls(T["text"], "text")
css += decls(T["leading"], "leading")
css += decls(T["weight"], "weight")
css += decls(T["tracking"], "tracking")
css.append("\n  /* Space, 4px base. Numbers match Tailwind's (space-4 = 1rem). */")
css += decls(T["space"], "space")
css.append("\n  /* Radius: the scale, then the role each step is for. Components use roles. */")
css += decls(T["radius"], "radius")
css += decls(T["radius-role"], "radius")
css.append("\n  /* Border and focus ring */")
css += decls(T["border"], "border")
css += decls(T["ring"], "ring")
css.append("\n  /* Size */")
css += decls(T["size"], "size")
css.append("\n  /* Layout */")
css += decls(T["layout"], "layout")
css.append("\n  /* Stacking */")
css += decls(T["z"], "z")
css.append("\n  /* Motion */")
css += decls(T["motion"])
css.append("\n  /* Breakpoints (for reading in JS; media queries use tokens.media.css) */")
css += decls(T["breakpoint"], "bp")
css.append("}\n")

css.append("@media (pointer: coarse) {\n  :root {")
css += decls(T["size-coarse"], "size", indent="    ")
css.append("  }\n}\n")

dark = theme_block("dark")
css.append('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;')
css += ["  " + l for l in dark]
css.append("  }\n}\n")
css.append('[data-theme="dark"] {\n  color-scheme: dark;')
css += dark
css.append("}\n")

css.append(f"""@media (prefers-reduced-motion: reduce) {{
  :root {{ {var('dur-fast')}: 0ms; {var('dur-base')}: 0ms; {var('dur-slow')}: 0ms; {var('dur-spin')}: 0ms; }}
}}

/* Text selection uses the selection token */
::selection {{ background: var({var('select')}); color: var({var('ink')}); }}

/* Focus: one rule for every interactive element. The offset leaves a gap of
   the surface color, so the ring is always judged against the surface. */
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {{
  outline: var({var('ring-width')}) solid var({var('focus')});
  outline-offset: var({var('ring-offset')});
}}

/* Windows high contrast: system colors win; shapes and labels keep the meaning */
@media (forced-colors: active) {{
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {{
    outline-color: Highlight;
  }}
}}
""")
(HERE / "tokens.css").write_text("\n".join(css), encoding="utf-8")

# ---------------------------------------------------------- tokens.media.css
media = [f"/* GENERATED from tokens.json. Needs postcss-custom-media (Vite: add it to postcss.config). */"]
for k, v in T["breakpoint"].items():
    media.append(f"@custom-media --{P}-{k} (min-width: {v});")
(HERE / "tokens.media.css").write_text("\n".join(media) + "\n", encoding="utf-8")

# ------------------------------------------------------------------ tokens.ts
def ts_obj(name, mapping, prefix_group=None):
    rows = ",\n".join(
        f'  "{k}": "var({var((prefix_group + "-" if prefix_group else "") + k)})"' for k in mapping
    )
    return f"export const {name} = {{\n{rows},\n}} as const;\n"


def px(v):
    if v.endswith("rem"):
        return round(float(v[:-3]) * 16)
    if v.endswith("px"):
        return int(float(v[:-2]))
    return int(float(v))


ts = [f"// GENERATED from tokens.json by build_tokens.py. Do not edit.\n",
      "// Each export maps a role name to its CSS variable, so JS never holds a value.\n",
      ts_obj("color", T["color"]["light"]),
      ts_obj("space", T["space"], "space"),
      ts_obj("radius", {**T["radius"], **T["radius-role"]}, "radius"),
      ts_obj("size", T["size"], "size"),
      ts_obj("layout", T["layout"], "layout"),
      ts_obj("z", T["z"], "z"),
      ts_obj("text", T["text"], "text"),
      ts_obj("shadow", T["shadow"]["light"], "shadow"),
      "// Numbers JS needs to compute with (matchMedia, canvas math). Same source as the CSS.\n",
      "export const breakpointPx = {\n" + ",\n".join(f'  "{k}": {px(v)}' for k, v in T["breakpoint"].items()) + ",\n} as const;\n",
      "export const durationMs = {\n" + ",\n".join(
          f'  "{k}": {int(v[:-2])}' for k, v in T["motion"].items() if k.startswith("dur-")) + ",\n} as const;\n",
      "// Icons: Phosphor. regular by default, fill when active, bold at the small size.\n",
      "export const icon = " + json.dumps(T["icon"], indent=2) + " as const;\n",
      "export type ColorToken = keyof typeof color;\n"]
(HERE / "src" / "tokens.ts").write_text("\n".join(ts), encoding="utf-8")

# ------------------------------------------------------- tailwind.preset.cjs
def tw_map(mapping, group=None):
    return "{\n" + ",\n".join(
        f'      "{k}": "var({var((group + "-" if group else "") + k)})"' for k in mapping) + ",\n    }"

preset = f"""// GENERATED from tokens.json by build_tokens.py. Do not edit.
// Use in tailwind.config.js:  presets: [require("./tailwind.preset.cjs")]
// Every utility maps to a variable, so `bg-sheet`, `p-4`, `rounded-panel` can only
// produce token values. Tailwind's default palette is removed on purpose.
// Note: opacity modifiers like bg-ink/50 do not work with var() colors. Use a token.
module.exports = {{
  theme: {{
    colors: {{ transparent: "transparent", current: "currentColor", ...{tw_map(T["color"]["light"])} }},
    spacing: {tw_map(T["space"], "space")},
    borderRadius: {{ none: "0", ...{tw_map({**T["radius"], **T["radius-role"]}, "radius")} }},
    fontSize: {tw_map(T["text"], "text")},
    fontFamily: {tw_map(T["font"], "font")},
    fontWeight: {tw_map(T["weight"], "weight")},
    lineHeight: {tw_map(T["leading"], "leading")},
    letterSpacing: {tw_map(T["tracking"], "tracking")},
    boxShadow: {{ none: "none", ...{tw_map(T["shadow"]["light"], "shadow")} }},
    zIndex: {tw_map(T["z"], "z")},
    transitionDuration: {{ fast: "var({var('dur-fast')})", base: "var({var('dur-base')})", slow: "var({var('dur-slow')})" }},
    transitionTimingFunction: {{ DEFAULT: "var({var('ease')})" }},
    screens: {{ {", ".join(f'{k}: "{v}"' for k, v in T["breakpoint"].items())} }},
    extend: {{
      width: {tw_map({k: v for k, v in T["layout"].items()}, "layout")},
      maxWidth: {tw_map({k: v for k, v in T["layout"].items()}, "layout")},
      height: {tw_map(T["size"], "size")},
      minHeight: {tw_map(T["size"], "size")},
    }},
  }},
}};
"""
(HERE / "tailwind.preset.cjs").write_text(preset, encoding="utf-8")

# -------------------------------------------------------- tokens.theme.css (Tailwind v4)
theme_lines = [
    "/*",
    "  GENERATED FILE. Do not edit. Source: tokens.json, build: build_tokens.py",
    "",
    "  Tailwind CSS v4 @theme configuration.",
    "  Maps canonical --nb-* design tokens directly into Tailwind utility classes.",
    "*/",
    "",
    "@theme {",
    "  /* Colors */",
]
for k in T["color"]["light"]:
    theme_lines.append(f"  --color-{slug(k)}: var({var(k)});")

theme_lines.append("\n  /* Spacing */")
for k in T["space"]:
    theme_lines.append(f"  --spacing-{slug(k)}: var({var('space-' + k)});")

theme_lines.append("\n  /* Border Radius */")
theme_lines.append("  --radius-none: 0;")
all_radius = {**T["radius"], **T["radius-role"]}
for k in all_radius:
    theme_lines.append(f"  --radius-{slug(k)}: var({var('radius-' + k)});")

theme_lines.append("\n  /* Typography - Fonts */")
for k in T["font"]:
    theme_lines.append(f"  --font-{slug(k)}: var({var('font-' + k)});")

theme_lines.append("\n  /* Typography - Font Sizes */")
for k in T["text"]:
    theme_lines.append(f"  --text-{slug(k)}: var({var('text-' + k)});")

theme_lines.append("\n  /* Typography - Font Weights */")
for k in T["weight"]:
    theme_lines.append(f"  --font-weight-{slug(k)}: var({var('weight-' + k)});")

theme_lines.append("\n  /* Typography - Line Heights */")
for k in T["leading"]:
    theme_lines.append(f"  --leading-{slug(k)}: var({var('leading-' + k)});")

theme_lines.append("\n  /* Typography - Letter Spacing */")
for k in T["tracking"]:
    theme_lines.append(f"  --tracking-{slug(k)}: var({var('tracking-' + k)});")

theme_lines.append("\n  /* Shadows */")
theme_lines.append("  --shadow-none: none;")
for k in T["shadow"]["light"]:
    theme_lines.append(f"  --shadow-{slug(k)}: var({var('shadow-' + k)});")

theme_lines.append("\n  /* Transitions & Motion */")
theme_lines.append(f"  --ease-default: var({var('ease')});")
theme_lines.append(f"  --duration-fast: var({var('dur-fast')});")
theme_lines.append(f"  --duration-base: var({var('dur-base')});")
theme_lines.append(f"  --duration-slow: var({var('dur-slow')});")

theme_lines.append("\n  /* Breakpoints */")
for k, v in T["breakpoint"].items():
    theme_lines.append(f"  --breakpoint-{k}: {v};")

theme_lines.append("}\n")
(HERE / "tokens.theme.css").write_text("\n".join(theme_lines), encoding="utf-8")

n_color = len(T["color"]["light"])
assert set(T["color"]["light"]) == set(T["color"]["dark"]), "light and dark must define the same names"
assert set(T["shadow"]["light"]) == set(T["shadow"]["dark"])
print(f"tokens.css, tokens.theme.css, tokens.media.css, src/tokens.ts, tailwind.preset.cjs written. {n_color} colors x 2 themes.")

