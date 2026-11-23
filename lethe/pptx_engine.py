"""PPTX redaction: BetterOffice for slide text, part patches for its gaps.

BetterOffice 0.5.1 rewrites slide text (including text boxes and tables) and
leaves every other part byte-identical.  It has no API for:

* speaker notes (``ppt/notesSlides/*``);
* master / layout text (``ppt/slideMasters/*``, ``ppt/slideLayouts/*``);
* existing comment bodies and authors (``ppt/comments/*``,
  ``ppt/commentAuthors.xml``);
* document properties (``docProps/*``).

Those four are patched directly in Python.  The final package always starts
from the source archive (``postprocess``): only slide parts the library
actually changed are kept, every other part is copied as its original
compressed stream, then the gap patches are applied.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field

from lxml import etree

from lethe import core
from lethe.postprocess import (
    PostprocessError,
    _rebuild,
    postprocess,
)
from tools.postprocess_contract import (
    assert_source_priority,
    assert_unedited_compressed_stream,
    assert_unedited_part_sha256,
)

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
DC = "http://purl.org/dc/elements/1.1/"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"

SLIDE = re.compile(r"ppt/slides/slide\d+\.xml")
NOTES = re.compile(r"ppt/notesSlides/notesSlide\d+\.xml")
MASTER = re.compile(r"ppt/slideMasters/slideMaster\d+\.xml")
LAYOUT = re.compile(r"ppt/slideLayouts/slideLayout\d+\.xml")
COMMENTS = re.compile(r"ppt/comments/comment\d+\.xml")
DOC_PROPS = {"docProps/core.xml", "docProps/app.xml", "docProps/custom.xml"}

CORE_TAGS = {
    f"{{{DC}}}title",
    f"{{{DC}}}subject",
    f"{{{DC}}}description",
    f"{{{DC}}}creator",
    f"{{{CP}}}keywords",
    f"{{{CP}}}lastModifiedBy",
}
APP_TAGS = {f"{{{P}}}Company", "Company", "Manager"}


def parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False
    )


@dataclass
class PptxResult:
    updates: dict[str, str] = field(default_factory=dict)
    replacements: list[dict[str, str]] = field(default_factory=list)
    tokens: list[str] = field(default_factory=list)
    items: list[dict[str, object]] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    surfaces: list[str] = field(default_factory=list)

    @property
    def hits(self) -> int:
        return sum(self.counts.values())


class PptxLeakError(RuntimeError):
    """A real value survived both the library and the part patches."""


def _local(node: etree._Element) -> str:
    return etree.QName(node).localname if isinstance(node.tag, str) else ""


def _set_space(node: etree._Element) -> None:
    text = node.text or ""
    if text != text.strip():
        node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")


def _replace_runs(nodes: list[etree._Element], replace) -> int:
    if not nodes:
        return 0
    full = "".join(node.text or "" for node in nodes)
    new, hits = replace(full)
    if not hits:
        return 0
    per_run: list[str] = []
    per_hits = 0
    for node in nodes:
        text, count = replace(node.text or "")
        per_run.append(text)
        per_hits += count
    if per_hits == hits:
        for node, text in zip(nodes, per_run):
            node.text = text
            _set_space(node)
    else:
        nodes[0].text = new
        _set_space(nodes[0])
        for node in nodes[1:]:
            node.text = ""
    return hits


def _paragraph_texts(root: etree._Element) -> list[str]:
    out: list[str] = []
    for para in root.iter(f"{{{A}}}p"):
        text = "".join(
            node.text or ""
            for node in para.iter(f"{{{A}}}t")
            if isinstance(node.tag, str)
        )
        if text:
            out.append(text)
    return out


def _apply_text_part(data: bytes, replace) -> tuple[bytes | None, int]:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return None, 0
    hits = 0
    for para in root.iter(f"{{{A}}}p"):
        nodes = [
            node
            for node in para.iter(f"{{{A}}}t")
            if isinstance(node.tag, str)
        ]
        hits += _replace_runs(nodes, replace)
    if not hits:
        return None, 0
    return (
        etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True),
        hits,
    )


def _apply_comments(data: bytes, replace) -> tuple[bytes | None, int]:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return None, 0
    hits = 0
    for node in root.iter(f"{{{P}}}text"):
        if node.text:
            new, count = replace(node.text)
            if count:
                node.text = new
                hits += count
    if not hits:
        return None, 0
    return (
        etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True),
        hits,
    )


def _apply_authors(data: bytes, replace) -> tuple[bytes | None, int]:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return None, 0
    hits = 0
    for node in root.iter(f"{{{P}}}cmAuthor"):
        name = node.get("name")
        if not name:
            continue
        new, count = replace(name)
        if count:
            node.set("name", new)
            hits += count
    if not hits:
        return None, 0
    return (
        etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True),
        hits,
    )


def _apply_props(data: bytes, replace) -> tuple[bytes | None, int]:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return None, 0
    hits = 0
    for node in root.iter():
        if not isinstance(node.tag, str):
            continue
        local = _local(node)
        if (node.tag in CORE_TAGS or local in APP_TAGS or local in {"lpwstr", "lpstr"}) and node.text:
            new, count = replace(node.text)
            if count:
                node.text = new
                hits += count
    if not hits:
        return None, 0
    return (
        etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True),
        hits,
    )


def _apply_part(part: str, data: bytes, replace) -> tuple[bytes | None, int]:
    if part in DOC_PROPS:
        return _apply_props(data, replace)
    if COMMENTS.match(part):
        return _apply_comments(data, replace)
    if part.endswith("commentAuthors.xml"):
        return _apply_authors(data, replace)
    return _apply_text_part(data, replace)


def _part_text(part: str, data: bytes) -> str:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return ""
    if COMMENTS.match(part):
        return "\n".join(
            node.text or "" for node in root.iter(f"{{{P}}}text") if node.text
        )
    if part.endswith("commentAuthors.xml"):
        return "\n".join(
            node.get("name", "")
            for node in root.iter(f"{{{P}}}cmAuthor")
            if node.get("name")
        )
    if part in DOC_PROPS:
        pieces: list[str] = []
        for node in root.iter():
            if not isinstance(node.tag, str):
                continue
            local = _local(node)
            if (node.tag in CORE_TAGS or local in APP_TAGS or local in {"lpwstr", "lpstr"}) and node.text:
                pieces.append(node.text)
        return "\n".join(pieces)
    return "\n".join(_paragraph_texts(root))


def _text_parts(names: list[str]) -> list[str]:
    out: list[str] = []
    for name in names:
        if name.endswith("/"):
            continue
        if (
            SLIDE.match(name)
            or NOTES.match(name)
            or MASTER.match(name)
            or LAYOUT.match(name)
            or COMMENTS.match(name)
            or name.endswith("commentAuthors.xml")
            or name in DOC_PROPS
        ):
            out.append(name)
    return sorted(out)


def extract_all_text_parts(raw: bytes) -> dict[str, str]:
    out: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for part in _text_parts(archive.namelist()):
            text = _part_text(part, archive.read(part))
            if text:
                out[part] = text
    return out


def scan_leaks(raw: bytes, surfaces: list[str]) -> list[str]:
    leaks: list[str] = []
    for name, text in extract_all_text_parts(raw).items():
        for surface in surfaces:
            if surface and surface in text:
                leaks.append(f"{name}: {surface}")
    return leaks


def _warnings(raw: bytes) -> list[str]:
    warnings: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        if any(name.startswith("ppt/charts/") for name in names):
            warnings.append("pptx.chart_cache")
        if any(name.startswith("ppt/diagrams/") for name in names):
            warnings.append("pptx.smartart")
        if any(name.startswith("ppt/embeddings/") for name in names):
            warnings.append("pptx.ole")
    return warnings


def _slide_replacements(
    raw: bytes, items: list[core.Item], replace
) -> tuple[list[dict[str, str]], dict[str, int], set[str]]:
    slide_text: list[str] = []
    counts: dict[str, int] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for part in archive.namelist():
            if not SLIDE.match(part):
                continue
            text = _part_text(part, archive.read(part))
            if text:
                slide_text.append(text)
                _, hits = replace(text)
                if hits:
                    counts[part] = hits
    haystack = "\n".join(slide_text)
    # findText is exact/case-sensitive.  Collect the actual casing from the
    # slide text so "JOHN SMITH" is not missed just because the dictionary
    # stores "John Smith"; the same values become leak-scan surfaces.
    pairs: dict[str, str] = {}
    for item in items:
        if not item.include or not item.token:
            continue
        for surface in item.surfaces:
            if not surface:
                continue
            for match in core._whole_word_regex(surface).finditer(haystack):
                pairs.setdefault(match.group(0), item.token)
    replacements = [
        {"find": surface, "token": token}
        for surface, token in sorted(pairs.items(), key=lambda pair: len(pair[0]), reverse=True)
    ]
    return replacements, counts, set(pairs)


def redact(raw: bytes, entities: list[core.Entity]) -> PptxResult:
    corpus = "\x00".join(
        text.replace("\n", "\x00") for text in extract_all_text_parts(raw).values()
    )
    items = core.assign_tokens(core.detect(corpus, entities))
    replace, token_to_real = core.build_replacer(items)
    surfaces = sorted(
        {
            surface
            for item in items
            if item.include
            for surface in [*item.surfaces, item.canonical]
            if surface
        }
    )
    result = PptxResult(
        tokens=sorted(token_to_real),
        items=[
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
        ],
        warnings=_warnings(raw),
        surfaces=surfaces,
    )
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for part in _text_parts(archive.namelist()):
            if SLIDE.match(part):
                continue
            data = archive.read(part)
            new, hits = _apply_part(part, data, replace)
            if new is not None:
                result.updates[part] = new.decode("utf-8")
                result.counts[part] = result.counts.get(part, 0) + hits
    result.replacements, slide_counts, actual = _slide_replacements(raw, items, replace)
    result.surfaces = sorted(set(result.surfaces) | actual)
    result.counts.update(slide_counts)
    return result


def restore(raw: bytes, token_map: dict[str, str]) -> PptxResult:
    replace = core.build_restorer(token_map)
    result = PptxResult(tokens=sorted(token_map), warnings=_warnings(raw))
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for part in _text_parts(archive.namelist()):
            data = archive.read(part)
            new, hits = _apply_part(part, data, replace)
            if new is not None:
                result.updates[part] = new.decode("utf-8")
                result.counts[part] = result.counts.get(part, 0) + hits
    result.replacements = [
        {"find": token, "token": real}
        for token, real in token_map.items()
        if token
    ]
    result.replacements.sort(key=lambda pair: len(pair["find"]), reverse=True)
    return result


def _repack(source: bytes, replacements: dict[str, bytes]) -> bytes:
    if not replacements:
        return source
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as edited:
        for name, data in replacements.items():
            edited.writestr(name, data)
    with zipfile.ZipFile(io.BytesIO(source)) as src, zipfile.ZipFile(
        io.BytesIO(buffer.getvalue())
    ) as output:
        missing = sorted(set(replacements) - set(src.namelist()))
        if missing:
            raise PostprocessError(f"cannot replace missing parts: {missing}")
        rebuilt = _rebuild(src, output, set(replacements))
    for assertion in (
        assert_source_priority,
        assert_unedited_part_sha256,
        assert_unedited_compressed_stream,
    ):
        assertion(io.BytesIO(source), io.BytesIO(rebuilt), set(replacements))
    return rebuilt


def _fallback_slides(
    source: bytes, final: bytes, replacements: list[dict[str, str]]
) -> bytes:
    """Patch any slide the library missed (case mismatch, unusual run split)."""
    pairs = [(item["find"], item["token"]) for item in replacements if item.get("find")]
    if not pairs:
        return final
    pairs.sort(key=lambda pair: len(pair[0]), reverse=True)

    def replace(text: str) -> tuple[str, int]:
        hits = 0
        for find, token in pairs:
            if find in text:
                hits += text.count(find)
                text = text.replace(find, token)
        return text, hits

    leaks = scan_leaks(final, [item["find"] for item in replacements])
    leaked = {line.split(":")[0] for line in leaks if line.startswith("ppt/slides/")}
    if not leaked:
        return final
    updates: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        for part in leaked:
            new, _hits = _apply_text_part(archive.read(part), replace)
            if new is not None:
                updates[part] = new
    return _repack(final, updates)


def finish(
    source: bytes,
    library: bytes,
    tokens: list[str],
    updates: dict[str, str],
    replacements: list[dict[str, str]] | None = None,
    surfaces: list[str] | None = None,
) -> bytes:
    """Source-first repack, then apply the four gap-part patches."""
    final = postprocess(source, library, tokens)
    patched = {name: value.encode("utf-8") for name, value in updates.items()}
    final = _repack(final, patched)
    if replacements:
        final = _fallback_slides(source, final, replacements)
    if surfaces:
        leaks = scan_leaks(final, surfaces)
        if leaks:
            raise PptxLeakError("leaks remain: " + ", ".join(leaks[:5]))
    return final
