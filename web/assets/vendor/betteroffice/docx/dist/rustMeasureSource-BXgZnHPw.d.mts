import { CompatibilityFlags } from './types/document.mjs';

/** Builds deterministic embedded, bundled, script, and last-resort font chains. */
/** A lazy face loader with measurement and fallback options. */
type BundledFontLoader = (() => Promise<ArrayBuffer>) & {
    /** Word measurement family; defaults to the requested family. */
    measureAs?: string;
    /** Only stands in for a primary face that failed to load. */
    onlyIfPrimaryFails?: boolean;
};
/**
 * Script bucket a fallback face provides glyph coverage for. Han text is
 * region-resolved by the caller (SC/TC/JP/KR — see `rustMeasureSource.ts`);
 * kana, Hangul, Arabic and Hebrew detect directly.
 *
 * @public
 */
type FontScript = 'cjk-sc' | 'cjk-tc' | 'cjk-jp' | 'cjk-kr' | 'arabic' | 'hebrew';
/**
 * Resolver for the bundled metric-compatible set (Carlito↔Calibri,
 * Liberation↔Arial/Times/Courier, …). Returns a lazy byte loader so the
 * (lazily fetched, same-origin) binary is only downloaded when a document
 * actually needs the face, or `undefined` when the family has no bundled
 * substitute.
 *
 * @public
 */
interface BundledFontProvider {
    /** Resolve a Word family to bundled metric-compatible face byte loaders, or undefined. */
    resolve(family: string, bold: boolean, italic: boolean): BundledFontLoader | undefined;
    /** Like {@link BundledFontProvider.resolve}, but also accepts bundled family names such as `"Gelasio"`, and leaves missing styles for browser synthesis. */
    resolveFamily?(family: string, bold: boolean, italic: boolean): (() => Promise<ArrayBuffer>) | undefined;
    /**
     * Optional per-script coverage fallback (Noto CJK/RTL faces). Same loader
     * contract as {@link BundledFontProvider.resolve}; providers without
     * script faces simply omit the method. These faces are coverage fallbacks
     * first, metric approximations second — CJK metric compatibility is much
     * weaker than the Carlito/Calibri class of substitutes.
     */
    resolveScriptFallback?(script: FontScript, bold: boolean, italic: boolean): (() => Promise<ArrayBuffer>) | undefined;
    /** Coverage for characters absent from a bundled substitute. */
    resolveGlyphFallback?(family: string, bold: boolean, italic: boolean, office?: 'word' | 'powerpoint'): (() => Promise<ArrayBuffer>) | undefined;
    /**
     * The always-available last-resort base face (broad-coverage Latin —
     * Liberation Sans/Serif per serif-ness). Unlike {@link
     * BundledFontProvider.resolve}, a conforming provider (e.g.
     * `@betteroffice/fonts`'s `resolveLastResortFace`) returns a loader for
     * EVERY family, so the chain this registry builds is guaranteed non-empty
     * and a run never routes to the browser measurer for want of font bytes. The
     * face's metrics are the base font's, not the requested family's — the
     * accepted divergence for a truly-unknown font, in exchange for staying on
     * the native measurement path.
     *
     * Optional so mock/partial providers can omit it; when absent (or returning
     * undefined) an unmapped family still yields an empty chain and the caller
     * browser-falls-back that run — the pre-policy behavior. Same lazy loader
     * contract as {@link BundledFontProvider.resolve}. This registry passes
     * `office: 'word'` so the pick follows Word's substitution.
     */
    resolveLastResort?(family: string, bold: boolean, italic: boolean, office?: 'word' | 'powerpoint'): BundledFontLoader | undefined;
}
/**
 * One embedded face extracted from the open document. Structurally identical
 * to `EmbeddedFontFace` (`utils/embeddedFonts.ts`), so the output of
 * `getEmbeddedFontFaces` feeds straight in; duplicated here so this module
 * stays decoupled from the loader.
 *
 * @public
 */
interface EmbeddedFaceInput {
    /** Word font name the face is registered under (attacker-controlled). */
    family: string;
    /** `'bold'` for the embedBold/embedBoldItalic slots, else `'normal'`. */
    weight: 'normal' | 'bold';
    /** `'italic'` for the embedItalic/embedBoldItalic slots, else `'normal'`. */
    style: 'normal' | 'italic';
    /** De-obfuscated OpenType/TrueType bytes. */
    data: ArrayBuffer;
    /** Whether the source face was subsetted (`w:subsetted`). */
    subsetted: boolean;
}
/** A provider or async factory; `undefined` means no bundled bytes. @public */
type BundledFontProviderSource = BundledFontProvider | (() => Promise<BundledFontProvider | undefined>);

interface RustTextEngine {
    registerFont(bytes: Uint8Array): number;
    /**
     * Measurement view of `id` carrying the vertical metrics and advance pitch
     * Word measures `family` with; `id` when the engine knows none. Optional so
     * a host that predates it still measures, with the substitute's own
     * metrics.
     */
    registerSubstituteFont?(id: number, family: string): number;
    clearFonts(): void;
}
interface ResidentFontRequirement {
    key: string;
    family: string;
    bold: boolean;
    italic: boolean;
    scripts?: FontScript[];
}
interface ResidentMeasurementConfig {
    fontChains: Record<string, number[]>;
    defaults: {
        fontSize: number;
        fontFamily: string;
    };
    compat: {
        noLeading: boolean;
        doNotExpandShiftReturn: boolean;
    };
    authoritativeShaping: true;
}
interface RustMeasureSource {
    setEmbeddedFaces(faces: EmbeddedFaceInput[]): void;
    setCompat(flags: CompatibilityFlags | undefined): void;
    prepareFontRequirements(requirements: ResidentFontRequirement[]): Promise<boolean>;
    measurementConfigForRequirements(requirements: ResidentFontRequirement[]): ResidentMeasurementConfig | undefined;
    clear(): void;
}
declare function getRustTextEngine(): Promise<RustTextEngine>;
/** Builds a source with an explicit provider or the optional default package. */
declare function createRustMeasureSource(options: {
    engine: RustTextEngine;
    bundled?: BundledFontProvider;
}): RustMeasureSource;

export { type BundledFontProvider as B, type EmbeddedFaceInput as E, type FontScript as F, type ResidentMeasurementConfig as R, type BundledFontProviderSource as a, type ResidentFontRequirement as b, type RustMeasureSource as c, type RustTextEngine as d, createRustMeasureSource as e, getRustTextEngine as g };
