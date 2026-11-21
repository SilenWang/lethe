"""Fixture for the reviewed exemption pragma."""


def export(document) -> bytes:
    document.save("out.docx")  # bare-save-ok: reviewed test double, not shipped
    return b""
