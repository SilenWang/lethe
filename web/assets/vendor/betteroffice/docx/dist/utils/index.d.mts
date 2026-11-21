export { PIXELS_PER_INCH, TWIPS_PER_INCH, clamp, eighthsToPixels, emuToPixels, emuToTwips, formatPx, halfPointsToPixels, halfPointsToPoints, pixelsToEmu, pixelsToTwips, pointsToHalfPoints, pointsToPixels, roundPixels, twipsToEmu, twipsToPixels } from './units.mjs';
import { F as FontLoadScope } from '../fontLoader-CBkmh4ps.mjs';
export { C as BufferFaceInput, D as FONT_MAPPING, E as FontDefinition, T as ThemeMatrixCell, b as blendColors, c as canRenderFont, a as colorsEqual, G as createFontLoadScope, d as createRgbColor, e as createThemeColor, f as darkenColor, g as ensureHexPrefix, H as extractFontsFromDocument, h as generateThemeTintShadeMatrix, i as getContrastingColor, I as getGoogleFontEquivalent, j as getLoadedFonts, k as getThemeTintShadeHex, l as isBlack, m as isFontLoaded, o as isGoogleFontsEnabled, n as isLoading, p as isWhite, q as lightenColor, J as loadDocumentFonts, r as loadFont, K as loadFontDefinitions, s as loadFontFromBuffer, L as loadFontFromUrl, M as loadFontWithMapping, t as loadFonts, N as loadFontsWithMapping, O as onFontError, u as onFontsLoaded, v as parseColorString, w as preloadCommonFonts, P as registerDocumentFaces, x as resolveColor, Q as resolveColorToHex, y as resolveHighlightColor, z as resolveHighlightToCss, A as resolveShadingColor, B as setGoogleFontsEnabled } from '../fontLoader-CBkmh4ps.mjs';
export { D as DocxInput, t as toArrayBuffer } from '../docxInput-DTbCa48g.mjs';
import { F as FontTable } from '../styles-DZZz2oRy.mjs';
import { Document } from '../types/document.mjs';
import { FontOption } from './fontOptions.mjs';
export { MIN_CARD_GAP, SIDEBAR_DOCUMENT_SHIFT, SIDEBAR_PAGE_GAP, SIDEBAR_WIDTH } from './sidebarConstants.mjs';
import { e as Comment } from '../content-DVT06V_6.mjs';
import '../formatting-p5MneNuy.mjs';
import '../docx/wrapTypes.mjs';

/**
 * Embedded font de-obfuscation (ECMA-376 Part 4 §2.8.1, "Font Embedding").
 *
 * Word stores embedded fonts as obfuscated OpenType (`.odttf`): the first 32
 * bytes of the font binary are XOR-scrambled with a 16-byte key, the rest of
 * the file is untouched. The key is the font's `w:fontKey` GUID with its byte
 * order REVERSED, applied once to bytes 0-15 and again to bytes 16-31.
 *
 * Example (from the spec): GUID `001B70DC-AA60-4AD5-90EC-18A0948E1EAE` yields
 * the key bytes `AE 1E 8E 94 A0 18 EC 90 D5 4A 60 AA DC 70 1B 00`.
 *
 * The scheme is a pure XOR, so the same operation obfuscates and de-obfuscates.
 */
/**
 * Whether a string is a usable embedded-font obfuscation key (a 128-bit GUID,
 * with or without braces/hyphens).
 *
 * @public
 */
declare function isValidFontKey(fontKey: string | undefined | null): boolean;
/**
 * De-obfuscate an embedded `.odttf` font into a usable OpenType/TrueType
 * binary by XOR-ing its first 32 bytes with the reversed `w:fontKey` GUID.
 *
 * Returns a new buffer; the input is not mutated. Throws if `fontKey` is not a
 * valid 128-bit GUID.
 *
 * @param data - Raw obfuscated font bytes from `word/fonts/*.odttf`.
 * @param fontKey - The `w:fontKey` GUID from the `w:embed*` element.
 * @public
 */
declare function deobfuscateFont(data: ArrayBuffer, fontKey: string): ArrayBuffer;

/**
 * Embedded font loading.
 *
 * Turns the obfuscated `word/fonts/*.odttf` binaries a DOCX carries into live
 * `@font-face` registrations so documents render in their authored fonts
 * instead of falling back to a metric-compatible substitute.
 *
 * The pure half ({@link getEmbeddedFontFaces}) resolves + de-obfuscates the
 * faces; {@link loadEmbeddedFonts} registers them with the browser (no-op
 * outside a DOM). Round-trip preservation is unaffected: the serializer copies
 * `word/fonts/*` and `fontTable.xml` from the original package untouched.
 */

/**
 * Names of the fonts a table embeds at least one face for. Used by the picker
 * to surface embedded fonts even when the canvas probe is unreliable for a
 * subsetted face.
 *
 * @public
 */
declare function getEmbeddedFontFamilies(fontTable: FontTable | undefined): Set<string>;
/** A single de-obfuscated embedded font face, ready for `loadFontFromBuffer`. */
interface EmbeddedFontFace {
    /** Word font name to register the face under. */
    family: string;
    /** CSS `font-weight` the face maps to (`embedBold*` → `'bold'`). */
    weight: 'normal' | 'bold';
    /** CSS `font-style` the face maps to (`embed*Italic` → `'italic'`). */
    style: 'normal' | 'italic';
    /** De-obfuscated OpenType/TrueType bytes. */
    data: ArrayBuffer;
    /** Whether the source face was subsetted (`w:subsetted`). */
    subsetted: boolean;
}
/**
 * Resolve and de-obfuscate every embedded font face declared in a font table.
 * Pure: does not touch the DOM. Faces whose relationship or binary is missing,
 * or whose key is unusable, are skipped.
 *
 * @param fontTable - Parsed `fontTable.xml` (`pkg.fontTable`).
 * @param rawFonts - Unzipped font binaries keyed by package path.
 * @param fontTableRelsXml - Raw `word/_rels/fontTable.xml.rels` XML.
 * @public
 */
declare function getEmbeddedFontFaces(fontTable: FontTable | undefined, rawFonts: ReadonlyMap<string, ArrayBuffer>, fontTableRelsXml: string | null | undefined): EmbeddedFontFace[];
/**
 * Resolve + de-obfuscate the embedded faces of an already-parsed Document by
 * re-reading its `originalBuffer` (parseDocx registers the faces with the
 * browser during load but does not retain the raw bytes on the model).
 * Returns `[]` when the document declares no embeds, carries no original
 * buffer, or the parts cannot be resolved. The zip pass goes through the
 * hardened `unzipDocx` container facade.
 *
 * Used by measurement, which needs the byte
 * form of every embedded face for the wasm FontStore.
 *
 * @public
 */
declare function extractEmbeddedFontFaces(document: Document): Promise<EmbeddedFontFace[]>;
/**
 * Register every embedded font face with the browser via `@font-face`. No-op
 * outside a DOM (headless/SSR). Resolves to the set of font family names that
 * were registered (deduped), so callers can surface them in the font picker.
 *
 * @public
 */
declare function loadEmbeddedFonts(fontTable: FontTable | undefined, rawFonts: ReadonlyMap<string, ArrayBuffer>, fontTableRelsXml: string | null | undefined): Promise<Set<string>>;
/**
 * {@link loadEmbeddedFonts}, resolving to the CSS family each embedded family
 * was registered under: its own name, or an alias when another live document
 * registered different faces under that name (see {@link registerDocumentFaces}).
 * With a scope, the faces are held until its next document or its disposal,
 * and a call that a later document load into the scope overtook resolves to
 * an empty map.
 *
 * @public
 */
declare function loadEmbeddedFontFamilies(fontTable: FontTable | undefined, rawFonts: ReadonlyMap<string, ArrayBuffer>, fontTableRelsXml: string | null | undefined, scope?: FontLoadScope): Promise<Map<string, string>>;

/**
 * Discover the fonts a document actually references and that the browser can
 * render, so they can be offered in the font picker under a "Document fonts"
 * group. A font qualifies when it is embedded in the file (already loaded via
 * {@link loadEmbeddedFonts}) or when the host system can render it
 * ({@link canRenderFont}). Fonts that would only fall back to a substitute are
 * left out, so the selector never lists a face it cannot actually show.
 */

interface RenderableFontOptions {
    /** Font families already loaded from the document (embedded faces). */
    embeddedFamilies?: ReadonlySet<string>;
    /** Names already present in the picker (built-in / configured) to skip. */
    exclude?: Iterable<string>;
    /** Override the system-font probe. Defaults to {@link canRenderFont}. */
    canRender?: (name: string) => boolean;
}
/**
 * Filter a list of referenced font names down to renderable {@link FontOption}s.
 * Pure and DOM-free when `canRender` is injected.
 *
 * @public
 */
declare function selectRenderableFonts(names: readonly string[], options?: RenderableFontOptions): FontOption[];
/**
 * Walk a parsed document for the fonts it references and return those the
 * browser can render (embedded or system-resolved) as picker options.
 *
 * @public
 */
declare function getRenderableDocumentFonts(doc: Document, options?: RenderableFontOptions): FontOption[];
/**
 * Drop fonts whose names already appear in `existingNames` (case-insensitive),
 * also deduping the input. Used by both adapters' pickers to render the
 * "Document fonts" group without repeating a font the built-in list covers.
 *
 * @public
 */
declare function excludeFontsByName(fonts: readonly FontOption[] | undefined, existingNames: Iterable<string>): FontOption[];

/**
 * Structural mark contract consumed by the legacy tree-to-layout adapter.
 * @public
 */
interface EditorTreeMark {
    readonly type: {
        readonly name: string;
    };
    readonly attrs: Record<string, any>;
}
/**
 * Structural node contract consumed by renderer-side tree walkers.
 *
 * The contract deliberately describes only the immutable tree operations the
 * renderer needs, so core does not depend on any editor implementation.
 * @public
 */
interface EditorTreeNode {
    readonly type: {
        readonly name: string;
        create(...args: any[]): EditorTreeNode;
    };
    readonly attrs: Record<string, any>;
    readonly marks: readonly EditorTreeMark[];
    readonly nodeSize: number;
    readonly content: {
        readonly size: number;
    };
    readonly isText: boolean;
    readonly isTextblock: boolean;
    readonly isInline: boolean;
    readonly text?: string | null;
    forEach(callback: (node: EditorTreeNode, offset: number, index: number) => void): void;
    descendants(callback: (node: EditorTreeNode, pos: number) => boolean | void): void;
}

/**
 * @packageDocumentation
 * @public
 */

/**
 * Information about a heading found in the document.
 */
interface HeadingInfo {
    /** The text content of the heading */
    text: string;
    /** Outline level (0 = Heading 1, 1 = Heading 2, etc.) */
    level: number;
    /** Document position of the paragraph node */
    pmPos: number;
}
/**
 * Collect all headings from a document.
 *
 * Detection logic:
 * 1. Check `outlineLevel` attr (set by OOXML parsing or style resolution)
 * 2. Fallback to `styleId` matching /^[Hh]eading(\d)$/
 *
 * @deprecated A legacy tree walker kept for compatibility. `YrsSession.headings(story)` classifies
 * headings with the engine's resolver, which also reads style inheritance and document defaults.
 */
declare function collectHeadings(doc: EditorTreeNode): HeadingInfo[];

/**
 * Option shapes for `scrollToParaId(paraId, { highlight })`.
 *
 * Kept in a DOM-free module (no imports, no browser globals) so non-browser
 * consumers can type-import them without pulling `paragraphFlash`'s DOM code
 * into their type-check surface.
 */
/**
 * Customization for the transient paragraph flash applied by
 * `scrollToParaId(paraId, { highlight })`.
 *
 * @public
 */
interface ParagraphHighlightOptions {
    /** CSS color used for the transient paragraph flash. Defaults to yellow. */
    color?: string;
    /** How long the flash remains visible before it is removed. Defaults to 1200ms. */
    durationMs?: number;
}
/**
 * Optional reveal behavior for `scrollToParaId`.
 *
 * @public
 */
interface ScrollToParaIdOptions {
    /** Flash rendered paragraph fragments after scrolling to the paragraph. */
    highlight?: ParagraphHighlightOptions;
}

/**
 * DOM helpers for transient paragraph flashes on the painted layout surface.
 */

/** Default color used by paragraph flashes. */
declare const DEFAULT_PARAGRAPH_FLASH_COLOR = "rgba(255, 235, 59, 0.55)";
/** Default duration for paragraph flashes. */
declare const DEFAULT_PARAGRAPH_FLASH_DURATION_MS = 1200;
/** CSS class applied to paragraph fragments during a transient flash. */
declare const PARAGRAPH_FLASH_CLASS_NAME = "docx-paragraph-flash";
/**
 * Find all painted paragraph fragments with a stable `data-para-id`.
 *
 * @public
 */
declare function findParagraphFragmentsByParaId(root: ParentNode, paraId: string): HTMLElement[];
/**
 * Apply a transient flash to a collection of paragraph elements.
 *
 * @returns the number of elements flashed
 * @public
 */
declare function flashParagraphElements(elements: Iterable<HTMLElement>, options?: ParagraphHighlightOptions): number;
/**
 * Find paragraph fragments by `paraId` and flash them.
 *
 * @returns whether at least one rendered fragment was found
 * @public
 */
declare function flashParagraphFragmentsByParaId(root: ParentNode, paraId: string, options?: ParagraphHighlightOptions): boolean;

/**
 * Shared table split algorithm — model-agnostic core logic.
 *
 * This module contains the pure layout computation for splitting a table cell:
 * column width redistribution, neighbor span adjustment, and new-cell placement.
 * The Document-model path (TableToolbar.tsx) delegates to these functions.
 */
/** A cell's position and span within the logical grid. */
interface CellAnchor<T> {
    /** Opaque payload — the caller's cell type (TableCell, etc.) */
    data: T;
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
}
/** Parameters describing the split target. */
interface SplitTarget {
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
}
/** Result of `computeSplitLayout`. */
interface SplitLayoutResult<T> {
    /** All anchors after the split (neighbors adjusted + new split cells). */
    anchors: CellAnchor<T>[];
    deltaRows: number;
    deltaCols: number;
    newRowCount: number;
}
declare function sumColumnWidths(widths: number[], start: number, span: number): number;
/**
 * Redistribute column widths when splitting a cell's column span.
 *
 * @param existing   Current column widths array for the whole table.
 * @param startCol   First column of the cell being split.
 * @param currentSpan Current column span of the cell.
 * @param targetSpan  Desired column span after split.
 * @returns New column widths array with the split applied.
 */
declare function redistributeColumnWidths(existing: number[], startCol: number, currentSpan: number, targetSpan: number): number[];
/**
 * Compute the new anchor layout after splitting a target cell.
 *
 * This is the core algorithm. It adjusts neighbor spans, shifts positions for
 * inserted rows/cols, and creates placeholder anchors for the new split cells.
 *
 * @param anchors     All cell anchors in the current table.
 * @param target      The anchor being split.
 * @param rows        Number of rows the target should become.
 * @param cols        Number of columns the target should become.
 * @param totalRows   Current total row count.
 * @param createSplitCellData  Factory to create `data` for each new split cell.
 *   Called with `(isOriginal, rowOffset, colOffset)` — `isOriginal` is true for
 *   the top-left cell that retains the original content.
 */
declare function computeSplitLayout<T>(anchors: CellAnchor<T>[], target: CellAnchor<T>, rows: number, cols: number, totalRows: number, createSplitCellData: (isOriginal: boolean, rowOffset: number, colOffset: number) => T): SplitLayoutResult<T>;
/**
 * Build lookup maps from an anchor list — by start position and by covered slot.
 */
declare function buildAnchorMaps<T>(anchors: CellAnchor<T>[]): {
    byStart: Map<string, CellAnchor<T>>;
    byCoveredSlot: Map<string, CellAnchor<T>>;
};
/**
 * Compute the initial dialog values for a split-cell dialog.
 */
declare function computeSplitDialogDefaults(rowspan: number, colspan: number): {
    minRows: number;
    minCols: number;
    initialRows: number;
    initialCols: number;
};

/**
 * Find word boundaries around a position in text
 * Returns [startIndex, endIndex] inclusive start, exclusive end
 */
declare function findWordBoundaries(text: string, position: number): [number, number];
/**
 * Get the word at a position in text
 */
declare function getWordAt(text: string, position: number): string;
/**
 * Word selection result
 */
interface WordSelectionResult {
    /** The selected word */
    word: string;
    /** Start index in the text (inclusive) */
    startIndex: number;
    /** End index in the text (exclusive) */
    endIndex: number;
}
/**
 * Find the word at a position and return detailed info
 */
declare function findWordAt(text: string, position: number): WordSelectionResult;
/**
 * Select a word at the current cursor position using the browser's native APIs.
 * This works reliably across different browsers and handles contentEditable well.
 */
declare function selectWordAtCursor(): boolean;
/**
 * Select a word in a specific text node at the given offset
 */
declare function selectWordInTextNode(textNode: Text, offset: number): boolean;
/**
 * Expand the current selection to word boundaries.
 * If there's a collapsed selection (cursor), selects the word at cursor.
 * If there's an existing selection, expands to include complete words.
 */
declare function expandSelectionToWordBoundaries(): boolean;
/**
 * Select the entire paragraph containing the current selection.
 * Looks for the nearest element with [data-paragraph-index] attribute.
 */
declare function selectParagraphAtCursor(): boolean;
/**
 * Handle click event for multi-click detection.
 * Call this in your click handler.
 * Returns the click count (1 = single, 2 = double, 3 = triple).
 */
declare function handleClickForMultiClick(event: MouseEvent): number;
/**
 * Create a double-click handler that selects words.
 * Returns a function that should be called on dblclick events.
 */
declare function createDoubleClickWordSelector(): (event: MouseEvent) => void;
/**
 * Create a triple-click handler that selects paragraphs.
 * This uses our custom click counting since browsers have inconsistent triple-click.
 */
declare function createTripleClickParagraphSelector(): (event: MouseEvent) => void;

/**
 * Shared file-input → docx-buffer reader.
 *
 * React (DocxEditor.tsx `handleDocxFileChange`) and Vue
 * (DocxEditor.vue `handleDocxFileChange`) had byte-equivalent
 * `await file.arrayBuffer()` + `name.replace(/\.docx$/i, '')` boilerplate
 * around their hidden file inputs. This helper folds the common steps
 * into one place so the two adapters can never drift on filename
 * normalization or on the "reset input.value so re-picking the same
 * file fires `change` again" detail.
 *
 * Returns `null` when the user cancelled the picker (no file chosen).
 */
interface ReadDocxFileResult {
    /** ArrayBuffer ready to feed into `loadBuffer` / `parseDocx`. */
    buffer: ArrayBuffer;
    /** File name with the trailing `.docx` extension stripped. */
    name: string;
}
/**
 * Read the first selected file out of an `<input type="file">` change
 * event, return its ArrayBuffer + a stem-form name. Always resets
 * `input.value` so re-selecting the same file in the same picker fires
 * the next `change` event.
 */
declare function readDocxFileFromInput(event: Event): Promise<ReadDocxFileResult | null>;

/**
 * Color-mode resolution shared by every adapter so the light/dark/auto logic
 * (and its SSR + prefers-color-scheme handling) can't drift between React, Vue,
 * or any future host. The adapters keep only their framework binding
 * (useState/useEffect vs ref/watchEffect); the rules live here.
 *
 * @packageDocumentation
 */
/** UI color theme for the editor chrome and canvas. */
type ColorMode = 'light' | 'dark' | 'system';
/**
 * Current OS dark-mode preference. Returns false when `matchMedia` is
 * unavailable (e.g. server-side render), so it is safe to call as a state seed.
 *
 * @public
 */
declare function prefersColorSchemeDark(): boolean;
/**
 * Resolve the effective dark flag from a {@link ColorMode} and the current OS
 * preference. `'system'` follows the OS; `'dark'`/`'light'` are explicit.
 *
 * @public
 */
declare function resolveIsDark(colorMode: ColorMode, systemDark: boolean): boolean;
/**
 * Subscribe to OS dark-mode changes. Invokes `onChange` immediately with the
 * current value (so a stale seed is corrected on entry), then on every change.
 * Returns an unsubscribe function. A no-op under SSR.
 *
 * @public
 */
declare function subscribeSystemDark(onChange: (dark: boolean) => void): () => void;

/** Numeric OOXML comment-id allocation, independent of any editor engine. */
declare const PENDING_COMMENT_ID = -1;
interface CommentIdAllocator {
    next(): number;
    seedAbove(maxId: number): void;
}
declare function createCommentIdAllocator(): CommentIdAllocator;

/** Build a comment thread entry with a freshly allocated numeric OOXML id. */
declare function createComment(allocator: CommentIdAllocator, text: string, authorName: string, parentId?: number): Comment;

/**
 * Allowlist URL schemes on hrefs that originate from untrusted input
 * (DOCX relationship targets, pasted HTML). Fragments and relative paths
 * pass through; anything with a scheme outside the allowlist is dropped.
 */
declare function sanitizeHref(href: string | null | undefined): string | undefined;

export { type CellAnchor, type ColorMode, type CommentIdAllocator, DEFAULT_PARAGRAPH_FLASH_COLOR, DEFAULT_PARAGRAPH_FLASH_DURATION_MS, type EmbeddedFontFace, FontLoadScope, type HeadingInfo, PARAGRAPH_FLASH_CLASS_NAME, PENDING_COMMENT_ID, type ParagraphHighlightOptions, type ReadDocxFileResult, type RenderableFontOptions, type ScrollToParaIdOptions, type SplitLayoutResult, type SplitTarget, type WordSelectionResult, buildAnchorMaps, collectHeadings, computeSplitDialogDefaults, computeSplitLayout, createComment, createCommentIdAllocator, createDoubleClickWordSelector, createTripleClickParagraphSelector, deobfuscateFont, excludeFontsByName, expandSelectionToWordBoundaries, extractEmbeddedFontFaces, findParagraphFragmentsByParaId, findWordAt, findWordBoundaries, flashParagraphElements, flashParagraphFragmentsByParaId, getEmbeddedFontFaces, getEmbeddedFontFamilies, getRenderableDocumentFonts, getWordAt, handleClickForMultiClick, isValidFontKey, loadEmbeddedFontFamilies, loadEmbeddedFonts, prefersColorSchemeDark, readDocxFileFromInput, redistributeColumnWidths, resolveIsDark, sanitizeHref, selectParagraphAtCursor, selectRenderableFonts, selectWordAtCursor, selectWordInTextNode, subscribeSystemDark, sumColumnWidths };
