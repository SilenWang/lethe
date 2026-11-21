import { S as Selection, C as CellAddr, m as SelectionLimits, d as Direction, M as MoveOpts, a as CellRange, K as KeyInput, k as SelectionData, l as SelectionHidden, n as SelectionMerges, j as SelectionAction, f as GridMeta, R as Rect, c as ChartRegion, D as DisplayList, H as HyperlinkRegion } from './types-DdoEoFSX.js';
export { b as ChartA11yAttrs, e as DrawCmd, F as FillRectCmd, G as GeometryPathCommand, L as LineCmd, P as PathCmd, g as PathStroke, h as PatternFillCmd, i as PatternType, T as TextAlign, o as TextCmd } from './types-DdoEoFSX.js';

/**
 * Pure viewport types shared by the accessibility grid and canvas painter.
 */
/**
 * Cumulative pixel offsets for a track axis (columns or rows). `offsets[i]` is
 * the leading edge of track `i`; `offsets.length === trackCount + 1`, so the
 * last element is the total extent. Frozen tracks are the first `frozen` of
 * these — they are pinned and always visible.
 */
type TrackOffsets = number[];
/**
 * Scroll + geometry state driving virtualization. `scrollX/scrollY` are in
 * content pixels of the scrollable (non-frozen) region; `width/height` is the
 * visible viewport in css pixels; `dpr` scales to device pixels at paint time.
 */
interface ViewportState {
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
    dpr: number;
    frozenRows: number;
    frozenCols: number;
}
/**
 * An inclusive track index range. `last < first` (e.g. `{ first: 0, last: -1 }`)
 * denotes an empty range.
 */
interface VisibleRange {
    first: number;
    last: number;
}
/**
 * The visible track window on both axes, frozen tracks excluded (they always
 * render). Feed to the renderer to build the display list for a frame.
 */
interface VisibleCells {
    cols: VisibleRange;
    rows: VisibleRange;
}

/**
 * Pure viewport math: visible-range computation against cumulative track
 * offsets, and scroll clamping. No DOM, no side effects — every function is a
 * deterministic transform of plain numbers so it is golden-testable.
 */

/**
 * Number of tracks described by an offsets array.
 */
declare function trackCount(offsets: TrackOffsets): number;
/**
 * Total pixel extent of a track axis (position of the trailing edge).
 */
declare function totalExtent(offsets: TrackOffsets): number;
/**
 * The inclusive range of scrollable (non-frozen) tracks intersecting the
 * viewport. `frozen` tracks at the head are pinned and excluded here — the
 * scrollable window starts after them and is shortened by their pinned width.
 */
declare function visibleRange(offsets: TrackOffsets, frozen: number, scroll: number, viewportExtent: number): VisibleRange;
/**
 * Visible column and row ranges for a frame, frozen tracks excluded.
 */
declare function visibleCells(state: ViewportState, colOffsets: TrackOffsets, rowOffsets: TrackOffsets): VisibleCells;
/**
 * Clamp a viewport's scroll offsets into the valid range for the given content.
 * Returns the same state when already in range, a corrected copy otherwise.
 */
declare function clampScroll(state: ViewportState, colOffsets: TrackOffsets, rowOffsets: TrackOffsets): ViewportState;
/**
 * Build a uniform offsets array of `count` tracks each `size` px wide.
 */
declare function uniformOffsets(count: number, size: number): TrackOffsets;

/**
 * Selection model: pure transforms over {@link Selection} data. Every function
 * returns a fresh value and never mutates its input, so state lives with the
 * chrome and this layer stays a deterministic reducer core.
 */

/**
 * A collapsed selection at a single cell.
 */
declare function selectionAt(addr: CellAddr): Selection;
/**
 * The explicit bounds or normalized rectangle spanned by the endpoints.
 */
declare function normalizeRange(sel: Selection): CellRange;
/**
 * Whether a cell falls inside a selection's normalized range.
 */
declare function rangeContains(sel: Selection, addr: CellAddr): boolean;
/**
 * Number of cells covered by a selection.
 */
declare function cellCount(sel: Selection): number;
/**
 * Extend the selection to a new focus, holding the anchor fixed (shift-click /
 * shift-arrow semantics). The address is clamped into the grid when limits pass.
 */
declare function extendTo(sel: Selection, addr: CellAddr, limits?: SelectionLimits): Selection;
/**
 * Move the focus one (or `step`) cells in a direction. When `extend` is set the
 * anchor holds and the range grows; otherwise the whole selection collapses onto
 * the new focus. The result is clamped to the grid bounds in `opts.limits`. A
 * merged area counts as one cell: the move starts from its far edge, and a
 * collapsed selection that lands inside one lands on its anchor.
 */
declare function moveFocus(sel: Selection, direction: Direction, opts: MoveOpts): Selection;

/**
 * Keyboard reducer: maps a keystroke over the current selection to a
 * declarative {@link SelectionAction}. Pure — it neither mutates state nor
 * touches the DOM; the chrome owns the keydown listener and interprets the
 * action. Excel navigation semantics, with two deliberate choices documented at
 * the F2/Enter handlers below.
 */

/**
 * Reduce a keystroke to a selection action against the current selection and
 * grid limits. Returns `{ type: 'none' }` for keys this layer does not own so
 * the chrome can fall through to its own handling.
 */
declare function selectionKeyReducer(state: Selection, key: KeyInput, limits: SelectionLimits, data?: SelectionData, hidden?: SelectionHidden, merges?: SelectionMerges): SelectionAction;

/**
 * Pure hit-testing over a frame's {@link GridMeta}: map a viewport-local point
 * to a cell, and map cells/ranges back to their pixel rects for overlay
 * placement. Binary search over the boundary offsets; DOM-free so click
 * handling and the selection overlay share one geometry source with the painter.
 */

/**
 * The topmost chart whose visible region contains a viewport-local point, or
 * `null`. Mirrors `chart_at_point` in crates/xlsx-render/src/hit.rs: regions are
 * in paint order so the last match wins, and the clipped region bounds the hit,
 * so a chart scrolled under a frozen pane is not hit where it is hidden.
 *
 * Every coordinate is rounded to f32 first. The regions arrive as f32 off the
 * wire, and the engine compares against `clip.x + clip.w` computed in f32; the
 * same sum in f64 lands on the other side of the edge at reachable coordinates.
 */
declare function chartRegionAtPoint(charts: readonly ChartRegion[] | undefined, x: number, y: number): ChartRegion | null;
/**
 * The cell under a viewport-local point, or `null` when the point is outside the
 * visible grid (or the frame carries no grid metadata).
 */
declare function cellAtPoint(grid: GridMeta | undefined, x: number, y: number): CellAddr | null;
/**
 * The pixel rect of a single cell in viewport-local coordinates, or `null` when
 * the cell is not within the visible window.
 */
declare function cellRect(grid: GridMeta | undefined, row: number, col: number): Rect | null;
/**
 * The pixel rect covering the visible part of a cell range, clipped to the
 * window. `null` when the range lies entirely outside the visible grid — so the
 * selection overlay is hidden rather than mispainted when scrolled away.
 */
declare function rangeRect(grid: GridMeta | undefined, range: CellRange): Rect | null;

interface HyperlinkDestination {
    sheetName: string;
    row: number;
    col: number;
}
declare function hyperlinkAtCell(displayList: DisplayList, row: number, col: number): HyperlinkRegion | null;
declare function safeExternalHyperlink(link: HyperlinkRegion): string | null;
declare function parseHyperlinkLocation(location: string, currentSheet: string): HyperlinkDestination | null;

/**
 * Pure TSV codec for clipboard interchange, in the Excel dialect (tab-separated
 * fields, CRLF rows, `"`-quoted fields with doubled embedded quotes). No DOM —
 * the chrome hands the system clipboard the string this produces and feeds paste
 * text back through {@link fromTsv}.
 *
 * Security: a foreign spreadsheet treats
 * a pasted cell as a formula when its text leads with `=`, `+`, `-`, `@`, or a
 * control char that can break the field. We defang such *text* with a leading
 * single quote so it pastes literally — but we export our own real formulas
 * (`isFormula`) verbatim, because faithfully round-tripping a `=SUM(...)` the
 * user actually wrote is the point, and it is our value, not attacker text.
 */
/**
 * One source cell as the wasm range read returns it: the raw entered `input`
 * (a `=...` string when `isFormula`) plus whether the model holds it as a
 * formula.
 */
interface CellInput {
    input: string;
    isFormula: boolean;
}
/**
 * Serialize a row-major grid of cells to a TSV string for the system clipboard,
 * defanging formula-looking text (see the module security note) while exporting
 * genuine formulas as-is.
 */
declare function toTsv(cells: CellInput[][]): string;
/**
 * Parse clipboard TSV back into a row-major grid of raw strings. Handles the
 * Excel dialect: `"`-quoted fields with doubled quotes and embedded tabs/
 * newlines, CRLF or LF rows, and a single trailing newline (which does not add
 * an empty row). The formula-injection guard quote is left in place — it is part
 * of the literal text a defanged cell round-trips to.
 */
declare function fromTsv(text: string): string[][];

/**
 * Pure a11y types: a serializable mirror of the visible grid the chrome renders
 * as an offscreen `role="grid"` for screen readers. Plain data only — the
 * builder takes label templates as a param rather than importing i18n, so this
 * seam stays dependency-free.
 */
/**
 * Label templates the builder interpolates. Field names mirror the `a11y` keys
 * in the framework adapter so a caller can pass localized strings through.
 * Placeholders: `{address}`, `{value}`, `{row}`, `{column}`.
 */
interface A11yStrings {
    gridLabel: string;
    cellLabel: string;
    cellLabelSelected: string;
    emptyCellLabel: string;
    emptyCellLabelSelected: string;
    rowHeaderLabel: string;
    columnHeaderLabel: string;
}
/**
 * One mirrored cell: its address, display text, selection state, and the fully
 * interpolated aria label (e.g. `"B2, 42, selected"`).
 */
interface A11yCell {
    row: number;
    col: number;
    address: string;
    text: string;
    selected: boolean;
    label: string;
}
/**
 * A column header: the letter (`"A"`) and its aria label (`"Column A"`).
 */
interface A11yColumnHeader {
    col: number;
    text: string;
    label: string;
}
/**
 * One mirrored row: its 1-based header label and the cells left-to-right.
 */
interface A11yRow {
    row: number;
    header: string;
    cells: A11yCell[];
}
interface A11yChart {
    label: string;
    /** the chart could not be drawn; a neutral box occupies its rect instead. */
    placeholder: boolean;
}
/**
 * The full offscreen grid mirror for the current frame.
 */
interface A11yGrid {
    label: string;
    sheetName: string;
    columnHeaders: A11yColumnHeader[];
    rows: A11yRow[];
    charts: A11yChart[];
}

/**
 * Pure a11y grid builder: turns a display list plus the current selection into a
 * serializable {@link A11yGrid} the chrome renders offscreen for screen readers.
 * Cell text is recovered from the frame's clipped text commands, keyed by cell
 * box origin; geometry and addresses come from the frame's grid metadata. No
 * DOM, no i18n import — label templates arrive as a param.
 */

/**
 * Build the offscreen grid mirror for a frame. Returns an empty grid (no rows)
 * when the frame carries no grid metadata, so the chrome can render nothing
 * rather than guess geometry.
 */
declare function buildA11yGrid(displayList: DisplayList, selection: Selection | null, sheetName: string, t: A11yStrings): A11yGrid;

export { type A11yCell, type A11yChart, type A11yColumnHeader, type A11yGrid, type A11yRow, type A11yStrings, CellAddr, type CellInput, CellRange, ChartRegion, Direction, DisplayList, GridMeta, type HyperlinkDestination, HyperlinkRegion, KeyInput, MoveOpts, Rect, Selection, SelectionAction, SelectionData, SelectionHidden, SelectionLimits, SelectionMerges, type TrackOffsets, type ViewportState, type VisibleCells, type VisibleRange, buildA11yGrid, cellAtPoint, cellCount, cellRect, chartRegionAtPoint, clampScroll, extendTo, fromTsv, hyperlinkAtCell, moveFocus, normalizeRange, parseHyperlinkLocation, rangeContains, rangeRect, safeExternalHyperlink, selectionAt, selectionKeyReducer, toTsv, totalExtent, trackCount, uniformOffsets, visibleCells, visibleRange };
