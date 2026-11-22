# `postprocess()` — the only document exit

`lethe.postprocess.postprocess(source, library_output, tokens, edited_parts=())`
rebuilds a package from the **source** bytes. It keeps a library part only when
the bytes changed and at least one of these holds:

1. the part is named in `edited_parts`;
2. the new bytes contain a token (redaction direction);
3. the source bytes contain a token (restore direction — the token disappears).

Rule 3 matters for `restore`: the source is the redacted package, the library
output has the real names back and no token at all. Checking only the new bytes
silently reverted every restored part to the redacted source.

Every other source entry is copied as a raw local ZIP record: local header,
compressed payload and data descriptor, with no recompression. Parts the
library added are dropped; parts it dropped come back from the source. The
result is validated with the P0 contract assertions C1 (source priority and
part set), C2 (decompressed sha256) and C3 (raw compressed stream). A violation
raises instead of returning a lossy document.

The guard still applies: nothing outside this module may call `save(` or
`toBytes()` in product code, and this module itself only uses `zipfile` reads
and raw struct writes.
