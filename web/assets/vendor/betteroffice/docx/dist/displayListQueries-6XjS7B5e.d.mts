import { a as TextModernEffects } from './formatting-p5MneNuy.mjs';
import { D as DrawingScene, c as ShapeTextBodyProperties } from './content-DVT06V_6.mjs';
import { L as Layout } from './types-bvPg3KsF.mjs';
import { MeasuredBlock } from './layout/pagination/index.mjs';

interface DisplayList {
    /** Contract version. Undefined reads as legacy version 0. */
    contractVersion?: number;
    pages: DisplayPage[];
}
/**
 * Modern (`w14:*`) run text-effect payload carried on text/glyph primitives.
 * Same shape as the document model's `TextModernEffects` — px distances,
 * degree directions, 0..1 opacities, resolved `#rrggbb` colors.
 */
type DisplayTextModernEffects = TextModernEffects;
interface DisplayPage {
    pageIndex: number;
    width: number;
    height: number;
    /** Authored body content box (page-local px), derived from page margins. */
    contentBounds?: DisplayBounds;
    /** Authored body column boxes in reading order (page-local px). */
    columnBounds?: DisplayBounds[];
    /** Stable section identity for this page. Undefined = legacy/global section. */
    sectionId?: string;
    /** Zero-based section ordinal. */
    sectionIndex?: number;
    /** Zero-based page ordinal within the section. */
    sectionPageIndex?: number;
    /** Effective page number within the section, after any restart. */
    sectionPageNumber?: number;
    /** Formatted PAGE label (for example, "vii"). */
    pageLabel?: string;
    primitives: DisplayPrimitive[];
    /** Leading primitives painted beneath the header and footer. */
    watermarkPrimitiveCount?: number;
    /** Resolved page background. Undefined = transparent/host white. */
    background?: string;
    pageBorders?: PageBorderPrimitive[];
    header?: HfRegion;
    footer?: HfRegion;
    /** Footnote/endnote regions in page coordinates. Undefined = none. */
    noteAreas?: NoteRegion[];
    /** Page-local rects of host layout reservations; nothing paints them. Undefined = none. */
    reservations?: DisplayReservation[];
    /** Table cell edges without a visible border, for a view-only overlay; nothing paints them. Undefined = none. */
    tableGridlines?: DisplayGridline[];
    /** Geometry only: the page's content is built when the host asks for it. */
    unbuilt?: boolean;
    /** For an unbuilt page, the lowest and highest body position its layout places. */
    positionSpan?: [number, number];
    /** For an unbuilt page, the relationship ids of the header and footer parts its build paints. */
    hfParts?: {
        header?: string;
        footer?: string;
    };
}
/** One table cell edge segment in page-local px. */
interface DisplayGridline {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** Where a host's layout reservation landed, in page-local px. */
interface DisplayReservation extends DisplayBounds {
    owner: string;
    id: string;
}
/** A page-local rectangle emitted as display-list metadata. */
interface DisplayBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Page note region; primitives retain normal doc/a11y metadata. */
interface NoteRegion {
    kind?: 'footnote' | 'endnote';
    sectionId?: string;
    y?: number;
    height?: number;
    columns?: number;
    separatorPrimitives?: DisplayPrimitive[];
    primitives?: DisplayPrimitive[];
    noteIds?: number[];
    /**
     * Per-note backlink metadata (W17): the body-doc range of each note's
     * reference mark plus its formatted label, so the a11y mirror can wire
     * note ↔ reference associations (doc-noteref / doc-backlink). Parallel to
     * `noteIds`; undefined = legacy region without backlink data.
     */
    notes?: NoteRegionNote[];
}
/** Backlink metadata for one note in a NoteRegion. */
interface NoteRegionNote {
    id?: number;
    /** Body-doc range of the reference mark anchoring this note. */
    anchorDocStart?: number;
    anchorDocEnd?: number;
    /** Formatted reference label (display number / custom mark). File-derived. */
    label?: string;
}
interface HfRegion {
    rId: string;
    kind: 'header' | 'footer';
    y: number;
    height: number;
    primitives: DisplayPrimitive[];
}
type DisplayPrimitive = TextRunPrimitive | GlyphRunPrimitive | RectPrimitive | LinePrimitive | ImagePrimitive | ShapePrimitive | DecorationPrimitive;
interface TableCellRef {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    continuation?: boolean;
    /** Stable semantic cell identity. */
    cellId?: string;
    /** Cell participates as a row/column header. */
    isHeader?: boolean;
    /** Header cell was repeated on a continuation page. */
    repeatedHeader?: boolean;
    /** Word `w:noWrap` cell behavior. */
    noWrap?: boolean;
    /** IDs of header cells that label this data cell. */
    headerIds?: string[];
    /** Collapsed-border ownership retained for exact fragment replay. */
    ownsTopBorder?: boolean;
    ownsRightBorder?: boolean;
    ownsBottomBorder?: boolean;
    ownsLeftBorder?: boolean;
}
/** Table-fragment semantics shared by every primitive emitted for that fragment. */
interface DisplayTableMetadata {
    tableId?: string;
    rowStart?: number;
    rowEnd?: number;
    rowCount?: number;
    columnCount?: number;
    headerRowCount?: number;
    caption?: string;
    description?: string;
    parentTableId?: string;
}
/** Resolved review presentation for the primitive's `commentIds`. */
interface DisplayCommentMetadata {
    status?: 'active' | 'resolved';
    authorId?: string;
    paletteIndex?: number;
    color?: string;
    selected?: boolean;
    /** Reviewer display name (file-derived, attacker-controlled). */
    authorName?: string;
    /** Comment date string, passed through verbatim. */
    date?: string;
    /** Plain-text comment body excerpt (builder-capped, file-derived). */
    text?: string;
    /** Number of replies in the thread. */
    replyCount?: number;
    /** Reply summaries in thread order (builder-capped). */
    replies?: DisplayCommentReply[];
}
/** One reply summary inside DisplayCommentMetadata. */
interface DisplayCommentReply {
    authorName?: string;
    date?: string;
    text?: string;
}
/**
 * Inert field identity for a11y announcement. `instruction` is the raw Word
 * field instruction, carried for announcement/inspection ONLY — it is never
 * parsed into behavior or executed by any consumer (see the repo security guidelines security).
 */
interface DisplayFieldMetadata {
    /** Painter-resolved category (PAGE, NUMPAGES, DATE, TIME, OTHER). */
    category?: string;
    /** Raw Word field type token (e.g. TOC, PAGEREF, REF). */
    type?: string;
    /** Raw field instruction text (announce-only, builder-capped). */
    instruction?: string;
}
/** Footnote/endnote reference identity on the body reference-mark primitive. */
interface DisplayNoteRef {
    kind?: 'footnote' | 'endnote';
    id?: number;
}
/** Scoped clip/group membership emitted by the Rust compiler. */
interface DisplayClipGroupMetadata {
    id?: string;
    clip?: {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
    };
    opacity?: number;
}
/** Horizontal paint slot for text laid out with guessed metrics. */
interface DisplayPaintClip {
    x: number;
    w: number;
}
interface StructuralRevision {
    scope: 'pmark' | 'table' | 'row' | 'cell';
    author: string;
    date?: string;
    revisionId: string;
    kind: 'ins' | 'del' | 'merge';
    rowIndex?: number;
    colIndex?: number;
}
interface SdtAttrs {
    groupId: string;
    sdtType: string;
    depth?: number;
    tag?: string;
    alias?: string;
    lock?: string;
    checked?: boolean;
    bound?: boolean;
    repeatingItem?: boolean;
}
interface InlineSdtWidgetAttrs {
    kind: 'checkbox';
    /** Rich control kind. Undefined = legacy checkbox. */
    controlKind?: 'checkbox' | 'dropDownList' | 'comboBox' | 'date' | 'picture' | 'repeatingSection';
    groupId: string;
    pos: number;
    tag?: string;
    alias?: string;
    checked?: boolean;
    controlId?: number;
    value?: string;
    selectedIndex?: number;
    listItems?: Array<{
        displayText?: string;
        value?: string;
    }>;
    dateFormat?: string;
    dateLanguage?: string;
    locked?: boolean;
}
interface ChartA11yAttrs {
    label: string;
}
interface DocAttrs {
    docStart?: number;
    docEnd?: number;
    blockId?: number;
    blockKey?: string;
    fragmentDocStart?: number;
    fragmentDocEnd?: number;
    paraId?: string;
    fromLine?: number;
    toLine?: number;
    /** Resolved line index within the owning paragraph. */
    lineIndex?: number;
    /**
     * Table cell the primitive paints inside, when any. The a11y mirror builds
     * real ARIA table semantics (role table/row/cell, aria-row/colindex) from
     * this — without it a table block reads as a flat run of text.
     */
    cell?: TableCellRef;
    /** Sanitized hyperlink target when this primitive paints linked content. */
    href?: string;
    /** Optional hyperlink tooltip/title for popup UI. */
    tooltip?: string;
    /** ScreenTip exposed as DOM `title`; undefined falls back to `tooltip`. */
    linkTitle?: string;
    /** Safe hyperlink target frame. */
    linkTarget?: string;
    /** Link history bit. Undefined = host-unmanaged. */
    linkHistory?: boolean;
    /** Location within the target document. */
    linkDocLocation?: string;
    commentIds?: string[];
    /**
     * Inert field identity when this primitive paints a field result. The a11y
     * mirror announces it (data-field-* + aria-description); nothing executes it.
     */
    field?: DisplayFieldMetadata;
    /**
     * Footnote/endnote reference identity when this primitive is the body
     * reference mark — the mirror renders it as a doc-noteref link to the
     * note's mirror element (W17 backlinks).
     */
    noteRef?: DisplayNoteRef;
    revision?: {
        author: string;
        date: string;
        revisionId: string;
        kind: 'ins' | 'del';
    };
    /** Synthetic numbering glyph for the first line of a list paragraph. */
    listMarker?: boolean;
    /** Pending suggestion paint for a synthetic numbering glyph. */
    listMarkerRevision?: 'ins' | 'del';
    structuralRevision?: StructuralRevision;
    /** Innermost block-level content-control identity for this primitive. */
    sdt?: SdtAttrs;
    /** Full outer-to-inner content-control ancestry. */
    sdtPath?: SdtAttrs[];
    /** Inline content-control widget metadata when this text run is its glyph. */
    inlineSdtWidget?: InlineSdtWidgetAttrs;
    /** Accessibility summary for primitives that compose one chart block. */
    chart?: ChartA11yAttrs;
    /** Logical/source order, independent of visual bidi paint order. */
    logicalOrder?: number;
    /** Resolved bidi embedding level. */
    bidiLevel?: number;
    /** BCP-47 language for a11y/font fallback. */
    lang?: string;
    /** Decorative content is omitted from the accessibility mirror. */
    decorative?: boolean;
    /** Authored accessibility name. */
    ariaLabel?: string;
    /** Authored accessibility description. */
    ariaDescription?: string;
    /** Hidden authored object. Undefined = visible. */
    hiddenObject?: boolean;
    /** Stable logical scene/group identity. */
    groupId?: string;
    /** Review presentation for comment-associated primitives. */
    comment?: DisplayCommentMetadata;
    /** Scoped clip/group membership. Undefined = ungrouped. */
    clipGroup?: DisplayClipGroupMetadata;
    /** Enclosing table-fragment identity and accessibility semantics. */
    table?: DisplayTableMetadata;
    /** Inline native-shape atom; true only for paragraph-inline shapes. */
    inlineShapeAtom?: boolean;
}
interface TextRunPrimitive extends DocAttrs {
    kind: 'text';
    text: string;
    x: number;
    baselineY: number;
    width: number;
    paintClip?: DisplayPaintClip;
    font: string;
    color: string;
    letterSpacing?: number;
    wordSpacing?: number;
    rtl?: boolean;
    /** 0..1 alpha applied only to this run. Absent = opaque. */
    opacity?: number;
    /** Degrees clockwise around the primitive's geometry center. Absent = 0. */
    rotationDeg?: number;
    /** Horizontal text scale as a percentage (100 = normal). Absent = 100. */
    horizontalScale?: number;
    /** Render glyphs uppercase without changing the accessible source text. */
    allCaps?: boolean;
    /** Render lowercase glyphs as small uppercase. */
    smallCaps?: boolean;
    /** Hidden run shown in editing view as dimmed/dotted, matching the DOM painter. */
    hidden?: boolean;
    /** CSS-like shadow effect from run formatting. */
    textShadow?: 'shadow' | 'emboss' | 'imprint';
    /** Outlined / hollow text. */
    textOutline?: boolean;
    /** CJK emphasis mark. */
    emphasisMark?: 'dot' | 'comma' | 'circle' | 'underDot';
    /** Legacy text-effect class hook for the a11y mirror. */
    textEffect?: 'blinkBackground' | 'lights' | 'antsBlack' | 'antsRed' | 'shimmer' | 'sparkle';
    /** Modern w14 text effects (glow/shadow/reflection/textFill/textOutline). */
    modernEffects?: DisplayTextModernEffects;
    /** Shaped tab/TOC leader metadata. Undefined = ordinary text. */
    leaderGlyphs?: Omit<LeaderGlyphPrimitive, 'kind'>;
}
interface PositionedGlyph {
    id: number;
    x: number;
    y: number;
    cluster: number;
    advance?: number;
    /** Logical cluster order before bidi reordering. */
    logicalOrder?: number;
    /** Bidi embedding level for this cluster. */
    bidiLevel?: number;
}
/** Shaped glyph run with source text for accessibility. */
interface GlyphRunPrimitive extends DocAttrs {
    kind: 'glyphRun';
    fontId: number;
    size: number;
    color: string;
    text: string;
    glyphs: PositionedGlyph[];
    echo?: {
        x: number;
        right: number;
        kern?: boolean;
        primaryFont?: boolean;
        kerning?: number;
        letterSpacing?: number;
        position?: number;
        scale?: number;
        canEmpty?: boolean;
        /** Unstretched width of a line that justification stretches to `right`. */
        stretch?: number;
        /** Width a centered line centers in from `x`. */
        centerWidth?: number;
    };
    paintClip?: DisplayPaintClip;
    fallbackFont?: string;
    wordSpacing?: number;
    rtl?: boolean;
    /** 0..1 alpha applied only to this run. Absent = opaque. */
    opacity?: number;
    /** Degrees clockwise around the primitive's geometry center. Absent = 0. */
    rotationDeg?: number;
    /** Horizontal text scale as a percentage (100 = normal). Absent = 100. */
    horizontalScale?: number;
    /** Render glyphs uppercase without changing the accessible source text. */
    allCaps?: boolean;
    /** Render lowercase glyphs as small uppercase. */
    smallCaps?: boolean;
    /** Hidden run shown in editing view as dimmed/dotted, matching the DOM painter. */
    hidden?: boolean;
    /** CSS-like shadow effect from run formatting. */
    textShadow?: 'shadow' | 'emboss' | 'imprint';
    /** Outlined / hollow text. */
    textOutline?: boolean;
    /** CJK emphasis mark. */
    emphasisMark?: 'dot' | 'comma' | 'circle' | 'underDot';
    /** Legacy text-effect class hook for the a11y mirror. */
    textEffect?: 'blinkBackground' | 'lights' | 'antsBlack' | 'antsRed' | 'shimmer' | 'sparkle';
    /** Modern w14 text effects (glow/shadow/reflection/textFill/textOutline). */
    modernEffects?: DisplayTextModernEffects;
    /** Shaped tab/TOC leader metadata. Undefined = ordinary glyph run. */
    leaderGlyphs?: Omit<LeaderGlyphPrimitive, 'kind'>;
}
interface RectPrimitive extends DocAttrs {
    kind: 'rect';
    x: number;
    y: number;
    w: number;
    h: number;
    fill: string;
    /** Alpha multiplier. Undefined = 1. */
    opacity?: number;
}
/** Word/CSS line recipe retained instead of flattening to a solid stroke. */
type DisplayBorderStyle = 'solid' | 'double' | 'dotted' | 'dashed' | 'dashDot' | 'dashDotDot' | 'triple' | 'thinThick' | 'thickThin' | 'wave' | 'doubleWave' | 'groove' | 'ridge' | 'inset' | 'outset';
interface LinePrimitive extends DocAttrs {
    kind: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    strokeWidth: number;
    color: string;
    dash?: number[];
    role?: 'border' | 'table-border' | 'table-cut' | 'separator';
    /** Full border recipe. Undefined = infer solid/dash from `dash`. */
    borderStyle?: DisplayBorderStyle;
    /** Secondary color for 3-D/multi-stroke recipes. */
    secondaryColor?: string;
    /** Alpha multiplier. Undefined = 1. */
    opacity?: number;
    /** Owner of the retained Word border recipe. */
    borderOwner?: 'cell' | 'fragment' | 'paragraph' | 'textBox';
}
interface PageBorderSide {
    width: number;
    color: string;
    style: 'solid' | 'double' | 'dotted' | 'dashed' | 'groove' | 'ridge' | 'inset' | 'outset';
}
interface PageBorderPrimitive {
    kind: 'pageBorder';
    x: number;
    y: number;
    w: number;
    h: number;
    zOrder?: 'front' | 'back';
    top?: PageBorderSide;
    right?: PageBorderSide;
    bottom?: PageBorderSide;
    left?: PageBorderSide;
}
interface ImagePrimitive extends DocAttrs {
    kind: 'image';
    shapeType?: string;
    relId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotationDeg?: number;
    /** 0..1 alpha applied only to this image. Absent = opaque. */
    opacity?: number;
    /** Flip about the content-frame center. Undefined = false. */
    flipH?: boolean;
    /** Flip about the content-frame center. Undefined = false. */
    flipV?: boolean;
    /** Original image frame when w/h are a transformed layout bbox. */
    contentFrame?: {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
    };
    /** Canvas/CSS filter string for renderer-owned effects, e.g. watermark washout. */
    filter?: string;
    /** True for decorative/non-content images such as picture watermarks. */
    decorative?: boolean;
    crop?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    altText?: string;
    /** Ordered image effects. Undefined = use legacy `filter` only. */
    effects?: Array<{
        kind?: string;
        amount?: number;
        threshold?: number;
        colors?: string[];
        rawName?: string;
    }>;
    /** Picture border recipe. Undefined = none. */
    border?: {
        width?: number;
        color?: string;
        style?: string;
        dash?: number[];
    };
}
type ShapePathCommand = {
    type: 'move';
    x: number;
    y: number;
} | {
    type: 'line';
    x: number;
    y: number;
} | {
    type: 'quad';
    cpx: number;
    cpy: number;
    x: number;
    y: number;
} | {
    type: 'cubic';
    cp1x: number;
    cp1y: number;
    cp2x: number;
    cp2y: number;
    x: number;
    y: number;
} | {
    type: 'close';
};
interface ShapePrimitive extends DocAttrs {
    kind: 'shape';
    x: number;
    y: number;
    w: number;
    h: number;
    /** Page-local path commands scaled from the shape's normalized geometry. */
    geometryPath: ShapePathCommand[];
    fill?: string;
    stroke?: {
        color: string;
        width: number;
        /** DrawingML/CSS dash style token. */
        dash?: string;
    };
    transform?: {
        rotation?: number;
        flipH?: boolean;
        flipV?: boolean;
    };
    /** True when the shape carries no accessible inner text. */
    decorative?: boolean;
    /** Alpha multiplier. Undefined = 1. */
    opacity?: number;
    /** Lossless paint server; undefined = legacy `fill`. */
    fillPaint?: {
        kind?: 'none' | 'solid' | 'gradient' | 'pattern' | 'picture' | 'theme';
        color?: string;
        angle?: number;
        gradientType?: string;
        stops?: Array<{
            position?: number;
            color?: string;
        }>;
        patternPreset?: string;
        foregroundColor?: string;
        backgroundColor?: string;
        pictureRelId?: string;
        /**
         * Resolved SAFE embedded source for a picture fill (`blob:`/`data:` only —
         * external-mode blip relationships are never resolved, so opening a file
         * cannot trigger a network fetch). The canvas image resolver rejects any
         * other scheme as defense in depth. Absent = unresolvable, paint the
         * legacy `fill`/`color` instead.
         */
        pictureSrc?: string;
        /** Picture source crop fractions (`a:srcRect`, 0..1; negative = outset). */
        pictureSrcRect?: {
            left?: number;
            top?: number;
            right?: number;
            bottom?: number;
        };
        /** Picture fill mode. Absent = 'stretch' (`a:stretch`). */
        pictureFillMode?: 'stretch' | 'tile';
        /** Tile parameters when `pictureFillMode` = 'tile'. Offsets px, scales fractions. */
        pictureTile?: {
            offsetX?: number;
            offsetY?: number;
            scaleX?: number;
            scaleY?: number;
            alignment?: string;
            flip?: 'none' | 'x' | 'y' | 'xy';
        };
        /** Stretch target rect fractions of the shape box (`a:fillRect`, 0..1). */
        pictureStretchRect?: {
            left?: number;
            top?: number;
            right?: number;
            bottom?: number;
        };
        /** Picture alpha 0..1 (`a:alphaModFix`). Absent = opaque. */
        pictureOpacity?: number;
        themeRefIndex?: number;
    };
    /** Lossless DrawingML stroke details beyond the legacy `stroke` triple. */
    strokePaint?: {
        color?: string;
        width?: number;
        dash?: string;
        customDash?: number[];
        compound?: 'single' | 'double' | 'thickThin' | 'thinThick' | 'triple';
        alignment?: 'center' | 'inset';
        cap?: 'flat' | 'round' | 'square';
        join?: 'bevel' | 'miter' | 'round';
        miterLimit?: number;
        headEnd?: {
            type?: string;
            width?: string;
            length?: string;
        };
        tailEnd?: {
            type?: string;
            width?: string;
            length?: string;
        };
    };
    /** Ordered 2-D effects. Undefined = none. */
    effects?: Array<{
        kind?: string;
        color?: string;
        opacity?: number;
        blurRadius?: number;
        distance?: number;
        direction?: number;
        size?: number;
        rawName?: string;
    }>;
    /** Effect extents in page px. Undefined = zero. */
    effectExtent?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    /** Versioned heterogeneous DrawingML group/canvas scene. */
    drawingScene?: DrawingScene;
    /** Full DrawingML `a:bodyPr` projection for shape text. */
    textBodyProperties?: ShapeTextBodyProperties;
}
interface DecorationPrimitive extends DocAttrs {
    kind: 'decoration';
    deco: 'underline' | 'strike' | 'highlight' | 'comment-range' | 'spell';
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    dashed?: boolean;
    dotted?: boolean;
    /** Exact highlight font-box/source slice. Undefined = legacy rect. */
    highlightSlice?: {
        sourceStart?: number;
        sourceEnd?: number;
        ascent?: number;
        descent?: number;
        includesTrailingWhitespace?: boolean;
    };
    /** Full border/decoration recipe. Undefined = solid/dashed/dotted flags. */
    style?: DisplayBorderStyle;
}
/** Shaped tab/TOC leader glyphs; absent metrics mean no painted leader. */
interface LeaderGlyphPrimitive extends DocAttrs {
    /** Primitive tag. Undefined when embedded as run metadata. */
    kind?: 'leaderGlyphs';
    glyph?: string;
    count?: number;
    x?: number;
    baselineY?: number;
    advance?: number;
    width?: number;
    font?: string;
    fontId?: number;
    size?: number;
    color?: string;
    rtl?: boolean;
}

/**
 * Locate an image primitive in a built DisplayList by its document position.
 *
 * The canvas image-selection overlay needs the selected image's page-local
 * rect to place its resize handles, and on the canvas path the painted DOM
 * image (`.layout-run-image`) is parked/hidden — its rect is unusable. The
 * display list carries every inline image as an `ImagePrimitive` stamped with
 * `docStart` (= the image atom's document position, the same value the DOM path reads
 * from `data-doc-start`), so the primitive found here is the geometry source
 * that replaces `imageInfo.element.getBoundingClientRect()`.
 *
 * Body primitives only: header/footer image primitives carry doc positions in a
 * different doc (the HF editor), so a body image pmPos must never match one.
 *
 */

type DisplayListImageRegion = 'body' | 'header' | 'footer';
interface LocatedImagePrimitive {
    primitive: ImagePrimitive;
    /** page the primitive paints on (page-local px are relative to this page) */
    pageIndex: number;
    /** Document region containing the image. Undefined reads as body. */
    region?: DisplayListImageRegion;
    /** Header/footer relationship id when `region` is not body. */
    rId?: string;
}
/**
 * First body image primitive whose `docStart` equals `pos`, or null. `pos` is
 * the image node's document position (a node selection's `from`, or the left
 * edge of a one-atom text selection).
 */
declare function findImagePrimitiveByDocPos(list: DisplayList, pos: number, region?: DisplayListImageRegion, rId?: string): LocatedImagePrimitive | null;
/** Topmost positioned image painted under a page-local point, or null. */
declare function findImagePrimitiveAtPoint(list: DisplayList, pageIndex: number, x: number, y: number, region?: DisplayListImageRegion, rId?: string): LocatedImagePrimitive | null;
/**
 * Capture an inline body's authored anchor offsets from display-list geometry.
 * Horizontal position is relative to the page content/column box; vertical
 * position is relative to the containing paragraph fragment. Header/footer
 * images deliberately return undefined until their paragraph/content-origin
 * metadata is part of the display-list contract.
 */
declare function captureInlinePositionEmuFromDisplayList(queries: DisplayListQueries, pos: number): {
    horizontalEmu: number;
    verticalEmu: number;
} | undefined;

declare const FRAME_DELTA_VERSION = 1;
declare const FRAME_DELTA_HEADER_BYTES = 80;
declare const FRAME_DELTA_PAGE_OP_BYTES = 48;
type FrameDeltaErrorCode = 'invalid-frame' | 'unsupported-version' | 'stale-frame' | 'base-mismatch';
declare class FrameDeltaError extends Error {
    readonly code: FrameDeltaErrorCode;
    constructor(code: FrameDeltaErrorCode, message: string);
}
interface FramePageUpsert {
    readonly kind: 'upsert';
    readonly pageIndex: number;
    readonly pageId: bigint;
    readonly fingerprint: bigint;
    /** Zero-copy view into {@link DecodedFrameDelta.bytes}. */
    readonly primitiveIds: BigUint64Array;
    readonly page: DisplayPage;
}
interface FramePageRemove {
    readonly kind: 'remove';
    readonly pageIndex: number;
    readonly pageId: bigint;
}
interface FramePageMove {
    readonly kind: 'move';
    readonly pageIndex: number;
    readonly pageId: bigint;
    readonly fingerprint: bigint;
}
interface FramePrimitivePositionPatch {
    readonly primitiveId: bigint;
    readonly docStart?: number | null;
    readonly docEnd?: number | null;
    readonly fragmentDocStart?: number | null;
    readonly fragmentDocEnd?: number | null;
    readonly inlineWidgetPos?: number | null;
}
interface FramePagePositionPatch {
    readonly kind: 'patch-positions';
    readonly pageIndex: number;
    readonly pageId: bigint;
    readonly fingerprint: bigint;
    readonly patches: readonly FramePrimitivePositionPatch[];
}
interface FramePositionShiftRun {
    readonly start: number;
    readonly count: number;
    readonly changedMask: number;
    readonly delta: number;
}
/** A note region note's new backlink anchor; null clears the field. */
interface FrameNoteAnchor {
    readonly area: number;
    readonly note: number;
    readonly start: number | null;
    readonly end: number | null;
}
interface FramePagePositionShift {
    readonly kind: 'shift-positions';
    readonly pageIndex: number;
    readonly pageId: bigint;
    readonly fingerprint: bigint;
    readonly runs: readonly FramePositionShiftRun[];
    readonly anchors: readonly FrameNoteAnchor[];
    readonly spanDelta?: number;
}
/** Shift the body positions and fingerprints of consecutive retained pages. */
interface FramePageShiftRange {
    readonly kind: 'shift-range';
    readonly pageIndex: number;
    readonly pageId: bigint;
    readonly count: number;
    readonly delta: number;
    readonly salt: bigint;
}
type FramePageOperation = FramePageUpsert | FramePageRemove | FramePageMove | FramePagePositionPatch | FramePagePositionShift | FramePageShiftRange;
interface DecodedFrameDelta {
    readonly protocolVersion: typeof FRAME_DELTA_VERSION;
    readonly full: boolean;
    readonly docEpoch: number;
    readonly layoutEpoch: number;
    readonly frameEpoch: number;
    readonly baseFrameEpoch: number;
    readonly pageCount: number;
    readonly contractVersion?: number;
    readonly operations: readonly FramePageOperation[];
    /** Complete binary frame; safe to transfer when the caller owns its buffer. */
    readonly bytes: Uint8Array;
}
interface RetainedFramePage {
    readonly pageIndex: number;
    readonly pageId: bigint;
    readonly fingerprint: bigint;
    readonly primitiveIds: BigUint64Array;
    readonly page: DisplayPage;
}
interface RetainedFrame {
    readonly protocolVersion: typeof FRAME_DELTA_VERSION;
    readonly docEpoch: number;
    readonly layoutEpoch: number;
    readonly frameEpoch: number;
    readonly contractVersion?: number;
    readonly pages: readonly RetainedFramePage[];
    /** IDs whose canvas/mirror/interactive projections must be replaced. */
    readonly damagedPageIds: ReadonlySet<bigint>;
    /** Removed surfaces, retained separately because they are absent from pages. */
    readonly removedPageIds: ReadonlySet<bigint>;
    readonly displayList: DisplayList;
}
/**
 * Decode and fully validate one binary FrameDelta v1 without mutating retained
 * browser state. Page payloads are typed values, not embedded JSON strings.
 */
declare function decodeFrameDelta(input: Uint8Array | ArrayBuffer): DecodedFrameDelta;
/** @internal Decode in resumable slices without publishing partial state. */
declare function decodeFrameDeltaSteps(input: Uint8Array | ArrayBuffer): Generator<void, DecodedFrameDelta>;
/** Apply one already-validated frame atomically, rejecting stale generations. */
declare function applyFrameDelta(previous: RetainedFrame | null, delta: DecodedFrameDelta): RetainedFrame;
/**
 * Apply a frame while reusing position-only page arenas owned exclusively by
 * the caller. Worker/main resident-engine hot paths replace their outer frame
 * atomically and have no concurrent readers; avoiding deep suffix clones keeps
 * geometry shifts from creating periodic multi-megabyte GC stalls.
 */
declare function applyFrameDeltaOwned(previous: RetainedFrame | null, delta: DecodedFrameDelta): RetainedFrame;
/** Position shift revision, omitted from serialization. */
declare function displayPageRevision(page: DisplayPage): number;
/** @internal Whether `page` has only copied position shifts since `base`. */
declare function displayPageIsShiftOf(page: DisplayPage, base: DisplayPage): boolean;
/** Counts shifts touching this page's note anchors. */
declare function displayPageNoteAnchorRevision(page: DisplayPage): number;

/**
 * JS seam to the Rust display-list builder.
 *
 * Marshals the `{ measured, options, layout }` envelope across the wasm
 * boundary and hands back a DisplayList. Every paint and geometry decision
 * happens in Rust; this module is serialization glue and nothing else, so a
 * failure here is terminal — the types below carry no second engine to fall
 * back to, only a typed {@link RustDisplayListSourceError} naming the stage
 * that failed.
 *
 * Two transports exist. {@link buildRustDisplayList} sends the whole envelope
 * and parses a DisplayList back. {@link buildRustDisplayFrame} prefers an
 * engine that already retains pagination: it sends only the display-level
 * extras and receives a binary FrameDelta, which is applied to the previous
 * frame so unchanged pages keep object identity — the invariant the query
 * facade's page-delta adoption depends on. An engine without
 * `buildDisplayListFrame` takes the full-JSON path instead.
 *
 * The wasm module is loaded lazily on first build, so the inlined binary costs
 * nothing until a display list is actually requested.
 */

/**
 * One header/footer part in the `headersFooters` envelope field: the measured
 * blocks of the header/footer document identified by `rId`, plus the band
 * metrics the caller already computed. The builder passes the metrics through
 * verbatim and re-derives none of them.
 */
interface DisplayListHfVariant {
    rId: string;
    kind: 'header' | 'footer';
    type: 'default' | 'first' | 'even';
    /** `toMeasuredBlocks(content.blocks, content.measures)` — same schema as body `measured` */
    measured: MeasuredBlock[];
    /** HeaderFooterContent.height (in-flow stack incl. floating blocks) */
    height: number;
    /** HeaderFooterContent.flowHeight (in-flow band height; fallback: height) */
    flowHeight?: number;
    visualTop?: number;
    visualBottom?: number;
    /**
     * Per-page resolved widths of PAGE/NUMPAGES field runs in this HF part, so a
     * centered/right-aligned line carrying such a field re-centers per page. The
     * line width is measured ONCE at the field's fallback text ("1"), so without
     * this the builder holds the same centered position on every page even though
     * "Page 2 of 3"/"Page 10 of 12" have different widths. Omitted ⇒ the fields
     * ride the char-distributed fallback width on every page.
     */
    fieldWidths?: DisplayListFieldWidths[];
}
/**
 * Per-page widths of one PAGE/NUMPAGES field run in an HF part. `pmStart` is the
 * field run's position in the header/footer document, and is the key the Rust
 * builder matches on. `fallbackWidth` is the width the measure baked into `line.width`
 * (the field's fallback text); `perPage[i]` is the width of the field's resolved
 * text on layout page index `i` (PAGE → that page's number, NUMPAGES → total).
 */
interface DisplayListFieldWidths {
    pmStart: number;
    fallbackWidth: number;
    perPage: number[];
}
/**
 * Optional header/footer payload of the builder envelope. Absent ⇒ the Rust
 * output is byte-identical to the body-only build. Flags come off the section
 * properties / settings the DOM painter uses; distances are the same px the
 * painter resolves (`headerDistance ?? page.margins.header ?? 48`).
 */
interface DisplayListHeadersFooters {
    titlePg?: boolean;
    evenAndOddHeaders?: boolean;
    headerDistance?: number;
    footerDistance?: number;
    /** Page-level Word watermark, painted behind body/header/footer content. */
    watermark?: DisplayListWatermark;
    variants: DisplayListHfVariant[];
    /** Stable section identity. Undefined ⇒ the envelope covers the whole document. */
    sectionId?: string;
    /** Zero-based section index. */
    sectionIndex?: number;
}
type DisplayListWatermark = DisplayListTextWatermark | DisplayListPictureWatermark;
interface DisplayListTextWatermark {
    kind: 'text';
    text: string;
    font: string;
    color: string;
    semitransparent: boolean;
    layout: 'diagonal' | 'horizontal';
    fontSize?: number;
    /** Undefined defaults to true for watermarks. */
    decorative?: boolean;
}
interface DisplayListPictureWatermark {
    kind: 'picture';
    relId?: string;
    dataUrl?: string;
    scale: number;
    washout: boolean;
    widthEmu?: number;
    heightEmu?: number;
    /** Undefined defaults to true for watermarks. */
    decorative?: boolean;
}
/** One measured note in a page/section note area. */
interface DisplayListNoteItem {
    kind?: 'footnote' | 'endnote';
    id?: number;
    displayLabel?: string;
    measured?: MeasuredBlock[];
    height?: number;
    anchorDocStart?: number;
    anchorDocEnd?: number;
    customMarkFollows?: boolean;
}
/** Typed non-fragmented note-region input for the Rust display builder. */
interface DisplayListNoteArea {
    pageIndex?: number;
    sectionId?: string;
    kind?: 'footnote' | 'endnote';
    placement?: 'pageBottom' | 'beneathText' | 'sectEnd' | 'docEnd';
    y?: number;
    height?: number;
    columns?: number;
    separator?: DisplayListNoteItem;
    notes?: DisplayListNoteItem[];
}
/** Stable reviewer palette entry for comments/revisions. */
interface DisplayListCommentAuthor {
    id?: string;
    name?: string;
    paletteIndex?: number;
    color?: string;
}
/** One reply of a comment thread (a11y announcement input). */
interface DisplayListCommentReply {
    id?: number;
    authorId?: string;
    authorName?: string;
    date?: string;
    /** Plain-text body (the builder caps it before it reaches primitives). */
    text?: string;
}
/**
 * Per-comment thread metadata keyed by comment id, joined by the builder onto
 * every primitive carrying that id in `commentIds` so the a11y mirror can
 * announce the complete thread (author name, date, body, replies). All string
 * values are file-derived/attacker-controlled; consumers must only ever
 * assign them via textContent/setAttribute.
 */
interface DisplayListCommentThread {
    /** Comment id — matches the numeric ids in `resolvedCommentIds`/`commentIds`. */
    id?: number;
    authorId?: string;
    authorName?: string;
    date?: string;
    /** Plain-text body (builder-capped before emission). */
    text?: string;
    /** Replies in thread order (builder-capped count and text). */
    replies?: DisplayListCommentReply[];
}
/** The `{ measured, options, layout }` envelope the Rust builder consumes. */
interface DisplayListBuildInputs {
    /** Serialization contract version. Undefined reads as version 0. */
    contractVersion?: number;
    measured: MeasuredBlock[];
    options: unknown;
    layout: Layout;
    /** header/footer parts + section flags; omitted ⇒ body-only display list */
    headersFooters?: DisplayListHeadersFooters;
    /**
     * Doc-wide font-id chains keyed `"<family lowercase>|<bold 0|1>|<italic 0|1>"`
     * → measurement `FontStore` ids — the SAME map the measurement input carries.
     * Present only under Rust measurement (the ids must belong to a populated
     * store); its presence against that store is what gates GlyphRun emission.
     * Omitted ⇒ every text run is emitted as a browser-measured
     * `TextRunPrimitive` rather than a shaped `GlyphRun`.
     */
    fontChains?: Record<string, number[]>;
    /** Page/section note regions. Undefined = no note emission. */
    noteAreas?: DisplayListNoteArea[];
    /** Resolved comments suppressed from active tint. Undefined = none known. */
    resolvedCommentIds?: number[];
    /** Stable reviewer palette. Undefined ⇒ the builder's built-in colors. */
    commentAuthors?: DisplayListCommentAuthor[];
    /** Per-comment thread metadata for a11y announcements. Undefined = none. */
    commentThreads?: DisplayListCommentThread[];
}
/**
 * Minimal build surface, injectable so tests can fake the wasm module. Only
 * `buildDisplayListJson` is required; the optional members are what an engine
 * that retains its own pagination and display state additionally offers.
 */
interface RustDisplayListEngine {
    buildDisplayListJson(input: string): string;
    /** Binary FrameDelta build; the stateless layout wasm does not offer it. */
    buildDisplayListFrame?(input: string, expectedFrameEpoch: number): Uint8Array;
    /** Applies one keystroke and returns its frame, without a layout round trip. */
    applyInput?(text: string, expectedFrameEpoch: number): Uint8Array;
    displayHitTestRegionsJson?(pageIndex: number, x: number, y: number): string;
    displayVerticalMoveJson?(position: number, direction: 'up' | 'down', goalX: number): string;
    displayRangeRectsJson?(from: number, to: number): string;
    /** @internal */
    displayRangeRectsOnPagesJson?(from: number, to: number, firstPage: number, lastPage: number): string;
    displayRangeRectsRegionJson?(region: string, partId: string, from: number, to: number): string;
    /** The bytes and media type of the part a `media:{n}` image source names. */
    mediaSource?(token: string): {
        bytes: Uint8Array;
        mimeType: string;
    } | null;
    /** Changes whenever the package `mediaSource` reads changes. */
    mediaScope?(): number;
}
type RustDisplayListSourceErrorStage = 'load' | 'build' | 'parse' | 'decode' | 'apply';
interface RustDisplayFrameResult {
    displayList: DisplayList;
    /**
     * The retained frame to pass as `previous` on the next build. Null when the
     * engine answered over full JSON, which retains nothing.
     */
    frame: RetainedFrame | null;
    transport: 'frame-delta-v1' | 'json';
}
/**
 * Typed terminal error from the mandatory Rust display-list source. Hosts may
 * surface this through their editor error boundary; it is never permission to
 * silently substitute painter geometry.
 */
declare class RustDisplayListSourceError extends Error {
    readonly stage: RustDisplayListSourceErrorStage;
    constructor(stage: RustDisplayListSourceErrorStage, cause: unknown);
}
/**
 * Query surface over an already-built display list, injectable so tests can
 * fake the wasm module.
 *
 * The required `*Json` members take the display-list JSON as an argument and
 * the Rust side re-parses it per query, so callers should cache the string.
 * The OPTIONAL session-handle members parse the list once (`openDisplayList` →
 * a handle) and answer many queries by handle with no re-serialization,
 * reusing the same hit and range logic so results are byte-identical. They are
 * optional because the embedded wasm may not carry them; `hasDisplayListSession`
 * and `hasRangeRectsRegion` report what is present, and
 * `createDisplayListQueries` falls back to the `*Json` path when it is not.
 */
interface RustDisplayListQueryEngine {
    /**
     * region-aware hit test → `{"region","rId"?,"noteId"?,"pos","target"}` or
     * `"null"` JSON
     */
    hitTestRegionsJson(displayList: string, pageIndex: number, x: number, y: number): string;
    /** closest caret position on the adjacent visual line */
    verticalMoveJson?(displayList: string, position: number, direction: 'up' | 'down', goalX: number): string;
    /** body document range → JSON array of `{pageIndex,x,y,width,height}` rects */
    rangeRectsJson(displayList: string, from: number, to: number): string;
    /** @internal */
    rangeRectsOnPagesJson?(displayList: string, from: number, to: number, firstPage: number, lastPage: number): string;
    /** @internal */
    hasRangeRectsOnPages?(): boolean;
    /**
     * Region-aware document range → JSON array of rects. `region` is a
     * `DisplayListHitRegion` discriminant; `partId` names the instance — a
     * header/footer part (empty for body, or to match any band of the kind) or a
     * note id. Optional — the facade returns `[]` when it is absent.
     */
    rangeRectsRegionJson?(displayList: string, region: string, partId: string, from: number, to: number): string;
    /** true when the embedded wasm carries the region-aware range-rect exports */
    hasRangeRectsRegion?(): boolean;
    /** true when the embedded wasm carries the session-handle exports below */
    hasDisplayListSession?(): boolean;
    /** parse a display list once, return a handle for the by-handle queries */
    openDisplayList?(displayList: string): number;
    /** free a handle's parsed display list */
    closeDisplayList?(handle: number): void;
    /** patch a stored display list's changed pages in place (see layout wasm) */
    updateDisplayList?(handle: number, update: string): void;
    /** true when the embedded wasm carries the page-delta update export */
    hasDisplayListUpdate?(): boolean;
    /** region-aware hit test against a stored display list (by handle) */
    hitTestRegionsByHandle?(handle: number, pageIndex: number, x: number, y: number): string;
    /** adjacent visual-line move against a stored display list */
    verticalMoveByHandle?(handle: number, position: number, direction: 'up' | 'down', goalX: number): string;
    /** body document range against a stored display list (by handle) */
    rangeRectsByHandle?(handle: number, from: number, to: number): string;
    /** @internal */
    rangeRectsOnPagesByHandle?(handle: number, from: number, to: number, firstPage: number, lastPage: number): string;
    /** region-aware document range against a stored display list (by handle) */
    rangeRectsRegionByHandle?(handle: number, region: string, partId: string, from: number, to: number): string;
}
/** The wasm query surface once {@link loadRustDisplayListQueryEngine} has loaded it, else null. */
declare function loadedRustDisplayListQueryEngine(): RustDisplayListQueryEngine | null;
/**
 * Lazily load the wasm query surface (hit-test + range-rects). Shares the
 * module promise with `buildRustDisplayList`, so on the canvas-renderer path
 * the engine is already resolved by the time the first display list lands.
 */
declare function loadRustDisplayListQueryEngine(): Promise<RustDisplayListQueryEngine>;
/** Display-only fields sent to an engine that already retains pagination. */
declare function encodeDisplayListFrameExtras(inputs: DisplayListBuildInputs): string;
/**
 * Build a DisplayList for a computed layout through the Rust engine. Throws
 * {@link RustDisplayListSourceError} tagged with the failing stage — `load`,
 * `build` or `parse` — when the wasm module cannot be loaded, the builder
 * rejects the input, or its output does not parse.
 */
declare function buildRustDisplayList(inputs: DisplayListBuildInputs, engine?: RustDisplayListEngine): Promise<DisplayList>;
/**
 * Build one display frame. An engine that retains pagination returns a binary
 * FrameDelta, decoded and applied on top of `previous` so unchanged pages keep
 * object identity; `previous` also supplies the frame epoch the engine checks
 * before sending a delta rather than a full frame, unless `expectedFrameEpoch`
 * overrides it (the engine numbers its frame after that epoch). An engine without
 * `buildDisplayListFrame` takes the full-JSON path, and its result carries
 * `frame: null` and `transport: 'json'`.
 *
 * Throws {@link RustDisplayListSourceError} tagged with the failing stage:
 * `load`, `build`, `decode` or `apply`.
 */
declare function buildRustDisplayFrame(inputs: DisplayListBuildInputs, engine?: RustDisplayListEngine, previous?: RetainedFrame | null, expectedFrameEpoch?: number): Promise<RustDisplayFrameResult>;

/**
 * Synchronous query facade over one built DisplayList, backed by the Rust
 * hit-testing module (`crates/docx-layout/src/hit.rs`).
 *
 * This is the canvas renderer's only source of pointer and selection geometry:
 * every rect comes from the immutable display list, never from DOM rects. A
 * facade is created per display-list build, since the list never mutates in
 * place, and it holds no state a caller has to keep in sync.
 *
 * **Two sources.** A resident editing engine queries its own display list
 * directly and takes no display-list JSON at all. Otherwise the shared layout
 * wasm answers, and the facade prefers a SESSION HANDLE: the list is parsed
 * into the Rust store once (`openDisplayList`) and every later query goes by
 * handle, with no per-query re-serialization. When the session exports are
 * absent it stringifies the list once and reuses that string for the JSON-arg
 * exports. The two paths run the same hit and range logic, so results are
 * byte-identical and only the cost differs.
 *
 * **Handle acquisition is lazy** — on the first query that needs one, or when
 * a host calls `prime()` from idle time — so replacing the facade on every
 * keystroke costs no serialization on the input path. A new facade also tries
 * to ADOPT its predecessor's parsed list, shipping a page delta for the pages
 * that changed instead of reopening the whole list; superseded generations
 * chain their donor, so a deferred pickup still costs one delta. The donor's
 * own later queries degrade to its JSON-arg path.
 *
 * **Handle release.** `dispose()` frees the handle immediately, and ending a
 * facade's line frees every handle the line's facades hold. Only a facade
 * holding a handle is registered with a `FinalizationRegistry`, which covers
 * one dropped without `dispose()` (a `useMemo` replacement, say); the Rust
 * store additionally caps live handles and evicts the oldest, so a missed
 * finalize cannot grow memory without bound.
 *
 * **Failure.** A wasm TRAP poisons the whole instance: a guard held across the
 * query leaks and every later call into it fails, so the engine is marked dead,
 * all queries stop, and `onDisplayListQuerySourceFailure` subscribers are told
 * to rebuild the session. An ordinary error just falls back — a bad handle is
 * dropped and the query retried over JSON.
 *
 * Queries are synchronous and return `null`/`[]` until the lazily imported
 * wasm module resolves. In practice it is already loaded by the time a facade
 * exists, because building the display list went through the same module.
 */

/**
 * Query surface of an editing engine that already holds the display list.
 * None of these take display-list JSON, so this source never opens a handle
 * and never serializes anything.
 */
interface ResidentDisplayListQueryEngine {
    displayHitTestRegionsJson(pageIndex: number, x: number, y: number): string;
    displayVerticalMoveJson(position: number, direction: 'up' | 'down', goalX: number): string;
    displayRangeRectsJson(from: number, to: number): string;
    /** @internal */
    displayRangeRectsOnPagesJson?(from: number, to: number, firstPage: number, lastPage: number): string;
    displayRangeRectsRegionJson(region: DisplayListHitRegion, partId: string, from: number, to: number): string;
}
/** which part of a page owns a hit — mirrors `HitRegion` in hit.rs */
type DisplayListHitRegion = 'body' | 'header' | 'footer' | 'footnote' | 'endnote';
/**
 * What a click at a hit point would act on — mirrors `HoverTarget` in hit.rs.
 * `'text'` is the typeable area (a run's box, or the content box around it),
 * which is what a pointer cursor keys off; `pos` cannot say, since it resolves
 * everywhere on a page that carries text.
 */
type DisplayListHoverTarget = 'text' | 'image' | 'none';
/**
 * Region-aware hit result. For `header`/`footer` the position refers to the
 * header/footer document identified by `rId`, and for `footnote`/`endnote` to
 * the note story named by `noteId` — NOT the body document, so the caller must
 * route the selection to that editor. `pos` is null when the point is inside
 * the region but resolves to no position.
 */
interface DisplayListRegionHit {
    region: DisplayListHitRegion;
    rId?: string;
    /** note whose story a `footnote`/`endnote` position addresses */
    noteId?: number;
    pos: number | null;
    /** Absent from a wasm build predating it; read that as "not text". */
    target?: DisplayListHoverTarget;
}
/**
 * Result of an up/down caret move. `goalX` is the page-local x to feed back
 * into the next move so a run of them holds one column.
 */
interface DisplayListVerticalMove {
    position: number;
    goalX: number;
}
/** one highlight rectangle of a document range, page-local px */
interface DisplayListRect {
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Explicit lifecycle of the mandatory Rust query source. */
type DisplayListQuerySourceState = {
    status: 'loading';
} | {
    status: 'ready';
} | {
    status: 'error';
    error: Error;
};
/** One paragraph fragment box on one page, in page-local px. */
interface DisplayListParagraphGeometry extends DisplayListRect {
    from: number;
    to: number;
    blockId?: number | string;
    paraId?: string;
}
/** One ordered visual line reconstructed from authoritative primitives. */
interface VisualLineExtent {
    top: number;
    bottom: number;
}
interface DisplayListVisualLine extends DisplayListRect {
    baseline: number;
    from: number;
    to: number;
    blockId?: number | string;
    paraId?: string;
}
/** Image primitive plus its explicit page/region geometry. */
interface DisplayListImageGeometry extends LocatedImagePrimitive {
    rect: DisplayListRect;
    pos: number;
}
/**
 * Sync query surface over one immutable DisplayList. A new instance is
 * created per display-list build (the list never mutates in place).
 */
interface DisplayListQueries {
    /** the list this instance queries (page sizes, region bands, …) */
    readonly displayList: DisplayList;
    /** false until the wasm module is loaded — queries return null/[] before */
    isReady(): boolean;
    /** Loading/ready/error state for hosts that must not silently fall back. */
    sourceState(): DisplayListQuerySourceState;
    /** Resolves when the Rust query engine is ready; rejects on load failure. */
    whenReady(): Promise<void>;
    pageCount(): number;
    pageSize(pageIndex: number): {
        width: number;
        height: number;
    } | null;
    pageBounds(pageIndex: number): DisplayListRect | null;
    contentBounds(pageIndex: number): DisplayListRect | null;
    columnBounds(pageIndex: number): DisplayListRect[];
    /** Body paragraph fragment boxes containing `pos`, including page splits. */
    paragraphRects(pos: number): DisplayListParagraphGeometry[];
    /** Ordered body visual lines across all pages. */
    visualLines(): readonly DisplayListVisualLine[];
    /** The part of {@link visualLines} on one page, computed for that page alone. */
    visualLinesOnPage(pageIndex: number): readonly DisplayListVisualLine[];
    /** Vertical span of the page's visual lines in page coordinates, or null when it has none. */
    visualLineExtent(pageIndex: number): VisualLineExtent | null;
    /** Visual line containing `pos`, or null. */
    visualLineAtPosition(pos: number): DisplayListVisualLine | null;
    /** Topmost image under a page-local point. Body by default. */
    imageAtPoint(pageIndex: number, x: number, y: number, region?: DisplayListImageRegion, rId?: string): DisplayListImageGeometry | null;
    /** Image whose atom starts at `pos`. Body by default. */
    imageByPos(pos: number, region?: DisplayListImageRegion, rId?: string): DisplayListImageGeometry | null;
    /** region-aware point → doc position (page-local coordinates) */
    hitTestRegions(pageIndex: number, x: number, y: number): DisplayListRegionHit | null;
    verticalMove(position: number, direction: 'up' | 'down', goalX?: number): DisplayListVerticalMove | null;
    /** body document range → highlight rects */
    rangeRects(from: number, to: number): DisplayListRect[];
    /** @internal */
    rangeRectsOnPages?(from: number, to: number, firstPage: number, lastPage: number): DisplayListRect[];
    /**
     * Header/footer document range → highlight rects for the region's band. `region` is
     * `'header' | 'footer'`; `rId` identifies the HF doc, and
     * `from`/`to` are positions in THAT doc. The same HF doc paints on every page
     * carrying the part, so this returns one rect-set per such page (each tagged
     * with its `pageIndex`) — the caller picks the page it is editing. Returns
     * `[]` when the region-aware exports are absent, which is feature-detected.
     */
    hfRangeRects(region: 'header' | 'footer', rId: string, from: number, to: number): DisplayListRect[];
    /**
     * Note document range → highlight rects for that note's story. `from`/`to`
     * are positions in the `fn:{noteId}` / `en:{noteId}` document, never the
     * body's. A note paints on one page only, so every rect shares its
     * `pageIndex`.
     */
    noteRangeRects(region: 'footnote' | 'endnote', noteId: number, from: number, to: number): DisplayListRect[];
    /**
     * Caret geometry for a collapsed HF selection — the HF twin of `caretRect`.
     * Resolves `[pos, pos+1)` in the HF doc (left edge is the caret), falling back
     * to `[pos-1, pos)` (right edge) at end-of-line / end-of-doc. Returns one
     * caret rect per page carrying the part; the caller picks the edited page.
     */
    hfCaretRects(region: 'header' | 'footer', rId: string, pos: number): DisplayListRect[];
    /**
     * Caret geometry for a collapsed selection in a note story — the note twin of
     * `hfCaretRects`. A note paints on one page, so this returns at most one rect.
     */
    noteCaretRects(region: 'footnote' | 'endnote', noteId: number, pos: number): DisplayListRect[];
    /** Header/footer sidebar anchors, one per page carrying the part. */
    hfAnchorRects(region: 'header' | 'footer', rId: string, pos: number): DisplayListRect[];
    /**
     * Caret geometry for a collapsed body selection: the collapsed-range rect.
     * Resolves `[pos, pos+1)` first (rect's left edge is the caret), then falls
     * back to `[pos-1, pos)` using the right edge (end-of-doc / end-of-line).
     */
    caretRect(pos: number): DisplayListRect | null;
    /**
     * Anchor geometry for sidebar markers: like `caretRect` but scans
     * `[pos, pos+2)` forward first so *node* positions (paragraph/table
     * markers carrying structural tracked-change attrs) resolve to their first
     * content line instead of the previous block's tail.
     */
    anchorRect(pos: number): DisplayListRect | null;
    /** Explicit body-sidebar alias retained alongside `anchorRect`. */
    sidebarAnchorRect(pos: number): DisplayListRect | null;
    /**
     * Acquire the Rust session handle now (adopting the donor facade's parsed
     * list when possible). Optional: the first query acquires it on demand;
     * hosts call this from idle time to keep serialization off interaction
     * paths. No-op once attempted, superseded, or disposed.
     */
    prime(): void;
    /**
     * Release the wasm session handle backing this facade. Idempotent; safe to
     * call even when no handle was opened (JSON-arg fallback path). Callers that
     * forget are covered by a `FinalizationRegistry`, but disposing eagerly frees
     * the parsed display list in the Rust store immediately.
     */
    dispose(): void;
}
/**
 * Ends `line`: closes the store handles its facades hold, which then query
 * over JSON, and its superseded facades answer nothing until a facade of the
 * same line is built. Call it when the session behind the line goes away.
 */
declare function endDisplayListQueriesLine(line: object): void;
type DisplayListQuerySource = RustDisplayListQueryEngine | ResidentDisplayListQueryEngine;
/** True once a query trapped in this engine's wasm instance. */
declare function isDisplayListQuerySourceDead(engine: DisplayListQuerySource | null | undefined): boolean;
/** Subscribe to wasm traps so the host can rebuild the dead session. */
declare function onDisplayListQuerySourceFailure(listener: (error: Error) => void): () => void;
/**
 * Build a query facade for one display list. The optional `engine` makes the
 * facade synchronous and deterministic in tests; without it the shared wasm
 * module is loaded lazily and queries no-op (`null`/`[]`) until it resolves.
 *
 * `previous` (the facade this build replaces) enables handle adoption: instead
 * of re-serializing and re-parsing the WHOLE list into the Rust store, the new
 * facade takes over the previous parsed list and patches only the pages that
 * changed. The donor facade's remaining queries degrade to its own JSON-arg
 * path (same stale-list semantics it always had after replacement).
 *
 * `line` names the document the list lays out, such as its load. A facade of another
 * document starts a new line and ends the previous one, so a facade of the
 * replaced document never answers from the new one. Without `line` a superseded
 * facade answers from its own list.
 */
declare function createDisplayListQueries(list: DisplayList, engine?: RustDisplayListQueryEngine | ResidentDisplayListQueryEngine, previous?: DisplayListQueries | null, line?: object | null): DisplayListQueries;

export { createDisplayListQueries as $, type FrameDeltaErrorCode as A, type FramePageOperation as B, type LocatedImagePrimitive as C, type DisplayListRect as D, type ResidentDisplayListQueryEngine as E, FRAME_DELTA_HEADER_BYTES as F, type GlyphRunPrimitive as G, type HfRegion as H, type ImagePrimitive as I, type RetainedFrame as J, type RetainedFramePage as K, type LinePrimitive as L, type RustDisplayFrameResult as M, type RustDisplayListEngine as N, type RustDisplayListQueryEngine as O, type PositionedGlyph as P, RustDisplayListSourceError as Q, type RectPrimitive as R, type RustDisplayListSourceErrorStage as S, type TextRunPrimitive as T, type TableCellRef as U, type VisualLineExtent as V, applyFrameDelta as W, applyFrameDeltaOwned as X, buildRustDisplayFrame as Y, buildRustDisplayList as Z, captureInlinePositionEmuFromDisplayList as _, type DisplayListQueries as a, decodeFrameDelta as a0, decodeFrameDeltaSteps as a1, displayPageIsShiftOf as a2, displayPageNoteAnchorRevision as a3, displayPageRevision as a4, encodeDisplayListFrameExtras as a5, endDisplayListQueriesLine as a6, findImagePrimitiveAtPoint as a7, findImagePrimitiveByDocPos as a8, isDisplayListQuerySourceDead as a9, loadRustDisplayListQueryEngine as aa, loadedRustDisplayListQueryEngine as ab, onDisplayListQuerySourceFailure as ac, type DisplayListHeadersFooters as b, type DisplayPage as c, type DisplayPrimitive as d, type DisplayList as e, type DisplayListRegionHit as f, type DecodedFrameDelta as g, type DecorationPrimitive as h, type DisplayBounds as i, type DisplayListBuildInputs as j, type DisplayListHfVariant as k, type DisplayListHitRegion as l, type DisplayListHoverTarget as m, type DisplayListImageGeometry as n, type DisplayListImageRegion as o, type DisplayListParagraphGeometry as p, type DisplayListPictureWatermark as q, type DisplayListQuerySourceState as r, type DisplayListTextWatermark as s, type DisplayListVerticalMove as t, type DisplayListVisualLine as u, type DisplayListWatermark as v, type DocAttrs as w, FRAME_DELTA_PAGE_OP_BYTES as x, FRAME_DELTA_VERSION as y, FrameDeltaError as z };
