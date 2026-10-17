import logging
import os
import re
from typing import Any, Dict, List, Optional
import docx
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from docx.table import Table

logger = logging.getLogger("doc_tools.docx")

ZIP_MAGIC_BYTES = b"\x50\x4b\x03\x04"
OLE2_MAGIC_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def validate_docx_magic_bytes(file_path: str) -> None:
    with open(file_path, "rb") as f:
        header = f.read(8)

    if header.startswith(OLE2_MAGIC_BYTES):
        raise ValueError("Legacy OLE2 Word document (.doc) or encrypted package is not supported")
    if not header.startswith(ZIP_MAGIC_BYTES):
        raise ValueError("Invalid DOCX format: missing ZIP magic bytes (50 4B 03 04)")


def format_run_text(text: str, is_bold: bool, is_italic: bool, is_strike: bool) -> str:
    if not text:
        return ""
    leading_ws = len(text) - len(text.lstrip())
    trailing_ws = len(text) - len(text.rstrip())
    core = text.strip()
    if not core:
        return text

    if is_strike:
        core = f"~~{core}~~"
    if is_bold and is_italic:
        core = f"***{core}***"
    elif is_bold:
        core = f"**{core}**"
    elif is_italic:
        core = f"*{core}*"

    return f"{' ' * leading_ws}{core}{' ' * trailing_ws}"


def extract_paragraph_formatted_text(p: Paragraph) -> str:
    parts: List[str] = []

    for child in p._p:
        tag = child.tag.lower()
        if tag.endswith("r"):
            run = Run(child, p)
            text = run.text
            if not text:
                continue
            is_bold = bool(run.bold)
            is_italic = bool(run.italic)
            is_strike = bool(run.font.strike) if run.font else False
            parts.append(format_run_text(text, is_bold, is_italic, is_strike))
        elif tag.endswith("hyperlink"):
            r_id = child.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            url = None
            if r_id and p.part and r_id in p.part.rels:
                url = p.part.rels[r_id].target_ref

            link_texts = []
            for r_elem in child:
                if r_elem.tag.lower().endswith("r"):
                    run = Run(r_elem, p)
                    if run.text:
                        link_texts.append(run.text)
            link_content = "".join(link_texts).strip()
            if link_content:
                if url:
                    parts.append(f"[{link_content}]({url})")
                else:
                    parts.append(link_content)

    formatted = "".join(parts).strip()
    return formatted if formatted else p.text.strip()


def extract_docx(file_path: str) -> Dict[str, Any]:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"DOCX file not found: {file_path}")

    # Validate header magic bytes
    validate_docx_magic_bytes(file_path)

    doc = docx.Document(file_path)

    metadata: Dict[str, str] = {}
    try:
        props = doc.core_properties
        if props.title:
            metadata["title"] = str(props.title)
        if props.author:
            metadata["author"] = str(props.author)
        if props.created:
            metadata["created"] = str(props.created)
        if props.modified:
            metadata["modified"] = str(props.modified)
        if props.last_modified_by:
            metadata["lastModifiedBy"] = str(props.last_modified_by)
    except Exception as e:
        logger.warning("Error reading core properties from DOCX: %s", e)

    blocks: List[Dict[str, Any]] = []
    heading_hierarchy: List[str] = []
    current_char_offset = 0
    total_words = 0
    total_paragraphs = 0
    total_tables = 0
    block_index = 0

    # Iterate through body elements in TRUE document order (interleaved paragraphs and tables)
    for child in doc.element.body:
        tag = child.tag.lower()

        if tag.endswith("p"):
            p = Paragraph(child, doc)
            text = extract_paragraph_formatted_text(p)
            if not text:
                continue

            total_paragraphs += 1
            words = len(text.split())
            total_words += words

            style_name = p.style.name if p.style else ""
            node_type = "paragraph"
            level: Optional[int] = None

            # Check OOXML w:outlineLvl first (language-agnostic), then style name
            outline_val = child.xpath(".//w:pPr/w:outlineLvl/@w:val")
            if outline_val:
                try:
                    val = int(outline_val[0])
                    level = min(6, max(1, val + 1))
                    node_type = "heading"
                except (ValueError, TypeError):
                    pass

            if level is None and ("heading" in style_name.lower() or "title" in style_name.lower()):
                node_type = "heading"
                match = re.search(r"\d+", style_name)
                level = int(match.group(0)) if match else 1
                if level > 6:
                    level = 6
                elif level < 1:
                    level = 1

            if node_type == "heading" and level is not None:
                # Adjust hierarchy stack: pop headings at or deeper than current level
                while len(heading_hierarchy) >= level:
                    heading_hierarchy.pop()
                heading_hierarchy.append(text)
            elif "list" in style_name.lower() or p.text.startswith(("\u2022", "-", "*")):
                node_type = "list-item"

            char_start = current_char_offset
            char_end = char_start + len(text)
            current_char_offset = char_end + 2  # inter-block delimiter \n\n

            block: Dict[str, Any] = {
                "index": block_index,
                "nodeType": node_type,
                "text": text,
                "charStart": char_start,
                "charEnd": char_end,
                "headingHierarchy": list(heading_hierarchy),
            }
            if level is not None:
                block["level"] = level

            blocks.append(block)
            block_index += 1

        elif tag.endswith("tbl"):
            t = Table(child, doc)
            rows_data: List[List[str]] = []
            header_row_indices: List[int] = []

            for r_idx, row in enumerate(t.rows):
                # Detect header rows via w:tblHeader
                is_tbl_header = bool(row._tr.xpath(".//w:trPr/w:tblHeader"))
                if is_tbl_header:
                    header_row_indices.append(r_idx)

                # Skip duplicate cells from gridSpan and vMerge
                visited_tcs = set()
                row_cells: List[str] = []
                for cell in row.cells:
                    if id(cell._tc) in visited_tcs:
                        continue
                    visited_tcs.add(id(cell._tc))

                    v_merge = cell._tc.xpath(".//w:tcPr/w:vMerge/@w:val")
                    if v_merge and v_merge[0] == "continue":
                        continue

                    row_cells.append(cell.text.strip())

                if row_cells:
                    rows_data.append(row_cells)

            if not rows_data:
                continue

            total_tables += 1
            table_text = "\n".join(" | ".join(r) for r in rows_data)
            char_start = current_char_offset
            char_end = char_start + len(table_text)
            current_char_offset = char_end + 2

            words = len(table_text.split())
            total_words += words

            headers = None
            body_rows = rows_data
            if header_row_indices and header_row_indices[0] == 0:
                headers = rows_data[0]
                body_rows = rows_data[1:]
            elif len(rows_data) > 1:
                headers = rows_data[0]
                body_rows = rows_data[1:]

            blocks.append({
                "index": block_index,
                "nodeType": "table",
                "text": table_text,
                "charStart": char_start,
                "charEnd": char_end,
                "headingHierarchy": list(heading_hierarchy),
                "table": {
                    "headers": headers,
                    "rows": body_rows,
                },
            })
            block_index += 1

    total_characters = current_char_offset - 2 if current_char_offset >= 2 else 0

    return {
        "totalCharacters": max(0, total_characters),
        "totalWords": total_words,
        "totalParagraphs": total_paragraphs,
        "totalTables": total_tables,
        "metadata": metadata,
        "blocks": blocks,
    }
