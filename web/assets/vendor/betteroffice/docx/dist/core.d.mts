export { a as attemptSelectiveSave, p as parseDocx } from './selectiveSave-r-NMK6aI.mjs';
import { Document } from './types/document.mjs';
export { DocxPackage } from './types/document.mjs';
import { g as DocumentBody, f as SectionProperties, b5 as Table } from './content-DVT06V_6.mjs';
export { B as BlockContent, m as BookmarkEnd, n as BookmarkStart, e as Comment, J as CommentRangeEnd, K as CommentRangeStart, T as Deletion, j as Endnote, Y as Field, a1 as FooterReference, i as Footnote, H as HeaderFooter, a4 as HeaderReference, a6 as Hyperlink, a8 as Image, ak as Insertion, ao as ListLevel, ar as MoveFrom, au as MoveTo, h as NumberingDefinitions, P as Paragraph, aH as ParagraphContent, aL as Run, aM as RunContent, aW as Shape, b6 as TableCell, b9 as TableRow, bc as TextBox, bd as TextContent, bf as TrackedChangeInfo, bg as TrackedRunChange } from './content-DVT06V_6.mjs';
export { R as RepackResult, c as createDocx, r as repackDocx, a as repackDocxWithWarnings, u as updateMultipleFiles } from './rezip-CfwAYdV4.mjs';
import { D as DocxExportFailure, a as DocxExportOptions, b as DocxMarkdownContent, c as DocxStructuredContent, d as DocxPageExportOptions, e as DocxHeadlessLayoutOptions, f as DocxPagedStructuredContent, g as DocxSnapshotLayoutMap, h as DocxMarkdownOptions, i as DocxLayoutMap, j as DocxPageMarkdownOptions, k as DocxContentControlReadFailure, l as DocxContentControlQuery, m as DocxContentControlsOptions, n as DocxContentControlsSnapshot } from './pagedExport-Bi89gMk0.mjs';
export { o as DocxAnchor, p as DocxAnchorScope, q as DocxCachedResult, r as DocxCommentMetadata, s as DocxContentControl, t as DocxContentControlDiagnostic, u as DocxContentControlSelector, v as DocxContentControlValue, w as DocxContentControlsResult, x as DocxControlMetadata, y as DocxExportBlock, z as DocxExportCell, A as DocxExportDiagnostic, B as DocxExportDiagnosticCode, C as DocxExportFailureCode, E as DocxExportInline, F as DocxExportPage, G as DocxExportRefusal, H as DocxExportResult, I as DocxExportStory, J as DocxExportTable, K as DocxFormattingMark, L as DocxFragmentGeometry, M as DocxHeadingInfo, N as DocxHeadlessFont, O as DocxInlineRevision, P as DocxLayoutProvenance, Q as DocxListInfo, R as DocxPageDiagnostic, S as DocxPageFragment, T as DocxPageMapContent, U as DocxParagraphData, V as DocxParagraphHeading, W as DocxParagraphList, X as DocxParagraphText, Y as DocxRevisionView, Z as DocxSnapshotLayoutProvenance, _ as DocxStoryKind, $ as DocxStoryOccurrence, a0 as DocxStorySelection, a1 as DocxUnlocatedReason } from './pagedExport-Bi89gMk0.mjs';
export { emuToPixels, emuToTwips, formatPx, halfPointsToPixels, pixelsToEmu, pixelsToTwips, pointsToPixels, twipsToEmu, twipsToPixels } from './utils/units.mjs';
export { T as ThemeMatrixCell, b as blendColors, c as canRenderFont, a as colorsEqual, d as createRgbColor, e as createThemeColor, f as darkenColor, g as ensureHexPrefix, h as generateThemeTintShadeMatrix, i as getContrastingColor, j as getLoadedFonts, k as getThemeTintShadeHex, l as isBlack, m as isFontLoaded, n as isFontsLoading, o as isGoogleFontsEnabled, p as isWhite, q as lightenColor, r as loadFont, s as loadFontFromBuffer, t as loadFonts, u as onFontsLoaded, v as parseColorString, w as preloadCommonFonts, x as resolveColor, y as resolveHighlightColor, z as resolveHighlightToCss, A as resolveShadingColor, B as setGoogleFontsEnabled } from './fontLoader-CBkmh4ps.mjs';
export { D as DocxInput, t as toArrayBuffer } from './docxInput-DTbCa48g.mjs';
export { EditorPluginCore, PanelConfig, PluginPanelProps, PointPosition, PositionCoordinates, RenderedDomContext } from './plugin-api/index.mjs';
export { B as BlockExtent, F as FootnoteContent, L as Layout, b as LayoutBlock, P as Page, R as ResolvedLine, c as ResolvedSegment } from './types-bvPg3KsF.mjs';
export { P as ParagraphFormatting, T as TextFormatting, f as Theme, z as ThemeColorScheme, D as ThemeFont, G as ThemeFontScheme } from './formatting-p5MneNuy.mjs';
export { d as Relationship, a as Style, S as StyleDefinitions } from './styles-DZZz2oRy.mjs';
import './docx/wrapTypes.mjs';

/**
 * DOCX XML serializers.
 *
 * The public synchronous serializer surface is retained for compatibility, but
 * all OOXML emission is owned by the Rust writer. The fixed context only
 * supplies deterministic IDs to standalone XML calls; package saves use the
 * source-package hash and clock through {@link ../rustSaveFacade}.
 * @packageDocumentation
 * @public
 */

/** Serialize a complete `word/document.xml` part. */
declare function serializeDocument(doc: Document): string;
/** Serialize the contents of `w:body`, without the body tags. */
declare function serializeDocumentBody(body: DocumentBody): string;
/** Serialize section properties. */
declare function serializeSectionProperties(props: SectionProperties | undefined): string;

/**
 * Headless structured export: DOCX bytes in, read-only structured content or Markdown out. The
 * Rust engine does the reading and anchors address the returned snapshot only. Plain exports
 * involve no session, editor, DOM or font; a paged export lays the bytes out in a private session
 * with exactly the fonts it is given, in a font store no other session shares.
 */

/** An export the engine refused as data: unusable options. */
declare class DocxExportError extends Error {
    readonly failure: DocxExportFailure;
    constructor(failure: DocxExportFailure);
}
/**
 * Exports DOCX bytes as structured content. Throws {@link DocxExportError} for unusable options
 * and an `Error` for bytes that are not a readable DOCX.
 */
declare function exportDocxStructured(bytes: Uint8Array, options: DocxExportOptions): Promise<DocxStructuredContent>;
/** {@link exportDocxStructured} rendered as Markdown with source anchors. */
declare function exportDocxMarkdown(bytes: Uint8Array, options: DocxExportOptions): Promise<DocxMarkdownContent>;
/** Renders structured content (schema version 1) as Markdown. */
declare function renderDocxMarkdown(content: DocxStructuredContent, options?: DocxMarkdownOptions): Promise<DocxMarkdownContent>;
/**
 * Exports DOCX bytes as structured content with a page map. A private session opens the bytes
 * and lays every section, header, footer and note out with exactly `layout.fonts`, registered in
 * a measurement font store of its own so no editor's fonts change, and exports from that one
 * captured state. Anchors address the returned snapshot and the map is deterministic for the
 * same bytes, fonts and options. Throws {@link DocxExportError} for a refusal, a `TypeError` for
 * an unknown, repeated or undecodable font key and an `Error` for bytes that are not a readable
 * DOCX or fonts the engine rejects.
 */
declare function exportDocxStructuredWithPages(bytes: Uint8Array, options: DocxPageExportOptions, layout: DocxHeadlessLayoutOptions): Promise<DocxPagedStructuredContent<DocxSnapshotLayoutMap>>;
/**
 * Renders a paged export as Markdown. With `pageMarkers`, each block marker is followed by
 * `<!-- docx-pages: N=label ... -->`: the physical page indexes and percent-encoded displayed
 * labels of every page showing the block. No page break is written into the text. Throws
 * {@link DocxExportError} when the page map was not captured with the content.
 */
declare function renderDocxMarkdownWithPages(content: DocxPagedStructuredContent<DocxLayoutMap | DocxSnapshotLayoutMap>, options?: DocxPageMarkdownOptions): Promise<DocxMarkdownContent>;

/**
 * Compares the text of body paragraphs of unchanged structure in two DOCX packages into tracked
 * changes; any other difference returns diagnostics, never a partial redline.
 */
/** Bounds a comparison enforces. The defaults are the largest values allowed; callers may tighten them. */
interface DocxCompareLimits {
    /** Bytes of each input package. Default 32 MiB. */
    maxInputBytes: number;
    /** Inflated bytes of each input package. Default 128 MiB. */
    maxExpandedBytes: number;
    /** Paragraphs of each input, every story counted. Default 10,000. */
    maxParagraphs: number;
    /** UTF-16 units of text in every story of both inputs combined. Default 1,048,576. */
    maxTextUnits: number;
    /** Paragraph-alignment table cells, cumulative. Default 250,000. */
    maxAlignmentCells: number;
    /** Text-diff table cells, cumulative, similarity checks included. Default 4,000,000. */
    maxDiffCells: number;
    /** Changes, which is also the number of batch steps. Default 128. */
    maxChanges: number;
    /** Diagnostics; one more ends inspection with `diagnostics-truncated`. Default 256. */
    maxDiagnostics: number;
    /** Bytes of the encoded editing state staged for the batch. Default 64 MiB. */
    maxStagedBytes: number;
    /** Bytes of the result as JSON, without the output package; at least 1,024. Default 8 MiB. */
    maxResultBytes: number;
    /** Bytes of the output package, the unchanged original included. Default 64 MiB. */
    maxOutputBytes: number;
}
interface DocxCompareOptions {
    /** The author of every revision. Must not be blank or contain control characters. */
    author: string;
    /** RFC 3339 timestamp with an explicit offset, recorded in UTC. The clock is never read. */
    date: string;
    /** Unicode words, keeping punctuation and whitespace tokens (default), or grapheme clusters. */
    granularity?: 'word' | 'char';
    /**
     * `fail` (default) stops at the first blocking condition; `report` keeps inspecting and
     * returns every diagnostic. Neither returns a document while a blocking condition exists.
     */
    unsupported?: 'fail' | 'report';
    limits?: Partial<DocxCompareLimits>;
}
/**
 * Half-open UTF-16 range in the projected text of one input's body paragraph (tabs are `\t`,
 * other inline atoms one U+FFFC). `path` is the paragraph's element-child path from the root of
 * `part`, whose SHA-256 is `partSha256`. Spans address the inputs, not the output.
 */
interface DocxCompareTextSpan {
    part: string;
    partSha256: string;
    path: number[];
    start: number;
    end: number;
    text: string;
}
/**
 * One tracked replacement, ordered by original then revised position. An insertion has an empty
 * `original` span and a deletion an empty `revised` span. `id` (`change-0`, …) is local to this
 * result: neither an OOXML revision id nor a durable anchor.
 */
interface DocxComparedChange {
    id: string;
    kind: 'insertion' | 'deletion' | 'replacement';
    original: DocxCompareTextSpan;
    revised: DocxCompareTextSpan;
}
interface DocxCompareLocation {
    input: 'original' | 'revised' | 'output';
    part: string | null;
    path: number[] | null;
    start: number | null;
    end: number | null;
}
type DocxCompareDiagnosticCode = 'invalid-options' | 'invalid-docx' | 'existing-revisions' | 'paragraph-insertion' | 'paragraph-deletion' | 'paragraph-move' | 'ambiguous-alignment' | 'table-change' | 'structure-change' | 'field-change' | 'object-change' | 'content-control-change' | 'formatting-change' | 'unsupported-content' | 'unsupported-formatting' | 'out-of-scope-change' | 'opaque-part-change' | 'provenance-unavailable' | 'ambiguous-identity' | 'metadata-difference' | 'limit-exceeded' | 'diagnostics-truncated' | 'batch-refused' | 'serialization-failed' | 'roundtrip-mismatch';
/** `error` diagnostics block the comparison; `info` and `warning` ones accompany a result. */
interface DocxCompareDiagnostic {
    code: DocxCompareDiagnosticCode;
    severity: 'info' | 'warning' | 'error';
    message: string;
    locations: DocxCompareLocation[];
}
/**
 * A redline, or a refusal as data; with no differences `docx` is the original bytes. Malformed
 * options and internal failures throw.
 */
type DocxCompareResult = {
    ok: true;
    docx: Uint8Array;
    changes: DocxComparedChange[];
    diagnostics: DocxCompareDiagnostic[];
} | {
    ok: false;
    diagnostics: DocxCompareDiagnostic[];
};
/**
 * Compares two DOCX packages and returns the original with the revised body text differences
 * as tracked changes by `options.author` at `options.date`.
 */
declare function compareDocx(original: Uint8Array, revised: Uint8Array, options: DocxCompareOptions): Promise<DocxCompareResult>;

/**
 * Headless content-control discovery: DOCX bytes in, the document's content controls out. The Rust
 * engine does the reading; no session, editor or DOM is involved, and control ids and anchors
 * address the returned snapshot only.
 */

/** A read the engine refused as data: unusable options or a limit. */
declare class DocxContentControlsError extends Error {
    readonly failure: DocxContentControlReadFailure;
    constructor(failure: DocxContentControlReadFailure);
}
/**
 * Lists the content controls of DOCX bytes in document order. Throws
 * {@link DocxContentControlsError} for unusable options or an exceeded limit and an `Error` for
 * bytes that are not a readable DOCX.
 */
declare function listDocxContentControls(bytes: Uint8Array, options?: DocxContentControlsOptions): Promise<DocxContentControlsSnapshot>;
/** The content controls of DOCX bytes that match `query` exactly; none or several. */
declare function findDocxContentControls(bytes: Uint8Array, query: DocxContentControlQuery, options?: DocxContentControlsOptions): Promise<DocxContentControlsSnapshot>;

/**
 * Framework-agnostic print helpers shared by the React and Vue
 * adapters. Lifted from packages/docx-react/src/components/ui/PrintPreview.tsx
 * so both adapters use the same parsing / preview-window code path.
 *
 * The thin button component + the print-time CSS injection stay
 * adapter-local (they're framework-specific JSX/SFC bits); the data
 * helpers below are pure functions.
 */
interface PrintOptions {
    includeHeaders?: boolean;
    includeFooters?: boolean;
    includePageNumbers?: boolean;
    pageRange?: {
        start: number;
        end: number;
    } | null;
    scale?: number;
    printBackground?: boolean;
    margins?: 'default' | 'none' | 'minimum';
}
declare function getDefaultPrintOptions(): PrintOptions;
/** Trigger browser print dialog for the current document. */
declare function triggerPrint(): void;
/**
 * Open a new window with print-optimised body content.
 *
 * Built entirely via DOM APIs (no `document.write` of interpolated strings):
 * `title` is assigned as a property so a value like `</title><script>` is
 * treated as text and cannot break out, and `content` is parsed in an inert
 * document and imported rather than concatenated into markup. `content` is the
 * caller's already-rendered print HTML; provide trusted markup.
 * Sibling copy: packages/docx-react/src/components/ui/PrintPreview.tsx.
 */
declare function openPrintWindow(title: string | undefined, content: string): Window | null;
/** Parse "1", "1-5", etc. into a page range, or null on invalid. */
declare function parsePageRange(input: string, maxPages: number): {
    start: number;
    end: number;
} | null;
declare function formatPageRange(range: {
    start: number;
    end: number;
} | null, totalPages: number): string;
declare function isPrintSupported(): boolean;

/**
 * Subscribable Base Class
 *
 * Framework-agnostic base for manager classes that need to notify
 * UI frameworks of state changes.
 *
 * Compatible with:
 * - React: useSyncExternalStore(manager.subscribe, manager.getSnapshot)
 * - Vue: watchEffect(() => { manager.subscribe(triggerRef) })
 */
declare abstract class Subscribable<TSnapshot> {
    private listeners;
    private snapshot;
    constructor(initialSnapshot: TSnapshot);
    /**
     * Subscribe to state changes. Returns an unsubscribe function.
     * Bound method — safe to pass as `useSyncExternalStore(manager.subscribe, ...)`.
     */
    subscribe: (listener: () => void) => (() => void);
    /**
     * Get the current snapshot. Returns a stable reference unless state has changed.
     * Bound method — safe to pass as `useSyncExternalStore(..., manager.getSnapshot)`.
     */
    getSnapshot: () => TSnapshot;
    /**
     * Update the snapshot and notify all subscribers.
     * Subclasses should call this whenever their state changes.
     */
    protected setSnapshot(snapshot: TSnapshot): void;
    private notify;
}

/**
 * Manager Types
 *
 * Framework-agnostic interfaces for the editor's manager classes.
 * @packageDocumentation
 * @public
 */
/** Cell coordinates in a table */
interface CellCoordinates {
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
}
/** TableSelectionManager snapshot */
interface TableSelectionSnapshot {
    /** Currently selected cell, or null if no selection */
    selectedCell: CellCoordinates | null;
}
/** Error severity levels */
type ErrorSeverity = 'error' | 'warning' | 'info';
/** Error notification */
interface ErrorNotification {
    id: string;
    message: string;
    severity: ErrorSeverity;
    details?: string;
    timestamp: number;
    dismissed?: boolean;
}
/** ErrorManager snapshot */
interface ErrorManagerSnapshot {
    notifications: ErrorNotification[];
}

/**
 * TableSelectionManager
 *
 * Framework-agnostic class for managing table cell selection state.
 * Extracted from the React `useTableSelection` hook.
 *
 * Handles:
 * - Cell selection via data-attribute queries on the DOM
 * - Table document operations (add/delete rows/columns, merge/split)
 *
 * @remarks
 * Tagged `@internal` post-1.0 cut. Adapters bind to this class today,
 * but consumers should reach for `useTableSelection()` (React/Vue) instead
 * of this raw subpath. The subpath stays in `package.json` `exports` for
 * back-compat; expect it to move behind a public surface in a future major.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * Data attributes for table elements in the rendered DOM
 * @internal
 */
declare const TABLE_DATA_ATTRIBUTES: {
    readonly TABLE_INDEX: "data-table-index";
    readonly ROW_INDEX: "data-row";
    readonly COLUMN_INDEX: "data-col";
    readonly TABLE_CELL: "data-table-cell";
};
/**
 * Find table cell coordinates from a click target by walking up the DOM
 * and reading data attributes.
 * @internal
 */
declare function findTableFromClick(target: EventTarget | null, container?: HTMLElement | null): CellCoordinates | null;
/**
 * Get a table from the document by index.
 * @internal
 */
declare function getTableFromDocument(doc: Document, tableIndex: number): Table | null;
/**
 * Update a table in the document immutably.
 * @internal
 */
declare function updateTableInDocument(doc: Document, tableIndex: number, newTable: Table): Document;
/**
 * Delete a table from the document immutably.
 * @internal
 */
declare function deleteTableFromDocument(doc: Document, tableIndex: number): Document;
/** @internal */
declare class TableSelectionManager extends Subscribable<TableSelectionSnapshot> {
    constructor();
    /** Select a specific cell. */
    selectCell(coords: CellCoordinates): void;
    /** Clear the current selection. */
    clearSelection(): void;
    /** Check if a specific cell is selected. */
    isCellSelected(tableIndex: number, rowIndex: number, columnIndex: number): boolean;
    /** Get the currently selected cell coordinates, or null. */
    getSelectedCell(): CellCoordinates | null;
}

/**
 * ErrorManager
 *
 * Framework-agnostic pub/sub error notification system.
 * Replaces React's `componentDidCatch` + context pattern for error notifications.
 *
 * Usage with React:
 * ```ts
 * const { notifications } = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
 * ```
 */

declare class ErrorManager extends Subscribable<ErrorManagerSnapshot> {
    private notifications;
    private idCounter;
    private timers;
    constructor();
    /** Show an error notification (persistent, not auto-dismissed). */
    showError(message: string, details?: string): string;
    /** Show a warning notification (auto-dismissed after 5s). */
    showWarning(message: string, details?: string): string;
    /** Show an info notification (auto-dismissed after 5s). */
    showInfo(message: string, details?: string): string;
    /** Dismiss a notification by ID. */
    dismiss(id: string): void;
    /** Clear all notifications and cancel pending timers. */
    clearAll(): void;
    /** Destroy the manager and clean up all timers. */
    destroy(): void;
    private addNotification;
    private emitSnapshot;
}

/**
 * @betteroffice/docx (default entry point)
 *
 * Fat barrel that re-exports the parser, serializer, and the most-used types.
 * No React/DOM imports. Adapter authors who only need a specific slice should
 * prefer the smaller subpaths.
 *
 * @example
 * ```ts
 * import { parseDocx, serializeDocx, resolveColor } from '@betteroffice/docx';
 * ```
 * @packageDocumentation
 * @public
 */
declare const VERSION: string;

export { type CellCoordinates, Document, DocumentBody, type DocxCompareDiagnostic, type DocxCompareDiagnosticCode, type DocxCompareLimits, type DocxCompareLocation, type DocxCompareOptions, type DocxCompareResult, type DocxCompareTextSpan, type DocxComparedChange, DocxContentControlQuery, DocxContentControlReadFailure, DocxContentControlsError, DocxContentControlsOptions, DocxContentControlsSnapshot, DocxExportError, DocxExportFailure, DocxExportOptions, DocxHeadlessLayoutOptions, DocxLayoutMap, DocxMarkdownContent, DocxMarkdownOptions, DocxPageExportOptions, DocxPageMarkdownOptions, DocxPagedStructuredContent, DocxSnapshotLayoutMap, DocxStructuredContent, ErrorManager, type ErrorManagerSnapshot, type ErrorNotification, type ErrorSeverity, type PrintOptions, SectionProperties, Subscribable, TABLE_DATA_ATTRIBUTES, Table, TableSelectionManager, type TableSelectionSnapshot, VERSION, compareDocx, deleteTableFromDocument, exportDocxMarkdown, exportDocxStructured, exportDocxStructuredWithPages, findDocxContentControls, findTableFromClick, formatPageRange, getDefaultPrintOptions, getTableFromDocument, isPrintSupported, listDocxContentControls, openPrintWindow, parsePageRange, renderDocxMarkdown, renderDocxMarkdownWithPages, serializeDocumentBody, serializeDocument as serializeDocx, serializeSectionProperties, triggerPrint, updateTableInDocument };
