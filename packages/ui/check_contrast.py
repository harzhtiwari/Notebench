"""Check every color pair the system relies on, straight from tokens.json.

Usage: python3 -I check_contrast.py        (exit code 1 if anything fails)
Also imported by build.py for the tables on the board.

Rules checked
- Text: 4.5 to 1 (WCAG 1.4.3).
- UI parts and graphics: 3 to 1 (WCAG 1.4.11).
- Chart series and tool icons: 3 to 1 on the surfaces they sit on.
- Chart series stay distinguishable for color-blind readers: minimum CIE76
  distance of 20 between any two series under protanopia, deuteranopia and
  tritanopia (Machado 2009 matrices, severity 1.0).
"""
import itertools
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT, NONTEXT, CVD_MIN = 4.5, 3.0, 20.0
SURFACES = ["ground", "sheet", "well"]


def load(path=HERE / "tokens.json"):
    t = json.loads(Path(path).read_text(encoding="utf-8"))
    pick = lambda d: {k.upper() if False else k: v.upper() for k, v in d.items() if re.fullmatch(r"#[0-9A-Fa-f]{6}", v)}
    return pick(t["color"]["light"]), pick(t["color"]["dark"])


def lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


PAIRS = []  # (group, label, fg, bg, required)


def add(group, fg, bg, req, label=None):
    PAIRS.append((group, label or f"{fg} on {bg}", fg, bg, req))


for fg in ("ink", "ink-2", "ink-3"):
    for bg in SURFACES + ["well-hover"]:
        add("Text", fg, bg, TEXT)
for bg in SURFACES + ["link-wash"]:
    add("Text", "link", bg, TEXT)
for k in ("you", "ai", "ok", "warn", "danger"):
    for bg in ("sheet", "ground", "well", f"{k}-wash"):
        add("Text", k, bg, TEXT)
add("Text", "ink-inv", "ink", TEXT, "ink-inv on ink (primary button, toast)")
add("Text", "on-marker", "marker", TEXT)
for bg in ("marker-wash", "marker-swipe", "select", "link-wash", "you-wash", "ai-wash", "ok-wash", "warn-wash", "danger-wash"):
    add("Text", "ink", bg, TEXT)
add("Text", "ink-3", "select", TEXT)
add("Text", "ink-2", "select", TEXT)

for bg in SURFACES:
    add("Controls", "edge", bg, NONTEXT, f"edge (control border) on {bg}")
for bg in SURFACES + ["link-wash", "danger-wash"]:
    add("Controls", "focus", bg, NONTEXT, f"focus ring on {bg}")
for bg in SURFACES:
    add("Controls", "hatch", bg, NONTEXT, f"hatch (masked area) on {bg}")
add("Controls", "marker-text", "sheet", NONTEXT, "marker-text (chip border, underline) on sheet")

for k in ("you", "ai", "warn", "ink"):
    for bg in ("sheet", "well"):
        add("Provenance", k, bg, NONTEXT, f"{k} rail and icon on {bg}")

for n in range(1, 5):
    for bg in ("sheet", "well"):
        add("Charts", f"chart-{n}", bg, NONTEXT, f"chart-{n} on {bg}")
for tool in ("cobalt", "amber", "rose", "emerald", "cyan", "purple", "indigo", "teal"):
    for bg in ("sheet", "well"):
        add("Tool icons", f"tool-{tool}", bg, NONTEXT, f"tool-{tool} icon on {bg}")


def evaluate(tokens):
    out = []
    for group, label, fg, bg, req in PAIRS:
        r = ratio(tokens[fg], tokens[bg])
        out.append((group, label, tokens[fg], tokens[bg], r, req, r >= req))
    return out


# ---- color-blind distance for chart series (pure python, no dependencies)
SIM = {
    "protanopia": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritanopia": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _delin(c):
    c = max(0.0, min(1.0, c))
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def _rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def _lab(rgb):
    r, g, b = (_lin(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def _sim(rgb, m):
    lin = [_lin(c) for c in rgb]
    return [_delin(sum(m[i][j] * lin[j] for j in range(3))) for i in range(3)]


def chart_distance(tokens):
    """Smallest distance between any two series, and the vision type it occurs under."""
    cols = [tokens[f"chart-{n}"] for n in range(1, 5)]
    worst = (1e9, "")
    for name, m in [("normal vision", None)] + list(SIM.items()):
        labs = [_lab(_sim(_rgb(c), m) if m else _rgb(c)) for c in cols]
        for a, b in itertools.combinations(labs, 2):
            d = math.dist(a, b)
            if d < worst[0]:
                worst = (d, name)
    return worst


if __name__ == "__main__":
    light, dark = load()
    failed = 0
    for name, toks in (("LIGHT", light), ("DARK", dark)):
        rows = evaluate(toks)
        bad = [r for r in rows if not r[6]]
        failed += len(bad)
        print(f"{name}: {len(rows) - len(bad)}/{len(rows)} contrast pairs pass")
        for g, label, fg, bg, r, req, ok in bad:
            print(f"  FAIL {r:.2f} < {req}  {label}  [{fg} on {bg}]")
        low = min(rows, key=lambda x: x[4] / x[5])
        print(f"  tightest margin: {low[1]} = {low[4]:.2f} (needs {low[5]})")
        d, kind = chart_distance(toks)
        ok = d >= CVD_MIN
        failed += 0 if ok else 1
        print(f"  chart series: closest pair {d:.1f} under {kind} (needs {CVD_MIN:g}) {'ok' if ok else 'FAIL'}")
    sys.exit(1 if failed else 0)
