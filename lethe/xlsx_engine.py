"""XLSX text read/write without a document-model library.

This is the P2 xlsx path: lxml/regex part edits plus raw-copy repacking.  It
exists because BetterOffice's xlsx save rewrites the whole package model:
500 edits leave the original shared strings behind (a leak), turn 500 cells
into inline strings (a C14N structure change) and drop ``calcChain.xml``.

Owned text containers (the leak-scan surface):

* ``xl/sharedStrings.xml`` (``<si>`` / rich-text ``<r><t>``);
* worksheet inline strings (``t="inlineStr"``) and formula cached strings
  (``t="str"``, ``<v>`` only -- ``<f>`` is never touched);
* ``xl/comments*.xml`` (comment body + author);
* ``xl/threadedComments/*.xml`` and ``xl/persons/*.xml``;
* ``customXml/*.xml``;
* ``docProps/core.xml``, ``docProps/app.xml``, ``docProps/custom.xml``;
* drawing / chart ``a:t`` text (text boxes and chart titles).

Not owned (reported as warnings, never rewritten): pivot caches, chart
numeric caches, SmartArt diagrams, OLE embeddings, external links and formula
literals.  Those are the UI/文档 degradation list.

The package is rebuilt from the source archive; only the parts we actually
change are recompressed, every other entry is copied as its original
compressed stream (``postprocess.repack``).
"""

from __future__ import annotations

import html
import io
import re
import zipfile
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from lxml import etree

from lethe import core
from lethe.postprocess import repack

SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
DC = "http://purl.org/dc/elements/1.1/"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"

_CELL_OPEN = re.compile(rb"<c(?=[\s/>])[^>]*>")
_SI_OPEN = re.compile(rb"<si(?=[\s/>])[^>]*>")
_T = re.compile(rb"<t(?=[\s/>])[^>]*>(.*?)</t>", re.DOTALL)
_V = re.compile(rb"<v(?:\s[^>]*)?>(.*?)</v>", re.DOTALL)
_XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False
    )


def _unescape(raw: bytes) -> str:
    text = raw.decode("utf-8", "strict")
    if text.startswith("<![CDATA[") and text.endswith("]]>"):
        text = text[9:-3]
    return html.unescape(text)


def _iter_chunks(data: bytes, open_re: re.Pattern[bytes], close: bytes):
    """Yield ``(start, end, chunk)`` for flat elements such as ``<c>``/``<si>``.

    A non-greedy DOTALL regex over an 8 MB worksheet backtracks badly; scanning
    the open tag and using ``bytes.find`` for the close is linear.
    """
    position = 0
    for match in open_re.finditer(data):
        if match.start() < position:
            continue
        tag = match.group(0)
        if tag.endswith(b"/>"):
            position = match.end()
            yield match.start(), match.end(), tag
            continue
        end = data.find(close, match.end())
        if end < 0:
            break
        end += len(close)
        position = end
        yield match.start(), end, data[match.start() : end]


def _iter_cells(data: bytes):
    return _iter_chunks(data, _CELL_OPEN, b"</c>")


def _iter_si(data: bytes):
    return _iter_chunks(data, _SI_OPEN, b"</si>")


def _chunk_text(chunk: bytes) -> str:
    return "".join(_unescape(match.group(1)) for match in _T.finditer(chunk))


def _v_text(chunk: bytes) -> str | None:
    match = _V.search(chunk)
    return _unescape(match.group(1)) if match else None


def _attr(open_tag: bytes, name: bytes) -> str | None:
    match = re.search(rb"\b" + name + rb'="([^"]*)"', open_tag)
    return match.group(1).decode("utf-8", "strict") if match else None


def _split_cell(chunk: bytes) -> tuple[bytes, bytes | None]:
    end = chunk.find(b">")
    if end < 0:
        return chunk, None
    if chunk[end - 1 : end] == b"/":
        return chunk[: end + 1], None
    return chunk[: end + 1], chunk[end + 1 : -4]


def _t_nodes(fragment: etree._Element) -> list[etree._Element]:
    return [
        node
        for node in fragment.iter()
        if isinstance(node.tag, str) and etree.QName(node).localname == "t"
    ]


def _set_space(node: etree._Element) -> None:
    text = node.text or ""
    if text != text.strip():
        node.set(_XML_SPACE, "preserve")


def _replace_runs(nodes: list[etree._Element], replace) -> int:
    """Replace inside a rich-text container without flattening it when a match
    does not cross a run boundary."""
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


def _rewrite_container(chunk: bytes, replace) -> tuple[bytes, int]:
    """Rewrite the text of one ``<si>``/``<is>`` fragment."""
    matches = list(_T.finditer(chunk))
    if len(matches) == 1 and b"<r" not in chunk:
        # Fast path: one plain <t>, no rich-text runs.  Parsing and
        # re-serialising 250k tiny fragments with lxml is the 50MB bottleneck.
        match = matches[0]
        old = _unescape(match.group(1))
        new, hits = replace(old)
        if not hits:
            return chunk, 0
        content = _escape_text(new)
        if new != new.strip():
            tag_end = chunk.find(b">", match.start())
            tag = chunk[match.start() : tag_end + 1]
            if b"xml:space" not in tag:
                tag = tag[:-1] + b' xml:space="preserve">'
                return (
                    chunk[: match.start()] + tag + content + b"</t>" + chunk[match.end() :],
                    hits,
                )
        return chunk[: match.start(1)] + content + chunk[match.end(1) :], hits
    try:
        fragment = etree.fromstring(chunk, parser())
    except etree.XMLSyntaxError:
        return chunk, 0
    hits = _replace_runs(_t_nodes(fragment), replace)
    if not hits:
        return chunk, 0
    return etree.tostring(fragment, encoding="utf-8"), hits


def _escape_text(text: str) -> bytes:
    return html.escape(text, quote=False).encode("utf-8")


def _si_xml(text: str) -> bytes:
    space = b' xml:space="preserve"' if text != text.strip() else b""
    return b"<si><t" + space + b">" + _escape_text(text) + b"</t></si>"


def _sst_root(xml: bytes) -> tuple[int, int, int] | None:
    match = re.search(rb"<sst\b[^>]*>", xml)
    if not match:
        return None
    tag = match.group(0)
    unique = re.search(rb'uniqueCount="(\d+)"', tag)
    count = re.search(rb'\bcount="(\d+)"', tag)
    return (
        match.start(),
        int(unique.group(1)) if unique else 0,
        int(count.group(1)) if count else 0,
    )


def _sst_texts(xml: bytes) -> list[str]:
    return [_chunk_text(chunk) for _start, _end, chunk in _iter_si(xml)]


@dataclass
class XlsxResult:
    output: bytes
    tokens: list[str] = field(default_factory=list)
    items: list[dict[str, object]] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def hits(self) -> int:
        return sum(self.counts.values())


def _worksheet_parts(names: list[str]) -> list[str]:
    return sorted(
        name
        for name in names
        if name.startswith("xl/worksheets/") and name.endswith(".xml")
    )


def _text_node_parts(names: list[str]) -> list[str]:
    out: list[str] = []
    for name in names:
        if name.endswith("/"):
            continue
        if name in ("docProps/core.xml", "docProps/app.xml", "docProps/custom.xml") or re.fullmatch(r"xl/comments\d*\.xml", name) or name.startswith("xl/threadedComments/") and name.endswith(".xml") or name.startswith("xl/persons/") and name.endswith(".xml") or name.startswith("customXml/") and name.endswith(".xml") or name.startswith("xl/drawings/") and name.endswith(".xml") or name.startswith("xl/charts/") and name.endswith(".xml"):
            out.append(name)
    return out


def _cell_texts(data: bytes) -> Iterable[str]:
    for _start, _end, chunk in _iter_cells(data):
        open_tag, inner = _split_cell(chunk)
        if inner is None:
            continue
        kind = _attr(open_tag, b"t")
        if kind == "inlineStr":
            yield _chunk_text(inner)
        elif kind == "str":
            text = _v_text(inner)
            if text:
                yield text


def _local(node: etree._Element) -> str:
    return etree.QName(node).localname if isinstance(node.tag, str) else ""


def _part_text(data: bytes) -> str:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return ""
    pieces: list[str] = []
    for node in root.iter():
        if not isinstance(node.tag, str):
            continue
        local = _local(node)
        if local in (
            "t", "text", "person", "author", "creator", "lastModifiedBy",
            "title", "subject", "description", "keywords", "Company",
            "Manager", "lpwstr", "lpstr",
        ) and node.text:
            pieces.append(node.text)
    for node in root.iter():
        if not isinstance(node.tag, str):
            continue
        for attr in ("author", "displayName"):
            value = node.get(attr)
            if value:
                pieces.append(value)
    return "\n".join(piece for piece in pieces if piece)


def _all_text(data: bytes) -> str:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return ""
    return "\n".join(_all_element_text(root))


def _all_element_text(root: etree._Element) -> list[str]:
    return [
        node.text
        for node in root.iter()
        if isinstance(node.tag, str) and node.text
    ]


def extract_all_text_parts(raw: bytes) -> dict[str, str]:
    """Every owned text container, one string per part (leak-scan input)."""
    out: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        if "xl/sharedStrings.xml" in names:
            out["xl/sharedStrings.xml"] = "\n".join(
                _sst_texts(archive.read("xl/sharedStrings.xml"))
            )
        for part in _worksheet_parts(names):
            text = "\n".join(_cell_texts(archive.read(part)))
            if text:
                out[part] = text
        for part in _text_node_parts(names):
            data = archive.read(part)
            text = _all_text(data) if part.startswith("customXml/") else _part_text(data)
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


def _detection_text(raw: bytes) -> str:
    """Cell occurrences (SST resolved) + non-cell text, for token counts."""
    pieces: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        shared = (
            _sst_texts(archive.read("xl/sharedStrings.xml"))
            if "xl/sharedStrings.xml" in names
            else []
        )
        referenced: set[int] = set()
        for part in _worksheet_parts(names):
            data = archive.read(part)
            for _start, _end, chunk in _iter_cells(data):
                open_tag, inner = _split_cell(chunk)
                if inner is None:
                    continue
                kind = _attr(open_tag, b"t")
                if kind == "s":
                    text = _v_text(inner)
                    if text and text.strip().isdigit():
                        index = int(text.strip())
                        if index < len(shared):
                            pieces.append(shared[index])
                            referenced.add(index)
                elif kind == "inlineStr":
                    pieces.append(_chunk_text(inner))
                elif kind == "str":
                    cached = _v_text(inner)
                    if cached:
                        pieces.append(cached)
        for index, text in enumerate(shared):
            if index not in referenced and text:
                pieces.append(text)
        for part in _text_node_parts(names):
            data = archive.read(part)
            text = _all_text(data) if part.startswith("customXml/") else _part_text(data)
            if text:
                pieces.append(text)
    return "\x00".join(piece.replace("\n", "\x00") for piece in pieces)


def _warnings(raw: bytes) -> list[str]:
    warnings: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        if any(name.startswith(("xl/pivotCache/", "xl/pivotTables/")) for name in names):
            warnings.append("xlsx.pivot_cache")
        if any(name.startswith("xl/charts/") for name in names):
            warnings.append("xlsx.chart_cache")
        if any(name.startswith("xl/embeddings/") for name in names):
            warnings.append("xlsx.ole")
        if any(name.startswith("xl/diagrams/") for name in names):
            warnings.append("xlsx.smartart")
        if any(name.startswith("xl/externalLinks/") for name in names):
            warnings.append("xlsx.external_links")
        for part in _worksheet_parts(names):
            if b"<f" in archive.read(part):
                warnings.append("xlsx.formula_literal")
                break
    return warnings


def _sst_refs(
    archive: zipfile.ZipFile,
    parts: list[str],
    changed: Mapping[int, tuple[str, str, int]],
) -> dict[int, list[tuple[str, str]]]:
    refs: dict[int, list[tuple[str, str]]] = defaultdict(list)
    wanted = set(changed)
    for part in parts:
        data = archive.read(part)
        for start, _end, chunk in _iter_cells(data):
            open_tag, inner = _split_cell(chunk)
            if inner is None or _attr(open_tag, b"t") != "s":
                continue
            value = _v_text(inner)
            if value is None or not value.strip().isdigit():
                continue
            index = int(value.strip())
            if index not in wanted:
                continue
            ref = _attr(open_tag, b"r") or f"@{start}"
            refs[index].append((part, ref))
    return refs


def _replace_inner_v(inner: bytes, replace) -> tuple[bytes, int]:
    match = _V.search(inner)
    if not match:
        return inner, 0
    old = _unescape(match.group(1))
    new, hits = replace(old)
    if not hits:
        return inner, 0
    return inner[: match.start(1)] + _escape_text(new) + inner[match.end(1) :], hits


def _rewrite_cell(
    chunk: bytes,
    part: str,
    replace,
    reindex: Mapping[str, int],
    *,
    offset: int = 0,
) -> tuple[bytes | None, int]:
    open_tag, inner = _split_cell(chunk)
    if inner is None:
        return None, 0
    kind = _attr(open_tag, b"t")
    if kind == "s":
        ref = _attr(open_tag, b"r") or f"@{offset}"
        new_index = reindex.get(f"{part}:{ref}")
        if new_index is None:
            return None, 0
        match = _V.search(inner)
        if not match:
            return None, 0
        new_inner = inner[: match.start(1)] + str(new_index).encode() + inner[match.end(1) :]
        return open_tag + new_inner + b"</c>", 0
    if kind == "inlineStr":
        new_inner, hits = _rewrite_container(inner, replace)
        if not hits:
            return None, 0
        return open_tag + new_inner + b"</c>", hits
    if kind == "str":
        new_inner, hits = _replace_inner_v(inner, replace)
        if not hits:
            return None, 0
        return open_tag + new_inner + b"</c>", hits
    return None, 0


def _rewrite_sheet(
    data: bytes,
    part: str,
    replace,
    reindex: Mapping[str, int],
) -> tuple[bytes | None, int]:
    pieces: list[bytes] = []
    last = 0
    hits = 0
    for start, end, chunk in _iter_cells(data):
        new, count = _rewrite_cell(
            chunk, part, replace, reindex, offset=start
        )
        if new is None:
            continue
        pieces.append(data[last:start])
        pieces.append(new)
        last = end
        hits += count
    if not pieces:
        return None, 0
    pieces.append(data[last:])
    return b"".join(pieces), hits


def _rewrite_sst(
    xml: bytes,
    inplace: Mapping[int, str],
    appended: list[str],
    replace,
) -> tuple[bytes | None, int]:
    meta = _sst_root(xml)
    if meta is None:
        return None, 0
    _, unique, _count = meta
    pieces: list[bytes] = []
    last = 0
    hits = 0
    changed = 0
    for index, (start, end, chunk) in enumerate(_iter_si(xml)):
        if index not in inplace:
            continue
        new_chunk, count = _rewrite_container(chunk, replace)
        if not count:
            # A container whose text already equals the target (e.g. two calls)
            # still needs a stable index; keep it as-is.
            new_chunk, count = chunk, 1
        pieces.append(xml[last:start])
        pieces.append(new_chunk)
        last = end
        hits += count
        changed += 1
    if not changed and not appended:
        return None, 0
    if appended:
        pieces.append(xml[last:])
        body = b"".join(pieces)
        close = body.rfind(b"</sst>")
        if close < 0:
            # self-closing root: turn it into a normal one
            body = body.replace(b"/>", b">", 1)
            close = body.rfind(b"</sst>")
        body = body[:close] + b"".join(_si_xml(text) for text in appended) + body[close:]
        # uniqueCount is informational; keep it in sync when present
        body = re.sub(
            rb'uniqueCount="\d+"',
            f'uniqueCount="{unique + len(appended)}"'.encode(),
            body,
            count=1,
        )
        return body, hits
    pieces.append(xml[last:])
    return b"".join(pieces), hits


def _rewrite_part(
    data: bytes,
    replace,
    *,
    attributes: tuple[str, ...] = (),
    texts: bool = True,
) -> tuple[bytes | None, int]:
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return None, 0
    hits = 0
    if texts:
        for node in root.iter():
            if not isinstance(node.tag, str):
                continue
            local = _local(node)
            if local in (
                "t", "text", "author", "creator", "lastModifiedBy", "title",
                "subject", "description", "keywords", "Company", "Manager",
                "lpwstr", "lpstr",
            ) and node.text:
                new, count = replace(node.text)
                if count:
                    node.text = new
                    hits += count
    for attr in attributes:
        for node in root.iter():
            if not isinstance(node.tag, str):
                continue
            value = node.get(attr)
            if not value:
                continue
            new, count = replace(value)
            if count:
                node.set(attr, new)
                hits += count
    if not hits:
        return None, 0
    return (
        etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True),
        hits,
    )


def _rewrite_all_text(data: bytes, replace) -> tuple[bytes | None, int]:
    """customXml may use any element names; replace every text node."""
    try:
        root = etree.fromstring(data, parser())
    except etree.XMLSyntaxError:
        return None, 0
    hits = 0
    for node in root.iter():
        if not isinstance(node.tag, str) or not node.text:
            continue
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


def _transform(
    raw: bytes,
    replace,
    *,
    edit_cells: set[str] | None = None,
    collect_items: list[dict[str, object]] | None = None,
    tokens: list[str] | None = None,
) -> XlsxResult:
    result = XlsxResult(output=raw, tokens=tokens or [], items=collect_items or [])
    result.warnings = _warnings(raw)
    replacements: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        sheets = _worksheet_parts(names)
        sst_xml = archive.read("xl/sharedStrings.xml") if "xl/sharedStrings.xml" in names else None
        sst_texts = _sst_texts(sst_xml) if sst_xml else []

        # 1. Which shared strings change, and by how much.
        changed: dict[int, tuple[str, str, int]] = {}
        for index, text in enumerate(sst_texts):
            new, hits = replace(text)
            if hits:
                changed[index] = (text, new, hits)

        # 2. Every reference to those indices, so a partially hit shared
        #    string can be split instead of over-redacting its other cells.
        refs = _sst_refs(archive, sheets, changed) if changed else {}
        inplace: dict[int, str] = {}
        reindex: dict[str, int] = {}
        appended: list[str] = []
        new_index: dict[str, int] = {}
        sst_meta = _sst_root(sst_xml) if sst_xml else None
        unique = sst_meta[1] if sst_meta else 0

        for index, (text, new, hits) in changed.items():
            all_refs = refs.get(index, [])
            if not all_refs:
                inplace[index] = new  # orphan string: scrub it, nobody displays it
                continue
            hit_refs = [
                ref
                for ref in all_refs
                if edit_cells is None or f"{ref[0]}:{ref[1]}" in edit_cells
            ]
            if not hit_refs:
                continue
            if len(hit_refs) == len(all_refs):
                inplace[index] = new
                for part, _ref in hit_refs:
                    result.counts[part] = result.counts.get(part, 0) + hits
                continue
            if new not in new_index:
                new_index[new] = unique + len(appended)
                appended.append(new)
            target = new_index[new]
            for part, ref in hit_refs:
                reindex[f"{part}:{ref}"] = target
                result.counts[part] = result.counts.get(part, 0) + hits

        if sst_xml is not None and (inplace or appended):
            new_sst, _hits = _rewrite_sst(sst_xml, inplace, appended, replace)
            if new_sst is not None:
                replacements["xl/sharedStrings.xml"] = new_sst

        # 3. Worksheets: shared-index swaps, inline strings, formula caches.
        for part in sheets:
            new_part, hits = _rewrite_sheet(archive.read(part), part, replace, reindex)
            if new_part is not None:
                replacements[part] = new_part
                if hits:
                    result.counts[part] = result.counts.get(part, 0) + hits

        # 4. Comments, persons, threaded comments, customXml, properties,
        #    drawings/chart titles.
        for part in _text_node_parts(names):
            attrs = ("author", "displayName") if (
                re.fullmatch(r"xl/comments\d*\.xml", part)
                or part.startswith("xl/persons/")
            ) else ()
            if part.startswith("customXml/"):
                new_part, hits = _rewrite_all_text(archive.read(part), replace)
            else:
                new_part, hits = _rewrite_part(
                    archive.read(part), replace, attributes=attrs
                )
            if new_part is not None:
                replacements[part] = new_part
                if hits:
                    result.counts[part] = result.counts.get(part, 0) + hits

    result.output = repack(raw, replacements) if replacements else raw
    return result


def redact(
    raw: bytes,
    entities: list[core.Entity],
    *,
    edit_cells: set[str] | None = None,
    token_overrides: dict[str, str] | None = None,
) -> XlsxResult:
    """Detect across cells + text parts, assign stable tokens, write the package."""
    items = core.apply_token_overrides(
        core.assign_tokens(core.detect(_detection_text(raw), entities)), token_overrides
    )
    replace, token_to_real = core.build_fast_replacer(items)
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
    return _transform(
        raw,
        replace,
        edit_cells=edit_cells,
        collect_items=payload,
        tokens=sorted(token_to_real),
    )


def restore(raw: bytes, token_map: dict[str, str]) -> XlsxResult:
    replace = core.build_fast_restorer(token_map)
    return _transform(raw, replace, tokens=sorted(token_map))
