import { F as FootnoteProperties, E as EndnoteProperties, g as DocumentBody, h as NumberingDefinitions, i as Footnote, j as Endnote, H as HeaderFooter, d as Chart, k as BookmarkRange } from '../content-DVT06V_6.mjs';
export { A as AbstractNumbering, B as BlockContent, l as BlockSdt, m as BookmarkEnd, n as BookmarkStart, o as BreakContent, p as ChartAxis, q as ChartContent, r as ChartDataLabels, s as ChartGrouping, t as ChartLegend, u as ChartPlotGroup, v as ChartPoint, w as ChartPointLabel, x as ChartSeries, y as ChartType, z as Column, e as Comment, G as CommentAnchorRange, I as CommentAuthor, J as CommentRangeEnd, K as CommentRangeStart, L as CommentReferenceContent, M as ComplexField, O as ContentPosition, Q as DEFAULT_WATERMARK_PRESETS, T as Deletion, U as DrawingContent, D as DrawingScene, V as DrawingSceneNode, X as EndnotePosition, Y as Field, Z as FieldCharContent, _ as FieldFormData, $ as FieldInlineContent, a0 as FieldType, a1 as FooterReference, a2 as FootnotePosition, a3 as HeaderFooterType, a4 as HeaderReference, a5 as HorizontalRuleContent, a6 as Hyperlink, a7 as HyperlinkContent, a8 as Image, a9 as ImageCrop, aa as ImageEffect, ab as ImageHyperlink, ac as ImagePadding, ad as ImagePosition, ae as ImageRotationBounds, af as ImageSize, ag as ImageTransform, ah as ImageWrap, ai as ImageWrapPoint, aj as InlineSdt, ak as Insertion, al as InstrTextContent, am as LevelSuffix, an as LineNumberRestart, ao as ListLevel, ap as ListRendering, aq as MathEquation, ar as MoveFrom, as as MoveFromRangeEnd, at as MoveFromRangeStart, au as MoveTo, av as MoveToRangeEnd, aw as MoveToRangeStart, ax as NoBreakHyphenContent, N as NoteKind, ay as NoteNumberRestart, az as NoteRefMarkContent, aA as NoteReferenceContent, aB as NoteSeparatorReference, aC as NumberFormat, aD as NumberingInstance, aE as OpaqueDrawingContent, aF as PageNumberingProperties, aG as PageOrientation, P as Paragraph, aH as ParagraphContent, aI as ParagraphPropertyChange, aJ as PictureWatermark, aK as PropertyChangeInfo, aL as Run, aM as RunContent, aN as RunPropertyChange, aO as SdtCheckboxGlyph, S as SdtControlState, aP as SdtDataBinding, aQ as SdtDateState, aR as SdtGalleryState, a as SdtProperties, aS as SdtType, aT as Section, f as SectionProperties, aU as SectionStart, aV as SeparatorContent, aW as Shape, aX as ShapeContent, b as ShapeEffect, aY as ShapeFillPaint, aZ as ShapeStrokePaint, a_ as ShapeTextBody, c as ShapeTextBodyProperties, a$ as SimpleField, b0 as SoftHyphenContent, b1 as StructuredFieldContent, b2 as StructuredFieldTree, b3 as SymbolContent, b4 as TabContent, b5 as Table, b6 as TableCell, b7 as TableCellPropertyChange, b8 as TablePropertyChange, b9 as TableRow, ba as TableRowPropertyChange, bb as TableStructuralChangeInfo, bc as TextBox, bd as TextContent, be as TextWatermark, bf as TrackedChangeInfo, bg as TrackedRunChange, bh as VerticalAlign, W as Watermark, bi as pictureWatermarkDisplayEmu } from '../content-DVT06V_6.mjs';
import { f as Theme, C as ColorValue } from '../formatting-p5MneNuy.mjs';
export { B as BorderSpec, g as CellMargins, h as ColorTransform, i as ConditionalFormatStyle, E as EmphasisMark, F as FloatingTableProperties, L as LineSpacingRule, j as ParagraphAlignment, k as ParagraphCnfStyle, P as ParagraphFormatting, R as RunFontHint, l as RunLanguage, S as ShadingProperties, m as ShapeFill, n as ShapeOutline, o as ShapeType, p as TabLeader, q as TabStop, r as TabStopAlignment, s as TableBorders, e as TableCellFormatting, c as TableFormatting, t as TableLook, u as TableMeasurement, d as TableRowFormatting, v as TableStyleCascade, w as TableStyleRegion, x as TableWidthType, y as TextEffect, T as TextFormatting, a as TextModernEffects, z as ThemeColorScheme, A as ThemeColorSlot, D as ThemeFont, G as ThemeFontScheme, U as UnderlineStyle } from '../formatting-p5MneNuy.mjs';
import { S as StyleDefinitions, F as FontTable, R as RelationshipMap, M as MediaFile } from '../styles-DZZz2oRy.mjs';
export { D as DocDefaults, b as FontEmbed, c as FontInfo, d as Relationship, e as RelationshipType, a as Style, f as StyleType } from '../styles-DZZz2oRy.mjs';
import '../docx/wrapTypes.mjs';

interface CompatibilityFlags {
    compatibilityMode: number;
    noLeading: boolean;
    doNotExpandShiftReturn: boolean;
    useWord97LineBreakRules: boolean;
    balanceSingleByteDoubleByteWidth: boolean;
    doNotUseHTMLParagraphAutoSpacing?: boolean;
    suppressSpBfAfterPgBrk?: boolean;
    allowSpaceOfSameStyleInTable?: boolean;
    adjustLineHeightInTable?: boolean;
}
/** Public model contract rehydrated by the Rust parser. */
interface DocumentSettings {
    defaultTabStop: number;
    defaultTableStyle?: string;
    themeFontLang?: {
        eastAsia?: string;
        bidi?: string;
    };
    compatibilityFlags: CompatibilityFlags;
    updateFields?: boolean;
    evenAndOddHeaders?: boolean;
    trackRevisions?: boolean;
    doNotTrackMoves?: boolean;
    doNotTrackFormatting?: boolean;
    revisionView?: {
        markup?: boolean;
        comments?: boolean;
        insertionsDeletions?: boolean;
        formatting?: boolean;
    };
    footnotePr?: FootnoteProperties;
    endnotePr?: EndnoteProperties;
}

/**
 * Comprehensive TypeScript types for full DOCX document representation
 *
 * This barrel file re-exports all types from the split modules.
 * Existing imports from './types/document' continue to work unchanged.
 *
 * Module structure:
 * - colors.ts      — Color primitives, borders, shading
 * - formatting.ts  — Text, paragraph, and table formatting properties
 * - lists.ts       — Numbering and list definitions
 * - content.ts     — Content model (runs, images, shapes, tables, paragraphs, sections)
 * - styles.ts      — Styles, theme, fonts, relationships, media
 * @packageDocumentation
 * @public
 */

/**
 * Complete DOCX package structure
 */
interface DocxPackage {
    /** Model contract version. Undefined reads as legacy version 0. */
    contractVersion?: number;
    /** Document body */
    document: DocumentBody;
    /** Style definitions */
    styles?: StyleDefinitions;
    /** Theme */
    theme?: Theme;
    /** Numbering definitions */
    numbering?: NumberingDefinitions;
    /** Document-wide settings from `word/settings.xml` */
    settings?: DocumentSettings;
    /** Font table */
    fontTable?: FontTable;
    /** Footnotes (normal notes only — separators live in `footnoteSeparators`) */
    footnotes?: Footnote[];
    /** Endnotes (normal notes only — separators live in `endnoteSeparators`) */
    endnotes?: Endnote[];
    /**
     * Separator footnotes (`w:type="separator"` / `"continuationSeparator"` /
     * `"continuationNotice"`) kept out of `footnotes` so rendering/layout only
     * sees real notes. Retained for round-trip: Word rejects a footnotes part
     * whose separator notes are missing, so the serializer re-emits these ahead
     * of the normal notes.
     */
    footnoteSeparators?: Footnote[];
    /** Separator endnotes — see `footnoteSeparators`. */
    endnoteSeparators?: Endnote[];
    /** Headers by relationship ID */
    headers?: Map<string, HeaderFooter>;
    /** Footers by relationship ID */
    footers?: Map<string, HeaderFooter>;
    /** Document relationships */
    relationships?: RelationshipMap;
    /** Media files */
    media?: Map<string, MediaFile>;
    /** Parsed DrawingML chart parts keyed by normalized package path. */
    charts?: Map<string, Chart>;
    /** Exact document-wide bookmark ranges. Undefined = derive from markers. */
    bookmarkRanges?: BookmarkRange[];
    /** Document page background (`w:document/w:background`). Undefined = transparent/white host default. */
    background?: {
        color?: ColorValue;
        themeTint?: string;
        themeShade?: string;
    };
    /** Document properties */
    properties?: {
        title?: string;
        subject?: string;
        creator?: string;
        keywords?: string;
        description?: string;
        lastModifiedBy?: string;
        revision?: number;
        created?: Date;
        modified?: Date;
    };
}
/**
 * Top-level parsed DOCX document — the result of `parseDocx(buffer)`.
 *
 * Wraps the unzipped DOCX package (`document.xml`, `styles.xml`, etc.),
 * the original buffer for round-trip saves and parse warnings detected during
 * ingestion.
 *
 * @example
 * ```ts
 * import { parseDocx } from '@betteroffice/docx/docx';
 * const doc = await parseDocx(buffer);
 * console.log(doc.package.document.content.length);
 * ```
 */
interface Document {
    /** Top-level model contract version. Undefined reads as legacy version 0. */
    contractVersion?: number;
    /** Parsed DOCX package — body, styles, numbering, theme, media, headers/footers. */
    package: DocxPackage;
    /** Original DOCX buffer. Kept for round-trip saves that preserve untouched parts. */
    originalBuffer?: ArrayBuffer;
    /** Non-fatal parser diagnostics — malformed parts, unsupported features, fallbacks. */
    warnings?: string[];
}

export { BookmarkRange, Chart, ColorValue, type CompatibilityFlags, type Document, DocumentBody, type DocumentSettings, type DocxPackage, Endnote, EndnoteProperties, FontTable, Footnote, FootnoteProperties, HeaderFooter, MediaFile, NumberingDefinitions, RelationshipMap, StyleDefinitions, Theme };
