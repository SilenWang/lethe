import { A as ThemeColorSlot, C as ColorValue, f as Theme, z as ThemeColorScheme } from './formatting-p5MneNuy.mjs';

/**
 * Color primitives and math shared across OOXML formats.
 *
 * Handles theme color slot references (accent1, dk1, ...), RGB hex values,
 * tint/shade modifiers, and the derived color helpers (lighten/darken/blend/
 * contrast) built on top of them.
 *
 * Tint/Shade Calculations (ECMA-376 §17.3.2.41):
 * - Tint makes a color lighter (per-channel interpolation toward white)
 * - Shade makes a color darker (per-channel interpolation toward black)
 * - The wire value is a hex byte (00-FF) meaning "how much color to keep"
 */

/**
 * Resolve a ColorValue to a CSS color string
 *
 * @param color - ColorValue object with rgb, themeColor, tint/shade, or auto
 * @param theme - Theme for resolving theme colors
 * @param defaultColor - Default color if auto or undefined (default: black)
 * @returns CSS color string (e.g., "#FF0000" or "inherit")
 *
 * @public
 */
declare function resolveColor(color: ColorValue | undefined | null, theme: Theme | null | undefined, defaultColor?: string): string;
/**
 * Resolve any ColorValue (text, fill/shading, border, underline) to a 6-char
 * uppercase hex string — or `undefined` if transparent/unset/unresolvable.
 *
 * Shared display-side resolver. Prefer this over reading `.rgb` directly so
 * that `themeColor` + `themeTint`/`themeShade` are honored consistently across
 * all render paths.
 *
 * When a themed color is present but `theme` is null/undefined, falls back to
 * `color.rgb` if Word wrote one for compat; otherwise returns `undefined`.
 *
 * @returns 6-char uppercase hex without `#`, or `undefined`.
 *
 * @public
 */
declare function resolveColorToHex(color: ColorValue | undefined | null, theme: Theme | null | undefined): string | undefined;
/**
 * Get contrasting text color for a background
 *
 * @param backgroundColor - Background ColorValue
 * @param theme - Theme for resolving theme colors
 * @returns Black or white hex color for best contrast
 *
 * @public
 */
declare function getContrastingColor(backgroundColor: ColorValue | undefined | null, theme: Theme | null | undefined): string;
/**
 * Darken a color by a percentage
 *
 * @param color - ColorValue to darken
 * @param theme - Theme for resolving
 * @param percent - Percentage to darken (0-100)
 * @returns CSS color string
 *
 * @public
 */
declare function darkenColor(color: ColorValue | undefined | null, theme: Theme | null | undefined, percent: number): string;
/**
 * Lighten a color by a percentage
 *
 * @param color - ColorValue to lighten
 * @param theme - Theme for resolving
 * @param percent - Percentage to lighten (0-100)
 * @returns CSS color string
 *
 * @public
 */
declare function lightenColor(color: ColorValue | undefined | null, theme: Theme | null | undefined, percent: number): string;
/**
 * Blend two colors together
 *
 * @param color1 - First color
 * @param color2 - Second color
 * @param ratio - Blend ratio (0 = all color1, 1 = all color2)
 * @param theme - Theme for resolving
 * @returns CSS color string
 *
 * @public
 */
declare function blendColors(color1: ColorValue | undefined | null, color2: ColorValue | undefined | null, ratio: number, theme: Theme | null | undefined): string;
/**
 * Theme color matrix cell
 *
 * @public
 */
interface ThemeMatrixCell {
    /** Resolved hex color (6 chars, no #) */
    hex: string;
    /** Theme color slot */
    themeSlot: ThemeColorSlot;
    /** Tint hex modifier if applicable (e.g., "CC") */
    tint?: string;
    /** Shade hex modifier if applicable (e.g., "BF") */
    shade?: string;
    /** Human-readable label (e.g., "Accent 1, Lighter 60%") */
    label: string;
}
/**
 * Compute a single tinted or shaded hex color from a base color.
 *
 * @param baseHex - 6-character hex color (no #)
 * @param type - 'tint' to lighten, 'shade' to darken
 * @param fraction - Amount (0-1). For tint: 0=no change, 1=white. For shade: 0=black, 1=no change.
 * @returns 6-character hex color (no #)
 *
 * @public
 */
declare function getThemeTintShadeHex(baseHex: string, type: 'tint' | 'shade', fraction: number): string;
/**
 * Generate the 10×6 theme color matrix for an advanced color picker.
 *
 * Columns: lt1, dk1, lt2, dk2, accent1-6 (matches Word's order)
 * Rows: base, 80% tint, 60% tint, 40% tint, 25% shade, 50% shade
 *
 * @param colorScheme - Theme color scheme (falls back to Office 2016 defaults)
 * @returns 6 rows × 10 columns of ThemeMatrixCell
 *
 * @public
 */
declare function generateThemeTintShadeMatrix(colorScheme?: ThemeColorScheme | null): ThemeMatrixCell[][];

/**
 * Color Resolver - Convert OOXML colors to CSS
 *
 * The generic color machinery (theme slots, tint/shade math, blending, the
 * picker matrix) is re-exported here. This module keeps the WordprocessingML-
 * specific pieces: w:highlight named colors, w:shd shading semantics, and
 * ColorValue construction helpers.
 *
 * OOXML Color References:
 * - w:color/@w:val - RGB hex or "auto"
 * - w:color/@w:themeColor - Theme color slot
 * - w:color/@w:themeTint - Tint modifier (0-255, hex)
 * - w:color/@w:themeShade - Shade modifier (0-255, hex)
 */

/**
 * Resolve a highlight color name to CSS
 *
 * @param highlight - Highlight color name (e.g., "yellow", "cyan")
 * @returns CSS color string or empty string for "none"
 */
declare function resolveHighlightColor(highlight: string | undefined): string;
/**
 * Resolve a shading fill or pattern color to CSS
 *
 * @param color - ColorValue for fill
 * @param theme - Theme for resolving theme colors
 * @returns CSS color string
 */
declare function resolveShadingColor(color: ColorValue | undefined | null, theme: Theme | null | undefined): string;
/**
 * Check if a color is effectively black
 *
 * @param color - ColorValue object
 * @param theme - Theme for resolving theme colors
 * @returns True if color resolves to black or very dark
 */
declare function isBlack(color: ColorValue | undefined | null, theme: Theme | null | undefined): boolean;
/**
 * Check if a color is effectively white
 *
 * @param color - ColorValue object
 * @param theme - Theme for resolving theme colors
 * @returns True if color resolves to white or very light
 */
declare function isWhite(color: ColorValue | undefined | null, theme: Theme | null | undefined): boolean;
/**
 * Parse a color string (various formats) to ColorValue
 *
 * @param colorString - Color string like "FF0000", "auto", or theme color name
 * @returns ColorValue object
 */
declare function parseColorString(colorString: string | undefined): ColorValue | undefined;
/**
 * Create a ColorValue from theme color reference
 *
 * @param themeColor - Theme color slot name
 * @param tint - Optional tint modifier
 * @param shade - Optional shade modifier
 * @returns ColorValue object
 */
declare function createThemeColor(themeColor: ThemeColorSlot, tint?: number, shade?: number): ColorValue;
/**
 * Create a ColorValue from RGB hex
 *
 * @param hex - 6-character hex color (no #)
 * @returns ColorValue object
 */
declare function createRgbColor(hex: string): ColorValue;
/**
 * Ensure a hex color string has a '#' prefix.
 */
declare function ensureHexPrefix(hex: string): string;
/**
 * Resolve a highlight color value to a CSS-ready string.
 * Tries OOXML named highlight first, then ensures hex prefix.
 */
declare function resolveHighlightToCss(value: string): string;
/**
 * Check if two colors are equal
 *
 * @param color1 - First color
 * @param color2 - Second color
 * @param theme - Theme for resolving
 * @returns True if colors resolve to the same value
 */
declare function colorsEqual(color1: ColorValue | undefined | null, color2: ColorValue | undefined | null, theme: Theme | null | undefined): boolean;

/**
 * Google Fonts Loader
 *
 * Dynamically loads fonts from Google Fonts API with:
 * - Loading state tracking
 * - Duplicate prevention
 * - Callback notifications
 * - Font availability detection
 */
/**
 * The loads and notifications of one editor instance; see
 * {@link createFontLoadScope}.
 *
 * @public
 */
interface FontLoadScope {
    /** Hears the loads this scope asked for and module-level loads, not other scopes' loads. */
    onFontsLoaded(callback: (fonts: string[]) => void): () => void;
    /** Hears the failures of this scope's loads and of module-level loads. */
    onFontError(callback: (error: Error) => void): () => void;
    /** {@link loadDocumentFonts} on behalf of this scope. */
    loadDocumentFonts(document: unknown): Promise<void>;
    /** {@link loadFontsWithMapping} on behalf of this scope. */
    loadFontsWithMapping(families: string[]): Promise<void>;
    /** {@link loadFontDefinitions} on behalf of this scope. */
    loadFontDefinitions(defs: ReadonlyArray<FontDefinition> | undefined): Promise<void>;
    /** Drops the listeners and releases the embedded faces this scope holds; a later listener revives it. */
    dispose(): void;
    /** Whether it is disposed and not revived since. */
    readonly disposed: boolean;
}
/**
 * Load a font from Google Fonts
 *
 * @param fontFamily - The font family name to load
 * @param options - Optional configuration
 * @returns Promise resolving to true if font loaded successfully, false otherwise
 */
declare function loadFont(fontFamily: string, options?: {
    weights?: number[];
    styles?: ('normal' | 'italic')[];
}): Promise<boolean>;
/**
 * Load multiple fonts from Google Fonts
 *
 * @param families - Array of font family names to load
 * @param options - Optional configuration
 * @returns Promise resolving when all fonts are loaded (or failed)
 */
declare function loadFonts(families: string[], options?: {
    weights?: number[];
    styles?: ('normal' | 'italic')[];
}): Promise<void>;
/**
 * Check if a font is loaded
 *
 * @param fontFamily - The font family name to check
 * @returns true if the font is loaded, false otherwise
 */
declare function isFontLoaded(fontFamily: string): boolean;
/**
 * Enable or disable the editor's automatic Google Fonts lookup.
 *
 * Defaults to enabled. Set to `false` in no-egress embedders (strict CSP,
 * offline) so `loadFont` / `loadFontWithMapping` never inject a
 * `fonts.googleapis.com` stylesheet `<link>`. This gates ONLY the implicit
 * Google Fonts lookup — font URLs you register yourself (the `fonts` prop /
 * `loadFontFromUrl`) are still fetched by the browser, and embedded blobs
 * (`loadFontFromBuffer`) and system fonts still resolve.
 *
 * The flag is page-global (module-level), not per-editor: with multiple
 * editors on one page the last caller wins. Call it before loading documents;
 * disabling does not cancel fetches already in flight. A document font that
 * is neither local nor registered then resolves `loadFont` to `false`
 * silently (no `onFontError`) and renders via its CSS fallback stack.
 *
 * @see isGoogleFontsEnabled
 * @see loadFontFromBuffer
 * @see loadFontFromUrl
 *
 * @public
 */
declare function setGoogleFontsEnabled(enabled: boolean): void;
/**
 * Whether the automatic Google Fonts lookup is currently enabled.
 *
 * @see setGoogleFontsEnabled
 *
 * @public
 */
declare function isGoogleFontsEnabled(): boolean;
/**
 * Check if any fonts are currently loading
 *
 * @returns true if any fonts are loading, false otherwise
 */
declare function isLoading(): boolean;
/**
 * Get list of all loaded fonts
 *
 * @returns Array of loaded font family names
 */
declare function getLoadedFonts(): string[];
/**
 * Register a callback to be notified when fonts are loaded
 *
 * @param callback - Function to call when fonts are loaded
 * @returns Cleanup function to remove the callback
 */
declare function onFontsLoaded(callback: (fonts: string[]) => void): () => void;
/**
 * Register a callback to be notified when a font fails to load.
 *
 * Adapters subscribe and forward to their `onError` prop. Returns the unsub.
 *
 * @public
 */
declare function onFontError(callback: (error: Error) => void): () => void;
/**
 * Check if a font is available on the system using canvas measurement
 *
 * Compares text width with the target font vs a known fallback font (and the
 * opposite fallback, for names that collide with the browser defaults). If
 * the widths differ, the font is available. Reuses one shared canvas; the
 * fallback widths are session constants and memoized.
 *
 * @param fontFamily - The font family name to check
 * @param fallbackFont - Fallback font to compare against
 * @returns true if font is available, false otherwise
 */
declare function canRenderFont(fontFamily: string, fallbackFont?: string): boolean;
/**
 * Load a font from a raw buffer (e.g., embedded in DOCX)
 *
 * Call before loading the document when possible: registration marks the
 * family as ours, which is what keeps the metric-compatible Google fallback
 * in play for subsetted faces during the document's font resolution pass.
 * Late registration still self-heals on the next pass. Under
 * `setGoogleFontsEnabled(false)` that fallback fetch is suppressed and
 * glyphs missing from the registered faces render via the CSS stack.
 *
 * @param fontFamily - The font family name
 * @param buffer - Font file buffer (TTF, OTF, WOFF, WOFF2)
 * @param options - Font options
 * @returns Promise resolving when font is loaded
 */
declare function loadFontFromBuffer(fontFamily: string, buffer: ArrayBuffer, options?: {
    weight?: number | string;
    style?: 'normal' | 'italic';
}): Promise<boolean>;
/** One face of a font file's bytes, as {@link registerDocumentFaces} takes it. */
interface BufferFaceInput {
    family: string;
    data: ArrayBuffer;
    weight?: number | string;
    style?: 'normal' | 'italic';
}
/**
 * Registers one document's font faces from their bytes. Each family takes its
 * own name, as {@link loadFontFromBuffer} registers it, unless a live
 * registration holds different bytes under that name; then all its faces take
 * an alias, so both documents keep their own glyphs. Faces with the same bytes
 * are registered once. With a scope, the faces are held until the scope loads
 * its next document or is disposed; without one, for the page's lifetime.
 * `faces` may be a promise: the scope's next document is the one whose call
 * came last, whichever faces arrive first. Resolves to the CSS family each
 * family was registered under, for the families with at least one face that
 * loaded, or to an empty map once a later document or disposal replaced it.
 *
 * @public
 */
declare function registerDocumentFaces(faces: readonly BufferFaceInput[] | PromiseLike<readonly BufferFaceInput[]>, scope?: FontLoadScope): Promise<Map<string, string>>;
/**
 * Load a font face from a URL (woff2, woff, ttf, otf).
 *
 * Injects an `@font-face` rule pointing at the URL. Multiple weights of the
 * same family can be registered independently. Families registered here are
 * treated as potentially subsetted: the editor still fetches their
 * metric-compatible Google equivalent as a glyph-coverage fallback, unless
 * disabled via `setGoogleFontsEnabled(false)`.
 *
 * @param fontFamily - CSS font-family name to expose
 * @param src - URL to the font file
 * @param options - Optional weight
 * @returns Promise resolving to true if the face became available
 *
 * @public
 */
declare function loadFontFromUrl(fontFamily: string, src: string, options?: {
    weight?: number | string;
}): Promise<boolean>;
/**
 * Declarative description of a single font face to register with the editor.
 *
 * Each entry injects one `@font-face` rule pointing at a URL. Multiple
 * entries can share `family` to register distinct weights as separate faces.
 *
 * For Google Fonts, call `loadFont(family)` directly — the `fonts` prop is
 * for fonts the consumer hosts themselves. For raw bytes already in memory
 * (DOCX-embedded fonts, user uploads), call `loadFontFromBuffer(family, buf)`.
 *
 * @public
 */
interface FontDefinition {
    /**
     * CSS `font-family` name to expose. Match the family name your documents
     * reference; the browser uses this to look up glyphs when text is rendered.
     */
    family: string;
    /**
     * URL to the font file (woff2, woff, ttf, or otf). The loader injects an
     * `@font-face` rule and lets the browser fetch on demand.
     */
    src: string;
    /**
     * CSS `font-weight` for this face. Defaults to `'normal'` (≈400). Pass a
     * number (`400`, `700`) or a CSS keyword (`'bold'`). Required when one
     * `family` registers multiple weights as separate entries.
     */
    weight?: number | string;
}
/**
 * Register a list of custom font faces. Used by the `fonts` prop on
 * `<DocxEditor>` (React + Vue). Idempotent — safe to call on every render.
 *
 * @public
 */
declare function loadFontDefinitions(defs: ReadonlyArray<FontDefinition> | undefined): Promise<void>;
/**
 * Mapping from common Office/system fonts to Google Fonts equivalents
 *
 * Google Fonts doesn't have exact matches for many Microsoft fonts,
 * but these are close alternatives that work well for document rendering.
 */
declare const FONT_MAPPING: Record<string, string>;
/**
 * Get the Google Fonts equivalent for a font name
 *
 * @param fontName - The original font name from the document
 * @returns The Google Fonts equivalent, or the original name if no mapping exists
 */
declare function getGoogleFontEquivalent(fontName: string): string;
/**
 * Load a font, automatically mapping to Google Fonts equivalent if needed.
 * If the font needs mapping, also creates a CSS alias so the original font
 * name works in stylesheets.
 *
 * @param fontFamily - The font family name (may be an Office font)
 * @returns Promise resolving to true if font loaded
 */
declare function loadFontWithMapping(fontFamily: string): Promise<boolean>;
/**
 * Load multiple fonts with automatic mapping to Google Fonts equivalents
 *
 * @param families - Array of font family names
 * @returns Promise resolving when all fonts are loaded
 */
declare function loadFontsWithMapping(families: string[]): Promise<void>;
/**
 * Preload a list of common document fonts
 *
 * This preloads fonts commonly used in DOCX documents that have
 * Google Fonts equivalents.
 */
declare function preloadCommonFonts(): Promise<void>;
/**
 * Extract all font families used in a document
 *
 * Uses loose typing to handle any document-like structure.
 *
 * @param document - The parsed document
 * @returns Set of unique font family names
 */
declare function extractFontsFromDocument(document: unknown): Set<string>;
/**
 * Extract fonts from a document and load them from Google Fonts
 *
 * @param document - The parsed document
 * @returns Promise resolving when fonts are loaded
 */
declare function loadDocumentFonts(document: unknown): Promise<void>;
/**
 * A scope for one editor instance's font loads. Loads made through it notify
 * its own `onFontsLoaded` / `onFontError` listeners and the module-level ones,
 * never another scope's; module-level loads still reach every scope, so a
 * single editor hears what it heard before. Dedupe and caches stay shared.
 *
 * @public
 */
declare function createFontLoadScope(): FontLoadScope;

export { resolveShadingColor as A, setGoogleFontsEnabled as B, type BufferFaceInput as C, FONT_MAPPING as D, type FontDefinition as E, type FontLoadScope as F, createFontLoadScope as G, extractFontsFromDocument as H, getGoogleFontEquivalent as I, loadDocumentFonts as J, loadFontDefinitions as K, loadFontFromUrl as L, loadFontWithMapping as M, loadFontsWithMapping as N, onFontError as O, registerDocumentFaces as P, resolveColorToHex as Q, type ThemeMatrixCell as T, colorsEqual as a, blendColors as b, canRenderFont as c, createRgbColor as d, createThemeColor as e, darkenColor as f, ensureHexPrefix as g, generateThemeTintShadeMatrix as h, getContrastingColor as i, getLoadedFonts as j, getThemeTintShadeHex as k, isBlack as l, isFontLoaded as m, isLoading as n, isGoogleFontsEnabled as o, isWhite as p, lightenColor as q, loadFont as r, loadFontFromBuffer as s, loadFonts as t, onFontsLoaded as u, parseColorString as v, preloadCommonFonts as w, resolveColor as x, resolveHighlightColor as y, resolveHighlightToCss as z };
