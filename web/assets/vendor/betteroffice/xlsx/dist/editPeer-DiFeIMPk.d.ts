import { i as PatternType, D as DisplayList, c as ChartRegion, R as Rect, d as Direction, k as SelectionData } from './types-DdoEoFSX.js';
import { C as CollaborationReplica, u as CollaborationUpdateOrigin, P as PipeCommandPayload, g as AwarenessCursor, m as AsyncReplicaAdapter } from './asyncReplica-DuZEFXjI.js';

/** Format-owned, structured-cloneable methods. */
type SessionMethods = Record<string, (...args: any[]) => unknown>;
type Promisified<M extends SessionMethods> = {
    [K in keyof M]: (...args: Parameters<M[K]>) => Promise<Awaited<ReturnType<M[K]>>>;
};
interface SessionState {
    format: string;
    stage: 'preview' | 'ready';
    version: number;
    dirty: boolean;
}
type SessionFailureCode = 'crash' | 'trap' | 'out-of-memory' | 'message' | 'silence' | 'disposed';
/** A terminal session failure. */
declare class SessionFailure extends Error {
    readonly code: SessionFailureCode;
    readonly diagnostics?: string | undefined;
    constructor(code: SessionFailureCode, message: string, diagnostics?: string | undefined);
}

interface ChartSeriesInfo {
    index: number;
    name: string | null;
    nameRef: string | null;
    categoryRef: string | null;
    valueRef: string | null;
}
interface ChartInfo {
    id: string;
    index: number;
    part: string;
    type: string;
    anchorRange: string | null;
    /** false when the chart part cannot be read; error says why and the rest is empty. */
    editable: boolean;
    error: string | null;
    title: string | null;
    /** a title Excel fills in, with no text of its own. */
    autoTitle: boolean;
    richTitle: boolean;
    series: ChartSeriesInfo[];
}
type ChartSeriesName = {
    text: string;
} | {
    ref: string;
};
type ChartEdit = {
    action: 'set_chart_title';
    title: string | null;
} | {
    action: 'set_series';
    series: number;
    name?: ChartSeriesName;
    categories?: string;
    values?: string;
};
type ChartMutation = {
    sheet: number;
    chart: number;
} & ChartEdit;

type XlsxDefinedNameOp = {
    type: 'setDefinedName';
    name: string;
    refers_to: string;
    scope?: number | null;
    hidden?: boolean;
} | {
    type: 'deleteDefinedName';
    name: string;
    scope?: number | null;
};
interface XlsxDefinedName {
    name: string;
    refersTo: string;
    scope: number | null;
    hidden: boolean;
}
interface XlsxDefinedNamesRequest {
    /** Omitted selects all scopes; null selects workbook scope. */
    scope?: number | null;
    offset?: number;
    limit?: number;
}
interface XlsxDefinedNamesResult {
    version: string;
    items: XlsxDefinedName[];
    total: number;
    nextOffset: number | null;
}

type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

/**
 * Result envelopes shared by the formats' host edit APIs. Targets, steps, receipts and failure
 * codes stay format-owned; these shapes only fix how every format reports success and refusal.
 */
/** Why a host operation was refused, as data. The document is unchanged. */
interface OperationFailure<Code extends string, Target> {
    code: Code;
    /** The request step that failed, when one did. */
    stepIndex?: number;
    /** The earlier step an `overlapping-steps` failure conflicts with. */
    conflictingStepIndex?: number;
    /** The failing step's target as requested or resolved. */
    target?: Target;
    message: string;
}
/** A policy refusal carrying the version the document is still at. */
interface OperationRefusal<Failure> {
    ok: false;
    version: string;
    failure: Failure;
}
/**
 * An accepted edit request. `applied` is false when every step was a no-op; the version then
 * stays `baseVersion` and no history or change notification was produced.
 */
interface EditSuccess<Receipt> {
    ok: true;
    baseVersion: string;
    version: string;
    applied: boolean;
    /** One receipt per request step, in request order. */
    receipts: Receipt[];
}
/** A validated edit request. Validation reserves nothing and cannot be committed later. */
interface ValidationSuccess<Preview> {
    ok: true;
    baseVersion: string;
    wouldApply: boolean;
    previews: Preview[];
}

/**
 * Shapes shared by the formats' read-only structured exports. Content trees, anchors, story or
 * sheet selectors, diagnostic codes and limits stay format-owned; these only fix how every format
 * reports diagnostics, truncation and Markdown markers.
 */
type ExportSeverity = 'info' | 'warning' | 'error';
/** Something an export omitted or could not represent, anchored where it applies. */
interface ExportDiagnostic<Code extends string, Anchor> {
    code: Code;
    severity: ExportSeverity;
    anchor: Anchor | null;
    message: string;
}
/** Whether an export stopped at its limits before the end of the content. */
interface ExportCompletion {
    truncated: boolean;
}
/** A Markdown marker comment and the anchor of the content it precedes. */
interface MarkdownAnchor<Anchor> {
    marker: string;
    anchor: Anchor;
}

/**
 * Read-only structured export of workbook content and its Markdown projection. Every shape
 * here is plain JSON; the walker, limits and Markdown renderer live in Rust.
 *
 * Export never recalculates: formula results are the stored values (`calculation.policy:
 * 'asStored'`, `freshness: 'unverified'`). Anchors name positions by sheet id, index and name
 * and A1 in the exported version or snapshot; none follows later row, column or sheet edits.
 */

/** A zero-based sheet index and at most one rectangular A1 range, defaulting to the used range. */
interface XlsxExportScope {
    sheet: number;
    range?: string;
}
/** Hidden sheets, rows, columns and names are excluded unless asked for. */
interface XlsxExportOptions {
    /** Defaults to every sheet. Unions, whole rows or columns and sheet-qualified ranges refuse. */
    scope?: readonly XlsxExportScope[];
    includeHiddenSheets?: boolean;
    includeHiddenRows?: boolean;
    includeHiddenColumns?: boolean;
    /** Defaults to `true`. */
    includeDefinedNames?: boolean;
    includeHiddenNames?: boolean;
    /** Stored cells, 1 to 1,000,000; defaults to 100,000. */
    maxCells?: number;
    /** Compact UTF-8 JSON bytes of the content, at most 16 MiB; defaults to 8 MiB. */
    maxBytes?: number;
}
/** Empty grid positions count toward `maxCells`. */
interface XlsxMarkdownOptions {
    /** Grid rows per sheet; defaults to 200. */
    maxRows?: number;
    /** Grid columns per sheet; defaults to 50. */
    maxColumns?: number;
    /** Grid positions across all sheets; defaults to 10,000. */
    maxCells?: number;
    /** UTF-8 bytes of Markdown; defaults to 8 MiB. */
    maxBytes?: number;
}
/** A sheet by the id edit batches take and, descriptively, its current position and name. */
interface XlsxSheetIdentity {
    /** The exporting session's catalog id; `sheet:{index}` for bytes. */
    sheetId: string;
    index: number;
    name: string;
}
/**
 * A `cell` or `range` anchor's `{ sheetId: sheet.sheetId, range: { kind: 'a1', a1 } }` is its
 * `XlsxRangeTarget` at the exported version.
 */
type XlsxAnchor = {
    kind: 'sheet';
    sheet: XlsxSheetIdentity;
} | {
    kind: 'cell';
    sheet: XlsxSheetIdentity;
    a1: string;
} | {
    kind: 'range';
    sheet: XlsxSheetIdentity;
    a1: string;
} | {
    kind: 'definedName';
    name: string;
    localSheet: XlsxSheetIdentity | null;
    /** Position in the workbook's defined-name list. */
    ordinal: number;
} | {
    kind: 'sourcePart';
    part: string;
    partSha256: string;
    path: number[];
};
/** Retained source XML: part, SHA-256 of its bytes, element-child ordinals from its root. */
interface XlsxSourcePart {
    part: string;
    partSha256: string;
    path: number[];
}
type XlsxExportDiagnosticCode = 'hidden-content-excluded' | 'visibility-unknown' | 'unsupported-sheet' | 'unsupported-content' | 'object-placeholder' | 'unreadable-object' | 'provenance-unavailable' | 'comments-omitted' | 'rich-text-omitted' | 'formatting-approximate' | 'formula-cache-unverified' | 'formula-result-missing' | 'calculation-failure' | 'value-unavailable' | 'truncated' | 'markdown-lossy';
type XlsxExportDiagnostic = ExportDiagnostic<XlsxExportDiagnosticCode, XlsxAnchor>;
/** A cell value; `unavailable` stands for one JSON cannot carry, such as a non-finite number. */
type XlsxExportValue = XlsxCellValue | {
    kind: 'unavailable';
    reason: string;
};
/**
 * `unverified`: a result is stored, not checked. `missing`: none is stored, and the value is the
 * engine's placeholder. `uncertain`: presence cannot be established, as once anything has
 * calculated since a file that stored none was read. `cycle` and `limited`: what the last
 * calculation reported.
 */
type XlsxFormulaResult = 'unverified' | 'missing' | 'uncertain' | 'cycle' | 'limited';
interface XlsxExportCell {
    id: string;
    anchor: XlsxAnchor;
    value: XlsxExportValue;
    /** Without the leading `=`. */
    formula: string | null;
    /** The engine's formatting of the value, without column-width clipping or overflow. */
    displayText: string;
    numberFormat: string;
    /** `null` for cells without a formula. */
    formulaResult: XlsxFormulaResult | null;
    merge: {
        range: string;
        origin: boolean;
    } | null;
}
interface XlsxExportMerge {
    id: string;
    anchor: XlsxAnchor;
    /** Whether the merge extends past the selected range. */
    clipped: boolean;
}
/** A ListObject. */
interface XlsxExportTable {
    id: string;
    anchor: XlsxAnchor;
    name: string;
    headerRows: number;
    totalsRows: number;
    columns: string[];
    clipped: boolean;
}
interface XlsxExportHyperlink {
    id: string;
    anchor: XlsxAnchor;
    externalTarget: string | null;
    location: string | null;
    tooltip: string | null;
    display: string | null;
    clipped: boolean;
}
type XlsxObjectKind = 'chart' | 'picture' | 'shape' | 'group' | 'connector' | 'diagram' | 'graphicFrame' | 'contentPart' | 'unknown';
/** A drawing object as a placeholder: no chart data, image bytes or shape text. */
interface XlsxExportObject {
    id: string;
    kind: XlsxObjectKind;
    /** The cells holding its corners; `null` when its grid position is unknown. */
    anchor: XlsxAnchor | null;
    name: string | null;
    altText: string | null;
    title: string | null;
    hidden: boolean;
    /** The chart or image part. */
    part: string | null;
    source: XlsxSourcePart | null;
}
interface XlsxExportDefinedName {
    id: string;
    anchor: XlsxAnchor;
    name: string;
    formula: string;
    hidden: boolean;
    localSheet: XlsxSheetIdentity | null;
}
type XlsxSheetVisibility = 'visible' | 'hidden' | 'veryHidden' | 'unknown';
/**
 * One sheet. `truncated` means export stopped inside it: its lists are complete in the order
 * hidden spans, merges, tables, hyperlinks, objects, cells, up to where it stopped.
 */
interface XlsxExportSheet extends ExportCompletion {
    id: string;
    anchor: XlsxAnchor;
    kind: 'worksheet' | 'chartsheet' | 'dialogsheet' | 'macrosheet' | 'other';
    visibility: XlsxSheetVisibility;
    /** Stored cells and hyperlinks; drawings, merges and tables do not extend it. */
    usedRange: string | null;
    selectedRange: string | null;
    /** Hidden row spans such as `"5:7"` inside the selected range, exported or not. */
    hiddenRows: string[];
    /** Hidden column spans such as `"C:D"` inside the selected range, exported or not. */
    hiddenColumns: string[];
    merges: XlsxExportMerge[];
    tables: XlsxExportTable[];
    hyperlinks: XlsxExportHyperlink[];
    objects: XlsxExportObject[];
    /** Stored cells in row-major order, styled empty cells included. */
    cells: XlsxExportCell[];
    source: XlsxSourcePart | null;
}
interface XlsxStructuredContent extends ExportCompletion {
    schemaVersion: 1;
    /** `session` for a live export, `snapshot` for bytes. */
    anchorScope: 'session' | 'snapshot';
    dateSystem: '1900' | '1904';
    calculation: {
        policy: 'asStored';
        freshness: 'unverified';
    };
    included: {
        hiddenSheets: boolean;
        hiddenRows: boolean;
        hiddenColumns: boolean;
        definedNames: boolean;
        hiddenNames: boolean;
    };
    sheets: XlsxExportSheet[];
    definedNames: XlsxExportDefinedName[];
    diagnostics: XlsxExportDiagnostic[];
}
interface XlsxMarkdownContent extends ExportCompletion {
    markdown: string;
    /** One per `<!-- xlsx-export:N -->` marker, in order. */
    anchors: MarkdownAnchor<XlsxAnchor>[];
    /** The structured export's diagnostics, then what Markdown lost. */
    diagnostics: XlsxExportDiagnostic[];
}
type XlsxExportFailureCode = 'invalid-options' | 'invalid-scope' | 'limit-exceeded';
interface XlsxExportFailure {
    code: XlsxExportFailureCode;
    /** The sheet a scope failure names, else `null`. */
    target: XlsxAnchor | null;
    message: string;
}
type XlsxExportResult<T> = {
    ok: true;
    version: string;
    content: T;
} | OperationRefusal<XlsxExportFailure>;

/**
 * Versioned reads and version-checked edit batches over one workbook. Every shape here is plain
 * JSON; the semantics live in Rust.
 *
 * Rows and columns are zero-based and ranges inclusive. Sheet ids come from the current catalog:
 * `sheet:{index}` standalone, the replica's sheet keys in collaboration. Versions and sheet ids
 * are session-scoped; neither survives save and reopen. Standalone ids are positional, so each is
 * valid only for the version it was read at.
 */

/** Provenance only: it neither grants permission nor selects history. */
type XlsxEditSource = 'host' | 'agent';
/**
 * `separate`: exactly one undo step. `none`: no undo step, existing entries kept; standalone
 * undo replays inverse operations, so undoing an older step that wrote the same cell still
 * overwrites it.
 *
 * @experimental `none` only: its interaction with standalone undo may change in a minor release.
 */
type XlsxEditHistory = 'separate' | 'none';
interface XlsxCellPosition {
    row: number;
    col: number;
}
/**
 * An A1 cell or `A1:B2` range (`$` allowed), or zero-based corners. Sheet-qualified, union,
 * whole-row/column and named references are refused.
 */
type XlsxRangeAddress = {
    kind: 'a1';
    a1: string;
} | {
    kind: 'rowCol';
    start: XlsxCellPosition;
    end: XlsxCellPosition;
};
interface XlsxRangeTarget {
    sheetId: string;
    range: XlsxRangeAddress;
}
/** One cell in canonical form. */
interface XlsxCellAddress {
    sheetId: string;
    row: number;
    col: number;
    a1: string;
}
type XlsxErrorValue = '#DIV/0!' | '#N/A' | '#NAME?' | '#NULL!' | '#NUM!' | '#REF!' | '#VALUE!' | '#SPILL!' | '#CALC!';
type XlsxCellValue = {
    kind: 'empty';
} | {
    kind: 'number';
    value: number;
} | {
    kind: 'text';
    value: string;
} | {
    kind: 'bool';
    value: boolean;
} | {
    kind: 'error';
    value: XlsxErrorValue;
};
/** Conditions on a cell's pre-batch state; an absent field imposes none. */
interface XlsxCellGuard {
    /** The stored value, a formula's current result included. */
    value?: XlsxCellValue;
    /** Formula source without the leading `=`; `null` asserts there is no formula. */
    formula?: string | null;
    /** The exact text the engine formats the cell as. */
    displayText?: string;
}
/** Matrices are row-major and exactly the target's shape. */
type XlsxEditOperation = {
    /** What a user would type, parsed against each cell's current number format. */
    op: 'setCellInputs';
    target: XlsxRangeTarget;
    inputs: string[][];
} | {
    op: 'setCellValues';
    target: XlsxRangeTarget;
    values: XlsxCellValue[][];
} | {
    /** Formula source without the leading `=`, stored as a formula whatever the format. */
    op: 'setFormulas';
    target: XlsxRangeTarget;
    formulas: string[][];
} | {
    /** Relative mutations resolve against each cell's current format. */
    op: 'setNumberFormat';
    target: XlsxRangeTarget;
    format: NumberFormatMutation;
} | {
    op: 'patchStyle';
    target: XlsxRangeTarget;
    patch: RangeStylePatch;
};
type XlsxEditStep = XlsxEditOperation & {
    expect?: {
        cells: XlsxCellGuard[][];
    };
};
/** Requests above 16 MiB and results above 64 MiB are refused with `limit-exceeded`. */
interface XlsxEditRequest {
    /** The version the targets were read at; a changed workbook refuses with `stale-version`. */
    expectVersion: string;
    /** Defaults to `host`. */
    source?: XlsxEditSource;
    /** Defaults to `separate`. */
    history?: XlsxEditHistory;
    /** Overrides the handle clock for this request; without either clock, NOW() has no clock. */
    calculation?: {
        nowSerial?: number;
    };
    steps: readonly XlsxEditStep[];
}
/**
 * `locked-target` covers any write to merged-cell followers, array-formula cells and locked
 * cells of protected sheets, and formats on protected sheets that do not allow formatting cells.
 * `read-only` comes only from an editor that does not accept edits.
 */
type XlsxEditFailureCode = 'stale-version' | 'missing-target' | 'content-mismatch' | 'overlapping-steps' | 'locked-target' | 'read-only' | 'unsupported' | 'invalid-step' | 'limit-exceeded';
type XlsxEditFailure = OperationFailure<XlsxEditFailureCode, XlsxRangeTarget>;
type XlsxEditRefusal = OperationRefusal<XlsxEditFailure>;
interface XlsxEditReceipt {
    stepIndex: number;
    changed: boolean;
    target: XlsxRangeTarget;
    /** Row-major. */
    changedCells: XlsxCellAddress[];
}
/** What one step would do; it cannot be committed later. */
interface XlsxEditPreview {
    stepIndex: number;
    target: XlsxRangeTarget;
    wouldChange: boolean;
    changedCellCount: number;
}
interface XlsxEditCalculation {
    /** Dependents whose value moved. */
    changed: XlsxCellAddress[];
    cycleCells: XlsxCellAddress[];
    limitedCells: XlsxCellAddress[];
    /** Whether a list stopped at 10,000 cells. */
    truncated: boolean;
}
type XlsxEditResult = (EditSuccess<XlsxEditReceipt> & {
    source: XlsxEditSource;
    /** Sheets the batch or its recalculation changed, as ids in sheet order. */
    changedSheets: string[];
    calculation: XlsxEditCalculation;
}) | XlsxEditRefusal;
type XlsxValidationResult = ValidationSuccess<XlsxEditPreview> | XlsxEditRefusal;
interface XlsxReadRequest {
    /** Empty reads only the sheet catalog. */
    ranges: readonly XlsxRangeTarget[];
}
interface XlsxSheetEntry {
    visibility?: XlsxSheetVisibility;
    sheetId: string;
    name: string;
    /**
     * False for non-worksheets, which batches refuse to write, and protected worksheets, which take
     * content only in unlocked cells and formats only when they allow formatting cells.
     */
    editable: boolean;
}
interface XlsxCellRead {
    a1: string;
    value: XlsxCellValue;
    formula: string | null;
    displayText: string;
}
interface XlsxRangeRead {
    target: XlsxRangeTarget;
    /** Row-major. */
    cells: XlsxCellRead[][];
}
interface XlsxReadCalculation {
    cycleCells: XlsxCellAddress[];
    limitedCells: XlsxCellAddress[];
    /** Whether a list stopped at 10,000 cells. */
    truncated: boolean;
}
type XlsxReadResult = {
    ok: true;
    version: string;
    sheets: XlsxSheetEntry[];
    ranges: XlsxRangeRead[];
    calculation: XlsxReadCalculation;
} | XlsxEditRefusal;
/** An exact, case-sensitive substring search over display text. */
interface XlsxFindRequest {
    text: string;
    /** Defaults to every sheet. */
    sheetIds?: readonly string[];
    /** Defaults to 100; at most 10,000. */
    limit?: number;
}
interface XlsxFindMatch {
    cell: XlsxCellAddress;
    /** The cell's whole display text. */
    text: string;
}
type XlsxFindResult = {
    ok: true;
    version: string;
    matches: XlsxFindMatch[];
    truncated: boolean;
} | XlsxEditRefusal;

/**
 * A scrolled window into a sheet. `x`/`y` are content-pixel offsets into the
 * non-frozen body. Mirrors the Rust `Viewport`.
 */
interface Viewport {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface PrintMetrics {
    dpi: number;
    maxDigitWidth: number;
    defaultRowHeightPt: number;
    defaultColumnWidth?: number;
    fontSizePt: number;
    fontFamily: string;
    fontAscent: number;
    fontDescent: number;
}
type XlsxAutoFilterOp = {
    type: 'setAutoFilter';
    sheet: number;
    range: string | null;
};
/**
 * Chrome-facing sheet metadata: stable IDs, tab names, active index, and the
 * scrollable content extent of the active sheet. Mirrors the Rust `SheetInfo`.
 */
interface SheetInfo {
    autoFilter?: string | null;
    sheetIds: string[];
    sheetNames: string[];
    activeSheet: number;
    contentWidth: number;
    contentHeight: number;
    frozenRows: number;
    frozenCols: number;
    initialScrollX: number;
    initialScrollY: number;
}
interface CellPosition {
    x: number;
    y: number;
}
/**
 * Result of any mutating call: whether it changed the workbook and the
 * (possibly grown) sheet metadata. Mirrors the Rust `EditResult`.
 *
 * `changed` lists the a1 addresses (on the active sheet) of *other* cells whose
 * displayed value moved as a fallout of the edit — the dependents the recalc
 * pass recomputed. It excludes the directly edited cell(s) and is omitted by
 * cores built before the recalc engine, so treat it as additive.
 */
interface EditResult {
    applied: boolean;
    sheetInfo: SheetInfo;
    changed?: string[];
    limitedCells?: string[];
}
/** Facade stage latencies of one profiled mutation, in ms. */
interface EditProfile {
    validateMs: number;
    applyMs: number;
    recalcMs: number;
    resultMs: number;
}
interface ProfiledEditResult extends EditResult {
    profile: EditProfile;
}
interface DisplayListProfile {
    buildMs: number;
    encodeMs: number;
}
interface ProfiledDisplayList {
    displayList: DisplayList;
    profile: DisplayListProfile;
}
interface CalculationStatus {
    limitedCells: string[];
    /** The last recalculation ran out of its budget; the cells it could not evaluate keep their saved values. */
    budgetExhausted?: boolean;
}
type NumberFormat = 'automatic' | 'plainText' | 'number' | 'percent' | 'scientific' | 'currency' | 'date' | 'time' | 'custom';
type BorderPreset = 'all' | 'inner' | 'horizontal' | 'vertical' | 'outer' | 'left' | 'top' | 'right' | 'bottom' | 'none';
type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';
type HorizontalAlignment = 'left' | 'center' | 'right';
type VerticalAlignment = 'top' | 'middle' | 'bottom';
type TextWrapping = 'overflow' | 'wrap' | 'clip';
type StyleProperty = 'bold' | 'italic' | 'strikethrough' | 'fontFamily' | 'fontSize' | 'textColor' | 'fillColor' | 'borders' | 'horizontalAlignment' | 'verticalAlignment' | 'textWrapping';
interface BorderPatch {
    preset?: BorderPreset;
    style?: BorderStyle;
    color?: string;
}
interface RangeStylePatch {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    fontFamily?: string;
    fontSize?: number;
    textColor?: string;
    fillColor?: string;
    border?: BorderPatch;
    horizontalAlignment?: HorizontalAlignment;
    verticalAlignment?: VerticalAlignment;
    textWrapping?: TextWrapping;
    clear?: StyleProperty[];
}
type NumberFormatMutation = Exclude<NumberFormat, 'custom'> | 'increaseDecimal' | 'decreaseDecimal' | {
    type: 'custom';
    pattern: string;
};
interface SelectionFormatting {
    numberFormat?: NumberFormat;
    numberFormatPattern?: string;
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    textColor?: string;
    fillColor?: string;
    borderPreset?: BorderPreset;
    borderStyle?: BorderStyle;
    borderColor?: string;
    horizontalAlignment?: HorizontalAlignment;
    verticalAlignment?: VerticalAlignment;
    textWrapping?: TextWrapping;
}
interface CapturedFormat<TFormat = unknown> {
    rows: number;
    columns: number;
    formats: TFormat[];
    sourceStyles?: (number | null)[];
    sourceFormats?: unknown[];
}
type CapturedColor = 'Auto' | {
    Rgb: string;
} | {
    Indexed: number;
} | {
    Theme: {
        idx: number;
        tint: number;
    };
};
type CapturedFill = 'None' | {
    Solid: CapturedColor;
} | {
    Pattern: {
        pattern: PatternType;
        fg?: CapturedColor | null;
        bg?: CapturedColor | null;
    };
};
type CapturedBorderStyle = 'Thin' | 'Medium' | 'Thick' | 'Dashed' | 'Dotted' | 'Double' | 'Hair' | 'MediumDashed' | 'DashDot' | 'MediumDashDot' | 'DashDotDot' | 'MediumDashDotDot' | 'SlantDashDot';
interface CapturedBorderEdge {
    style: CapturedBorderStyle;
    color?: CapturedColor | null;
}
interface CapturedCellFormat {
    font: {
        name?: string | null;
        size_pt?: number | null;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strike?: boolean;
        color?: CapturedColor | null;
    };
    fill: CapturedFill;
    border: {
        left?: CapturedBorderEdge | null;
        right?: CapturedBorderEdge | null;
        top?: CapturedBorderEdge | null;
        bottom?: CapturedBorderEdge | null;
    };
    numberFormat: {
        kind: 'builtin';
        id: number;
    } | {
        kind: 'custom';
        pattern: string;
    };
    alignment: {
        h?: 'General' | 'Left' | 'Center' | 'Right' | 'Fill' | 'Justify' | 'CenterContinuous' | 'Distributed' | null;
        v?: 'Top' | 'Center' | 'Bottom' | 'Justify' | 'Distributed' | null;
        wrap_text?: boolean;
        shrink_to_fit?: boolean;
    };
}
interface CellPoint {
    row: number;
    col: number;
}
interface MergedRange {
    start: CellPoint;
    end: CellPoint;
}
interface WorkbookHyperlink {
    range: MergedRange;
    externalTarget?: string;
    location?: string;
    tooltip?: string;
    display?: string;
}
interface DifferentialFormatInput {
    fontColor?: string;
    bold?: boolean;
    italic?: boolean;
    fill?: string;
}
interface ConditionalFormatRuleInput {
    type: 'cellIs' | 'expression';
    operator?: string;
    formulas: string[];
}
interface ConditionalFormatInfo {
    id: string;
    range: string;
    type: string;
    operator?: string;
    formulas: string[];
    priority: number;
    dxfId?: number;
    format: DifferentialFormatInput;
    editable: boolean;
}
type ConditionalFormatOp = {
    type: 'addConditionalFormat';
    sheet: number;
    range: MergedRange;
    kind: 'cellIs' | 'expression';
    operator?: string;
    formulas: string[];
    format: DifferentialFormatInput;
} | {
    type: 'removeConditionalFormat';
    sheet: number;
    id: string;
};
interface HistoryState {
    canUndo: boolean;
    canRedo: boolean;
    undoDepth: number;
    redoDepth: number;
}
type WorkbookUpdateOrigin = CollaborationUpdateOrigin;
/**
 * `fromPeer` is true for every event a peer update caused through `applyUpdate`, including
 * the `'local'` re-encoding a replica forwards after adopting a whole-document state.
 */
interface WorkbookUpdateInfo {
    fromPeer: boolean;
}
type WorkbookUpdateListener = (update: Uint8Array, origin: WorkbookUpdateOrigin, info: WorkbookUpdateInfo) => void;
interface WorkbookCalculationContext {
    nowSerial: number;
    randSeed: number;
}
interface OpenWorkbookOptions {
    /** Open a Yrs-backed replica that can accept peer updates. */
    collaborative?: boolean;
    /** Peer-unique positive safe integer. Generated securely when omitted. */
    clientId?: number;
    calculation?: WorkbookCalculationContext;
}
/**
 * The editable view of one cell: A1 address, the exact string the user would
 * edit (formulas as `=...`, guarded literals with a leading `'`), and whether
 * that string is a formula. Mirrors the Rust `CellEdit`.
 */
interface CellEdit {
    a1: string;
    input: string;
    isFormula: boolean;
    isArrayFormula?: boolean;
}
interface XlsxTextSearchOptions {
    /** Defaults to false. */
    caseSensitive?: boolean;
    /** Maximum matches; defaults to 1000. */
    limit?: number;
}
/** Zero-based sheet, row, and column. */
interface XlsxTextMatch {
    sheet: number;
    sheetId: string;
    sheetName: string;
    row: number;
    col: number;
    a1: string;
    /** Formatted display text. */
    text: string;
}
/** One cell of a batch edit: target coordinates plus the raw user input. */
interface CellInputEdit {
    row: number;
    col: number;
    input: string;
    copyFrom?: CellPoint;
}
/**
 * One edit inside a proposal. Same shape as {@link CellInputEdit} plus the
 * sheet index — a proposal's cells carry their own sheet on the wire, so it
 * can span sheets rather than being pinned to the active one.
 */
interface ProposalEdit extends CellInputEdit {
    sheet: number;
    numberFormat?: NumberFormatMutation;
}
/**
 * One cell of a pending proposal: where it lands and the *formatted display
 * texts* before/after applying it. `oldText`/`newText` are what the grid shows,
 * not the raw input — the ghost decoration paints `newText` directly. Mirrors
 * the Rust proposal cell.
 */
interface ProposalCell {
    sheet: number;
    row: number;
    col: number;
    a1: string;
    oldText: string;
    newText: string;
}
/**
 * A pending, un-applied set of cell changes an agent has staged for human
 * review. `note` is the agent's rationale (may be null); `cells` are the
 * per-cell before/after previews. Applying it is one undo step.
 */
interface Proposal {
    id: string;
    agentId: string;
    note: string | null;
    cells: ProposalCell[];
}
/** A drifted proposal cell: its sheet index and catalog id beside the coordinates. */
interface StaleProposalTarget extends XlsxCellAddress {
    sheet: number;
}
/**
 * Thrown by {@link WorkbookHandle.acceptProposal} when the workbook changed
 * under a proposal since it was staged (an edit touched one of its base cells)
 * and `force` was not set. `cells` are the a1 addresses that moved, so the UI
 * can name them and offer a force-apply; `targets` also carry each one's sheet.
 */
declare class StaleProposalError extends Error {
    readonly cells: string[];
    readonly targets: StaleProposalTarget[];
    constructor(cells: string[], targets?: StaleProposalTarget[]);
}
/** A display-list viewport exceeds the counted cell limit. */
declare class DisplayTooLargeError extends Error {
    readonly cells: number;
    readonly maxCells: number;
    readonly code = "displayTooLarge";
    constructor(cells: number, maxCells: number);
}
/**
 * A typed handle over an open workbook, hiding the wasm object and its JSON
 * boundary. Call {@link WorkbookHandle.dispose} to free the wasm memory.
 */
interface WorkbookHandle extends CollaborationReplica {
    readonly clientId: number;
    setCalculationContext(context: WorkbookCalculationContext | null): void;
    /** Available in both modes; encodes this handle's current Yrs state vector. */
    encodeStateVector(): Uint8Array;
    /** Available in both modes; pass a peer vector to encode only the missing state. */
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    /** Apply a peer update. Standalone handles throw the Rust `NotCollaborative` error. */
    applyUpdate(update: Uint8Array): EditResult;
    /** Observe owned update bytes from local commits and accepted remote updates. */
    onUpdate(listener: WorkbookUpdateListener): () => void;
    sheetInfo(): SheetInfo;
    sheetCount(): number;
    /** Metadata for `sheet`, with that index in `activeSheet`; leaves the workbook unchanged. */
    sheetInfoFor(sheet: number): SheetInfo;
    calculationStatus(): CalculationStatus;
    /** Clamps tracks to the grid and truncates oversized frames at the scroll origin. */
    displayList(viewport: Viewport): DisplayList;
    /** `displayList` with build and encode time measured inside the core. */
    displayListProfiled(viewport: Viewport): ProfiledDisplayList;
    printDisplayList(sheet: number, range: string, metrics: PrintMetrics, gridlines: boolean): DisplayList;
    /**
     * the chart under a viewport-local point on the active sheet, or `null`,
     * resolved against the current model from the same anchor geometry the
     * display list is built from. the returned `label` is always empty: a hit
     * test resolves anchors only and never reads a chart part.
     *
     * this answers for the model as it is now. chrome painting a frame should
     * hit-test that frame's own `charts` with `chartRegionAtPoint` instead, or a
     * mutation the canvas has not drawn yet will move the answer off the pixels.
     */
    chartAtPoint(viewport: Viewport, x: number, y: number): ChartRegion | null;
    /**
     * slide the chart frame `chart` names — a {@link ChartRegion} id — by a
     * content-pixel delta, clamped to the grid, as one undo step. the new anchor
     * is written back on save. throws for a chart pinned to the sheet by an
     * absolute anchor.
     */
    moveChart(sheet: number, chart: string, dx: number, dy: number): EditResult;
    setActiveSheet(index: number): void;
    /**
     * apply one user input to a cell (parses number/bool/formula/text) and
     * recalc its transitive dependents. one undo step; moved dependents come back
     * in `EditResult.changed`.
     */
    editCell(sheet: number, row: number, col: number, input: string): EditResult;
    /** `editCell` with the facade's stage timings attached. */
    editCellProfiled(sheet: number, row: number, col: number, input: string): ProfiledEditResult;
    /** apply a batch of inputs (paste path) as one undo step; dependents recalc. */
    editCells(sheet: number, edits: CellInputEdit[]): EditResult;
    /** Move a range within one sheet and rewrite references in one native undo step. */
    moveRange(sheet: number, source: string, destination: string): EditResult;
    setHyperlink(sheet: number, hyperlink: WorkbookHyperlink): EditResult;
    removeHyperlink(sheet: number, range: MergedRange): EditResult;
    charts(sheet: number): ChartInfo[];
    editCharts(edits: ChartMutation[]): EditResult;
    conditionalFormats(sheet: number): ConditionalFormatInfo[];
    /** raw op-list escape hatch for structural ops (insert/delete rows, merges…). */
    applyOps(ops: unknown[]): EditResult;
    /** `applyOps` with the facade's stage timings attached. */
    applyOpsProfiled(ops: unknown[]): ProfiledEditResult;
    undo(): EditResult;
    redo(): EditResult;
    /** the editable view of one cell (formula bar / in-cell editor prefill). */
    cell(sheet: number, row: number, col: number): CellEdit;
    /** Searches formatted text in sheet and row order. */
    searchText(query: string, options?: XlsxTextSearchOptions): XlsxTextMatch[];
    cellPosition(sheet: number, row: number, col: number): CellPosition;
    /** Absolute sheet rectangle in unzoomed pixels. */
    cellRect(sheet: number, row: number, col: number): Rect;
    selectionData(sheet: number, row: number, col: number, direction?: Direction | 'usedRange' | 'rowEnd' | 'merge'): SelectionData;
    /** row-major editable views for a range, e.g. "A1:C3" (clipboard copy). */
    rangeCells(sheet: number, range: string): CellEdit[][];
    patchRangeStyle(sheet: number, range: string, patch: RangeStylePatch): EditResult;
    setNumberFormat(sheet: number, range: string, format: NumberFormatMutation): EditResult;
    selectionFormatting(sheet: number, range: string): SelectionFormatting;
    captureFormat(sheet: number, range: string): CapturedFormat;
    applyFormat(sheet: number, range: string, format: CapturedFormat): EditResult;
    mergedRanges(sheet: number, range: string): MergedRange[];
    visibleMergedRanges(sheet: number, viewport: Viewport): MergedRange[];
    historyState(): HistoryState;
    /**
     * render the current sheet viewport to png bytes via the native raster
     * backend — the same display list the canvas paints, rasterized server-side.
     * throws if the embedded wasm was built without png export (the `raster`
     * cargo feature); guard with {@link isPngExportAvailable}.
     */
    renderPng(viewport: Viewport): Uint8Array;
    /**
     * render an a1 range (default: the used range) at an optional scale to png.
     * dimensions are capped wasm-side; same availability guard as renderPng.
     */
    renderRangePng(opts?: {
        range?: string;
        scale?: number;
    }): Uint8Array;
    /** serialize the workbook back to .xlsx bytes. */
    save(): Uint8Array;
    /**
     * stage an agent's proposed edits for human review without applying them.
     * returns the {@link Proposal} with per-cell formatted before/after previews.
     * throws if the embedded wasm predates proposals; guard with
     * {@link WorkbookHandle.isProposalsAvailable}.
     */
    propose(agentId: string, note: string | null, edits: ProposalEdit[]): Proposal;
    /** every pending proposal, oldest first. empty when none or unsupported. */
    listProposals(): Proposal[];
    /**
     * apply a pending proposal as one undo step and recalc dependents. throws
     * {@link StaleProposalError} when the base changed since it was staged and
     * `force` is not set; pass `{ force: true }` to apply anyway.
     */
    acceptProposal(id: string, opts?: {
        force?: boolean;
    }): EditResult & {
        proposalId: string;
    };
    /** drop a pending proposal without applying it; false when the id was unknown. */
    rejectProposal(id: string): boolean;
    /** whether the embedded wasm core was built with the proposals api. */
    isProposalsAvailable(): boolean;
    /**
     * The session-scoped version of the committed workbook. Committed edits, peer updates, undo,
     * redo and a recalculation that changes values or what an export reports about results move
     * it; selection, the active sheet and proposals do not.
     */
    version(): string;
    listDefinedNames(request?: XlsxDefinedNamesRequest): XlsxDefinedNamesResult;
    /** Cells with the version they were read at; empty `ranges` reads the sheet catalog. */
    readCells(request: XlsxReadRequest): XlsxReadResult;
    /** Exact, case-sensitive search over display text, one match per cell. */
    findText(request: XlsxFindRequest): XlsxFindResult;
    /** Resolves, stages and rehearses a batch like `applyEdits`, changing nothing. */
    validateEdits(request: XlsxEditRequest): XlsxValidationResult;
    /**
     * Applies every step as one committed, recalculated change, or refuses with nothing changed.
     * Update listeners run once, after the call returns. Malformed requests throw.
     */
    applyEdits(request: XlsxEditRequest): XlsxEditResult;
    /**
     * Exports the committed workbook with the version it was read at: sparse cells with values,
     * formulas and display text, plus sheet metadata and diagnostics. Nothing is recalculated,
     * flushed or published. Options it cannot honor refuse; malformed ones throw.
     */
    exportStructured(options?: XlsxExportOptions): XlsxExportResult<XlsxStructuredContent>;
    /** {@link WorkbookHandle.exportStructured} rendered as Markdown from the same read. */
    exportMarkdown(options?: XlsxExportOptions, markdownOptions?: XlsxMarkdownOptions): XlsxExportResult<XlsxMarkdownContent>;
    dispose(): void;
}
type WasmInitInput = InitInput | Promise<InitInput>;
/** Initialize the workbook engine. Concurrent calls share the same attempt. */
declare function initWasm(input?: WasmInitInput): Promise<void>;
/** Maximum counted cells per frame, including boundary and frozen tracks; call after `initWasm`. */
declare function getDisplayListCellLimit(): number;
/**
 * Whether this environment exposes the WebAssembly runtime required by the core.
 */
declare function isWasmAvailable(): boolean;
/**
 * Whether the embedded wasm core was built with png export (the `raster` cargo
 * feature). The wasm-bindgen method only exists on the class when compiled in,
 * so chrome can disable an export control instead of calling and catching.
 */
declare function isPngExportAvailable(): boolean;
/**
 * Whether the embedded wasm core exposes the proposals api (propose / accept /
 * reject / list). The methods only exist on the class when compiled in, so the
 * UI can hide proposal chrome and degrade gracefully against an older module.
 */
declare function isProposalsAvailable(): boolean;
/**
 * Open a workbook from raw `.xlsx` bytes, initializing the core if needed.
 * Throws an `Error` if the bytes are not a readable workbook.
 */
declare function openWorkbook(bytes: Uint8Array, options?: OpenWorkbookOptions): WorkbookHandle;
/**
 * Exports `.xlsx` bytes as read, initializing the core if needed. Formula results are the
 * stored ones: nothing is recalculated and no clock is read, so the same bytes and options
 * always give the same content. Unreadable bytes and unusable options reject.
 */
declare function exportXlsxStructured(bytes: Uint8Array, options?: XlsxExportOptions): Promise<XlsxStructuredContent>;
/** {@link exportXlsxStructured} rendered as Markdown. */
declare function exportXlsxMarkdown(bytes: Uint8Array, options?: XlsxExportOptions, markdownOptions?: XlsxMarkdownOptions): Promise<XlsxMarkdownContent>;
/** Renders structured content as Markdown; content that does not validate rejects. */
declare function renderXlsxMarkdown(content: XlsxStructuredContent, options?: XlsxMarkdownOptions): Promise<XlsxMarkdownContent>;
/**
 * The crate version string, for asserting wasm/js parity.
 */
declare function wasmVersion(): string;

/** @internal */
type BaseRefusal = 'read-only' | 'stale' | 'superseded' | 'not-ready' | 'busy' | 'disposed' | 'invalid-payload' | 'unsupported' | 'dependency-refused' | 'unknown-outcome';
/** @internal */
type Refusal<F extends string = never> = {
    code: BaseRefusal | F;
    detail?: string;
};
/** @internal */
type Dependency = 'doc' | 'selection' | 'layout';
/** @internal Worker state at the read boundary. */
type At = {
    incarnation: number;
    epoch: number;
    throughSeq: number;
    doc: number;
    selection: number;
    layout: number;
};
/** @internal */
type Read<R, F extends string = never> = {
    ok: true;
    value: R;
    at: At;
} | {
    ok: false;
    refusal: Refusal<F>;
};
declare const queryType: unique symbol;
/** @internal */
type StaleMode = 'answer-at-fence' | {
    readonly reject: readonly Dependency[];
};
/** @internal */
interface QuerySpec<A extends unknown[] = unknown[], R = unknown, F extends string = string> {
    readonly stale: StaleMode;
    readonly refusals: readonly F[];
    readonly [queryType]?: (...args: A) => R;
}
/** @internal */
type QueryTable = Record<string, QuerySpec<any[], any, string>>;
/** @internal */
type QueryFence = {
    session: string;
    incarnation: number;
    epoch: number;
    afterSeq: number;
};
/** @internal */
type QueryReply = Read<unknown, string>;

/** @internal Command with a confirmed basis and a sequence assigned at send time. */
type CommandEnvelope$1<P> = {
    session: string;
    incarnation: number;
    seq: number;
    basis: {
        epoch: number;
        version: number;
    };
    afterSeq?: number;
    expectVersion?: boolean;
    kind: string;
    payload: P;
    inputTime?: number;
    lastInputTime?: number;
    group?: string;
    replay?: true;
};
/** @internal Settled worker outcome for one command sequence. */
type CommandOutcome = {
    seq: number;
    status: 'applied' | 'noop' | 'refused' | 'cancelled' | 'duplicate';
    reason?: string;
    committed?: false;
    affectedSeqs?: number[];
};
/** @internal Full or incremental frame identified by command coverage and revision. */
type FrameEnvelope<F> = {
    coversThroughSeq: number;
    revision: number;
    baseRevision?: number;
    payload: F;
};
/** @internal Acknowledgement with authoritative state and an optional covering frame. */
type CommandAck$1<S, E, F> = {
    session: string;
    incarnation: number;
    epoch: number;
    throughSeq: number;
    version: number;
    outcomes: CommandOutcome[];
    selection?: S;
    editState?: E;
    frame?: FrameEnvelope<F>;
    revisions?: {
        selection: number;
        layout: number;
    };
};
/** @internal Snapshot captured at a settled command boundary. */
type Checkpoint = {
    state: Uint8Array;
    epoch: number;
    version: number;
    throughSeq: number;
};
/** @internal Local outcome; unsent cancellations have no sequence. */
type TicketOutcome = Omit<CommandOutcome, 'seq'> & {
    seq?: number;
};
/** @internal Non-rejecting presentation settlement for tickets and coverage waiters. */
type PresentationStatus = 'presented' | 'dropped';
/** @internal Immediate local identity with a live send-time sequence getter. */
type CommandTicket = {
    readonly id: number;
    readonly seq: number | undefined;
    readonly ack: Promise<TicketOutcome>;
    readonly presented: Promise<PresentationStatus>;
};
/** @internal Main-side command lane, distinct from resident scheduler lanes. */
type CommandLane = 'input' | 'collab' | 'background';
/** @internal Submission metadata, causal ticket dependency, and optional local echo. */
type SubmitOptions<X> = {
    lane?: CommandLane;
    after?: CommandTicket;
    expectVersion?: boolean;
    inputTime?: number;
    lastInputTime?: number;
    group?: string;
    coalesceKey?: string;
    fence?: boolean;
    echo?: X;
};
/** @internal Unsent command accepted by the outbox and coalescing hook. */
type CommandDraft<P, X> = {
    kind: string;
    payload: P;
    options: SubmitOptions<X>;
};
/** @internal Format-owned echo associated with a local ticket and optional sent sequence. */
type EchoEntry<X> = {
    ticket: CommandTicket;
    seq?: number;
    value: X;
};
/** @internal Synchronous painters; present installs, retires, and redraws atomically. */
type EchoHooks<X, F> = {
    paint(pending: readonly EchoEntry<X>[]): void;
    drop(entries: readonly EchoEntry<X>[], reason: string): void;
    present(frame: FrameEnvelope<F>, retired: readonly EchoEntry<X>[], remaining: readonly EchoEntry<X>[]): void | boolean;
};
/** @internal Painter timing within one synchronous submit, acknowledgement, or frame event. */
type EchoOverrunSample = {
    hook: keyof EchoHooks<unknown, unknown>;
    elapsedMs: number;
    eventTotalMs: number;
};
/** @internal Latest confirmed worker state and installed frame coverage. */
type EditSessionState<S, E> = {
    epoch: number;
    version: number;
    throughSeq: number;
    presentedThroughSeq: number;
    selection: S | undefined;
    editState: E | undefined;
};
/** @internal Shared asynchronous editor contract for worker and legacy backends. */
interface EditSession<P, S, E, X> {
    readonly backend: 'worker' | 'legacy-sync' | 'legacy-in-thread';
    readonly state: EditSessionState<S, E>;
    submit(kind: string, payload: P, options?: SubmitOptions<X>): CommandTicket;
    attachEcho?(tickets: readonly CommandTicket[], preview: (draft: CommandDraft<P, X>, originalIntentCount: number) => X | undefined): boolean;
    whenPresented(seq: number): Promise<PresentationStatus>;
    subscribe(listener: (state: EditSessionState<S, E>) => void): () => void;
    flush(): Promise<void>;
    dispose(): Promise<void>;
}
/** @internal Initial acknowledgement and structural subset of the existing RPC client. */
type CommandConnection<P, S, E, F> = {
    initial: CommandAck$1<S, E, F>;
    client: {
        readonly call: {
            edit(envelope: CommandEnvelope$1<P>): Promise<CommandAck$1<S, E, F>>;
            checkpoint(): Promise<Checkpoint>;
            /** @internal Posts queries after all edits previously handed to this connection. */
            query?(fence: QueryFence, kind: string, args: unknown[]): Promise<QueryReply>;
        };
        readonly failure: SessionFailure | undefined;
        onFailure(listener: (failure: SessionFailure) => void): () => void;
        /** @internal Subscribes to frames posted by this connection's worker. */
        onFrame?(listener: (frame: FrameEnvelope<F>) => void): () => void;
        onAck?(listener: (ack: CommandAck$1<S, E, F>) => void): () => void;
        dispose(): Promise<void>;
    };
};
/** @internal Recovery progress, replay divergence, and format history reset signal. */
type RecoveryEvent = {
    phase: 'recovering' | 'recovered' | 'diverged' | 'failed';
    incarnation: number;
    attempt: number;
    diverged: number[];
    historyReset: boolean;
    failure?: SessionFailure;
};
/** @internal Format reopen and checkpoint hooks used by main-side recovery. */
type RecoveryHooks<O, P, S, E, F> = {
    reopen(input: {
        source: O;
        checkpoint?: Checkpoint;
        session: string;
        incarnation: number;
        epoch: number;
        refusedSeqs: readonly number[];
        replayAppliedSeqs: readonly number[];
    }): Promise<CommandConnection<P, S, E, F>>;
    checkpoint?(connection: CommandConnection<P, S, E, F>): Promise<Checkpoint>;
    onRecovery?(event: RecoveryEvent): void;
};
/** @internal Worker-backed session limits, recovery, reconciliation, and injected scheduling. */
type WorkerEditSessionOptions<O, P, S, E, F, X, Q extends QueryTable = {}> = {
    source: O;
    connection: CommandConnection<P, S, E, F>;
    queries?: Q;
    holdTimeoutMs?: number;
    timer?(callback: () => void, ms: number): () => void;
    recovery: RecoveryHooks<O, P, S, E, F>;
    echo?: EchoHooks<X, F>;
    /** @internal Releases rejected frame resources; accepted frames belong to the painter. */
    discardFrame?(frame: FrameEnvelope<F>): void;
    sameCoverageFrames?: boolean;
    /** @internal Commits presentation only after the echo hook accepts it; off by default. */
    transactionalPresentation?: boolean;
    /** @internal Handles echo capacity overflow; defaults to declining new entries. */
    echoOverflow?: 'decline' | 'evict-oldest';
    coalesce?(prev: CommandDraft<P, X>, next: CommandDraft<P, X>): CommandDraft<P, X> | undefined;
    /** @internal Keeps a matching draft queued while the matching command it follows is in flight, so a burst coalesces into one send. */
    holdForCoalescing?(draft: CommandDraft<P, X>): boolean;
    requestFullFrame(connection: CommandConnection<P, S, E, F>): Promise<CommandAck$1<S, E, F>>;
    maxInFlight?: number;
    inputBurstCap?: number;
    maxEchoEntries?: number;
    maxRecoveryAttempts?: number;
    checkpointPolicy?(stats: {
        applied: number;
        bytes: number;
    }): boolean;
    commandBytes?(envelope: CommandEnvelope$1<P>): number;
    /** @internal May share caller data only with a transport that copies before returning. */
    copyCommandForDispatch?(envelope: CommandEnvelope$1<P>): CommandEnvelope$1<P>;
    now?(): number;
    enqueue?(callback: () => void): void;
    onEchoOverrun?(sample: EchoOverrunSample): void;
    onAck?(ack: CommandAck$1<S, E, F>): void;
};

declare const WORKBOOK_REPLAY_MUTATORS: {
    editCell: true;
    editCells: true;
    applyEdits: true;
    applyOps: true;
    propose: true;
    acceptProposal: true;
    rejectProposal: true;
    patchRangeStyle: true;
    setNumberFormat: true;
    applyFormat: true;
    moveChart: true;
    moveRange: true;
    undo: true;
    redo: true;
    setActiveSheet: true;
};
type WorkbookReplayMethod = keyof typeof WORKBOOK_REPLAY_MUTATORS;
type WorkbookReplayOp = {
    [K in WorkbookReplayMethod]: {
        method: K;
        args: Parameters<WorkbookHandle[K]>;
    };
}[WorkbookReplayMethod] & {
    calculation?: WorkbookCalculationContext;
};
interface WorkbookReplayEnvelope {
    sequence: number;
    calculation: WorkbookCalculationContext;
    op: WorkbookReplayOp;
    staleProposal?: {
        cells: string[];
        targets: StaleProposalTarget[];
    };
}
interface WorkbookReplayReply {
    sequence: number;
    revision: number;
    version: number;
    result: ReturnType<WorkbookHandle[WorkbookReplayMethod]>;
}
declare const workbookSessionInternals: WeakMap<WorkbookSession, {
    replay(envelope: WorkbookReplayEnvelope): Promise<WorkbookReplayReply>;
    initialVersion?: string;
    attachPeer?(version: string): Promise<void>;
    detachPeer?(): Promise<void>;
    editPeerAttached: boolean;
    cellInput?(sheet: number, row: number, col: number): Promise<string>;
    initialCalculation?: WorkbookCalculationContext | null;
    preview?(viewport: Viewport, sheet: number, ops: readonly WorkbookReplayOp[]): Promise<WorkbookFrame>;
}>;

interface CommandIdentity {
    session: string;
    incarnation: string;
}
interface CommandBasis {
    epoch: number;
    version: string;
}
interface CommandEnvelope<K extends string, P> extends CommandIdentity {
    seq: number;
    basis: CommandBasis;
    afterSeq?: number;
    kind: K;
    payload: P;
}
interface CommandStatus<R = unknown> {
    seq: number;
    status: 'applied' | 'noop' | 'refused' | 'cancelled';
    reason?: string;
    committed?: boolean;
    affectedSeqs?: number[];
    result?: R;
}
interface CommandAck<S, E, F> {
    throughSeq: number;
    version: string;
    selection?: S;
    editState?: Partial<E>;
    statuses: CommandStatus[];
    frame?: F;
}
interface WorkbookCommandSelection extends XlsxRangeTarget {
    activeCell?: CellPoint;
}
interface WorkbookCommandContext extends CommandIdentity {
    basis: CommandBasis;
}
interface WorkbookIntent {
    inputTime?: number;
    undoGroupId?: string;
    selection?: WorkbookCommandSelection;
}
type CommandArgs<K extends WorkbookReplayMethod> = K extends 'propose' ? [string, string | null, (Parameters<WorkbookHandle['propose']>[2][number] & {
    target?: XlsxRangeTarget;
})[]] : Extract<WorkbookReplayOp, {
    method: K;
}>['args'];
type ReplayPayload<K extends WorkbookReplayMethod> = Extract<WorkbookReplayOp, {
    method: K;
}> extends infer O ? O extends WorkbookReplayOp ? Pick<O, 'calculation'> & {
    args: CommandArgs<K>;
} & WorkbookIntent & {
    target?: XlsxRangeTarget;
} & (K extends 'setActiveSheet' ? {
    expectVersion?: string;
} : {}) : never : never;
type WorkbookCommandKind = WorkbookReplayMethod | 'select' | 'setReadOnly' | 'applyUpdate' | 'collabPipe';
type WorkbookToolbarPayload = {
    id: 'bold' | 'italic' | 'strikethrough' | 'paintFormat' | 'clear' | 'fontFamily' | 'fontSize' | 'fontSizeStep' | 'decimalPlaces' | 'textColor' | 'fillColor' | 'borderColor' | 'numberFormat' | 'borderPreset' | 'borderStyle' | 'merge' | 'horizontalAlignment' | 'verticalAlignment' | 'textWrapping';
    args: unknown;
    target: XlsxRangeTarget;
} | {
    id: 'refreshProposals';
    args: unknown;
    target?: never;
};
type WorkbookCommandPayload<K extends WorkbookCommandKind> = K extends WorkbookReplayMethod ? ReplayPayload<K> | (K extends 'applyOps' ? WorkbookIntent & {
    toolbar: WorkbookToolbarPayload;
} : never) | (K extends 'applyFormat' ? WorkbookIntent & {
    target: XlsxRangeTarget;
    formatToken: string;
} | WorkbookIntent & {
    target: XlsxRangeTarget;
    capturedFrom: XlsxRangeTarget;
} : never) : K extends 'collabPipe' ? PipeCommandPayload<AwarenessCursor> : K extends 'select' ? {
    selection: WorkbookCommandSelection;
} : K extends 'applyUpdate' ? {
    update: Uint8Array;
    updates?: Uint8Array[];
} : {
    readOnly: boolean;
};
interface WorkbookCommandFrameRequest {
    sheet: number;
    viewport: Viewport;
    zoom: number;
    dpr: number;
    generation: number;
    requestGeneration?: number;
}
type WorkbookCommand = {
    [K in WorkbookCommandKind]: CommandEnvelope<K, WorkbookCommandPayload<K>> & {
        frame?: WorkbookCommandFrameRequest;
    };
}[WorkbookCommandKind];
interface WorkbookEditState {
    historyReset?: boolean;
    canUndo: boolean;
    canRedo: boolean;
    formatting: SelectionFormatting;
    formattingAvailable: boolean;
    selectionEditable: boolean;
    mergedRanges: MergedRange[];
    calculation: CalculationStatus;
    sheets: WorkbookSheetSummary[];
    activeSheet: number;
    readOnly: boolean;
}
interface CommandFrameTags extends CommandIdentity {
    coversThroughSeq: number;
    requestGeneration: number;
    zoom: number;
    dpr: number;
}
type WorkbookCommandFrame = WorkbookFrame & CommandFrameTags;
type WorkbookCommandWireFrame = WorkbookWireFrame & CommandFrameTags;
type WorkbookAck = CommandAck<WorkbookCommandSelection, WorkbookEditState, WorkbookCommandFrame>;
type WorkbookWireAck = CommandAck<WorkbookCommandSelection, WorkbookEditState, WorkbookCommandWireFrame> & {
    shared?: WorkbookSharedWireAck;
};
interface WorkbookEditPayload {
    payload: WorkbookCommand['payload'];
    frame?: WorkbookCommandFrameRequest;
    compatibility?: WorkbookCommand;
    dispatchOrder?: number;
}
type WorkbookSharedCommand = CommandEnvelope$1<WorkbookEditPayload>;
type WorkbookSharedOutcome = CommandOutcome & {
    workbook?: CommandStatus;
};
type WorkbookSharedAck<F = WorkbookCommandFrame> = Omit<CommandAck$1<WorkbookCommandSelection, Partial<WorkbookEditState>, F>, 'outcomes'> & {
    engineVersion: string;
    outcomes: WorkbookSharedOutcome[];
    compatibility?: CommandAck<WorkbookCommandSelection, WorkbookEditState, F>;
};
type WorkbookSharedWireAck = WorkbookSharedAck<WorkbookCommandWireFrame>;
type WorkbookEditConnection = Omit<CommandConnection<WorkbookEditPayload, WorkbookCommandSelection, Partial<WorkbookEditState>, WorkbookCommandFrame>, 'initial' | 'client'> & {
    initial: WorkbookSharedAck;
    client: Omit<CommandConnection<WorkbookEditPayload, WorkbookCommandSelection, Partial<WorkbookEditState>, WorkbookCommandFrame>['client'], 'call'> & {
        call: {
            edit(command: WorkbookSharedCommand): Promise<WorkbookSharedAck>;
            checkpoint(): Promise<Checkpoint>;
        };
    };
};
type WorkbookEditFrame = FrameEnvelope<WorkbookCommandFrame>;
type WorkbookTicketOutcome = TicketOutcome & {
    workbook?: CommandStatus;
};
type WorkbookCommandTicket = Omit<CommandTicket, 'ack'> & {
    readonly ack: Promise<WorkbookTicketOutcome>;
};
type WorkbookSubmitOptions<X = unknown> = SubmitOptions<X>;
type WorkbookEchoHooks<X = unknown> = EchoHooks<X, WorkbookCommandFrame>;

/** @experimental */
declare class WorkbookPngUnavailableError extends Error {
    readonly code = "png-unavailable";
    constructor();
}
type WorkbookCheckpoint = Checkpoint & {
    encodeMs?: number;
};
/** @experimental Unzoomed sheet pixels. */
type WorkbookSheetView = Pick<SheetInfo, 'contentWidth' | 'contentHeight' | 'frozenRows' | 'frozenCols' | 'initialScrollX' | 'initialScrollY'> & {
    sheet: number;
    version: string;
    frozenWidth: number;
    frozenHeight: number;
};
/** @experimental Absolute sheet rect and freeze-relative scroll position, in unzoomed pixels. */
interface WorkbookCellGeometry {
    sheet: number;
    version: string;
    rect: Rect;
    scrollPosition: CellPosition;
}
/** @experimental Row-major editable cell text. */
interface WorkbookCellInputs {
    sheet: number;
    version: string;
    cells: CellEdit[][];
}
/** @experimental */
interface WorkbookFrameOptions {
    sheet?: number;
}
/** @experimental */
interface WorkbookFrame {
    displayList: DisplayList;
    version: string;
    epoch: number;
    sequence: number;
    sheet: number;
    viewport: Viewport;
    mergedRanges?: MergedRange[];
}
/** @experimental */
type WorkbookWireFrame = Omit<WorkbookFrame, 'displayList'> & {
    displayList: ArrayBuffer;
};
/**
 * Structured-cloneable workbook open options.
 * @experimental
 */
interface WorkbookSessionOpenOptions extends OpenWorkbookOptions {
    wasm?: ArrayBuffer | WebAssembly.Module;
    initialViewport?: WorkbookInitialPaintRequest;
    includeEditState?: boolean;
    initialUpdate?: Uint8Array;
    /** @internal */
    recoveryVersion?: string;
}
/** @experimental */
interface WorkbookInitialPaintRequest {
    sheet?: number;
    width: number;
    height: number;
    zoom: number;
    dpr: number;
    requestGeneration: number;
}
/** @experimental */
interface WorkbookInitialPaint<F = WorkbookCommandFrame> {
    sheetView: WorkbookSheetView;
    frame: F;
    editState: WorkbookEditState;
}
/** @experimental */
type WorkbookSessionOpenReply = WorkbookSessionState & {
    pngExport?: boolean;
    clientId?: number;
    throughSeq?: number;
    revision?: number;
    historyReset?: boolean;
    initialPaint?: WorkbookInitialPaint<WorkbookCommandWireFrame>;
    editState?: WorkbookEditState;
    selection?: WorkbookCommandSelection;
};
/**
 * Sheet metadata; indices are zero-based.
 * @experimental
 */
interface WorkbookSheetSummary {
    id: string;
    index: number;
    name: string;
}
/**
 * Workbook projection; version counts applied batches.
 * @experimental
 */
type WorkbookSessionState = Omit<SessionState, 'stage'> & {
    format: 'xlsx';
    stage: 'preview' | 'ready' | 'failed';
    sheets: WorkbookSheetSummary[];
    activeSheet: number;
    commandContext?: WorkbookCommandContext;
};
/**
 * Workbook change notifications after applied batches.
 * @experimental
 */
interface WorkbookSessionEvents {
    changed: {
        version: number;
        dirty: boolean;
    };
    collaborationUpdate: {
        update: Uint8Array;
        origin: CollaborationUpdateOrigin;
    };
}
/**
 * Workbook RPC methods; engine version tokens remain strings.
 * @experimental
 */
type WorkbookSessionMethods = {
    open(bytes: ArrayBuffer, options?: WorkbookSessionOpenOptions): WorkbookSessionOpenReply;
    openRecovery(checkpoint: Checkpoint, options?: Pick<WorkbookSessionOpenOptions, 'wasm'>): WorkbookSessionOpenReply;
    version(): string;
    collaborationStateVector(): Uint8Array;
    collaborationStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    listDefinedNames(request?: XlsxDefinedNamesRequest): XlsxDefinedNamesResult;
    readCells(request: XlsxReadRequest): XlsxReadResult;
    findText(request: XlsxFindRequest): XlsxFindResult;
    validateEdits(request: XlsxEditRequest): XlsxValidationResult;
    applyEdits(request: XlsxEditRequest): XlsxEditResult;
    command(command: WorkbookCommand): WorkbookWireAck;
    edit(command: WorkbookSharedCommand): WorkbookSharedWireAck;
    checkpoint(preserveHistory?: boolean): WorkbookCheckpoint;
    commandFrame(request?: WorkbookCommandFrameRequest): FrameEnvelope<WorkbookCommandWireFrame> | undefined;
    frame(viewport: Viewport, options?: WorkbookFrameOptions): WorkbookWireFrame;
    sheetView(sheet: number): WorkbookSheetView;
    cellGeometry(sheet: number, row: number, col: number): WorkbookCellGeometry;
    cellInputs(sheet: number, range: string): WorkbookCellInputs;
    selectionData(sheet: number, row: number, col: number, direction?: Direction | 'usedRange' | 'rowEnd' | 'merge'): SelectionData;
    captureFormat(sheet: number, range: string): CapturedFormat;
    sheets(): WorkbookSheetSummary[];
    calculationStatus(): CalculationStatus;
    renderPng(viewport: Viewport, options?: WorkbookFrameOptions): ArrayBuffer;
    renderRangePng(options?: {
        range?: string;
        scale?: number;
    }, frameOptions?: WorkbookFrameOptions): ArrayBuffer;
    exportStructured(options?: XlsxExportOptions): XlsxExportResult<XlsxStructuredContent>;
    exportMarkdown(options?: XlsxExportOptions, markdownOptions?: XlsxMarkdownOptions): XlsxExportResult<XlsxMarkdownContent>;
    printDisplayList(sheet: number, range: string, metrics: PrintMetrics, gridlines: boolean): ArrayBuffer;
    save(): ArrayBuffer;
    dispose(): void;
};

type SessionOptions<X> = WorkerEditSessionOptions<unknown, WorkbookEditPayload, WorkbookCommandSelection, Partial<WorkbookEditState>, WorkbookCommandFrame, X>;
interface WorkbookEditSession<X = unknown> extends EditSession<WorkbookEditPayload, WorkbookCommandSelection, Partial<WorkbookEditState>, X> {
    readonly engineVersion: string;
    readonly failure: SessionFailure | undefined;
    readonly presentationRevision: number | undefined;
    submit(kind: string, payload: WorkbookEditPayload, options?: WorkbookSubmitOptions<X>): WorkbookCommandTicket;
    command(input: WorkbookCommand): Promise<WorkbookAck>;
    runAfterEdits<T>(call: () => Promise<T>): Promise<T>;
    onAck(listener: (ack: WorkbookAck) => void): () => void;
    onFailure(listener: (failure: SessionFailure) => void): () => void;
    bindPresenter(echo: EchoHooks<X, WorkbookCommandFrame>): () => void;
    present(frame: FrameEnvelope<WorkbookCommandFrame>): void;
    markPresented(frame: Pick<WorkbookCommandFrame, 'session' | 'incarnation' | 'coversThroughSeq'> & Partial<WorkbookCommandFrame>): boolean;
}
declare function createWorkbookEditSession<X = unknown>(options: Omit<SessionOptions<X>, 'connection' | 'source' | 'recovery' | 'maxRecoveryAttempts' | 'transactionalPresentation' | 'echoOverflow' | 'sameCoverageFrames'> & {
    connection: WorkbookEditConnection;
    identity?: CommandIdentity;
    source?: unknown;
    recovery?: RecoveryHooks<unknown, WorkbookEditPayload, WorkbookCommandSelection, Partial<WorkbookEditState>, WorkbookCommandFrame>;
    onAdmit?(command: WorkbookSharedCommand): void;
    normalizePayload?(payload: WorkbookCommand['payload']): WorkbookCommand['payload'];
}): WorkbookEditSession<X>;

/**
 * Options for opening a workbook in a dedicated worker.
 * @experimental
 */
interface OpenWorkbookSessionOptions extends OpenWorkbookOptions {
    worker?: () => Worker;
    wasm?: ArrayBuffer | WebAssembly.Module;
    /** Retain source bytes and a compiled module for edit peer hydration. */
    retainPeerHydration?: boolean;
    /** Aborting closes the session worker while the open is still in flight. */
    signal?: AbortSignal;
    initialViewport?: WorkbookSessionOpenOptions['initialViewport'];
    includeEditState?: boolean;
    initialUpdate?: Uint8Array;
}
/**
 * Async workbook access and its current local projection.
 * @experimental
 */
interface WorkbookSession {
    readonly pngExport?: boolean;
    readonly replica?: AsyncReplicaAdapter;
    bindCollaboration?(apply: (update: Uint8Array) => Promise<unknown>, applyChunks?: (updates: Uint8Array[]) => Promise<unknown>, applyPipe?: (payload: PipeCommandPayload<AwarenessCursor>) => Promise<unknown>): () => void;
    readonly state: WorkbookSessionState;
    readonly initialPaint?: WorkbookInitialPaint;
    readonly commandIdentity: CommandIdentity;
    readonly confirmedBasis: CommandBasis;
    readonly throughSeq: number;
    readonly presentedThroughSeq: number;
    readonly editState: Readonly<Partial<WorkbookEditState>>;
    readonly selection: WorkbookCommandSelection | undefined;
    readonly editSession?: WorkbookEditSession;
    submit(command: WorkbookCommand): Promise<CommandStatus>;
    onAck(listener: (ack: WorkbookAck) => void): () => void;
    markPresented(frame: WorkbookCommandFrame | Pick<WorkbookCommandFrame, 'session' | 'incarnation' | 'coversThroughSeq'>): boolean;
    whenPresented(seq: number): Promise<void>;
    readonly call: Promisified<Omit<WorkbookSessionMethods, 'open' | 'openRecovery' | 'dispose' | 'frame' | 'command' | 'edit' | 'checkpoint' | 'commandFrame' | 'renderPng' | 'renderRangePng' | 'printDisplayList'>> & {
        renderPng(viewport: Viewport, options?: WorkbookFrameOptions): Promise<Uint8Array>;
        renderRangePng(options?: {
            range?: string;
            scale?: number;
        }, frameOptions?: WorkbookFrameOptions): Promise<Uint8Array>;
        printDisplayList(...args: Parameters<WorkbookHandle['printDisplayList']>): Promise<ReturnType<WorkbookHandle['printDisplayList']>>;
        command(command: WorkbookCommand): Promise<WorkbookAck>;
        /**
         * @experimental A newer `frame` call replaces a queued one, which rejects with an error
         * named `SessionSuperseded`.
         */
        frame(viewport: Viewport, options?: WorkbookFrameOptions): Promise<WorkbookFrame>;
    };
    save(): Promise<Uint8Array>;
    on<K extends keyof WorkbookSessionEvents>(name: K, listener: (payload: WorkbookSessionEvents[K]) => void): () => void;
    onFailure(listener: (failure: SessionFailure) => void): () => void;
    readonly failure: SessionFailure | undefined;
    dispose(): Promise<void>;
}
/** @internal */
declare function hydratePeer(session: WorkbookSession): Promise<WorkbookHandle>;
/**
 * Opens a worker session, transferring copies so caller buffers stay usable.
 * @experimental
 */
declare function openWorkbookSession(bytes: Uint8Array | ArrayBuffer, options?: OpenWorkbookSessionOptions): Promise<WorkbookSession>;

/** @experimental */
declare class WorkbookRecoveryReplayError extends Error {
    readonly seq: number;
    readonly reason: string;
    readonly code = "workbook-recovery-refused";
    constructor(seq: number, reason: string);
}
/** @experimental */
interface WorkbookSessionRecovery {
    readonly throughSeq: number;
    readonly retainedCommands: number;
    readonly checkpointIdleMs: number;
    capture(allowed: () => boolean): Promise<boolean>;
    save(assertCurrent: () => void, pending?: readonly Pick<WorkbookCommand, 'kind' | 'payload'>[]): Promise<Uint8Array>;
}
/** @experimental */
declare const workbookSessionRecovery: WeakMap<WorkbookSession, WorkbookSessionRecovery>;

type WorkbookPeerHydrationErrorCode = 'mutation-outside-replay' | 'version-mismatch' | 'missing-hydration' | 'missing-module';
declare class WorkbookPeerHydrationError extends Error {
    readonly code: WorkbookPeerHydrationErrorCode;
    readonly refusal: {
        code: WorkbookPeerHydrationErrorCode;
    };
    constructor(code: WorkbookPeerHydrationErrorCode, message: string);
}

interface WorkbookEditPeerOptions {
    session: WorkbookSession;
    peer: WorkbookHandle;
    now?(): number;
    randomSeed?(): number;
    onError?(error: Error): void;
}
type WorkbookEditPeer = Pick<WorkbookHandle, WorkbookReplayMethod> & {
    readonly state: 'ready' | 'failed';
    readonly error: Error | undefined;
    readonly acknowledgedSequence: number;
    readonly sentSequence: number;
    flush(): Promise<void>;
    save(): Promise<ArrayBuffer>;
    recoverySave(): {
        bytes: ArrayBuffer;
        recovery: true;
    };
    dispose(): void;
};
declare class WorkbookEditPeerFailedError extends Error {
    readonly failure: Error;
    constructor(failure: Error);
}
/** @internal */
declare function createWorkbookEditPeer(options: WorkbookEditPeerOptions): WorkbookEditPeer;

export { type TextWrapping as $, type ExportSeverity as A, type BorderPatch as B, type CalculationStatus as C, type DifferentialFormatInput as D, type EditProfile as E, type HorizontalAlignment as F, type MergedRange as G, type HistoryState as H, type NumberFormatMutation as I, type OpenWorkbookSessionOptions as J, type OperationFailure as K, type OperationRefusal as L, type MarkdownAnchor as M, type NumberFormat as N, type OpenWorkbookOptions as O, type PrintMetrics as P, type ProfiledDisplayList as Q, type ProfiledEditResult as R, type Proposal as S, type ProposalCell as T, type ProposalEdit as U, type RangeStylePatch as V, type SelectionFormatting as W, type SheetInfo as X, StaleProposalError as Y, type StaleProposalTarget as Z, type StyleProperty as _, type BorderPreset as a, type XlsxExportOptions as a$, type ValidationSuccess as a0, type VerticalAlignment as a1, type Viewport as a2, type WasmInitInput as a3, type WorkbookCalculationContext as a4, type WorkbookCellGeometry as a5, type WorkbookCellInputs as a6, WorkbookEditPeerFailedError as a7, type WorkbookEditSession as a8, type WorkbookFrame as a9, type XlsxCellValue as aA, type XlsxDefinedName as aB, type XlsxDefinedNameOp as aC, type XlsxDefinedNamesRequest as aD, type XlsxDefinedNamesResult as aE, type XlsxEditCalculation as aF, type XlsxEditFailure as aG, type XlsxEditFailureCode as aH, type XlsxEditHistory as aI, type XlsxEditOperation as aJ, type XlsxEditPreview as aK, type XlsxEditReceipt as aL, type XlsxEditRefusal as aM, type XlsxEditRequest as aN, type XlsxEditResult as aO, type XlsxEditSource as aP, type XlsxEditStep as aQ, type XlsxErrorValue as aR, type XlsxExportCell as aS, type XlsxExportDefinedName as aT, type XlsxExportDiagnostic as aU, type XlsxExportDiagnosticCode as aV, type XlsxExportFailure as aW, type XlsxExportFailureCode as aX, type XlsxExportHyperlink as aY, type XlsxExportMerge as aZ, type XlsxExportObject as a_, type WorkbookFrameOptions as aa, type WorkbookHandle as ab, type WorkbookHyperlink as ac, type WorkbookInitialPaint as ad, type WorkbookInitialPaintRequest as ae, WorkbookPeerHydrationError as af, WorkbookPngUnavailableError as ag, WorkbookRecoveryReplayError as ah, type WorkbookSession as ai, type WorkbookSessionEvents as aj, type WorkbookSessionMethods as ak, type WorkbookSessionOpenOptions as al, type WorkbookSessionOpenReply as am, type WorkbookSessionRecovery as an, type WorkbookSessionState as ao, type WorkbookSheetSummary as ap, type WorkbookSheetView as aq, type WorkbookUpdateInfo as ar, type WorkbookUpdateListener as as, type WorkbookUpdateOrigin as at, type XlsxAnchor as au, type XlsxAutoFilterOp as av, type XlsxCellAddress as aw, type XlsxCellGuard as ax, type XlsxCellPosition as ay, type XlsxCellRead as az, type BorderStyle as b, type WorkbookSharedOutcome as b$, type XlsxExportResult as b0, type XlsxExportScope as b1, type XlsxExportSheet as b2, type XlsxExportTable as b3, type XlsxExportValue as b4, type XlsxFindMatch as b5, type XlsxFindRequest as b6, type XlsxFindResult as b7, type XlsxFormulaResult as b8, type XlsxMarkdownContent as b9, renderXlsxMarkdown as bA, wasmVersion as bB, workbookSessionRecovery as bC, type WorkbookReplayReply as bD, type WorkbookEditPeer as bE, type WorkbookReplayMethod as bF, type WorkbookReplayOp as bG, type CommandBasis as bH, type CommandIdentity as bI, type CommandStatus as bJ, type WorkbookAck as bK, type WorkbookCommand as bL, type WorkbookCommandContext as bM, type WorkbookCommandFrame as bN, type WorkbookCommandFrameRequest as bO, type WorkbookCommandKind as bP, type WorkbookCommandPayload as bQ, type WorkbookCommandSelection as bR, type WorkbookCommandTicket as bS, type WorkbookEchoHooks as bT, type WorkbookEditConnection as bU, type WorkbookEditFrame as bV, type WorkbookEditPayload as bW, type WorkbookEditPeerOptions as bX, type WorkbookEditState as bY, type WorkbookSharedAck as bZ, type WorkbookSharedCommand as b_, type XlsxMarkdownOptions as ba, type XlsxObjectKind as bb, type XlsxRangeAddress as bc, type XlsxRangeRead as bd, type XlsxRangeTarget as be, type XlsxReadCalculation as bf, type XlsxReadRequest as bg, type XlsxReadResult as bh, type XlsxSheetEntry as bi, type XlsxSheetIdentity as bj, type XlsxSheetVisibility as bk, type XlsxSourcePart as bl, type XlsxStructuredContent as bm, type XlsxTextMatch as bn, type XlsxTextSearchOptions as bo, type XlsxValidationResult as bp, createWorkbookEditSession as bq, exportXlsxMarkdown as br, exportXlsxStructured as bs, getDisplayListCellLimit as bt, initWasm as bu, isPngExportAvailable as bv, isProposalsAvailable as bw, isWasmAvailable as bx, openWorkbook as by, openWorkbookSession as bz, type CapturedBorderEdge as c, type WorkbookSharedWireAck as c0, type WorkbookSubmitOptions as c1, type WorkbookTicketOutcome as c2, createWorkbookEditPeer as c3, hydratePeer as c4, workbookSessionInternals as c5, type CapturedBorderStyle as d, type CapturedCellFormat as e, type CapturedColor as f, type CapturedFill as g, type CapturedFormat as h, type CellEdit as i, type CellInputEdit as j, type CellPoint as k, type CellPosition as l, type ChartEdit as m, type ChartInfo as n, type ChartMutation as o, type ChartSeriesInfo as p, type ChartSeriesName as q, type ConditionalFormatInfo as r, type ConditionalFormatOp as s, type ConditionalFormatRuleInput as t, type DisplayListProfile as u, DisplayTooLargeError as v, type EditResult as w, type EditSuccess as x, type ExportCompletion as y, type ExportDiagnostic as z };
