import { W as WasmAsyncInput } from './loadWasmAsset-Cr95TImt.mjs';

/**
 * Loader for the docx-layout wasm (the Rust display-list builder and the
 * ooxml-text measure surface). External-asset pattern — see ./loadWasmAsset.ts
 * for the init contract and URL-geometry invariant.
 *
 * IMPORTANT: reach this module only via dynamic `import()` — its consumers are
 * the canvas renderer and the Rust measurement source, and those dynamic-import
 * seams await {@link preloadLayoutWasm} before first use.
 *
 * Requires a CSP that permits wasm compilation (`wasm-unsafe-eval`).
 */

/** Load + instantiate the layout wasm (browser path). Idempotent. */
declare function preloadLayoutWasm(input?: WasmAsyncInput): Promise<void>;
/**
 * Region-aware hit test over a display list: page-local point in,
 * `{"region":"body"|"header"|"footer","rId"?,"pos":n|null,"target":"text"|"image"|"none"}`
 * (or `"null"` for an out-of-range page) JSON out. Header/footer hits identify
 * the HF doc by `rId`; their `pos` refers to that doc, not the body doc.
 * `target` is what sits under the point, which is what a pointer cursor needs.
 */
declare function hitTestRegionsJson(displayList: string, pageIndex: number, x: number, y: number): string;
/**
 * Highlight rects for a body document range over a display list: JSON array of
 * `{pageIndex, x, y, width, height}` in page-local px. Body-only — HF doc
 * positions live in different docs and are never consulted.
 */
declare function rangeRectsJson(displayList: string, from: number, to: number): string;
/** @internal */
declare function rangeRectsOnPagesJson(displayList: string, from: number, to: number, firstPage: number, lastPage: number): string;
/**
 * True when the embedded layout wasm carries the session-handle query exports.
 * Callers gate the handle path on this and otherwise use the JSON-arg exports.
 */
declare function hasDisplayListSession(): boolean;
/** @internal */
declare function hasRangeRectsOnPages(): boolean;
/**
 * True when the embedded layout wasm carries the region-aware range-rect
 * exports (`range_rects_region_json` and its by-handle twin). Callers gate
 * header/footer selection and caret geometry on this and otherwise return
 * `[]`; probing avoids invoking — and so dropping the session handle over — an
 * absent export.
 */
declare function hasRangeRectsRegion(): boolean;
/**
 * Parse a display list once and return the handle the by-handle queries reuse.
 * The caller owns it and must `closeDisplayList` it. Throws when the export is
 * absent or the JSON is malformed; the query facade catches that and stays on
 * the JSON-arg path.
 */
declare function openDisplayList(displayList: string): number;
/** Drop a display-list handle so its parsed list is freed. No-op when the export is absent. */
declare function closeDisplayList(handle: number): void;
/**
 * Apply a page-delta update to a stored display list, re-parsing only its
 * changed pages. Throws when the export is absent or the update is
 * inconsistent — the Rust side closes the handle on failure, so the facade's
 * fallback (a fresh `openDisplayList`) is always safe.
 */
declare function updateDisplayList(handle: number, update: string): void;
/** True when the embedded layout wasm carries the page-delta update export. */
declare function hasDisplayListUpdate(): boolean;
/**
 * Region-aware hit test against a stored display list (by handle). Throws when
 * the export is absent or the handle is unknown/closed — the facade catches it
 * and falls back to `hitTestRegionsJson`.
 */
declare function hitTestRegionsByHandle(handle: number, pageIndex: number, x: number, y: number): string;
/**
 * Closest caret position on the adjacent visual line: `{"position","goalX"}`
 * JSON, or `"null"` when there is no line in that direction. `goalX` is the
 * page-local x the caret holds across successive moves.
 */
declare function verticalMoveJson(displayList: string, position: number, direction: 'up' | 'down', goalX: number): string;
/** Resolve the closest caret position on the adjacent visual line by handle. */
declare function verticalMoveByHandle(handle: number, position: number, direction: 'up' | 'down', goalX: number): string;
/**
 * Highlight rects for a body document range against a stored display list (by handle).
 * Throws when the export is absent or the handle is unknown/closed.
 */
declare function rangeRectsByHandle(handle: number, from: number, to: number): string;
/** @internal */
declare function rangeRectsOnPagesByHandle(handle: number, from: number, to: number, firstPage: number, lastPage: number): string;
/**
 * Region-aware highlight rects: `region` is `"body" | "header" | "footer"`,
 * and `rId` scopes a header/footer to one part (empty string for body, or to
 * match any). `from`/`to` are positions in THAT region's document. Throws when
 * the export is absent, so the facade falls back to `[]`.
 */
declare function rangeRectsRegionJson(displayList: string, region: string, rId: string, from: number, to: number): string;
/**
 * Region-aware highlight rects against a stored display list (by handle). Throws
 * when the export is absent or the handle is unknown/closed.
 */
declare function rangeRectsRegionByHandle(handle: number, region: string, rId: string, from: number, to: number): string;
/** `{ measured, options, layout }` JSON in, `DisplayList` JSON out. Throws on inputs the Rust builder rejects. */
declare function buildDisplayListJson(input: string): string;
/**
 * Pagination: `{ measured, options }` JSON in (the golden-fixture envelope),
 * `Layout` JSON out. Throws for inputs the Rust layout kernel rejects — the
 * layout pipeline surfaces the error and keeps the previous committed
 * layout; there is no fallback engine.
 */
declare function layoutDocumentJson(input: string): string;
/**
 * Register raw sfnt bytes with the measurement FontStore; returns the font id
 * that `measureParagraphJson` inputs reference in their `fontChains`. Throws
 * on malformed bytes (embedded fonts are attacker-controlled — the engine
 * rejects unparseable input at this boundary).
 */
declare function registerMeasureFont(bytes: Uint8Array): number;
/**
 * Register a measurement view of `base` carrying the vertical metrics and
 * advance pitch Word measures `family` with — for a face the host
 * substituted. Returns `base` unchanged for a family whose metrics the engine
 * does not know.
 */
declare function registerSubstituteMeasureFont(base: number, family: string): number;
/** Drop every registered measurement font (ids restart at 0). Callers must re-register before the next `measureParagraphJson`. */
declare function clearMeasureFonts(): void;
/**
 * Measurement input JSON in, `ParagraphExtent` JSON out. Throws with a
 * message starting `"UNSUPPORTED"` for blocks the Rust engine cannot measure
 * yet — the caller must fall back to browser measurement for that block.
 */
declare function measureParagraphJson(input: string): string;
/**
 * Glyph outline for `(fontId, glyphId)` as JSON:
 * `{"upem":2048,"cmds":[{"t":"M",…},{"t":"L",…},{"t":"Q",…},{"t":"C",…},{"t":"Z"}]}`
 * — commands in font units, y-up per the font convention. `fontId` is a
 * measurement FontStore id from {@link registerMeasureFont}, `glyphId` a glyph
 * index from shaping. Throws when the export is absent or the glyph cannot be
 * extracted; the canvas backend catches that and paints the run via
 * `fillText`, so text is never invisible.
 */
declare function outlineGlyphJson(fontId: number, glyphId: number): string;

export { buildDisplayListJson, clearMeasureFonts, closeDisplayList, hasDisplayListSession, hasDisplayListUpdate, hasRangeRectsOnPages, hasRangeRectsRegion, hitTestRegionsByHandle, hitTestRegionsJson, layoutDocumentJson, measureParagraphJson, openDisplayList, outlineGlyphJson, preloadLayoutWasm, rangeRectsByHandle, rangeRectsJson, rangeRectsOnPagesByHandle, rangeRectsOnPagesJson, rangeRectsRegionByHandle, rangeRectsRegionJson, registerMeasureFont, registerSubstituteMeasureFont, updateDisplayList, verticalMoveByHandle, verticalMoveJson };
