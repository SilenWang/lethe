import { c as DisplayPage, G as GlyphRunPrimitive, L as LinePrimitive, T as TextRunPrimitive, d as DisplayPrimitive, e as DisplayList, a as DisplayListQueries, f as DisplayListRegionHit, D as DisplayListRect } from '../../displayListQueries-6XjS7B5e.mjs';
export { g as DecodedFrameDelta, h as DecorationPrimitive, i as DisplayBounds, j as DisplayListBuildInputs, b as DisplayListHeadersFooters, k as DisplayListHfVariant, l as DisplayListHitRegion, m as DisplayListHoverTarget, n as DisplayListImageGeometry, o as DisplayListImageRegion, p as DisplayListParagraphGeometry, q as DisplayListPictureWatermark, r as DisplayListQuerySourceState, s as DisplayListTextWatermark, t as DisplayListVerticalMove, u as DisplayListVisualLine, v as DisplayListWatermark, w as DocAttrs, F as FRAME_DELTA_HEADER_BYTES, x as FRAME_DELTA_PAGE_OP_BYTES, y as FRAME_DELTA_VERSION, z as FrameDeltaError, A as FrameDeltaErrorCode, B as FramePageOperation, H as HfRegion, I as ImagePrimitive, C as LocatedImagePrimitive, P as PositionedGlyph, R as RectPrimitive, E as ResidentDisplayListQueryEngine, J as RetainedFrame, K as RetainedFramePage, M as RustDisplayFrameResult, N as RustDisplayListEngine, O as RustDisplayListQueryEngine, Q as RustDisplayListSourceError, S as RustDisplayListSourceErrorStage, U as TableCellRef, V as VisualLineExtent, W as applyFrameDelta, X as applyFrameDeltaOwned, Y as buildRustDisplayFrame, Z as buildRustDisplayList, _ as captureInlinePositionEmuFromDisplayList, $ as createDisplayListQueries, a0 as decodeFrameDelta, a1 as decodeFrameDeltaSteps, a2 as displayPageIsShiftOf, a3 as displayPageNoteAnchorRevision, a4 as displayPageRevision, a5 as encodeDisplayListFrameExtras, a6 as endDisplayListQueriesLine, a7 as findImagePrimitiveAtPoint, a8 as findImagePrimitiveByDocPos, a9 as isDisplayListQuerySourceDead, aa as loadRustDisplayListQueryEngine, ab as loadedRustDisplayListQueryEngine, ac as onDisplayListQuerySourceFailure } from '../../displayListQueries-6XjS7B5e.mjs';
import { aC as YrsSidebarDisplayPoint, Y as YrsSession, aD as YrsRevisionInfo, aE as YrsSidebarProjection } from '../../index-DGvJBf34.mjs';
export { aF as YrsStorySegmentSource, aG as createYrsSidebarProjection, aH as yrsIdToNumericId } from '../../index-DGvJBf34.mjs';
import { TrackedChangeEntry } from '../../utils/comments.mjs';
import '../../formatting-p5MneNuy.mjs';
import '../../content-DVT06V_6.mjs';
import '../../docx/wrapTypes.mjs';
import '../../types-bvPg3KsF.mjs';
import '../pagination/index.mjs';
import '../../pagedExport-Bi89gMk0.mjs';
import '../../types/document.mjs';
import '../../styles-DZZz2oRy.mjs';
import '../../plugin-api/index.mjs';
import '../../utils/findReplace.mjs';
import '../../utils/stylePreview.mjs';
import '../../loadWasmAsset-Cr95TImt.mjs';
import '../../rezip-CfwAYdV4.mjs';

/** a cached glyph: its outline path (font units) plus the font's units-per-em. */
interface GlyphOutline {
    /**
     * the glyph contours as a Path2D in font units, or `null` when the glyph has
     * no visible contours (space/whitespace) — the backend skips null paths.
     */
    path: Path2D | null;
    /** the font's units-per-em; the backend scales the path by `size`/upem. */
    upem: number;
}
/** fetch a glyph's outline as JSON — `outlineGlyphJson` in production, a fake in tests. */
type GlyphOutlineProvider = (fontId: number, glyphId: number) => string;
interface GlyphCacheOptions {
    /** outline source; throws/invalid JSON propagate to the caller (fallback). */
    provider: GlyphOutlineProvider;
    /** max cached glyphs before LRU eviction (default 4096). */
    maxEntries?: number;
    /**
     * Path2D factory — injectable so tests (and non-DOM environments) can supply
     * a recording double. Defaults to the browser `Path2D` constructor.
     */
    createPath?: () => Path2D;
}
/**
 * LRU cache keyed `(fontId, glyphId)` → `GlyphOutline`. `Map` preserves
 * insertion order, so the oldest key is `keys().next()` and touching an entry
 * is delete-then-set (reinsert at the tail).
 */
declare class GlyphCache {
    private readonly provider;
    private readonly maxEntries;
    private readonly createPath;
    private readonly entries;
    constructor(options: GlyphCacheOptions);
    /** number of cached glyphs (for tests / eviction assertions). */
    get size(): number;
    /**
     * Outline for one glyph, building and caching it on first request. Throws if
     * the provider throws or returns unparseable JSON — the caller falls back.
     */
    get(fontId: number, glyphId: number): GlyphOutline;
    private build;
}

/**
 * Lazy accessor for the embedded wasm glyph-outline provider — the production
 * source a canvas host feeds to {@link GlyphCache}.
 *
 * Reached through the SAME dynamic `import('../wasm/index')` specifier the
 * display-list builder (`buildRustDisplayList`) and the measure engine
 * (`getRustTextEngine`) use, so all three resolve to ONE wasm module instance —
 * i.e. one measurement `FontStore`. That shared identity is load-bearing:
 * `outlineGlyphJson(fontId, glyphId)` must read glyph outlines from the very
 * store `registerMeasureFont` populated during measurement, otherwise the ids
 * in a GlyphRun would resolve against an empty store and every glyph would
 * rasterize as `.notdef`. Keeping the import dynamic also keeps the ~800KB
 * inlined wasm out of the default bundle (see `layout/wasm/index.ts`).
 *
 */

/**
 * Resolve the wasm-backed {@link GlyphOutlineProvider} (`outlineGlyphJson`).
 * The returned function is synchronous and initializes the wasm instance on
 * first call; it throws when the embedded module lacks the `outline_glyph_json`
 * export, which the canvas backend catches and repaints the run via `fillText`
 * so text is never invisible. Shares the module promise with the display-list
 * builder, so on the canvas path the wasm is already resolved by the time the
 * first display list lands.
 */
declare function loadGlyphOutlineProvider(): Promise<GlyphOutlineProvider>;

/** Builds an accessible display-list mirror with DOM APIs only. */

declare const MIRROR_CLASS_NAMES: {
    page: string;
    content: string;
    header: string;
    footer: string;
    block: string;
    table: string;
    tableRow: string;
    tableCell: string;
    text: string;
    rect: string;
    image: string;
    shape: string;
    chart: string;
    decoration: string;
    line: string;
    pageBorder: string;
    tableCut: string;
    blockSdt: string;
    inlineSdtWidget: string;
    revisionPmark: string;
    revisionPmarkGlyph: string;
    revisionPmarkIns: string;
    revisionPmarkDel: string;
    listMarker: string;
    revisionTable: string;
    revisionRow: string;
    revisionCell: string;
    revisionIns: string;
    revisionDel: string;
    revisionMerge: string;
    notes: string;
    note: string;
    noteBacklink: string;
};
/**
 * screen-reader labels for the mirror's structural wrappers. all strings are
 * user-facing — hosts pass localized values (React adapter: `t('a11y.*')`);
 * core deliberately ships no English defaults so no locale bypasses i18n.
 */
interface MirrorLabels {
    /** page container label, e.g. "Page 3" */
    page?: string;
    /** header band label, e.g. "Page header" */
    header?: string;
    /** footer band label, e.g. "Page footer" */
    footer?: string;
    /**
     * note→reference backlink label, e.g. "Back to reference". Optional: without
     * it the backlink anchor falls back to the note's own label (a number, not
     * hardcoded English), so no locale bypasses i18n.
     */
    noteBacklink?: string;
}
interface BuildMirrorPageOptions {
    /** document to create elements in (default: global document) */
    document?: Document;
    /** localized aria-labels for page/header/footer wrappers */
    labels?: MirrorLabels;
}
/** Whether `buildMirrorPage(page)` holds a table header cell, which cells on other pages may name. */
declare function mirrorPageHasHeaderCells(page: DisplayPage): boolean;
/** Whether `buildMirrorPage(page)` holds a link Tab stops at. */
declare function mirrorPageHasTabStops(page: DisplayPage): boolean;
/**
 * Reduces a `buildMirrorPage` tree, in place, to its links, its notes (the
 * targets of note references), its header cells (which cells on any page may
 * name) and the elements that label what stays. What stays inside a table
 * cell keeps the whole outermost cell, so the cell keeps its accessible name.
 * Every other element and text goes; the ancestors of what stays keep their
 * attributes, so the ids, order, positions and table semantics that remain
 * are the full mirror's.
 */
declare function reduceMirrorToLinks(mirror: HTMLElement): HTMLElement;
/** `buildMirrorPage(page)` reduced to its links: see `reduceMirrorToLinks`. */
declare function buildMirrorPageLinks(page: DisplayPage, options?: BuildMirrorPageOptions): HTMLElement;
/**
 * Reduces a `buildMirrorPage` tree, in place, to what a screen reader reads:
 * everything `reduceMirrorToLinks` keeps, unchanged, plus the text of every
 * other run as plain text inside its paragraph, table and region wrappers,
 * and images with an accessible name. Wrappers that hold no kept element lose
 * their ids and data attributes, so painter-contract queries never match them.
 */
declare function reduceMirrorToText(mirror: HTMLElement): HTMLElement;
/** `buildMirrorPage(page)` reduced to readable text: see `reduceMirrorToText`. */
declare function buildMirrorPageText(page: DisplayPage, options?: BuildMirrorPageOptions): HTMLElement;
/** Whether `page`'s mirror holds the note or note reference with element id `id`. */
declare function displayPageHoldsMirrorId(page: DisplayPage, id: string): boolean;
/**
 * build the mirror DOM for one display page: an invisible (opacity 0,
 * pointer-events none) absolutely-positioned tree whose elements sit at the
 * exact page-local coordinates of their display primitives, carry the painter
 * dataset contract, and expose real text nodes in reading order for
 * accessibility. primitives sharing a blockId group under one block wrapper
 * (role=paragraph, or role=table with row/cell structure when primitives
 * carry `cell` grid coordinates) stamped with the union of the children's doc
 * range; blockless primitives (table borders, separators) attach directly to
 * `.layout-page-content`.
 *
 * header/footer regions mirror the painter's structural classes: each HfRegion
 * becomes a `.layout-page-header` / `.layout-page-footer` wrapper at the band's
 * page-local y, and all of the region's primitives (including their block
 * wrappers and doc-range attrs, which refer to the HF doc identified by
 * `data-hf-rid`) stay scoped inside it — never under `.layout-page-content`.
 *
 * data-from-line/to-line ride on paragraph fragment primitives (body, HF, text
 * box) and land on the paragraph wrapper; data-vmerge-continuation comes from
 * the cell's `continuation` flag and lands on the ARIA cell. still not derivable
 * from the v0 display list and therefore not emitted: data-carried-from-prev/
 * to-next.
 */
declare function buildMirrorPage(page: DisplayPage, options?: BuildMirrorPageOptions): HTMLElement;
/**
 * Brings `mirror`, a `buildMirrorPage` tree, up to date with `page` in place,
 * exactly as `buildMirrorPage(page, options)` would build it. Blocks whose
 * content is unchanged keep their elements; when only their document
 * positions moved, those attributes shift in place. Returns false, changing
 * nothing, when `mirror` is not a tree it can update.
 */
declare function updateMirrorPage(mirror: HTMLElement, page: DisplayPage, options?: BuildMirrorPageOptions): boolean;

/** Renderer-neutral page-local geometry for display-list primitives. */

interface GeoRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** Parse the px size from a CSS font shorthand, with Word's 11pt default. */
declare function fontSizePxFromShorthand(font: string): number;
/** Canonical page-local box for a text-run primitive. */
declare function textRunRect(p: Pick<TextRunPrimitive, 'x' | 'baselineY' | 'width' | 'font'>): GeoRect;
/** Canonical page-local box for a shaped glyph-run primitive. */
declare function glyphRunRect(p: Pick<GlyphRunPrimitive, 'glyphs' | 'size'>): GeoRect;
/** Canonical stroke-expanded page-local box for a line primitive. */
declare function lineRect(p: Pick<LinePrimitive, 'x1' | 'y1' | 'x2' | 'y2' | 'strokeWidth'>): GeoRect;

/**
 * Framework-neutral interactive overlay for canvas-rendered content controls.
 *
 * The accessibility mirror must remain invisible and pointer-inert. This module
 * therefore derives a separate, visible DOM layer from the same display-list
 * metadata. React and Vue mount the returned element above a canvas page and
 * keep their existing delegated `.layout-sdt-widget` / repeat handlers.
 *
 * Security: every DOCX-derived string is assigned through `textContent`,
 * `dataset`, or `setAttribute`; no HTML strings are parsed.
 */

interface InteractiveOverlayLabels {
    /** Accessible name for a repeating-section add button. */
    addRepeatingItem?: string;
    /** Accessible name for a repeating-section remove button. */
    removeRepeatingItem?: string;
    /** Accessible name used when a control has no authored alias or tag. */
    control?: string;
}
interface BuildInteractiveOverlayOptions {
    /** Document used to create elements (default: global `document`). */
    document?: Document;
    /** Host-localized button names. */
    labels?: InteractiveOverlayLabels;
}
/** Apply content-control focus to the interactive overlay boxes. */
declare function applyInteractiveSdtFocus(root: ParentNode, focusedGroupIds: ReadonlySet<string>): void;
/**
 * Build the visible/pointer-active overlay for one page.
 *
 * Coordinates remain page-local CSS pixels. The caller applies the same zoom
 * transform as the canvas and mirror. Boundary boxes themselves never receive
 * pointer events; only real buttons are interactive/focusable.
 */
declare function buildInteractiveOverlayPage(page: DisplayPage, options?: BuildInteractiveOverlayOptions): HTMLElement;
/** Whether `buildInteractiveOverlayPage(page)` holds a control Tab stops at. */
declare function interactiveOverlayHasTabStops(page: DisplayPage): boolean;

/**
 * Resolves an image relationship id to a drawable source. Media decode stays
 * in the host (browser decoders, object URLs, ImageBitmap caches) — the
 * backend only replays the resolved source at the primitive's rect. Return
 * null (or resolve to null) to skip the image.
 */
type ImageResolver = (relId: string) => CanvasImageSource | Promise<CanvasImageSource | null> | null;
interface DrawPageOptions {
    resolveImage?: ImageResolver;
    /** Glyph cache; unresolved outlines fall back to `fillText`. */
    glyphCache?: GlyphCache;
    /** The CSS family each document font family paints browser text with, where they differ. */
    fontFamilies?: ReadonlyMap<string, string>;
}
/**
 * Minimal structural view of a canvas element for DPR sizing. Matches
 * HTMLCanvasElement without requiring one, so hosts and tests can pass
 * lookalikes.
 */
interface PageCanvasLike {
    width: number;
    height: number;
    style: {
        width: string;
        height: string;
    };
}
type PageCanvasBuffer = HTMLCanvasElement | OffscreenCanvas;
/**
 * Raster a page or damage band into a detached backing surface. Callers can prepare
 * every damaged page concurrently, then present the finished buffers in one
 * synchronous pass without ever exposing the renderer's initial clear.
 */
declare function rasterizeDisplayPageToBackBuffer(canvas: PageCanvasBuffer, page: DisplayPage, options?: DrawPageOptions, devicePixelRatio?: number, zoom?: number, 
/** Device-pixel crop; its pixels equal the corresponding full-page raster. */
clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
}): Promise<PageCanvasBuffer>;
/** Atomically replace one visible canvas with a fully rastered page buffer. */
declare function presentDisplayPageBackBuffer(canvas: PageCanvasBuffer, buffer: PageCanvasBuffer, page: DisplayPage, zoom?: number): void;
/** Zero-copy atomic presentation for a worker-owned transferred canvas. */
declare function presentOffscreenPageBackBuffer(canvas: OffscreenCanvas, buffer: OffscreenCanvas): void;
/**
 * DPR- and zoom-aware canvas sizing: the bitmap is the page's logical px size
 * times `devicePixelRatio * zoom`, the CSS box is the page size times `zoom`
 * (so the page physically grows with the zoom control, mirroring the DOM
 * painter's `transform: scale`), and the context is scaled by the same factor
 * so all drawing keeps using page-local px coordinates. Rastering at
 * `zoom * DPR` — rather than CSS-scaling a `zoom=1` bitmap — is what keeps text
 * and vector outlines crisp when zoomed: glyph `Path2D` fills re-rasterize at
 * the higher backing resolution instead of being upsampled. `zoom` defaults to
 * 1, so the un-zoomed path is byte-identical to before.
 *
 * Setting canvas.width resets the context state, so call this before drawing
 * (and re-call after any resize/zoom change) — the scale applies to the fresh
 * transform.
 */
declare function sizeCanvasForPage(canvas: PageCanvasLike, ctx: CanvasRenderingContext2D, page: Pick<DisplayPage, 'width' | 'height'>, devicePixelRatio: number, zoom?: number): void;
/** Raster every display page without requiring a mounted renderer surface. */
declare function rasterizeDisplayListPages(list: DisplayList, options?: DrawPageOptions, devicePixelRatio?: number): Promise<HTMLCanvasElement[]>;
/** Replays watermark, header/footer, body and note layers. */
declare function drawDisplayPage(ctx: CanvasRenderingContext2D, page: DisplayPage, options?: DrawPageOptions): Promise<void>;
/** Replays a single primitive; exported for hosts that paint incrementally. */
declare function drawPrimitive(ctx: CanvasRenderingContext2D, primitive: DisplayPrimitive, options?: DrawPageOptions): Promise<void>;
/** Paints one glyph run synchronously, exactly as page rasterization does. */
declare function drawGlyphRunPrimitive(ctx: CanvasRenderingContext2D, primitive: GlyphRunPrimitive, options?: DrawPageOptions): void;

/** Shared vertical geometry for canvas page hosts. */

/** vertical gap between canvas pages (flex `gap`) */
declare const CANVAS_PAGE_GAP_PX = 16;
/** padding around the canvas pages column */
declare const CANVAS_PAGES_PADDING_PX = 24;
/**
 * Top Y of each canvas page inside the `.canvas-pages` host, derived from the
 * display list's own page heights. `tops[i] + pageLocalY` converts a
 * display-list rect into host coordinates.
 */
declare function canvasPageTops(queries: DisplayListQueries): number[];

/**
 * Client-coordinate → display-list resolution for the canvas renderer's
 * pointer path. Framework-free: both the React and the Vue adapter route
 * their pointer events through this resolver.
 *
 * The pointer hooks map the client point onto one of the
 * `<canvas data-page-index>` pages, convert it to page-local px (the
 * display list's unit space), and ask the Rust `hit_test_regions` query for
 * the region + doc position.
 *
 */

interface CanvasPointHit {
    pageIndex: number;
    /** page-local px, the display list's unit space */
    x: number;
    y: number;
    /** region-aware hit from the Rust query (null when the engine isn't ready) */
    hit: DisplayListRegionHit | null;
}
interface DisplayPageHostOptions {
    /** Vertical space between page shells when the host has no live canvases. */
    pageGap?: number;
    /** Space before the first page when the host has no live canvases. */
    paddingTop?: number;
}
interface DisplayPageClientRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
/**
 * The CSS `zoom` `element` renders at, its ancestors' included. Client rects
 * carry it; layout sizes and an element's scroll offsets do not. Where
 * `currentCSSZoom` is unavailable, zoom set inside a closed shadow tree the
 * element is slotted through cannot be read and is left out.
 */
declare function effectiveZoom(element: Element): number;
/**
 * The page canvases a renderer mounts under its pages host, so page lookups
 * read them instead of searching a subtree that also holds every page's
 * accessibility mirror. A renderer adds each `<canvas data-page-index>` it
 * mounts, deletes it on unmount, invalidates the registry whenever it may have
 * moved or renumbered them, and binds the registry to the host with
 * {@link bindDisplayPageRegistry}.
 */
declare class DisplayPageRegistry {
    private readonly canvases;
    private ordered;
    private byIndex;
    private materializer;
    /**
     * Lets a renderer that keeps page DOM only near the viewport build the
     * DOM of other pages when something needs it; see {@link materializeDisplayPages}.
     */
    setMaterializer(materializer: ((pageIndices: readonly number[]) => void) | null): void;
    /** Builds the DOM of `pageIndices` now, where the renderer keeps it only for some pages. */
    materialize(pageIndices: readonly number[]): void;
    add(canvas: HTMLCanvasElement): void;
    delete(canvas: HTMLCanvasElement): void;
    /** Forgets the order and indices read so far, after the renderer moved or renumbered canvases. */
    invalidate(): void;
    /** The registered canvases in document order. */
    all(): HTMLCanvasElement[];
    /** The first canvas in document order that shows `pageIndex`. */
    canvas(pageIndex: number): HTMLCanvasElement | null;
    private indexPages;
}
/** Binds `registry` to the pages `host` it renders into, or unbinds it with null. */
declare function bindDisplayPageRegistry(host: HTMLElement, registry: DisplayPageRegistry | null): void;
/** Builds the accessibility DOM of `pageIndices` under `host` before a DOM query reads it. */
declare function materializeDisplayPages(host: HTMLElement, pageIndices: readonly number[]): void;
/** The first `<canvas data-page-index>` under `host` for `pageIndex`. */
declare function displayPageCanvas(host: HTMLElement, pageIndex: number): HTMLCanvasElement | null;
/** The canvas page elements inside a pages host, in document order. */
declare function displayPageCanvases(host: HTMLElement): HTMLCanvasElement[];
/** Resolves a display-list page rectangle from canvas or DOM page hosts. */
declare function resolveDisplayPageClientRect(host: HTMLElement, queries: DisplayListQueries, pageIndex: number, options?: DisplayPageHostOptions): DisplayPageClientRect | null;
/**
 * Resolve a client point against the canvas pages.
 *
 * Containment picks the page; with `clampToNearestPage` (drag-selection) a
 * point outside every page snaps to the vertically nearest one and clamps
 * into its bounds, so drags keep extending past page edges — the analogue of
 * the DOM path's nearest-span snapping. Coordinates convert through the
 * page's CSS rect vs its display-list size, so any ancestor scale transform
 * is factored out.
 */
declare function resolveCanvasPoint(host: HTMLElement, queries: DisplayListQueries, clientX: number, clientY: number, options?: {
    clampToNearestPage?: boolean;
    pageGap?: number;
    paddingTop?: number;
}): CanvasPointHit | null;

/**
 * Image resolver for the canvas replay backend, shared by both adapters.
 *
 * v0 display lists carry the flow-block image `src` as the primitive's
 * relId — for embedded media that is a blob:/data: URL minted by the parser,
 * or a `media:{n}` token naming the package part, whose bytes `media` reads.
 * Shape picture fills resolve through the same gate via
 * `fillPaint.pictureSrc`. Only those sources are decoded; anything else
 * (notably remote http urls from external-mode relationships, or a raw
 * unresolved `rId`) resolves to null so opening a document never triggers a
 * network fetch (the no-zero-click-external-fetch security contract). A token
 * whose part this session cannot read paints a grey box. Decode
 * results are cached per source so repaints reuse decoded images.
 *
 */

interface CanvasImageResolverOptions {
    /** The bytes and media type of a `media:{n}` source, or null. */
    media?: (token: string) => {
        bytes: Uint8Array;
        mimeType: string;
    } | null;
    /** Identifies the package `media` reads; a new value decodes tokens anew. */
    mediaScope?: () => number;
    /** Maximum cached decoded bytes; defaults to 64 MiB. */
    maxCacheBytes?: number;
}
declare function createCanvasImageResolver(options?: CanvasImageResolverOptions): ImageResolver;

/**
 * Selection → live-region announcement derivation for the canvas renderer's
 * accessibility layer. Framework-free: the React `CanvasA11yLiveRegion` and
 * the Vue `CanvasA11yLiveRegion.vue` both derive their announcements here so
 * assistive-tech behavior cannot drift between adapters.
 *
 * The hidden textarea stays the focused editing surface in canvas mode, so
 * character/word echo while the caret moves comes from native input. The live
 * region only announces state *transitions* the visual layer would otherwise
 * communicate silently: a selection appearing or collapsing, the caret
 * entering commented / tracked-change / list content. Edge-triggered on the
 * selection context, so plain typing and uniform caret movement stay silent.
 *
 */
interface A11ySelectionContext {
    hasSelection: boolean;
    inInsertion: boolean;
    inDeletion: boolean;
    inList: boolean;
    listLevel?: number;
    activeCommentIds: number[];
}
/** The slice of selection context the announcer reacts to. */
interface A11ySelectionSnapshot {
    hasSelection: boolean;
    inInsertion: boolean;
    inDeletion: boolean;
    hasComment: boolean;
    inList: boolean;
    listLevel: number;
    /** display name of the active comment thread's author, when the host knows it */
    commentAuthor?: string;
    /** reply count of the active comment thread, when the host knows it */
    commentReplyCount?: number;
}
/**
 * host-supplied details of the comment thread(s) under the caret, resolved
 * from the same parsed comment model the sidebar uses. All strings are
 * file-derived — the live region renders them as text, never markup.
 */
interface A11yCommentThreadDetails {
    authorName?: string;
    replyCount?: number;
}
declare function snapshotFromSelectionContext(ctx: A11ySelectionContext, 
/** optional lookup so the `commentedText` announcement can carry author/reply vars */
lookupCommentThread?: (commentIds: number[]) => A11yCommentThreadDetails | undefined): A11ySelectionSnapshot;
/** i18n key under `a11y.*` plus interpolation vars */
interface A11yAnnouncement {
    key: 'selected' | 'selectionCleared' | 'commentedText' | 'trackedInsertion' | 'trackedDeletion' | 'listItem';
    vars?: Record<string, string | number>;
}
/**
 * announcements for one selection-state transition, in speaking order.
 * `prev === null` (first observation) announces nothing — there is no
 * transition to describe.
 */
declare function computeA11yAnnouncements(prev: A11ySelectionSnapshot | null, next: A11ySelectionSnapshot): A11yAnnouncement[];

/**
 * Comment / tracked-change anchor derivation over the display list, shared
 * by both adapters' sidebar plumbing on the canvas-renderer path.
 *
 * `visitAnchorKeys` walks the document and reports every comment /
 * tracked-change anchor as `(key, pos)` — shared between each adapter's
 * layout-math derivation (DOM painter path) and the display-list derivation
 * here, so both register identical keys in identical order.
 *
 */

/** Structural view shape used only by the legacy display-list anchor walker. */
interface AnchorEditorView {
    readonly state: {
        readonly doc: {
            descendants(callback: (node: any, pos: number) => boolean | void): void;
        };
        readonly schema: {
            readonly marks: Record<string, any>;
        };
    };
}
/**
 * Walk the document and report every comment / tracked-change anchor as
 * `(key, pos)`. `register` is called once per occurrence; callers dedupe.
 */
declare function visitAnchorKeys(pmView: AnchorEditorView, register: (key: string, pos: number) => void): void;
/**
 * Display-list anchor derivation: anchor Ys come from Rust `range_rects`
 * queries over the display list (page-local px) plus the canvas page stack
 * math, instead of layout-fragment scans in the DOM viewport's coordinate
 * space. Returns `.canvas-pages`-host Y offsets keyed by
 * `comment-{id}` / `revision-{revisionId}`.
 */
declare function computeAnchorPositionsFromDisplayList(pmView: AnchorEditorView | null, queries: DisplayListQueries, projectY?: (rect: DisplayListRect) => number | null): Map<string, number>;
interface YrsHeaderFooterRegions {
    get(rId: string): 'header' | 'footer' | undefined;
}
/**
 * yrs-authoritative sidebar anchors. Comment coverage comes from sticky yrs
 * side-map positions and tracked-change anchors come from `listRevisions()`;
 * neither path reads an `AnchorEditorView` or its document.
 */
declare function computeAnchorPositionsFromYrs(session: YrsSession, commentIds: Iterable<string | number>, revisions: readonly YrsRevisionInfo[], projection: YrsSidebarProjection, queries: DisplayListQueries, hfRegions?: YrsHeaderFooterRegions, projectY?: (rect: DisplayListRect) => number | null): Map<string, number>;
declare function anchorPositionsFromPoints(points: Iterable<readonly [key: string, point: YrsSidebarDisplayPoint | null]>, queries: DisplayListQueries, hfRegions?: YrsHeaderFooterRegions, projectY?: (rect: DisplayListRect) => number | null): Map<string, number>;
interface DisplayListHfAnchorSource {
    region: 'header' | 'footer';
    rId: string;
    view: AnchorEditorView;
}
/** Merge header/footer comment and revision anchors into an existing map. */
declare function mergeHfAnchorPositionsFromDisplayList(sources: Iterable<DisplayListHfAnchorSource>, queries: DisplayListQueries, positions: Map<string, number>, projectY?: (rect: DisplayListRect) => number | null): Map<string, number>;

/** Tracked-change sidebar data derived from the authoritative Yrs session. */
interface TrackedChangesResult {
    entries: TrackedChangeEntry[];
    commentToRevision: Map<number, number>;
}
/** Project Yrs revisions onto the display-position sidebar contract. */
declare function extractTrackedChangesFromYrs(revisions: readonly YrsRevisionInfo[], projection: YrsSidebarProjection): TrackedChangesResult;

/**
 * Derive table-resize handle geometry from a built DisplayList.
 *
 * On the canvas path the DOM painter's `.layout-table-*-handle` elements are
 * parked/hidden, so the canvas table-resize overlay must place its column / row
 * / edge handles from the display list instead. This module walks the list and
 * returns, per painted table fragment, the geometry an adapter needs to mount
 * handles over the visible canvas:
 *
 *  - `originX` / `originY` — the fragment's page-local top-left. `originX` is
 *    taken from an EXACT edge source (an outer vertical table-border line)
 *    whenever one exists, so column handles land on the true column boundary
 *    rather than inset by cell padding. Only a fully borderless table falls back
 *    to the content bbox minus an estimated inset (documented, approximate).
 *  - `bottomY` — the fragment's bottom edge (exact when a bottom border exists,
 *    else content bbox bottom).
 *  - `rowBands` — per anchor-row content band `{ rowIndex, top, bottom }`,
 *    grouped by the `cell.row` carried on every in-cell primitive. Row-boundary
 *    handles sit in the gap between consecutive bands, and the `rowIndex` maps
 *    straight to `commitRowResize` (robust to vmerge, which suppresses interior
 *    border lines but keeps the anchor row on every primitive).
 *  - `tableKey` — the caller-supplied identity of the enclosing table; also the
 *    handle key the adapter resolves back to the table node.
 *
 * Grouping key: cell content primitives carry each cell-paragraph's block id,
 * NOT the table's, so grouping by block id would split a table into one fragment
 * per cell. The adapter therefore supplies `tableKeyOf`, mapping an in-cell doc
 * position to a stable per-table key (in the React adapter: the enclosing table
 * node's `before` position, resolved against the live doc). Primitives whose
 * position doesn't resolve to a table are skipped.
 *
 * Column-boundary x's and the right edge are intentionally NOT computed here:
 * they come from the doc's `columnWidths` (twips) anchored at `originX`,
 * which is exact and robust to horizontally-merged cells (colspan suppresses
 * the interior border line the display list would otherwise expose).
 *
 * Body region only. The HF caret + selection on canvas are now sourced from the
 * region-aware `hfRangeRects` / `hfCaretRects` queries (see
 * `CanvasPartSelectionOverlay`), but HF *table* resize handles remain a documented
 * gap: this walker takes `page.primitives` (body), and the overlay's
 * `tableKeyOf` / commit path resolves against the body doc. Closing it needs
 * (1) an optional region parameter here to walk `page.header|footer.primitives`,
 * (2) a `tableKeyOf` bound to the active HF EditorView, and (3) the same
 * nearest-viewport page pick the HF caret uses (the part paints on every page).
 * HF tables are rare, so this is deferred.
 *
 */

interface TableRowBand {
    /** 0-based anchor-row index (from `cell.row`) */
    rowIndex: number;
    top: number;
    bottom: number;
}
interface DisplayListTableFragment {
    pageIndex: number;
    /** caller-supplied identity of the enclosing table (also the handle key) */
    tableKey: string;
    /** smallest in-cell `docStart` seen for this table on this page */
    docStartSample: number;
    /** page-local left edge (exact when a border exposes it, else approximate) */
    originX: number;
    /** page-local top edge of the fragment's content */
    originY: number;
    /** page-local bottom edge of the fragment's content */
    bottomY: number;
    /** true when `originX` came from an exact edge source (border line) */
    originExact: boolean;
    /** per anchor-row content bands, ascending by `rowIndex` */
    rowBands: TableRowBand[];
}
/** Resolve an in-cell doc position to its enclosing table's stable key, or null. */
type TableKeyResolver = (docStart: number | undefined) => string | null;
type DisplayListTableRegion = {
    kind?: 'body';
    rId?: undefined;
} | {
    kind: 'header' | 'footer';
    rId?: string | null;
};
interface DisplayListSelectedCellSpec {
    /** caller-supplied identity of the enclosing table */
    tableKey: string;
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
}
interface DisplayListSelectedCellRect {
    pageIndex: number;
    tableKey: string;
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    x: number;
    y: number;
    w: number;
    h: number;
    exact: boolean;
    region: 'body' | 'header' | 'footer';
    rId?: string;
}
interface DisplayListTableInsertHoverInput {
    list: DisplayList;
    pageIndex: number;
    /** Page-local pointer x/y in display-list px. */
    x: number;
    y: number;
    /** Client-space canvas rect for `pageIndex`, used to return DOM-path anchors. */
    canvasRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
    /** Display-list page size for `pageIndex`. */
    pageSize: {
        width: number;
        height: number;
    };
    tableKeyOf: TableKeyResolver;
    /** Resolve a table grid cell to its cell-start position. */
    cellPmPosOf: (tableKey: string, row: number, col: number) => number | null;
    region?: DisplayListTableRegion;
    edgeProximity?: number;
    /** Client px per CSS px of the button, which scales its offsets from the table. Default 1. */
    buttonZoom?: number;
}
interface DisplayListTableInsertHoverHit {
    type: 'row' | 'column';
    clientX: number;
    clientY: number;
    cellPmPos: number;
}
declare const DISPLAY_LIST_TABLE_INSERT_HIDE_DELAY_MS = 200;
/**
 * All body table fragments across every page of the display list, each with the
 * geometry an adapter needs to mount canvas resize handles. `tableKeyOf` maps an
 * in-cell doc position to its enclosing table's stable key (see module docs).
 */
declare function deriveDisplayListTableFragments(list: DisplayList, tableKeyOf: TableKeyResolver): DisplayListTableFragment[];
/**
 * [`deriveDisplayListTableFragments`] for the pages `start..=end` only. Each of
 * their tables still takes its identity from every page it covers.
 */
declare function deriveDisplayListTableFragmentsOnPages(list: DisplayList, tableKeyOf: TableKeyResolver, start: number, end: number): DisplayListTableFragment[];
/**
 * Full selected-cell boxes for canvas overlays.
 *
 * The DOM painter highlights `.layout-table-cell` elements directly; in canvas
 * mode those cells are parked, so adapters pass the live cell selection as
 * grid coordinates and this helper resolves visible page-local boxes from the
 * display-list table geometry. Border lines provide exact grid edges when
 * present; borderless fragments fall back to the selected cell's content bbox
 * padded by the same conservative inset used by table-resize geometry.
 */
declare function deriveDisplayListSelectedCellRects(list: DisplayList, selectedCells: DisplayListSelectedCellSpec[], tableKeyOf: TableKeyResolver, region?: DisplayListTableRegion): DisplayListSelectedCellRect[];
/**
 * Canvas/display-list version of the table insert "+" hover detector.
 *
 * Mirrors `detectTableInsertHover`'s edge threshold and button offsets, but
 * reads table/cell boxes from display-list geometry because the painter DOM is
 * parked while canvas is active.
 */
declare function detectDisplayListTableInsertHover(input: DisplayListTableInsertHoverInput): DisplayListTableInsertHoverHit | null;

interface DisplayListHyperlinkHit {
    pageIndex: number;
    region: 'body' | 'header' | 'footer';
    rId?: string;
    href: string;
    tooltip?: string;
    displayText: string;
    rect: GeoRect;
}
declare function findDisplayListHyperlinkAtPoint(list: DisplayList, pageIndex: number, x: number, y: number, region?: DisplayListTableRegion): DisplayListHyperlinkHit | null;

/**
 * Display-list rendering surface: the renderer-agnostic contract between
 * layout output and every backend, plus the web canvas replay backend.
 */

/**
 * Demo display list used when no provider value is injected. One page, one paragraph of two runs with a
 * highlight and underline, a table border line, and an image reference.
 */
declare const demoDisplayList: DisplayList;

export { type A11yAnnouncement, type A11yCommentThreadDetails, type A11ySelectionSnapshot, type AnchorEditorView, type BuildInteractiveOverlayOptions, type BuildMirrorPageOptions, CANVAS_PAGES_PADDING_PX, CANVAS_PAGE_GAP_PX, type CanvasImageResolverOptions, type CanvasPointHit, DISPLAY_LIST_TABLE_INSERT_HIDE_DELAY_MS, DisplayList, type DisplayListHfAnchorSource, type DisplayListHyperlinkHit, DisplayListQueries, DisplayListRect, DisplayListRegionHit, type DisplayListSelectedCellRect, type DisplayListSelectedCellSpec, type DisplayListTableFragment, type DisplayListTableInsertHoverHit, type DisplayListTableInsertHoverInput, type DisplayListTableRegion, DisplayPage, type DisplayPageClientRect, type DisplayPageHostOptions, DisplayPageRegistry, DisplayPrimitive, type DrawPageOptions, type GeoRect, GlyphCache, type GlyphCacheOptions, type GlyphOutline, type GlyphOutlineProvider, GlyphRunPrimitive, type ImageResolver, type InteractiveOverlayLabels, LinePrimitive, MIRROR_CLASS_NAMES, type MirrorLabels, type PageCanvasBuffer, type PageCanvasLike, type TableKeyResolver, type TableRowBand, TextRunPrimitive, type TrackedChangesResult, type YrsHeaderFooterRegions, YrsSidebarDisplayPoint, YrsSidebarProjection, anchorPositionsFromPoints, applyInteractiveSdtFocus, bindDisplayPageRegistry, buildInteractiveOverlayPage, buildMirrorPage, buildMirrorPageLinks, buildMirrorPageText, canvasPageTops, computeA11yAnnouncements, computeAnchorPositionsFromDisplayList, computeAnchorPositionsFromYrs, createCanvasImageResolver, demoDisplayList, deriveDisplayListSelectedCellRects, deriveDisplayListTableFragments, deriveDisplayListTableFragmentsOnPages, detectDisplayListTableInsertHover, displayPageCanvas, displayPageCanvases, displayPageHoldsMirrorId, drawDisplayPage, drawGlyphRunPrimitive, drawPrimitive, effectiveZoom, extractTrackedChangesFromYrs, findDisplayListHyperlinkAtPoint, fontSizePxFromShorthand, glyphRunRect, interactiveOverlayHasTabStops, lineRect, loadGlyphOutlineProvider, materializeDisplayPages, mergeHfAnchorPositionsFromDisplayList, mirrorPageHasHeaderCells, mirrorPageHasTabStops, presentDisplayPageBackBuffer, presentOffscreenPageBackBuffer, rasterizeDisplayListPages, rasterizeDisplayPageToBackBuffer, reduceMirrorToLinks, reduceMirrorToText, resolveCanvasPoint, resolveDisplayPageClientRect, sizeCanvasForPage, snapshotFromSelectionContext, textRunRect, updateMirrorPage, visitAnchorKeys };
