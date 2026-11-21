import { C as ColorValue, A as ThemeColorSlot, P as ParagraphFormatting, T as TextFormatting, c as TableFormatting, d as TableRowFormatting, e as TableCellFormatting, B as BorderSpec, o as ShapeType, m as ShapeFill, n as ShapeOutline, H as ShapeTextBody$1, b as PresetGeometryPathCommand } from './formatting-p5MneNuy.mjs';
import { WrapType } from './docx/wrapTypes.mjs';

interface ShapeFillPaint {
    kind?: 'none' | 'solid' | 'gradient' | 'pattern' | 'picture' | 'theme';
    color?: ColorValue;
    themeColor?: ThemeColorSlot;
    gradientType?: 'linear' | 'path' | 'radial' | 'rectangular';
    angle?: number;
    stops?: Array<{
        position?: number;
        color?: ColorValue;
    }>;
    pathShape?: 'circle' | 'rect' | 'shape';
    focusRect?: {
        left?: number;
        top?: number;
        right?: number;
        bottom?: number;
    };
    rotateWithShape?: boolean;
    patternPreset?: string;
    foregroundColor?: ColorValue;
    backgroundColor?: ColorValue;
    picture?: Image;
    themeRefIndex?: number;
    srcRect?: {
        left?: number;
        top?: number;
        right?: number;
        bottom?: number;
    };
    fillMode?: 'stretch' | 'tile';
    tile?: {
        offsetX?: number;
        offsetY?: number;
        scaleX?: number;
        scaleY?: number;
        alignment?: string;
        flip?: 'none' | 'x' | 'y' | 'xy';
    };
    stretchRect?: {
        left?: number;
        top?: number;
        right?: number;
        bottom?: number;
    };
    pictureOpacity?: number;
}
interface ShapeStrokePaint {
    fill?: ShapeFillPaint;
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
    themeRefIndex?: number;
}
interface ShapeEffect {
    kind?: 'shadow' | 'glow' | 'reflection' | 'softEdge' | 'blur' | 'unknown';
    color?: ColorValue;
    opacity?: number;
    blurRadius?: number;
    distance?: number;
    direction?: number;
    size?: number;
    rawName?: string;
}
interface ShapeTextBodyProperties {
    vertical?: 'horizontal' | 'vertical' | 'vertical270' | 'wordArtVertical' | 'eastAsianVertical' | 'mongolianVertical';
    rotation?: number;
    upright?: boolean;
    anchor?: 'top' | 'middle' | 'bottom' | 'distributed' | 'justified';
    anchorCenter?: boolean;
    columns?: number;
    columnSpacing?: number;
    wrap?: 'square' | 'none';
    horizontalOverflow?: 'clip' | 'overflow';
    verticalOverflow?: 'clip' | 'ellipsis' | 'overflow';
    margins?: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
    };
    autoFit?: 'none' | 'normal' | 'shape';
    fontScale?: number;
    lineSpacingReduction?: number;
    fromWordArt?: boolean;
    presetTextWarp?: string;
}
interface DrawingSceneNode {
    kind?: 'shape' | 'group' | 'canvas' | 'picture' | 'chart' | 'graphicFrame' | 'contentPart';
    id?: string;
    name?: string;
    shape?: Shape;
    image?: Image;
    chart?: Chart;
    children?: DrawingSceneNode[];
    transform?: {
        offsetX?: number;
        offsetY?: number;
        width?: number;
        height?: number;
        childOffsetX?: number;
        childOffsetY?: number;
        childWidth?: number;
        childHeight?: number;
        rotation?: number;
        flipH?: boolean;
        flipV?: boolean;
    };
    fill?: ShapeFillPaint;
    effects?: ShapeEffect[];
    relationshipId?: string;
}
interface DrawingScene {
    version?: number;
    root?: DrawingSceneNode;
    title?: string;
    description?: string;
    decorative?: boolean;
    hidden?: boolean;
}

/**
 * Lists & Numbering Types
 *
 * Types for bullet lists, numbered lists, and numbering definitions.
 */

/**
 * Number format type
 */
type NumberFormat = 'decimal' | 'upperRoman' | 'lowerRoman' | 'upperLetter' | 'lowerLetter' | 'ordinal' | 'cardinalText' | 'ordinalText' | 'hex' | 'chicago' | 'ideographDigital' | 'japaneseCounting' | 'aiueo' | 'iroha' | 'decimalFullWidth' | 'decimalHalfWidth' | 'japaneseLegal' | 'japaneseDigitalTenThousand' | 'decimalEnclosedCircle' | 'decimalFullWidth2' | 'aiueoFullWidth' | 'irohaFullWidth' | 'decimalZero' | 'decimalZero3' | 'decimalZero4' | 'decimalZero5' | 'bullet' | 'ganada' | 'chosung' | 'decimalEnclosedFullstop' | 'decimalEnclosedParen' | 'decimalEnclosedCircleChinese' | 'ideographEnclosedCircle' | 'ideographTraditional' | 'ideographZodiac' | 'ideographZodiacTraditional' | 'taiwaneseCounting' | 'ideographLegalTraditional' | 'taiwaneseCountingThousand' | 'taiwaneseDigital' | 'chineseCounting' | 'chineseLegalSimplified' | 'chineseCountingThousand' | 'koreanDigital' | 'koreanCounting' | 'koreanLegal' | 'koreanDigital2' | 'vietnameseCounting' | 'russianLower' | 'russianUpper' | 'none' | 'numberInDash' | 'hebrew1' | 'hebrew2' | 'arabicAlpha' | 'arabicAbjad' | 'hindiVowels' | 'hindiConsonants' | 'hindiNumbers' | 'hindiCounting' | 'thaiLetters' | 'thaiNumbers' | 'thaiCounting';
/**
 * Multi-level suffix (what follows the number)
 */
type LevelSuffix = 'tab' | 'space' | 'nothing';
/**
 * One indentation level of an abstract numbering definition (`w:lvl`).
 * Carries the number format, the marker template (`lvlText` — e.g.
 * `"%1.%2."`), the level's paragraph properties (indent, hanging) and
 * character properties (font, size, color for the marker itself).
 *
 * `ilvl` ranges 0-8 in standard Word documents.
 */
interface ListLevel {
    /** Level index (0-8) */
    ilvl: number;
    /** Starting number */
    start?: number;
    /** Number format */
    numFmt: NumberFormat;
    /** Level text (e.g., "%1." or "•") */
    lvlText: string;
    /** Justification */
    lvlJc?: 'left' | 'center' | 'right';
    /** Suffix after number */
    suffix?: LevelSuffix;
    /** Paragraph properties for this level */
    pPr?: ParagraphFormatting;
    /** Run properties for the number/bullet */
    rPr?: TextFormatting;
    /** Restart numbering from higher level */
    lvlRestart?: number;
    /** Is legal numbering style */
    isLgl?: boolean;
    /** Legacy settings */
    legacy?: {
        legacy?: boolean;
        legacySpace?: number;
        legacyIndent?: number;
    };
}
/**
 * Abstract numbering definition (`w:abstractNum`) — the reusable template
 * for a list: which `NumberFormat` at each indentation level, what
 * marker text, what paragraph/character formatting. Multiple
 * `NumberingInstance`s (`w:num`) can reference one abstract numbering
 * to share the template while keeping independent counters.
 *
 * See ECMA-376 §17.9.
 */
interface AbstractNumbering {
    /** Abstract numbering ID */
    abstractNumId: number;
    /** Multi-level type */
    multiLevelType?: 'hybridMultilevel' | 'multilevel' | 'singleLevel';
    /** Numbering style link */
    numStyleLink?: string;
    /** Style link */
    styleLink?: string;
    /** Level definitions */
    levels: ListLevel[];
    /** Name */
    name?: string;
}
/**
 * Numbering instance (w:num)
 */
interface NumberingInstance {
    /** Numbering ID (referenced by paragraphs) */
    numId: number;
    /** Reference to abstract numbering */
    abstractNumId: number;
    /** Level overrides */
    levelOverrides?: Array<{
        ilvl: number;
        startOverride?: number;
        lvl?: ListLevel;
    }>;
}
/**
 * Computed list marker for one paragraph — what the layout engine and
 * painter need to render the "1.", "a)", "•" prefix. Not part of the
 * wire format; the parser fills this from the `numbering.xml` chain plus
 * the paragraph's `numPr`. Paragraphs without list rendering omit it.
 */
interface ListRendering {
    /** Computed marker text (e.g., "1.", "a)", "•") */
    marker: string;
    /**
     * Level indents the paragraph inherits when neither direct formatting nor
     * the style chain sets its own; applied at layout time so the paragraph's
     * authored properties stay authored.
     */
    indentLeft?: number;
    indentFirstLine?: number;
    hangingIndent?: boolean;
    /** List level (0-8) */
    level: number;
    /** Numbering ID */
    numId: number;
    /** Whether this is a bullet or numbered list */
    isBullet: boolean;
    /** Number format type (decimal, lowerRoman, upperRoman, etc.) */
    numFmt?: NumberFormat;
    /** Whether the list marker is hidden (w:vanish on level rPr) */
    markerHidden?: boolean;
    /** Marker font family from numbering level rPr (ascii name) */
    markerFontFamily?: string;
    /** Marker font size from numbering level rPr, in points */
    markerFontSize?: number;
    /** Marker bold from numbering level rPr, explicit false preserves Word normal */
    markerBold?: boolean;
    /** Marker italic from numbering level rPr */
    markerItalic?: boolean;
    /** Marker color from numbering level rPr */
    markerColor?: ColorValue;
    /**
     * Suffix character placed after the marker before body text (§17.9.25).
     * Default is `tab`; `space` inserts a single space; `nothing` no gap.
     * Drives marker-slot sizing in `getListMarkerInlineWidth`.
     */
    markerSuffix?: LevelSuffix;
    /**
     * NumberFormat for each level from 0..ilvl (inclusive).
     * Used to resolve multi-level templates like "%1.%2." where each %N
     * may need a different format (e.g., upperRoman parent + decimal child).
     */
    levelNumFmts?: NumberFormat[];
    /** abstractNumId the paragraph's numId points to (counters key on this). */
    abstractNumId?: number;
    /**
     * Start value from the numId's lvlOverride for the paragraph's ilvl, if any.
     * Per ECMA-376 §17.9.18, this resets the shared abstractNum counter the
     * first time the numId appears.
     */
    startOverride?: number;
}
/**
 * Top-level numbering data from `numbering.xml` — the set of abstract
 * templates and the per-document `NumberingInstance`s that reference
 * them. Paragraphs reference a `numId` (instance), not an
 * `abstractNumId` directly.
 */
interface NumberingDefinitions {
    /** Abstract numbering definitions */
    abstractNums: AbstractNumbering[];
    /** Numbering instances */
    nums: NumberingInstance[];
}

/**
 * Math equations (`m:oMath`, `m:oMathPara`). OMML XML is round-tripped
 * verbatim to preserve fidelity Word/Pages/Docs can disagree on.
 */
/**
 * Math equation content (m:oMath or m:oMathPara)
 */
interface MathEquation {
    type: 'mathEquation';
    /** Whether this is a block (oMathPara) or inline (oMath) equation */
    display: 'inline' | 'block';
    /** Raw OMML XML for round-trip preservation */
    ommlXml: string;
    /** Plain text representation for accessibility/fallback */
    plainText?: string;
}

/**
 * Tables (`w:tbl`), rows (`w:tr`), and cells (`w:tc`).
 */

/**
 * Table cell (`w:tc`). Holds nested block content (paragraphs and nested
 * tables), cell-level formatting (borders, shading, vertical merge),
 * tracked property changes, and tracked structural changes for cell
 * insert/delete/merge operations.
 */
interface TableCell {
    type: 'tableCell';
    /** Cell formatting */
    formatting?: TableCellFormatting;
    /** Cell-level tracked property changes (w:tcPrChange) */
    propertyChanges?: TableCellPropertyChange[];
    /** Tracked structural changes (cell insert/delete/merge) */
    structuralChange?: TableStructuralChangeInfo;
    /** Cell content (paragraphs, tables, etc.) */
    content: BlockContent[];
}
/**
 * Table row (`w:tr`) — an ordered list of `TableCell` plus row-level
 * formatting (height, repeated header, cantSplit) and tracked changes
 * for inserts/deletes.
 */
interface TableRow {
    type: 'tableRow';
    extraAttributes?: {
        name: string;
        value: string;
    }[];
    /** Row formatting */
    formatting?: TableRowFormatting;
    /** Row-level tracked property changes (w:trPrChange) */
    propertyChanges?: TableRowPropertyChange[];
    /** Tracked structural changes (row insert/delete) */
    structuralChange?: TableStructuralChangeInfo;
    /** Cells in this row */
    cells: TableCell[];
}
/**
 * Table (`w:tbl`) — a block-level grid of rows × cells. Tables carry
 * their own formatting layer (borders, shading, alignment, indent,
 * floating placement) and an explicit column-width grid in twips. Tables
 * can nest arbitrarily through `TableCell.content`.
 *
 * See ECMA-376 §17.4.
 */
interface Table {
    type: 'table';
    /** Table formatting */
    formatting?: TableFormatting;
    /** Table-level tracked property changes (w:tblPrChange) */
    propertyChanges?: TablePropertyChange[];
    /** Column widths in twips */
    columnWidths?: number[];
    /** Table rows */
    rows: TableRow[];
}

interface RawXml {
    type: 'rawXml';
    xml: string;
    /** The source occurrence of its first `w:p`, on documents parsed for an editing session. */
    sourceOrdinal?: number;
}

/**
 * Watermark — the MS Word "Design → Watermark" feature.
 *
 * In OOXML a watermark is legacy VML stored inside a header part, inside a
 * paragraph run: `<w:pict><v:shape>…</v:shape></w:pict>`. It renders behind
 * the body content on every page of the section. Word supports two kinds:
 *
 * - **Text** — `<v:shape type="#_x0000_t136"><v:textpath string="DRAFT"/>`
 *   with a fill color, font, optional rotation (diagonal vs horizontal) and a
 *   reduced-opacity "semitransparent" look.
 * - **Picture** — `<v:shape><v:imagedata r:id="rIdN"/>` referencing a media
 *   file, scaled, optionally "washed out" (lightened).
 *
 * We model the watermark as a dedicated field on the owning `HeaderFooter`
 * rather than as editable run content, so it stays out of the text flow while
 * still round-tripping through parse → render → serialize.
 */
/**
 * Text watermark (e.g. "CONFIDENTIAL", "DRAFT").
 */
interface TextWatermark {
    kind: 'text';
    /** The watermark text. */
    text: string;
    /** Font family (e.g. 'Calibri'). */
    font: string;
    /** Fill color as a CSS hex string (e.g. '#C0C0C0'). */
    color: string;
    /** Word's "Semitransparent" checkbox — renders at reduced opacity. */
    semitransparent: boolean;
    /** Diagonal (≈ -45°) or horizontal layout. */
    layout: 'diagonal' | 'horizontal';
    /** Font size in points. When undefined the renderer auto-sizes to the page (Word's "Auto"). */
    fontSize?: number;
    /** Accessibility flag. Undefined defaults to true for watermarks. */
    decorative?: boolean;
}
/**
 * Picture watermark — a scaled, optionally washed-out background image.
 */
interface PictureWatermark {
    kind: 'picture';
    /** Header-part relationship id of the media (set for images parsed from an existing file). */
    relId?: string;
    /** Package path of the media, e.g. 'word/media/image1.png'. */
    mediaPath?: string;
    /** Raw bytes for an image added in-editor (no rId yet). */
    data?: Uint8Array;
    /** MIME type for `data`. */
    contentType?: string;
    /** Ready-to-use data URL for rendering (resolved from media or `data`). */
    dataUrl?: string;
    /** Scale factor; 1 = 100% / Word's "Auto". */
    scale: number;
    /** Word's "Washout" checkbox — lightens the image so text stays readable. */
    washout: boolean;
    /** Natural width in EMUs (when known). */
    widthEmu?: number;
    /** Natural height in EMUs (when known). */
    heightEmu?: number;
    /** Accessibility flag. Undefined defaults to true for watermarks. */
    decorative?: boolean;
}
/**
 * A document watermark — text or picture.
 */
type Watermark = TextWatermark | PictureWatermark;
/**
 * Default text-watermark presets shown in the watermark dialog, mirroring the
 * canned phrases MS Word offers. Adapters expose a `watermarkPresets` prop to
 * override this list; both React and Vue fall back to these when unset.
 */
declare const DEFAULT_WATERMARK_PRESETS: readonly string[];
/**
 * Compute the display dimensions (in EMUs) for a picture watermark from the
 * source image's natural pixel size. Bounds the larger side to a page-sized
 * default and derives the other from the aspect ratio, so the watermark is
 * never distorted (the serializer would otherwise force a square) and never
 * overflows the page. Returns `undefined` for an unusable size (zero/NaN),
 * letting callers fall back to defaults.
 */
declare function pictureWatermarkDisplayEmu(naturalWidthPx: number, naturalHeightPx: number): {
    widthEmu: number;
    heightEmu: number;
} | undefined;

/**
 * Page furniture — headers (`w:hdr`), footers (`w:ftr`), footnotes
 * (`w:footnote`), and endnotes (`w:endnote`), plus the section-level
 * properties (`w:footnotePr`/`w:endnotePr`) that configure note layout.
 */

/**
 * Header/footer type
 */
type HeaderFooterType = 'default' | 'first' | 'even';
/**
 * Header or footer reference
 */
interface HeaderReference {
    type: HeaderFooterType;
    rId: string;
}
interface FooterReference {
    type: HeaderFooterType;
    rId: string;
}
/**
 * Header or footer content
 */
interface HeaderFooter {
    type: 'header' | 'footer';
    /** Header/footer type */
    hdrFtrType: HeaderFooterType;
    /** Content (paragraphs, tables, etc.) */
    content: BlockContent[];
    /** Root bindings and attributes retained outside the standard boilerplate. */
    customRootBindings?: {
        name: string;
        value: string;
    }[];
    /**
     * Watermark stored on this header (MS Word "Design → Watermark"). Lives
     * here, not in `content`, so it stays out of the editable text flow while
     * still round-tripping. Only headers carry watermarks; footers never do.
     */
    watermark?: Watermark;
}
/**
 * Footnote position
 */
type FootnotePosition = 'pageBottom' | 'beneathText' | 'sectEnd' | 'docEnd';
/**
 * Endnote position
 */
type EndnotePosition = 'sectEnd' | 'docEnd';
/**
 * Number restart type
 */
type NoteNumberRestart = 'continuous' | 'eachSect' | 'eachPage';
/** Shared note kind used by footnote/endnote layout contracts. */
type NoteKind = 'footnote' | 'endnote';
/** Reference to a special separator/continuation note. */
interface NoteSeparatorReference {
    kind?: 'separator' | 'continuationSeparator' | 'continuationNotice';
    noteId?: number;
}
/**
 * Footnote properties
 */
interface FootnoteProperties {
    position?: FootnotePosition;
    numFmt?: NumberFormat;
    numStart?: number;
    numRestart?: NoteNumberRestart;
    /** Optional custom number-format string (`w:numFmt/@w:format`). */
    customNumberFormat?: string;
    /** Authored special-note references. Undefined = package defaults. */
    separators?: NoteSeparatorReference[];
}
/**
 * Endnote properties
 */
interface EndnoteProperties {
    position?: EndnotePosition;
    numFmt?: NumberFormat;
    numStart?: number;
    numRestart?: NoteNumberRestart;
    /** Optional custom number-format string (`w:numFmt/@w:format`). */
    customNumberFormat?: string;
    /** Authored special-note references. Undefined = package defaults. */
    separators?: NoteSeparatorReference[];
}
/**
 * Footnote (w:footnote)
 */
interface Footnote {
    type: 'footnote';
    /** Footnote ID */
    id: number;
    /** Special footnote type */
    noteType?: 'normal' | 'separator' | 'continuationSeparator' | 'continuationNotice';
    /**
     * Content. Per ECMA-376 §17.11.10 footnotes can hold the same blocks as
     * the body, so the note parser reuses the body's `parseBlockContent`: the
     * full block model — paragraphs, tables, and block-level `w:sdt` content
     * controls (as `BlockSdt`) — flows through the resident Rust layout path
     * and stays editable on round-trip.
     */
    content: BlockContent[];
    /** Inherited root bindings required by foreign note content. */
    customRootBindings?: {
        name: string;
        value: string;
    }[];
    /** Verbatim note XML for unmodeled bookmarks or custom XML. */
    verbatimXml?: string;
    /** The source occurrence of the verbatim note's first `w:p`, on documents parsed for an editing session. */
    sourceOrdinal?: number;
}
/**
 * Endnote (w:endnote)
 */
interface Endnote {
    type: 'endnote';
    /** Endnote ID */
    id: number;
    /** Special endnote type */
    noteType?: 'normal' | 'separator' | 'continuationSeparator' | 'continuationNotice';
    /**
     * Content. Per ECMA-376 §17.11.4 endnotes can hold the same blocks as
     * the body — paragraphs, tables, and block-level content controls. See note
     * on `Footnote.content`.
     */
    content: BlockContent[];
    /** Inherited root bindings required by foreign note content. */
    customRootBindings?: {
        name: string;
        value: string;
    }[];
    /** Verbatim note XML for unmodeled blocks. */
    verbatimXml?: string;
    /** The source occurrence of the verbatim note's first `w:p`, on documents parsed for an editing session. */
    sourceOrdinal?: number;
}

/**
 * Comments (`w:comment` in `comments.xml`) and the inline range markers
 * (`w:commentRangeStart`/`End`) that anchor them inside paragraphs.
 */

/** Stable reviewer/color assignment shared by comments and revisions. */
interface CommentAuthor {
    id?: string;
    name?: string;
    initials?: string;
    paletteIndex?: number;
    color?: string;
}
/** Exact model anchor for a comment range. */
interface CommentAnchorRange {
    startBlockId?: string | number;
    startOffset?: number;
    endBlockId?: string | number;
    endOffset?: number;
    collapsed?: boolean;
    objectId?: string;
}
/**
 * A comment from `comments.xml` — the top-level entity for review
 * comments and replies. `id` matches the inline `CommentRangeStart` /
 * `CommentRangeEnd` markers that anchor it inside a paragraph; `parentId`
 * threads replies under their parent; `done` reflects Word's "Resolve"
 * state (`w15:done`).
 */
interface Comment {
    /** Comment ID (matches commentRangeStart/End) */
    id: number;
    /** Author name */
    author: string;
    /** Author initials */
    initials?: string;
    /** Date */
    date?: string;
    /** Comment content (paragraphs) */
    content: Paragraph[];
    /** Parent comment ID (for replies) */
    parentId?: number;
    /** Whether the comment is resolved/done */
    done?: boolean;
    /** Explicit status. Undefined is derived from `done` (false/active). */
    status?: 'active' | 'resolved';
    /** Stable reviewer/person id from modern comment parts. */
    authorId?: string;
    /** Durable modern-comment id. */
    durableId?: string;
    /** Paragraph id used to join commentsExtended metadata. */
    paraId?: string;
    /** UTC timestamp from modern comment metadata. */
    dateUtc?: string;
    /** Stable author-palette index. Undefined = derive by first occurrence. */
    paletteIndex?: number;
    /** Exact range/object anchor. Undefined = use inline markers. */
    anchorRange?: CommentAnchorRange;
    /** Rich block content. Undefined = use legacy paragraph-only `content`. */
    blockContent?: BlockContent[];
}
/**
 * Comment range start marker in paragraph content
 */
interface CommentRangeStart {
    type: 'commentRangeStart';
    id: number;
    /** Block-local offset. Undefined = marker position in source order. */
    offset?: number;
}
/**
 * Comment range end marker in paragraph content
 */
interface CommentRangeEnd {
    type: 'commentRangeEnd';
    id: number;
    /** Block-local offset. Undefined = marker position in source order. */
    offset?: number;
}

/**
 * Section properties (`w:sectPr`) — page size and margins, columns,
 * header/footer references, line numbers, page borders, document grid,
 * paper sources — plus the section and document-body containers that
 * group block-level content.
 */

/**
 * Page orientation
 */
type PageOrientation = 'portrait' | 'landscape';
/**
 * Section start type
 */
type SectionStart = 'continuous' | 'nextPage' | 'oddPage' | 'evenPage' | 'nextColumn';
/**
 * Vertical alignment
 */
type VerticalAlign = 'top' | 'center' | 'both' | 'bottom';
/**
 * Line number restart type
 */
type LineNumberRestart = 'continuous' | 'newPage' | 'newSection';
/**
 * Column definition
 */
interface Column {
    /** Column width in twips */
    width?: number;
    /** Space after column in twips */
    space?: number;
}
/** Section-scoped page label settings from `w:pgNumType`. */
interface PageNumberingProperties {
    /** Logical page-number restart (`@w:start`). Undefined = continue. */
    start?: number;
    /** Number format (`@w:fmt`). Undefined = decimal. */
    format?: NumberFormat;
    /** Heading/list outline level used for chapter prefixes (`@w:chapStyle`). */
    chapterStyle?: number;
    /** Chapter/page separator (`@w:chapSep`). Undefined = hyphen. */
    chapterSeparator?: 'colon' | 'emDash' | 'enDash' | 'hyphen' | 'period';
}
/**
 * Section properties (`w:sectPr`) — page geometry, margins, columns,
 * header/footer references, and page numbering for one section of the
 * document. Sections are introduced by inline `sectPr` markers on the
 * terminating paragraph (`Paragraph.sectionProperties`) and the body's
 * final `sectPr`.
 *
 * All distance units are twips (1/20 of a point) on the wire. The layout
 * engine converts to pixels.
 *
 * See ECMA-376 §17.6.
 */
interface SectionProperties {
    /** Stable section identity. Undefined preserves positional identity. */
    sectionId?: string;
    /** Page width in twips */
    pageWidth?: number;
    /** Page height in twips */
    pageHeight?: number;
    /** Page orientation */
    orientation?: PageOrientation;
    /** Top margin in twips */
    marginTop?: number;
    /** Bottom margin in twips */
    marginBottom?: number;
    /** Left margin in twips */
    marginLeft?: number;
    /** Right margin in twips */
    marginRight?: number;
    /** Header distance from top in twips */
    headerDistance?: number;
    /** Footer distance from bottom in twips */
    footerDistance?: number;
    /** Gutter margin in twips */
    gutter?: number;
    /** Number of columns */
    columnCount?: number;
    /** Space between columns in twips */
    columnSpace?: number;
    /** Equal width columns */
    equalWidth?: boolean;
    /** Separator line between columns */
    separator?: boolean;
    /** Individual column definitions */
    columns?: Column[];
    /**
     * Number of columns the footnote area is laid out in (`w15:footnoteColumns`).
     * Word's "Footnote layout → Columns" setting, independent of the body column
     * count above. Undefined/1 means the footnote area follows the body (single
     * column for a single-column section). See ECMA-376 + the w15 extension.
     */
    footnoteColumns?: number;
    /** Section start type */
    sectionStart?: SectionStart;
    /** Vertical alignment of text */
    verticalAlign?: VerticalAlign;
    /** Right-to-left section */
    bidi?: boolean;
    /** Header references */
    headerReferences?: HeaderReference[];
    /** Footer references */
    footerReferences?: FooterReference[];
    /** Different first page header/footer */
    titlePg?: boolean;
    /** Different odd/even page headers/footers */
    evenAndOddHeaders?: boolean;
    /** Line numbering settings */
    lineNumbers?: {
        start?: number;
        countBy?: number;
        distance?: number;
        restart?: LineNumberRestart;
    };
    /** Section-scoped page-number restart/format (`w:pgNumType`). */
    pageNumbering?: PageNumberingProperties;
    /** Page borders */
    pageBorders?: {
        top?: BorderSpec;
        bottom?: BorderSpec;
        left?: BorderSpec;
        right?: BorderSpec;
        /** Display setting */
        display?: 'allPages' | 'firstPage' | 'notFirstPage';
        /** Offset from */
        offsetFrom?: 'page' | 'text';
        /** Z-order */
        zOrder?: 'front' | 'back';
    };
    /** Page background */
    background?: {
        color?: ColorValue;
        themeColor?: ThemeColorSlot;
        themeTint?: string;
        themeShade?: string;
    };
    /** Effective header-owned watermark projection. Undefined = none/inherit. */
    watermark?: Watermark;
    /** Footnote properties for this section */
    footnotePr?: FootnoteProperties;
    /** Endnote properties for this section */
    endnotePr?: EndnoteProperties;
    /** Document grid */
    docGrid?: {
        type?: 'default' | 'lines' | 'linesAndChars' | 'snapToChars';
        linePitch?: number;
        charSpace?: number;
    };
    /** First page paper source */
    paperSrcFirst?: number;
    /** Other pages paper source */
    paperSrcOther?: number;
}
/**
 * Block-level content types
 */
type BlockContent = Paragraph | Table | BlockSdt | RawXml;
/**
 * One section of the document — a `SectionProperties` plus the block
 * content (`Paragraph`s and `Table`s) that lives under those properties.
 *
 * Sections are derived during parse: every paragraph carrying an inline
 * `sectPr` ends a section, and the body's final `sectPr` defines the
 * last section. Each section may carry its own headers/footers map.
 */
interface Section {
    /** Stable section identity. Undefined = derive from array position. */
    id?: string;
    /** Section properties */
    properties: SectionProperties;
    /** Content in this section */
    content: BlockContent[];
    /** Headers for this section */
    headers?: Map<HeaderFooterType, HeaderFooter>;
    /** Footers for this section */
    footers?: Map<HeaderFooterType, HeaderFooter>;
}
/**
 * Document body (`w:body`) — the editable content of the document.
 *
 * Contains the ordered block content (paragraphs and tables), the section
 * layout chain derived from inline `sectPr` markers, the final `sectPr`,
 * and any document-level comments. This is what most edit operations
 * mutate; headers/footers/styles live elsewhere in the package.
 */
interface DocumentBody {
    /** All content (paragraphs, tables) */
    content: BlockContent[];
    /** Sections (derived from sectPr in paragraphs and final sectPr) */
    sections?: Section[];
    /** Final section properties (from body's sectPr) */
    finalSectionProperties?: SectionProperties;
    /** Root bindings and attributes retained outside the standard boilerplate. */
    customRootBindings?: {
        name: string;
        value: string;
    }[];
    /** Comments from comments.xml */
    comments?: Comment[];
    /** Stable reviewer palette metadata. Undefined = derive colors by author order. */
    commentAuthors?: CommentAuthor[];
}

/**
 * Structured Document Tags / content controls (`w:sdt`) — inline and
 * block variants, plus properties (alias, tag, lock, list items,
 * checkbox state) for the supported SDT types.
 */

/** Glyph/font pair used by checkbox states (`w14:*State`). */
interface SdtCheckboxGlyph {
    /** Unicode code point as authored. Undefined = Word default glyph. */
    value?: string;
    /** Glyph font. Undefined = inherit/control default. */
    font?: string;
}
/** Projected date-control state (`w:date`). */
interface SdtDateState {
    fullDate?: string;
    format?: string;
    language?: string;
    calendar?: string;
    storageFormat?: 'date' | 'dateTime' | 'text';
}
/** Projected building-block gallery/list settings. */
interface SdtGalleryState {
    gallery?: string;
    category?: string;
    unique?: boolean;
}
/** Renderer/editor-neutral typed-control state. Missing members are unset. */
interface SdtControlState {
    value?: string;
    checked?: boolean;
    selectedIndex?: number;
    selectedValue?: string;
    enabled?: boolean;
    placeholder?: boolean;
}
/**
 * SDT type (content control type).
 *
 * Values mirror the `w:sdtPr` type-marker element names from ECMA-376
 * §17.5.2 (`CT_SdtPr`), with two deliberate exceptions:
 * - `checkbox` is the `w14:checkbox` (Office 2010) extension, not a base
 *   OOXML type marker.
 * - `buildingBlockGallery` covers both `w:docPartObj` and `w:docPartList`.
 *
 * A `w:sdtPr` with no type marker means `richText` (the spec default). A
 * type marker the parser does not model maps to `unknown` — it is never
 * coerced to `richText`, so the projection stays honest. Round-trip
 * fidelity does not depend on this enum: the raw `w:sdtPr` is replayed
 * verbatim (see `rawPropertiesXml`).
 */
type SdtType = 'richText' | 'plainText' | 'date' | 'dropDownList' | 'comboBox' | 'checkbox' | 'picture' | 'buildingBlockGallery' | 'group' | 'equation' | 'citation' | 'bibliography' | 'repeatingSection' | 'repeatingSectionItem' | 'unknown';
/**
 * XML data binding (`w:dataBinding`) — links a content control to a node in a
 * Custom XML data store. Modeled read-only; the binding round-trips verbatim
 * via `rawPropertiesXml` (this projection is for inspection, e.g. "which
 * controls are bound, and to what XPath"). The editor does not resolve or
 * sync bound values.
 */
interface SdtDataBinding {
    /** XPath into the bound Custom XML part (`w:xpath`). */
    xpath?: string;
    /** Target Custom XML store id (`w:storeItemID`). */
    storeItemID?: string;
    /** Namespace prefix mappings used by the XPath (`w:prefixMappings`). */
    prefixMappings?: string;
}
/**
 * SDT properties (`w:sdtPr`).
 *
 * The modeled fields are a **read-only projection** for downstream tooling
 * (tag/alias addressing, template extraction). They are NOT the
 * serialization source: the original `w:sdtPr` is captured verbatim in
 * `rawPropertiesXml` and replayed on save, which preserves element order
 * (`CT_SdtPr` is an `xsd:sequence`), avoids double-emission, and keeps
 * unmodeled features (data binding, `w15:*`, `@lastValue`) lossless.
 */
interface SdtProperties {
    /** SDT type (projection; see {@link SdtType}). */
    sdtType: SdtType;
    /** Unique numeric id (`w:id`, signed). */
    id?: number;
    /** Alias (friendly name, `w:alias`). */
    alias?: string;
    /** Tag (developer identifier, `w:tag`). */
    tag?: string;
    /** Lock setting (`w:lock`). */
    lock?: 'sdtLocked' | 'contentLocked' | 'sdtContentLocked' | 'unlocked';
    /**
     * Placeholder building-block name (`w:placeholder/w:docPart@w:val`).
     * This is a reference to a glossary docPart that supplies the placeholder
     * content — NOT the literal placeholder text.
     */
    placeholder?: string;
    /** Whether the control is currently showing its placeholder (`w:showingPlcHdr`). */
    showingPlaceholder?: boolean;
    /** Date display format for date controls (`w:date/w:dateFormat@w:val`). */
    dateFormat?: string;
    /** Dropdown/combobox list items. */
    listItems?: {
        displayText: string;
        value: string;
    }[];
    /** Checkbox checked state (`w14:checkbox`). */
    checked?: boolean;
    /** Run properties applied to the control (`w:sdtPr/w:rPr`). */
    runProperties?: TextFormatting;
    /** Remove the control wrapper after editing (`w:temporary`). Undefined = false. */
    temporary?: boolean;
    /** Numeric label (`w:label/@w:val`). */
    label?: number;
    /** Keyboard tab index (`w:tabIndex/@w:val`). */
    tabIndex?: number;
    /** Plain-text control multiline flag. Undefined = false. */
    multiLine?: boolean;
    /** Complete date-control metadata. Undefined = legacy `dateFormat` only. */
    dateState?: SdtDateState;
    /** Last dropdown/combo value (`w:lastValue`). */
    listLastValue?: string;
    /** Checked glyph/font (`w14:checkedState`). */
    checkedState?: SdtCheckboxGlyph;
    /** Unchecked glyph/font (`w14:uncheckedState`). */
    uncheckedState?: SdtCheckboxGlyph;
    /** Building-block gallery metadata. */
    gallery?: SdtGalleryState;
    /** Office content-control appearance. Undefined = bounding box. */
    appearance?: 'boundingBox' | 'tags' | 'hidden';
    /** Office content-control accent color. Undefined = host/Word default. */
    color?: ColorValue;
    /** Typed state used by overlays. Undefined = derive from cached content. */
    controlState?: SdtControlState;
    /** `w15:repeatingSection` marker. Undefined = false. */
    repeatingSection?: boolean;
    /** `w15:repeatingSectionItem` marker. Undefined = false. */
    repeatingSectionItem?: boolean;
    /** XML data binding (`w:dataBinding`), if the control is bound. */
    dataBinding?: SdtDataBinding;
    /**
     * The original `<w:sdtPr>` serialized verbatim as an XML string, captured
     * at parse time. Replayed unchanged on save so the properties block
     * round-trips losslessly. Stored as a string so the types layer stays free
     * of parser-specific node types. Absent for SDTs created programmatically —
     * the serializer then synthesizes a minimal, sequence-valid `w:sdtPr` from
     * the modeled fields.
     */
    rawPropertiesXml?: string;
    /** The original `<w:sdtEndPr>` serialized verbatim, if present. */
    rawEndPropertiesXml?: string;
}
/**
 * Inline SDT (content control within a paragraph)
 */
interface InlineSdt {
    type: 'inlineSdt';
    /** SDT properties */
    properties: SdtProperties;
    /**
     * Inline content held inside the control. OOXML allows runs,
     * hyperlinks, simple/complex fields, nested SDTs, and math at this
     * level; the renderer must descend into all of them so docProps-bound
     * fields and similar template content survive paged rendering.
     */
    content: (Run | Hyperlink | SimpleField | ComplexField | InlineSdt | MathEquation | TrackedRunChange)[];
}
/**
 * Block-level SDT (content control wrapping block content).
 *
 * `content` is `BlockContent[]` (not just paragraphs/tables) so a nested
 * block SDT survives the round trip. `CT_SdtContentBlock` also permits
 * run-level content (bookmarks, etc.); that is carried through the same
 * block-content parsing as elsewhere in the document.
 */
interface BlockSdt {
    type: 'blockSdt';
    /** SDT properties */
    properties: SdtProperties;
    /** Block content inside the control */
    content: BlockContent[];
}

/**
 * Hyperlinks (`w:hyperlink`), bookmark markers (`w:bookmarkStart`/`End`),
 * and field types (`w:fldSimple`, complex `w:fldChar` runs).
 */

/** Stable document position used by bookmark and field range contracts. */
interface ContentPosition {
    /** Stable block/paragraph id. Undefined = unresolved. */
    blockId?: string | number;
    /** Inline offset within the block. Undefined = block boundary. */
    offset?: number;
    /** Table/grid ancestry for cross-cell ranges. Undefined = body flow. */
    path?: number[];
}
/** A resolved bookmark range; absent endpoints represent an unresolved marker. */
interface BookmarkRange {
    id?: number;
    name?: string;
    start?: ContentPosition;
    end?: ContentPosition;
    colFirst?: number;
    colLast?: number;
}
/**
 * Hyperlink (`w:hyperlink`) — wraps runs in a clickable link. External
 * targets resolve through the relationships part (`rId` → `href`);
 * internal targets reference a `BookmarkStart` anchor by name.
 */
interface Hyperlink {
    type: 'hyperlink';
    /** Relationship ID for external link */
    rId?: string;
    /** Resolved URL (from relationships) */
    href?: string;
    /** Internal bookmark anchor */
    anchor?: string;
    /** Tooltip text */
    tooltip?: string;
    /** Target frame */
    target?: string;
    /** Link history tracking */
    history?: boolean;
    /** Document location */
    docLocation?: string;
    /** Child runs */
    children: (Run | BookmarkStart | BookmarkEnd)[];
    /**
     * Recursive `EG_PContent` projection for fields, SDTs, math, and bookmarks.
     * Undefined means consumers use the legacy `children` run list.
     */
    structuredChildren?: HyperlinkContent[];
}
/** Recursive hyperlink child grammar. Nested hyperlinks remain invalid. */
type HyperlinkContent = Run | BookmarkStart | BookmarkEnd | SimpleField | ComplexField | InlineSdt | MathEquation;
/**
 * Bookmark start marker (w:bookmarkStart)
 */
interface BookmarkStart {
    type: 'bookmarkStart';
    /** Bookmark ID */
    id: number;
    /** Bookmark name */
    name: string;
    /** Column index for table bookmarks */
    colFirst?: number;
    colLast?: number;
    /** Exact source position. Undefined = legacy paragraph-boundary behavior. */
    position?: ContentPosition;
}
/**
 * Bookmark end marker (w:bookmarkEnd)
 */
interface BookmarkEnd {
    type: 'bookmarkEnd';
    /** Bookmark ID */
    id: number;
    /** Exact source position. Undefined = legacy paragraph-boundary behavior. */
    position?: ContentPosition;
}
/**
 * Known field types
 */
type FieldType = 'PAGE' | 'NUMPAGES' | 'NUMWORDS' | 'NUMCHARS' | 'DATE' | 'TIME' | 'CREATEDATE' | 'SAVEDATE' | 'PRINTDATE' | 'AUTHOR' | 'TITLE' | 'SUBJECT' | 'KEYWORDS' | 'COMMENTS' | 'FILENAME' | 'FILESIZE' | 'TEMPLATE' | 'DOCPROPERTY' | 'DOCVARIABLE' | 'REF' | 'PAGEREF' | 'NOTEREF' | 'HYPERLINK' | 'TOC' | 'TOA' | 'INDEX' | 'SEQ' | 'STYLEREF' | 'AUTONUM' | 'AUTONUMLGL' | 'AUTONUMOUT' | 'IF' | 'MERGEFIELD' | 'NEXT' | 'NEXTIF' | 'ASK' | 'SET' | 'QUOTE' | 'INCLUDETEXT' | 'INCLUDEPICTURE' | 'SYMBOL' | 'ADVANCE' | 'EDITTIME' | 'REVNUM' | 'SECTION' | 'SECTIONPAGES' | 'USERADDRESS' | 'USERNAME' | 'USERINITIALS' | 'FORMTEXT' | 'FORMCHECKBOX' | 'FORMDROPDOWN' | 'CITATION' | 'BIBLIOGRAPHY' | 'UNKNOWN';
/**
 * Recursive, inert field content. Undefined members are empty; no instruction
 * in this contract is executable merely because it was parsed.
 */
interface StructuredFieldContent {
    /** Inline result/code children in source order. */
    inline?: FieldInlineContent[];
    /** Multi-paragraph/table result children in source order. */
    blocks?: BlockContent[];
}
/** Field-capable inline grammar used by nested field code/results. */
type FieldInlineContent = Run | Hyperlink | InlineSdt | MathEquation | SimpleField | ComplexField;
/** Versioned structured field node; missing version means legacy v0 fields. */
interface StructuredFieldTree {
    /** Contract version. Undefined reads as 0. */
    version?: number;
    /** Parsed code container. Undefined = use legacy code fields. */
    code?: StructuredFieldContent;
    /** Cached result container. Undefined = use legacy result fields. */
    result?: StructuredFieldContent;
    /** Nested child fields in document order. */
    children?: StructuredFieldTree[];
    /** Result/code presentation. Undefined = result. */
    displayMode?: 'result' | 'code';
}
/**
 * Simple field (w:fldSimple)
 */
interface SimpleField {
    type: 'simpleField';
    /** Field instruction (e.g., "PAGE \\* MERGEFORMAT") */
    instruction: string;
    /** Parsed field type */
    fieldType: FieldType;
    /** Current display value */
    content: (Run | Hyperlink)[];
    /** Field is locked */
    fldLock?: boolean;
    /** Field is dirty */
    dirty?: boolean;
    /** Rich recursive result projection. Undefined = use `content`. */
    structuredResult?: StructuredFieldContent;
    /** Parsed/versioned field tree. Undefined = legacy flat field. */
    fieldTree?: StructuredFieldTree;
}
/**
 * Complex field (w:fldChar begin/separate/end with w:instrText)
 */
interface ComplexField {
    type: 'complexField';
    /** Field instruction */
    instruction: string;
    /** Parsed field type */
    fieldType: FieldType;
    /** Field code runs */
    fieldCode: Run[];
    /** Display result runs */
    fieldResult: Run[];
    /**
     * Run formatting carried by the field's structural runs (the runs holding
     * the `w:fldChar` begin/separate/end). Word styles the field result with
     * this `w:rPr` when there is no separate result run (e.g. a `PAGE` field
     * collapsed into a single run). Used as a fallback for rendering and
     * serialization so the formatting survives the round-trip.
     */
    formatting?: TextFormatting;
    /** Field is locked */
    fldLock?: boolean;
    /** Field is dirty */
    dirty?: boolean;
    /** Rich recursive code projection. Undefined = use `fieldCode`. */
    structuredCode?: StructuredFieldContent;
    /** Rich recursive cached result. Undefined = use `fieldResult`. */
    structuredResult?: StructuredFieldContent;
    /** Parsed/versioned nested field tree. Undefined = legacy flat field. */
    fieldTree?: StructuredFieldTree;
}
type Field = SimpleField | ComplexField;

/**
 * Tracked-changes model — insertion/deletion/move wrappers, range
 * markers, and per-element property-change wrappers (`w:rPrChange`,
 * `w:pPrChange`, `w:tblPrChange`, `w:trPrChange`, `w:tcPrChange`) plus
 * structural changes (row/cell insert/delete/merge).
 */

/**
 * Tracked change metadata (w:ins, w:del attributes)
 */
interface TrackedChangeInfo {
    /** Revision ID */
    id: number;
    /** Author who made the change */
    author: string;
    /** Date of the change */
    date?: string;
}
/**
 * Tracked-change attribute triple as it appears on node attrs
 * (`paragraph.pPrIns`, `tableRow.trIns`, etc). Mirrors `TrackedChangeInfo`
 * but with a `null` date (attr defaults) and a `revisionId` name that
 * matches OOXML's `w:id` more idiomatically on the editor side.
 *
 * Round-trip pairs with `TrackedChangeInfo` via
 * `{ id, author, date? } ↔ { revisionId, author, date | null }`.
 */
interface RevisionInfo {
    revisionId: number;
    author: string;
    date: string | null;
}
/**
 * Tracked-cell marker — the OOXML `<w:cellIns>` / `<w:cellDel>` /
 * `<w:cellMerge>` shape attached to a `TableCell` node and surfaced
 * to the layout model and painter for visual rendering.
 *
 * `kind` matches the OOXML element name (ins / del / merge).
 */
interface CellMarker {
    kind: 'ins' | 'del' | 'merge';
    info: RevisionInfo;
}
/**
 * Generic tracked property-change wrapper metadata (w:*PrChange)
 */
interface PropertyChangeInfo extends TrackedChangeInfo {
    /** Optional revision session ID */
    rsid?: string;
}
/**
 * Insertion wrapper (w:ins) — runs inserted by tracked changes
 */
interface Insertion {
    type: 'insertion';
    /** Tracked change metadata */
    info: TrackedChangeInfo;
    /** Inserted content */
    content: (Run | Hyperlink | SimpleField | ComplexField | InlineSdt | MathEquation | TrackedRunChange)[];
}
/**
 * Deletion wrapper (w:del) — runs deleted by tracked changes
 */
interface Deletion {
    type: 'deletion';
    /** Tracked change metadata */
    info: TrackedChangeInfo;
    /** Deleted content */
    content: (Run | Hyperlink | SimpleField | ComplexField | InlineSdt | MathEquation | TrackedRunChange)[];
}
/**
 * Move-from wrapper (w:moveFrom) â€” content moved away from this position
 */
interface MoveFrom {
    type: 'moveFrom';
    /** Tracked change metadata */
    info: TrackedChangeInfo;
    /** Moved content */
    content: (Run | Hyperlink | SimpleField | ComplexField | InlineSdt | MathEquation | TrackedRunChange)[];
}
/**
 * Move-to wrapper (w:moveTo) â€” content moved into this position
 */
interface MoveTo {
    type: 'moveTo';
    /** Tracked change metadata */
    info: TrackedChangeInfo;
    /** Moved content */
    content: (Run | Hyperlink | SimpleField | ComplexField | InlineSdt | MathEquation | TrackedRunChange)[];
}
/**
 * Move-from range start marker (w:moveFromRangeStart) — ECMA-376 §17.13.5.22
 * Pairs with moveFromRangeEnd to delimit the source of a move in the document.
 */
interface MoveFromRangeStart {
    type: 'moveFromRangeStart';
    id: number;
    name: string;
}
/**
 * Move-from range end marker (w:moveFromRangeEnd)
 */
interface MoveFromRangeEnd {
    type: 'moveFromRangeEnd';
    id: number;
}
/**
 * Move-to range start marker (w:moveToRangeStart) — ECMA-376 §17.13.5.24
 * Pairs with moveToRangeEnd to delimit the destination of a move.
 */
interface MoveToRangeStart {
    type: 'moveToRangeStart';
    id: number;
    name: string;
}
/**
 * Move-to range end marker (w:moveToRangeEnd)
 */
interface MoveToRangeEnd {
    type: 'moveToRangeEnd';
    id: number;
}
/**
 * Run-level tracked wrappers represented in WordprocessingML.
 */
type TrackedRunChange = Insertion | Deletion | MoveFrom | MoveTo;
/**
 * Run property change (w:rPrChange)
 */
interface RunPropertyChange {
    type: 'runPropertyChange';
    /** Tracked change metadata */
    info: PropertyChangeInfo;
    /** Run properties before the tracked change */
    previousFormatting?: TextFormatting;
    /** Run properties after the tracked change (editor model convenience) */
    currentFormatting?: TextFormatting;
}
/**
 * Paragraph property change (w:pPrChange)
 */
interface ParagraphPropertyChange {
    type: 'paragraphPropertyChange';
    /** Tracked change metadata */
    info: PropertyChangeInfo;
    /** Paragraph properties before the tracked change */
    previousFormatting?: ParagraphFormatting;
    /** Paragraph properties after the tracked change (editor model convenience) */
    currentFormatting?: ParagraphFormatting;
}
/**
 * Table property change (w:tblPrChange)
 */
interface TablePropertyChange {
    type: 'tablePropertyChange';
    /** Tracked change metadata */
    info: PropertyChangeInfo;
    /** Table properties before the tracked change */
    previousFormatting?: TableFormatting;
    /** Table properties after the tracked change (editor model convenience) */
    currentFormatting?: TableFormatting;
}
/**
 * Table row property change (w:trPrChange)
 */
interface TableRowPropertyChange {
    type: 'tableRowPropertyChange';
    /** Tracked change metadata */
    info: PropertyChangeInfo;
    /** Row properties before the tracked change */
    previousFormatting?: TableRowFormatting;
    /** Row properties after the tracked change (editor model convenience) */
    currentFormatting?: TableRowFormatting;
}
/**
 * Table cell property change (w:tcPrChange)
 */
interface TableCellPropertyChange {
    type: 'tableCellPropertyChange';
    /** Tracked change metadata */
    info: PropertyChangeInfo;
    /** Cell properties before the tracked change */
    previousFormatting?: TableCellFormatting;
    /** Cell properties after the tracked change (editor model convenience) */
    currentFormatting?: TableCellFormatting;
}
/**
 * Table structural tracked change metadata (row/cell insert/delete/merge)
 */
interface TableStructuralChangeInfo {
    type: 'tableRowInsertion' | 'tableRowDeletion' | 'tableCellInsertion' | 'tableCellDeletion' | 'tableCellMerge';
    /** Tracked change metadata */
    info: TrackedChangeInfo;
    /**
     * `<w:cellMerge w:vMerge="…">` value, only meaningful for `tableCellMerge`.
     * Schema `ST_AnnotationVMerge`: `"rest"` = anchor (start of merged span),
     * `"cont"` = continuation (merged into predecessor). Word's default for a
     * tracked merge is `"cont"` (most edits track "this cell got merged INTO
     * the one above"); we preserve the on-disk value when present.
     */
    vMerge?: 'rest' | 'cont';
    /** `<w:cellMerge w:vMergeOrig="…">` — the pre-merge vMerge state. */
    vMergeOrig?: 'rest' | 'cont';
}

/**
 * Run content (`w:r`) and the inline pieces that live inside a run —
 * text, tab, break, symbol, footnote/endnote references, field chars,
 * instruction text, soft/no-break hyphens, drawings, shapes.
 */

/**
 * Plain text run content (`w:t`). `preserveSpace` mirrors the
 * `xml:space="preserve"` attribute and matters for runs that begin or end
 * with whitespace — without it, Word collapses leading/trailing spaces.
 */
interface TextContent {
    type: 'text';
    /** The text string */
    text: string;
    /** Preserve whitespace (xml:space="preserve") */
    preserveSpace?: boolean;
}
/**
 * Tab character
 */
interface TabContent {
    type: 'tab';
}
/**
 * Line break
 */
interface BreakContent {
    type: 'break';
    /** Break type */
    breakType?: 'page' | 'column' | 'textWrapping';
    /** Clear type for text wrapping break */
    clear?: 'none' | 'left' | 'right' | 'all';
}
/**
 * Symbol character (special font character)
 */
interface SymbolContent {
    type: 'symbol';
    /** Font name */
    font: string;
    /** Character code */
    char: string;
}
/**
 * Footnote or endnote reference
 */
interface NoteReferenceContent {
    type: 'footnoteRef' | 'endnoteRef';
    /** Note ID */
    id: number;
    /** `w:customMarkFollows`; undefined = false/automatic number. */
    customMarkFollows?: boolean;
}
/**
 * Footnote/endnote auto-number mark (`w:footnoteRef` / `w:endnoteRef`).
 *
 * Distinct from {@link NoteReferenceContent}: that is the *reference* placed in
 * the document body (`w:footnoteReference`), whereas this is the numbering
 * placeholder that lives *inside* the note body — the run carrying it is what
 * Word renders as the note's leading superscript number. Preserving it keeps
 * the note's own number visible on round-trip.
 */
interface NoteRefMarkContent {
    type: 'footnoteRefMark' | 'endnoteRefMark';
}
/**
 * Footnote/endnote separator mark (`w:separator` / `w:continuationSeparator`).
 *
 * These appear inside the special separator notes (`w:type="separator"` and
 * `w:type="continuationSeparator"`) and draw the horizontal rule Word places
 * between the body and its notes. They carry no content; Word rejects a notes
 * part whose separator notes have lost these markers, so they must round-trip.
 */
interface SeparatorContent {
    type: 'separator' | 'continuationSeparator';
}
interface HorizontalRuleContent {
    type: 'horizontalRule';
    rule: {
        width: number | null;
        widthPercent: number | null;
        height: number;
        alignment: string;
        noShade: boolean;
        color: string;
        xml: string;
    };
}
/** Legacy `w:ffData` projected as inert form-control state. */
interface FieldFormData {
    name?: string;
    enabled?: boolean;
    helpText?: string;
    statusText?: string;
    entryMacro?: string;
    exitMacro?: string;
    calculateOnExit?: boolean;
    controlType?: 'text' | 'checkbox' | 'dropDown';
    defaultValue?: string;
    textType?: string;
    textFormat?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    checkboxSize?: number;
    listEntries?: string[];
    selectedIndex?: number;
}
/**
 * Field character (begin/separate/end)
 */
interface FieldCharContent {
    type: 'fieldChar';
    /** Field character type */
    charType: 'begin' | 'separate' | 'end';
    /** Field is locked */
    fldLock?: boolean;
    /** Field is dirty (needs update) */
    dirty?: boolean;
    /** Legacy form data. Undefined = no form control. Macros remain inert. */
    formData?: FieldFormData;
}
/** Zero-width `w:commentReference` anchor for point/malformed comments. */
interface CommentReferenceContent {
    type: 'commentReference';
    /** Comment id. Undefined = malformed/unresolved reference. */
    id?: number;
}
/**
 * Field instruction text
 */
interface InstrTextContent {
    type: 'instrText';
    /** Field instruction */
    text: string;
}
/**
 * Soft hyphen
 */
interface SoftHyphenContent {
    type: 'softHyphen';
}
/**
 * Non-breaking hyphen
 */
interface NoBreakHyphenContent {
    type: 'noBreakHyphen';
}
/**
 * Drawing/image reference
 */
interface DrawingContent {
    type: 'drawing';
    /** Image data */
    image: Image;
}
/**
 * Shape reference
 */
interface ShapeContent {
    type: 'shape';
    /** Shape data */
    shape: Shape;
}
/**
 * DrawingML chart reference.
 */
interface ChartContent {
    type: 'chart';
    /** Parsed chart data */
    chart: Chart;
}
/**
 * A drawing the parser does not model, replayed verbatim on save.
 */
interface OpaqueDrawingContent {
    type: 'opaqueDrawing';
    /** Authored element kind (`drawing`, `pict`, `object`, `alternateContent`). */
    kind: string;
    /** Original markup, written back verbatim at the run position. */
    xml: string;
    preview?: Image;
    previews?: Image[];
    textBox?: Shape;
}
/**
 * All possible run content types
 */
type RunContent = TextContent | TabContent | BreakContent | SymbolContent | NoteReferenceContent | NoteRefMarkContent | SeparatorContent | HorizontalRuleContent | CommentReferenceContent | FieldCharContent | InstrTextContent | SoftHyphenContent | NoBreakHyphenContent | DrawingContent | ShapeContent | ChartContent | OpaqueDrawingContent;
/**
 * A run (`w:r`) — a contiguous span of inline content sharing one set of
 * character properties (bold, italic, font, color, etc.). Runs are the
 * atomic unit of character formatting; toggling bold on a selection that
 * spans different formatting creates new runs.
 *
 * See ECMA-376 §17.3.2.
 *
 * @example
 * ```ts
 * const run: Run = {
 *   type: 'run',
 *   formatting: { bold: true },
 *   content: [{ type: 'text', text: 'Hello' }],
 * };
 * ```
 */
interface Run {
    type: 'run';
    /** Text formatting properties */
    formatting?: TextFormatting;
    /** Run-level tracked property changes (w:rPrChange) */
    propertyChanges?: RunPropertyChange[];
    /** Run content (text, tabs, breaks, etc.) */
    content: RunContent[];
}

/**
 * Paragraph (`w:p`) — the union of inline content that can sit inside a
 * paragraph (runs, hyperlinks, bookmarks, fields, SDT, comment ranges,
 * tracked-change wrappers, math) plus paragraph-level metadata
 * (formatting, list rendering, optional terminating section properties).
 */

/**
 * Inline content that can appear inside a paragraph. Covers runs (text),
 * hyperlinks, bookmarks, fields, structured document tags, comment range
 * markers, tracked-change wrappers, and math equations. Every node in
 * this union carries a `type` discriminator so consumers can narrow at
 * runtime.
 */
type ParagraphContent = Run | Hyperlink | BookmarkStart | BookmarkEnd | SimpleField | ComplexField | InlineSdt | CommentRangeStart | CommentRangeEnd | Insertion | Deletion | MoveFrom | MoveTo | MoveFromRangeStart | MoveFromRangeEnd | MoveToRangeStart | MoveToRangeEnd | MathEquation | RawXml;
/**
 * Paragraph (`w:p`) — the primary block-level container in a Word document.
 *
 * Every paragraph carries direct formatting (`formatting`), tracked
 * property changes (`propertyChanges`), inline content (`content`), and
 * optional list rendering / section break metadata. `paraId` is Word's
 * paragraph identifier (`w14:paraId`); editing sessions address paragraphs
 * by their own session keys instead.
 *
 * See ECMA-376 §17.3.1.
 */
interface Paragraph {
    type: 'paragraph';
    /**
     * Word paragraph ID (`w14:paraId`), when the paragraph has a valid one.
     * Invalid authored values are kept verbatim in `extraAttributes` but are
     * not an identity.
     */
    paraId?: string;
    /** Set when `paraId` repeats an ID used earlier in the package; it is still this paragraph's own. */
    repeatedParaId?: boolean;
    /**
     * The extra attribute holding an invalid Word 2010 `paraId` under a prefix
     * other than `w14`; a save that sets `paraId` replaces it.
     */
    paraIdAttribute?: string;
    /** This paragraph's `w:p` occurrence in its source part, on documents parsed for an editing session. */
    sourceOrdinal?: number;
    /** Text ID */
    textId?: string;
    /** `w:p` attributes the model does not type, kept verbatim so a save re-emits them. */
    extraAttributes?: {
        name: string;
        value: string;
    }[];
    /** Paragraph formatting */
    formatting?: ParagraphFormatting;
    /** Paragraph-level tracked property changes (w:pPrChange) */
    propertyChanges?: ParagraphPropertyChange[];
    /**
     * Paragraph-mark insertion tracking (`<w:pPr><w:rPr><w:ins/>`). Set when
     * this paragraph's terminating pilcrow was added as a tracked change —
     * e.g., the user pressed Enter mid-paragraph in suggesting mode. Reject
     * joins this paragraph with the following one.
     */
    pPrIns?: TrackedChangeInfo;
    /**
     * Paragraph-mark deletion tracking (`<w:pPr><w:rPr><w:del/>`). Set when
     * this paragraph's terminating pilcrow was deleted as a tracked change —
     * e.g., the user pressed Backspace at the start of the next paragraph in
     * suggesting mode. Accept joins this paragraph with the following one.
     */
    pPrDel?: TrackedChangeInfo;
    /** Paragraph content */
    content: ParagraphContent[];
    /** Computed list rendering (if this is a list item) */
    listRendering?: ListRendering;
    /** Word's cached layout says this paragraph started on a new rendered page. */
    renderedPageBreakBefore?: boolean;
    /** Section properties (if this paragraph ends a section) */
    sectionProperties?: SectionProperties;
}

/**
 * DrawingML shapes (`wps:wsp`) and text boxes — preset shape types,
 * fill, outline, shape text body, transform.
 *
 * This module binds the shared ShapeTextBody to docx paragraphs and keeps the
 * docx-level Shape/TextBox wrappers.
 */

/**
 * Text body inside a shape (content typed as docx paragraphs)
 */
type ShapeTextBody = ShapeTextBody$1<Paragraph>;
/**
 * Shape/drawing object (wps:wsp)
 */
interface Shape {
    type: 'shape';
    /** Shape type preset */
    shapeType: ShapeType;
    /** Unique ID */
    id?: string;
    /** Name */
    name?: string;
    /** Size in EMUs */
    size: ImageSize;
    /** Offset in EMUs relative to the containing drawing/group, if any. */
    offset?: {
        x: number;
        y: number;
    };
    /** Position for floating shapes */
    position?: ImagePosition;
    /** Wrap settings */
    wrap?: ImageWrap;
    /** Fill */
    fill?: ShapeFill;
    /** Outline/stroke */
    outline?: ShapeOutline;
    /** Transform */
    transform?: ImageTransform;
    /** Text content inside the shape */
    textBody?: ShapeTextBody;
    /** Normalized custom or resolved shape geometry path */
    geometryPath?: PresetGeometryPathCommand[];
    /** Nested shapes when this shape is used as a drawing/diagram group. */
    children?: Shape[];
    /** Custom geometry points */
    customGeometry?: string;
    /** General heterogeneous group/canvas scene. Undefined = legacy shape tree. */
    scene?: DrawingScene;
    /** Lossless fill details. Undefined = use `fill`. */
    fillPaint?: ShapeFillPaint;
    /** Lossless stroke details. Undefined = use `outline`. */
    strokePaint?: ShapeStrokePaint;
    /** Ordered 2-D effects. Undefined = none. */
    effects?: ShapeEffect[];
    /** Effect ink/wrap extents in EMUs. Undefined = zero. */
    effectExtent?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    /** Full text-body properties. Undefined = use `textBody` defaults. */
    textBodyProperties?: ShapeTextBodyProperties;
    /** Authored accessibility title. Undefined = use name/text. */
    title?: string;
    /** Authored accessibility description. */
    description?: string;
    /** Decorative flag. Undefined = infer false. */
    decorative?: boolean;
    /** Hidden drawing flag. Undefined = visible. */
    hidden?: boolean;
    /** Stable z-order. Undefined = source order. */
    relativeHeight?: number;
}
/**
 * Text box (floating text container)
 */
interface TextBox {
    type: 'textBox';
    /** Unique ID */
    id?: string;
    /** Size */
    size: ImageSize;
    /** Position */
    position?: ImagePosition;
    /** Wrap settings */
    wrap?: ImageWrap;
    /** Fill */
    fill?: ShapeFill;
    /** Outline */
    outline?: ShapeOutline;
    /** Text content */
    content: Paragraph[];
    /** Internal margins */
    margins?: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
    };
    /** Full block grammar. Undefined = use legacy paragraph-only `content`. */
    blockContent?: BlockContent[];
    /** Full `a:bodyPr` projection. Undefined = legacy margins/top anchor. */
    bodyProperties?: ShapeTextBodyProperties;
}

/**
 * Embedded images (`w:drawing` → `pic:pic`): size, wrap, position,
 * transform, padding, crop.
 */

/** One point in a `wp:wrapPolygon`, in the drawing's authored coordinates. */
interface ImageWrapPoint {
    x?: number;
    y?: number;
}
/**
 * Image size specification
 */
interface ImageSize {
    /** Width in EMUs (English Metric Units) */
    width: number;
    /** Height in EMUs */
    height: number;
}
/**
 * Image wrap type for floating images
 */
interface ImageWrap {
    type: WrapType;
    /** Wrap text direction */
    wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
    /** Distance from text */
    distT?: number;
    distB?: number;
    distL?: number;
    distR?: number;
    /** Tight/through contour. Undefined = rectangular wrap. */
    polygon?: ImageWrapPoint[];
}
/**
 * Position for floating images
 */
interface ImagePosition {
    /** Use `wp:simplePos` instead of positionH/V. Undefined = false. */
    useSimplePos?: boolean;
    /** `wp:simplePos` coordinates in EMUs. */
    simplePos?: {
        x?: number;
        y?: number;
    };
    /** Stable z-order (`wp:anchor/@relativeHeight`). Undefined = source order. */
    relativeHeight?: number;
    /** Behind-text plane (`wp:anchor/@behindDoc`). Undefined = false. */
    behindDoc?: boolean;
    /** Hidden drawing. Undefined = visible. */
    hidden?: boolean;
    /** Locked drawing metadata. Undefined = editable. */
    locked?: boolean;
    /** Horizontal positioning */
    horizontal: {
        relativeTo: 'character' | 'column' | 'insideMargin' | 'leftMargin' | 'margin' | 'outsideMargin' | 'page' | 'rightMargin';
        alignment?: 'left' | 'right' | 'center' | 'inside' | 'outside';
        posOffset?: number;
    };
    /** Vertical positioning */
    vertical: {
        relativeTo: 'insideMargin' | 'line' | 'margin' | 'outsideMargin' | 'page' | 'paragraph' | 'topMargin' | 'bottomMargin';
        alignment?: 'top' | 'bottom' | 'center' | 'inside' | 'outside';
        posOffset?: number;
    };
}
/**
 * Image transformation
 */
interface ImageTransform {
    /** Rotation in degrees */
    rotation?: number;
    /** Flip horizontal */
    flipH?: boolean;
    /** Flip vertical */
    flipV?: boolean;
}
/** Post-transform layout footprint, kept separate from the content frame. */
interface ImageRotationBounds {
    width?: number;
    height?: number;
    offsetX?: number;
    offsetY?: number;
}
/** One ordered DrawingML blip effect. Unknown effects stay named and inert. */
interface ImageEffect {
    kind?: 'brightnessContrast' | 'saturation' | 'grayscale' | 'biLevel' | 'colorChange' | 'duotone' | 'alpha' | 'blur' | 'unknown';
    amount?: number;
    threshold?: number;
    colors?: string[];
    rawName?: string;
}
/** Safe hyperlink metadata attached to picture non-visual properties. */
interface ImageHyperlink {
    href?: string;
    tooltip?: string;
    target?: string;
    history?: boolean;
    docLocation?: string;
}
/**
 * Image padding/margins
 */
interface ImagePadding {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
}
/**
 * Image crop, expressed as fractions of the source image to trim from each
 * edge. OOXML's `<a:srcRect l="10000" t="0" r="5000" b="0"/>` uses units of
 * 1/100000 (so 10000 → 0.1 → 10% trimmed from the left). We store the
 * normalised fraction so both the renderer and the saver can read it
 * directly without re-parsing units.
 */
interface ImageCrop {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
}
/**
 * Embedded image (`w:drawing` with an inline or anchored picture). Carries
 * the relationship-id pointer to the binary in `word/media/`, its
 * resolved data URL (`src`), display dimensions, optional crop /
 * transform / wrap behaviors, and anchor positioning for floating
 * images.
 *
 * See ECMA-376 §20.4 (DrawingML wordprocessingDrawing).
 */
interface Image {
    type: 'image';
    /** Unique ID */
    id?: string;
    /** Relationship ID for the image data */
    rId: string;
    /** Resolved image data (base64 or blob URL) */
    src?: string;
    /** Image MIME type */
    mimeType?: string;
    /** Original filename */
    filename?: string;
    /** Alt text for accessibility */
    alt?: string;
    /** Title/description */
    title?: string;
    /** Image size */
    size: ImageSize;
    /** Original size before any transforms */
    originalSize?: ImageSize;
    /** Wrap settings */
    wrap: ImageWrap;
    /** Position for floating images */
    position?: ImagePosition;
    /** Image transformations */
    transform?: ImageTransform;
    /** Padding around image */
    padding?: ImagePadding;
    /** Source-image crop (fractional, OOXML `a:srcRect`). */
    crop?: ImageCrop;
    /** Picture preset geometry; undefined means rect. */
    shapeType?: string;
    /** Opacity in [0, 1] (OOXML `a:alphaModFix amt`). Undefined = fully opaque. */
    opacity?: number;
    /** Whether this is a decorative image */
    decorative?: boolean;
    /** Whether the picture's aspect ratio is locked. */
    noChangeAspect?: boolean;
    /** VML `o:hr`: Word lays the picture's line at the picture's own height. */
    horizontalRule?: boolean;
    /**
     * `wp:anchor layoutInCell` — when true (default), an anchored image inside
     * a table cell is constrained to the cell. When false, the image escapes
     * the cell into the page area. Round-tripped on save.
     */
    layoutInCell?: boolean;
    /**
     * `wp:anchor allowOverlap` — when true (default), anchored objects may
     * overlap; when false, Word repositions them to avoid collisions. We
     * don't currently reposition; we round-trip the flag so saving preserves
     * the author's intent.
     */
    allowOverlap?: boolean;
    /** Hyperlink URL for clickable image */
    hlinkHref?: string;
    /** Image outline/border */
    outline?: ShapeOutline;
    /** Image effects */
    effects?: {
        brightness?: number;
        contrast?: number;
        saturation?: number;
        /** Ordered blip-effect list. Undefined = legacy scalar effects only. */
        ordered?: ImageEffect[];
    };
    /** Rotated layout bbox. Undefined = use untransformed `size`. */
    rotationBounds?: ImageRotationBounds;
    /** Complete picture hyperlink metadata. Undefined = use `hlinkHref`. */
    hyperlink?: ImageHyperlink;
    /** Effect extents in EMUs. Undefined = no extra wrap/ink extent. */
    effectExtent?: ImagePadding;
}

/**
 * DrawingML chart model for basic rendered charts.
 *
 * This is intentionally normalized for display rather than lossless OOXML
 * round-trip. Unsupported chart families stay in the original package parts.
 */

type ChartType = 'bar' | 'column' | 'line' | 'pie' | 'doughnut';
type ChartGrouping = 'standard' | 'clustered' | 'stacked' | 'percentStacked';
interface ChartPoint {
    index?: number;
    value?: number;
    category?: string;
    color?: string;
    explosion?: number;
    marker?: {
        symbol?: string;
        size?: number;
        color?: string;
    };
    label?: string;
}
/** Run properties from a `c:txPr`; unset fields inherit from the chart. */
interface ChartTextProperties {
    font?: string;
    sizePt?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    spacingPt?: number;
}
/** A piece of a `c:tx` label: written text, or a field recomputed per point. */
type ChartLabelRun = {
    Text: string;
} | {
    Field: string;
};
/** One `c:dLbl`: an index plus the switches it overrides. */
interface ChartPointLabel {
    index?: number;
    text?: string;
    runs?: ChartLabelRun[];
    labels: ChartDataLabels;
}
/** A `c:dLbls`; every switch is optional so an unset one inherits. */
interface ChartDataLabels {
    delete?: boolean;
    showValue?: boolean;
    showCategoryName?: boolean;
    showSeriesName?: boolean;
    showPercent?: boolean;
    showLegendKey?: boolean;
    showBubbleSize?: boolean;
    separator?: string;
    position?: string;
    numberFormat?: string;
    text?: ChartTextProperties;
    points?: ChartPointLabel[];
}
interface ChartSeries {
    name?: string;
    categories: string[];
    /** A blank cell in the sheet travels as `null` and is not plotted. */
    values: (number | null)[];
    color?: string;
    index?: number;
    order?: number;
    categoryFormula?: string;
    valueFormula?: string;
    axisIds?: string[];
    points?: ChartPoint[];
    grouping?: ChartGrouping;
    marker?: {
        symbol?: string;
        size?: number;
        color?: string;
    };
    smooth?: boolean;
    /** `c:xVal` of a scatter or bubble series. */
    xValues?: (number | null)[];
    /** `c:bubbleSize` of a bubble series. */
    bubbleSizes?: (number | null)[];
    dataLabels?: ChartDataLabels;
}
interface ChartAxis {
    id?: string;
    title?: string;
    min?: number;
    max?: number;
    labels?: string[];
    axisType?: 'category' | 'value' | 'date' | 'series';
    position?: 'left' | 'right' | 'top' | 'bottom';
    crossAxisId?: string;
    crosses?: 'autoZero' | 'min' | 'max' | 'value';
    crossesAt?: number;
    majorUnit?: number;
    minorUnit?: number;
    logarithmicBase?: number;
    reversed?: boolean;
    numberFormat?: string;
    majorTickMark?: string;
    minorTickMark?: string;
    tickLabelPosition?: string;
    hidden?: boolean;
    majorGridlines?: boolean;
    minorGridlines?: boolean;
    text?: ChartTextProperties;
}
/** One chart-family element inside `c:plotArea`. */
interface ChartPlotGroup {
    chartType?: ChartType | 'area' | 'scatter' | 'radar' | 'stock' | 'bubble' | 'ofPie' | 'surface';
    grouping?: ChartGrouping;
    overlap?: number;
    gapWidth?: number;
    axisIds?: string[];
    series?: ChartSeries[];
    varyColors?: boolean;
    firstSliceAngle?: number;
    holeSize?: number;
    showDataLabels?: boolean;
    /** `c:scatterStyle`. */
    scatterStyle?: 'none' | 'line' | 'lineMarker' | 'marker' | 'smooth' | 'smoothMarker';
    /** `c:radarStyle`. */
    radarStyle?: 'standard' | 'marker' | 'filled';
    /** `c:bubbleScale`, a percentage of the default bubble size. */
    bubbleScale?: number;
    /** `c:sizeRepresents`. */
    sizeRepresents?: 'area' | 'w';
    /** `c:wireframe` of a surface chart. */
    wireframe?: boolean;
    hiLowLines?: boolean;
    upDownBars?: boolean;
    /** `c:marker` of a line chart, which switches every series marker off. */
    marker?: boolean;
    dataLabels?: ChartDataLabels;
}
interface ChartLegend {
    position?: 'left' | 'right' | 'top' | 'bottom' | 'topRight';
    visible?: boolean;
    /** `c:overlay`: the legend sits on the plot instead of taking a band of it. */
    overlay?: boolean;
    /** `c:txPr` on the legend; unset fields inherit from the chart. */
    text?: ChartTextProperties;
}
interface Chart {
    type: 'chart';
    chartType: ChartType;
    /** Relationship id used by the owning drawing part. */
    rId?: string;
    /** Normalized package path, e.g. word/charts/chart1.xml. */
    path?: string;
    title?: string;
    legend?: ChartLegend;
    series: ChartSeries[];
    axes?: {
        category?: ChartAxis;
        value?: ChartAxis;
    };
    /** Drawing extent from wp:extent in EMUs. */
    size?: ImageSize;
    /** Wrap metadata from the containing drawing; v1 layout treats charts as inline blocks. */
    wrap?: ImageWrap;
    /** Floating anchor. Undefined = inline legacy behavior. */
    position?: ImagePosition;
    /** Multiple/combo plot groups. Undefined = synthesize one from legacy fields. */
    plotGroups?: ChartPlotGroup[];
    /** Complete axis collection keyed through plot-group `axisIds`. */
    axisList?: ChartAxis[];
    /** Chart accessibility description. */
    description?: string;
    /** Decorative flag. Undefined = false. */
    decorative?: boolean;
    /** Stable z-order for anchored charts. Undefined = source order. */
    relativeHeight?: number;
    /** `c:txPr` on `c:chartSpace`: the root of chart text inheritance. */
    text?: ChartTextProperties;
    /** `c:txPr` on `c:title`. */
    titleText?: ChartTextProperties;
    /**
     * The `w:drawing` that places the chart, replayed verbatim on save. Absent
     * on package-level entries, which no drawing owns.
     */
    drawingXml?: string;
}

export { type FieldInlineContent as $, type AbstractNumbering as A, type BlockContent as B, type CellMarker as C, type DrawingScene as D, type EndnoteProperties as E, type FootnoteProperties as F, type CommentAnchorRange as G, type HeaderFooter as H, type CommentAuthor as I, type CommentRangeEnd as J, type CommentRangeStart as K, type CommentReferenceContent as L, type ComplexField as M, type NoteKind as N, type ContentPosition as O, type Paragraph as P, DEFAULT_WATERMARK_PRESETS as Q, type RevisionInfo as R, type SdtControlState as S, type Deletion as T, type DrawingContent as U, type DrawingSceneNode as V, type Watermark as W, type EndnotePosition as X, type Field as Y, type FieldCharContent as Z, type FieldFormData as _, type SdtProperties as a, type SimpleField as a$, type FieldType as a0, type FooterReference as a1, type FootnotePosition as a2, type HeaderFooterType as a3, type HeaderReference as a4, type HorizontalRuleContent as a5, type Hyperlink as a6, type HyperlinkContent as a7, type Image as a8, type ImageCrop as a9, type NoteReferenceContent as aA, type NoteSeparatorReference as aB, type NumberFormat as aC, type NumberingInstance as aD, type OpaqueDrawingContent as aE, type PageNumberingProperties as aF, type PageOrientation as aG, type ParagraphContent as aH, type ParagraphPropertyChange as aI, type PictureWatermark as aJ, type PropertyChangeInfo as aK, type Run as aL, type RunContent as aM, type RunPropertyChange as aN, type SdtCheckboxGlyph as aO, type SdtDataBinding as aP, type SdtDateState as aQ, type SdtGalleryState as aR, type SdtType as aS, type Section as aT, type SectionStart as aU, type SeparatorContent as aV, type Shape as aW, type ShapeContent as aX, type ShapeFillPaint as aY, type ShapeStrokePaint as aZ, type ShapeTextBody as a_, type ImageEffect as aa, type ImageHyperlink as ab, type ImagePadding as ac, type ImagePosition as ad, type ImageRotationBounds as ae, type ImageSize as af, type ImageTransform as ag, type ImageWrap as ah, type ImageWrapPoint as ai, type InlineSdt as aj, type Insertion as ak, type InstrTextContent as al, type LevelSuffix as am, type LineNumberRestart as an, type ListLevel as ao, type ListRendering as ap, type MathEquation as aq, type MoveFrom as ar, type MoveFromRangeEnd as as, type MoveFromRangeStart as at, type MoveTo as au, type MoveToRangeEnd as av, type MoveToRangeStart as aw, type NoBreakHyphenContent as ax, type NoteNumberRestart as ay, type NoteRefMarkContent as az, type ShapeEffect as b, type SoftHyphenContent as b0, type StructuredFieldContent as b1, type StructuredFieldTree as b2, type SymbolContent as b3, type TabContent as b4, type Table as b5, type TableCell as b6, type TableCellPropertyChange as b7, type TablePropertyChange as b8, type TableRow as b9, type TableRowPropertyChange as ba, type TableStructuralChangeInfo as bb, type TextBox as bc, type TextContent as bd, type TextWatermark as be, type TrackedChangeInfo as bf, type TrackedRunChange as bg, type VerticalAlign as bh, pictureWatermarkDisplayEmu as bi, type RawXml as bj, type ShapeTextBodyProperties as c, type Chart as d, type Comment as e, type SectionProperties as f, type DocumentBody as g, type NumberingDefinitions as h, type Footnote as i, type Endnote as j, type BookmarkRange as k, type BlockSdt as l, type BookmarkEnd as m, type BookmarkStart as n, type BreakContent as o, type ChartAxis as p, type ChartContent as q, type ChartDataLabels as r, type ChartGrouping as s, type ChartLegend as t, type ChartPlotGroup as u, type ChartPoint as v, type ChartPointLabel as w, type ChartSeries as x, type ChartType as y, type Column as z };
