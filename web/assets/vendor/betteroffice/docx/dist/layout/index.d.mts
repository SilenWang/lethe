import { B as BundledFontProvider } from '../rustMeasureSource-BXgZnHPw.mjs';
export { a as BundledFontProviderSource, E as EmbeddedFaceInput, F as FontScript, b as ResidentFontRequirement, R as ResidentMeasurementConfig, c as RustMeasureSource, d as RustTextEngine, e as createRustMeasureSource, g as getRustTextEngine } from '../rustMeasureSource-BXgZnHPw.mjs';
import { f as SectionProperties, H as HeaderFooter } from '../content-DVT06V_6.mjs';
export { D as DrawingScene, V as DrawingSceneNode, b as ShapeEffect, aY as ShapeFillPaint, aZ as ShapeStrokePaint, c as ShapeTextBodyProperties } from '../content-DVT06V_6.mjs';
import { Document } from '../types/document.mjs';
import '../formatting-p5MneNuy.mjs';
import '../docx/wrapTypes.mjs';
import '../styles-DZZz2oRy.mjs';

/** Opt-in bundled-font provider resolution. @packageDocumentation */

/**
 * The slice of `@betteroffice/fonts` this module consumes. Structural on
 * purpose: the engine never names that package, so no bundler ever has to
 * resolve it.
 *
 * @public
 */
interface BundledFontModule {
    createFontProvider(options?: {
        baseUrl?: string | URL;
    }): BundledFontProvider;
}
/**
 * How to obtain bundled fonts. Nothing is loaded until one of `fonts` or
 * `load` is given — the engine never reaches for a font package on its own.
 *
 * @public
 */
interface DefaultFontOptions {
    /** The imported `@betteroffice/fonts` module. */
    fonts?: BundledFontModule;
    /** Lazy alternative to {@link DefaultFontOptions.fonts}, resolving to the same module. */
    load?: () => Promise<unknown>;
    /** Fetch the faces from this base URL instead of the module's own assets. */
    baseUrl?: string | URL;
}
/** Configure the default provider and reset its memoized resolution. @public */
declare function configureDefaultFonts(next: DefaultFontOptions): void;
/** Resolve the configured provider, or `undefined` when no font source is set. @public */
declare function resolveDefaultFontProvider(): Promise<BundledFontProvider | undefined>;

/**
 * Selection-overlay geometry value types, shared by the canvas overlays and
 * the display-list queries (`selectionToRectsFromDisplayList` /
 * `getCaretPositionFromDisplayList`).
 *
 * @packageDocumentation
 * @public
 */
/**
 * A rectangle representing part of a selection.
 *
 * @public
 */
type SelectionRect = {
    /** X coordinate in container space. */
    x: number;
    /** Y coordinate in container space. */
    y: number;
    /** Width of the rectangle. */
    width: number;
    /** Height of the rectangle (typically line height). */
    height: number;
    /** Page index (0-based). */
    pageIndex: number;
};
/**
 * Caret position for collapsed selection.
 *
 * @public
 */
type CaretPosition = {
    /** X coordinate in container space. */
    x: number;
    /** Y coordinate in container space. */
    y: number;
    /** Height of the caret (line height). */
    height: number;
    /** Page index (0-based). */
    pageIndex: number;
};

declare const DEFAULT_PAGE_HEIGHT_PX = 1056;
declare function resolveHeaderFooter(document: Document | null, section: SectionProperties | null | undefined): {
    header: HeaderFooter | null;
    footer: HeaderFooter | null;
    firstHeader: HeaderFooter | null;
    firstFooter: HeaderFooter | null;
};

/** Coordinates selection paint with the latest completed layout sequence. */
declare class LayoutSelectionGate {
    #private;
    setStateSeq(sequence: number): void;
    incrementStateSeq(): number;
    getStateSeq(): number;
    getRenderSeq(): number;
    onLayoutStart(): void;
    onLayoutComplete(sequence: number): void;
    isSafeToRender(): boolean;
    requestRender(): void;
    onRender(callback: () => void): () => void;
    reset(): void;
    getDebugInfo(): {
        stateSeq: number;
        renderSeq: number;
        layoutUpdating: boolean;
        hasPendingRender: boolean;
        isSafe: boolean;
    };
}

export { type BundledFontModule, BundledFontProvider, type CaretPosition, DEFAULT_PAGE_HEIGHT_PX, type DefaultFontOptions, LayoutSelectionGate, type SelectionRect, configureDefaultFonts, resolveDefaultFontProvider, resolveHeaderFooter };
