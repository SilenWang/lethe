"""Deliberately bad fixture: direct archive serialisation.

The P0 guard must report this file, line 5, API ``save(`` and the ``guard`` job.
"""


def export(document) -> bytes:
    document.save("out.docx")
    return b""
