"""Fail if component CSS contains a literal design value instead of a token.

Usage: python3 -I lint_tokens.py file.html [more files...]
Scans <style> blocks and style="" attributes. Skips tokens.css itself.

Flagged inside a declaration value (anything outside var(...)):
  - hex colors and rgb()/rgba()/hsl() colors
  - lengths with units: px, rem, ch, vh, vw, dvh, svh, pt (and em except 1em)
  - times: ms and s
  - z-index, font-weight and opacity numbers (opacity 0 and 1 are allowed)
  - @media width conditions (use the breakpoint tokens: @media (--nb-md))

Allowed: 0, percentages, fr, unitless line-height, deg, 1em, keywords,
CSS system colors (ButtonText, Highlight ...), transparent, currentColor.

An exception must be explicit: end the declaration's line with
  /* lint-ok: reason */
The exception count is printed, so they stay visible. A documentation page may
fence its own chrome (table of contents, grids) with /* lint-off: reason */ and
/* lint-on */; product components never may.
"""
import re
import sys
from pathlib import Path

LEN = re.compile(r"(?<![\w.#-])-?\d*\.?\d+(?:px|rem|ch|vh|vw|dvh|svh|lvh|pt|em)\b")
TIME = re.compile(r"(?<![\w.#-])\d*\.?\d+(?:ms|s)\b")
COLOR = re.compile(r"#[0-9A-Fa-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|color-mix)\(")
NUMPROP = {"z-index": r"-?\d+", "font-weight": r"\d{3}", "opacity": r"0?\.\d+"}


def strip_vars(v):
    # drop var(...) including nested parens, so a fallback never hides a literal
    out, i = "", 0
    while i < len(v):
        if v.startswith("var(", i):
            depth, j = 0, i + 3
            while j < len(v):
                depth += v[j] == "("
                depth -= v[j] == ")"
                j += 1
                if depth == 0:
                    break
            out += " VAR "
            i = j
        else:
            out += v[i]
            i += 1
    return out


def check_decl(prop, value, where, problems):
    v = strip_vars(value)
    v = re.sub(r'"[^"]*"', '""', v)  # strings
    if prop.startswith("--"):
        problems.append((where, f"custom property defined outside tokens: {prop}"))
        return
    for m in COLOR.finditer(v):
        problems.append((where, f"literal color in {prop}: {value.strip()}"))
        break
    for m in LEN.finditer(v):
        if m.group(0) == "1em":
            continue
        problems.append((where, f"literal length {m.group(0)} in {prop}: {value.strip()}"))
        break
    for m in TIME.finditer(v):
        problems.append((where, f"literal time {m.group(0)} in {prop}: {value.strip()}"))
        break
    if prop in NUMPROP and re.fullmatch(NUMPROP[prop], v.strip()):
        problems.append((where, f"literal {prop}: {value.strip()}"))


def lint_css(css, label, problems, exceptions):
    lines = css.split("\n")
    off, skip = False, set()
    for no, raw in enumerate(lines, 1):
        if "lint-off" in raw:
            off = True
        if off:
            skip.add(no)
        if "lint-on" in raw:
            off = False
    exceptions.append((f"{label}", f"{len(skip)} line(s) in lint-off regions (documentation page chrome only)")) if skip else None
    # strip comments but keep line numbers
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    for no, raw in enumerate(lines, 1):
        if "lint-ok" in raw:
            exceptions.append((f"{label}:{no}", raw.strip()[:100]))
    text = re.sub(r"/\*.*?\*/", blank, css, flags=re.S)
    # @media conditions
    for m in re.finditer(r"@media[^{]*\{", text):
        cond = m.group(0)
        if re.search(r"(min|max)-(width|height)\s*:\s*[\d.]+", cond):
            no = text[:m.start()].count("\n") + 1
            if "lint-ok" not in lines[no - 1] and no not in skip:
                problems.append((f"{label}:{no}", f"literal media query: {cond.strip('{ ').strip()} (use @media (--nb-md))"))
    # declarations
    for m in re.finditer(r"([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=;|\})", text):
        prop, value = m.group(1), m.group(2)
        if "{" in value:
            continue
        no = text[:m.start()].count("\n") + 1
        if "lint-ok" in lines[no - 1] or no in skip:
            continue
        # selectors like a:hover, .x:focus-visible look like declarations; skip them
        if prop in {"a", "li", "tr", "td", "th", "p", "div", "span", "button", "input", "label", "ul", "ol", "tbody", "thead"} or value.strip().startswith(("hover", "focus", "active", "checked", "not(", "first", "last", "nth", "disabled", ":")):
            continue
        check_decl(prop, value, f"{label}:{no}", problems)


def lint_file(path):
    html = Path(path).read_text(encoding="utf-8")
    problems, exceptions = [], []
    for m in re.finditer(r"<style[^>]*>(.*?)</style>", html, re.S):
        css = m.group(1)
        css = css.replace("{{TOKENS}}", "").replace("{{FONTS}}", "")
        offset = html[:m.start(1)].count("\n")
        pad = "\n" * offset
        lint_css(pad + css, Path(path).name, problems, exceptions)
    for m in re.finditer(r'style="([^"]*)"', html):
        no = html[:m.start()].count("\n") + 1
        for d in m.group(1).split(";"):
            if ":" in d:
                p, v = d.split(":", 1)
                if "lint-ok" not in html.split("\n")[no - 1]:
                    check_decl(p.strip(), v, f"{Path(path).name}:{no} (inline style)", problems)
    return problems, exceptions


if __name__ == "__main__":
    allp, alle = [], []
    for f in sys.argv[1:]:
        p, e = lint_file(f)
        allp += p
        alle += e
    for where, msg in allp:
        print(f"{where}  {msg}")
    print(f"\n{len(allp)} literal value(s) found, {len(alle)} explicit exception(s).")
    sys.exit(1 if allp else 0)
