"""
Notebench Pure MIT PDF Extraction Engine.
Implements fast preflight scanned PDF detection (<5ms) using pypdf,
and high-precision word/block/table bounding box normalization using pdfplumber.
Strictly zero AGPL dependencies per ADR 0003 and Guard Check 27.
"""

import gc
import os
from typing import Any, Dict, List, Optional
import pdfplumber
import pypdf

SCANNED_PDF_MESSAGE = "Scanned PDF. OCR arrives in 0.2"


def _clamp(val: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    return max(min_val, min(max_val, val))


def normalize_coord(val: float, total_dim: float) -> float:
    if total_dim <= 0:
        return 0.0
    return round(_clamp(val / total_dim), 5)


def preflight_pdf(file_path: str) -> Dict[str, Any]:
    """
    Tier-0 fast preflight inspection (<5ms) using pypdf.
    Checks page count, font resources (/Font), and image objects (/XObject)
    to detect scanned PDFs with sub-5ms latency across documents of any page count.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found: {file_path}")

    reader = pypdf.PdfReader(file_path)
    page_count = len(reader.pages)
    if page_count == 0:
        return {
            "isScanned": False,
            "scannedMessage": None,
            "pageCount": 0,
            "totalCharacters": 0,
        }

    # Tier-0 fast resource inspection on sample pages (up to 5 pages)
    sample_limit = min(page_count, 5)
    has_fonts = False
    has_images = False
    sample_text = ""

    for i in range(sample_limit):
        page = reader.pages[i]
        resources = page.get("/Resources")
        if resources is not None:
            fonts = resources.get("/Font")
            if fonts and len(fonts) > 0:
                has_fonts = True
            xobjects = resources.get("/XObject")
            if xobjects and len(xobjects) > 0:
                has_images = True

        try:
            txt = page.extract_text() or ""
            sample_text += txt.strip()
        except Exception:
            pass

    total_chars = len(sample_text)

    # Scanned detection:
    # 1. No font resources and zero text extracted
    # 2. Images present with zero text
    # 3. All sample pages yield zero text characters
    is_scanned = (not has_fonts and total_chars == 0) or (total_chars == 0 and has_images) or (total_chars == 0 and page_count > 0)

    return {
        "isScanned": is_scanned,
        "scannedMessage": SCANNED_PDF_MESSAGE if is_scanned else None,
        "pageCount": page_count,
        "totalCharacters": total_chars,
    }


def _group_words_into_blocks(words: List[Dict[str, Any]], page_number: int) -> List[Dict[str, Any]]:
    """Groups words into lines and text blocks/paragraphs, preserving line breaks."""
    if not words:
        return []

    # 1. Group words into lines based on vertical overlap (top/bottom)
    lines: List[List[Dict[str, Any]]] = []
    current_line: List[Dict[str, Any]] = []


    for word in words:
        if not current_line:
            current_line.append(word)
            continue

        prev_word = current_line[-1]
        # Same line if tops are within 0.008 (relative) or overlapping
        if abs(word["box"][1] - prev_word["box"][1]) <= 0.008:
            current_line.append(word)
        else:
            lines.append(current_line)
            current_line = [word]

    if current_line:
        lines.append(current_line)

    # 2. Group lines into paragraph blocks
    blocks: List[Dict[str, Any]] = []
    current_block_lines: List[List[Dict[str, Any]]] = []

    for line in lines:
        if not current_block_lines:
            current_block_lines.append(line)
            continue

        prev_line = current_block_lines[-1]
        prev_bottom = max(w["box"][3] for w in prev_line)
        curr_top = min(w["box"][1] for w in line)
        line_gap = curr_top - prev_bottom

        # If gap between lines is within standard paragraph spacing (<= 0.03 relative)
        if line_gap <= 0.03:
            current_block_lines.append(line)
        else:
            # Emit block
            block_words = [w for l in current_block_lines for w in l]
            bx0 = min(w["box"][0] for w in block_words)
            by0 = min(w["box"][1] for w in block_words)
            bx1 = max(w["box"][2] for w in block_words)
            by1 = max(w["box"][3] for w in block_words)
            bw = round(bx1 - bx0, 5)
            bh = round(by1 - by0, 5)
            line_strings = [" ".join(w["text"] for w in l) for l in current_block_lines]
            text = "\n".join(line_strings)
            blocks.append({
                "pageNumber": page_number,
                "text": text,
                "box": [bx0, by0, bx1, by1],
                "rect": [bx0, by0, bw, bh],
                "words": block_words,
            })
            current_block_lines = [line]

    if current_block_lines:
        block_words = [w for l in current_block_lines for w in l]
        bx0 = min(w["box"][0] for w in block_words)
        by0 = min(w["box"][1] for w in block_words)
        bx1 = max(w["box"][2] for w in block_words)
        by1 = max(w["box"][3] for w in block_words)
        bw = round(bx1 - bx0, 5)
        bh = round(by1 - by0, 5)
        line_strings = [" ".join(w["text"] for w in l) for l in current_block_lines]
        text = "\n".join(line_strings)
        blocks.append({
            "pageNumber": page_number,
            "text": text,
            "box": [bx0, by0, bx1, by1],
            "rect": [bx0, by0, bw, bh],
            "words": block_words,
        })

    return blocks


def extract_pdf(
    file_path: str,
    max_pages: Optional[int] = None,
    preflight: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Extracts text blocks, tables (with cells), and normalized bounding boxes [0, 1] using pdfplumber.
    Enforces explicit page.close() and memory GC to keep RSS <120 MB across 100+ pages.
    """
    if preflight is None:
        preflight = preflight_pdf(file_path)

    metadata: Dict[str, Any] = {}
    try:
        reader = pypdf.PdfReader(file_path)
        if reader.metadata:
            for k, v in reader.metadata.items():
                clean_key = str(k).lstrip("/").lower()
                metadata[clean_key] = str(v)
    except Exception:
        pass

    pages_result: List[Dict[str, Any]] = []

    pdf = pdfplumber.open(file_path)
    try:
        pages_to_process = pdf.pages
        if max_pages is not None and max_pages > 0:
            pages_to_process = pages_to_process[:max_pages]

        for idx, page in enumerate(pages_to_process):
            page_number = idx + 1
            width = float(page.width)
            height = float(page.height)

            try:
                # Extract words with layout bypass
                raw_words = page.extract_words(
                    x_tolerance=3,
                    y_tolerance=3,
                    expand_ligatures=True,
                )

                words: List[Dict[str, Any]] = []
                for w in raw_words:
                    x0 = normalize_coord(float(w["x0"]), width)
                    y0 = normalize_coord(float(w["top"]), height)
                    x1 = normalize_coord(float(w["x1"]), width)
                    y1 = normalize_coord(float(w["bottom"]), height)
                    if x1 < x0:
                        x1 = x0
                    if y1 < y0:
                        y1 = y0
                    w_width = round(x1 - x0, 5)
                    w_height = round(y1 - y0, 5)
                    words.append({
                        "text": str(w.get("text", "")),
                        "box": [x0, y0, x1, y1],
                        "rect": [x0, y0, w_width, w_height],
                    })

                # Sort words in reading order (top-to-bottom, left-to-right)
                words.sort(key=lambda item: (item["box"][1], item["box"][0]))

                # Group words into lines and blocks
                blocks = _group_words_into_blocks(words, page_number)

                # Extract tables with cell geometries
                tables: List[Dict[str, Any]] = []
                try:
                    found_tables = page.find_tables()
                    for t in found_tables:
                        tx0, ttop, tx1, tbottom = t.bbox
                        nx0 = normalize_coord(float(tx0), width)
                        ny0 = normalize_coord(float(ttop), height)
                        nx1 = normalize_coord(float(tx1), width)
                        ny1 = normalize_coord(float(tbottom), height)
                        if nx1 < nx0:
                            nx1 = nx0
                        if ny1 < ny0:
                            ny1 = ny0
                        nw = round(nx1 - nx0, 5)
                        nh = round(ny1 - ny0, 5)

                        raw_rows = t.extract() or []
                        cleaned_rows = [
                            [str(c).strip() if c is not None else "" for c in row]
                            for row in raw_rows
                        ]

                        # Extract cell bounding boxes per Research §3.1
                        cells: List[Dict[str, Any]] = []
                        if hasattr(t, "cells") and t.cells:
                            for cell in t.cells:
                                cx0, ctop, cx1, cbottom = cell
                                ncx0 = normalize_coord(float(cx0), width)
                                ncy0 = normalize_coord(float(ctop), height)
                                ncx1 = normalize_coord(float(cx1), width)
                                ncy1 = normalize_coord(float(cbottom), height)
                                ncw = round(ncx1 - ncx0, 5)
                                nch = round(ncy1 - ncy0, 5)
                                cells.append({
                                    "box": [ncx0, ncy0, ncx1, ncy1],
                                    "rect": [ncx0, ncy0, ncw, nch],
                                })

                        tables.append({
                            "box": [nx0, ny0, nx1, ny1],
                            "rect": [nx0, ny0, nw, nh],
                            "cells": cells,
                            "rows": cleaned_rows,
                        })
                except Exception:
                    pass

                page_text = "\n\n".join(b["text"] for b in blocks) if blocks else (page.extract_text() or "")

                pages_result.append({
                    "pageNumber": page_number,
                    "width": width,
                    "height": height,
                    "text": page_text,
                    "words": words,
                    "blocks": blocks,
                    "tables": tables,
                })
            finally:
                page.close()
                if hasattr(page, "_objects"):
                    page._objects.clear()
                if hasattr(page, "_layout"):
                    page._layout = None

            if (idx + 1) % 25 == 0:
                gc.collect()

    finally:
        pdf.close()
        gc.collect()

    return {
        "pageCount": preflight["pageCount"],
        "isScanned": preflight["isScanned"],
        "scannedMessage": preflight["scannedMessage"],
        "totalCharacters": preflight["totalCharacters"],
        "metadata": metadata,
        "pages": pages_result,
    }
