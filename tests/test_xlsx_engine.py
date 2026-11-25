"""XLSX part-direct engine: shared-string split, forms, formulas, text parts."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from lethe import Entity, xlsx_engine

REPO = Path(__file__).resolve().parents[1]

SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"

JOHN = Entity("John Smith", "PERSON")
ALICE = Entity("Alice Chen", "PERSON")


def _zip(parts: dict[str, bytes | str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in parts.items():
            archive.writestr(name, value)
    return buffer.getvalue()


def _parts(raw: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def _content_types(shared: bool = False, extra: tuple[str, ...] = ()) -> str:
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    ]
    if shared:
        overrides.append(
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        )
    overrides.extend(extra)
    return (
        f'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="{CT}">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        + "".join(overrides)
        + "</Types>"
    )


def _workbook() -> str:
    return (
        f'<?xml version="1.0"?><workbook xmlns="{SS}" xmlns:r="{R}">'
        '<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )


def _workbook_rels(shared: bool = False, extra: tuple[tuple[str, str], ...] = ()) -> str:
    rels = [
        f'<Relationship Id="rId1" Type="{R}/worksheet" Target="worksheets/sheet1.xml"/>'
    ]
    if shared:
        rels.append(
            f'<Relationship Id="rId2" Type="{R}/sharedStrings" Target="sharedStrings.xml"/>'
        )
    for index, (rel_id, target) in enumerate(extra, start=3):
        rels.append(f'<Relationship Id="{rel_id or f"rId{index}"}" Type="{target[0]}" Target="{target[1]}"/>')
    return (
        f'<?xml version="1.0"?><Relationships xmlns="{PKG}">'
        + "".join(rels)
        + "</Relationships>"
    )


def _sheet(rows: str, extra: str = "") -> str:
    return (
        f'<?xml version="1.0"?><worksheet xmlns="{SS}" xmlns:r="{R}">'
        f"<sheetData>{rows}</sheetData>{extra}</worksheet>"
    )


def _core(creator: str = "Ops", modifier: str = "Reviewer") -> str:
    return (
        '<?xml version="1.0"?><cp:coreProperties '
        'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">'
        f"<dc:creator>{creator}</dc:creator>"
        f"<cp:lastModifiedBy>{modifier}</cp:lastModifiedBy>"
        "</cp:coreProperties>"
    )


def _base(
    sheet_xml: str,
    *,
    sst: str | None = None,
    core_xml: str | None = None,
    extra_parts: dict[str, bytes | str] | None = None,
    extra_overrides: tuple[str, ...] = (),
) -> bytes:
    parts: dict[str, bytes | str] = {
        "[Content_Types].xml": _content_types(sst is not None, extra_overrides),
        "_rels/.rels": (
            f'<?xml version="1.0"?><Relationships xmlns="{PKG}">'
            f'<Relationship Id="rId1" Type="{R}/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": _workbook(),
        "xl/_rels/workbook.xml.rels": _workbook_rels(sst is not None),
        "xl/worksheets/sheet1.xml": sheet_xml,
        "docProps/core.xml": core_xml if core_xml is not None else _core(),
    }
    if sst is not None:
        parts["xl/sharedStrings.xml"] = sst
    parts.update(extra_parts or {})
    return _zip(parts)


def _sst(*values: str) -> str:
    items = "".join(f"<si><t>{value}</t></si>" for value in values)
    return (
        f'<?xml version="1.0"?><sst xmlns="{SS}" count="{len(values)}" '
        f'uniqueCount="{len(values)}">{items}</sst>'
    )


def test_shared_string_split_keeps_non_hit_reference() -> None:
    raw = _base(
        _sheet(
            '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'
            '<row r="2"><c r="A2" t="s"><v>0</v></c></row>'
        ),
        sst=_sst("John Smith", "Other"),
    )
    result = xlsx_engine.redact(
        raw, [JOHN], edit_cells={"xl/worksheets/sheet1.xml:A1"}
    )
    parts = _parts(result.output)
    sst = parts["xl/sharedStrings.xml"].decode()
    sheet = parts["xl/worksheets/sheet1.xml"].decode()
    assert "John Smith" in sst  # the untouched A2 reference still works
    assert "[PERSON_001]" in sst
    assert 'r="A1" t="s"><v>2</v>' in sheet
    assert 'r="A2" t="s"><v>0</v>' in sheet
    assert result.hits == 1


def test_shared_string_all_refs_hit_rewrites_in_place() -> None:
    raw = _base(
        _sheet(
            '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'
            '<row r="2"><c r="A2" t="s"><v>0</v></c></row>'
        ),
        sst=_sst("John Smith"),
    )
    result = xlsx_engine.redact(raw, [JOHN])
    parts = _parts(result.output)
    sheet = parts["xl/worksheets/sheet1.xml"].decode()
    assert 'uniqueCount="1"' in parts["xl/sharedStrings.xml"].decode()
    assert "[PERSON_001]" in parts["xl/sharedStrings.xml"].decode()
    assert 'r="A1" t="s"><v>0</v>' in sheet
    assert 'r="A2" t="s"><v>0</v>' in sheet
    assert result.hits == 2


def test_inline_only_workbook() -> None:
    raw = _base(
        _sheet(
            '<row r="1"><c r="A1" t="inlineStr"><is><t>John Smith</t></is></c>'
            '<c r="B1" t="inlineStr"><is><t>Alice Chen</t></is></c></row>'
        )
    )
    assert "xl/sharedStrings.xml" not in _parts(raw)
    result = xlsx_engine.redact(raw, [JOHN, ALICE])
    assert result.hits == 2
    assert xlsx_engine.scan_leaks(result.output, ["John Smith", "Alice Chen"]) == []
    assert "[PERSON_001]" in xlsx_engine.extract_all_text_parts(result.output)[
        "xl/worksheets/sheet1.xml"
    ]


def test_mixed_shared_and_inline_forms() -> None:
    raw = _base(
        _sheet(
            '<row r="1"><c r="A1" t="s"><v>0</v></c>'
            '<c r="B1" t="inlineStr"><is><t>Alice Chen</t></is></c></row>'
        ),
        sst=_sst("John Smith"),
    )
    result = xlsx_engine.redact(raw, [JOHN, ALICE])
    assert result.hits == 2
    parts = _parts(result.output)
    assert "[PERSON_" in parts["xl/sharedStrings.xml"].decode()
    assert "[PERSON_" in parts["xl/worksheets/sheet1.xml"].decode()


def test_formula_cached_value_only_and_calc_chain_untouched() -> None:
    calc = (
        '<?xml version="1.0"?><calcChain xmlns="'
        + SS
        + '"><c r="C1" i="1"/></calcChain>'
    )
    raw = _base(
        _sheet(
            '<row r="1"><c r="C1" t="str"><f>CONCAT("John"," Smith")</f>'
            "<v>John Smith</v></c></row>"
        ),
        extra_parts={"xl/calcChain.xml": calc},
        extra_overrides=(
            '<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>',
        ),
    )
    result = xlsx_engine.redact(raw, [JOHN])
    parts = _parts(result.output)
    sheet = parts["xl/worksheets/sheet1.xml"].decode()
    assert '<f>CONCAT("John"," Smith")</f>' in sheet
    assert "<v>[PERSON_001]</v>" in sheet
    assert parts["xl/calcChain.xml"].decode() == calc
    assert "xlsx.formula_literal" in result.warnings


def test_comments_persons_threaded_customxml_and_docprops() -> None:
    comments = (
        f'<?xml version="1.0"?><comments xmlns="{SS}"><authors>'
        "<author>Alice Chen</author></authors><commentList>"
        '<comment ref="A1" authorId="0"><text><r><t>Ask John Smith</t></r></text>'
        "</comment></commentList></comments>"
    )
    persons = (
        '<?xml version="1.0"?><personList '
        'xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">'
        '<person displayName="Alice Chen" id="{1}" userId="alice" providerId="None"/>'
        "</personList>"
    )
    threaded = (
        '<?xml version="1.0"?><ThreadedComments '
        'xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">'
        '<threadedComment ref="A1" personId="{1}" id="{2}">'
        "<text>John Smith should review</text></threadedComment></ThreadedComments>"
    )
    custom = (
        '<?xml version="1.0"?><root><owner>John Smith</owner>'
        "<note>Alice Chen</note></root>"
    )
    raw = _base(
        _sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>'),
        core_xml=_core("John Smith", "Alice Chen"),
        extra_parts={
            "xl/comments1.xml": comments,
            "xl/persons/person1.xml": persons,
            "xl/threadedComments/threadedComment1.xml": threaded,
            "customXml/item1.xml": custom,
        },
    )
    result = xlsx_engine.redact(raw, [JOHN, ALICE])
    parts = _parts(result.output)
    for name in (
        "xl/comments1.xml",
        "xl/persons/person1.xml",
        "xl/threadedComments/threadedComment1.xml",
        "customXml/item1.xml",
        "docProps/core.xml",
    ):
        assert "[PERSON_" in parts[name].decode(), name
    assert xlsx_engine.scan_leaks(result.output, ["John Smith", "Alice Chen"]) == []


def test_docprops_core_is_redacted() -> None:
    raw = _base(
        _sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>'),
        core_xml=_core("John Smith", "Alice Chen"),
    )
    result = xlsx_engine.redact(raw, [JOHN, ALICE])
    core = _parts(result.output)["docProps/core.xml"].decode()
    assert "[PERSON_001]" in core and "[PERSON_002]" in core
    assert xlsx_engine.scan_leaks(result.output, ["John Smith", "Alice Chen"]) == []


def test_orphan_shared_string_is_scrubbed() -> None:
    raw = _base(
        _sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>kept</t></is></c></row>'),
        sst=_sst("John Smith"),
    )
    result = xlsx_engine.redact(raw, [JOHN])
    assert xlsx_engine.scan_leaks(result.output, ["John Smith"]) == []


def test_rich_text_run_is_preserved_when_match_is_inside_one_run() -> None:
    sst = (
        f'<?xml version="1.0"?><sst xmlns="{SS}" count="1" uniqueCount="1">'
        "<si><r><rPr><b/></rPr><t>John Smith</t></r><r><t> (VP)</t></r></si></sst>"
    )
    raw = _base(
        _sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'), sst=sst
    )
    result = xlsx_engine.redact(raw, [JOHN])
    out = _parts(result.output)["xl/sharedStrings.xml"].decode()
    assert "<b/>" in out
    assert out.count("<r>") == 2
    assert "[PERSON_001]" in out


def test_rich_text_match_split_across_runs_is_still_redacted() -> None:
    sst = (
        f'<?xml version="1.0"?><sst xmlns="{SS}" count="1" uniqueCount="1">'
        "<si><r><t>John</t></r><r><t> Smith</t></r></si></sst>"
    )
    raw = _base(
        _sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'), sst=sst
    )
    result = xlsx_engine.redact(raw, [JOHN])
    out = _parts(result.output)["xl/sharedStrings.xml"].decode()
    assert "[PERSON_001]" in out
    assert xlsx_engine.scan_leaks(result.output, ["John Smith"]) == []


def test_restore_roundtrip_is_char_for_char() -> None:
    raw = _base(
        _sheet(
            '<row r="1"><c r="A1" t="s"><v>0</v></c>'
            '<c r="B1" t="inlineStr"><is><t>Alice Chen</t></is></c></row>'
        ),
        sst=_sst("John Smith"),
    )
    red = xlsx_engine.redact(raw, [JOHN, ALICE])
    token_map = {
        str(item["token"]): str(item["canonical"])
        for item in red.items
        if item.get("token")
    }
    restored = xlsx_engine.restore(red.output, token_map)
    assert restored.hits > 0
    assert xlsx_engine.extract_all_text_parts(restored.output) == xlsx_engine.extract_all_text_parts(raw)


def test_part_set_and_unedited_entries_are_byte_identical() -> None:
    raw = _base(
        _sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>John Smith</t></is></c></row>')
    )
    result = xlsx_engine.redact(raw, [JOHN])
    before = zipfile.ZipFile(io.BytesIO(raw))
    after = zipfile.ZipFile(io.BytesIO(result.output))
    assert before.namelist() == after.namelist()
    for name in before.namelist():
        if name == "xl/worksheets/sheet1.xml":
            continue
        assert before.read(name) == after.read(name), name


def test_large_sheet_is_streamed_and_complete() -> None:
    rows = []
    for index in range(1, 2001):
        rows.append(
            f'<row r="{index}"><c r="A{index}" t="inlineStr">'
            f'<is><t>row {index} John Smith</t></is></c></row>'
        )
    raw = _base(_sheet("".join(rows)))
    result = xlsx_engine.redact(raw, [JOHN])
    assert result.hits == 2000
    assert xlsx_engine.scan_leaks(result.output, ["John Smith"]) == []


def test_500_hits_do_not_change_storage_form() -> None:
    """The gate case: 500 inline hits stay inline, only the sheet changes."""
    rows = "".join(
        f'<row r="{index}"><c r="A{index}" t="inlineStr">'
        f'<is><t>John Smith {index:03d}</t></is></c></row>'
        for index in range(1, 501)
    )
    raw = _base(_sheet(rows))
    result = xlsx_engine.redact(raw, [JOHN])
    assert result.hits == 500
    before = _parts(raw)
    after = _parts(result.output)
    assert before["xl/worksheets/sheet1.xml"].count(b't="inlineStr"') == after[
        "xl/worksheets/sheet1.xml"
    ].count(b't="inlineStr"')
    assert [name for name in before if before[name] != after[name]] == [
        "xl/worksheets/sheet1.xml"
    ]


def test_500_shared_string_hits_change_only_the_sst() -> None:
    rows = "".join(
        f'<row r="{index}"><c r="A{index}" t="s"><v>{index - 1}</v></c></row>'
        for index in range(1, 501)
    )
    raw = _base(_sheet(rows), sst=_sst(*(f"John Smith {i:03d}" for i in range(500))))
    result = xlsx_engine.redact(raw, [JOHN])
    assert result.hits == 500
    before = _parts(raw)
    after = _parts(result.output)
    assert [name for name in before if before[name] != after[name]] == [
        "xl/sharedStrings.xml"
    ]
    assert xlsx_engine.scan_leaks(result.output, ["John Smith"]) == []


@pytest.mark.parametrize("name", ["xlsx-001.xlsx", "xlsx-002.xlsx", "xlsx-003.xlsx"])
def test_corpus_forms_roundtrip_without_storage_form_change(name: str) -> None:
    """Pure SST, pure inline and mixed corpus files all round-trip."""
    raw = (REPO / "corpus" / "xlsx" / name).read_bytes()
    result = xlsx_engine.redact(raw, [JOHN, ALICE])
    assert result.hits > 0
    assert xlsx_engine.scan_leaks(result.output, ["John Smith", "Alice Chen"]) == []
    token_map = {
        str(item["token"]): str(item["canonical"])
        for item in result.items
        if item.get("token")
    }
    restored = xlsx_engine.restore(result.output, token_map)
    assert xlsx_engine.extract_all_text_parts(restored.output) == xlsx_engine.extract_all_text_parts(raw)

    before = {n: d for n, d in _parts(raw).items() if n.startswith("xl/worksheets/")}
    after = {n: d for n, d in _parts(result.output).items() if n.startswith("xl/worksheets/")}
    for part, data in before.items():
        assert data.count(b't="inlineStr"') == after[part].count(b't="inlineStr"')
