import { W as WasmAsyncInput } from './loadWasmAsset-Cr95TImt.mjs';

/**
 * Loader for the ooxml-opc wasm (the OPC zip container: unzip/rezip with
 * zip-bomb and path-traversal guards). External-asset pattern — see
 * ./loadWasmAsset.ts for the init contract and URL-geometry invariant.
 */

/** Load + instantiate the container wasm (browser path). Idempotent. */
declare function preloadOpcWasm(input?: WasmAsyncInput): Promise<void>;
/** Inflate a DOCX container into `{ [path]: Uint8Array }`. */
declare function unzipContainer(data: Uint8Array): Record<string, Uint8Array>;
/** Deflate `{ [path]: Uint8Array }` into DOCX bytes. */
declare function rezipContainer(entries: Record<string, Uint8Array>): Uint8Array;

export { preloadOpcWasm, rezipContainer, unzipContainer };
