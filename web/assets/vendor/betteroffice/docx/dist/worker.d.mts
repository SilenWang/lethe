import { b as DocxCommandClient, c as DocxCommandInitRequest, d as DocxCommandInitReply, e as DocxCommandConnection, f as DocxWorkerEditSessionOptions, g as DocxWorkerEditSession, h as DocxCommandFrame, i as DocxEchoGlyphSet } from './index-DGvJBf34.mjs';
export { B as BuildCommandFrameInput, j as DocxCommandAck, k as DocxCommandApplyContext, l as DocxCommandApplyResult, m as DocxCommandCheckpoint, n as DocxCommandEchoContext, o as DocxCommandEnvelope, p as DocxCommandFramePayload, q as DocxCommandHooks, r as DocxCommandHooksEnvironment, D as DocxCommandHooksFactory, s as DocxCommandHost, t as DocxCommandHostOptions, u as DocxCommandIntent, v as DocxCommandKind, w as DocxCommandMethods, x as DocxCommandPageIdentity, y as DocxCommandPayload, z as DocxCommandPayloads, A as DocxCommandPosition, C as DocxCommandPreflightResult, E as DocxCommandRecoveryState, F as DocxCommandRegistry, G as DocxCommandReply, H as DocxCommandSelection, I as DocxCommandStagedPresentation, J as DocxCommandTableContext, K as DocxCommandViewportRequest, M as DocxCommentChangeResult, N as DocxCommentResult, O as DocxEchoDamageDependency, P as DocxEchoGlyphLine, Q as DocxEchoGraphemeBoundary, R as DocxEchoRect, S as DocxEchoStyleRun, T as DocxEchoTransform, U as DocxEditState, V as DocxEffectiveFormatting, W as DocxEngineWorkerSourceOpened, X as DocxFrameReservations, Z as DocxHostImage, _ as DocxHostProposalGrant, $ as DocxNavigationIntent, a0 as DocxPointModifiers, a1 as DocxSelectionIntent, a2 as DocxSelectionPointIntent, a3 as DocxSourceWorkerClient, a4 as DocxStagedPageBitmap, a5 as DocxStoredMarks, a6 as DocxSvgMedia, a7 as DocxWorkerCommandEngine, a8 as DocxWorkerCommandState, a9 as PreparedDocxCommand, aa as ResolvedDocxCommandSelection, ab as SessionFailure, ac as takePreloadedDocxSourceWorker } from './index-DGvJBf34.mjs';
import './pagedExport-Bi89gMk0.mjs';
import './content-DVT06V_6.mjs';
import './formatting-p5MneNuy.mjs';
import './docx/wrapTypes.mjs';
import './types-bvPg3KsF.mjs';
import './displayListQueries-6XjS7B5e.mjs';
import './layout/pagination/index.mjs';
import './types/document.mjs';
import './styles-DZZz2oRy.mjs';
import './plugin-api/index.mjs';
import './utils/comments.mjs';
import './utils/findReplace.mjs';
import './utils/stylePreview.mjs';
import './loadWasmAsset-Cr95TImt.mjs';
import './rezip-CfwAYdV4.mjs';

declare function createDocxCommandConnection(client: DocxCommandClient, init: DocxCommandInitRequest | DocxCommandInitReply): Promise<DocxCommandConnection>;

declare function createDocxWorkerEditSession<O, X = never>(options: DocxWorkerEditSessionOptions<O, X>): DocxWorkerEditSession<X>;

declare function closeCommandBitmap(bitmap: ImageBitmap): void;
declare function discardCommandPresentation(frame: DocxCommandFrame | undefined): void;

/** @internal A glyph set with its lookups. */
interface EchoGlyphIndex {
    set: DocxEchoGlyphSet;
    /** The f32 scale exactly; JSON carries its shortest decimal. */
    horizontal: number;
    /** Pixel advance of a unit count, widened from f32 as layout widens it. */
    advance(units: number): number;
    chars: ReadonlyMap<string, number>;
    kerning: ReadonlyMap<number, number>;
    unsafe: ReadonlySet<number>;
}
/** @internal */
interface EchoGlyphPlacement {
    glyphIds: number[];
    xs: number[];
    advances: number[];
    end: number;
}
/** @internal */
declare function indexEchoGlyphSet(set: DocxEchoGlyphSet): EchoGlyphIndex;
/**
 * Places `text` as the engine lays out a cluster-positioned line from pen `x`: each character's
 * advance is its shaped units plus the pair adjustment with the character after it, scaled in f32.
 * Undefined when a character or a pair is outside the glyph set.
 */
declare function placeEchoGlyphs(glyphs: EchoGlyphIndex, text: string, next: string, x: number): EchoGlyphPlacement | undefined;
/**
 * Places `text` on a line starting at `x`; with `center`, the pen starts where the engine centers
 * the line's width in that space, at half the free width and never left of `x`.
 */
declare function placeEchoLine(glyphs: EchoGlyphIndex, text: string, next: string, x: number, center?: number): EchoGlyphPlacement | undefined;
/** Width of the leading letters and digits, which no line break can split. */
declare function leadingWordWidth(text: string, advances: readonly number[]): number;

export { DocxCommandClient, DocxCommandConnection, DocxCommandFrame, DocxCommandInitReply, DocxCommandInitRequest, DocxEchoGlyphSet, DocxWorkerEditSession, DocxWorkerEditSessionOptions, type EchoGlyphIndex, closeCommandBitmap, createDocxCommandConnection, createDocxWorkerEditSession, discardCommandPresentation, indexEchoGlyphSet, leadingWordWidth, placeEchoGlyphs, placeEchoLine };
