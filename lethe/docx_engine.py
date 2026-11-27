"""DOCX text read/write for the browser pipeline.

Python owns the text logic; BetterOffice only repacks the XML parts it is
handed (``updateMultipleFiles``).  Every text container the P1 DoD names is
covered:

* body, headers, footers, footnotes, endnotes and comment bodies;
* tracked-change text (``w:delText``);
* revision/comment authors (``w:author``) and People-pane authors
  (``w15:author`` in ``word/people.xml``);
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
W15 = "http://schemas.microsoft.com/office/word/2012/wordml"
DC = "http://purl.org/dc/elements/1.1/"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
TEXT_TAGS = {f"{{{W}}}t", f"{{{W}}}delText", f"{{{W}}}instrText"}
AUTHOR = f"{{{W}}}author"
W15_AUTHOR = f"{{{W15}}}author"
PARAGRAPH = f"{{{W}}}p"
CORE_TAGS = {
    f"{{{DC}}}title",
    f"{{{DC}}}subject",
    f"{{{DC}}}description",
    f"{{{DC}}}creator",
    f"{{{CP}}}keywords",
    f"{{{CP}}}lastModifiedBy",
}
TEXT_PART = re.compile(
    # ``comments\d*`` matters: a document saved after a merge carries
    # ``word/comments1.xml`` and friends, and those comment bodies are just as
    # user-visible as the first part.
    r"^(word/(document|header\d*|footer\d*|footnotes|endnotes|comments\d*|people)\.xml"
    r"|docProps/core\.xml)$"
)
COMMENT_PART = re.compile(r"^word/comments\d*\.xml$")
BODY_PART = "word/document.xml"


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

    @property
    def body_hits(self) -> int:
        """Replacements in the main document body (not comments/metadata)."""
        return self.counts.get(BODY_PART, 0)

    @property
    def comment_hits(self) -> int:
        """Comment-body and comment-author replacements, every comment part."""
        return sum(
            count for name, count in self.counts.items() if COMMENT_PART.match(name)
        )

    @property
    def other_hits(self) -> int:
        """Headers, footers, notes and document metadata."""
        return self.hits - self.body_hits - self.comment_hits


def _text_parts(names: list[str]) -> list[str]:
    return [name for name in names if TEXT_PART.match(name)]


def _text_nodes(root: etree._Element) -> list[etree._Element]:
    return [node for node in root.iter() if node.tag in TEXT_TAGS and node.text]


def _paragraph_groups(root: etree._Element) -> list[list[etree._Element]]:
    """The text nodes of every innermost paragraph, in document order.

    Word happily splits one visible phrase across several ``w:r``/``w:t`` runs
    (spell-check, revision marks, a paste from another document).  Replacing one
    text node at a time therefore misses a name that is only spelled out across
    run boundaries — and the missed replacement is exactly what made the count
    disagree with the exported file.
    """
    groups: list[list[etree._Element]] = []
    for paragraph in root.iter(PARAGRAPH):
        # ``iter()`` descends through text boxes and would otherwise pull a
        # nested ``w:p`` into its outer paragraph.  A text node belongs to the
        # closest paragraph ancestor, so nested paragraphs stay independent and
        # their runs cannot be flattened into the surrounding body paragraph.
        nodes = [
            node
            for node in paragraph.iter()
            if node.tag in TEXT_TAGS
            and node.text
            and _nearest_paragraph(node) is paragraph
        ]
        # Only merge nodes of the same kind: ``w:instrText`` holds field code
        # (``HYPERLINK "…"``), never user prose, so it stays on its own.
        block: list[etree._Element] = []
        for node in nodes:
            if block and node.tag != block[-1].tag:
                groups.append(block)
                block = []
            block.append(node)
        if block:
            groups.append(block)
    return groups


def _replace_group(nodes: list[etree._Element], replace) -> int:
    """Replace inside one paragraph's runs, merging them when a name straddles.

    A single-run paragraph (the common case) keeps its inline formatting.  A
    multi-run paragraph first tries a per-run pass; if merging the runs finds
    more replacements, the paragraph is flattened so the token really lands in
    the file — the count and the exported bytes must agree.
    """
    texts = [node.text or "" for node in nodes]
    replaced = list(texts)
    per_node = 0
    for index, text in enumerate(texts):
        new_text, count = replace(text)
        if count:
            replaced[index] = new_text
            per_node += count
    if len(nodes) == 1:
        if per_node:
            nodes[0].text = replaced[0]
        return per_node

    merged, merged_count = replace("".join(texts))
    if merged_count > per_node:
        # A surface straddles run boundaries.  Flatten just this paragraph:
        # the token must land in the file, and losing the inline formatting of
        # one changed line is the trade-off the desktop writer already makes
        # for exactly the same reason.
        nodes[0].text = merged
        for node in nodes[1:]:
            node.text = ""
        return merged_count
    if per_node:
        for node, text in zip(nodes, replaced, strict=True):
            node.text = text
    return per_node


def _author_nodes(root: etree._Element) -> list[etree._Element]:
    return [node for node in root.iter() if node.get(AUTHOR) or node.get(W15_AUTHOR)]


def _author_values(node: etree._Element) -> list[tuple[str, str]]:
    return [
        (attribute, node.get(attribute, ""))
        for attribute in (AUTHOR, W15_AUTHOR)
        if node.get(attribute)
    ]


def _core_nodes(root: etree._Element) -> list[etree._Element]:
    return [node for node in root.iter() if node.tag in CORE_TAGS and node.text]


def _in_paragraph(node: etree._Element) -> bool:
    return any(ancestor.tag == PARAGRAPH for ancestor in node.iterancestors())


def _nearest_paragraph(node: etree._Element) -> etree._Element | None:
    return next(
        (ancestor for ancestor in node.iterancestors() if ancestor.tag == PARAGRAPH),
        None,
    )


def extract_all_text_parts(raw: bytes) -> dict[str, str]:
    """Every text container as one string per part (leak scanning input)."""
    out: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in _text_parts(archive.namelist()):
            root = etree.fromstring(archive.read(name), parser())
            # One piece per paragraph, not per run: detection has to see the
            # same merged text the writer replaces, otherwise a name split
            # across runs is invisible in the preview and in the counts.
            pieces = ["".join(node.text or "" for node in group)
                      for group in _paragraph_groups(root)]
            pieces += [node.text or "" for node in _text_nodes(root)
                       if not _in_paragraph(node)]
            pieces += [
                value for node in _author_nodes(root) for _, value in _author_values(node)
            ]
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
            for group in _paragraph_groups(root):
                hits += _replace_group(group, replace)
            for node in _text_nodes(root):
                if _in_paragraph(node):
                    continue  # already handled paragraph-by-paragraph
                new_text, count = replace(node.text or "")
                if count:
                    node.text = new_text
                    hits += count
            for node in _author_nodes(root):
                for attribute, current in _author_values(node):
                    new_text, count = replace(current)
                    if count:
                        node.set(attribute, new_text)
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


def redact(
    raw: bytes,
    entities: list[core.Entity],
    *,
    token_overrides: dict[str, str] | None = None,
) -> WriteResult:
    """Detect across every text part, then replace per node with stable tokens."""
    # NUL (not whitespace) separates parts so the phone pattern cannot span two
    # unrelated paragraphs and invent an account number.
    corpus = "\x00".join(
        text.replace("\n", "\x00") for text in extract_all_text_parts(raw).values()
    )
    items = core.apply_token_overrides(
        core.assign_tokens(core.detect(corpus, entities)), token_overrides
    )
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
