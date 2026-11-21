import { Document } from './types/document.mjs';

/**
 * Public DOCX package I/O wrappers.
 *
 * Model serialization and selective package writing are Rust-owned. The
 * TypeScript kept here is compatibility glue for public ZIP utilities and host
 * values; package inflation/deflation continues through `docx-container` wasm.
 * @packageDocumentation
 * @public
 */

interface RepackOptions {
    /** Retained for signature compatibility; `docx-container` chooses compression. */
    compressionLevel?: number;
    updateModifiedDate?: boolean;
    modifiedBy?: string;
}
/** Repack a public Document through the Rust package writer. */
declare function repackDocx(doc: Document, options?: RepackOptions): Promise<ArrayBuffer>;
interface RepackResult {
    buffer: ArrayBuffer;
    warnings: string[];
}
/** [`repackDocx`], also returning the non-fatal save diagnostics. */
declare function repackDocxWithWarnings(doc: Document, options?: RepackOptions): Promise<RepackResult>;
declare function updateMultipleFiles(originalBuffer: ArrayBuffer, updates: Map<string, string | ArrayBuffer>, options?: RepackOptions): Promise<ArrayBuffer>;
declare function createDocx(doc: Document): Promise<ArrayBuffer>;

export { type RepackResult as R, repackDocxWithWarnings as a, type RepackOptions as b, createDocx as c, repackDocx as r, updateMultipleFiles as u };
