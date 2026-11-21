import { Document } from './types/document.mjs';
import { D as DocxInput } from './docxInput-DTbCa48g.mjs';

/**
 * Public DOCX parser facade.
 *
 * Rust owns ZIP/XML parsing. TypeScript only normalizes host inputs,
 * rehydrates the public `Document`, reports progress, and registers fonts.
 * @packageDocumentation
 * @public
 */

type ProgressCallback = (stage: string, percent: number) => void;
interface ParseOptions {
    onProgress?: ProgressCallback;
    preloadFonts?: boolean;
    parseHeadersFooters?: boolean;
    parseNotes?: boolean;
}
declare function parseDocx(input: DocxInput, options?: ParseOptions): Promise<Document>;

/** Rust-backed selective DOCX save compatibility wrapper. */

interface SelectiveSaveOptions {
    changedParaIds: Set<string>;
    structuralChange: boolean;
    hasUntrackedChanges: boolean;
}
/**
 * Patch changed paragraphs through the Rust package writer. Returns `null` when
 * selective save is unsafe so callers can fall back to a full repack.
 */
declare function attemptSelectiveSave(doc: Document, originalBuffer: ArrayBuffer, options: SelectiveSaveOptions): Promise<ArrayBuffer | null>;

export { attemptSelectiveSave as a, parseDocx as p };
