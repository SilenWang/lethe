"""PPTX text redaction without a presentation/object model.

Every owned part is edited in place with lxml: slides (including tables and
text boxes), speaker notes, masters/layouts, legacy comments and authors,
custom XML and document properties.  The package is then rebuilt from the
source archive; unchanged entries keep their original compressed stream
(the P0 C1/C2/C3 contract).  BetterOffice is not used for pptx, so a 50 MB
deck never builds the 640 MB presentation object graph.
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
    output: bytes | None = None
    updates: dict[str, str] = field(default_factory=dict)
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


def redact(
    raw: bytes,
    entities: list[core.Entity],
    *,
    token_overrides: dict[str, str] | None = None,
) -> PptxResult:
    corpus = "\x00".join(
        text.replace("\n", "\x00") for text in extract_all_text_parts(raw).values()
    )
    items = core.apply_token_overrides(
        core.assign_tokens(core.detect(corpus, entities)), token_overrides
    )
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
            data = archive.read(part)
            new, hits = _apply_part(part, data, replace)
            if new is not None:
                result.updates[part] = new.decode("utf-8")
                result.counts[part] = result.counts.get(part, 0) + hits
    result.output = _repack(
        raw, {name: value.encode("utf-8") for name, value in result.updates.items()}
    )
    leaks = scan_leaks(result.output, result.surfaces)
    if leaks:
        raise PptxLeakError("leaks remain: " + ", ".join(leaks[:5]))
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
    result.output = _repack(
        raw, {name: value.encode("utf-8") for name, value in result.updates.items()}
    )
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


