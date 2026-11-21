"""DOCX text read/write for the browser pipeline.

Python owns the text logic; BetterOffice only repacks the XML parts it is
handed (``updateMultipleFiles``).  Every text container the P1 DoD names is
covered:

* body, headers, footers, footnotes, endnotes and comment bodies;
* tracked-change text (``w:delText``);
* revision/comment authors (``w:author``);
* ``docProps/core.xml`` author/title fields.

The parser is hardened (no network, no DTD, no entities) because the file comes
straight from the browser.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field

from lxml import etree

from lethe import core

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
DC = "http://purl.org/dc/elements/1.1/"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
TEXT_TAGS = {f"{{{W}}}t", f"{{{W}}}delText", f"{{{W}}}instrText"}
AUTHOR = f"{{{W}}}author"
CORE_TAGS = {
    f"{{{DC}}}title",
    f"{{{DC}}}subject",
    f"{{{DC}}}description",
    f"{{{DC}}}creator",
    f"{{{CP}}}keywords",
    f"{{{CP}}}lastModifiedBy",
}
TEXT_PART = re.compile(
    r"^(word/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml"
    r"|docProps/core\.xml)$"
)


def parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False
    )


@dataclass
class WriteResult:
    updates: dict[str, str] = field(default_factory=dict)
    tokens: list[str] = field(default_factory=list)
    items: list[dict[str, object]] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def hits(self) -> int:
        return sum(self.counts.values())


def _text_parts(names: list[str]) -> list[str]:
    return [name for name in names if TEXT_PART.match(name)]


def _text_nodes(root: etree._Element) -> list[etree._Element]:
    return [node for node in root.iter() if node.tag in TEXT_TAGS and node.text]


def _author_nodes(root: etree._Element) -> list[etree._Element]:
    return [node for node in root.iter() if node.get(AUTHOR)]


def _core_nodes(root: etree._Element) -> list[etree._Element]:
    return [node for node in root.iter() if node.tag in CORE_TAGS and node.text]


def extract_all_text_parts(raw: bytes) -> dict[str, str]:
    """Every text container as one string per part (leak scanning input)."""
    out: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in _text_parts(archive.namelist()):
            root = etree.fromstring(archive.read(name), parser())
            pieces = [node.text or "" for node in _text_nodes(root)]
            pieces += [node.get(AUTHOR, "") for node in _author_nodes(root)]
            pieces += [node.text or "" for node in _core_nodes(root)]
            out[name] = "\n".join(piece for piece in pieces if piece)
    return out


def _apply(
    raw: bytes,
    replace,
    *,
    collect_items: list[dict[str, object]] | None = None,
    tokens: list[str] | None = None,
) -> WriteResult:
    result = WriteResult(tokens=tokens or [], items=collect_items or [])
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in _text_parts(archive.namelist()):
            root = etree.fromstring(archive.read(name), parser())
            hits = 0
            for node in _text_nodes(root):
                new_text, count = replace(node.text or "")
                if count:
                    node.text = new_text
                    hits += count
            for node in _author_nodes(root):
                current = node.get(AUTHOR, "")
                new_text, count = replace(current)
                if count:
                    node.set(AUTHOR, new_text)
                    hits += count
            for node in _core_nodes(root):
                new_text, count = replace(node.text or "")
                if count:
                    node.text = new_text
                    hits += count
            if hits:
                result.counts[name] = hits
                result.updates[name] = etree.tostring(
                    root, xml_declaration=True, encoding="UTF-8", standalone=True
                ).decode("utf-8")
    return result


def redact(raw: bytes, entities: list[core.Entity]) -> WriteResult:
    """Detect across every text part, then replace per node with stable tokens."""
    # NUL (not whitespace) separates parts so the phone pattern cannot span two
    # unrelated paragraphs and invent an account number.
    corpus = "\x00".join(
        text.replace("\n", "\x00") for text in extract_all_text_parts(raw).values()
    )
    items = core.assign_tokens(core.detect(corpus, entities))
    replace, token_to_real = core.build_replacer(items)
    payload = [
        {
            "type": item.type,
            "canonical": item.canonical,
            "source": item.source,
            "surfaces": item.surfaces,
            "count": item.count,
            "token": item.token,
            "include": item.include,
        }
        for item in items
    ]
    return _apply(raw, replace, collect_items=payload, tokens=sorted(token_to_real))


def restore(raw: bytes, token_map: dict[str, str]) -> WriteResult:
    """Swap tokens back to the real values in every text container."""
    replace = core.build_restorer(token_map)
    return _apply(raw, replace, tokens=sorted(token_map))


def scan_leaks(raw: bytes, surfaces: list[str]) -> list[str]:
    """Return ``part: surface`` for every real value still visible."""
    leaks: list[str] = []
    for name, text in extract_all_text_parts(raw).items():
        for surface in surfaces:
            if surface and surface in text:
                leaks.append(f"{name}: {surface}")
    return leaks
