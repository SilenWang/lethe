export { a as attemptSelectiveSave, p as parseDocx } from '../selectiveSave-r-NMK6aI.mjs';
export { R as RepackResult, c as createDocx, r as repackDocx, a as repackDocxWithWarnings, u as updateMultipleFiles } from '../rezip-CfwAYdV4.mjs';
import { WrapType } from './wrapTypes.mjs';
import { B as BlockContent, e as Comment, W as Watermark } from '../content-DVT06V_6.mjs';
import { Document } from '../types/document.mjs';
import '../docxInput-DTbCa48g.mjs';
import '../formatting-p5MneNuy.mjs';
import '../styles-DZZz2oRy.mjs';

type AnchorWrapType = Exclude<WrapType, 'inline'>;
type ImageLayoutTarget = AnchorWrapType | 'squareLeft' | 'squareRight' | 'inline';
type ImageResizeHandle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';
/** Compute the preview dimensions for an image resize gesture. */
declare function calculateResizedImageDimensions(handle: ImageResizeHandle, deltaX: number, deltaY: number, startWidth: number, startHeight: number, lockAspect: boolean): {
    width: number;
    height: number;
};
interface SetImageWrapTypeOptions {
    initialPositionEmu?: {
        horizontalEmu: number;
        verticalEmu: number;
    };
}
interface ImageLayoutPosition {
    horizontal?: {
        relativeTo?: string;
        posOffset?: number;
        align?: string;
    };
    vertical?: {
        relativeTo?: string;
        posOffset?: number;
        align?: string;
    };
}
interface ImageLayoutCurrentAttrs {
    wrapType?: string | null;
    cssFloat?: string | null;
    position?: ImageLayoutPosition | null;
}
interface ImageLayoutAttrs extends Record<string, unknown> {
    wrapType: WrapType;
    displayMode: 'inline' | 'float' | 'block';
    cssFloat: 'left' | 'right' | 'none';
    wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
    position?: ImageLayoutPosition;
    distTop?: number;
    distBottom?: number;
    distLeft?: number;
    distRight?: number;
}
/** Resolve the authored image attributes for one Word-style wrap choice. */
declare function resolveImageLayoutAttrs(target: ImageLayoutTarget, current: ImageLayoutCurrentAttrs, opts?: SetImageWrapTypeOptions): ImageLayoutAttrs;
/** Map current OOXML image attrs to the shared menu choice vocabulary. */
declare function deriveLayoutChoice(wrapType: WrapType, cssFloat?: string | null): ImageLayoutTarget | null;
type ImageLayoutIconHint = 'inline' | 'squareLeft' | 'squareRight' | 'behind' | 'inFront';
interface ImageLayoutOptionDef {
    choice: ImageLayoutTarget;
    i18nLabelKey: string;
    i18nDescKey: string;
    iconHint: ImageLayoutIconHint;
}
/** Word's five directional Wrap Text menu entries. */
declare const IMAGE_LAYOUT_OPTIONS: readonly ImageLayoutOptionDef[];
declare function isImageLayoutOptionEnabled(_option: ImageLayoutOptionDef, _currentWrapType: WrapType): boolean;
/** Map legacy toolbar wrap values onto the shared image command target. */
declare function toolbarValueToLayoutTarget(value: string): ImageLayoutTarget | undefined;

/**
 * Reply-range marker injection for serialization.
 *
 * Word / Pages / LibreOffice expect every comment in `comments.xml`
 * (including REPLY threads) to have matching `commentRangeStart` /
 * `commentRangeEnd` / `commentReference` markers in `document.xml`.
 * The document only stamps marks for the parent comment because
 * replies don't have their own visible range — they share the parent
 * thread's text. So before serialization we walk the body content and
 * synthesize parallel range markers for every reply.
 *
 * Two helpers, one per parent shape:
 * - `injectReplyRangeMarkers` — replies whose parent is another
 *   comment (regular threaded discussion). Finds the parent's
 *   `commentRangeStart`/`End` and adds parallel markers next to them.
 * - `injectTCReplyRangeMarkers` — replies whose parent is a tracked
 *   change (insertion/deletion). Wraps the TC content with
 *   commentRange markers.
 *
 * Pre-#... this code lived inside React's DocxEditor.tsx; Vue had no
 * equivalent and so silently lost reply markers when saving collab
 * documents. Living in core means both adapters get it for free.
 */

/**
 * Inject `commentRangeStart`/`commentRangeEnd` for reply comments
 * that share their parent comment's text range and have none of their own.
 */
declare function injectReplyRangeMarkers(content: BlockContent[], comments: Comment[]): boolean;
/**
 * Inject `commentRangeStart`/`commentRangeEnd` for comments whose
 * parent is a tracked-change revision (insertion/deletion) and that have
 * no range of their own. The TC content nodes don't carry the comment's
 * range, so we wrap them.
 */
declare function injectTCReplyRangeMarkers(content: BlockContent[], comments: Comment[]): boolean;

/**
 * Watermark document API
 *
 * Platform-agnostic helpers for reading and applying a document watermark.
 * Shared by the React and Vue adapters (and the imperative ref API) so the
 * "Design → Watermark" behavior stays identical across frameworks.
 *
 * A watermark lives on `HeaderFooter.watermark`. MS Word repeats the same
 * watermark across the default, first-page, and even-page headers of every
 * section, so `setDocumentWatermark`:
 *
 * 1. Applies the watermark (a per-header copy) to every existing header, and
 * 2. Creates the header parts a section needs but lacks, so the watermark
 *    still shows on title pages (`w:titlePg`) and even pages
 *    (`w:evenAndOddHeaders`) and on documents that had no header at all.
 *
 * To avoid breaking header inheritance (a section that omits a header
 * reference inherits the previous section's header — Word's "link to
 * previous"), a missing `first`/`even` header part is only created when **no**
 * header of that type exists anywhere in the document, i.e. there is nothing to
 * inherit. All updates are immutable — a new `Document` is returned so the
 * change lands in the host's undo/redo history.
 */

/** Read the document's watermark (the first header that carries one). */
declare function getDocumentWatermark(doc: Document | null | undefined): Watermark | undefined;
/**
 * Return a new `Document` with the watermark applied to all headers, or removed
 * when `watermark` is null. Creates the header parts a section needs but lacks
 * (default for a headerless doc; first/even for title/even pages) so the
 * watermark shows on every page MS Word would show it.
 */
declare function setDocumentWatermark(doc: Document, watermark: Watermark | null): Document;

export { type AnchorWrapType, IMAGE_LAYOUT_OPTIONS, type ImageLayoutAttrs, type ImageLayoutCurrentAttrs, type ImageLayoutIconHint, type ImageLayoutOptionDef, type ImageLayoutPosition, type ImageLayoutTarget, type ImageResizeHandle, type SetImageWrapTypeOptions, calculateResizedImageDimensions, deriveLayoutChoice, getDocumentWatermark, injectReplyRangeMarkers, injectTCReplyRangeMarkers, isImageLayoutOptionEnabled, resolveImageLayoutAttrs, setDocumentWatermark, toolbarValueToLayoutTarget };
