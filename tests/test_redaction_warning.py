"""The "this file looks already de-identified" detector: both error directions.

A false alarm on an untouched document is the expensive mistake — it trains the
user to dismiss a dialog that exists to prevent a second, confusing pass — so
the detector must stay quiet on ordinary bracketed prose.  A miss on a file
Lethe itself wrote is the other failure mode, and it is what the confirmation
dialog is for.

The tests below pin the shape the detector accepts: a placeholder whose prefix
is a type Lethe writes, numbered from ``001`` (Lethe always starts a type at
one) or appearing as a systematic stream of at least three distinct tokens.
"""

from __future__ import annotations

import pytest

from lethe import web_entry
from lethe.web_entry import detect_redaction_patterns


# ------------------------------------------------------------- true positives
@pytest.mark.parametrize(
    "parts",
    [
        {"word/document.xml": "Dear [PERSON_001], please confirm."},
        {"word/document.xml": "[PERSON_001]", "word/comments1.xml": "[PERSON_002]"},
        {"word/document.xml": "[COUNTERPARTY_001] and [EMAIL_001]"},
        {"word/document.xml": "Account [ACCOUNT_001] for [PHONE_001]"},
        {"word/document.xml": "Custom entity [OTHER_001]"},
        # A systematic stream that does not include 001 still looks written,
        # not typed: three distinct same-shaped placeholders.
        {"word/document.xml": "[PERSON_101] [PERSON_102] [PERSON_103]"},
        {"word/document.xml": "[PERSON_101]", "word/comments.xml": "[PERSON_102] [PERSON_103]"},
    ],
)
def test_lethe_placeholders_are_detected(parts: dict[str, str]) -> None:
    assert detect_redaction_patterns(parts) is not None


def test_detection_reports_counts_and_examples() -> None:
    warning = detect_redaction_patterns(
        {
            "word/document.xml": "[PERSON_001] met [PERSON_001] and [COUNTERPARTY_001]",
            "word/comments1.xml": "[PERSON_001] again",
        }
    )
    assert warning == {
        "token_count": 4,
        "distinct_count": 2,
        "examples": ["[PERSON_001]", "[COUNTERPARTY_001]"],
    }


def test_custom_token_type_is_detected_only_when_declared() -> None:
    parts = {"word/document.xml": "[PROJECT_001] kickoff"}
    assert detect_redaction_patterns(parts, ["PROJECT"]) is not None
    # Without the dictionary entry the prefix is not something Lethe writes.
    assert detect_redaction_patterns(parts) is None
    assert detect_redaction_patterns(parts, []) is None


# -------------------------------------------------- true negatives (no alarm)
@pytest.mark.parametrize(
    "text",
    [
        "Certified to [ISO_9001] and [ISO_27001].",
        "The gateway returned [HTTP_404] and then [HTTP_500].",
        "[CLIENT] shall deliver [DELIVERABLE] by the closing date.",
        "See exhibit [REF_2024] and appendix [APPENDIX_1].",
        "Filing reference [SG_2024_00012] is on the cover page.",
        "No brackets at all, just John Smith and Project Phoenix.",
        "An empty package.",
    ],
)
def test_ordinary_bracketed_prose_never_warns(text: str) -> None:
    assert detect_redaction_patterns({"word/document.xml": text}) is None


@pytest.mark.parametrize(
    "text",
    [
        "[person_001]",  # lowercase: Lethe never writes it
        "[PERSON_01]",  # two digits: Lethe always pads to three
        "[PERSON_1]",  # bare index
        "[PERSON-001]",  # wrong separator
        "(PERSON_001)",  # wrong brackets
        "[PERSON_001",  # unterminated
    ],
)
def test_almost_placeholders_stay_silent(text: str) -> None:
    assert detect_redaction_patterns({"word/document.xml": text}) is None


def test_two_tokens_without_the_first_index_stay_silent() -> None:
    """Two lookalikes are a plausible coincidence; the dialog is not free."""
    assert detect_redaction_patterns({"word/document.xml": "[PERSON_101] [PERSON_102]"}) is None


def test_empty_package_is_silent() -> None:
    assert detect_redaction_patterns({}) is None
    assert detect_redaction_patterns({"word/document.xml": ""}) is None


# --------------------------------------------------------------- via inspect
def test_inspect_returns_the_warning_for_a_tokenised_docx(tmp_path) -> None:
    """The worker's inspect op is where the UI gets the warning from."""
    import json
    import zipfile

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Dear [PERSON_001],</w:t></w:r></w:p></w:body></w:document>"
    )
    path = tmp_path / "tokenised.docx"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", document)

    response = json.loads(web_entry.dispatch(json.dumps({"op": "inspect", "path": str(path)})))
    assert response["ok"] is True
    assert response["redaction_warning"]["token_count"] == 1
    assert response["redaction_warning"]["examples"] == ["[PERSON_001]"]


def test_inspect_omits_the_warning_for_a_clean_docx(tmp_path) -> None:
    import json
    import zipfile

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Certified to [ISO_9001].</w:t></w:r></w:p></w:body></w:document>"
    )
    path = tmp_path / "clean.docx"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", document)

    response = json.loads(web_entry.dispatch(json.dumps({"op": "inspect", "path": str(path)})))
    assert response["ok"] is True
    assert response["redaction_warning"] is None


def test_inspect_accepts_declared_custom_types(tmp_path) -> None:
    import json
    import zipfile

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>[PROJECT_001] kickoff</w:t></w:r></w:p></w:body></w:document>"
    )
    path = tmp_path / "custom.docx"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", document)

    body = {"op": "inspect", "path": str(path), "token_types": ["PROJECT"]}
    response = json.loads(web_entry.dispatch(json.dumps(body)))
    assert response["redaction_warning"]["examples"] == ["[PROJECT_001]"]
