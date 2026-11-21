import { W as WasmAsyncInput } from './loadWasmAsset-Cr95TImt.mjs';

/**
 * Loader for the docx-parse wasm (the Rust DOCX parser/serializer wire).
 * External-asset pattern — see ./loadWasmAsset.ts for the init contract and
 * URL-geometry invariant.
 */

/** Load + instantiate the parser wasm (browser path). Idempotent. */
declare function preloadParseWasm(input?: WasmAsyncInput): Promise<void>;
declare const PARAGRAPH_PATCH_WRITER_VERSION = 1;
declare function paragraphPatchWriterVersionWire(): number | null | undefined;
declare function parseDocxS9Wire(data: Uint8Array, optionsJson: string): string;
declare function parseRelationshipsXmlWire(data: Uint8Array, partPath: string): string;
declare function serializeDocxS10Wire(requestJson: string): string;
declare function serializeDocxS11Wire(requestJson: string): string;
declare function serializeDocxS12Wire(requestJson: string): string;
declare function writeDocxS13Wire(requestJson: string, originalDocx: Uint8Array): Uint8Array;
declare function writeDocxS13WithWarningsWire(requestJson: string, originalDocx: Uint8Array): {
    bytes: Uint8Array;
    warnings: string[];
};
declare function decodeTiffImage(bytes: Uint8Array): Uint8Array;

export { PARAGRAPH_PATCH_WRITER_VERSION, decodeTiffImage, paragraphPatchWriterVersionWire, parseDocxS9Wire, parseRelationshipsXmlWire, preloadParseWasm, serializeDocxS10Wire, serializeDocxS11Wire, serializeDocxS12Wire, writeDocxS13Wire, writeDocxS13WithWarningsWire };
