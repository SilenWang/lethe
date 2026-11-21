import { C as CollaborationReplica, k as CollaborationUpdateOrigin } from './types-ui_ARP0o.js';

interface TextStyle {
    bold?: boolean;
    italic?: boolean;
    fontSizePt?: number;
    color?: string;
    fontFamily?: string;
    underline?: string;
    spacingPt?: number;
    baselinePct?: number;
}
type TextStylePatch = TextStyle;
interface TextStyleSnapshot {
    bold: boolean | null;
    italic: boolean | null;
    fontSizePt: number | null;
    color: string | null;
    fontFamily: string | null;
    underline: string | null;
    spacingPt?: number | null;
    baselinePct?: number | null;
    /** `a:rPr@kern`: the smallest size, in points, the run is kerned at. */
    kernPt?: number | null;
    /** `a:rPr@cap`: how the run is cased when drawn, never in the stored text. */
    caps?: 'none' | 'small' | 'all' | null;
}
interface TextRunSnapshot {
    text: string;
    style: TextStyleSnapshot;
}
/** OOXML `a:pPr@algn` token. */
type ParagraphAlignment = 'l' | 'ctr' | 'r' | 'just';
interface ParagraphSnapshot {
    id: string;
    alignment: string | null;
    level: number;
    bulletJson: string | null;
    runs: TextRunSnapshot[];
}
interface StorySnapshot {
    id: string;
    length: number;
    paragraphs: ParagraphSnapshot[];
}
interface PptxTextSearchOptions {
    /** Defaults to false. */
    caseSensitive?: boolean;
    /** Maximum matches; unlimited by default. */
    limit?: number;
}
/**
 * A caret position in a story that later edits, undo, redo and remote updates
 * move along with the text. Plain data; `position` is opaque.
 */
interface PptxCaretAnchor {
    storyId: string;
    position: string;
}
/** Zero-based slide index; story-local UTF-16 offsets. */
interface PptxTextMatch {
    slideIndex: number;
    slideId: string;
    shapeId: string;
    storyId: string;
    start: number;
    end: number;
    text: string;
}
type ShapeKind = 'shape' | 'picture' | 'graphicFrame' | 'group';
/** Hue and hue offsets use turns; other values use fractions. */
type ColorTransform = {
    kind: 'tint' | 'shade' | 'hue' | 'hueMod' | 'hueOff' | 'sat' | 'satMod' | 'satOff' | 'lum' | 'lumMod' | 'lumOff' | 'red' | 'redMod' | 'redOff' | 'green' | 'greenMod' | 'greenOff' | 'blue' | 'blueMod' | 'blueOff' | 'alpha' | 'alphaMod' | 'alphaOff';
    value: number;
} | {
    kind: 'comp' | 'inv' | 'gray' | 'gamma' | 'invGamma';
};
interface ColorValue {
    rgb?: string;
    themeColor?: string;
    themeTint?: string;
    themeShade?: string;
    auto?: boolean;
    luminanceModulation?: number;
    luminanceOffset?: number;
    saturationModulation?: number;
    alpha?: number;
    /** Overrides legacy colour modifiers; legacy alpha applies without an alpha step. */
    transforms?: ColorTransform[];
}
interface ShapeGradient {
    type: string;
    angle?: number;
    stops: Array<{
        position: number;
        color: ColorValue;
    }>;
}
/** An authored fill as the deck stores it. */
interface ShapeFill {
    type: string;
    color?: ColorValue;
    gradient?: ShapeGradient;
}
interface ShapeLineEnd {
    type: string;
    width: string | null;
    length: string | null;
}
/** An authored outline as the deck stores it; `width` is EMU. */
interface ShapeOutline {
    width?: number;
    color?: ColorValue;
    gradient?: ShapeGradient;
    style?: string;
    cap?: string;
    join?: string;
    headEnd?: ShapeLineEnd;
    tailEnd?: ShapeLineEnd;
}
type BlipEffect = {
    type: 'biLevel';
    threshold: number;
} | {
    type: 'grayscale';
} | {
    type: 'luminance';
    brightness: number;
    contrast: number;
} | {
    type: 'duotone';
    shadow: ColorValue | null;
    highlight: ColorValue | null;
} | {
    type: 'colorChange';
    from: ColorValue | null;
    to: ColorValue | null;
    useAlpha?: boolean;
};
interface ShapeSnapshot {
    id: string;
    sourceId: number;
    kind: ShapeKind;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDeg: number;
    flipH: boolean;
    flipV: boolean;
    /** The geometry the shape draws at, present only while it has none of its own. */
    inherited?: InheritedGeometry | null;
    /** Hides this shape and its descendants; omitted when false. */
    hidden?: boolean;
    textBox?: boolean;
    aspectRatioLocked?: boolean;
    geometry: string;
    adjustValues: Record<string, number>;
    placeholder: unknown | null;
    fill: ShapeFill | null;
    resolvedFillColor: string | null;
    outline: ShapeOutline | null;
    resolvedOutlineColor: string | null;
    mediaPartPath: string | null;
    /** Image data added to this session, retained across saves. */
    pendingMedia?: {
        contentType: string;
        base64: string;
    } | null;
    blipEffects?: BlipEffect[];
    graphic: unknown | null;
    textStories: StorySnapshot[];
    children: ShapeSnapshot[];
}
/** The transform a placeholder takes from its layout or master. */
interface InheritedGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDeg: number;
    flipH: boolean;
    flipV: boolean;
}
interface SlideLayoutSnapshot {
    name: string | null;
    type: string | null;
}
interface SlideSnapshot {
    title?: string | null;
    hidden?: boolean | null;
    layout?: SlideLayoutSnapshot | null;
    id: string;
    sourcePartPath: string | null;
    layoutPartPath: string | null;
    name: string | null;
    /** Speaker notes as plain text; absent when the slide has none. */
    notes?: string;
    /** The slide's own background; absent when it inherits the layout's. */
    background?: ShapeFill;
    /** `true` once an edit changed the background from the one the file declares. */
    backgroundEdited?: boolean;
    shapes: ShapeSnapshot[];
}
interface DeckSnapshot {
    widthEmu: number;
    heightEmu: number;
    slides: SlideSnapshot[];
    commentFlavor?: CommentFlavor;
    comments?: CommentSnapshot[];
}
/** Legacy comments or modern threads. */
type CommentFlavor = 'legacy' | 'modern';
interface CommentSnapshot {
    id: string;
    slideId: string;
    author: string;
    initials: string;
    text: string;
    created: string | null;
    xEmu: number;
    yEmu: number;
    /** Set on a reply; names the thread root. */
    parentId: string | null;
    resolved: boolean;
}
interface CommentReceipt {
    commentId: string;
    slideId: string;
    parentId: string | null;
    resolved: boolean;
}
interface SlideReceipt {
    slideId: string;
    fromIndex: number | null;
    toIndex: number | null;
}
interface ShapeReceipt {
    slideId: string;
    shapeId: string;
    index: number;
}
interface ShapeZOrderReceipt {
    slideId: string;
    shapeId: string;
    fromIndex: number;
    toIndex: number;
}
interface ShapeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface TransformReceipt {
    slideId: string;
    shapeId: string;
    before: ShapeRect;
    after: ShapeRect;
}
interface TextReceipt {
    storyId: string;
    start: number;
    end: number;
    text: string;
}
interface ShapeDraft {
    name: string;
    rect: ShapeRect;
    text: string;
    style: TextStyle;
}
interface PresetShapeDraft {
    name: string;
    geometry: string;
    rect: ShapeRect;
    fill?: string | null;
}
interface PictureDraft {
    name: string;
    rect: ShapeRect;
    /** The image's MIME type, e.g. `image/png`. */
    contentType: string;
    /** The image bytes, base64-encoded. */
    mediaBase64: string;
}
interface ShapeStroke {
    color?: string;
    widthPt?: number;
}
interface ShapeFillReceipt {
    slideId: string;
    shapeId: string;
    before: string | null;
    after: string | null;
}
interface ShapeStrokeReceipt {
    slideId: string;
    shapeId: string;
    before: ShapeStroke | null;
    after: ShapeStroke | null;
}
interface ShapeAdjustReceipt {
    slideId: string;
    shapeId: string;
    before: Record<string, number>;
    after: Record<string, number>;
}
interface HistoryResult {
    applied: boolean;
    snapshot: DeckSnapshot;
}
/** Renderer stage latencies of one profiled slide layout, in ms. */
interface LayoutProfile {
    scopeMs: number;
    layoutMs: number;
    serializeMs: number;
}
interface ProfiledLayout {
    layout: SlideDisplayList;
    profile: LayoutProfile;
}
/** Boundary stage latencies of one profiled edit, in ms. */
interface EditProfile {
    parseMs: number;
    applyMs: number;
    serializeMs: number;
}
interface HistoryProfile {
    undoMs: number;
    snapshotMs: number;
    serializeMs: number;
}
interface Profiled<T, P = EditProfile> {
    receipt: T;
    profile: P;
}
interface PptxFontFace {
    family: string;
    bold?: boolean;
    italic?: boolean;
    bytes: Uint8Array;
}
type GeometryPathCommand = {
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
type Paint = {
    kind: 'solid';
    color: string;
} | {
    kind: 'gradient';
    gradientType: 'linear' | 'radial' | 'rectangular' | 'path';
    angleDeg?: number;
    stops: Array<{
        position: number;
        color: string;
    }>;
};
interface StrokeEnd {
    kind: string;
    width: number;
    length: number;
}
interface Stroke {
    /** Solid colour or first gradient stop. */
    color: string;
    width: number;
    dashed?: boolean;
    paint?: Paint;
    join?: 'round' | 'bevel' | 'miter';
    headEnd?: StrokeEnd;
    tailEnd?: StrokeEnd;
}
/** An `a:outerShdw`: a blurred copy of the shape's own path, offset and tinted. */
interface Shadow {
    paths?: Array<{
        path: GeometryPathCommand[];
        fill: boolean;
        stroke?: Stroke;
    }>;
    color: string;
    blur?: number;
    dx?: number;
    dy?: number;
    scaleX?: number;
    scaleY?: number;
}
interface PrimitiveTransform {
    rotationDeg?: number;
    flipH?: boolean;
    flipV?: boolean;
}
interface PrimitiveBase {
    objectId: number;
    shapeId?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    transform?: PrimitiveTransform;
}
interface ShapePrimitive extends PrimitiveBase {
    kind: 'shape';
    name: string;
    geometry: string;
    path: GeometryPathCommand[];
    /** A rectangle substitutes for the authored outline or clip. */
    geometryFallback?: boolean;
    clip?: GeometryPathCommand[];
    evenOdd?: boolean;
    adjustValues?: Record<string, number>;
    fill?: Paint;
    stroke?: Stroke;
    shadow?: Shadow;
}
/** An `a:blip` colour transform, colours already resolved to `#rrggbbaa`. */
type ImageEffect = {
    kind: 'biLevel';
    threshold: number;
} | {
    kind: 'grayscale';
} | {
    kind: 'alpha';
    amount: number;
} | {
    kind: 'luminance';
    brightness: number;
    contrast: number;
} | {
    kind: 'duotone';
    shadow: string;
    highlight: string;
} | {
    kind: 'colorChange';
    from: string;
    to: string;
    useAlpha?: boolean;
};
interface ImageCrop {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
}
interface ImagePrimitive extends PrimitiveBase {
    kind: 'image';
    name: string;
    assetId?: string;
    /** Applied to the bitmap in order before it is drawn. */
    effects?: ImageEffect[];
    /** Fraction of the source discarded per edge, from `a:srcRect`. */
    crop?: ImageCrop;
    /** Bitmap destination within the picture frame. */
    destination?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** `a:tile`: repeat the picture at its own size, scaled by these fractions. */
    tile?: {
        scaleX: number;
        scaleY: number;
    };
    /** Outline the picture is masked to, when its `spPr` gives it one. */
    path?: GeometryPathCommand[];
    /** A rectangle substitutes for the authored mask. */
    geometryFallback?: boolean;
    stroke?: Stroke;
    shadow?: Shadow;
}
interface CaretStop {
    position: number;
    x: number;
}
interface PositionedGlyph {
    glyphId: number;
    cluster: number;
    x: number;
    advance: number;
    xOffset: number;
    yOffset: number;
}
interface PositionedTextRun {
    text: string;
    start: number;
    end: number;
    x: number;
    width: number;
    fontId: number;
    fontFamily: string;
    fontSizePx: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
    letterSpacingPx?: number;
    baselineOffsetPx?: number;
    glyphs: PositionedGlyph[];
}
interface PositionedTextLine {
    columnOffset?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    baseline: number;
    start: number;
    end: number;
    runs: PositionedTextRun[];
    caretStops: CaretStop[];
}
interface TextBoxPrimitive extends PrimitiveBase {
    kind: 'textBox';
    storyId?: string;
    anchor: 'top' | 'center' | 'bottom';
    paragraphs: Array<{
        align?: 'left' | 'center' | 'right' | 'justify';
        level: number;
        runs: Array<{
            text: string;
            fontFamily: string;
            fontSizePt: number;
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            color: string;
        }>;
    }>;
    lines: PositionedTextLine[];
    overflow?: boolean;
    /** `a:rPr/a:effectLst`: the shadow the box's glyphs are drawn with. */
    textShadow?: Shadow;
}
interface PlaceholderPrimitive extends PrimitiveBase {
    kind: 'placeholder';
    name: string;
    label?: string;
}
/** A plotted chart. Its parts paint clipped to the chart rectangle, and
 *  `label` is the screen-reader summary of the whole chart. */
interface ChartPrimitive extends PrimitiveBase {
    kind: 'chart';
    name: string;
    label: string;
    primitives: SlidePrimitive[];
}
/** A laid-out table. Its cells paint clipped to the table rectangle, and
 *  `label` is the screen-reader summary of the whole table. */
interface TablePrimitive extends PrimitiveBase {
    kind: 'table';
    name: string;
    label: string;
    primitives: SlidePrimitive[];
}
type SlidePrimitive = ShapePrimitive | ImagePrimitive | TextBoxPrimitive | PlaceholderPrimitive | ChartPrimitive | TablePrimitive;
interface SlideDisplayList {
    contractVersion: number;
    width: number;
    height: number;
    background?: Paint;
    primitives: SlidePrimitive[];
}
type HitTestResult = {
    kind: 'shape';
    shapeId: string;
} | {
    kind: 'text';
    shapeId: string;
    storyId: string;
    position: number;
};
interface UpdateEvent {
    origin: 'local' | 'remote';
    update: Uint8Array;
}
interface TextParagraphDraft {
    bullet?: boolean;
    alignment?: ParagraphAlignment | null;
    runs: Array<{
        text: string;
        style?: TextStyle;
    }>;
}
interface TableReceipt {
    slideId: string;
    shapeId: string;
    rowCount: number;
    columnCount: number;
    newCellRefs: string[];
}

type ProposalEdit = {
    type: 'replaceText';
    storyId: string;
    start: number;
    end: number;
    text: string;
    style?: Partial<TextStyleSnapshot> | null;
} | {
    type: 'formatText';
    storyId: string;
    start: number;
    end: number;
    patch: Partial<TextStyleSnapshot>;
} | {
    type: 'setParagraphAlignment';
    storyId: string;
    start: number;
    end: number;
    alignment: ParagraphAlignment | 'justLow' | 'dist' | 'thaiDist' | null;
} | {
    type: 'setShapeRect';
    slideId: string;
    shapeId: string;
    rect: ShapeRect;
} | {
    type: 'setShapeFill';
    slideId: string;
    shapeId: string;
    color: string | null;
} | {
    type: 'setShapeStroke';
    slideId: string;
    shapeId: string;
    stroke: {
        [K in keyof ShapeStroke]: ShapeStroke[K] | null;
    };
} | {
    type: 'setShapeAdjust';
    slideId: string;
    shapeId: string;
    adjustments: Record<string, number>;
} | {
    type: 'setSlideNotes';
    slideId: string;
    text: string;
};
interface ProposalChange {
    slideId: string;
    shapeId: string | null;
    before: ShapeSnapshot | null;
    after: ShapeSnapshot | null;
    oldText: string;
    newText: string;
}
interface Proposal {
    id: string;
    agentId: string;
    note: string | null;
    edits: ProposalEdit[];
    changes: ProposalChange[];
    staleTargets: string[];
}
interface ProposalPreview {
    proposal: Proposal;
    snapshot: DeckSnapshot;
}
interface ProposalTextChange {
    storyId: string;
    start: number;
    end: number;
    kind: 'insertion' | 'deletion';
}
interface ProposalDiffSlide extends ProposalPreview {
    frame: SlideDisplayList;
    textChanges: ProposalTextChange[];
}
interface ProposalAcceptance {
    proposalId: string;
    applied: boolean;
    snapshot: DeckSnapshot;
}
declare class StaleProposalError extends Error {
    readonly targets: string[];
    constructor(targets: string[]);
}

type CanvasImageResolver = ((assetId: string) => CanvasImageSource | Promise<CanvasImageSource | null> | null) & {
    acquire?(): CanvasImageResolver;
    release?(): void;
};
interface PaintSlideOptions {
    resolveImage?: CanvasImageResolver;
    maxShadowPixels?: number;
    textChanges?: readonly ProposalTextChange[];
}
interface SlideCanvasLike {
    width: number;
    height: number;
    style: {
        width: string;
        height: string;
    };
}
declare function sizeCanvasForSlide(canvas: SlideCanvasLike, list: Pick<SlideDisplayList, 'width' | 'height'>, dpr: number, scale?: number): void;
declare function paintSlide(ctx: CanvasRenderingContext2D, list: SlideDisplayList, dpr?: number, scale?: number, options?: PaintSlideOptions): Promise<void>;

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

/** Provenance only: it selects neither permissions nor history. */
type PptxEditSource = 'host' | 'agent';
/** `separate`: exactly one undo step. `none`: outside undo history, keeping existing entries. */
type PptxEditHistory = 'separate' | 'none';
interface PptxSlideTarget {
    slideId: string;
}
/** A shape addressed through the slide that owns it. */
interface PptxShapeTarget extends PptxSlideTarget {
    shapeId: string;
}
/**
 * A text story addressed through its slide and owning shape. Targets reject unknown fields, so
 * copy the ids off a read record rather than passing the record itself.
 */
interface PptxStoryTarget extends PptxShapeTarget {
    storyId: string;
}
interface PptxTextRange extends PptxStoryTarget {
    start: number;
    end: number;
}
/** An explicit range, or the one exact, case-sensitive, paragraph-local match of `text`. */
type PptxTextTarget = ({
    kind: 'range';
} & PptxTextRange) | {
    kind: 'search';
    within: PptxStoryTarget;
    text: string;
};
/** Refuses the step unless its target currently reads exactly `text`. */
interface PptxTextGuard {
    text: string;
}
/**
 * One batch step. Insertion, replacement and deletion stay inside one paragraph; formatting and
 * alignment may span paragraphs of one story. Geometry, fill and outline steps address shapes at
 * the top of a slide, and fill and outline only preset shapes.
 */
type PptxEditStep = {
    op: 'insertText';
    target: PptxTextTarget;
    at: 'start' | 'end';
    text: string;
    expect?: PptxTextGuard;
} | {
    op: 'replaceText';
    target: PptxTextTarget;
    text: string;
    expect?: PptxTextGuard;
} | {
    op: 'deleteText';
    target: PptxTextTarget;
    expect?: PptxTextGuard;
} | {
    op: 'formatText';
    target: PptxTextTarget;
    patch: TextStylePatch;
    expect?: PptxTextGuard;
} | {
    op: 'setParagraphAlignment';
    target: PptxTextTarget;
    /** `null` restores the inherited alignment. */
    alignment: ParagraphAlignment | null;
    expect?: PptxTextGuard;
} | {
    op: 'setSlideNotes';
    target: PptxSlideTarget;
    text: string;
    expect?: PptxTextGuard;
} | {
    op: 'setSlideBackground';
    target: PptxSlideTarget;
    /** A solid or gradient fill; `null` removes the slide's own background. */
    background: ShapeFill | null;
    /** The effective background, as `snapshot()` reports it. */
    expect?: {
        background: ShapeFill | null;
    };
} | {
    op: 'setShapeRect';
    target: PptxShapeTarget;
    rect: ShapeRect;
    expect?: {
        rect: ShapeRect;
    };
} | {
    op: 'setShapeAdjust';
    target: PptxShapeTarget;
    adjustments: Record<string, number>;
} | {
    op: 'setShapeFill';
    target: PptxShapeTarget;
    /** A `#RRGGBB` solid fill; `null` removes the fill. */
    color: string | null;
    /** The authored fill, as `snapshot()` reports it. */
    expect?: {
        fill: ShapeFill | null;
    };
} | {
    op: 'setShapeStroke';
    target: PptxShapeTarget;
    stroke: ShapeStroke;
    /** The authored outline, as `snapshot()` reports it. */
    expect?: {
        outline: ShapeOutline | null;
    };
};
interface PptxEditRequest {
    /** The version the targets were read at; a changed deck refuses with `stale-version`. */
    expectVersion: string;
    /** Defaults to `host`. */
    source?: PptxEditSource;
    /** Defaults to `separate`. */
    history?: PptxEditHistory;
    steps: readonly PptxEditStep[];
}
/** `read-only` comes only from an editor host that does not accept edits, never from a session. */
type PptxEditFailureCode = 'stale-version' | 'missing-target' | 'ambiguous-target' | 'content-mismatch' | 'overlapping-steps' | 'unsupported' | 'invalid-step' | 'limit-exceeded' | 'read-only';
type PptxEditTarget = PptxTextTarget | ({
    kind: 'story';
} & PptxStoryTarget) | ({
    kind: 'shape';
} & PptxShapeTarget) | ({
    kind: 'slide';
} & PptxSlideTarget);
type PptxEditFailure = OperationFailure<PptxEditFailureCode, PptxEditTarget>;
type PptxEditRefusal = OperationRefusal<PptxEditFailure>;
/** What one step did. Text targets describe the final state; a deletion reports its collapsed boundary. */
interface PptxEditReceipt {
    stepIndex: number;
    changed: boolean;
    target: PptxEditTarget;
}
/** What one step would do at its resolved pre-batch target; it cannot be committed later. */
interface PptxEditPreview {
    stepIndex: number;
    target: PptxEditTarget;
    wouldChange: boolean;
}
type PptxEditResult = (EditSuccess<PptxEditReceipt> & {
    source: PptxEditSource;
    changedSlides: string[];
    changedStories: string[];
}) | PptxEditRefusal;
type PptxValidationResult = ValidationSuccess<PptxEditPreview> | PptxEditRefusal;
interface PptxReadRequest {
    /** Restricts the read to these slides, returned in deck order; every slide when omitted. */
    slideIds?: readonly string[];
}
/** The story offsets of a field result, such as a slide number. */
interface PptxTextField {
    start: number;
    end: number;
    fieldType?: string;
}
interface PptxParagraphText {
    list?: PptxExportList | null;
    paragraphId: string;
    /** Story offsets of the paragraph's text; a following separator sits at `end`. */
    start: number;
    end: number;
    /** Story offsets of soft line breaks, which read as `\n` inside the paragraph. */
    lineBreaks: number[];
    /** Field results that text steps leave whole. */
    fields: PptxTextField[];
    /**
     * False when saving could not keep a field once the paragraph changes: the field is empty or
     * left the paragraph's unchanged leading or trailing text. Steps changing it refuse.
     */
    editable: boolean;
}
interface PptxStoryText extends PptxStoryTarget {
    /** Paragraph texts joined by `\n`. */
    text: string;
    paragraphs: PptxParagraphText[];
}
type PptxReadResult = {
    ok: true;
    version: string;
    slides: SlideSnapshot[];
    stories: PptxStoryText[];
} | PptxEditRefusal;
/** A slide, one shape and its descendants, or one story; `storyId` needs `shapeId`. */
interface PptxFindScope {
    slideId: string;
    shapeId?: string;
    storyId?: string;
}
interface PptxFindRequest {
    text: string;
    /** The whole deck when omitted. */
    within?: PptxFindScope;
    /** Defaults to 100; at most 10,000. */
    limit?: number;
}
/** One search hit; `range` is reusable as a `{ kind: 'range' }` target. */
interface PptxFindMatch {
    text: string;
    range: PptxTextRange;
}
type PptxFindResult = {
    ok: true;
    version: string;
    matches: PptxFindMatch[];
    truncated: boolean;
} | PptxEditRefusal;

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
 * Read-only structured export of PPTX content: slides in deck order, each with its shape tree,
 * text stories, tables and placeholders for content the export cannot represent, every record
 * with the location it was read from, and diagnostics for everything omitted. Plain JSON,
 * produced by one Rust walker for sessions and bytes.
 *
 * Reading order is the current shape tree, depth first: slides in deck order, shapes in tree
 * order, a group's descendants at the group's position, table cells row by row. It is the
 * authored order, not a reading order inferred from geometry.
 *
 * `range` anchors are batch text targets in the story offsets of `readContent()`, so a session
 * export's `range` anchor can be a step's `target` at the version it was read at; `notes` and
 * `comment` anchors index the plain text they carry; `sourcePart` anchors address retained source
 * XML by element-child ordinals. Session anchors belong to the version they were read at; ids are
 * deterministic export-tree paths.
 */

/** `session` anchors resolve against the returned version; `snapshot` ones against the content. */
type PptxAnchorScope = 'session' | 'snapshot';
/** A half-open range of UTF-16 offsets. */
interface PptxTextSpan {
    start: number;
    end: number;
}
type PptxAnchor = {
    kind: 'slide';
    slideId: string;
} | {
    kind: 'shape';
    slideId: string;
    shapeId: string;
} | Extract<PptxTextTarget, {
    kind: 'range';
}> | {
    kind: 'notes';
    slideId: string;
    range: PptxTextSpan;
} | {
    kind: 'comment';
    slideId: string;
    commentId: string;
    range: PptxTextSpan;
} | {
    kind: 'sourcePart';
    part: string;
    partSha256: string;
    path: number[];
};
/**
 * The retained source XML a record was seeded from: `sldId` is the owning slide's `p:sldId/@id`,
 * `sourceId` a shape's `cNvPr/@id`.
 */
interface PptxSourceProvenance {
    part: string;
    partSha256: string;
    path: number[];
    sldId: number | null;
    sourceId: number | null;
}
interface PptxStructuredContent extends ExportCompletion {
    schemaVersion: 1;
    anchorScope: PptxAnchorScope;
    readingOrder: 'shapeTree';
    included: {
        hiddenSlides: boolean;
        hiddenShapes: boolean;
        notes: boolean;
        comments: boolean;
        formatting: boolean;
    };
    slides: PptxExportSlide[];
    diagnostics: PptxExportDiagnostic[];
}
interface PptxExportSlide {
    id: string;
    /** Zero-based position in the current deck, hidden slides counted. */
    index: number;
    anchor: PptxAnchor;
    name: string | null;
    /**
     * `null` when the deck does not record it: such slides are exported with a
     * `visibility-unknown` diagnostic.
     */
    hidden: boolean | null;
    provenance: PptxSourceProvenance | null;
    shapes: PptxExportShape[];
    notes: PptxExportNotes | null;
    comments: PptxExportComment[];
}
/** `unknown` is a shape-tree element only the source holds, anchored by its source location. */
type PptxExportShapeKind = 'shape' | 'picture' | 'graphicFrame' | 'group' | 'unknown';
interface PptxExportShape {
    id: string;
    anchor: PptxAnchor;
    kind: PptxExportShapeKind;
    name: string;
    /** Alternative-text title and description. */
    title: string | null;
    description: string | null;
    /** Hidden itself or through a hidden group. */
    hidden: boolean;
    placeholder: {
        type: string | null;
        index: number | null;
    } | null;
    provenance: PptxSourceProvenance | null;
    stories: PptxExportStory[];
    table: PptxExportTable | null;
    object: PptxExportObject | null;
    children: PptxExportShape[];
}
interface PptxExportStory {
    id: string;
    /** Spans the whole story. */
    anchor: PptxAnchor;
    paragraphs: PptxExportParagraph[];
}
interface PptxExportParagraph {
    id: string;
    anchor: PptxAnchor;
    paragraphId: string;
    level: number;
    /** The authored alignment, else the inherited one. */
    alignment: string | null;
    /** The paragraph's own bullet, as the session stores it. */
    bulletJson: string | null;
    /** The marker after inheritance and numbering; `null` for a paragraph that is no list item. */
    list: PptxExportList | null;
    runs: PptxExportRun[];
}
/**
 * `character` is the authored `a:buChar` and `font` its typeface, a symbol font when the character
 * names a glyph slot. `marker` is the formatted number, `null` for a scheme that cannot be
 * formatted.
 */
type PptxExportList = {
    kind: 'bullet';
    character: string;
    font: string | null;
} | {
    kind: 'number';
    scheme: string;
    startAt: number;
    value: number;
    marker: string | null;
};
type PptxExportMark = {
    kind: 'bold' | 'italic' | 'superscript' | 'subscript' | 'smallCaps' | 'allCaps';
} | {
    kind: 'underline';
    style: string;
};
/** Line breaks are one `\n` unit, fields cover their cached result; unsupported runs are zero-width. */
type PptxExportRun = {
    anchor: PptxAnchor;
    /** `null` when the export excludes formatting. */
    marks: PptxExportMark[] | null;
    /** A click hyperlink: an external URL, or the part an internal link jumps to. */
    link: {
        href: string;
        external: boolean;
    } | null;
} & ({
    kind: 'text';
    text: string;
} | {
    kind: 'lineBreak';
}
/** A field's cached result; fields are never evaluated. */
 | {
    kind: 'field';
    fieldType: string | null;
    text: string;
} | {
    kind: 'unsupported';
    element: string;
});
/**
 * A table on its grid. Every source cell appears once; `merged` marks a continuation covered by
 * the cell at `mergeOrigin`, whose content PowerPoint does not show.
 */
interface PptxExportTable {
    columns: number;
    rows: Array<{
        cells: PptxExportTableCell[];
    }>;
}
interface PptxExportTableCell {
    id: string;
    anchor: PptxAnchor;
    row: number;
    column: number;
    gridSpan: number;
    rowSpan: number;
    merged: boolean;
    mergeOrigin: {
        row: number;
        column: number;
    } | null;
    story: PptxExportStory | null;
}
type PptxExportObjectKind = 'picture' | 'video' | 'audio' | 'chart' | 'smartArt' | 'embeddedObject' | 'unknown';
/** A placeholder for content the export does not represent; its data is never included. */
interface PptxExportObject {
    id: string;
    kind: PptxExportObjectKind;
    /** The source element's qualified name, such as `p:graphicFrame`. */
    element: string;
    uri: string | null;
    relationshipIds: string[];
    /** The package parts the object references. */
    parts: string[];
    /** Targets of its external relationships, such as a linked video. */
    externalTargets: string[];
}
/** A slide's speaker notes, as plain text. */
interface PptxExportNotes {
    id: string;
    anchor: PptxAnchor;
    text: string;
    provenance: PptxSourceProvenance | null;
}
interface PptxExportComment {
    id: string;
    anchor: PptxAnchor;
    commentId: string;
    author: string | null;
    date: string | null;
    parentId: string | null;
    resolved: boolean;
    text: string;
}
type PptxExportDiagnosticCode = 'unsupported-content' | 'image-data-omitted' | 'unsupported-numbering' | 'field-cached-result' | 'provenance-unavailable' | 'visibility-unknown' | 'hidden-content-excluded' | 'stories-omitted' | 'formatting-omitted' | 'inherited-content-omitted' | 'notes-structure-omitted' | 'merge-continuation-content-omitted' | 'truncated' | 'markdown-lossy';
type PptxExportDiagnostic = ExportDiagnostic<PptxExportDiagnosticCode, PptxAnchor>;
/**
 * What to export. Hidden slides and shapes, notes and comments are excluded unless requested, and
 * formatting is included unless turned off. `maxBlocks` defaults to 10,000 (at most 1,000,000;
 * every slide, shape, paragraph, notes story and comment counts) and `maxBytes` to 8,388,608
 * (1,024 to 67,108,864, measured on the compact JSON).
 */
interface PptxExportOptions {
    includeHiddenSlides?: boolean;
    includeHiddenShapes?: boolean;
    includeNotes?: boolean;
    includeComments?: boolean;
    includeFormatting?: boolean;
    maxBlocks?: number;
    maxBytes?: number;
}
/** `maxBytes` bounds the Markdown text; the default and range are the export's. */
interface PptxMarkdownOptions {
    maxBytes?: number;
}
/**
 * Markdown rendered from structured content. Each `<!-- pptx-export:N -->` marker precedes the
 * record `anchors` maps it to. Markdown keeps no slide layout, geometry or typography.
 */
interface PptxMarkdownContent extends ExportCompletion {
    markdown: string;
    anchors: MarkdownAnchor<PptxAnchor>[];
    diagnostics: PptxExportDiagnostic[];
}
/**
 * Options out of range or above a hard maximum, or structured content handed to the renderer that
 * contradicts itself. Unsupported deck content is diagnosed, never refused.
 */
type PptxExportFailureCode = 'invalid-options' | 'limit-exceeded' | 'invalid-content';
/** Why an export was refused; `target` is the anchor the refusal concerns, if any. */
interface PptxExportFailure {
    code: PptxExportFailureCode;
    target: PptxAnchor | null;
    message: string;
}
type PptxExportRefusal = OperationRefusal<PptxExportFailure>;
/** A session export: the content with the version it was read at, or a refusal. */
type PptxExportResult<T> = {
    ok: true;
    version: string;
    content: T;
} | PptxExportRefusal;
/** A headless export or rendering the engine refused as data. */
declare class PptxExportError extends Error {
    readonly failure: PptxExportFailure;
    constructor(failure: PptxExportFailure);
}

type WasmInitInput = InitInput | Promise<InitInput>;
interface InspectPresentationOptions {
    includeMedia?: boolean;
}
interface OpenPresentationOptions {
    clientId?: number;
    fonts?: ReadonlyArray<PptxFontFace>;
    /** Faces drawn only for characters the run's own face has no glyph for, e.g. a script's Noto face. */
    fallbackFonts?: ReadonlyArray<PptxFontFace>;
    /**
     * Opens from a collaboration update instead of parsing the file bytes.
     * When the bytes are the file the update was seeded from, the session
     * keeps them and `save()` works; any other bytes open without a source
     * and `save()` throws.
     */
    initialUpdate?: Uint8Array;
}
type UndoCaptureMode = 'auto' | 'manual';
interface PresentationHistoryReceipt {
    applied: boolean;
    changedSlideIds: string[];
    deckSizeChanged: boolean;
    slideOrderChanged: boolean;
}
type PresentationCommandReadResult = Extract<PptxReadResult, {
    ok: false;
}> | (Extract<PptxReadResult, {
    ok: true;
}> & {
    sources: {
        storyId: string;
        paragraphs: {
            paragraphId: string;
            text: string;
            fields: PptxTextField[];
            editable: boolean;
        }[];
    }[];
});
interface PresentationHandle extends CollaborationReplica {
    isProposalsAvailable(): boolean;
    propose(agentId: string, note: string | null, edits: readonly ProposalEdit[]): Proposal;
    listProposals(): Proposal[];
    previewProposal(id: string): ProposalPreview;
    layoutProposalSlide(id: string, slideIndex: number): SlideDisplayList;
    layoutProposalDiffSlide(id: string, slideIndex: number): ProposalDiffSlide;
    acceptProposal(id: string, options?: {
        force?: boolean;
    }): ProposalAcceptance;
    rejectProposal(id: string): boolean;
    readonly clientId: number;
    fork(): PresentationHandle;
    /** Joins a shared session: table row and column insert/delete are refused from now on. Call it before the first edit on a handle that joins a shared session. */
    setCollaborative(): void;
    isCollaborative(): boolean;
    layouts(): Array<{
        id: string;
        name: string | null;
        type: string | null;
        masterId: string | null;
        placeholders: Array<{
            id: string;
            name: string;
            type: string | null;
            idx: number | null;
        }>;
    }>;
    snapshot(): DeckSnapshot;
    story(storyId: string): StorySnapshot;
    /** Anchors the UTF-16 caret `index` of a story so later edits move it along. */
    anchorCaret(storyId: string, index: number): PptxCaretAnchor;
    /** The anchor's current offset, or `null` once its story is gone. */
    resolveCaretAnchor(anchor: PptxCaretAnchor): number | null;
    /**
     * The session-scoped version token. It changes with every committed change, local or remote,
     * undo and redo included; compare tokens only within this session.
     */
    version(): string;
    /** Slides and their stories' text, with the version they were read at. */
    readContent(request?: PptxReadRequest): PptxReadResult;
    readCommandContent(request?: PptxReadRequest): PresentationCommandReadResult;
    historyStep(direction: 'undo' | 'redo'): PresentationHistoryReceipt;
    /** Exact, case-sensitive, paragraph-local search; overlapping matches count separately. */
    findText(request: PptxFindRequest): PptxFindResult;
    /**
     * Structured slide content with the version it was read at, read from committed state: pending
     * editor input is not flushed and nothing changes. Option refusals are returned; malformed
     * options throw.
     */
    exportStructured(options?: PptxExportOptions): PptxExportResult<PptxStructuredContent>;
    /** `exportStructured` rendered as Markdown from the same read. */
    exportMarkdown(options?: PptxExportOptions): PptxExportResult<PptxMarkdownContent>;
    /** Runs every check of `applyEdits`, staging included, without changing anything. */
    validateEdits(request: PptxEditRequest): PptxValidationResult;
    /**
     * Applies every step or none against `expectVersion`, as one transaction, one update and, for
     * `history: 'separate'`, one undo step. Policy failures are returned; malformed requests throw.
     */
    applyEdits(request: PptxEditRequest): PptxEditResult;
    /** Literal search in slide order. */
    searchText(query: string, options?: PptxTextSearchOptions): PptxTextMatch[];
    registerFont(face: PptxFontFace): number;
    /** Registers a face drawn only where a run's own face has no glyph. */
    registerFallbackFont(face: PptxFontFace): number;
    layoutSlide(slideIndex: number): SlideDisplayList;
    /** `layoutSlide` with scope, layout and serialize time measured inside the renderer. */
    layoutSlideProfiled(slideIndex: number): ProfiledLayout;
    hitTest(x: number, y: number): HitTestResult | null;
    mediaBytes(partPath: string): Uint8Array;
    /** serialize the presentation back to .pptx bytes, edits included. */
    save(): Uint8Array;
    insertText(storyId: string, index: number, text: string, style?: TextStyle): TextReceipt;
    /** `insertText` with the boundary's stage timings attached. */
    insertTextProfiled(storyId: string, index: number, text: string, style?: TextStyle): Profiled<TextReceipt>;
    deleteText(storyId: string, start: number, end: number): TextReceipt;
    deleteTextProfiled(storyId: string, start: number, end: number): Profiled<TextReceipt>;
    formatText(storyId: string, start: number, end: number, patch: TextStylePatch): TextReceipt;
    setStoryParagraphs(storyId: string, paragraphs: readonly TextParagraphDraft[]): StorySnapshot;
    insertParagraphBreak(storyId: string, index: number): TextReceipt;
    /** Sets the alignment of every paragraph the range touches; `null` restores
     *  the inherited value. */
    setParagraphAlignment(storyId: string, start: number, end: number, alignment: ParagraphAlignment | null): TextReceipt;
    insertTableRow(slideId: string, shapeId: string, index: number, position: 'before' | 'after', cells?: readonly string[]): TableReceipt;
    deleteTableRow(slideId: string, shapeId: string, index: number): TableReceipt;
    insertTableColumn(slideId: string, shapeId: string, index: number, position: 'before' | 'after', cells?: readonly string[], width?: 'split' | 'copy'): TableReceipt;
    deleteTableColumn(slideId: string, shapeId: string, index: number): TableReceipt;
    /** Throws the refusal the matching table edit would throw, without changing the deck. */
    checkTableEdit(method: 'insertTableRow' | 'deleteTableRow' | 'insertTableColumn' | 'deleteTableColumn', slideId: string, shapeId: string, index: number, position?: 'before' | 'after', cells?: readonly string[], width?: 'split' | 'copy'): void;
    insertSlide(index: number, layoutPartPath?: string): SlideReceipt;
    insertSlideProfiled(index: number, layoutPartPath?: string): Profiled<SlideReceipt>;
    duplicateSlide(slideId: string, toIndex: number): SlideReceipt;
    deleteSlide(slideId: string): SlideReceipt;
    moveSlide(slideId: string, toIndex: number): SlideReceipt;
    /** Sets a slide's speaker notes; empty text clears them. */
    setSlideNotes(slideId: string, text: string): void;
    setSlideLayout(slideId: string, layoutId: string, mapping?: Array<[string, string]>): void;
    addTextBox(slideId: string, draft: ShapeDraft): ShapeReceipt;
    addTextBoxProfiled(slideId: string, draft: ShapeDraft): Profiled<ShapeReceipt>;
    addShape(slideId: string, draft: PresetShapeDraft): ShapeReceipt;
    addPicture(slideId: string, draft: PictureDraft): ShapeReceipt;
    setShapeFill(slideId: string, shapeId: string, color: string | null): ShapeFillReceipt;
    setShapeStroke(slideId: string, shapeId: string, stroke: ShapeStroke): ShapeStrokeReceipt;
    setShapeAdjust(slideId: string, shapeId: string, adjustments: Record<string, number>): ShapeAdjustReceipt;
    removeShape(slideId: string, shapeId: string): ShapeReceipt;
    /** Moves a shape to the top of its slide's paint order (drawn last). */
    bringShapeToFront(slideId: string, shapeId: string): ShapeZOrderReceipt;
    /** Moves a shape to the bottom of its slide's paint order (drawn first). */
    sendShapeToBack(slideId: string, shapeId: string): ShapeZOrderReceipt;
    /** Swaps a shape one step later in its slide's paint order. */
    bringShapeForward(slideId: string, shapeId: string): ShapeZOrderReceipt;
    /** Swaps a shape one step earlier in its slide's paint order. */
    sendShapeBackward(slideId: string, shapeId: string): ShapeZOrderReceipt;
    /** Adds a slide comment; coordinates are EMU. */
    addComment(slideId: string, comment: {
        author: string;
        initials?: string;
        text: string;
        created: string;
        xEmu?: number;
        yEmu?: number;
    }): CommentReceipt;
    /** Replies to a root comment in either flavor. */
    replyToComment(commentId: string, reply: {
        author: string;
        initials?: string;
        text: string;
        created: string;
    }): CommentReceipt;
    /** Resolves or reopens a modern comment. */
    setCommentStatus(commentId: string, resolved: boolean): CommentReceipt;
    /** Moves a root comment on its slide; coordinates are safe integer EMU. */
    setCommentPosition(commentId: string, position: {
        xEmu: number;
        yEmu: number;
    }): CommentReceipt;
    removeComment(commentId: string): CommentReceipt;
    /** Only legal while the deck has no comments. */
    setCommentFlavor(flavor: CommentFlavor): CommentFlavor;
    comments(): CommentSnapshot[];
    moveShape(slideId: string, shapeId: string, x: number, y: number): TransformReceipt;
    moveShapeProfiled(slideId: string, shapeId: string, x: number, y: number): Profiled<TransformReceipt>;
    resizeShape(slideId: string, shapeId: string, width: number, height: number): TransformReceipt;
    setShapeRect(slideId: string, shapeId: string, rect: ShapeRect): TransformReceipt;
    canUndo(): boolean;
    canRedo(): boolean;
    undoCaptureMode(): UndoCaptureMode;
    setUndoCaptureMode(mode: UndoCaptureMode): void;
    addUndoBoundary(): void;
    undo(): HistoryResult;
    /** `undo` with undo, snapshot and serialize time measured at the boundary. */
    undoProfiled(): Profiled<HistoryResult, HistoryProfile>;
    redo(): HistoryResult;
    encodeStateVector(): Uint8Array;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    encodeDiff(remoteStateVector: Uint8Array): Uint8Array;
    applyUpdate(update: Uint8Array): DeckSnapshot;
    onUpdate(listener: (update: Uint8Array, origin: CollaborationUpdateOrigin) => void): () => void;
    dispose(): void;
}
declare const replayMethods: readonly ["insertText", "deleteText", "formatText", "setStoryParagraphs", "insertParagraphBreak", "setParagraphAlignment", "insertTableRow", "deleteTableRow", "insertTableColumn", "deleteTableColumn", "insertSlide", "duplicateSlide", "deleteSlide", "moveSlide", "setSlideNotes", "setSlideLayout", "addTextBox", "addShape", "addPicture", "removeShape", "moveShape", "resizeShape", "setShapeRect", "setShapeFill", "setShapeStroke", "setShapeAdjust", "bringShapeToFront", "sendShapeToBack", "bringShapeForward", "sendShapeBackward", "addComment", "replyToComment", "setCommentStatus", "setCommentPosition", "removeComment", "setCommentFlavor", "propose", "acceptProposal", "rejectProposal", "applyEdits", "addUndoBoundary", "undo", "redo"];
/** @internal */
type PresentationReplayOp = {
    [K in typeof replayMethods[number]]: {
        method: K;
        args: Parameters<PresentationHandle[K]>;
    };
}[typeof replayMethods[number]];
/** @internal */
interface PresentationReplayOutcome {
    result: unknown;
    applied: boolean;
    changedTargets: string[];
    canUndo: boolean;
    canRedo: boolean;
}
/** @internal */
interface PresentationReplayReply {
    sequence: number;
    revision: number;
    version: string;
    engineVersion: string;
    consumed: boolean;
    outcome: PresentationReplayOutcome;
}
declare function isProposalsAvailable(): boolean;
declare function initWasm(input?: WasmInitInput): Promise<void>;
declare function isWasmAvailable(): boolean;
declare function wasmVersion(): string;
declare function inspectPresentation(bytes: Uint8Array, options?: InspectPresentationOptions): unknown;
/**
 * Exports PPTX bytes as structured content whose anchors address the returned snapshot. No
 * session, DOM or font is involved. Throws `PptxExportError` for refused options and an `Error`
 * for bytes that are not a readable PPTX.
 */
declare function exportPptxStructured(bytes: Uint8Array, options?: PptxExportOptions): Promise<PptxStructuredContent>;
/** `exportPptxStructured` rendered as Markdown with anchor markers. */
declare function exportPptxMarkdown(bytes: Uint8Array, options?: PptxExportOptions): Promise<PptxMarkdownContent>;
/**
 * Renders structured content (schema version 1) as Markdown. Content the renderer cannot trust
 * refuses with `invalid-content`.
 */
declare function renderPptxMarkdown(content: PptxStructuredContent, options?: PptxMarkdownOptions): Promise<PptxMarkdownContent>;
declare function openPresentation(bytes: Uint8Array, options?: OpenPresentationOptions): PresentationHandle;

declare class PptxPeerHydrationError extends Error {
    readonly code: string;
    readonly cause?: unknown | undefined;
    readonly refusal: {
        code: string;
    };
    constructor(code: string, message: string, cause?: unknown | undefined);
}
declare class PptxPeerNotReadyError extends Error {
    readonly code = "peer-not-ready";
    constructor();
}
declare class PptxWorkerEditorFailedError extends Error {
    readonly cause: unknown;
    readonly code = "editor-failed";
    constructor(cause: unknown);
}
declare class PptxWorkerEditorDisposedError extends Error {
    readonly code = "editor-disposed";
    constructor();
}
declare class PptxWorkerEditorCollaborationError extends Error {
    readonly code = "collaboration-unavailable";
    constructor();
}

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

/** @experimental */
interface PresentationFrame {
    displayList: SlideDisplayList;
    version: string;
    epoch: number;
    slideIndex: number;
    media: ReadonlyMap<string, Uint8Array>;
}
/** @experimental */
type PresentationWireFrame = Omit<PresentationFrame, 'displayList' | 'media'> & {
    displayList: ArrayBuffer;
    media: {
        assetId: string;
        bytes: ArrayBuffer;
    }[];
};
/**
 * A transferable font face.
 * @experimental
 */
interface PresentationSessionFont {
    family: string;
    bytes: ArrayBuffer;
    bold?: boolean;
    italic?: boolean;
}
/**
 * Structured-cloneable presentation open options.
 * @experimental
 */
interface PresentationSessionOpenOptions extends Omit<OpenPresentationOptions, 'fonts' | 'fallbackFonts'> {
    fonts?: readonly PresentationSessionFont[];
    fallbackFonts?: readonly PresentationSessionFont[];
    wasm?: ArrayBuffer | WebAssembly.Module;
}
/**
 * Slide metadata without layout; indices are zero-based.
 * @experimental
 */
interface PresentationSlideSummary {
    id: string;
    index: number;
    name: string | null;
    layoutPartPath: string | null;
}
/**
 * Presentation projection; version counts applied batches and size is in EMU.
 * @experimental
 */
type PresentationSessionState = Omit<SessionState, 'stage'> & {
    format: 'pptx';
    stage: 'preview' | 'ready' | 'failed';
    slides: PresentationSlideSummary[];
    size: {
        width: number;
        height: number;
    };
};
/**
 * Presentation change notifications after applied batches.
 * @experimental
 */
interface PresentationSessionEvents {
    changed: {
        version: number;
        dirty: boolean;
    };
}
/**
 * Presentation RPC methods; engine version tokens remain strings.
 * @experimental
 */
type PresentationSessionMethods = {
    open(bytes: ArrayBuffer, options?: PresentationSessionOpenOptions): PresentationSessionState;
    version(): string;
    readContent(request?: PptxReadRequest): PptxReadResult;
    findText(request: PptxFindRequest): PptxFindResult;
    validateEdits(request: PptxEditRequest): PptxValidationResult;
    applyEdits(request: PptxEditRequest): PptxEditResult;
    frame(slideIndex: number): PresentationWireFrame;
    slides(): PresentationSlideSummary[];
    slideSize(): {
        width: number;
        height: number;
    };
    save(): ArrayBuffer;
    dispose(): void;
};

type PptxWorkerEditorOperation = Exclude<PresentationReplayOp, {
    method: 'insertTableRow' | 'deleteTableRow' | 'insertTableColumn' | 'deleteTableColumn';
}>;
type PptxWorkerEditorReply = PresentationReplayReply;
type PptxWorkerEditorFrame = PresentationFrame & {
    slideId: string;
    sequence: number;
};

/**
 * Options for opening a presentation in a dedicated worker.
 * @experimental
 */
interface OpenPresentationSessionOptions extends OpenPresentationOptions {
    worker?: () => Worker;
    wasm?: ArrayBuffer | WebAssembly.Module;
}
/**
 * Async presentation access and its current local projection.
 * @experimental
 */
interface PresentationSession {
    readonly state: PresentationSessionState;
    readonly call: Promisified<Omit<PresentationSessionMethods, 'open' | 'dispose' | 'frame'>> & {
        /**
         * @experimental A newer frame call replaces a queued one, which rejects with an error
         * named SessionSuperseded.
         */
        frame(slideIndex: number): Promise<PresentationFrame>;
    };
    save(): Promise<Uint8Array>;
    on<K extends keyof PresentationSessionEvents>(name: K, listener: (payload: PresentationSessionEvents[K]) => void): () => void;
    onFailure(listener: (failure: SessionFailure) => void): () => void;
    readonly failure: SessionFailure | undefined;
    dispose(): Promise<void>;
}
/**
 * Opens a worker session, transferring copies so caller buffers stay usable.
 * @experimental
 */
declare function openPresentationSession(bytes: Uint8Array | ArrayBuffer, options?: OpenPresentationSessionOptions): Promise<PresentationSession>;

declare const readMethods: readonly ["snapshot", "story", "anchorCaret", "resolveCaretAnchor", "version", "readContent", "findText", "validateEdits", "searchText", "isProposalsAvailable", "listProposals", "layoutSlide", "hitTest", "mediaBytes", "comments", "canUndo", "canRedo", "undoCaptureMode", "onUpdate"];
interface PptxWorkerEditorInteractionAccess {
    snapshot(): {
        snapshot: DeckSnapshot;
        keys: Record<string, string>;
    };
    key(index: number): string;
    activate(slideId: string, key: string): boolean;
    hitTest(slideId: string, x: number, y: number): HitTestResult | null;
}
type PptxWorkerEditorAccess = Pick<PresentationHandle, typeof readMethods[number] | PptxWorkerEditorOperation['method'] | 'clientId'> & {
    readonly interaction: PptxWorkerEditorInteractionAccess;
};

type PptxWorkerEditorStage = 'opening' | 'hydrating' | 'ready' | 'failed' | 'recovering' | 'disposed';
interface PptxWorkerEditorState {
    readonly stage: PptxWorkerEditorStage;
    readonly sequence: number;
    readonly acknowledgedSequence: number;
    readonly version?: string;
    readonly projection?: PresentationSessionState;
    readonly initialFrame?: PptxWorkerEditorFrame;
    readonly failure?: PptxWorkerEditorFailedError;
}
interface PptxWorkerEditorOptions extends OpenPresentationSessionOptions {
    collaboration?: unknown;
    signal?: AbortSignal;
    onError?(error: PptxWorkerEditorFailedError): void;
}
interface PptxWorkerEditorRecovery {
    bytes: Uint8Array;
    recovery: true;
}
interface PptxWorkerEditorSession {
    readonly state: PptxWorkerEditorState;
    readonly hydrated: boolean;
    readonly failure: PptxWorkerEditorFailedError | undefined;
    subscribe(listener: (state: PptxWorkerEditorState) => void): () => void;
    whenHydrated(): Promise<void>;
    handleAsync(): Promise<PptxWorkerEditorAccess>;
    apply(op: PptxWorkerEditorOperation): PptxWorkerEditorReply;
    flush(): Promise<void>;
    saveAsync(): Promise<Uint8Array>;
    frame(slideId: string): Promise<PptxWorkerEditorFrame>;
    recoverySave(): Promise<PptxWorkerEditorRecovery>;
    dispose(): Promise<void>;
}
declare function createPptxWorkerEditorSession(bytes: Uint8Array | ArrayBuffer, options?: PptxWorkerEditorOptions): PptxWorkerEditorSession;

export { type PptxExportDiagnostic as $, type PptxAnchor as A, type BlipEffect as B, type CanvasImageResolver as C, type DeckSnapshot as D, type EditProfile as E, type PptxAnchorScope as F, type GeometryPathCommand as G, type HistoryProfile as H, type ImageCrop as I, type PptxCaretAnchor as J, type PptxEditFailure as K, type LayoutProfile as L, type MarkdownAnchor as M, type PptxEditFailureCode as N, type OpenPresentationOptions as O, type Paint as P, type PptxEditHistory as Q, type PptxEditPreview as R, type SlideDisplayList as S, type PptxEditReceipt as T, type PptxEditRefusal as U, type PptxEditRequest as V, type PptxEditResult as W, type PptxEditSource as X, type PptxEditStep as Y, type PptxEditTarget as Z, type PptxExportComment as _, type CaretStop as a, type ShapeKind as a$, type PptxExportDiagnosticCode as a0, PptxExportError as a1, type PptxExportFailure as a2, type PptxExportFailureCode as a3, type PptxExportList as a4, type PptxExportMark as a5, type PptxExportNotes as a6, type PptxExportObject as a7, type PptxExportObjectKind as a8, type PptxExportOptions as a9, type PptxStructuredContent as aA, type PptxTextField as aB, type PptxTextGuard as aC, type PptxTextMatch as aD, type PptxTextRange as aE, type PptxTextSearchOptions as aF, type PptxTextSpan as aG, type PptxTextTarget as aH, type PptxValidationResult as aI, PptxWorkerEditorDisposedError as aJ, type PresentationHandle as aK, type PresetShapeDraft as aL, type PrimitiveTransform as aM, type Profiled as aN, type ProfiledLayout as aO, type Proposal as aP, type ProposalAcceptance as aQ, type ProposalChange as aR, type ProposalDiffSlide as aS, type ProposalEdit as aT, type ProposalPreview as aU, type ProposalTextChange as aV, type ShapeAdjustReceipt as aW, type ShapeDraft as aX, type ShapeFill as aY, type ShapeFillReceipt as aZ, type ShapeGradient as a_, type PptxExportParagraph as aa, type PptxExportRefusal as ab, type PptxExportResult as ac, type PptxExportRun as ad, type PptxExportShape as ae, type PptxExportShapeKind as af, type PptxExportSlide as ag, type PptxExportStory as ah, type PptxExportTable as ai, type PptxExportTableCell as aj, type PptxFindMatch as ak, type PptxFindRequest as al, type PptxFindResult as am, type PptxFindScope as an, type PptxFontFace as ao, type PptxMarkdownContent as ap, type PptxMarkdownOptions as aq, type PptxParagraphText as ar, PptxPeerNotReadyError as as, type PptxReadRequest as at, type PptxReadResult as au, type PptxShapeTarget as av, type PptxSlideTarget as aw, type PptxSourceProvenance as ax, type PptxStoryTarget as ay, type PptxStoryText as az, type ColorTransform as b, type PresentationSession as b$, type ShapeLineEnd as b0, type ShapeOutline as b1, type ShapePrimitive as b2, type ShapeReceipt as b3, type ShapeRect as b4, type ShapeSnapshot as b5, type ShapeStroke as b6, type ShapeStrokeReceipt as b7, type ShapeZOrderReceipt as b8, type SlideCanvasLike as b9, isProposalsAvailable as bA, isWasmAvailable as bB, openPresentation as bC, openPresentationSession as bD, paintSlide as bE, renderPptxMarkdown as bF, sizeCanvasForSlide as bG, wasmVersion as bH, type PresentationSlideSummary as bI, type PresentationWireFrame as bJ, SessionFailure as bK, type PresentationSessionOpenOptions as bL, type OpenPresentationSessionOptions as bM, PptxWorkerEditorFailedError as bN, PptxPeerHydrationError as bO, type PptxWorkerEditorAccess as bP, PptxWorkerEditorCollaborationError as bQ, type PptxWorkerEditorFrame as bR, type PptxWorkerEditorInteractionAccess as bS, type PptxWorkerEditorOperation as bT, type PptxWorkerEditorOptions as bU, type PptxWorkerEditorRecovery as bV, type PptxWorkerEditorReply as bW, type PptxWorkerEditorSession as bX, type PptxWorkerEditorStage as bY, type PptxWorkerEditorState as bZ, type PresentationFrame as b_, type SlideLayoutSnapshot as ba, type SlidePrimitive as bb, type SlideReceipt as bc, type SlideSnapshot as bd, StaleProposalError as be, type StorySnapshot as bf, type Stroke as bg, type StrokeEnd as bh, type TableReceipt as bi, type TextBoxPrimitive as bj, type TextParagraphDraft as bk, type TextReceipt as bl, type TextRunSnapshot as bm, type TextStyle as bn, type TextStylePatch as bo, type TextStyleSnapshot as bp, type TransformReceipt as bq, type UndoCaptureMode as br, type UpdateEvent as bs, type ValidationSuccess as bt, type WasmInitInput as bu, createPptxWorkerEditorSession as bv, exportPptxMarkdown as bw, exportPptxStructured as bx, initWasm as by, inspectPresentation as bz, type ColorValue as c, type PresentationSessionEvents as c0, type PresentationSessionFont as c1, type PresentationSessionMethods as c2, type PresentationSessionState as c3, type CommentFlavor as d, type CommentReceipt as e, type CommentSnapshot as f, type EditSuccess as g, type ExportCompletion as h, type ExportDiagnostic as i, type ExportSeverity as j, type HistoryResult as k, type HitTestResult as l, type ImageEffect as m, type ImagePrimitive as n, type InheritedGeometry as o, type InspectPresentationOptions as p, type OperationFailure as q, type OperationRefusal as r, type PaintSlideOptions as s, type ParagraphAlignment as t, type ParagraphSnapshot as u, type PictureDraft as v, type PlaceholderPrimitive as w, type PositionedGlyph as x, type PositionedTextLine as y, type PositionedTextRun as z };
