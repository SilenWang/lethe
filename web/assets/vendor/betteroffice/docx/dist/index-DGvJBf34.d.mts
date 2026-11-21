import { a2 as DocxEditSuggestion, a3 as DocxEditFailure, a4 as DocxEditFailureCode, a5 as DocxFindTextRequest, a6 as DocxFindTextResult, a7 as DocxReadParagraphsRequest, a8 as DocxReadParagraphsResult, a9 as DocxEditRequest, aa as DocxEditResult, ab as DocxTextRange, s as DocxContentControl, d as DocxPageExportOptions, m as DocxContentControlsOptions, l as DocxContentControlQuery, ac as DocxReadStoriesRequest, ad as DocxValidationResult, w as DocxContentControlsResult, ae as DocxListStoriesResult, af as DocxReadStoriesResult, ag as SectionStartKind, ah as SectionPropertyPatch, ai as SectionInfo, aj as DocxTextTarget, ak as DocxEditRefusal, a as DocxExportOptions, H as DocxExportResult, c as DocxStructuredContent, b as DocxMarkdownContent, f as DocxPagedStructuredContent, i as DocxLayoutMap, g as DocxSnapshotLayoutMap, D as DocxExportFailure, V as DocxParagraphHeading } from './pagedExport-Bi89gMk0.mjs';
import { C as ColorValue, T as TextFormatting, P as ParagraphFormatting } from './formatting-p5MneNuy.mjs';
import { L as Layout } from './types-bvPg3KsF.mjs';
import { D as DisplayListRect, J as RetainedFrame, g as DecodedFrameDelta, l as DisplayListHitRegion } from './displayListQueries-6XjS7B5e.mjs';
import { Document, CompatibilityFlags } from './types/document.mjs';
import { B as BlockContent, e as Comment, a3 as HeaderFooterType, H as HeaderFooter, i as Footnote, j as Endnote, f as SectionProperties, F as FootnoteProperties, E as EndnoteProperties, W as Watermark, b5 as Table } from './content-DVT06V_6.mjs';
import { d as Relationship } from './styles-DZZz2oRy.mjs';
import { PointPosition } from './plugin-api/index.mjs';
import { TrackedChangeEntry } from './utils/comments.mjs';
import { FindOptions } from './utils/findReplace.mjs';
import { ResolvedStyleOption } from './utils/stylePreview.mjs';
import { a as WasmModuleMemory } from './loadWasmAsset-Cr95TImt.mjs';
import { b as RepackOptions } from './rezip-CfwAYdV4.mjs';

type CollaborationUpdateOrigin = 'local' | 'remote';
interface CollaborationReplica {
    readonly clientId: number;
    encodeStateVector(): Uint8Array;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    /**
     * Optional. `encodeStateAsUpdate(remoteStateVector)` as ordered updates of at most `maxChunkBytes` each, except
     * one carrying a single larger struct; one update when the diff fits. Each integrates once the earlier ones have.
     */
    encodeStateAsUpdateChunks?(remoteStateVector: Uint8Array, maxChunkBytes: number): Uint8Array[];
    applyUpdate(update: Uint8Array): unknown;
    /** Optional. Applies one initial sync's ordered updates as a single change, as if they were one update. */
    applyUpdateChunks?(updates: readonly Uint8Array[]): unknown;
    onUpdate(listener: (update: Uint8Array, origin: CollaborationUpdateOrigin) => void): () => void;
}
/**
 * @experimental A replica whose state lives in a worker; reads and merges are asynchronous. Wrap it with
 * `createAsyncCollaborationReplica` before passing it to `CollaborationProvider`. The wrapper's synchronous
 * `encodeStateVector` and `encodeStateAsUpdate` throw; call these methods through `wrapper.async` instead.
 */
interface AsyncCollaborationReplica {
    readonly clientId: number;
    encodeStateVector(): Promise<Uint8Array>;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Promise<Uint8Array>;
    /** Optional. See `CollaborationReplica.encodeStateAsUpdateChunks`. */
    encodeStateAsUpdateChunks?(remoteStateVector: Uint8Array, maxChunkBytes: number): Promise<Uint8Array[]>;
    /**
     * Resolves once the worker has merged the update; the value is the typing inference, if any. The update is the
     * replica's own: it may transfer the buffer.
     */
    applyUpdate(update: Uint8Array): Promise<unknown>;
    /**
     * Optional. Resolves once the worker has merged one initial sync's updates as a single change. The updates are the
     * replica's own: it may transfer their buffers.
     */
    applyUpdateChunks?(updates: readonly Uint8Array[]): Promise<unknown>;
    onUpdate(listener: (update: Uint8Array, origin: CollaborationUpdateOrigin) => void): () => void;
}
type CollaborationTransportEvent = {
    type: 'open';
} | {
    type: 'message';
    data: Uint8Array;
} | {
    type: 'close';
    reason?: string;
} | {
    type: 'error';
    error: unknown;
} | {
    type: 'drain';
};
interface CollaborationTransport {
    /** Starts one connection attempt; transports may also reopen while still subscribed. */
    connect(): void | Promise<void>;
    disconnect(): void | Promise<void>;
    /** Returns true only when the owned frame was accepted; false requires a later drain event. */
    send(data: Uint8Array): boolean;
    onEvent(listener: (event: CollaborationTransportEvent) => void): () => void;
}
type CollaborationStatus = 'disconnected' | 'connecting' | 'connected' | 'destroyed';
interface CollaborationStatusChange {
    status: CollaborationStatus;
    synced: boolean;
}
type CollaborationErrorCode = 'backpressure' | 'protocol' | 'replica' | 'transport';
declare class CollaborationError extends Error {
    readonly code: CollaborationErrorCode;
    readonly cause: unknown;
    constructor(code: CollaborationErrorCode, message: string, cause?: unknown);
}
interface CollaborationProviderOptions {
    /**
     * Largest frame sent or accepted. Default 16 MiB, the relay's limit; at most 64 MiB plus a 6-byte sync header, so
     * no frame carries an update over the 64 MiB per-update bound replicas enforce.
     */
    maxFrameBytes?: number;
    maxMessagesPerFrame?: number;
    /**
     * Bytes held while the transport refuses frames, and for an async replica received data waiting to merge, chunked
     * syncs included. Default 16 MiB, at most 256 MiB.
     */
    maxPendingBytes?: number;
    /**
     * Largest update in a chunked answer to SyncStep1; unset, every answer is one SyncStep2. A provider whose replica
     * implements `applyUpdateChunks` asks for chunks in its SyncStep1; with this set and a replica that implements
     * `encodeStateAsUpdateChunks`, the answer is Update messages closed by a SyncStep2. Set it only when the transport
     * delivers an answer to the asking peer alone (point-to-point). Room and broadcast transports, the relay included,
     * must leave it unset: other peers there would apply the chunks one at a time. At most `maxFrameBytes`. A struct
     * larger than a frame, such as an inline image, still fails to encode.
     */
    syncChunkBytes?: number;
    /**
     * Updates held before the first SyncStep2 when the replica implements `applyUpdateChunks`, which then applies them
     * with the SyncStep2 as one change; each held update also counts 64 bytes. Default 64 MiB, at most 256 MiB; more
     * fails the connection with `backpressure`. Relays that retain every update bound a room by their own capacity, so
     * large documents there join through `initialUpdate` instead.
     */
    maxSyncBytes?: number;
    user?: CollaborationUser;
}
interface CollaborationUser {
    name: string;
    color?: string;
}
interface CollaborationResolvedUser {
    name: string;
    color: string;
}
interface CollaborationCursor {
    story: string;
    anchor: Uint8Array;
    head: Uint8Array;
}
interface CollaborationTextInsertion {
    clientId: number;
    story: string;
    paraId: string;
    endOffset: number;
}
interface CollaborationAwarenessState {
    clientId: number;
    clock: number;
    user: CollaborationResolvedUser;
    cursor: CollaborationCursor | null;
}
interface CollaborationPeer extends CollaborationAwarenessState {
    lastSeenAt: number;
    cursorMovedAt: number;
    inferredCursor: CollaborationTextInsertion | null;
}
type CollaborationPeerListener = (peers: readonly CollaborationPeer[]) => void;
interface CollaborationPresence {
    readonly peers: readonly CollaborationPeer[];
    setCursor(cursor: CollaborationCursor | null, broadcast?: boolean): void;
    onPeers(listener: CollaborationPeerListener): () => void;
}
type CollaborationStatusListener = (change: CollaborationStatusChange) => void;
type CollaborationErrorListener = (error: CollaborationError) => void;

/**
 * Wire format between a main-thread collaboration facade and the provider its document worker runs.
 * Main owns the host transport's lifecycle and forwards its bytes untouched; the worker runs the protocol and
 * answers with frames to send, state and the transport calls its own failures need.
 */
type PipeErrorCode = 'backpressure' | 'protocol' | 'replica' | 'transport';
interface PipeError {
    code: PipeErrorCode;
    message: string;
}
interface PipeUser {
    name: string;
    color?: string;
}
interface PipeProviderOptions {
    maxFrameBytes?: number;
    maxMessagesPerFrame?: number;
    syncChunkBytes?: number;
    maxSyncBytes?: number;
    user?: PipeUser;
}
/** The docx cursor; the default cursor type `C` of the pipe types. */
interface PipeCursor {
    story: string;
    anchor: Uint8Array;
    head: Uint8Array;
}
type PipeTransportEvent = {
    type: 'open';
} | {
    type: 'message';
    data: ArrayBuffer;
} | {
    type: 'close';
    reason?: string;
};
/**
 * Main to worker, in order; `seq` increases. `connect`, `disconnect`, `destroy` and `fail` replay what main already
 * did to the host transport, so the worker sends nothing and asks for no transport call while it runs them.
 */
type PipeOp<C = PipeCursor> = {
    op: 'create';
    seq: number;
    options: PipeProviderOptions;
} | {
    op: 'connect';
    seq: number;
} | {
    op: 'disconnect';
    seq: number;
} | {
    op: 'destroy';
    seq: number;
} | {
    op: 'fail';
    seq: number;
    error: PipeError;
} | {
    op: 'cursor';
    seq: number;
    cursor: C | null;
    broadcast: boolean;
} | {
    op: 'event';
    seq: number;
    event: PipeTransportEvent;
};
/** The docx peer; the default peer type `P` of the pipe types. */
interface PipePeer {
    clientId: number;
    clock: number;
    user: {
        name: string;
        color: string;
    };
    cursor: PipeCursor | null;
    lastSeenAt: number;
    cursorMovedAt: number;
    inferredCursor: {
        clientId: number;
        story: string;
        paraId: string;
        endOffset: number;
    } | null;
}
/**
 * Worker to main, in order. `through` is the last op the worker had run; main drops output older than its own
 * latest lifecycle call.
 */
type PipeOutput<P = PipePeer> = {
    do: 'unsubscribe';
    through: number;
} | {
    do: 'disconnect';
    through: number;
} | {
    do: 'send';
    data: ArrayBuffer;
    through: number;
}
/** The awareness leave main sends when the host disconnects first; null while there is none to send. */
 | {
    do: 'leave';
    data: ArrayBuffer | null;
    through: number;
} | {
    do: 'status';
    status: 'disconnected' | 'connecting' | 'connected' | 'destroyed';
    synced: boolean;
    through: number;
} | {
    do: 'peers';
    peers: P[];
    timeOrigin: number;
    through: number;
} | {
    do: 'error';
    error: PipeError;
    through: number;
}
/** The worker has no provider under this id. */
 | {
    do: 'lost';
};
interface PipeOutputBatch<P = PipePeer> {
    provider: number;
    out: PipeOutput<P>[];
}
interface PipeCommandPayload<C = PipeCursor> {
    provider: number;
    ops: PipeOp<C>[];
}

type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
type Attrs = Record<string, Json>;
type SlotV1 = {
    state: 'missing';
} | {
    state: 'present';
    value: Json;
};
type AttrDeltaV1 = {
    path: string[];
    before: SlotV1;
    after: SlotV1;
};
type UnitV1 = {
    kind: 'text';
    text: string;
    attrs: Attrs;
} | {
    kind: 'atom';
    atomKind: string;
    payload: Attrs;
    attrs: Attrs;
};
type InheritanceV1 = {
    paragraph: Attrs;
    runs: Attrs[];
    paragraphMark: Attrs;
};
type SeedV1 = {
    units: UnitV1[];
    properties: Attrs;
    unitSha256: string;
    inherit?: InheritanceV1;
};
type DonorV1 = {
    kind: 'at';
    at: number;
} | {
    kind: 'pilcrow';
};
type InsertedTextV1 = {
    text: string;
    attrs: Attrs;
    inherit: Attrs;
};
type TextEditV1 = {
    from: number;
    to: number;
    insert: InsertedTextV1[];
    donor: DonorV1;
};
type RunEditV1 = {
    from: number;
    to: number;
    deltas: AttrDeltaV1[];
    target: Attrs;
    inherit: Attrs;
};
type ParagraphPatchV1 = {
    ordinal: number;
    sessionKey: string;
    seed: SeedV1;
    textEdits: TextEditV1[];
    runEdits: RunEditV1[];
    paraDeltas: AttrDeltaV1[];
    paraInherit: Attrs;
    markInherit?: Attrs;
    resultSha256: string;
};
type PatchErrorCode = 'MISSING_SOURCE' | 'SOURCE_DIGEST_MISMATCH' | 'INVALID_PLAN' | 'SEED_MISMATCH' | 'AMBIGUOUS_ALIGNMENT' | 'AMBIGUOUS_DONOR' | 'INVALID_BOUNDARY' | 'UNSUPPORTED_KEY' | 'UNSUPPORTED_STRUCTURE' | 'PROPERTY_CONFLICT' | 'PATCH_CONFLICT' | 'RESULT_MISMATCH';
type LegacyParagraphV1 = {
    ordinal: number;
    code: PatchErrorCode;
    detail: string;
};

/** Typed TypeScript boundary for the Rust package writer. */

/**
 * Paragraph IDs a session save applies: IDs for source paragraphs outside
 * the edited stories by part and `w:p` occurrence, and parts written as their
 * source bytes with only these IDs patched in.
 */
interface RustParagraphIds {
    sectionEdits?: {
        onlySections: boolean;
        sha256: string;
        /** `paragraph` is a `w:p` occurrence, or with `bodyParagraphs` the position among the body's own paragraphs. */
        edits: Array<{
            paragraph: number | null;
            bodyParagraphs?: number;
            donor: number | null;
            properties: Record<string, unknown>;
        }>;
    };
    assignments: Array<{
        part: string;
        ordinal: number;
        paraId: string;
    }>;
    patchedParts: Array<{
        part: string;
        paraIds: Array<[number, string]>;
    }>;
    /**
     * Story parts written as their source bytes with only some paragraphs
     * re-serialized: those whose `sourceOrdinal` is in `changed`, or whose
     * written comments, revisions, notes or relationships differ from their
     * source. `paragraphs` lists every `sourceOrdinal` the model holds for the
     * part, `sha256` the source part it addresses, `removed` the source
     * paragraphs it no longer holds, and `inserted`, in writing order, where
     * each paragraph written without a `sourceOrdinal` goes.
     */
    splicedParts?: Array<{
        part: string;
        sha256: string;
        paragraphs: number[];
        changed: number[];
        paragraphPatches?: ParagraphPatchV1[];
        legacyParagraphs?: LegacyParagraphV1[];
        tablePatches?: Array<{
            ordinal: number;
            before: unknown;
            after: unknown;
        }>;
        inserted?: Array<{
            before: number;
        } | {
            after: number;
        }>;
        removed?: number[];
    }>;
}

/**
 * Paragraph identity DTOs for `YrsSession` identity reads and saves.
 *
 * A session key (`YrsLoc.paraId`) addresses a paragraph in one collaborative
 * document session. A Word paragraph ID (`w14:paraId`) is saved in the file;
 * a paragraph has one once its source carried it, it was authored in a
 * session, or the host called `YrsSession.persistParagraphIds()`.
 */
/** A Word story qualified by the package part it is read from. */
type DocxSourceStory = {
    partUri: string;
    kind: 'body' | 'header' | 'footer';
} | {
    partUri: string;
    kind: 'footnote' | 'endnote' | 'comment';
    itemId: string;
};
/** A paragraph in one collaborative document session, on any of its replicas. */
interface DocxSessionParagraphAnchor {
    kind: 'session';
    sessionId: string;
    story: string;
    paraId: string;
}
/**
 * A `w:p` occurrence in the exact source package the session was opened
 * from: its zero-based position among the part's paragraphs, nested ones
 * included, as the source bytes hold them rather than as edited since.
 */
interface DocxSourceParagraphAnchor {
    kind: 'source';
    packageSha256: string;
    /** OPC part name, such as `/word/document.xml`. */
    partUri: string;
    paragraphOrdinal: number;
}
/**
 * A saved Word paragraph ID within its source story. It resolves after the
 * saved file is reopened, but it is scoped to a document the host chose: an
 * eight-digit ID is not a document identifier.
 */
interface DocxPersistedParagraphAnchor {
    kind: 'persisted';
    story: DocxSourceStory;
    paraId: string;
}
type DocxParagraphAnchor = DocxSessionParagraphAnchor | DocxSourceParagraphAnchor | DocxPersistedParagraphAnchor;
/** A paragraph a resolution, assignment or diagnostic names. */
type DocxParagraphRef = DocxSessionParagraphAnchor | DocxSourceParagraphAnchor;
/**
 * Where a Word paragraph ID comes from: `source` IDs are already in the source
 * package; the others are prepared by the session and appear on save.
 */
type DocxParagraphIdOrigin = 'source' | 'authored' | 'persisted' | 'repaired';
/** Where a paragraph comes from; `synthetic` ones are editor-only until authored into. */
type DocxParagraphOrigin = 'source' | 'authored' | 'synthetic';
interface DocxParagraphIdentity {
    /** `null` for a source paragraph outside the session stories. */
    session: DocxSessionParagraphAnchor | null;
    origin: DocxParagraphOrigin;
    /** The Word paragraph ID the paragraph saves with, or `null` when it saves without one. */
    ooxmlParaId: string | null;
    idOrigin: DocxParagraphIdOrigin | null;
    /** `null` without a Word paragraph ID or a source story. */
    persisted: DocxPersistedParagraphAnchor | null;
    /** `null` unless the paragraph occurs in the retained source package. */
    source: DocxSourceParagraphAnchor | null;
}
/**
 * Every paragraph's identities: session paragraphs with stories sorted and in
 * document order, then source paragraphs outside the stories in package order.
 */
interface DocxParagraphIdentitySnapshot {
    sessionId: string;
    /** SHA-256 of the retained source package, or `null` without one. */
    packageSha256: string | null;
    paragraphs: DocxParagraphIdentity[];
}
/** A paragraph `YrsSession.persistParagraphIds()` gave a Word paragraph ID. */
interface DocxParagraphIdAssignment {
    paragraph: DocxParagraphRef;
    /** The duplicate session key the paragraph carried before repair. */
    replacedParaId: string | null;
    /** The duplicate Word paragraph ID it replaces. */
    previousOoxmlParaId: string | null;
    ooxmlParaId: string;
    idOrigin: 'persisted' | 'repaired';
    /** `null` when the paragraph has no source story. */
    persisted: DocxPersistedParagraphAnchor | null;
}
type DocxParagraphIdDiagnostic = {
    /** Saved claims to one ID conflict; the paragraphs keep it and resolve as ambiguous. */
    kind: 'conflicting-saved-ids';
    ooxmlParaId: string;
    paragraphs: DocxParagraphRef[];
} | {
    /** No retained source package, so source paragraphs outside the stories were not covered. */
    kind: 'no-source-package';
};
/**
 * Why `YrsSession.persistParagraphIds()` changed nothing: a duplicated
 * comment paragraph ID the comment companion parts reference, where which
 * comment they mean is ambiguous.
 */
interface DocxParagraphIdRefusal {
    kind: 'ambiguous-comment-reference';
    ooxmlParaId: string;
    commentIds: string[];
}
type DocxParagraphIdentityReceipt = {
    status: 'applied';
    assignments: DocxParagraphIdAssignment[];
    diagnostics: DocxParagraphIdDiagnostic[];
} | {
    status: 'refused';
    refusal: DocxParagraphIdRefusal;
};
type DocxParagraphAnchorResult = {
    status: 'found';
    anchor: DocxParagraphRef;
} | {
    status: 'missing';
} | {
    status: 'ambiguous';
    candidates: DocxParagraphRef[];
} | {
    status: 'unsupported';
    reason: 'foreign-session' | 'foreign-package' | 'no-source-package';
};
/**
 * The paragraph IDs a session save applies, as the package writer's
 * `paragraphIds`, with each spliced part's paragraphs as `[ordinal, session key]`. @internal
 */
interface DocxParagraphSavePlan extends Omit<RustParagraphIds, 'splicedParts'> {
    sectionSplicedParts?: DocxParagraphSavePlan['splicedParts'];
    splicedParts?: Array<{
        part: string;
        sha256: string;
        paragraphs: Array<[number, string]>;
        changed: number[];
        sectionOnly?: number[];
        paragraphPatches?: ParagraphPatchV1[];
        legacyParagraphs?: LegacyParagraphV1[];
        tablePatches?: Array<{
            ordinal: number;
            before: unknown;
            after: unknown;
        }>;
        inserted?: Array<{
            before: number;
        } | {
            after: number;
        }>;
        removed?: number[];
    }>;
}

/**
 * Host proposals: tracked changes a host proposes by paragraph anchor and search, grouped by the
 * host's proposal ids. A round resolves against one version and applies as one atomic batch
 * outside undo history. Decisions only change how the proposals' revisions render: the
 * revisions stay in the document, and the document version and history are untouched until the
 * host withdraws the proposals.
 */

type DocxProposalState = 'proposed' | 'accepted' | 'rejected';
/** Which non-overlapping matches of a search a proposal replaces; numbers count from 1. */
type DocxOccurrence = 'first' | 'all' | number;
/**
 * One proposal. `replaceText` with `replaceWith: ''` deletes; with `search: ''` it fills a
 * paragraph whose accepted text is empty (an inline atom counts as text), where the empty search
 * matches once, at offset 0. `insertText` offsets are UTF-16 units of the paragraph's accepted
 * text.
 */
type DocxProposalInput = {
    id: string;
    paragraph: DocxParagraphAnchor;
    suggest: DocxEditSuggestion;
} & ({
    op: 'replaceText';
    search: string;
    replaceWith: string;
    occurrence?: DocxOccurrence;
} | {
    op: 'insertText';
    at: 'start' | 'end' | {
        offset: number;
    };
    text: string;
});
interface DocxProposalRequest {
    expectVersion: string;
    proposals: readonly DocxProposalInput[];
}
interface DocxProposalRecord {
    id: string;
    state: DocxProposalState;
    paragraph: DocxSessionParagraphAnchor;
    revisionIds: readonly string[];
    changed: boolean;
}
interface DocxProposalSnapshot {
    version: string;
    /** Increments whenever a decision changes. */
    previewVersion: number;
    proposals: readonly DocxProposalRecord[];
}
/** @internal */
interface DocxProposalRegistryState {
    previewVersion: number;
    entries: {
        record: DocxProposalRecord;
        key: string;
        suggest: {
            author: string;
            date: string;
        };
    }[];
}
type DocxProposalFailure = Omit<DocxEditFailure, 'code'> & {
    code: DocxEditFailureCode | 'stale-preview' | 'unknown-proposal' | 'proposal-id-conflict';
    proposalId?: string;
};
type DocxProposalResult = {
    ok: true;
    snapshot: DocxProposalSnapshot;
} | {
    ok: false;
    version: string;
    failure: DocxProposalFailure;
};
/** Missing or remotely settled ids withdraw as a no-op, preserving accepted text. */
interface DocxProposalWithdrawRequest {
    expectVersion: string;
    ids: readonly string[];
}
interface DocxProposalStateRequest {
    expectVersion: string;
    expectPreviewVersion: number;
    changes: readonly {
        id: string;
        state: DocxProposalState;
    }[];
}
/** The session reads and writes proposals are built on. @internal */
interface DocxProposalSession {
    version(): string;
    resolveParagraphAnchor(anchor: DocxParagraphAnchor): DocxParagraphAnchorResult;
    findText(request: DocxFindTextRequest): DocxFindTextResult;
    readParagraphs(request: DocxReadParagraphsRequest): DocxReadParagraphsResult;
    applyEdits(request: DocxEditRequest): DocxEditResult;
    listRevisions(): readonly {
        revisionId: string;
        kind: string;
    }[];
    revisionStamps?(ids: readonly string[]): Record<string, readonly {
        author: string;
        date: string;
    }[]>;
    /**
     * Accepts and rejects revisions for good, outside undo history; unknown ids are skipped. Returns
     * the refusal, with the document unchanged, while it holds remote updates not integrated yet.
     */
    settleRevisions(accept: readonly string[], reject: readonly string[]): DocxEditFailure | undefined;
    /** Runs `read` with story projections shared across its reads; omitted, reads run unshared. */
    sharedReads?<R>(read: () => R): R;
}
/** @internal */
interface DocxProposalRegistry {
    propose(request: DocxProposalRequest): DocxProposalResult;
    setStates(request: DocxProposalStateRequest): DocxProposalResult;
    withdraw(request: DocxProposalWithdrawRequest): DocxProposalResult;
    snapshot(): DocxProposalSnapshot;
    /** @internal */
    reconcile(): void;
    /** @internal */
    exportState(): DocxProposalRegistryState;
    /** @internal */
    mirror(mirror: {
        version: string;
        proposals: DocxProposalRegistryState;
    } | null): void;
    subscribe(listener: (snapshot: DocxProposalSnapshot) => void): () => void;
    /** Forgets every proposal, as when the session opens another document. */
    reset(): void;
    destroy(): void;
}
/** The revision decisions a snapshot shows, for `YrsRenderEnv.revisionPreview`. */
declare function proposalRevisionPreview(snapshot: DocxProposalSnapshot): Readonly<Record<string, 'accepted' | 'rejected'>> | undefined;

declare const LAYOUT_META_VERSION = 1;
interface LayoutMetaV1 {
    v: 1;
    layoutRevision: number;
    pageCount: number;
    partial: boolean;
    provisional: boolean;
    notesConverged: boolean;
    pageSizes: Float64Array;
    layoutShell: string;
    headersFootersEpoch: number;
    headersFooters?: string;
}
type RetainedLayoutMeta = Pick<LayoutMetaV1, 'pageCount' | 'partial' | 'provisional' | 'notesConverged' | 'pageSizes' | 'layoutShell'>;
declare function isLayoutMetaV1(value: unknown): value is LayoutMetaV1;
declare function readRetainedLayoutMeta(meta: {
    readonly page_count: number;
    readonly partial: boolean;
    readonly provisional: boolean;
    readonly notes_converged: boolean;
    page_sizes(): Float64Array;
    layout_shell_json(): string;
    free(): void;
}): RetainedLayoutMeta;
declare function layoutMetaSummary(meta: LayoutMetaV1): Layout & {
    summaryOnly: true;
};

type SidebarReader = Pick<YrsSession, 'storyIds' | 'storySegments' | 'version' | 'paragraphs' | 'locateParagraph'>;
/** A yrs location projected into the position space used by the display list. */
interface YrsSidebarDisplayPoint {
    story: string;
    position: number;
    /** Header/footer relationship id; absent for body and nested body stories. */
    hfRid?: string;
}
/** Read-only converter used by the yrs-backed sidebar data sources. */
interface YrsSidebarProjection {
    locToDisplayPoint(loc: YrsLoc): YrsSidebarDisplayPoint | null;
    storyOffsetToDisplayPoint(story: string, offset: number): YrsSidebarDisplayPoint | null;
}
/**
 * Where a sidebar projection reads story segments. `segments` must answer for the session's
 * current state on every call, as `YrsSession.storySegments` does; the arrays it returns are shared
 * and never mutated. A projection remembers the last source given for a session and reads
 * through it for the session's lifetime.
 */
interface YrsStorySegmentSource$1 {
    segments(story: string): YrsStorySegment[];
}
/**
 * Convert a string yrs identity into the numeric id used by the existing
 * layout/sidebar contract. This is the same UTF-8 FNV-1a projection used by
 * the yrs render and Document bridges; numeric OOXML ids pass through.
 */
declare function yrsIdToNumericId(value: string): number;
/**
 * Build a lazy projection from live yrs stories to display positions.
 * The canonical yrs segment stream supplies paragraph/atom units; table-cell
 * and block-SDT stories are recursively sized so container tokens are included.
 * A session gets the same projection back until its document changes.
 */
declare function createYrsSidebarProjection(session: SidebarReader, source?: YrsStorySegmentSource$1): YrsSidebarProjection;

type DocxSidebarReader = Pick<YrsSession, 'version' | 'listRevisions' | 'resolveComment' | 'headings' | 'paragraphs' | 'storyIds' | 'storySegments' | 'locateParagraph'>;
interface DocxSidebarAnchorPoints {
    start: YrsSidebarDisplayPoint | null;
    end: YrsSidebarDisplayPoint | null;
}
interface DocxSidebarRead {
    comments: Array<{
        id: string;
        anchors: DocxSidebarAnchorPoints[];
    }>;
    revisions: Array<{
        key: string;
        start: YrsSidebarDisplayPoint | null;
    }>;
    trackedChanges: {
        entries: TrackedChangeEntry[];
        commentToRevision: Array<[number, number]>;
    };
}
interface DocxOutlineHeading {
    story: string;
    paraId: string;
    text: string;
    level: number;
    position: number;
}
declare function readSidebar(reader: DocxSidebarReader, commentIds: readonly string[], expectVersion: string): DocxSidebarRead | null;
declare function readOutlineHeadings(reader: DocxSidebarReader, expectVersion: string): DocxOutlineHeading[] | null;

/** One native paragraph in the yrs-backed display-position projection. */
interface YrsInputParagraphSpan {
    paraId: string;
    /** Number of UTF-16/inline units before the paragraph's pilcrow. */
    length: number;
    /** Block start emitted by the yrs display-position projection. */
    displayStart: number;
}
/**
 * Live converter between display-list positions and public yrs Locs.
 *
 * A native paragraph of length N occupies N+2 display positions (open token,
 * content, close token), so this map can be rebuilt directly from the live yrs
 * paragraph spans after every structural edit.
 */
interface YrsInputPositionMap {
    story: string;
    paragraphs: readonly YrsInputParagraphSpan[];
}
interface YrsInputParagraphSeed {
    paraId: string;
    length: number;
}
declare function createYrsInputPositionMap(story: string, seeds: readonly YrsInputParagraphSeed[]): YrsInputPositionMap;
/** Convert a live yrs location to the position used by display-list geometry. */
declare function yrsLocToDisplayPosition(map: YrsInputPositionMap, loc: YrsLoc): number;
/** Convert a display-list hit position to a paragraph-keyed yrs location. */
declare function displayPositionToYrsLoc(map: YrsInputPositionMap, position: number): YrsLoc | null;
/** Compare two Locs in document order using one live map. */
declare function compareYrsLocs(map: YrsInputPositionMap, a: YrsLoc, b: YrsLoc): number;

type PositionReader = Pick<YrsSession, 'hasStory' | 'storySegments'>;
type YrsLocProjection = Pick<YrsPositionProjection, 'positionForLoc'>;
type YrsPositionOutline = Record<string, {
    contentStart: number;
    size: number;
    /** `length` counts display units; `controls` lists inline controls as `[story offset, display units]`. */
    paragraphs: Array<{
        paraId: string;
        displayStart: number;
        length: number;
        leading: number;
        controls?: InlineControls;
    }>;
}>;
/** Inline controls of a paragraph as `[story offset within the content, display units]`, in order. */
type InlineControls = ReadonlyArray<readonly [number, number]>;
declare function createYrsLocProjectionFromOutline(outline: YrsPositionOutline): YrsLocProjection;
/** @internal */
interface YrsProjectedNode {
    kind: string;
    start: number;
    nodeSize: number;
    attrs: Record<string, unknown>;
    story: string;
}
/** @internal */
interface YrsProjectedTable extends YrsProjectedNode {
    kind: 'table';
    tableIndex: number;
    widthsTwips: number[];
    rowCount: number;
    cells: YrsProjectedCell[];
}
/** @internal */
interface YrsProjectedCell {
    row: number;
    column: number;
    rowspan: number;
    colspan: number;
    story: string;
    start: number;
    contentStart: number;
    nodeSize: number;
    attrs: Record<string, unknown>;
}
/** @internal */
interface YrsPointerProjectionTarget {
    story: string;
    displayPosition: number;
    cell?: YrsCellLoc;
}
/** @internal */
interface YrsStorySegmentSource {
    segments(story: string): YrsStorySegment[];
}
/** @internal */
declare function createYrsPositionProjection(session: PositionReader, rootStory: string, source?: YrsStorySegmentSource): YrsPositionProjection | null;
/** @internal */
declare function projectYrsDisplayPosition(position: number | PointPosition, getProjection: (rootStory: string) => YrsPositionProjection | null, session?: object | null): YrsPointerProjectionTarget | null;
/** @internal */
declare class YrsPositionProjection {
    readonly rootStory: string;
    private readonly stories;
    private readonly nodes;
    private readonly tables;
    private readonly blockBoundaries;
    private readonly source;
    private readonly paragraphsById;
    constructor(session: Pick<YrsSession, 'storySegments'>, rootStory: string, source?: YrsStorySegmentSource);
    get size(): number;
    nodeAt(position: number): YrsProjectedNode | null;
    allTables(): readonly YrsProjectedTable[];
    tableAtPosition(position: number): YrsProjectedTable | null;
    tableAtStart(start: number): YrsProjectedTable | null;
    tableStartForLoc(at: YrsCellLoc): number | null;
    cellPosition(tableStart: number, row: number, column: number): number | null;
    targetAt(position: number): YrsPointerProjectionTarget;
    positionForLoc(loc: YrsLoc): number | null;
    /** The location of a block embed's start or end at `position`, in the offsets of the paragraph after it. */
    blockBoundaryAt(position: number): YrsLoc | null;
    private setBlockBoundary;
    /** First paragraph for each paraId. */
    private paragraphIndex;
    bookmarkPosition(name: string): number | null;
    private buildStory;
    private inputPositionAt;
    private buildTable;
}
/** @internal */
declare function yrsLocToProjectedDisplayPosition(reader: Pick<YrsSession, 'hasStory' | 'paragraphSpans'>, projectionFor: (rootStory: string) => YrsLocProjection | null, loc: YrsLoc, activeRootStory?: string, inputMap?: (story: string) => YrsInputPositionMap | null): number | null;

/** @internal */
interface AnchorResolutionFailure {
    ok: false;
    failure: {
        code: 'stale-version' | 'missing-target' | 'ambiguous-target' | 'layout-unavailable' | 'unsupported' | 'unknown-proposal';
        message: string;
    };
}
/** @internal */
type AnchorReader = Pick<YrsSession, 'resolveParagraphAnchor' | 'hasStory' | 'paragraphSpans' | 'storySegments' | 'findText' | 'listRevisions'>;
/** @internal */
type ProposalGeometryReader = AnchorReader & Pick<YrsSession, 'storyIds' | 'paragraphs' | 'paragraphIdCount' | 'locateParagraph' | 'version'> & {
    proposalRevisions?(ids: readonly string[]): readonly ProposalGeometryRevision[];
    positionOutline?(root: string): YrsPositionOutline | null;
    /** Header and footer alias relationship ids, each mapped to its canonical one. */
    headerFooterAliases?(): ReadonlyMap<string, string>;
};
/** @internal */
type ProposalGeometryRevision = Pick<ReturnType<AnchorReader['listRevisions']>[number], 'revisionId' | 'kind' | 'story' | 'range'>;
/** @internal */
type AnchorGeometryTarget = {
    kind: 'proposal';
    id: string;
} | {
    kind: 'revision';
    revisionId: string;
} | {
    kind: 'paragraph';
    paragraph: DocxParagraphAnchor;
} | {
    kind: 'search';
    paragraph: DocxParagraphAnchor;
    text: string;
    occurrence?: DocxOccurrence;
} | {
    kind: 'range';
    version: string;
    range: DocxTextRange;
};
/** @internal */
interface RawAnchorRange {
    start: YrsLoc;
    end: YrsLoc;
}
/** @internal */
type AnchorResolution = {
    ok: true;
    ranges: RawAnchorRange[];
    paragraph: YrsLoc;
} | AnchorResolutionFailure;
/** @internal */
declare function anchorFailure(code: AnchorResolutionFailure['failure']['code'], message: string): AnchorResolutionFailure;
/** @internal */
declare function isBodyStory(story: string): boolean;
/**
 * The story whose display positions `story` uses: `body` for the body and its cells, `hf:<rId>`
 * for a header or footer and its cells, else null. @internal
 */
declare function anchorDisplayRoot(story: string): string | null;
/** @internal The block embeds `paraId` opens with, which its Loc offsets count before its first inline unit. */
declare function paragraphInlineStart(session: AnchorReader, version: string, story: string, paraId: string): number;
/** @internal */
declare function textRangeToRaw(segments: readonly YrsStorySegment[], range: DocxTextRange): {
    ok: true;
    range: RawAnchorRange;
} | AnchorResolutionFailure;
/** @internal */
declare function hiddenRanges(session: AnchorReader, version: string, snapshot: DocxProposalSnapshot | null, revisions?: readonly ProposalGeometryRevision[]): RawAnchorRange[];
/** @internal */
declare function hiddenRangesForPreview(session: AnchorReader, version: string, preview: ReturnType<typeof proposalRevisionPreview>, revisions?: readonly ProposalGeometryRevision[]): RawAnchorRange[];
/** @internal */
declare function resolveAnchorTarget(session: AnchorReader, target: AnchorGeometryTarget, version: string, snapshot?: DocxProposalSnapshot | null, proposalRevisions?: readonly ProposalGeometryRevision[]): AnchorResolution;
/** @internal */
interface ProposalDisplayTarget {
    ranges: {
        from: number;
        to: number;
    }[];
    paragraph: number | null;
    /** A header or footer target's story, whose positions these are; absent for the body. */
    root?: string;
    /** With `root`, that story's hidden ranges. */
    hidden?: {
        from: number;
        to: number;
    }[];
    /** With `root`, the relationship ids whose bands show it, when the reader knows its aliases. */
    rIds?: string[];
}
/** @internal */
type ProposalGeometryTarget = ({
    ok: true;
} & ProposalDisplayTarget) | AnchorResolutionFailure;
/** @internal */
interface ProposalGeometryMirror {
    version: string;
    previewVersion: number;
    proposals: string;
    targets: Record<string, ProposalGeometryTarget>;
    navigationTargets?: Record<string, ReturnType<typeof resolveNavigationTarget>>;
    hidden: {
        from: number;
        to: number;
    }[];
}
/** @internal */
declare function proposalSetIdentity(snapshot: DocxProposalSnapshot): string;
/** @internal */
declare function computeProposalGeometryMirror(reader: ProposalGeometryReader, snapshot: DocxProposalSnapshot, includeNavigationTargets?: boolean): ProposalGeometryMirror;
/**
 * @internal Display geometry of non-proposal targets, each in the story it is painted from;
 * `hidden` gives the raw hidden ranges a header or footer answer carries for its story.
 */
declare function computeAnchorTargetGeometry(reader: ProposalGeometryReader, targets: readonly Exclude<AnchorGeometryTarget, {
    kind: 'proposal';
}>[], hidden?: () => readonly RawAnchorRange[]): ProposalGeometryTarget[];
/** @internal {@link computeAnchorTargetGeometry} of targets already resolved at `version`. */
declare function resolvedTargetGeometry(reader: ProposalGeometryReader, version: string, hidden?: () => readonly RawAnchorRange[]): (resolved: AnchorResolution) => ProposalGeometryTarget;
/** @internal */
declare function resolveMirroredNavigationTarget(mirror: ProposalGeometryMirror | null, snapshot: DocxProposalSnapshot, story: string, paraId: string): ReturnType<typeof resolveNavigationTarget> | null;
/** @internal */
declare function resolveNavigationTarget(reader: ProposalGeometryReader, story: string, paraId: string): {
    loc: YrsLoc;
    position: number;
} | 'missing-target' | 'ambiguous-target' | 'unsupported';

/**
 * `blocks` with paragraphs of their own, in table cells too, each still the
 * session paragraph it was projected from: a save edits these, not the
 * projection the next one reuses. @internal
 */
declare function ownProjectedParagraphs(blocks: readonly BlockContent[]): BlockContent[];
/**
 * Rebuild all yrs-owned editable stories into the serializer-facing Document
 * while preserving every package part the editor does not own.
 */
interface YrsToDocumentOptions {
    /**
     * Root stories to project. Omit to rebuild every editable story. A `body`
     * projection includes its nested table/content-control stories.
     */
    storyIds?: ReadonlySet<string>;
    /**
     * The session comment id of each comment in `base` whose OOXML id is not
     * that id, such as one added with {@link YrsSession.addComment}. @internal
     */
    commentIds?: ReadonlyMap<number, string>;
}
declare function yrsToDocument(session: YrsSession, base: Document, options?: YrsToDocumentOptions): Document;

/** @internal */
declare function dirtyProjectionStory(activeStory: string): string;
/** @internal */
declare class DirtyProjectionStories {
    private readonly stories;
    private nextMark;
    add(story: string): void;
    projectionOptions(): YrsToDocumentOptions | undefined;
    /** The marked stories by their own ids, nested ones included, as the projection memo keys them. */
    capture(): {
        stories: string[];
        clear(): void;
    };
    clear(): void;
}
/**
 * @internal
 * Dirty stories of an editor that keeps a main-thread projection cache and saves in the worker.
 * A worker save projects the stories the main-thread save would project at the same point.
 */
declare class EditorDirtyStories {
    /** Stories changed since the main-thread projection cache last advanced. */
    readonly projection: DirtyProjectionStories;
    private readonly workerSave;
    private projections;
    private savedAtProjection;
    private adoptingWorkerSaveUpdates;
    add(story: string): void;
    /** Adopts a worker save's own updates without marking stories. */
    adoptWorkerSaveUpdates(apply: () => void): void;
    /** The main-thread projection cache advanced over `projection`'s stories. */
    projected(): void;
    captureWorkerSave(): {
        stories: string[];
        clear(): void;
    };
    clear(): void;
}
/**
 * @internal
 * Runs one session's worker saves in call order. Each save captures its stories once the
 * previous save settled and clears them on success, as consecutive main-thread saves project.
 */
declare function serialWorkerSaves(dirty: EditorDirtyStories): <T>(save: (stories: string[]) => Promise<T>) => Promise<T>;
/** @internal */
declare function proposalProjectionStories(known: ReadonlySet<string>, result: Extract<DocxProposalResult, {
    ok: true;
}>, changedStories: readonly string[]): Set<string>;

/** The editor's save: the session projected with its host's metadata and comments. @internal */

/** What the editor's earlier saves of a session leave for its next save. @internal */
interface EditorSaveRecord {
    commentIds?: ReadonlyMap<number, string>;
    /** A save wrote every part; every later save does too. */
    full: boolean;
    /** The bytes the last save wrote from the source package. */
    saved?: ArrayBuffer;
}
/** @internal */
declare function mergeDocxHostMetadata(full: Document, host: Document): Document;
/** Host metadata read by `mergeDocxHostMetadata`. @internal */
declare function hostSaveMetadata(host: Document): Document;
/**
 * Saves `projected`, the editor's projection of `session`, with the host's
 * `comments`. `record` holds the earlier saves; the session's own by default.
 * @internal
 */
declare function saveEditorDocument(session: YrsSession, projected: Document, comments: Comment[], record?: EditorSaveRecord): Promise<ArrayBuffer>;

/** Earlier saves of the worker's document and the projection the next one starts from. @internal */
interface ResidentSaveRecord extends EditorSaveRecord {
    base?: Document;
}

interface DocxCommentPatch {
    body?: unknown;
    author?: string;
    date?: string;
    done?: boolean;
    parentId?: string | null;
}
/** A comment, by the id saves and the host use, or a revision, by its session id. */
type DocxReviewTarget = {
    kind: 'comment';
    id: number;
} | {
    kind: 'revision';
    revisionId: string;
};
/** The session id and story ranges of a review target, or null when it does not exist. */
interface DocxReviewTargetRanges {
    id: string;
    ranges: YrsStoryRange[];
}
interface DocxReviewSnapshot {
    version: string;
    previewVersion: number;
    layoutRevision: number;
    frameEpoch: number;
    comments: YrsCommentInfo[];
    uiComments?: Comment[];
    commentIds?: Record<string, number>;
    revisions: YrsRevisionInfo[];
    proposals: DocxProposalSnapshot;
    proposalGeometry: ProposalGeometryMirror;
    commentGeometry: Record<string, DisplayListRect[]>;
    revisionGeometry: Record<string, DisplayListRect[]>;
    proposalHighlights: Record<string, DisplayListRect[]>;
}

type DocxFontFace = {
    family: string;
    data: Uint8Array;
    weight?: string | number;
    style?: 'normal' | 'italic' | 'oblique';
} | {
    family: string;
    substituteOf: number;
};
interface DocxFontEnvironment {
    faces: DocxFontFace[];
    chains: Record<string, number[]>;
    families: string[];
}
interface DocxFontEnvironmentSnapshot {
    revision: number;
    families: string[];
}
interface DocxFontEnvironmentEvent extends DocxFontEnvironmentSnapshot {
    phase: 'ready' | 'presentation';
    frameEpoch?: number;
}

interface ResidentCommentRecoveryState {
    aliases: [string, number][];
    initialized: boolean;
}
interface ResidentCommentProjection {
    comments: Comment[];
    ids: Record<string, number>;
    sessionIds: Map<number, string>;
}
interface CommentInsertionRefusal {
    status: 'refused';
    reason: Extract<DocxEditFailureCode, 'missing-target' | 'ambiguous-target' | 'invalid-step'>;
}
type ResidentCommentInsertionRange = YrsStoryRange | CommentInsertionRefusal;

/** Text a reservation anchors to: a range read at `version`, or matches of `text` in a paragraph. */
type DocxReservationAnchor = {
    kind: 'range';
    version: string;
    range: DocxTextRange;
} | {
    kind: 'search';
    paragraph: DocxParagraphAnchor;
    text: string;
    occurrence?: DocxOccurrence;
};
/** A whole paragraph, mark included. */
interface DocxReservationParagraph {
    kind: 'paragraph';
    paragraph: DocxParagraphAnchor;
}
/**
 * Layout space reserved without changing the document, in CSS pixels at zoom 1. An `inline` box
 * sits at its anchor's start on the baseline, takes no document positions and is never split;
 * `hideAnchor` also hides the anchored text. A `block` sits beside the paragraph its anchor starts
 * in, spans the column unless `width` is set and is clipped to the column. `hide` removes its
 * anchor from render only.
 */
type DocxReservation = {
    id: string;
    kind: 'inline';
    anchor: DocxReservationAnchor;
    width: number;
    height: number;
    hideAnchor?: boolean;
} | {
    id: string;
    kind: 'block';
    anchor: DocxReservationAnchor | DocxReservationParagraph;
    side: 'before' | 'after';
    height: number;
    width?: number;
} | {
    id: string;
    kind: 'hide';
    anchor: DocxReservationAnchor | DocxReservationParagraph;
};
/** @internal Every owner's reservations, computed at `version`. */
interface DocxReservationsPayload {
    version: string;
    /** Names this payload in the frames laid out with it. */
    key?: string;
    sets: readonly {
        owner: string;
        version?: string;
        items: readonly DocxReservation[];
    }[];
}
/**
 * @internal One reservation resolved to units counted from its paragraph's first inline unit, the
 * mark at the inline length.
 */
interface DocxResolvedReservation {
    owner: string;
    id: string;
    story: string;
    paraId: string;
    start: number;
    end: number;
    kind: 'inline' | 'block' | 'hide';
    width?: number;
    height?: number;
    side?: 'before' | 'after';
    hide?: boolean;
}
/** @internal Resolved reservations by key, as `renderEnv.reservations` carries them. */
type DocxResolvedReservations = Record<string, DocxResolvedReservation>;
/** @internal Retains applied entries for the payload's owners. */
declare function retainReservationOwners(payload: DocxReservationsPayload, previous: DocxResolvedReservations | null): DocxResolvedReservations;
/** @internal Whether `value` is a well-formed payload: ids unique per owner, owners unique. */
declare function validReservationsPayload(value: unknown): value is DocxReservationsPayload;
/**
 * @internal Resolves a payload against `reader` at `readerVersion`, which a range anchor at the
 * payload's version is read at. Anchors that do not resolve are left out.
 */
declare function resolveReservations(reader: AnchorReader, payload: DocxReservationsPayload, readerVersion?: string, previous?: DocxResolvedReservations | null): DocxResolvedReservations;

/** Format-owned, structured-cloneable methods. */
type SessionMethods = Record<string, (...args: any[]) => unknown>;
type MethodHandlers<M extends SessionMethods, C> = {
    [K in keyof M]: (context: C, ...args: Parameters<M[K]>) => Awaited<ReturnType<M[K]>> | TransferResult<Awaited<ReturnType<M[K]>>> | DeferredReply<Awaited<ReturnType<M[K]>>> | Promise<Awaited<ReturnType<M[K]>> | TransferResult<Awaited<ReturnType<M[K]>>> | DeferredReply<Awaited<ReturnType<M[K]>>>>;
};
interface MethodPolicy {
    lane: 'input' | 'collab' | 'interactive';
    mutates?: boolean;
    reframes?: boolean;
    reorderable?: boolean;
    key?: string;
    replaceableBy?: string;
    userInput?: boolean;
    holdsIdleTasks?: boolean;
}
type MethodPolicies<M extends SessionMethods> = {
    [K in keyof M]: MethodPolicy | ((...args: Parameters<M[K]>) => MethodPolicy);
};
type SessionFailureCode = 'crash' | 'trap' | 'out-of-memory' | 'message' | 'silence' | 'disposed';
/** A terminal session failure. */
declare class SessionFailure extends Error {
    readonly code: SessionFailureCode;
    readonly diagnostics?: string | undefined;
    constructor(code: SessionFailureCode, message: string, diagnostics?: string | undefined);
}

interface ReplyError {
    name: string;
    message: string;
    refusal?: unknown;
}
declare const TRANSFER: unique symbol;
declare const DEFERRED: unique symbol;
interface DeferredReply<T> {
    readonly [DEFERRED]: true;
    readonly promise: Promise<T | TransferResult<T>>;
}
interface TransferResult<T> {
    readonly [TRANSFER]: true;
    readonly value: T;
    readonly transfer: Transferable[];
}

/** @internal */
type BaseRefusal = 'read-only' | 'stale' | 'superseded' | 'not-ready' | 'busy' | 'disposed' | 'invalid-payload' | 'unsupported' | 'dependency-refused' | 'unknown-outcome';
/** @internal */
type Refusal<F extends string = never> = {
    code: BaseRefusal | F;
    detail?: string;
};
/** @internal */
type Dependency = 'doc' | 'selection' | 'layout';
/** @internal Worker state at the read boundary. */
type At = {
    incarnation: number;
    epoch: number;
    throughSeq: number;
    doc: number;
    selection: number;
    layout: number;
};
/** @internal */
type Read<R, F extends string = never> = {
    ok: true;
    value: R;
    at: At;
} | {
    ok: false;
    refusal: Refusal<F>;
};
declare const queryType: unique symbol;
/** @internal */
type StaleMode = 'answer-at-fence' | {
    readonly reject: readonly Dependency[];
};
/** @internal */
interface QuerySpec<A extends unknown[] = unknown[], R = unknown, F extends string = string> {
    readonly stale: StaleMode;
    readonly refusals: readonly F[];
    readonly [queryType]?: (...args: A) => R;
}
/** @internal */
type QueryTable = Record<string, QuerySpec<any[], any, string>>;
/** @internal */
type QueryFence = {
    session: string;
    incarnation: number;
    epoch: number;
    afterSeq: number;
};
/** @internal */
type QueryReply = Read<unknown, string>;

/** @internal Command with a confirmed basis and a sequence assigned at send time. */
type CommandEnvelope<P> = {
    session: string;
    incarnation: number;
    seq: number;
    basis: {
        epoch: number;
        version: number;
    };
    afterSeq?: number;
    expectVersion?: boolean;
    kind: string;
    payload: P;
    inputTime?: number;
    lastInputTime?: number;
    group?: string;
    replay?: true;
};
/** @internal Settled worker outcome for one command sequence. */
type CommandOutcome = {
    seq: number;
    status: 'applied' | 'noop' | 'refused' | 'cancelled' | 'duplicate';
    reason?: string;
    committed?: false;
    affectedSeqs?: number[];
};
/** @internal Full or incremental frame identified by command coverage and revision. */
type FrameEnvelope<F> = {
    coversThroughSeq: number;
    revision: number;
    baseRevision?: number;
    payload: F;
};
/** @internal Acknowledgement with authoritative state and an optional covering frame. */
type CommandAck<S, E, F> = {
    session: string;
    incarnation: number;
    epoch: number;
    throughSeq: number;
    version: number;
    outcomes: CommandOutcome[];
    selection?: S;
    editState?: E;
    frame?: FrameEnvelope<F>;
    revisions?: {
        selection: number;
        layout: number;
    };
};
/** @internal Snapshot captured at a settled command boundary. */
type Checkpoint = {
    state: Uint8Array;
    epoch: number;
    version: number;
    throughSeq: number;
};
/** @internal Methods registered on the existing session RPC. */
type CommandMethods<P, S, E, F> = {
    edit(envelope: CommandEnvelope<P>): CommandAck<S, E, F>;
    checkpoint(): Checkpoint;
};
/** @internal Local outcome; unsent cancellations have no sequence. */
type TicketOutcome = Omit<CommandOutcome, 'seq'> & {
    seq?: number;
};
/** @internal Non-rejecting presentation settlement for tickets and coverage waiters. */
type PresentationStatus = 'presented' | 'dropped';
/** @internal Immediate local identity with a live send-time sequence getter. */
type CommandTicket = {
    readonly id: number;
    readonly seq: number | undefined;
    readonly ack: Promise<TicketOutcome>;
    readonly presented: Promise<PresentationStatus>;
};
/** @internal Main-side command lane, distinct from resident scheduler lanes. */
type CommandLane = 'input' | 'collab' | 'background';
/** @internal Submission metadata, causal ticket dependency, and optional local echo. */
type SubmitOptions<X> = {
    lane?: CommandLane;
    after?: CommandTicket;
    expectVersion?: boolean;
    inputTime?: number;
    lastInputTime?: number;
    group?: string;
    coalesceKey?: string;
    fence?: boolean;
    echo?: X;
};
/** @internal Unsent command accepted by the outbox and coalescing hook. */
type CommandDraft<P, X> = {
    kind: string;
    payload: P;
    options: SubmitOptions<X>;
};
/** @internal Format-owned echo associated with a local ticket and optional sent sequence. */
type EchoEntry<X> = {
    ticket: CommandTicket;
    seq?: number;
    value: X;
};
/** @internal Synchronous painters; present installs, retires, and redraws atomically. */
type EchoHooks<X, F> = {
    paint(pending: readonly EchoEntry<X>[]): void;
    drop(entries: readonly EchoEntry<X>[], reason: string): void;
    present(frame: FrameEnvelope<F>, retired: readonly EchoEntry<X>[], remaining: readonly EchoEntry<X>[]): void | boolean;
};
/** @internal Painter timing within one synchronous submit, acknowledgement, or frame event. */
type EchoOverrunSample = {
    hook: keyof EchoHooks<unknown, unknown>;
    elapsedMs: number;
    eventTotalMs: number;
};
/** @internal Latest confirmed worker state and installed frame coverage. */
type EditSessionState<S, E> = {
    epoch: number;
    version: number;
    throughSeq: number;
    presentedThroughSeq: number;
    selection: S | undefined;
    editState: E | undefined;
};
/** @internal Shared asynchronous editor contract for worker and legacy backends. */
interface EditSession<P, S, E, X> {
    readonly backend: 'worker' | 'legacy-sync' | 'legacy-in-thread';
    readonly state: EditSessionState<S, E>;
    submit(kind: string, payload: P, options?: SubmitOptions<X>): CommandTicket;
    attachEcho?(tickets: readonly CommandTicket[], preview: (draft: CommandDraft<P, X>, originalIntentCount: number) => X | undefined): boolean;
    whenPresented(seq: number): Promise<PresentationStatus>;
    subscribe(listener: (state: EditSessionState<S, E>) => void): () => void;
    flush(): Promise<void>;
    dispose(): Promise<void>;
}
/** @internal Initial acknowledgement and structural subset of the existing RPC client. */
type CommandConnection<P, S, E, F> = {
    initial: CommandAck<S, E, F>;
    client: {
        readonly call: {
            edit(envelope: CommandEnvelope<P>): Promise<CommandAck<S, E, F>>;
            checkpoint(): Promise<Checkpoint>;
            /** @internal Posts queries after all edits previously handed to this connection. */
            query?(fence: QueryFence, kind: string, args: unknown[]): Promise<QueryReply>;
        };
        readonly failure: SessionFailure | undefined;
        onFailure(listener: (failure: SessionFailure) => void): () => void;
        /** @internal Subscribes to frames posted by this connection's worker. */
        onFrame?(listener: (frame: FrameEnvelope<F>) => void): () => void;
        onAck?(listener: (ack: CommandAck<S, E, F>) => void): () => void;
        dispose(): Promise<void>;
    };
};
/** @internal Confirmed basis and live version provided for format-owned rebasing. */
type ApplyContext = {
    basis: CommandEnvelope<unknown>['basis'];
    currentVersion: number;
    replayPreviouslyApplied: boolean;
};
/** @internal Format apply result; noop, refusal, cancellation, and applied with committed: false must preserve the version. */
type ApplyResult<S, E> = {
    status: 'applied';
    committed?: false;
    selection?: S;
    editState?: E;
} | {
    status: 'noop';
    selection?: S;
    editState?: E;
} | {
    status: 'cancelled';
    reason?: string;
    selection?: S;
    editState?: E;
} | {
    status: 'refused';
    reason: string;
    selection?: S;
    editState?: E;
    affectedSeqs?: number[];
};
/** @internal Edit and checkpoint handlers with admission-time scheduler policies. */
interface CommandHost<P, S, E, F> {
    handler(context: unknown, envelope: CommandEnvelope<P>): Promise<CommandAck<S, E, F> | TransferResult<CommandAck<S, E, F>>>;
    policy(envelope: CommandEnvelope<P>): MethodPolicy;
    checkpoint(context: unknown): Promise<Checkpoint | TransferResult<Checkpoint>>;
    checkpointPolicy(): MethodPolicy;
    query?(context: unknown, fence: QueryFence, kind: string, args: unknown[]): Promise<QueryReply | TransferResult<QueryReply>> | DeferredReply<QueryReply>;
    queryPolicy?(fence: QueryFence, kind: string, args: unknown[]): MethodPolicy;
    revise?(change?: {
        selection?: S;
        editState?: E;
    }): CommandAck<S, E, F> | undefined;
    /** @internal Builds a frame at a command boundary after admitted edits. */
    frame(): Promise<FrameEnvelope<F> | TransferResult<FrameEnvelope<F>>>;
}
/** @internal Recovery progress, replay divergence, and format history reset signal. */
type RecoveryEvent = {
    phase: 'recovering' | 'recovered' | 'diverged' | 'failed';
    incarnation: number;
    attempt: number;
    diverged: number[];
    historyReset: boolean;
    failure?: SessionFailure;
};
/** @internal Format reopen and checkpoint hooks used by main-side recovery. */
type RecoveryHooks<O, P, S, E, F> = {
    reopen(input: {
        source: O;
        checkpoint?: Checkpoint;
        session: string;
        incarnation: number;
        epoch: number;
        refusedSeqs: readonly number[];
        replayAppliedSeqs: readonly number[];
    }): Promise<CommandConnection<P, S, E, F>>;
    checkpoint?(connection: CommandConnection<P, S, E, F>): Promise<Checkpoint>;
    onRecovery?(event: RecoveryEvent): void;
};
/** @internal Worker-backed session limits, recovery, reconciliation, and injected scheduling. */
type WorkerEditSessionOptions<O, P, S, E, F, X, Q extends QueryTable = {}> = {
    source: O;
    connection: CommandConnection<P, S, E, F>;
    queries?: Q;
    holdTimeoutMs?: number;
    timer?(callback: () => void, ms: number): () => void;
    recovery: RecoveryHooks<O, P, S, E, F>;
    echo?: EchoHooks<X, F>;
    /** @internal Releases rejected frame resources; accepted frames belong to the painter. */
    discardFrame?(frame: FrameEnvelope<F>): void;
    sameCoverageFrames?: boolean;
    /** @internal Commits presentation only after the echo hook accepts it; off by default. */
    transactionalPresentation?: boolean;
    /** @internal Handles echo capacity overflow; defaults to declining new entries. */
    echoOverflow?: 'decline' | 'evict-oldest';
    coalesce?(prev: CommandDraft<P, X>, next: CommandDraft<P, X>): CommandDraft<P, X> | undefined;
    /** @internal Keeps a matching draft queued while the matching command it follows is in flight, so a burst coalesces into one send. */
    holdForCoalescing?(draft: CommandDraft<P, X>): boolean;
    requestFullFrame(connection: CommandConnection<P, S, E, F>): Promise<CommandAck<S, E, F>>;
    maxInFlight?: number;
    inputBurstCap?: number;
    maxEchoEntries?: number;
    maxRecoveryAttempts?: number;
    checkpointPolicy?(stats: {
        applied: number;
        bytes: number;
    }): boolean;
    commandBytes?(envelope: CommandEnvelope<P>): number;
    /** @internal May share caller data only with a transport that copies before returning. */
    copyCommandForDispatch?(envelope: CommandEnvelope<P>): CommandEnvelope<P>;
    now?(): number;
    enqueue?(callback: () => void): void;
    onEchoOverrun?(sample: EchoOverrunSample): void;
    onAck?(ack: CommandAck<S, E, F>): void;
};

/** @internal */
type PlainTextReader = Pick<YrsSession, 'storySegments'>;
/** @internal */
declare const MAX_TABLE_COLUMNS = 16384;
interface TablePayloadCell {
    story: string;
    tcPr?: Record<string, unknown>;
}
/** @internal */
interface TablePayloadRow {
    trPr?: Record<string, unknown>;
    cells: TablePayloadCell[];
}
/** @internal */
interface TablePayload {
    tblPr?: Record<string, unknown>;
    grid?: unknown[];
    rows: TablePayloadRow[];
}
/** @internal */
interface TableCellAnchor {
    row: number;
    column: number;
    rowspan: number;
    colspan: number;
    story: string;
}
/** Plain text of one non-table embed; tables use {@link tablePlainText}. @internal */
declare function embedPlainText(reader: PlainTextReader, kind: string, payload: Record<string, unknown>): string;
/** Tab-separated rows, without grid padding for oversized blocks. @internal */
declare function tablePlainText(reader: PlainTextReader, payload: TablePayload, range?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
}): string[];
/** Plain text of story units `[from, to)`: paragraphs end in newlines, tables become tab-separated rows. @internal */
declare function storyPlainText(reader: PlainTextReader, story: string, from?: number, to?: number): string;
declare function tableRowGrid(trPr?: Record<string, unknown>): {
    before: number;
    after: number;
};
/** @internal */
declare function tableAnchors(payload: TablePayload): {
    anchors: TableCellAnchor[];
    columns: number;
};
/** @internal Story offset of `loc`: the paragraph's span start plus the loc offset. */
declare function storyOffsetForLoc(reader: Pick<YrsSession, 'locateParagraph'>, loc: YrsLoc): number;

/** @internal Version of the internal clipboard payload; a reader ignores other versions. */
declare const DOCX_CLIPBOARD_FRAGMENT_VERSION = 2;
/**
 * @internal One unit of a table cell's story. `attributes` are raw yrs run or embed attributes as
 * `storySegments` reports them; `format` is a semantic patch applied on top (HTML import uses it).
 */
type DocxFragmentSegment = {
    kind: 'text';
    text: string;
    attributes?: Record<string, unknown>;
    format?: YrsInlineFormatDelta;
} | {
    kind: 'tab' | 'break';
    payload?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
} | {
    kind: 'pilcrow';
    properties?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
} | {
    kind: 'table';
    table: DocxTableFragment;
    attributes?: Record<string, unknown>;
};
/** @internal A cell's `content` ends with a pilcrow; `shading` is a hex fill applied like `setCellShading`. */
interface DocxTableFragmentCell {
    tcPr: Record<string, unknown>;
    content: DocxFragmentSegment[];
    shading?: string;
}
/** @internal */
interface DocxTableFragmentRow {
    trPr: Record<string, unknown>;
    cells: DocxTableFragmentCell[];
}
/** @internal A rectangular table, its cells in row order with `rowspan`/`colspan` in `tcPr`. */
interface DocxTableFragment {
    tblPr: Record<string, unknown>;
    /** Column widths in twips; empty splits the default table width evenly. */
    grid: number[];
    rows: DocxTableFragmentRow[];
}
type DocxClipboardInline = {
    text: string;
} | {
    image: Record<string, unknown>;
};
/** @internal A paragraph's leading tables and ordered inline content. */
interface DocxClipboardParagraph {
    tables?: DocxTableFragment[];
    text: string;
    inlines?: DocxClipboardInline[];
}
/** @internal Copied or pasted content in document order; consecutive paragraphs are separate paragraphs. */
interface DocxClipboardFragment {
    paragraphs: DocxClipboardParagraph[];
}
/** @internal What a copy writes: plain text plus a fragment for tables or pictures. */
interface DocxClipboardSlice {
    text: string;
    fragment: DocxClipboardFragment | null;
}
/** @internal */
declare function clipboardFragmentHasPictures(fragment: DocxClipboardFragment | null): boolean;
/** @internal Strict shape and size check for a pasted or copied clipboard fragment. */
declare function validClipboardFragment(value: unknown): value is DocxClipboardFragment;
/** @internal Sessions a table read needs: the raw payload plus story segments. */
type ClipboardTableReader = Pick<YrsSession, 'tablePayload' | 'storySegments'> & {
    mediaDataUrl?(source: string): string | null | undefined;
};
/** @internal Engine surface a fragment paste needs. */
type ClipboardPasteEngine = Pick<YrsSession, 'deleteRange' | 'splitParagraph' | 'insertText' | 'insertTableFragment' | 'validateTableFragment' | 'insertImage'>;
/** @internal Inclusive grid bounds for {@link readTableFragment}. */
interface ClipboardTableRect {
    top: number;
    bottom: number;
    left: number;
    right: number;
}
/** @internal Copy source: a multi-cell range, or story units `[from, to)`. */
type ClipboardSliceTarget = {
    cells: YrsTableRange;
} | {
    story: string;
    from: number;
    to: number;
};
/** @internal Raw table payload lowered to the anchor reader's shape, or null. */
declare function clipboardTablePayload(value: unknown): TablePayload | null;
/**
 * Reads one rectangular table as a fragment. `rect` is inclusive; it expands
 * to fully cover every merged cell it touches.
 * @internal
 */
declare function readTableFragment(reader: ClipboardTableReader, table: {
    story: string;
    tableIndex: number;
}, rect?: ClipboardTableRect): DocxTableFragment;
/**
 * Reads the clipboard slice for a copy: always plain text, plus a fragment
 * when the selection holds tables or pictures.
 * @internal
 */
declare function readClipboardSlice(reader: ClipboardTableReader, target: ClipboardSliceTarget): DocxClipboardSlice;
/**
 * Pastes a fragment over a story range, returning the caret. Deletes a
 * non-collapsed range first, then replays each paragraph: splits for
 * paragraphs after the first, inserts tables, then text.
 * @internal
 */
declare function applyClipboardFragment(engine: ClipboardPasteEngine, range: YrsStoryRange, fragment: DocxClipboardFragment, suggesting?: YrsAuthor): YrsLoc;

/** @internal Layout read after the predecessor command has resolved. */
interface DocxCommandSelectionLayout {
    frame: RetainedFrame;
    layoutRevision: number;
}

interface DocxCellNavigationPlan {
    selection: DocxCommandSelection;
    cells: YrsTableRange | null;
    insertRow?: YrsCellLoc;
}

interface DocxTableCommandTarget {
    focused: YrsCellLoc;
    range: YrsTableRange;
    table: YrsTableLoc;
    near: YrsLoc | null;
}

interface DocxPartTarget {
    kind: 'header' | 'footer' | 'footnote' | 'endnote';
    section: string;
    page: number;
    variant?: HeaderFooterType;
    noteId?: number;
    expectVersion: string;
}
interface ResidentPartTarget extends Omit<DocxPartTarget, 'expectVersion'> {
    story: string;
}
interface ResidentPartGeometry {
    kind: DocxPartTarget['kind'];
    story: string;
    pageIndex: number;
    pageId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
interface ResidentPartMetadata {
    body: Pick<Document['package']['document'], 'sections' | 'finalSectionProperties'>;
    headers?: [string, HeaderFooter][];
    footers?: [string, HeaderFooter][];
    footnotes?: Footnote[];
    endnotes?: Endnote[];
    relationships?: [string, Relationship][];
}

type DocxSectionMargins = Partial<Pick<SectionProperties, 'marginLeft' | 'marginRight' | 'marginTop' | 'marginBottom' | 'headerDistance' | 'footerDistance' | 'gutter'>>;
interface ResidentSectionSnapshot {
    version: string;
    sections: {
        section: string;
        properties: SectionProperties;
    }[];
    paragraphs: {
        story: string;
        paraId: string;
        tabs: NonNullable<YrsParagraphAttrs['tabs']>;
    }[];
}

interface ResidentObjectRect {
    pageId: string;
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
interface ResidentObjectGeometry {
    handle: string;
    kind: 'text' | 'cell' | 'image';
    story: string;
    rects: ResidentObjectRect[];
    /** Images only: anchored to the page rather than flowing with the text. */
    floating?: boolean;
    /** Floating images only: painted behind the text, so text over them takes the pointer. */
    behindText?: boolean;
    /** Images only: the picture's aspect ratio is locked. */
    noChangeAspect?: boolean;
    rotation?: number;
    /** Images only: the worker selection covers exactly this picture's embed. */
    selected?: boolean;
    /** Image paint order within the page. */
    paintOrder?: number;
    /** Image anchored inside a cell or text box. */
    nested?: boolean;
}
interface ResidentFrameGeometry {
    version: string;
    frameEpoch: number;
    layoutRevision: number;
    selection: ResidentObjectRect[];
    objects: ResidentObjectGeometry[];
    unbuiltPages: number[];
}

type DocxCommandPosition = YrsLoc & {
    sticky?: Uint8Array;
};
interface DocxCommandSelection {
    anchor: DocxCommandPosition;
    focus: DocxCommandPosition;
}
interface DocxStoredMarks {
    story: string;
    paraId: string;
    clear: boolean;
    delta: YrsInlineFormatDelta;
}
interface DocxCommandTableContext {
    story: string;
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
    rowCount: number;
    columnCount: number;
    hasMultiCellSelection: boolean;
    canSplitCell: boolean;
    rowSpan?: number;
    columnSpan?: number;
    justification?: string;
    cellBorderColor?: ColorValue;
    cellBackgroundColor?: string;
}
type DocxEffectiveFormatting = Pick<YrsSelectionContext, 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript' | 'fontFamily' | 'color' | 'highlight' | 'styleId' | 'alignment'> & {
    fontSizePt: number | null;
};
/** The comment an `addComment` command added, under the ID saves and the host use, with every comment after it. */
interface DocxCommentResult {
    seq: number;
    id: number;
    comments: Comment[];
}
/** Every comment after an `updateComment`, `setCommentRanges` or `removeComment` command. */
interface DocxCommentChangeResult {
    seq: number;
    comments: Comment[];
}
interface DocxEditState {
    documentVersion?: string;
    batch?: {
        seq: number;
        result: DocxEditResult;
    };
    comment?: DocxCommentResult;
    commentChange?: DocxCommentChangeResult;
    activePart?: ResidentPartTarget | null;
    readOnly: boolean;
    review?: {
        version: string;
        previewVersion: number;
    };
    toolbar: YrsSelectionContext | null;
    effectiveFormatting: DocxEffectiveFormatting | null;
    storedMarks: DocxStoredMarks | null;
    canUndo: boolean;
    canRedo: boolean;
    hyperlink: YrsHyperlinkAttrs | null;
    tableContext: DocxCommandTableContext | null;
    /** The tracked change whose range holds the selection head, host proposals aside. */
    currentRevisionId?: string;
}
/** Set by a host allowed to propose on a read-only document (`allowHostProposals`). */
interface DocxHostProposalGrant {
    hostProposal?: boolean;
}
interface DocxSelectionIntent {
    selection?: DocxCommandSelection;
    suggesting?: YrsAuthor;
}
/** @internal */
type DocxNavigationIntent = {
    unit: 'character' | 'word' | 'line' | 'paragraph' | 'document-boundary';
    direction: 'backward' | 'forward';
    extend: boolean;
} | {
    unit: 'line';
    direction: 'up' | 'down';
    extend: boolean;
    goalX: number;
} | {
    unit: 'page';
    direction: 'up' | 'down';
    extend: boolean;
    goalX: number;
    distance: number;
};
/** @internal Captured retained-frame identity; pageId is the decimal retained page ID. */
interface DocxCommandPageIdentity {
    pageId: string;
    pageIndex: number;
}
/** @internal */
interface DocxPointModifiers {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
}
/** @internal Page-local layout coordinates, never document offsets. */
interface DocxSelectionPointIntent {
    page: DocxCommandPageIdentity;
    x: number;
    y: number;
    layoutRevision: number;
    frameEpoch: number;
    clickCount: number;
    modifiers: DocxPointModifiers;
    story?: string;
    cellId?: string;
}
/** @internal */
interface DocxEchoRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** @internal Canvas affine transform from context-local to page-local coordinates. */
type DocxEchoTransform = readonly [number, number, number, number, number, number];
/** @internal Display-only indices into the projected context text. */
interface DocxEchoStyleRun {
    startUtf16: number;
    endUtf16: number;
    fontFamily: string;
    fontSizePx: number;
    color: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    transform: DocxEchoTransform;
    baseline: {
        x: number;
        y: number;
    };
}
/** @internal Bidirectional boundary mapping within the projected text. */
interface DocxEchoGraphemeBoundary {
    utf16: number;
    grapheme: number;
    caret: DocxEchoRect;
}
/** @internal Text-free restoration dependency supplied with a staged page. */
interface DocxEchoDamageDependency {
    page: DocxCommandPageIdentity;
    rect: DocxEchoRect;
    backgroundId: string;
    /** The echoed line's runs and decorations, which the background leaves out. */
    omittedPrimitiveIds: readonly string[];
}
/**
 * @internal The echoed line as the engine places it: one cluster per character, shaped through
 * one glyph set, at pen positions `round3(x + sum of advances)`.
 */
interface DocxEchoGlyphLine {
    /** Key of the glyph set the line shapes with. */
    glyphSet: string;
    fontId: number;
    size: number;
    color: string;
    x: number;
    y: number;
    /** The paragraph character after the line, which kerns with its last one; empty at the end. */
    next: string;
    /** Rightmost pen end a lengthened line keeps without wrapping. */
    right: number;
    /** Width a centered line centers in from `x`; its glyphs start where the engine centers the text. */
    center?: number;
    canEmpty?: boolean;
    /** Free width at the end of the previous line, when this line continues a paragraph. */
    previousSlack?: number;
    /** Width of the next line's leading letters and digits, when a line follows. */
    nextWord?: number;
    /** Repainted region in device pixels, and the scale pages raster at. */
    device: DocxEchoRect;
    pixelRatio: number;
}
/** @internal Shaping facts of one font at one size, indexed by `alphabet`; see `echo_glyph_set_json`. */
interface DocxEchoGlyphSet {
    key: string;
    fontId: number;
    alphabet: string;
    horizontal: number;
    glyphIds: readonly number[];
    advances: readonly number[];
    kerning: readonly (readonly [number, number, number])[];
    unsafePairs: readonly (readonly [number, number])[];
    /** Outline JSON per glyph id, exactly as the worker's glyph cache reads it. */
    outlines: Readonly<Record<string, string>>;
}
/** @internal Bounded, display-only active context; never a command target. */
interface DocxCommandEchoContext {
    page: DocxCommandPageIdentity;
    frameEpoch: number;
    layoutRevision: number;
    serializedBytes: number;
    text: string;
    styleRuns: readonly DocxEchoStyleRun[];
    boundaries: readonly DocxEchoGraphemeBoundary[];
    selection: {
        anchorGrapheme: number;
        focusGrapheme: number;
    };
    transform: DocxEchoTransform;
    damage: readonly DocxEchoDamageDependency[];
    shaping: 'simple-ltr' | 'unsupported';
    glyphs?: DocxEchoGlyphLine;
}
/** @internal Transferable authoritative pixels and optional text-free restoration pixels. */
interface DocxStagedPageBitmap {
    page: DocxCommandPageIdentity;
    frameEpoch: number;
    bitmap: ImageBitmap;
    backgrounds?: readonly {
        id: string;
        rect: DocxEchoRect;
        bitmap: ImageBitmap;
    }[];
}
/** @internal */
interface DocxCommandStagedPresentation {
    frameEpoch: number;
    pages: readonly DocxStagedPageBitmap[];
}
interface DocxCommandPayloads {
    applyRemoteUpdate: {
        update: ArrayBuffer;
    };
    applyRemoteUpdateChunks: {
        updates: ArrayBuffer[];
    };
    /** Transport events and calls for a collaboration provider this worker runs; frames stay undecoded until here. */
    collabPipe: PipeCommandPayload;
    applyEdits: {
        request: DocxEditRequest;
        suggesting?: YrsAuthor;
    };
    setRenderEnvironment: {
        themeColors: Record<string, string>;
        showHiddenText: boolean;
        showTableGridlines?: boolean;
        /** Applied only while the document version is still `reservations.version`. */
        reservations?: DocxReservationsPayload;
    };
    setFontEnvironment: DocxFontEnvironment;
    setContentControlValue: {
        handle: string;
        value: YrsContentControlValue;
        expectVersion: string;
    };
    addRepeatingItem: {
        handle: string;
        expectVersion: string;
    };
    removeRepeatingItem: {
        handle: string;
        expectVersion: string;
    };
    openPart: DocxPartTarget;
    ensurePart: DocxPartTarget;
    removePart: DocxPartTarget;
    setHyperlink: {
        selection: DocxCommandSelection;
        hyperlink: YrsHyperlinkAttrs | null;
        displayText?: string;
        expectVersion: string;
    };
    setObjectProperties: {
        handle: string;
        patch: Record<string, unknown>;
        expectVersion: string;
    };
    setSectionProperties: {
        section: string;
        patch: Partial<SectionProperties>;
        expectVersion: string;
    };
    setNoteProperties: {
        section: string;
        footnotePr: FootnoteProperties;
        endnotePr: EndnoteProperties;
        expectVersion: string;
    };
    setWatermark: {
        watermark: Watermark | null;
        expectVersion: string;
    };
    setSectionMargins: {
        section: string;
        margins: DocxSectionMargins;
        expectVersion: string;
    };
    setTabStops: DocxSelectionIntent & {
        tabs: YrsParagraphAttrs['tabs'];
        expectVersion: string;
    };
    removeTabStop: DocxSelectionIntent & {
        positionTwips: number;
        expectVersion: string;
    };
    formatSelection: DocxSelectionIntent & {
        delta: YrsInlineFormatDelta;
    };
    toggleStrike: DocxSelectionIntent;
    toggleList: DocxSelectionIntent & {
        kind: 'bullet' | 'numbered';
    };
    changeIndent: DocxSelectionIntent & {
        direction: 'increase' | 'decrease';
        preserveNumbering?: boolean;
    };
    insertImage: DocxSelectionIntent & {
        image: Readonly<Record<string, unknown>>;
    };
    insertTable: DocxSelectionIntent & {
        rows: number;
        columns: number;
    };
    insertTableRow: DocxSelectionIntent & {
        side: 'above' | 'below';
    };
    insertTableColumn: DocxSelectionIntent & {
        side: 'left' | 'right';
    };
    deleteTableRow: DocxSelectionIntent;
    deleteTableColumn: DocxSelectionIntent;
    deleteTable: DocxSelectionIntent;
    mergeTableCells: DocxSelectionIntent;
    splitTableCell: DocxSelectionIntent & {
        rows: number;
        columns: number;
    };
    setTableCellShading: DocxSelectionIntent & {
        color: string | null;
    };
    setTableBorders: DocxSelectionIntent & {
        borders: YrsCellBorders;
    };
    setTableProperties: DocxSelectionIntent & {
        op: 'patch';
        patch: {
            width?: number | null;
            widthType?: string | null;
            justification?: 'left' | 'center' | 'right' | null;
        };
        expectVersion?: string;
    };
    pasteFragment: DocxSelectionIntent & {
        fragment: DocxClipboardFragment;
    };
    insertPageBreak: DocxSelectionIntent;
    insertSectionBreak: DocxSelectionIntent & {
        type: 'nextPage' | 'continuous' | 'oddPage' | 'evenPage';
    };
    resizeObject: {
        handle: string;
        expectVersion: string;
    } & ({
        widthEmu: number;
        heightEmu: number;
        hOffsetEmu?: number;
        vOffsetEmu?: number;
    } | {
        widthTwips: number;
    });
    moveObject: {
        handle: string;
        hOffsetEmu: number;
        vOffsetEmu: number;
        expectVersion: string;
    };
    /** Moves the inline picture `handle` names to the text position under `drop`, as one undo step. */
    moveEmbed: {
        handle: string;
        expectVersion: string;
        drop: DocxSelectionPointIntent;
        suggesting?: YrsAuthor;
    };
    replaceMatches: {
        targets: DocxTextRange[];
        text: string;
        expectVersion: string;
        suggesting?: YrsAuthor;
    };
    undo: Record<string, never>;
    redo: Record<string, never>;
    addComment: {
        ranges: YrsStoryRange[];
        author: string;
        date: string;
        body: unknown;
        expectVersion: string;
        parentId?: string;
    };
    updateComment: {
        id: string;
        patch: DocxCommentPatch;
        expectVersion: string;
    };
    setCommentRanges: {
        id: string;
        ranges: YrsStoryRange[];
        expectVersion: string;
    };
    removeComment: {
        id: string;
        expectVersion: string;
    };
    acceptRevision: {
        revisionId: string;
        expectVersion: string;
    };
    rejectRevision: {
        revisionId: string;
        expectVersion: string;
    };
    propose: DocxProposalRequest & DocxHostProposalGrant;
    setProposalStates: DocxProposalStateRequest & DocxHostProposalGrant;
    withdrawProposals: DocxProposalWithdrawRequest & DocxHostProposalGrant;
    navigateCell: DocxSelectionIntent & {
        direction: 'forward' | 'backward';
        extend: boolean;
        createLastRow: boolean;
    };
    selectTableCells: DocxSelectionIntent & {
        target: 'table' | 'row' | 'column';
    };
    /** `object` selects a picture by its issued geometry handle, refused when `expectVersion` is stale. */
    select: {
        selection: DocxCommandSelection;
        object?: undefined;
    } | {
        selection?: undefined;
        object: {
            handle: string;
            expectVersion: string;
        };
    };
    navigate: DocxNavigationIntent;
    selectPoint: DocxSelectionPointIntent;
    extendSelection: DocxSelectionPointIntent;
    insertText: DocxSelectionIntent & {
        text: string;
    };
    replaceSelection: DocxSelectionIntent & {
        text: string;
    };
    deleteBackward: DocxSelectionIntent & {
        count?: number;
    };
    deleteForward: DocxSelectionIntent & {
        count?: number;
    };
    paragraphBreak: DocxSelectionIntent;
    lineBreak: DocxSelectionIntent;
    toggleMark: DocxSelectionIntent & {
        mark: YrsRunMark;
    };
    formatRange: DocxSelectionIntent & {
        selection: DocxCommandSelection;
        delta: YrsInlineFormatDelta;
    };
    clearFormatting: DocxSelectionIntent;
    setParagraphAttrs: DocxSelectionIntent & {
        attrs: YrsParagraphAttrs;
    };
    applyParagraphStyle: DocxSelectionIntent & {
        styleId: string;
    };
    setReadOnly: {
        readOnly: boolean;
    };
}
type DocxCommandKind = keyof DocxCommandPayloads;
type DocxCommandPayload = DocxCommandPayloads[DocxCommandKind];
type DocxCommandEnvelope = CommandEnvelope<DocxCommandPayload>;
type DocxCommandIntent = {
    [K in DocxCommandKind]: CommandEnvelope<DocxCommandPayloads[K]> & {
        kind: K;
    };
}[DocxCommandKind];
/**
 * @internal The reservation set a layout includes: the `version` and `key` of the payload it was
 * resolved from, or a null `key` for entries kept from an earlier set.
 */
interface DocxFrameReservations {
    version: string;
    key: string | null;
}
interface DocxCommandFramePayload {
    fontEnvironment?: DocxFontEnvironmentSnapshot;
    reservations?: DocxFrameReservations;
    parts?: ResidentPartGeometry[];
    geometry?: ResidentFrameGeometry;
    frame: ArrayBuffer;
    pageFrames?: ArrayBuffer[];
    caret: YrsResidentCaretSnapshot;
    layoutRevision: number;
    selectionRects?: DisplayListRect[];
    selectionFocus?: DisplayListRect;
    documentVersion?: string;
    layoutMeta?: LayoutMetaV1;
    layoutProvisional?: boolean;
    finalizedPages?: number;
    documentWidth?: number;
    echoContext?: DocxCommandEchoContext;
    /** Glyph sets the main thread has not been sent yet in this session. */
    echoGlyphSets?: DocxEchoGlyphSet[];
    stagedPresentation?: DocxCommandStagedPresentation;
}
type DocxCommandFrame = FrameEnvelope<DocxCommandFramePayload>;
type DocxCommandAck = CommandAck<DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload> & {
    echoContext?: DocxCommandEchoContext;
};
type DocxCommandApplyResult = ApplyResult<DocxCommandSelection | null, DocxEditState>;
type DocxCommandReply = DocxCommandAck | TransferResult<DocxCommandAck>;
/** @internal */
interface DocxCommandRecoveryState {
    selection: DocxCommandSelection | null;
    storedMarks: DocxStoredMarks | null;
    activePart?: ResidentPartTarget | null;
    stickyPositions: [string, YrsStickyPosition][];
    cellSelection: YrsTableRange | null;
    proposals: DocxProposalRegistryState;
    selections: [number, DocxCommandSelection | null][];
    comments?: ResidentCommentRecoveryState;
    layoutReservations?: {
        values: DocxResolvedReservations;
        set?: DocxFrameReservations;
    };
}
/** @internal */
interface DocxCommandCheckpoint extends Checkpoint {
    recoveryState?: DocxCommandRecoveryState;
}
/** An SVG display copy of a picture, which only a document can rasterize. */
interface DocxSvgMedia {
    source: string;
    url: string;
}
/** A picture the host decoded, keyed by the media source the display list names. */
interface DocxHostImage {
    source: string;
    image: ImageBitmap;
}
interface DocxCommandInitRequest {
    session: string;
    incarnation: number;
    epoch: number;
    version?: number;
    throughSeq?: number;
    refusedSeqs?: readonly number[];
    replayAppliedSeqs?: readonly number[];
    recoveryState?: DocxCommandRecoveryState;
    readOnly: boolean;
    selection?: DocxCommandSelection | null;
    fonts: YrsResidentFontRegistration[];
    fontRegistrationSlots?: boolean | {
        fontChains: Record<string, number[]>;
    };
    layoutInput: string;
    layoutWithRegions: boolean;
    layoutRevision: number;
    extras: string;
    displayWindow?: [number, number];
    retainBuiltPages?: boolean;
    provisionalPages?: number;
    rasterScale?: number;
    /** Pictures the worker cannot decode itself, decoded by the host; transferred. */
    hostImages?: DocxHostImage[];
}
type DocxCommandInitReply = DocxCommandAck & Required<Pick<DocxCommandAck, 'selection' | 'editState' | 'frame'>>;
type DocxCommandMethods = CommandMethods<DocxCommandPayload, DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload>;
interface DocxCommandApplyContext extends ApplyContext {
    predecessorSelection?: DocxCommandSelection | null;
}
interface PreparedDocxCommand {
    command: DocxCommandIntent;
    selection: DocxCommandSelection | null;
    range: YrsStoryRange | null;
    cellNavigation?: DocxCellNavigationPlan;
    cells?: YrsTableRange | null;
    table?: DocxTableCommandTarget;
    paragraphChanges?: Array<{
        range: YrsStoryRange;
        attrs: YrsParagraphAttrs;
    }>;
    sectionBreakProperties?: SectionProperties;
}
type DocxCommandPreflightResult = {
    status: 'ready';
    prepared: PreparedDocxCommand;
} | Extract<DocxCommandApplyResult, {
    status: 'refused';
}>;
interface DocxCommandHooks {
    preflight(command: DocxCommandEnvelope, context: DocxCommandApplyContext): DocxCommandPreflightResult | Promise<DocxCommandPreflightResult>;
    apply(command: PreparedDocxCommand, context: DocxCommandApplyContext): DocxCommandApplyResult | Promise<DocxCommandApplyResult>;
    selection(): DocxCommandSelection | null;
    editState(): DocxEditState;
    frame(input: {
        coversThroughSeq: number;
        version: number;
        full: boolean;
    }): DocxCommandFrame | TransferResult<DocxCommandFrame> | Promise<DocxCommandFrame | TransferResult<DocxCommandFrame>>;
    snapshot(): Uint8Array | Promise<Uint8Array>;
    recoveryState?(): Omit<DocxCommandRecoveryState, 'selections'>;
}
/** @internal Worker-owned layout access for ordered selection resolution. */
interface DocxCommandHooksEnvironment {
    supportsFontEnvironment?: boolean;
    proposals?: DocxProposalRegistry;
    /** The session merges remote updates; its collaboration wrap applies them. */
    collaboration?: boolean;
    readSelectionLayout(): DocxCommandSelectionLayout;
    getLayoutReservations?(): DocxResolvedReservations | null;
    /**
     * Omits `reservations` to keep the current ones; `set` names the payload they were resolved
     * from, null when they were kept from an earlier set.
     */
    setRenderEnvironment?(environment: {
        themeColors: Record<string, string>;
        showHiddenText: boolean;
        showTableGridlines?: boolean;
        reservations?: DocxResolvedReservations;
    }, set?: DocxFrameReservations | null): void;
}
type DocxCommandHooksFactory = (engine: ResidentEngineSession, init: DocxCommandInitRequest, environment?: DocxCommandHooksEnvironment) => Pick<DocxCommandHooks, 'preflight' | 'apply' | 'selection' | 'editState' | 'recoveryState'> & {
    /** Runs after the collaboration wrap applies a remote merge at `context.currentVersion`. */
    afterRemoteMerge?(context: DocxCommandApplyContext): void;
};
interface DocxCommandRegistry {
    handlers: Partial<MethodHandlers<DocxCommandMethods, unknown>>;
    policies: Partial<MethodPolicies<DocxCommandMethods>>;
}
interface DocxCommandHostOptions {
    init: DocxCommandInitRequest;
    hooks: DocxCommandHooks;
    registry: DocxCommandRegistry;
    retainedOutcomes?: number;
    selectionAck?: {
        echoContext(): DocxCommandEchoContext | undefined;
        deferFrame(ack: DocxCommandAck): void;
    };
}
interface DocxCommandHost extends CommandHost<DocxCommandPayload, DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload> {
    handler(context: unknown, envelope: DocxCommandEnvelope): Promise<DocxCommandReply>;
    withFrameWork<T>(run: () => Promise<T>): Promise<T>;
    initial(): Promise<DocxCommandInitReply | TransferResult<DocxCommandInitReply>>;
    requestFullFrame(): Promise<DocxCommandReply>;
}
interface BuildCommandFrameInput extends Omit<DocxCommandFramePayload, 'frame' | 'pageFrames'> {
    frame: Uint8Array;
    metadata: Pick<DecodedFrameDelta, 'full' | 'frameEpoch' | 'baseFrameEpoch'>;
    pageFrames?: readonly Uint8Array[];
    coversThroughSeq: number;
}
interface DocxCommandViewportRequest {
    start: number;
    end: number;
    frameEpoch: number;
    rasterScale?: number;
}
interface DocxCommandClient {
    readonly commandGeneration: number;
    readonly commandFailure: Error | undefined;
    commandInitialGeneration(initial: DocxCommandInitReply): number | undefined;
    commandInit(request: DocxCommandInitRequest): Promise<DocxCommandInitReply>;
    edit(command: DocxCommandEnvelope): Promise<DocxCommandAck>;
    checkpoint(): Promise<ReturnType<DocxCommandMethods['checkpoint']>>;
    requestFullFrame(): Promise<DocxCommandAck>;
    requestViewport?(request: DocxCommandViewportRequest): Promise<void>;
    onFrame?(listener: (frame: DocxCommandFrame) => void): () => void;
    onFailure(listener: ((error: Error) => void) | null): void;
    destroy(): void;
}
interface DocxCommandConnection extends CommandConnection<DocxCommandPayload, DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload> {
    initial: DocxCommandInitReply;
    requestFullFrame(): Promise<DocxCommandAck>;
    requestViewport?(request: DocxCommandViewportRequest): Promise<void>;
}
type DocxWorkerEditSession<X = never> = EditSession<DocxCommandPayload, DocxCommandSelection | null, DocxEditState, X> & {
    subscribeAck?(listener: (ack: DocxCommandAck) => void): () => void;
};
type DocxWorkerEditSessionOptions<O, X> = Omit<WorkerEditSessionOptions<O, DocxCommandPayload, DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload, X>, 'connection' | 'echo' | 'requestFullFrame' | 'recovery'> & {
    connection: DocxCommandConnection;
    echo: EchoHooks<X, DocxCommandFramePayload>;
    recovery: Omit<RecoveryHooks<O, DocxCommandPayload, DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload>, 'reopen'> & {
        reopen(input: Parameters<RecoveryHooks<O, DocxCommandPayload, DocxCommandSelection | null, DocxEditState, DocxCommandFramePayload>['reopen']>[0]): Promise<DocxCommandConnection>;
    };
};
interface DocxWorkerCommandState {
    activePart?: ResidentPartTarget | null;
    readOnly: boolean;
    selection: DocxCommandSelection | null;
    storedMarks: DocxStoredMarks | null;
    stickyPositions: Map<string, YrsStickyPosition>;
    proposals?: DocxProposalRegistry;
    /** Host versions in `(from, to]`, all produced by applied remote merges and none by a local command. */
    remoteMerges?: {
        from: number;
        to: number;
    };
}
type DocxWorkerCommandEngine = ResidentEngineSession & Pick<YrsSession, 'paragraphs' | 'selectionContext' | 'storySegments' | 'cellSelection' | 'tablePayload' | 'insertText' | 'insertLineBreak' | 'replaceRange' | 'deleteRange' | 'splitParagraph' | 'toggleMark' | 'formatRange' | 'clearFormatting' | 'setParagraphAttrs' | 'applyParagraphStyle' | 'insertColumn' | 'deleteRow' | 'deleteColumn' | 'deleteTable' | 'mergeCells' | 'splitCell' | 'setCellShading' | 'beginUndoCapture' | 'canUndo' | 'canRedo'>;
type ResolvedDocxCommandSelection = {
    ok: true;
    selection: DocxCommandSelection;
    range: YrsStoryRange;
} | {
    ok: false;
    reason: string;
};

interface ResidentControlPosition {
    story: string;
    index: number;
    encoded: number[];
}
interface ResidentControlTarget {
    control: DocxContentControl;
    at: ResidentControlPosition;
}
interface ResidentControlWidget {
    kind: 'checkbox' | 'dropdown' | 'date' | 'repeatingItem';
    checked?: boolean;
    value?: string;
    items?: {
        displayText: string;
        value: string;
    }[];
}
interface ResidentControlSnapshot {
    version: string;
    frameEpoch: number | null;
    layoutRevision: number;
    controls: {
        handle: string;
        control: DocxContentControl;
        location: {
            story: string;
            index: number;
            rootStory: string;
            position: number | null;
        };
        widget: ResidentControlWidget | null;
        rects: {
            pageId: string;
            pageIndex: number;
            x: number;
            y: number;
            width: number;
            height: number;
        }[];
    }[];
}

/** @internal */
interface ResidentExactPrefixLayout {
    provisional: boolean;
    pages: number;
    /** The widest page of the whole document, while only a prefix is laid out. */
    documentWidth?: number;
}
type ResidentEngineSession = Pick<YrsSession, 'clientId' | 'applyDelete' | 'applyDeleteProfiled' | 'applyInput' | 'applyInputProfiled' | 'applyRawOps' | 'applyUpdate' | 'applyUpdateChunks' | 'paragraphs' | 'selectionContext' | 'storySegments' | 'cellSelection' | 'setCellSelection' | 'insertRow' | 'insertColumn' | 'deleteRow' | 'deleteColumn' | 'deleteTable' | 'mergeCells' | 'splitCell' | 'setCellShading' | 'setCellBorders' | 'setTableProperties' | 'insertTable' | 'insertTableFragment' | 'validateTableFragment' | 'insertImage' | 'insertPageBreak' | 'insertSectionBreak' | 'tablePayload' | 'setHyperlink' | 'setImageGeometryAt' | 'setColumnWidth' | 'insertText' | 'insertLineBreak' | 'replaceRange' | 'deleteRange' | 'splitParagraph' | 'toggleMark' | 'formatRange' | 'clearFormatting' | 'setParagraphAttrs' | 'applyParagraphStyle' | 'beginUndoCapture' | 'addUndoBoundary' | 'canUndo' | 'canRedo' | 'undo' | 'redo' | 'addComment' | 'setCommentRanges' | 'listComments' | 'acceptChange' | 'rejectChange' | 'beginRegionLayout' | 'buildDisplayListFrame' | 'buildDisplayPagesFrame' | 'releaseDisplayPagesFrame' | 'clearFonts' | 'destroy' | 'encodeSelection' | 'encodeStateAsUpdate' | 'encodeStateAsUpdateChunks' | 'encodeStateVector' | 'findContentControls' | 'listContentControls' | 'layoutDocumentJson' | 'layoutFontRequirementsJson' | 'layoutDocumentWithRegionsRetainedJson' | 'layoutDocumentWithRegionsRetainedMeta' | 'retainedLayoutJson' | 'loadMediaSources' | 'loadNoteSeparators' | 'loadState' | 'setPartialDocument' | 'measureParagraphJson' | 'onUpdate' | 'outlineGlyphJson' | 'registerFont' | 'registerSubstituteFont' | 'residentCaretSnapshot' | 'residentDeletedUnits' | 'resumeRegionLayout' | 'selection' | 'selectionText' | 'resolveComment' | 'searchText' | 'encodeStickyPosition' | 'resolveStickyPosition' | 'setDisplayRetainBuiltPages' | 'setDisplayWindow' | 'setSelection' | 'readStories' | 'listStories' | 'storiesChangedSince' | 'yrsBlocksForStory'> & {
    /** Moves an inline embed in one transaction. Internal: concurrent moves would duplicate it, so collaboration never reaches it. */
    moveEmbed(at: YrsLoc, to: YrsLoc): YrsReplaceReceipt;
    setUndoInputTime(span: readonly [first: number, last: number] | null): void;
    splitSection(at: YrsLoc, properties: SectionProperties, start: NonNullable<SectionProperties['sectionStart']>): YrsLoc;
    /**
     * Display ranges of the paragraphs, tables and block controls of `root` that `ranges` touch.
     * A paragraph's `length` counts story units; its inline `controls` give each node's story
     * offset and display range. `selection` maps both ends to display positions.
     */
    storyGeometry(root: string, ranges: Array<[number, number]>, selection?: [YrsLoc, YrsLoc]): {
        paragraphs: Array<{
            story: string;
            paraId: string;
            index: number;
            from: number;
            to: number;
            leading: number;
            length: number;
            controls?: Array<{
                offset: number;
                from: number;
                to: number;
            }>;
        }>;
        tables: Array<{
            story: string;
            tableIndex: number;
            from: number;
            to: number;
            at: YrsLoc;
            cells: Array<{
                story: string;
                paraId: string;
                row: number;
                column: number;
                rowspan: number;
                colspan: number;
                from: number;
                to: number;
            }>;
        }>;
        controls: Array<{
            story: string;
            contentStory: string;
            from: number;
            to: number;
        }>;
        selection: [number, number] | null;
    };
    /** Rects of the resident display list for each `[from, to)` range of one region, in order. */
    storyRangeRects(region: DisplayListHitRegion, partId: string, ranges: readonly (readonly [number, number])[]): DisplayListRect[][];
    clearCellSelection(): YrsLoc | null;
    controlTargets(): ResidentControlTarget[];
    repeatControlAt(at: ResidentControlPosition, remove: boolean): boolean;
    setControlValue(at: ResidentControlPosition, value: YrsContentControlValue): void;
    partDocument(): Document;
    setPartDocument(document: Document, removeStories?: string[]): boolean;
    partStory(relationshipId: string): string;
    partGeometry(frame: RetainedFrame): ResidentPartGeometry[];
    propertyDocument(): Document;
    /** The `w:next` style a paragraph break at `at` gives the new paragraph, or null to keep the split's own. */
    nextParagraphStyle(at: YrsLoc): string | null;
    setPropertyDocument(document: Document): boolean;
    sectionProperties(): ResidentSectionSnapshot;
    setSectionMargins(section: string, margins: DocxSectionMargins): boolean;
    updateComment(id: string, patch: DocxCommentPatch): void;
    commentProjection(fresh?: boolean): ResidentCommentProjection | null;
    /** Seeds the opened package's comment metadata, unless the session joined from a peer's state. */
    initializeComments(recovery?: ResidentCommentRecoveryState): void;
    commentRecoveryState?(): ResidentCommentRecoveryState;
    mediaDataUrl(token: string): string | null;
    /** The pictures whose display copy is SVG, which a worker cannot decode. */
    svgMedia?(): DocxSvgMedia[];
    /** @internal Typing echo model of one font at one shaping size; see `echo_glyph_set_json`. */
    echoGlyphSetJson(fontId: number, size: number, kern: boolean, alphabet: string): string;
    /** @internal */
    proposalEngine: DocxProposalSession & Pick<YrsSession, 'validateEdits'>;
    /** @internal */
    geometryReader: ProposalGeometryReader & DocxSidebarReader;
    /** @internal The segments of the story's paragraphs at `indices`, each ending with its pilcrow. */
    paragraphSegments(story: string, indices: readonly number[]): YrsStorySegment[][];
    /** @internal Index of the first paragraph of `story` with `paraId`, in `paragraphSpans` order, or -1. */
    paragraphUnit(story: string, paraId: string): number;
    /** @internal Ids of the tracked changes of `at.story` whose range holds `at`, in `listRevisions` order. */
    revisionIdsAt(at: YrsLoc): string[];
    /** @internal */
    paragraphIdentities(): DocxParagraphIdentitySnapshot;
    /** @internal */
    exportStructuredWithPagesJson(options: DocxPageExportOptions, currentRequest: string): string;
    /** The region layout of only as much of the body as fills `pages` pages. */
    layoutDocumentWithRegionsPrefixRetainedJson(input: string, pages: number): string;
    /**
     * @internal The retained region layout of exactly the first `pages` pages when nothing later
     * can change them (`provisional`), or of the whole document.
     */
    layoutDocumentWithRegionsExactPrefixRetained(input: string, pages: number): ResidentExactPrefixLayout;
    /** Limit incremental rebuilds to the display window and caret pages. Off by default. */
    setWindowedIncrementalBuilds(enabled: boolean): void;
    /** @internal */
    setDirectBatches(enabled: boolean): void;
    /** @internal */
    directBatchesApplied(): number;
    /** @internal */
    markProjectionStories(stories: readonly string[]): void;
    /** Whether a remote update is held until the one it depends on arrives. */
    hasPendingUpdate(): boolean;
    /** Parses and seeds a DOCX; returns the host metadata JSON the main thread decodes. */
    openDocx(bytes: Uint8Array, digest?: string, generation?: string, seedStories?: boolean): string;
    /** With `initialUpdate`, the shared state replaces the package's stories. */
    openSourceDocx(bytes: Uint8Array, options: {
        digest?: string;
        generation?: string;
        mediaTokens?: boolean;
        initialUpdate?: Uint8Array;
        state?: Uint8Array;
    }): string;
    decodeFont(bytes: Uint8Array): Uint8Array;
    openDocument(document: Document, options: {
        generation?: string;
        mediaTokens?: boolean;
        initialUpdate?: Uint8Array;
    }): void;
    saveDocument(host: Document | undefined, comments: Comment[], record: ResidentSaveRecord): Promise<ArrayBuffer>;
    /** Opens a display-only preview with a block limit and optional paragraph budget; null when refused. */
    openDocxPreview(bytes: Uint8Array, blocks: number, paragraphBudget?: number): string | null;
    /** The whole document state as one yrs v1 update. */
    encodeState(): Uint8Array;
    encodePeerMetadata?(): Uint8Array;
    /** Tracked changes in the document, leaving out the revisions in `excluding`. */
    revisionCount(excluding?: ReadonlySet<string>): number;
    /** The retained region layout pass without serializing its reply. */
    layoutDocumentWithRegionsRetained(input: string): void;
    /** The region pass after one edit, resident when that edit was a plain text edit. */
    layoutDocumentWithRegionsAfterEdit(input: string): void;
    /** The retained region layout's `headersFooters` JSON, when it has any. */
    retainedHeadersFootersJson(): string | undefined;
    /** @internal */
    save(source: Uint8Array, hostJson: string, host: Document | undefined, comments: Comment[], record: ResidentSaveRecord, stories?: readonly string[]): Promise<ArrayBuffer>;
};

interface DocxRangeHighlights {
    version: string;
    layoutRevision: number;
    frameEpoch: number;
    rects: Array<Array<DisplayListRect & {
        pageId: string;
    }>>;
    unbuiltPages: number[];
}

interface DocxPresencePeer {
    clientId: number;
    clock: number;
    cursor?: {
        story: string;
        anchor: Uint8Array;
        head: Uint8Array;
    };
    inferred?: {
        story: string;
        paraId: string;
        offset: number;
    };
}
interface DocxPresenceGeometry {
    version: string;
    layoutRevision: number;
    frameEpoch: number;
    peers: Array<{
        clientId: number;
        clock: number;
        status: 'ok' | 'unresolved';
        caret: (DisplayListRect & {
            pageId: string;
        }) | null;
        rects: Array<DisplayListRect & {
            pageId: string;
        }>;
    }>;
}
interface ResidentCollaborationUpdates {
    updates: ArrayBuffer[];
    inferences: Array<{
        seq: number;
        insertion: CollaborationTextInsertion;
    }>;
    /** This session's own state-vector clock after the drained edits and merges. */
    clock: number;
    /** Output of the providers this worker runs, for the threads that own their transports. */
    pipe?: PipeOutputBatch[];
}

type ResidentPropertyTarget = {
    kind: 'section';
    section: string;
} | {
    kind: 'watermark';
} | {
    kind: 'hyperlink';
    selection: DocxCommandSelection;
} | {
    kind: 'objectSelection';
    selection: DocxCommandSelection;
} | {
    kind: 'object';
    at?: YrsLoc;
    handle?: string;
} | {
    kind: 'tableSelection';
    selection: DocxCommandSelection;
};
type ResidentPropertySnapshot = {
    kind: 'section';
    section: string;
    properties: SectionProperties;
} | {
    kind: 'watermark';
    watermark: Watermark | null;
} | {
    kind: 'hyperlink';
    range: YrsStoryRange;
    hyperlink: YrsHyperlinkAttrs | null;
} | {
    kind: 'object';
    handle: string;
    properties: Record<string, unknown>;
} | {
    kind: 'table';
    properties: {
        width?: number | null;
        widthType?: string | null;
        justification?: 'left' | 'center' | 'right' | null;
    };
};

interface DocxToolbarMetadata {
    styles: ResolvedStyleOption[];
    fontFamilies: string[];
}

/** @internal */
interface DocxResolvedPointPosition extends PointPosition {
    version: string;
    target: {
        kind: 'range';
    } & DocxTextRange;
}

/** @internal How far a selection grows around a display position. */
type DocxSelectionUnit = 'word' | 'paragraph' | 'story';
/** @internal A selection in the display positions of one root story's layout. */
interface DocxDisplayRange {
    anchor: number;
    head: number;
}
/** @internal The text a display selection covers. */
interface DocxDisplaySelectionText {
    /** Plain text as the clipboard takes it: tabs and breaks as characters, tables as tab-separated rows. */
    text: string;
    /** The accepted-view range, or null when the selection spans stories. */
    range: DocxTextRange | null;
}
interface DocxDisplaySelectionInfo {
    paraId: string | null;
    selectedText: string;
    paragraphText: string;
    before: string;
    after: string;
}

/** @internal */
interface DocxFindDisplayMatch {
    paragraphIndex: number;
    contentIndex: number;
    startOffset: number;
    endOffset: number;
    text: string;
    displayFrom: number;
    displayTo: number;
    yrsRange: YrsStoryRange;
}
/** @internal */
declare function findBodyMatches(reader: Pick<YrsSession, 'paragraphs'>, locToDisplayPosition: (loc: YrsLoc) => number | null, searchText: string, options: FindOptions): DocxFindDisplayMatch[];

/** @internal */
interface ResidentSearchMatch {
    story: string;
    paraId: string;
    start: number;
    displayFrom: number;
    displayTo: number;
}
/** @internal */
interface ResidentSearchResult {
    matches: ResidentSearchMatch[];
    carried: number;
}

/** A paragraph the legacy paragraph finder matched, with the handle the paragraph helpers take. */
interface DocxParagraphMatch {
    paraId: string;
    match: string;
    before: string;
    after: string;
}
/** @internal */
interface DocxFindParagraphsOptions {
    caseSensitive?: boolean;
    limit?: number;
}
/** @internal */
declare function findParagraphs(reader: {
    storyIds(): string[];
    paragraphs(story: string): Array<{
        paraId: string;
        text: string;
    }>;
}, query: string, options?: DocxFindParagraphsOptions): DocxParagraphMatch[];

/** Resolved styling for the worker-painted caret (the worker cannot read CSS vars). */
interface ResidentCaretPaintStyle {
    color: string;
    /** CSS-px stroke width, matching the DOM caret's un-zoomed width. */
    width: number;
}
/** Device-px caret rect: geometry scales by dpr*zoom, stroke width by dpr only
 * (the DOM caret keeps its CSS-px width across zoom levels). */
declare function residentCaretDeviceRect(rect: Pick<YrsResidentCaretRect, 'x' | 'y' | 'height'>, style: ResidentCaretPaintStyle, devicePixelRatio: number, zoom: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
declare function residentCaretSnapshotForFrame(snapshot: YrsResidentCaretSnapshot, frame: RetainedFrame): YrsResidentCaretSnapshot | null;

interface DocxSourcePreviewOptions extends Partial<Pick<DocxCommandInitRequest, 'fonts' | 'fontRegistrationSlots' | 'layoutInput' | 'extras' | 'displayWindow'>> {
    pages?: number;
}
type DocxSourceOpenRequest = ({
    document: Document;
    bytes?: never;
} | {
    bytes: Uint8Array;
    document?: never;
}) & {
    preview?: boolean | DocxSourcePreviewOptions;
    /** Opens a display-only cut of the first body blocks of `bytes`; a later whole open replaces it. */
    cut?: {
        blocks: number;
        paragraphBudget?: number;
    };
    mediaTokens?: boolean;
    heapLimitBytes?: number;
    generation?: string;
    digest?: string;
    /**
     * One replica seeds from bytes; joiners pass `initialUpdate`. Two seeds merge by story last-writer-wins.
     * `clientClock` is the highest clock of `clientId` the caller has held. A seed would write that id's clocks again
     * and a joined state behind it would reuse later ones, so either opens under a fresh client id.
     */
    collaboration?: {
        clientId: number;
        initialUpdate?: Uint8Array;
        clientClock?: number;
    };
    /** Yrs state restored over the unseeded package of `bytes`, such as a command checkpoint. */
    state?: Uint8Array;
};

/** @internal */
interface ResidentEngineWorkerFontSync {
    fontsBaseRevision?: number;
}
/** @internal */
type ResidentProposalOperation = {
    kind: 'propose';
    request: DocxProposalRequest;
    peerStateVector?: Uint8Array;
} | {
    kind: 'setStates';
    request: DocxProposalStateRequest;
    peerStateVector?: Uint8Array;
} | {
    kind: 'withdraw';
    request: DocxProposalWithdrawRequest;
    peerStateVector?: Uint8Array;
} | {
    kind: 'removeComment';
    id: string;
} | {
    kind: 'snapshot';
};
/** @internal */
interface ResidentProposalResponse {
    result?: DocxProposalResult;
    mirror: {
        version: string;
        proposals: DocxProposalRegistryState;
    };
    changedStories: string[];
    projectionStories?: string[];
    updates: ArrayBuffer[];
    peerDiff?: ArrayBuffer;
    stateVector: ArrayBuffer;
    geometry: ProposalGeometryMirror;
    fontRequirements?: {
        layoutInput: string;
        requirementsJson: string;
    };
}
/** @internal */
type DocxDocumentRead = {
    kind: 'collabStateVector';
} | {
    kind: 'collabDiff';
    stateVector?: Uint8Array;
} | {
    kind: 'collabDiffChunks';
    stateVector: Uint8Array;
    maxChunkBytes: number;
} | {
    kind: 'collabPresence';
    peers: DocxPresencePeer[];
    pages: [number, number];
    expectVersion: string;
    expectFrameEpoch: number;
    expectLayoutRevision: number;
} | {
    kind: 'validateEdits';
    request: DocxEditRequest;
} | {
    kind: 'contentControlHandles';
} | {
    kind: 'partSnapshot';
} | {
    kind: 'properties';
    target: ResidentPropertyTarget;
} | {
    kind: 'sectionProperties';
} | {
    kind: 'exportStructuredWithPages';
    options: DocxPageExportOptions;
    currentRequest: string;
    workerFonts?: boolean;
} | {
    kind: 'listContentControls';
    options: DocxContentControlsOptions;
} | {
    kind: 'findContentControls';
    query: DocxContentControlQuery;
    options: DocxContentControlsOptions;
} | {
    kind: 'rangeHighlights';
    ranges: YrsStoryRange[];
    expectVersion: string;
    expectFrameEpoch?: number;
    expectLayoutRevision?: number;
} | {
    kind: 'reviewSnapshot';
    expectPreviewVersion?: number;
} | {
    kind: 'commentInsertionRange';
    paraId: string;
    search?: string;
} | {
    kind: 'commentSelectionRange';
    selection: DocxCommandSelection;
} | {
    kind: 'toolbarMetadata';
} | {
    kind: 'paragraphIdentities';
} | {
    kind: 'resolveParagraphAnchors';
    anchors: DocxParagraphAnchor[];
} | {
    kind: 'readParagraphs';
    request: DocxReadParagraphsRequest;
} | {
    kind: 'rawSelectionInfo';
    selection: DocxCommandSelection;
} | {
    kind: 'clipboardSlice';
    selection: DocxCommandSelection;
} | {
    kind: 'listStories';
} | {
    kind: 'readStories';
    request: DocxReadStoriesRequest;
} | {
    kind: 'findText';
    request: DocxFindTextRequest;
} | {
    kind: 'findMatches';
    searchText: string;
    options: FindOptions;
    expectVersion: string;
} | {
    kind: 'searchText';
    query: string;
    caseSensitive: boolean;
    carry?: YrsStickyPosition | null;
} | ({
    kind: 'findParagraphs';
    query: string;
} & DocxFindParagraphsOptions) | {
    kind: 'stickyAnchors';
    locs: YrsLoc[];
    version: string;
} | {
    kind: 'navigationTarget';
    story: string;
    paraId: string;
} | {
    kind: 'bookmarkTarget';
    story: string;
    name: string;
} | {
    kind: 'anchorTargets';
    targets: Exclude<AnchorGeometryTarget, {
        kind: 'proposal';
    }>[];
} | {
    kind: 'reviewTarget';
    target: DocxReviewTarget;
} | {
    kind: 'pointPosition';
    hit: PointPosition;
    expectVersion: string;
    nativePoint?: DocxSelectionPointIntent;
} | {
    kind: 'selectionUnit';
    story: string;
    position: number;
    unit: DocxSelectionUnit;
    expectVersion: string;
} | {
    kind: 'selectionText';
    story: string;
    anchor: number;
    head: number;
    expectVersion: string;
} | {
    kind: 'selectionInfo';
    story: string;
    anchor: number;
    head: number;
    expectVersion: string;
} | {
    kind: 'paragraphTarget';
    story: string;
    paraId: string;
    expectVersion: string;
} | {
    kind: 'commentTarget';
    story: string;
    commentId: string;
    expectVersion: string;
} | {
    kind: 'revisionTarget';
    story: string;
    revisionId: string;
    expectVersion: string;
} | {
    kind: 'bookmarkPosition';
    story: string;
    name: string;
    expectVersion: string;
} | {
    kind: 'sidebar';
    commentIds: string[];
    expectVersion: string;
} | {
    kind: 'headings';
    expectVersion: string;
} | {
    kind: 'adjacentRevision';
    selection: DocxCommandSelection | null;
    direction: 'next' | 'previous';
};
/** @internal */
interface DocxDocumentReadValues {
    collabStateVector: Uint8Array;
    collabDiff: Uint8Array;
    collabDiffChunks: Uint8Array[];
    collabPresence: DocxPresenceGeometry | null;
    validateEdits: DocxValidationResult;
    contentControlHandles: ResidentControlSnapshot;
    partSnapshot: {
        metadata: ResidentPartMetadata;
        geometry: ResidentPartGeometry[];
        frameEpoch: number | null;
        layoutRevision: number;
    };
    properties: ResidentPropertySnapshot | null;
    sectionProperties: ResidentSectionSnapshot;
    exportStructuredWithPages: string;
    listContentControls: DocxContentControlsResult;
    findContentControls: DocxContentControlsResult;
    rangeHighlights: DocxRangeHighlights | null;
    reviewSnapshot: DocxReviewSnapshot | null;
    commentInsertionRange: ResidentCommentInsertionRange;
    commentSelectionRange: YrsStoryRange | null;
    toolbarMetadata: DocxToolbarMetadata;
    paragraphIdentities: DocxParagraphIdentitySnapshot;
    resolveParagraphAnchors: {
        results: DocxParagraphAnchorResult[];
    };
    readParagraphs: DocxReadParagraphsResult;
    rawSelectionInfo: YrsSelectionText;
    clipboardSlice: DocxClipboardSlice;
    listStories: DocxListStoriesResult;
    readStories: DocxReadStoriesResult;
    findText: DocxFindTextResult;
    findMatches: DocxFindDisplayMatch[] | null;
    navigationTarget: ReturnType<typeof resolveNavigationTarget>;
    bookmarkTarget: {
        loc: YrsLoc;
        position: number;
    } | null;
    anchorTargets: ProposalGeometryTarget[];
    reviewTarget: DocxReviewTargetRanges | null;
    searchText: ResidentSearchResult;
    findParagraphs: DocxParagraphMatch[];
    stickyAnchors: Array<YrsStickyPosition | null>;
    pointPosition: DocxResolvedPointPosition | null;
    selectionUnit: DocxDisplayRange | null;
    selectionText: DocxDisplaySelectionText | null;
    selectionInfo: DocxDisplaySelectionInfo | null;
    paragraphTarget: DocxDisplayRange | null;
    commentTarget: DocxDisplayRange | null;
    revisionTarget: DocxDisplayRange | null;
    bookmarkPosition: number | null;
    sidebar: DocxSidebarRead | null;
    headings: DocxOutlineHeading[] | null;
    adjacentRevision: {
        revisionId: string;
    } | null;
}
/** @internal */
type DocxEngineWorkerHostModule = {
    type: 'editModule';
    module: WebAssembly.Module | null;
};
type DocxEngineWorkerRequest = {
    id: number;
    type: 'warm';
    hostModule?: true;
} | {
    id: number;
    type: 'openSource';
    source: DocxSourceOpenRequest;
} | {
    id: number;
    type: 'previewSource';
    preview: DocxSourcePreviewOptions & {
        layoutInput: string;
    };
} | {
    id: number;
    type: 'commandInit';
    request: DocxCommandInitRequest;
} | {
    id: number;
    type: 'edit';
    command: DocxCommandEnvelope;
} | {
    id: number;
    type: 'checkpoint';
} | {
    id: number;
    type: 'requestFullFrame';
} | {
    id: number;
    type: 'commandUpdate';
    update: Uint8Array;
} | {
    id: number;
    type: 'commandViewport';
    request: DocxCommandViewportRequest;
} | {
    id: number;
    type: 'bootstrap';
    snapshot: YrsResidentWorkerSnapshot;
    extras: string;
    expectedFrameEpoch: number;
    layoutExtras?: string;
    layoutReply?: 'meta';
    headersFootersEpoch?: number;
    /** Pages `[start, end)` a full build compiles; the rest stay unbuilt. */
    displayWindow?: [number, number];
    retainBuiltPages?: boolean;
    /**
     * Lay out only as much of the body as fills this many pages; a reply
     * marked `layoutProvisional` is finished by `completeLayout`.
     */
    provisionalPages?: number;
    /**
     * The document replaces the one this worker showed, which the host
     * hands over from: keep the attached page surfaces for its pages.
     */
    keepSurfaces?: boolean;
    /** Lay out the document `open` seeded here, not the snapshot's state. */
    opened?: boolean;
    /** The most the worker's editing core may allocate at once. */
    heapLimitBytes?: number;
} | {
    id: number;
    type: 'open';
    /** The DOCX package, parsed and seeded in a fresh session here. */
    bytes: ArrayBuffer;
    /** The package's SHA-256, when the caller already took it. */
    digest?: string;
    generation?: string;
    /** The most the worker's editing core may allocate at once. */
    heapLimitBytes?: number;
    /**
     * Opens a display-only preview of the first `previewBlocks` body blocks instead. A later
     * `open` of the whole document replaces it.
     */
    previewBlocks?: number;
    /** Optional paragraph weight budget for the display-only body cut. */
    previewParagraphBudget?: number;
} | {
    id: number;
    type: 'fontRequirements';
    layoutInput: string;
} | {
    id: number;
    type: 'layoutJson';
    layoutRevision: number;
} | {
    id: number;
    type: 'encodeState';
    peerMetadata?: true;
} | {
    id: number;
    type: 'save';
    comments: Comment[];
    /** `host` when `comments` is the host's list and wins over the worker's own comments. @internal */
    commentsSource?: 'host';
    host?: Document;
    stateVector?: Uint8Array;
    /** The editor peer's marked stories. @internal */
    stories?: readonly string[];
} | {
    id: number;
    type: 'syncUpdate';
    update: Uint8Array;
    stateVector: Uint8Array;
} | {
    id: number;
    type: 'revisionCount';
} | {
    id: number;
    type: 'proposal';
    operation: ResidentProposalOperation;
} | {
    id: number;
    type: 'documentRead';
    read: DocxDocumentRead;
    /** Answered `superseded` instead when the document's version differs. */
    expectVersion?: string;
} | {
    id: number;
    type: 'sync';
    snapshot: YrsResidentWorkerSnapshot;
    extras: string;
    expectedFrameEpoch: number;
    paintCaret: boolean;
    /**
     * Display extras without the header/footer payload. When present, the
     * snapshot's layout is authoritative: the worker completes the extras
     * from the layout it runs and returns that layout as `layoutJson`.
     */
    layoutExtras?: string;
    layoutReply?: 'meta';
    headersFootersEpoch?: number;
    displayWindow?: [number, number];
    retainBuiltPages?: boolean;
    provisionalPages?: number;
} | {
    id: number;
    type: 'buildPages';
    pages: number[];
    expectedFrameEpoch: number;
    paintCaret: boolean;
    background?: boolean;
    /** Pictures the host decoded after `commandInit`; the displayed pages repaint with them. Transferred. */
    hostImages?: DocxHostImage[];
    /** The command session `hostImages` were decoded for; any other session closes them unused. */
    hostImagesFor?: {
        session: string;
        incarnation: number;
        epoch: number;
    };
} | {
    id: number;
    type: 'releasePages';
    pages: Array<{
        index: number;
        pageId: string;
    }>;
    expectedFrameEpoch: number;
    paintCaret: boolean;
} | {
    id: number;
    type: 'completeLayout';
    expectedFrameEpoch: number;
    paintCaret: boolean;
    /**
     * Measure the rest this many body blocks a step to start with, letting
     * requests that arrive meanwhile run between steps; absent, in one step.
     */
    sliceBlocks?: number;
} | {
    id: number;
    type: 'buildFrame';
    extras: string;
    expectedFrameEpoch: number;
    paintCaret: boolean;
    displayWindow?: [number, number];
    retainBuiltPages?: boolean;
} | {
    id: number;
    type: 'applyInput';
    text: string;
    selection: YrsSelection;
    expectedFrameEpoch: number;
    profile: boolean;
    paintCaret: boolean;
    displayWindow?: [number, number];
    retainBuiltPages?: boolean;
} | {
    id: number;
    type: 'applyDelete';
    direction: 'backward' | 'forward';
    count: number;
    selection: YrsSelection;
    expectedFrameEpoch: number;
    profile: boolean;
    paintCaret: boolean;
    displayWindow?: [number, number];
    retainBuiltPages?: boolean;
} | {
    id: number;
    type: 'applyUpdate';
    update: Uint8Array;
    selection: YrsSelection | null;
} | {
    id: number;
    type: 'attachCanvases';
    pages: Array<{
        pageId: string;
        canvas: OffscreenCanvas;
    }>;
    activePageIds: string[];
    devicePixelRatio: number;
    zoom: number;
    caretStyle: ResidentCaretPaintStyle;
} | {
    id: number;
    type: 'eraseCaret';
} | {
    id: number;
    type: 'destroy';
};
type ResidentEngineWorkerRequestWithoutId = DocxEngineWorkerRequest extends infer Request ? Request extends {
    id: number;
} ? Omit<Request, 'id'> : never : never;
type DocxEngineWorkerResponse = ({
    id: number;
    ok: true;
    commandInitial?: DocxCommandInitReply;
    commandAck?: DocxCommandAck;
    commandFrame?: {
        session: string;
        incarnation: number;
        epoch: number;
        frame: DocxCommandFrame;
    };
    fontEnvironmentEvent?: DocxFontEnvironmentEvent & {
        session: string;
        incarnation: number;
        epoch: number;
    };
    fontEnvironment?: DocxFontEnvironmentSnapshot;
    checkpoint?: Checkpoint;
    frame?: ArrayBuffer;
    pageFrames?: ArrayBuffer[];
    pageBuildSuperseded?: boolean;
    superseded?: true;
    updates?: ArrayBuffer[];
    engineMs?: number;
    workerTotalMs?: number;
    engineProfile?: YrsEngineApplyProfile;
    caret?: YrsResidentCaretSnapshot;
    selection?: YrsSelection | null;
    /** The same selection as sticky positions, for the host to resolve against its content. */
    selectionCursor?: CollaborationCursor | null;
    /** The presented frame carries the worker-painted caret line. */
    caretPainted?: boolean;
    replayMs?: number;
    replayedPages?: number;
    layoutRevision?: number;
    /** The document version the frame lays out. */
    documentVersion?: string;
    documentPreview?: boolean;
    /** The frame lays out the whole document as opened, before any change. */
    documentAsOpened?: boolean;
    /** Characters an applyDelete removed. */
    deletedUnits?: number;
    /** The worker replica's yrs state vector after this operation, so the
     * next sync can ship a diff instead of the whole document state. */
    stateVector?: ArrayBuffer;
    /** The region layout the worker ran, for a request carrying `layoutExtras`. */
    layoutJson?: string;
    layoutMeta?: LayoutMetaV1 | {
        v: number;
    };
    layoutJsonStatus?: 'ok' | 'stale';
    /** `layoutJson` covers only the first pages of the body. */
    layoutProvisional?: boolean;
    /** An `open` reply: the opened package's host metadata JSON. */
    hostJson?: string;
    sourceDocument?: Document;
    /** An `openSource` reply: SVG pictures for the host to decode. */
    svgMedia?: DocxSvgMedia[];
    /** An `openSource` reply: the client id the opened replica writes with. */
    clientId?: number;
    /** An `openSource` reply: the opened state's clock for `clientId`. */
    clientClock?: number;
    /** An `open` reply: the package cannot open as a preview; nothing was opened. */
    previewRefused?: boolean;
    /** A `fontRequirements` reply. */
    requirementsJson?: string;
    /** An `encodeState` reply: the document state as one yrs v1 update. */
    state?: ArrayBuffer;
    peerMetadata?: ArrayBuffer;
    peerMetadataReason?: string;
    /** @internal */
    saved?: ArrayBuffer;
    revisionCount?: number;
    /** @internal */
    proposals?: DocxProposalRegistryState;
    /** @internal */
    version?: string;
    repair?: ArrayBuffer | null;
    /** @internal */
    proposal?: ResidentProposalResponse;
    /** @internal */
    read?: {
        version: string;
        value: unknown;
    };
    /** Sent with id 0 while the request with this id is still working. */
    progress?: number;
} | {
    id: number;
    ok: false;
    error: string;
    commandError?: ReplyError;
    failureCode?: SessionFailureCode;
    /** @internal */
    code?: 'save-unavailable' | 'cut-kept';
    residentUnavailable?: boolean;
    /** A wasm trap poisoned the worker; it refuses every later request. */
    terminal?: boolean;
    /** The trap followed an allocation the worker's memory could not satisfy. */
    outOfMemory?: boolean;
}) & {
    collabUpdates?: ResidentCollaborationUpdates & {
        session?: string;
        incarnation?: number;
        epoch?: number;
    };
    /** The worker's wasm memories as the reply left. */
    memory?: WasmModuleMemory[];
};

/**
 * Decodes the host metadata a resident worker's `open` replied with, for the
 * package `source` it opened. @internal
 */
declare function decodeDocxHostJson(json: string, source: Uint8Array): YrsDocxHost;

/** Page and section breaks split paragraphs, which suggesting mode cannot track. */
declare function breakRefusedWhileSuggesting(kind: string, suggesting: boolean): boolean;

interface TableDeleteReader {
    paragraphSpans(story: string): readonly YrsParagraphLength[];
    paragraphSegments(story: string, indices: readonly number[]): YrsStorySegment[][];
}
/** @internal */
declare function tableBoundaryDeleteTarget(reader: TableDeleteReader, at: YrsLoc, direction: 'backward' | 'forward'): YrsLoc | null;

/** @internal */
interface ResidentProposalReply extends Omit<ResidentProposalResponse, 'updates' | 'stateVector' | 'peerDiff'> {
    updates: Uint8Array[];
    peerDiff?: Uint8Array;
    stateVector: Uint8Array;
}
interface ResidentEngineWorkerFrame {
    commandInitial?: DocxCommandInitReply;
    frame: Uint8Array;
    pageFrames?: Uint8Array[];
    updates: Uint8Array[];
    engineMs: number;
    workerTotalMs: number;
    engineProfile?: YrsEngineApplyProfile;
    caret: YrsResidentCaretSnapshot;
    selection: YrsSelection | null;
    /** The same selection as sticky positions, for the host to resolve against its content. */
    selectionCursor?: CollaborationCursor | null;
    /** The presented frame carries the worker-painted caret line. */
    caretPainted: boolean;
    replayMs: number;
    replayedPages: number;
    layoutRevision: number;
    /** The worker document version the frame lays out. */
    documentVersion?: string;
    documentPreview?: boolean;
    documentAsOpened?: boolean;
    /** Characters an applyDelete removed. */
    deletedUnits: number;
    /** The region layout the worker ran, when the request handed it the layout. */
    layoutJson?: string;
    layoutMeta?: LayoutMetaV1 | {
        v: number;
    };
    /** `layoutJson` covers only the first pages; `completeLayout` finishes it. */
    layoutProvisional?: boolean;
}
/** A bootstrap/sync whose snapshot layout the worker runs as the only layout. */
interface ResidentEngineWorkerLayoutOptions {
    /** Display extras minus the header/footer payload the worker's layout supplies. */
    layoutExtras?: string;
    layoutReply?: 'meta';
    headersFootersEpoch?: number;
    /** The host state vector the snapshot brings the worker to. */
    stateVector?: Uint8Array;
    /** Lay out just the body's first pages before replying. */
    provisionalPages?: number;
    /** Bootstrap only: lay out the document {@link ResidentEngineWorkerClient.open} opened. */
    opened?: boolean;
    /** Bootstrap only: the epoch of the frame the host shows; the worker's frames follow it. */
    frameEpoch?: number;
    /**
     * Bootstrap only: the most the worker's editing core may allocate at once.
     * An allocation past it stops the worker with {@link ResidentWorkerOutOfMemoryError}.
     */
    heapLimitBytes?: number;
}
/** What an {@link ResidentEngineWorkerClient.open} seeded in the worker. */
interface ResidentEngineWorkerOpened {
    /** The package's host metadata JSON, for `decodeDocxHostJson`. */
    hostJson: string;
    /** The worker replica's state vector once seeded. */
    stateVector: Uint8Array;
}
/** How a bootstrap or sync builds its frame. */
interface ResidentEngineWorkerSnapshotOptions {
    /** Pages `[start, end)` the frame builds; the rest stay unbuilt. */
    displayWindow?: [number, number];
}
interface ResidentEngineOffscreenPage {
    pageId: string;
    canvas: OffscreenCanvas;
}
interface ResidentEngineWorkerApplyResult extends ResidentEngineWorkerFrame {
    applied: true;
}
type PendingRequest = {
    type: AwaitedRequest['type'];
    resolve(response: DocxEngineWorkerResponse & {
        ok: true;
    }): void;
    reject(error: Error): void;
};
type AwaitedRequest = Exclude<ResidentEngineWorkerRequestWithoutId, {
    type: 'applyUpdate' | 'eraseCaret' | 'destroy';
}>;
interface ResidentEngineWorkerPort {
    onmessage: ((event: MessageEvent<DocxEngineWorkerResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    onmessageerror: ((event: MessageEvent) => void) | null;
    postMessage(message: DocxEngineWorkerRequest | DocxEngineWorkerHostModule, transfer?: Transferable[]): void;
    terminate(): void;
}
/** Dedicated-worker owner for resident input, pagination, and FrameDelta output. */
declare class ResidentEngineWorkerClient implements DocxCommandClient {
    protected readonly worker: ResidentEngineWorkerPort;
    protected readonly pending: Map<number, PendingRequest>;
    private watchdog;
    private nextId;
    protected terminalError: Error | null;
    private commandSession;
    private commandGenerationValue;
    private readonly commandInitialGenerations;
    private commandReplacementPending;
    private ready;
    protected revision: number;
    protected documentSequence: number;
    private remoteVector;
    private appliedFontsRevision;
    protected bootstrapped: boolean;
    /** Set once `open` is sent, with the heap limit it opened under. */
    protected openedHeapLimit: {
        bytes?: number;
    } | null;
    private bootstraps;
    /** The font-requirements read still in flight, shared while nothing was posted after it. */
    private fontRead;
    /** Id of the last snapshot request sent; replies to earlier requests must
     * not replace the state it recorded. */
    private lastSnapshotId;
    private lastFailedFontsSnapshotId;
    private keepSurfaces;
    private bootstrapWaiters;
    private lastMemory;
    private answeredFrameEpoch;
    private retainBuiltPages;
    private failureListener;
    private readonly frameListeners;
    private readonly pipeListeners;
    private readonly collabListeners;
    protected commandIdentity: {
        session: string;
        incarnation: number;
        epoch: number;
    } | null;
    constructor(worker?: ResidentEngineWorkerPort);
    isReady(): boolean;
    get commandGeneration(): number;
    get commandFailure(): Error | undefined;
    commandInitialGeneration(initial: DocxCommandInitReply): number | undefined;
    commandInit(request: DocxCommandInitRequest): Promise<DocxCommandInitReply>;
    edit(command: DocxCommandEnvelope): Promise<DocxCommandAck>;
    checkpoint(): Promise<DocxCommandCheckpoint>;
    requestFullFrame(): Promise<DocxCommandAck>;
    /** Hands the worker pictures the host decoded after `commandInit`; the displayed pages repaint with them. */
    provideHostImages(images: DocxHostImage[]): Promise<void>;
    requestViewport(request: DocxCommandViewportRequest): Promise<void>;
    onFrame(listener: (frame: DocxCommandFrame) => void): () => void;
    /** Output of the collaboration providers the worker runs, per provider, in order. */
    onCollabPipe(listener: (batches: readonly PipeOutputBatch[]) => void): () => void;
    onCollabUpdates(listener: (event: {
        updates: Uint8Array[];
        inferences: Array<{
            seq: number;
            insertion: CollaborationTextInsertion;
        }>;
        clock?: number;
    }) => void): () => void;
    applyRemoteUpdate(update: Uint8Array): Promise<void>;
    private commandAck;
    /** @internal */
    hasFailed(): boolean;
    /** The worker's wasm memories as of its latest reply; null before one. */
    memory(): WasmModuleMemory[] | null;
    layoutRevision(): number;
    /** @internal */
    stateSequence(): number;
    /** @internal The newest frame epoch a reply carried; 0 before any frame. */
    answeredFrame(): number;
    /** @internal */
    setRetainBuiltPages(retain: boolean): void;
    /** @internal Called once when the worker fails, whether or not a request was waiting; not on `destroy`. */
    onFailure(listener: ((error: Error) => void) | null): void;
    /** @internal Whether foreground document or frame work awaits its reply; `reads: false` leaves document reads out. */
    frameRequestPending(reads?: boolean): boolean;
    /** The worker replica's last reported yrs state vector (null before any). */
    remoteStateVector(): Uint8Array | null;
    /** The fonts revision this worker last applied (null before bootstrap). */
    syncedFontsRevision(): number | null;
    /** A bootstrap was sent; later snapshots go as syncs queued behind it. */
    bootstrapSent(): boolean;
    /** Resolves once a bootstrap is sent, at once when one was. */
    whenBootstrapSent(): Promise<void>;
    /**
     * Starts over with another document in the same worker: the next request
     * is a bootstrap, which keeps the page surfaces already attached so the
     * new document's pages paint where the old ones were.
     */
    rebootstrap(): void;
    /**
     * Parses and seeds a DOCX in the worker, which then holds the document:
     * its first layout is a bootstrap with `opened`, and the main replica loads
     * {@link encodeState}. A copy of `bytes` is transferred.
     */
    open(bytes: Uint8Array, options?: {
        digest?: string;
        generation?: string;
        heapLimitBytes?: number;
    }): Promise<ResidentEngineWorkerOpened>;
    /**
     * Opens a display-only preview of the first `blocks` body blocks of a DOCX in the worker, or
     * resolves null when the package cannot open as a preview. Its first layout is a bootstrap
     * with `opened`; {@link rebootstrap} then lets {@link open} replace it with the whole document.
     * A copy of `bytes` is transferred.
     */
    openPreview(bytes: Uint8Array, blocks: number, options?: {
        heapLimitBytes?: number;
        paragraphBudget?: number;
    }): Promise<ResidentEngineWorkerOpened | null>;
    /** The font requirements of a region layout request, read from the opened document. */
    fontRequirements(layoutInput: string): Promise<string>;
    layoutJson(layoutRevision: number): Promise<{
        status: 'ok';
        layoutJson: string;
    } | {
        status: 'stale';
    }>;
    /** @internal */
    proposal(operation: ResidentProposalOperation): Promise<ResidentProposalReply>;
    /** @internal */
    documentRead<K extends DocxDocumentRead['kind']>(read: DocxDocumentRead & {
        kind: K;
    }): Promise<{
        version: string;
        value: DocxDocumentReadValues[K];
    }>;
    /**
     * Reads the document at `expectVersion`. A later message may run first; the
     * read then answers `superseded` when the document moved on meanwhile.
     * @internal
     */
    documentReadAt<K extends DocxDocumentRead['kind']>(read: DocxDocumentRead & {
        kind: K;
    }, expectVersion: string): Promise<{
        status: 'ok';
        version: string;
        value: DocxDocumentReadValues[K];
    } | {
        status: 'superseded';
    }>;
    /** @internal */
    handOver(peerMetadata?: true): Promise<{
        state: Uint8Array;
        metadata?: Uint8Array;
        metadataReason?: string;
        version: string;
        proposals: DocxProposalRegistryState;
    }>;
    /** The worker's whole document state as one yrs v1 update. */
    encodeState(): Promise<Uint8Array>;
    /** @internal */
    encodeVersionedState(peerMetadata?: true): Promise<{
        state: Uint8Array;
        version: string | undefined;
        metadata?: Uint8Array;
        metadataReason?: string;
    }>;
    /**
     * @internal Saves the opened document in the worker. With the editor copy's
     * `stateVector`, `updates` carry what the worker holds beyond it (the
     * paragraph IDs the save wrote among them) for that copy to integrate;
     * `version` is the document version after the save.
     */
    save(request: {
        comments: Comment[];
        /** @internal */
        commentsSource?: 'host';
        host?: Document;
        stateVector?: Uint8Array;
        /** @internal */
        stories?: readonly string[];
    }): Promise<{
        bytes: ArrayBuffer;
        updates: Uint8Array[];
        version: string;
    }>;
    revisionCount(): Promise<number>;
    warm(): Promise<void>;
    bootstrap(snapshot: YrsResidentWorkerSnapshot, extras: string, options?: ResidentEngineWorkerLayoutOptions & ResidentEngineWorkerSnapshotOptions): Promise<ResidentEngineWorkerFrame>;
    sync(snapshot: YrsResidentWorkerSnapshot, extras: string, expectedFrameEpoch: number, paintCaret?: boolean, options?: ResidentEngineWorkerLayoutOptions & ResidentEngineWorkerSnapshotOptions): Promise<ResidentEngineWorkerFrame>;
    /**
     * Lay out the rest of a provisional bootstrap layout: its frame and full
     * layout, or null when a later snapshot already replaced it.
     */
    completeLayout(expectedFrameEpoch: number, paintCaret?: boolean, sliceBlocks?: number): Promise<ResidentEngineWorkerFrame | null>;
    buildFrame(extras: string, expectedFrameEpoch: number, paintCaret?: boolean, displayWindow?: [number, number]): Promise<ResidentEngineWorkerFrame>;
    /** Build unbuilt display pages; the reply frame carries them. */
    buildPages(pages: number[], expectedFrameEpoch: number, paintCaret?: boolean): Promise<ResidentEngineWorkerFrame>;
    /** @internal */
    buildPages(pages: number[], expectedFrameEpoch: number, paintCaret: boolean, background: boolean): Promise<ResidentEngineWorkerFrame | null>;
    releasePages(pages: Array<{
        index: number;
        pageId: string;
    }>, expectedFrameEpoch: number, paintCaret?: boolean): Promise<ResidentEngineWorkerFrame | {
        superseded: true;
    }>;
    applyInput(text: string, selection: YrsSelection, expectedFrameEpoch: number, profile?: boolean, paintCaret?: boolean, displayWindow?: [number, number]): Promise<ResidentEngineWorkerApplyResult | {
        applied: false;
    }>;
    applyDelete(direction: 'backward' | 'forward', selection: YrsSelection, expectedFrameEpoch: number, profile?: boolean, paintCaret?: boolean, count?: number, displayWindow?: [number, number]): Promise<ResidentEngineWorkerApplyResult | {
        applied: false;
    }>;
    /** Drop the worker-painted caret line by re-presenting the caret page's
     * retained raster. Fire-and-forget and idempotent. */
    eraseCaret(): void;
    invalidate(update: Uint8Array, selection: YrsSelection | null): void;
    syncUpdate(update: Uint8Array, stateVector: Uint8Array): Promise<{
        version: string;
        stateVector: Uint8Array;
        repair: Uint8Array | null;
    }>;
    attachCanvases(pages: ResidentEngineOffscreenPage[], activePageIds: string[], devicePixelRatio: number, zoom: number, caretStyle: ResidentCaretPaintStyle): Promise<void>;
    destroy(): void;
    protected request(request: AwaitedRequest, transfer?: Transferable[]): Promise<DocxEngineWorkerResponse & {
        ok: true;
    }>;
    protected fenceCommands(): void;
    /**
     * Requests run in order, so once a snapshot is sent every later request
     * finds its state and fonts in the worker: the next sync can diff against
     * them before this one answers.
     */
    private recordSent;
    /** Restarted by every message, so a queue of slow but answered requests never trips it. */
    private armWatchdog;
    private disarmWatchdog;
    /** Record a successfully applied bootstrap/sync payload's fonts revision.
     * The state vector is tracked centrally in `onmessage`. */
    private recordSync;
    protected fail(error: Error, notify?: boolean): void;
}
declare class ResidentWorkerUnavailableError extends Error {
}
/** The worker itself failed (crash, timeout, torn-down, corrupt reply). */
declare class ResidentWorkerFailureError extends Error {
}
/** The worker has no whole opened package to save. @internal */
declare class DocxWorkerSaveUnavailableError extends ResidentWorkerFailureError {
}
/** The worker trapped because its wasm memory could not grow any further. */
declare class ResidentWorkerOutOfMemoryError extends ResidentWorkerUnavailableError {
    /** The worker's wasm memories when it trapped. */
    readonly memory: WasmModuleMemory[];
    constructor(message: string, 
    /** The worker's wasm memories when it trapped. */
    memory: WasmModuleMemory[]);
}
declare function canUseResidentEngineWorker(): boolean;
/** @internal */
declare function preloadResidentEngineWorker(): Promise<void>;
/** @internal */
declare function retainPreloadedResidentEngineWorker(): () => void;
/** @internal */
declare function takePreloadedResidentEngineWorker(): ResidentEngineWorkerClient | null;

/**
 * Preload the editing engine and one spare resident worker. Opt-in.
 * @experimental
 */
declare function preloadDocxEngine(): Promise<void>;

/** Direct Document-to-yrs load projection. */

/**
 * Aggregate cap, in xml bytes, for opaque drawing payloads copied into yrs
 * state while seeding. Opaque markup replays verbatim through raw ops and
 * yrs map values, so uncapped documents multiply memory once per layer.
 * Both seeders enforce this constant and refuse over-budget documents
 * instead of silently dropping content.
 */
declare const OPAQUE_SEED_BUDGET_BYTES: number;
declare class OpaqueSeedBudgetError extends Error {
    readonly total: number;
    readonly budget: number;
    constructor(total: number);
}
declare function normalizeSeedError(error: unknown): unknown;
declare function assertOpaqueSeedBudget(document: Document): void;
/**
 * Seeds every yrs-owned editable story directly from a parsed Document.
 *
 * Stories are `body`, `hf:{rId}`, `fn:{id}`, `en:{id}`, and recursively generated table
 * cell / block-SDT stories. The target session must not already contain any of
 * those story ids. Seeding starts a new opening; see {@link YrsSession.beginOpening}.
 *
 * @public
 */
declare function documentToYrs(session: YrsSession, document: Document, options?: YrsOpeningOptions): void;

/** A saved paragraph's session anchor and the persisted anchor that resolves to it once reopened. */
interface DocxSavedParagraph {
    session: DocxSessionParagraphAnchor;
    persisted: DocxPersistedParagraphAnchor;
}
interface DocxSavedDocument {
    bytes: Uint8Array;
    /**
     * Every session paragraph the bytes hold with a Word paragraph ID, in
     * document order. Stories that share a part are views of its paragraphs:
     * each view the part holds is listed, and its persisted anchor resolves to
     * the first story's view once reopened.
     */
    paragraphs: DocxSavedParagraph[];
    /**
     * Saved paragraphs whose Word paragraph ID the live session reassigned
     * while the save was written, such as by a duplicate repair after a remote
     * update: their persisted anchor finds them in these bytes, not in the
     * live session.
     */
    conflicts: DocxSavedParagraph[];
}
/** The identities and paragraph ID plan a session save applies. @internal */
interface DocxSessionSave {
    identities: DocxParagraphIdentitySnapshot;
    plan: DocxParagraphSavePlan;
}
/** Captures a save of `session`, in the task that projects the saved document. @internal */
declare function captureSessionSave(session: YrsSession): DocxSessionSave;
/**
 * Writes `document`, projected from `session` when `capture` was taken, and
 * records the Word paragraph IDs the bytes hold as saved. `patches` selects
 * the planned parts written as `originalBuffer`'s bytes with IDs patched in,
 * and `splices` the story parts written as its bytes with only the
 * paragraphs that need it re-serialized; each selects none unless
 * `originalBuffer` is the session's source package.
 * @internal
 */
declare function writeSessionSave(session: YrsSession, document: Document, capture: DocxSessionSave, originalBuffer: ArrayBuffer, options?: RepackOptions, patches?: (part: string) => boolean, skipMutations?: boolean, splices?: (part: string) => boolean): Promise<DocxSavedDocument>;
/**
 * Saves a session opened from DOCX bytes and reports each saved paragraph's
 * persisted anchor, read from the same projection the bytes are written
 * from and kept only where the written part holds its Word paragraph ID.
 * Parts whose stories are unchanged since the session opened keep
 * their source bytes, paragraph IDs aside. The comments the session holds
 * are saved with their anchors, replies and resolution. A source paragraph without a
 * Word paragraph ID saves without one unless the host called
 * `persistParagraphIds()` first; the IDs a save writes are recorded as
 * saved, so they keep them against unsaved claims from other replicas, once
 * reconciled with the live session.
 */
declare function saveYrsDocx(session: YrsSession, options?: RepackOptions): Promise<DocxSavedDocument>;

/** @internal */
declare function editorSaveKeys(document: Document, comments?: readonly Comment[]): {
    metadata: string;
    comments: string;
    commentIds: number[];
};

/** Engine operations the package runs on sessions it creates itself; not public API. */

/** Returns the session's opened source package when available. @internal */
declare function sessionSourcePackage(session: YrsSession): {
    buffer: ArrayBuffer;
    keys: ReturnType<typeof editorSaveKeys>;
} | null;
/** @internal */
declare function headerFooterStory(session: object | null | undefined, rId: string): string;
/** The relationship ids whose bands show `rId`'s story. @internal */
declare function headerFooterDisplayRIds(session: object, rId: string): string[];

/** @internal */
declare function peerMetadataTags(metadata?: Uint8Array): {
    expected: string;
    received: string;
};
declare class PeerMetadataError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}

interface DocxEngineWorkerSourceOpened {
    document: Document;
    stateVector: Uint8Array;
    hostJson?: string;
    preview?: ResidentEngineWorkerFrame;
    /** The client id the opened replica writes with: a fresh one when the pinned id would reuse its clocks. */
    clientId?: number;
    /** The opened state's clock for `clientId`. */
    clientClock?: number;
    /** Pictures shown as SVG, which the host decodes for the worker's `commandInit`. */
    svgMedia?: DocxSvgMedia[];
}
declare class DocxSourceWorkerClient extends ResidentEngineWorkerClient {
    private fontListeners;
    private memoryListeners;
    private presentedFontsRevision;
    private cutReservation;
    constructor(worker?: ResidentEngineWorkerPort);
    static adopt(client: ResidentEngineWorkerClient): DocxSourceWorkerClient;
    private observe;
    /** Opens a display-only cut of the first body blocks for a preview; null when the worker declines it. {@link openSource} replaces it. */
    openSourceCut(source: DocxSourceOpenRequest & {
        bytes: Uint8Array;
        cut: NonNullable<DocxSourceOpenRequest['cut']>;
    }): Promise<Document | null>;
    private releaseCut;
    openSource(source: DocxSourceOpenRequest): Promise<DocxEngineWorkerSourceOpened>;
    /** A preview frame of the opened source's first pages, laid out with the fonts its command session will use. */
    previewSource(preview: DocxSourcePreviewOptions & {
        layoutInput: string;
    }): Promise<ResidentEngineWorkerFrame>;
    prewarm(): Promise<void>;
    onFontEnvironment(listener: (event: DocxFontEnvironmentEvent) => void): () => void;
    onMemory(listener: (samples: WasmModuleMemory[]) => void): () => void;
    frameRequestPending(reads?: boolean): boolean;
    protected request(...args: Parameters<ResidentEngineWorkerClient['request']>): Promise<{
        id: number;
        ok: true;
        commandInitial?: DocxCommandInitReply;
        commandAck?: DocxCommandAck;
        commandFrame?: {
            session: string;
            incarnation: number;
            epoch: number;
            frame: DocxCommandFrame;
        };
        fontEnvironmentEvent?: DocxFontEnvironmentEvent & {
            session: string;
            incarnation: number;
            epoch: number;
        };
        fontEnvironment?: DocxFontEnvironmentSnapshot;
        checkpoint?: Checkpoint;
        frame?: ArrayBuffer;
        pageFrames?: ArrayBuffer[];
        pageBuildSuperseded?: boolean;
        superseded?: true;
        updates?: ArrayBuffer[];
        engineMs?: number;
        workerTotalMs?: number;
        engineProfile?: YrsEngineApplyProfile;
        caret?: YrsResidentCaretSnapshot;
        selection?: YrsSelection | null;
        selectionCursor?: CollaborationCursor | null;
        caretPainted?: boolean;
        replayMs?: number;
        replayedPages?: number;
        layoutRevision?: number;
        documentVersion?: string;
        documentPreview?: boolean;
        documentAsOpened?: boolean;
        deletedUnits?: number;
        stateVector?: ArrayBuffer;
        layoutJson?: string;
        layoutMeta?: LayoutMetaV1 | {
            v: number;
        };
        layoutJsonStatus?: "ok" | "stale";
        layoutProvisional?: boolean;
        hostJson?: string;
        sourceDocument?: Document;
        svgMedia?: DocxSvgMedia[];
        clientId?: number;
        clientClock?: number;
        previewRefused?: boolean;
        requirementsJson?: string;
        state?: ArrayBuffer;
        peerMetadata?: ArrayBuffer;
        peerMetadataReason?: string;
        saved?: ArrayBuffer;
        revisionCount?: number;
        proposals?: DocxProposalRegistryState;
        version?: string;
        repair?: ArrayBuffer | null;
        proposal?: ResidentProposalResponse;
        read?: {
            version: string;
            value: unknown;
        };
        progress?: number;
    } & {
        collabUpdates?: ResidentCollaborationUpdates & {
            session?: string;
            incarnation?: number;
            epoch?: number;
        };
        memory?: WasmModuleMemory[];
    } & {
        ok: true;
    }>;
    protected fenceCommands(): void;
    protected fail(error: Error, notify?: boolean): void;
}
declare function takePreloadedDocxSourceWorker(): DocxSourceWorkerClient | null;

interface YrsDocxHost {
    document: Document;
    referencedFonts: string[];
    /**
     * The `referencedFonts` a document seeded from its package names only for
     * East Asian or complex-script text it does not contain, so no text is
     * measured or drawn with them. Empty when its stories were not seeded; a
     * preview's cover only its own first pages.
     */
    unusedScriptFonts?: string[];
    /** A preview whose cut holds the whole body. */
    wholeBody?: true;
    embeddedFonts: Map<string, ArrayBuffer>;
    fontTableRelationshipsXml?: string;
}
/** Durable authorship metadata for one suggested (tracked-change) operation. */
interface YrsAuthor {
    name: string;
    /** ISO timestamp supplied by the host so all peers share one clock policy. */
    date: string;
}
/** One position: `(story, paraId, offset)` — offsets are UTF-16 units within the paragraph. */
interface YrsLoc {
    story: string;
    paraId: string;
    offset: number;
}
/** One binary Yrs position that transforms with collaborative edits. */
interface YrsStickyPosition {
    story: string;
    encoded: Uint8Array;
}
/** A paragraph-addressed position without the story (used inside {@link YrsStoryRange}). */
interface YrsParaOffset {
    paraId: string;
    offset: number;
}
/**
 * A half-open range `[start, end)` inside one story. Ends may sit in
 * different paragraphs; the boundary pilcrows are then part of the range
 * (deleting such a range merges paragraphs).
 */
interface YrsStoryRange {
    story: string;
    start: YrsParaOffset;
    end: YrsParaOffset;
}
/** One run-level mark for {@link YrsSession.toggleMark}. */
type YrsRunMark = {
    type: 'bold';
} | {
    type: 'italic';
} | {
    type: 'underline';
} | {
    type: 'superscript';
} | {
    type: 'subscript';
} | {
    type: 'fontFamily';
    value: string;
} | {
    type: 'fontSize';
    value: number;
} | {
    type: 'color';
    value: string;
};
/** A direct text color written by {@link YrsSession.formatRange}. */
type YrsTextColor = {
    rgb: string;
    themeColor?: never;
} | {
    rgb?: never;
    themeColor: string;
};
/**
 * Set-valued inline formatting for {@link YrsSession.formatRange}. Omitted
 * fields are left unchanged; `null` clears a field. Boolean `false` also
 * clears the corresponding mark.
 */
interface YrsInlineFormatDelta {
    bold?: boolean | null;
    italic?: boolean | null;
    underline?: boolean | {
        style?: string;
        color?: string;
    } | null;
    strike?: boolean | {
        double?: boolean;
    } | null;
    color?: YrsTextColor | null;
    highlight?: string | null;
    /** Font size in points; Rust writes both OOXML half-point size fields. */
    fontSize?: number | null;
    fontFamily?: {
        ascii: string;
        hAnsi?: string;
    } | null;
    /** Passive run properties not covered by the typed fields. `null` clears. */
    other?: Readonly<Record<string, unknown | null>>;
}
interface YrsHyperlinkAttrs {
    href: string;
    tooltip?: string | null;
    rId?: string | null;
}
/** Seed shape for {@link YrsSession.loadStories}. */
interface YrsParagraphSeed {
    /** Paragraph text; must not contain paragraph breaks. */
    text: string;
    /** Defaults to `"Normal"`. */
    pStyle?: string;
    /** Defaults to `"left"`. */
    alignment?: string;
}
/** One story to seed via {@link YrsSession.loadStories}. */
interface YrsStorySeed {
    storyId: string;
    /** At least one paragraph. */
    paragraphs: readonly YrsParagraphSeed[];
}
/** How a seeding entry point starts its opening; see {@link YrsSession.beginOpening}. */
interface YrsOpeningOptions {
    /**
     * A fixed opening generation, for a deterministic seed every replica loads
     * as one session. Each opening mints a fresh one by default.
     */
    generation?: string;
    /**
     * Seeds images as `media:{n}` tokens naming their part of the package,
     * instead of `data:` URLs, keeping them out of the document state. Only a
     * replica opened from the same package on a version that reads tokens
     * shows them, so every client of a shared room must be one. Off by default.
     */
    mediaTokens?: boolean;
}
/**
 * A copy of `bytes` whose SHA-256 the platform takes off the calling thread,
 * where it has Web Crypto. Opening that copy unchanged skips hashing the
 * package on the calling thread; any other bytes open as before.
 * @internal
 */
declare function prepareDocxBytes(bytes: Uint8Array): Promise<Uint8Array>;
/** The SHA-256 {@link prepareDocxBytes} took of `bytes`, if it took one. @internal */
declare function preparedDocxDigest(bytes: Uint8Array): string | undefined;
/** Snapshot of one paragraph from {@link YrsSession.paragraphs}. */
interface YrsParagraph {
    /** Session key; not the paragraph's Word `w14:paraId`. */
    paraId: string;
    text: string;
    /** pStyle / alignment plus any op-set extras. */
    properties: Record<string, unknown>;
}
interface YrsTextSearchOptions {
    /** Defaults to false. */
    caseSensitive?: boolean;
    /** Maximum matches; unlimited by default. */
    limit?: number;
}
/** Paragraph-local UTF-16 offsets. */
interface YrsTextMatch {
    story: string;
    paraId: string;
    start: number;
    end: number;
    text: string;
}
/** One direct numbering reference (`w:numPr`) on a paragraph. */
interface YrsNumberingProperties {
    numId?: number;
    ilvl?: number;
}
/** One paragraph tab stop, measured in twips from the left margin. */
interface YrsParagraphTabStop {
    position: number;
    alignment: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear' | 'num';
    leader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot';
}
/**
 * Tri-state properties for {@link YrsSession.setParagraphAttrs}. Omitted
 * fields are kept and `null` clears. Numeric spacing and indents are OOXML
 * twips/line-spacing units, never CSS pixels.
 */
interface YrsParagraphAttrs {
    alignment?: 'left' | 'center' | 'right' | 'both' | 'distribute' | 'mediumKashida' | 'highKashida' | 'lowKashida' | 'thaiDistribute' | null;
    lineSpacing?: number | null;
    lineSpacingRule?: 'auto' | 'exact' | 'atLeast' | null;
    spaceBefore?: number | null;
    spaceAfter?: number | null;
    indentLeft?: number | null;
    indentRight?: number | null;
    indentFirstLine?: number | null;
    hangingIndent?: boolean | null;
    bidi?: boolean | null;
    tabs?: readonly YrsParagraphTabStop[] | null;
    defaultTextFormatting?: Readonly<Record<string, unknown>> | null;
    numPr?: YrsNumberingProperties | null;
    numPrFromStyle?: YrsNumberingProperties | null;
    listNumFmt?: string | null;
    listIsBullet?: boolean | null;
    listMarker?: string | null;
    listMarkerHidden?: boolean | null;
    listMarkerFontFamily?: string | null;
    listMarkerFontSize?: number | null;
    listMarkerBold?: boolean | null;
    listMarkerItalic?: boolean | null;
    listMarkerColor?: ColorValue | null;
    listMarkerSuffix?: 'tab' | 'space' | 'nothing' | null;
    listLevelNumFmts?: readonly string[] | null;
    listAbstractNumId?: number | null;
    listStartOverride?: number | null;
    /** Passive pPr/model properties not covered by the typed fields. */
    other?: Readonly<Record<string, unknown | null>>;
}
/**
 * Typed value for a content control. A string fills a plain- or rich-text control's content
 * (as a `setContentControlText` edit step would); the objects set checkbox, dropdown and date
 * controls.
 */
type YrsContentControlValue = {
    kind: 'dropdown';
    value: string;
} | {
    kind: 'checkbox';
    checked: boolean;
} | {
    kind: 'date';
    date: string;
} | string;
/** Image geometry authored in OOXML EMUs plus wrapping/position metadata. */
interface YrsImageGeometry {
    widthEmu: number;
    heightEmu: number;
    wrap?: 'inline' | 'square' | 'tight' | 'through' | 'topAndBottom' | 'behind' | 'inFront';
    hOffsetEmu?: number | null;
    vOffsetEmu?: number | null;
    distTopEmu?: number | null;
    distBottomEmu?: number | null;
    distLeftEmu?: number | null;
    distRightEmu?: number | null;
    relativeFromHorizontal?: string | null;
    relativeFromVertical?: string | null;
    /** Additional image payload fields; `null` clears an existing field. */
    other?: Readonly<Record<string, unknown | null>>;
}
/** A text or picture watermark payload for {@link YrsSession.insertWatermark}. */
type YrsWatermark = {
    kind: 'text';
    text: string;
    font: string;
    color: string;
    semitransparent: boolean;
    layout: 'diagonal' | 'horizontal';
    fontSize?: number;
    decorative?: boolean;
} | {
    kind: 'picture';
    relId?: string;
    mediaPath?: string;
    dataUrl?: string;
    contentType?: string;
    scale: number;
    washout: boolean;
    widthEmu?: number;
    heightEmu?: number;
    decorative?: boolean;
};
/**
 * One formatted segment from {@link YrsSession.storySegments} — the render
 * bridge's input. `attributes` carries run marks plus `ins` / `del` revision
 * values (suggested deletions are retained text with a `del` attribute).
 */
type YrsStorySegment = {
    kind: 'text';
    text: string;
    attributes: Record<string, unknown>;
} | {
    kind: 'pilcrow';
    paraId: string;
    properties: Record<string, unknown>;
    attributes: Record<string, unknown>;
} | {
    kind: 'embed';
    /** Map-backed embed discriminator (`table`, `noteRef`, `image`, …). */
    embedKind: string;
    /** Authored map entries excluding the discriminator. */
    payload: Record<string, unknown>;
    attributes: Record<string, unknown>;
};
/** Current offsets of one sticky comment anchor. */
interface YrsResolvedCommentAnchor {
    story: string;
    start: number;
    end: number;
}
/** A paragraph's story span; `end` is its pilcrow, so `end - start` is the paragraph length. */
interface YrsParagraphSpan {
    start: number;
    end: number;
}
/** Compact paragraph entry used to build the live input-position projection. */
interface YrsParagraphLength {
    paraId: string;
    /** UTF-16 text and inline embed units before the paragraph's pilcrow. */
    length: number;
}
/** Receipt of an op that minted a paragraph id. */
interface YrsParagraphReceipt {
    paraId: string;
}
/** Receipt of an op that may have minted a tracked-change revision (suggesting mode). */
interface YrsRevisionReceipt {
    revisionId: string | null;
}
/**
 * Where an edit landed, in whole characters: the inserted text (after the struck-out text when
 * suggesting), or what a delete left (collapsed when plain, the struck-out text when suggesting).
 */
interface YrsReplaceReceipt extends YrsRevisionReceipt {
    range?: YrsStoryRange;
}
/**
 * Receipt of {@link YrsSession.splitParagraph}. The first half keeps the
 * original paraId and the second half is re-minted; suggesting
 * mode stamps a `pPrIns` revision on the first half.
 */
interface YrsSplitReceipt {
    firstParaId: string;
    secondParaId: string;
    revisionId: string | null;
}
/** Low-level UTF-16 story operation for {@link YrsSession.applyRawOps}. */
type YrsRawOp = {
    op: 'insert';
    index: number;
    text: string;
    attrs?: Record<string, unknown>;
} | {
    op: 'delete';
    index: number;
    len: number;
} | {
    op: 'format';
    index: number;
    len: number;
    attrs?: Record<string, unknown>;
} | {
    /**
     * A pilcrow's `ooxmlParaId` binds its Word paragraph ID and is dropped
     * when it is not one; `sourceParaId` and `paraOrigin` are seeding's to set.
     */
    op: 'insertEmbed';
    index: number;
    kind: string;
    payload?: Record<string, unknown>;
    attrs?: Record<string, unknown>;
} | {
    op: 'setEmbedAttr';
    index: number;
    key: string;
    value: unknown;
} | {
    /** Upserts a side-map comment with sticky story-unit ranges. */
    op: 'setComment';
    id: string;
    ranges: ReadonlyArray<readonly [number, number]>;
    author?: string;
    date?: string;
    body?: unknown;
} | {
    /** Removes the side-map comment keyed by `id`; errors when missing. */
    op: 'removeComment';
    id: string;
};
/** Host context for {@link YrsSession.yrsBlocksForStory} (theme + list numbering). */
interface YrsRenderEnv {
    compatibilityFlags?: Partial<CompatibilityFlags>;
    tocStyleIds?: string[];
    paragraphSpacingLinePx?: number;
    /** Section document-grid snap pitch in px (w:docGrid). The engine derives this from sections; hosts may omit it. */
    docGridPitchPx?: number;
    defaultParagraphStyleId?: string;
    /** Theme color name → hex (`accent1` → `4472C4`), for theme-color resolution. */
    themeColors?: Record<string, string>;
    /** The document default tab stop in twips. */
    defaultTabStopTwips?: number | null;
    /** Current page content height in CSS px, for proportional drawing constraints. */
    pageContentHeight?: number | null;
    /** yrs revision/paragraph id → dense numeric layout id (list markers, revisions). */
    numericIds?: Record<string, number>;
    /** Include hidden text in visible layout without changing the document. */
    showHiddenText?: boolean;
    /** Report borderless table cell edges as view-only guides on each display page. */
    showTableGridlines?: boolean;
    /** Revision id → decision shown in layout; unlisted revisions render as tracked changes. */
    revisionPreview?: Readonly<Record<string, 'accepted' | 'rejected'>>;
    /** View-only layout reservations; saves and paged exports leave them out. @internal */
    reservations?: Readonly<DocxResolvedReservations>;
    /** Unresolved viewer reservations for resident layout requests. @internal */
    reservationSets?: DocxReservationsPayload;
    /**
     * Lay the opened package's images out as `media:{n}` tokens, which a
     * resolver given the session's `mediaSource` reads. @internal
     */
    mediaTokens?: boolean;
}
/** Receipt of {@link YrsSession.addComment}. */
interface YrsCommentReceipt {
    commentId: string;
}
/** A comment the session holds; see {@link YrsSession.listComments}. @internal */
interface YrsCommentInfo {
    id: string;
    author: string;
    date: string;
    done: boolean;
    parentId: string | null;
    /** The body as it was given to {@link YrsSession.addComment} or `setComment`. */
    body: unknown;
}
/**
 * Target of {@link YrsSession.acceptChange} / {@link YrsSession.rejectChange}:
 * one coalesced revision id (resolved at every site, in any story — the
 * `acceptChangeById` twin) or an explicit story range (the range-command twin;
 * every tracked change overlapping the range resolves, no id filtering).
 */
type YrsChangeTarget = {
    revisionId: string;
} | YrsStoryRange;
/** Receipt of {@link YrsSession.acceptChange} / {@link YrsSession.rejectChange}. */
interface YrsResolveReceipt {
    /** The revision ids resolved by the op (resolution order, deduplicated). */
    revisionIds: string[];
}
/** This peer's awareness selection, resolved from two yrs sticky positions. */
interface YrsSelection {
    anchor: YrsLoc;
    head: YrsLoc;
}
interface YrsResidentCaretRect {
    pageIndex: number;
    pageId: string;
    x: number;
    y: number;
    height: number;
}
interface YrsResidentCaretSnapshot {
    frameEpoch: number;
    caretRect: YrsResidentCaretRect | null;
    /** Selection the rect was computed for. Absent on raw engine snapshots. */
    selection?: YrsSelection | null;
}
declare function sameYrsSelection(left: YrsSelection | null, right: YrsSelection | null): boolean;
/** How far a region layout begun with {@link YrsSession.beginRegionLayout} has come. */
interface YrsRegionLayoutProgress {
    measuredBlocks: number;
    bodyBlocks: number;
    /** The retained region layout reply, once the pass is complete. */
    layoutJson?: string;
}
/** Opt-in internal stage timings for one resident engine input. @internal */
interface YrsEngineApplyProfile {
    selectionMs: number;
    editMs: number;
    lowerMs: number;
    measureMs: number;
    paginateMs: number;
    displayInputMs: number;
    displayBuildMs: number;
    displayFinalizeMs: number;
    displayMs: number;
    encodeMs: number;
}
/**
 * Serializable bootstrap state for the dedicated resident-layout worker.
 * The main-thread yrs replica records the inputs that established resident
 * render, measurement, and pagination state; the worker replays them once and
 * then owns every ordinary input-to-frame transaction.
 *
 * @internal
 */
/**
 * One resident font-store registration, in the order the main thread made it:
 * raw bytes, or a measurement view of an earlier id. The worker replays the
 * list to reproduce the same dense ids, so the order and the mix both matter.
 *
 * @internal
 */
type YrsResidentFontRegistration = Uint8Array | {
    substituteOf: number;
    family: string;
};
interface YrsResidentWorkerSnapshot extends ResidentEngineWorkerFontSync {
    /** @internal */
    workerAuthoritative?: true;
    clientId: number;
    /** Full document state, or a state-vector diff when the caller supplied
     * the worker's known vector — both apply through the same merge path. */
    state: Uint8Array;
    selection: YrsSelection | null;
    /** Full registrations, or a possibly empty suffix after `fontsBaseRevision`. */
    fonts: YrsResidentFontRegistration[];
    /** Monotonic revision of the resident font set (bumped by register/clear). */
    fontsRevision: number;
    renderInputs: Array<{
        story: string;
        env: YrsRenderEnv;
    }>;
    measureInputs: string[];
    layoutInput: string;
    layoutWithRegions: boolean;
    layoutRevision: number;
    /** The document is a preview's cut of a package: its layouts render NUMPAGES empty. */
    partialDocument?: boolean;
    /** Which seeded `data:` image sources lay out as `media:{n}` tokens. @internal */
    mediaSources?: string;
    /** The opened package's footnote/endnote separator notes, for replicas without its source. @internal */
    noteSeparators?: Uint8Array;
}
/**
 * What the sync target already holds, so a snapshot can ship deltas instead
 * of the whole world.
 *
 * @internal
 */
interface YrsResidentWorkerSyncOptions {
    /** The worker replica's last reported yrs state vector. */
    knownStateVector?: Uint8Array | null;
    /** The `fontsRevision` the worker last applied. */
    knownFontsRevision?: number | null;
}
/** A range-aggregated toggle mark. @public */
type YrsTriState = boolean | 'mixed';
/**
 * Read-only toolbar/a11y state aggregated from yrs over one story range.
 * Toggle marks are tri-state; value marks are `null` when absent or mixed.
 *
 * @public
 */
interface YrsSelectionContext {
    bold: YrsTriState;
    italic: YrsTriState;
    underline: YrsTriState;
    strike: YrsTriState;
    superscript: YrsTriState;
    subscript: YrsTriState;
    /** Uniform ASCII font family, or `null` when absent/mixed. */
    fontFamily: string | null;
    /** Uniform font size in half-points (the OOXML `w:sz` unit). */
    fontSize: number | null;
    /** Uniform RGB hex or theme-color name, or `null` when absent/mixed. */
    color: string | null;
    /** Uniform highlight name (`yellow`, …) or unmapped hex, or `null` when absent/mixed. */
    highlight: string | null;
    /** Paragraph containing the range start. */
    paraId: string;
    styleId: string | null;
    alignment: string | null;
    /**
     * Full authored pilcrow property bag. Known toolbar fields retain their
     * names (`indentLeft`, `spaceBefore`, `lineSpacing`, `numPr`, and so on);
     * paragraph style is stored as `pStyle`.
     */
    paragraphProperties: {
        [key: string]: unknown;
        pStyle?: string;
        alignment?: string;
        indentLeft?: number;
        indentRight?: number;
        indentFirstLine?: number;
        hangingIndent?: boolean;
        spaceBefore?: number;
        spaceAfter?: number;
        lineSpacing?: number;
        lineSpacingRule?: string;
        numPr?: {
            numId?: number;
            ilvl?: number;
        };
    };
    hasSelection: boolean;
    isMultiParagraph: boolean;
    /** The range belongs to a table-cell story. */
    inTable: boolean;
    /** The range covers exactly one non-pilcrow embed unit. */
    isSingleEmbed: boolean;
    /** Embed discriminator (`image`, `drawing`, …), else `null`. */
    embedKind: string | null;
    /** Convenience flag for a single `image` embed selection. */
    isImage: boolean;
    inInsertion: boolean;
    inDeletion: boolean;
}
/**
 * One tracked insertion, deletion, or paragraph-mark revision read from yrs.
 *
 * @public
 */
interface YrsRevisionInfo {
    revisionId: string;
    author: string;
    date: string;
    kind: 'insertion' | 'deletion' | 'pPrIns' | 'pPrDel' | 'pPrChange' | 'trIns' | 'trDel' | 'tableIns' | 'tableDel';
    story: string;
    /** Raw affected text, capped at 80 Unicode code points. */
    preview: string;
    range: YrsStoryRange;
}
/**
 * Story-local locator for one native table embed.
 *
 * @public
 */
interface YrsTableLoc {
    story: string;
    /** Zero-based table ordinal in the parent story. */
    tableIndex: number;
}
/**
 * One table cell addressed in the resolved rectangular grid.
 *
 * @public
 */
interface YrsCellLoc extends YrsTableLoc {
    row: number;
    column: number;
}
/**
 * Anchor-cell to head-cell rectangular selection, addressed by grid
 * coordinates rather than document positions.
 *
 * @public
 */
interface YrsTableRange {
    anchor: YrsCellLoc;
    head: YrsCellLoc;
}
/**
 * Receipt shared by native table-structure and cell-format operations.
 *
 * @public
 */
interface YrsTableReceipt {
    table: YrsTableLoc;
    rows: number;
    columns: number;
    createdStoryIds: string[];
    deletedStoryIds: string[];
    /** Existing stories whose content changed: the table's story, plus a merge's surviving cell. */
    changedStoryIds: string[];
    newParaIds: string[];
    deletedTable: boolean;
    revisionIds: string[];
}
/**
 * Receipt of {@link YrsSession.insertTableFragment}: the table receipt plus
 * the caret right after the inserted table embed.
 *
 * @public
 */
interface YrsTableFragmentReceipt extends YrsTableReceipt {
    after: YrsLoc;
}
/**
 * OOXML-shaped cell border value passed through to `tcPr.borders`.
 *
 * @public
 */
interface YrsCellBorder {
    style: string;
    size?: number;
    color?: {
        rgb: string;
    };
}
/**
 * Per-side border patch for {@link YrsSession.setCellBorders}. An omitted side
 * is left alone, `style: 'none'` authors an explicit no-border, and `null`
 * drops the authored side.
 *
 * @public
 */
type YrsCellBorders = Partial<Record<'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV', YrsCellBorder | null>>;
interface YrsTablePropertiesPatch {
    width?: number | null;
    widthType?: string | null;
    justification?: 'left' | 'center' | 'right' | null;
}
/** Undo grouping for tracked local transactions. */
type YrsUndoCaptureMode = 'auto' | 'manual';
/** Outcome of a target-resolving helper edit. @internal */
type YrsTargetEditResult = {
    ok: true;
    version: string;
} | DocxEditRefusal;
/** Accepted-view texts around a selection; U+FFFC stands for each inline atom. @internal */
interface YrsSelectionText {
    paraId: string;
    selectedText: string;
    paragraphText: string;
    before: string;
    after: string;
}
/**
 * One live replica of the yrs editing model. Thin typed wrapper over the
 * wasm `EditSession` — no editing logic on this side of the boundary.
 */
/** An embedded image's bytes, as its `media:{n}` source displays them. */
interface YrsMediaSource {
    bytes: Uint8Array;
    mimeType: string;
}
/** @internal */
interface YrsWorkerDocumentMirror {
    version: string;
    proposals: DocxProposalRegistryState;
}
/** What runs inherit under one package's styles. @internal */
interface YrsRunInheritance {
    /**
     * The attributes seeding merges into the marks of a run of `runStyle` in a
     * paragraph of `paragraphStyle` before the run's direct formatting.
     */
    attributes(paragraphStyle: string | null, runStyle: string | null, tableRun?: TextFormatting): Record<string, unknown>;
    paragraphFormatting(paragraphStyle: string | null, tableFormatting: ParagraphFormatting | undefined): ParagraphFormatting | undefined;
    tableAttributes(table: Table): YrsTableInheritance;
    dispose(): void;
}
interface YrsTableInheritance {
    attributes: Record<string, unknown>;
    rows: Array<Array<{
        attributes: Record<string, unknown>;
        paragraphFormatting: ParagraphFormatting | null;
        runFormatting: TextFormatting | null;
    }>>;
}
interface YrsSession extends CollaborationReplica {
    /** The yrs client id this replica writes with. */
    readonly clientId: number;
    /** Register raw sfnt bytes in the session's measurement/display font store. */
    registerFont(bytes: Uint8Array): number;
    /**
     * Register a measurement view of `base` carrying the vertical metrics Word
     * measures `family` with, for a face the host substituted; `base` when the
     * engine knows no metrics for the family.
     */
    registerSubstituteFont(base: number, family: string): number;
    /** Clear the session's registered measurement/display fonts. */
    clearFonts(): void;
    /** Measure one paragraph through the session's resident text engine. */
    measureParagraphJson(input: string): string;
    /** Paginate and retain the measured input and Layout in the session. */
    layoutDocumentJson(input: string): string;
    /** Return the compact font requirements for resident region layout. */
    layoutFontRequirementsJson(input: string): string;
    /** Paginate and compose section/page regions in the resident engine. */
    layoutDocumentWithRegionsJson(input: string): string;
    /** Same pass, but the reply omits the measured arena (fetch it on demand
     * through {@link YrsSession.retainedKernelInputsJson}). */
    layoutDocumentWithRegionsRetainedJson(input: string): string;
    layoutDocumentWithRegionsRetainedMeta(input: string): RetainedLayoutMeta;
    retainedLayoutJson(): string;
    /**
     * {@link YrsSession.layoutDocumentWithRegionsRetainedJson} a step at a time:
     * this lowers the body, and each {@link YrsSession.resumeRegionLayout}
     * measures up to `blocks` more body blocks. `layoutJson` arrives with the
     * step that completes the pass, equal to the one-call reply. A document
     * change, a font registration or another layout in between abandons the
     * pass, and resuming it then throws.
     */
    beginRegionLayout(input: string): YrsRegionLayoutProgress;
    resumeRegionLayout(blocks: number): YrsRegionLayoutProgress;
    /** Retained `{ measured, options }` for the main-thread display fallback. */
    retainedKernelInputsJson(expectedLayoutRevision: number): string;
    /**
     * Record region layout `input` as the resident layout without running it
     * here: a resident worker replica runs it, and snapshots carry it there.
     * Returns the new layout revision. @internal
     */
    adoptResidentWorkerLayout?(input: string): number;
    /** The current resident layout ran only in a worker replica. @internal */
    residentLayoutInWorker?(): boolean;
    /** Build display primitives against the session's resident font store. */
    buildDisplayListJson(input: string): string;
    /** Build a binary FrameDelta v1 against the last host-applied frame. */
    buildDisplayListFrame(input: string, expectedFrameEpoch: number): Uint8Array;
    /**
     * Limit full display builds to pages `start..end` plus the pages already
     * built; the rest stay unbuilt placeholders carrying their geometry. @internal
     */
    setDisplayWindow(start: number, end: number): void;
    /** Keep every previously built page while windowed builds are on. @internal */
    setDisplayRetainBuiltPages(retain: boolean): void;
    /** @internal */
    setWindowedIncrementalBuilds(enabled: boolean): void;
    /** Build the listed unbuilt pages into a FrameDelta v1. @internal */
    buildDisplayPagesFrame(pages: readonly number[], expectedFrameEpoch: number): Uint8Array;
    /** Release built pages; null means the request was superseded. @internal */
    releaseDisplayPagesFrame(pages: number[], expectedFrameEpoch: number): Uint8Array | null;
    /** Make the next frame a full one, for a host taking over from another engine; no-op once destroyed. */
    resetFrameBase(): void;
    /** Caret geometry from the current resident display frame. */
    residentCaretSnapshot(): YrsResidentCaretSnapshot;
    /** Apply a collapsed plain-text insertion and return its resident FrameDelta. */
    applyInput(text: string, expectedFrameEpoch: number): Uint8Array;
    /**
     * Apply up to `count` (default 1) collapsed character deletions/paragraph
     * merges, lay out once, and return the resident FrameDelta.
     */
    applyDelete(direction: 'backward' | 'forward', expectedFrameEpoch: number, count?: number): Uint8Array;
    /** Characters the last resident deletion removed; fewer than asked at a document boundary. */
    residentDeletedUnits(): number;
    /** Instrumented apply used only by opt-in browser performance traces. */
    applyInputProfiled(text: string, expectedFrameEpoch: number): {
        frame: Uint8Array;
        profile: YrsEngineApplyProfile;
    };
    /** Instrumented deletion used only by opt-in browser performance traces. */
    applyDeleteProfiled(direction: 'backward' | 'forward', expectedFrameEpoch: number, count?: number): {
        frame: Uint8Array;
        profile: YrsEngineApplyProfile;
    };
    /** Snapshot the inputs needed to move resident layout ownership to a worker. */
    residentWorkerSnapshot(options?: YrsResidentWorkerSyncOptions): YrsResidentWorkerSnapshot | null;
    /**
     * Cheap worker-sync probe: the resident layout revision when a worker
     * snapshot would be available, without encoding document state or copying
     * font bytes. Steady-state frame builds consult this instead of building a
     * full snapshot.
     */
    residentWorkerProbe(): {
        layoutRevision: number;
    } | null;
    /** Resident display-list hit/range queries; results are small JSON records. */
    displayHitTestRegionsJson(pageIndex: number, x: number, y: number): string;
    displayVerticalMoveJson(position: number, direction: 'up' | 'down', goalX: number): string;
    displayRangeRectsJson(from: number, to: number): string;
    /** @internal */
    displayRangeRectsOnPagesJson?(from: number, to: number, firstPage: number, lastPage: number): string;
    displayRangeRectsRegionJson(region: 'body' | 'header' | 'footer', rId: string, from: number, to: number): string;
    /** Read a glyph outline from the session's resident font store. */
    outlineGlyphJson(fontId: number, glyphId: number): string;
    /** Hydrates from an encoded yrs v1 update (typically a peer's {@link encodeState} output). */
    loadState(update: Uint8Array): void;
    encodePeerMetadata(): Uint8Array;
    bootstrapPeer(state: Uint8Array, metadata: Uint8Array, source: Uint8Array | undefined, host: YrsDocxHost, options?: YrsOpeningOptions): YrsDocxHost;
    /** Parses a DOCX, seeds its stories, and returns thin host metadata; see {@link openDocx}. */
    seedFromDocx(bytes: Uint8Array, options?: YrsOpeningOptions): YrsDocxHost;
    /**
     * Parses a DOCX and optionally seeds its stories. Seeding starts a new
     * opening, so its session anchors never resolve in another opening, even
     * one seeded alike by the same client; see {@link beginOpening}.
     */
    openDocx(bytes: Uint8Array, seedStories: boolean, options?: YrsOpeningOptions): YrsDocxHost;
    /**
     * Opens a DOCX for display only, from the body's first `blocks` blocks:
     * enough to lay out its first pages with a prefix pass before the whole
     * document is opened. With `paragraphBudget`, the cut also ends at the first
     * whole block (from the 32nd on) where the paragraphs read, table cells
     * included, reach the budget, only when the block limit would also cut the body.
     * The session cannot save. `null`, opening nothing,
     * for a document with a float placed from outside the text or a section
     * with columns, which no cut of the body lays out like the whole: open it
     * with {@link openDocx}. @internal
     */
    openDocxPreview(bytes: Uint8Array, blocks: number, paragraphBudget?: number): YrsDocxHost | null;
    /** Opened by {@link openDocxPreview}: its document refuses every change. @internal */
    isDisplayOnly(): boolean;
    /**
     * Marks this empty session as showing a preview another engine opened: it refuses every
     * change, and {@link openDocxPreview} can still load the preview here. @internal
     */
    markDisplayOnly(): void;
    /**
     * Marks whether the document is a preview's, as a replica of one is: its
     * layouts render NUMPAGES empty. @internal
     */
    setPartialDocument(partial: boolean): void;
    /**
     * The region layout of only as much of the body as fills `pages` pages;
     * a reply marked `provisional` covers a prefix. @internal
     */
    layoutDocumentWithRegionsPrefixRetainedJson(input: string, pages: number): string;
    /**
     * Starts a new opening of the document: its generation, replicated to
     * every replica, becomes part of every session anchor. Every seeding entry
     * point calls it; call it after building a document another way.
     */
    beginOpening(generation?: string): void;
    /** Unions seeded opaque sequence names into document state. @internal */
    seedOpaqueSequences(names: readonly string[]): void;
    /** Materializes the retained canonical package for compatibility APIs. */
    materializeDocx(): Document | null;
    /**
     * The displayed bytes and media type of the package part a `media:{n}`
     * image source names, or `null` for any other source or a destroyed session.
     */
    mediaSource(token: string): YrsMediaSource | null;
    /** Changes on package opening and session destruction. */
    mediaScope(): number;
    /** The `data:` URL a token stands for, or `null` when unavailable or destroyed. */
    mediaDataUrl(token: string): string | null;
    /**
     * Lays this replica's `data:` image sources out as the `media:{n}` tokens a
     * snapshot's `mediaSources` names. @internal
     */
    loadMediaSources(json: string): void;
    /** Loads the opened package's separator notes for this replica. @internal */
    loadNoteSeparators(state: Uint8Array): void;
    /**
     * Seeds stories and returns paragraph IDs in document order. Seeding a
     * document that has no opening yet starts one; see {@link beginOpening}.
     */
    loadStories(stories: readonly YrsStorySeed[]): Record<string, string[]>;
    /** Full document state as one yrs v1 update (Yjs wire format). */
    encodeState(): Uint8Array;
    /** Current Yrs state vector in the Yjs v1 wire format. */
    encodeStateVector(): Uint8Array;
    /** Full state, or only the state missing from a peer vector. */
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    /**
     * The state missing from a peer vector as ordered updates of at most `maxChunkBytes` each: one update when it fits,
     * otherwise causally ordered structs and then the delete set alone. Only an update holding a single larger struct
     * exceeds the limit.
     */
    encodeStateAsUpdateChunks(remoteStateVector: Uint8Array, maxChunkBytes: number): Uint8Array[];
    /** Applies a remote/incremental yrs v1 update. */
    applyUpdate(update: Uint8Array): CollaborationTextInsertion | null;
    /** Applies one sync's ordered updates as a single remote change; refuses all if any is malformed or oversized. */
    applyUpdateChunks(updates: readonly Uint8Array[]): void;
    /** Apply a same-user worker update under the local undo origin. @internal */
    applyLocalUpdate(update: Uint8Array): void;
    /** Adopt another replica's host batch outside undo history. @internal */
    applyHostUpdate(update: Uint8Array, stories?: readonly string[]): void;
    /**
     * Subscribes to every committed transaction's v1 update (local AND
     * applied-remote). Returns an unsubscribe function.
     */
    onUpdate(listener: (update: Uint8Array, origin: CollaborationUpdateOrigin) => void): () => void;
    /** Encode one location as a binary Yrs sticky position. */
    encodeStickyPosition(loc: YrsLoc): YrsStickyPosition;
    /** Resolve a binary Yrs sticky position against this replica. */
    resolveStickyPosition(position: YrsStickyPosition): YrsLoc | null;
    /** Store this peer's awareness selection as sticky positions. */
    setSelection(anchor: YrsLoc, head?: YrsLoc): void;
    /** Resolve this peer's current sticky selection, or null before initialization. */
    selection(): YrsSelection | null;
    /** Encode the current selection as binary Yrs sticky indices. */
    encodeSelection(): CollaborationCursor | null;
    /** Resolve a peer's binary Yrs sticky indices against this replica. */
    resolveSelection(cursor: CollaborationCursor): YrsSelection | null;
    /** Store this peer's rectangular table selection outside the document. */
    setCellSelection(range: YrsTableRange): void;
    /** Resolve the current sticky cell selection, or null before initialization. */
    cellSelection(): YrsTableRange | null;
    /** Begin local-origin undo capture once import/seeding has completed. */
    beginUndoCapture(): void;
    /** Separates subsequent local edits from the current undo step; safe before capture starts. */
    addUndoBoundary(): void;
    /** Changes grouping policy, closing the current group while retaining history. */
    setUndoCaptureMode(mode: YrsUndoCaptureMode): void;
    /** Current grouping policy; defaults to auto. */
    undoCaptureMode(): YrsUndoCaptureMode;
    /** Stories changed by the latest undo or redo, sorted. */
    historyStories(): string[];
    /** Undo/redo only local-origin direct operations (never remote/system transactions). */
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    /** Adds a story with one paragraph; the receipt carries its paraId. */
    createStory(storyId: string, initialText: string, pStyle?: string, alignment?: string): YrsParagraphReceipt;
    /** Removes a complete story (including an unreachable table-cell story). */
    deleteStory(storyId: string): void;
    /** Inserts a row above or below the cell that `at` resolves into. */
    insertRow(at: YrsCellLoc, side: 'above' | 'below', suggesting?: YrsAuthor): YrsTableReceipt;
    /** Inserts a rectangular structural table at a paragraph-keyed location. */
    insertTable(at: YrsLoc, rows: number, columns: number, suggesting?: YrsAuthor): YrsTableReceipt;
    /** Inserts a clipboard table fragment at a paragraph-keyed location. */
    insertTableFragment(at: YrsLoc, table: DocxTableFragment, suggesting?: YrsAuthor): YrsTableFragmentReceipt;
    /** Validates a clipboard table fragment without mutating; throws when invalid. */
    validateTableFragment(table: DocxTableFragment): void;
    /** Inserts a column left or right of the cell that `at` resolves into. */
    insertColumn(at: YrsCellLoc, side: 'left' | 'right'): YrsTableReceipt;
    /** Deletes every row covered by an explicit rectangular cell range. */
    deleteRow(range: YrsTableRange, suggesting?: YrsAuthor): YrsTableReceipt;
    /** Deletes every column covered by an explicit rectangular cell range. */
    deleteColumn(range: YrsTableRange): YrsTableReceipt;
    /** Removes a complete table plus its reachable cell stories. */
    deleteTable(table: YrsTableLoc): YrsTableReceipt;
    /** Merges a rectangular range into its top-left cell. */
    mergeCells(range: YrsTableRange): YrsTableReceipt;
    /** Splits the merged cell covering `at` into one cell per grid slot. */
    splitCell(at: YrsCellLoc, rows?: number, columns?: number): YrsTableReceipt;
    /** Sets or clears the selected cells' background color. */
    setCellShading(range: YrsTableRange, color: string | null): YrsTableReceipt;
    /**
     * Merges an OOXML-shaped patch into selected cells' `tcPr`. JSON `null`
     * clears a property; merge/split-owned span keys are rejected.
     */
    setCellTextFormat(range: YrsTableRange, patch: Readonly<Record<string, unknown>>): YrsTableReceipt;
    /**
     * Merges border sides into the selected cells. `insideH`/`insideV` resolve
     * per cell to the physical edges interior to the selection.
     */
    setCellBorders(range: YrsTableRange, borders: YrsCellBorders): YrsTableReceipt;
    /** Sets one authored grid-column width in twips. */
    setColumnWidth(at: YrsCellLoc, widthTwips: number): YrsTableReceipt;
    /** Sets the table-wide preferred width in twips. */
    setTableWidth(table: YrsTableLoc, widthTwips: number): YrsTableReceipt;
    setTableProperties(table: YrsTableLoc, patch: YrsTablePropertiesPatch): YrsTableReceipt;
    /** Inserts paragraph-break-free text. Suggesting mode mints a revision. */
    insertText(at: YrsLoc, text: string, suggesting?: YrsAuthor): YrsReplaceReceipt;
    insertLineBreak(at: YrsLoc, suggesting?: YrsAuthor): YrsReplaceReceipt;
    /**
     * Deletes a range (plain) or marks it as a suggested deletion (suggesting).
     * A range spanning paragraphs also merges them (pilcrow-as-character).
     */
    deleteRange(range: YrsStoryRange, suggesting?: YrsAuthor): YrsReplaceReceipt;
    /** Replaces a range with text in one transaction (one shared revision when suggesting). */
    replaceRange(range: YrsStoryRange, text: string, suggesting?: YrsAuthor): YrsReplaceReceipt;
    /**
     * Splits a paragraph by inserting one pilcrow. The FIRST half keeps the
     * original paraId; the SECOND half is re-minted (`secondParaId`).
     */
    splitParagraph(at: YrsLoc, suggesting?: YrsAuthor): YrsSplitReceipt;
    /** Merges `paraId` with the FOLLOWING paragraph. Errors on the final paragraph. */
    mergeParagraphs(story: string, paraId: string, suggesting?: YrsAuthor): YrsRevisionReceipt;
    /**
     * Toggles one run mark across a range: removes it when every unit already
     * carries it, otherwise adds it. Adding superscript clears subscript and
     * vice versa.
     */
    toggleMark(range: YrsStoryRange, mark: YrsRunMark): void;
    /** Applies set-valued direct formatting; omitted fields are kept and `null` fields clear. */
    formatRange(range: YrsStoryRange, delta: YrsInlineFormatDelta): void;
    /** Sets or clears the protected hyperlink attribute over a non-empty range. */
    setHyperlink(range: YrsStoryRange, hyperlink: YrsHyperlinkAttrs | null): void;
    /** Clears direct formatting while retaining hyperlinks and tracked-change stamps. */
    clearFormatting(range: YrsStoryRange): void;
    /** Applies a paragraph style id to every paragraph intersecting the range. */
    applyParagraphStyle(range: YrsStoryRange, styleId: string, suggesting?: YrsAuthor): void;
    /** Applies tri-state paragraph properties to every paragraph intersecting the range. */
    setParagraphAttrs(range: YrsStoryRange, attrs: YrsParagraphAttrs, suggesting?: YrsAuthor): void;
    /** Inserts one inline image embed, optionally as a tracked insertion. */
    insertImage(at: YrsLoc, image: Readonly<Record<string, unknown>>, suggesting?: YrsAuthor): YrsReplaceReceipt;
    /**
     * Sets the value of a content-control embed addressed by stable payload id. A string fills a
     * text control's content as one version-checked step and throws when the fill is refused.
     */
    setContentControlValue(embedId: string, value: YrsContentControlValue): void;
    /** {@link setContentControlValue} for the embed at a paragraph-keyed position. */
    setContentControlValueAt(at: YrsLoc, value: YrsContentControlValue): void;
    /**
     * Removes an authored value from a content-control embed. It never erases a text control's
     * text: fill it with `''` for that.
     */
    clearContentControlValue(embedId: string): void;
    /** Commits image size/wrapping/position fields in one transaction. */
    setImageGeometry(embedId: string, geometry: YrsImageGeometry): void;
    /** Commits image geometry at a paragraph-keyed position; reaches images that share an id. */
    setImageGeometryAt(at: YrsLoc, geometry: YrsImageGeometry): void;
    /**
     * Inserts a native page-break embed at a paragraph-keyed location, past the
     * paragraph's leading blocks; inside a paragraph it splits the paragraph
     * first. Returns where the break landed.
     */
    insertPageBreak(at: YrsLoc): YrsLoc;
    /** Splits the paragraph at a paragraph-keyed location into a section boundary that starts the next section with `type`. */
    insertSectionBreak(at: YrsLoc, type: 'nextPage' | 'continuous' | 'oddPage' | 'evenPage'): void;
    insertSectionBreakAfter(paraId: string, kind: SectionStartKind): void;
    setSectionProperties(section: string | number, properties: SectionPropertyPatch): void;
    listSections(): SectionInfo[];
    /** Inserts a typed watermark embed at a paragraph-keyed location. */
    insertWatermark(at: YrsLoc, watermark: YrsWatermark): void;
    /**
     * Applies raw story operations in one transaction, then repairs any
     * paragraph identity a pilcrow they insert or re-key duplicates and
     * promotes an editor-only paragraph they author into.
     */
    applyRawOps(story: string, ops: readonly YrsRawOp[]): void;
    /**
     * Applies seed raw operations with deterministic item ordering. A
     * `setComment` for a comment already seeded adds its ranges to it.
     */
    applySeedRawOps(story: string, ops: readonly YrsRawOp[]): void;
    /** Sets one paragraph property (any JSON value). `paraId` is reserved. */
    setParagraphAttr(paraId: string, key: string, value: unknown): void;
    /** Adds a sticky-anchored comment over one or more ranges. */
    addComment(ranges: readonly YrsStoryRange[], author: string, date: string, body: unknown): YrsCommentReceipt;
    /** Updates comment metadata with local undo capture. */
    updateComment(id: string, patch: {
        done?: boolean;
        parentId?: string | null;
        body?: unknown;
        author?: string;
        date?: string;
    }): void;
    /** Reanchors an existing comment with non-empty ranges; preserves metadata and joins local undo capture. */
    setCommentRanges(commentId: string, ranges: readonly YrsStoryRange[]): void;
    /**
     * Accepts tracked changes: pending insertions become plain content,
     * pending deletions are carried out; a `pPrIns` paragraph mark clears (the
     * split stays), a `pPrDel` mark joins with the following paragraph (whose
     * pPr survives — Word's surviving-`w:p` rule). Resolving never stamps a new
     * revision. Throws on an unknown revision id.
     */
    acceptChange(target: YrsChangeTarget): YrsResolveReceipt;
    /**
     * Rejects tracked changes — the inverse of {@link acceptChange}: pending
     * insertions roll back, pending deletions restore their text; a `pPrIns`
     * mark joins back with the following paragraph, a `pPrDel` mark clears.
     */
    rejectChange(target: YrsChangeTarget): YrsResolveReceipt;
    /** Aggregate toolbar/a11y state from yrs over one paragraph-addressed range. */
    selectionContext(range: YrsStoryRange): YrsSelectionContext;
    /** Enumerate tracked changes across every story in deterministic order. */
    listRevisions(): YrsRevisionInfo[];
    /** Current offsets of a comment's sticky anchors. Throws when an anchor no longer resolves. */
    resolveComment(commentId: string): YrsResolvedCommentAnchor[];
    /** Every comment the session holds, sorted by id. @internal */
    listComments(): YrsCommentInfo[];
    /** Story ids in the document, sorted. */
    storyIds(): string[];
    /** Whether the document has a story with this id, without listing them all. */
    hasStory(story: string): boolean;
    /** Story length in UTF-16 units (every embed, pilcrows included, counts 1). */
    storyLength(story: string): number;
    /** Returns the story's canonical-stream checksum. */
    storyChecksum(story: string): bigint;
    /** Lowers a story to layout blocks and rejects unsupported embeds. */
    yrsBlocksForStory(story: string, env?: YrsRenderEnv): unknown[];
    /** Paragraph snapshots in document order. */
    paragraphs(story: string): YrsParagraph[];
    /** Literal search in document order. */
    searchText(query: string, options?: YrsTextSearchOptions): YrsTextMatch[];
    /** Paragraph ids and inline-unit lengths, resolved in one Rust story traversal. */
    paragraphSpans(story: string): YrsParagraphLength[];
    /** The raw formatted-segment view (the render bridge's input). */
    storySegments(story: string): YrsStorySegment[];
    /**
     * The current story revision and the sorted ids of the stories created,
     * edited, or deleted after revision `since` (0 lists every story).
     */
    storiesChangedSince(since: number): {
        revision: number;
        stories: string[];
    };
    /**
     * One digest per unit of {@link YrsSession.storySegments}, split after each
     * pilcrow. Equal digests mean equal segments.
     */
    storySegmentUnitDigests(story: string): string[];
    /** The segments of the listed units, each as {@link YrsSession.storySegments} gives them. */
    storySegmentUnits(story: string, units: readonly number[]): YrsStorySegment[][];
    /**
     * The payload of the story's `tableIndex`-th table embed, as
     * {@link YrsSession.storySegments} gives it, or null when there is no such
     * table. Reads the one table rather than the whole story.
     */
    tablePayload(story: string, tableIndex: number): Record<string, unknown> | null;
    /** A paragraph's story span (start unit, pilcrow index). */
    locateParagraph(story: string, paraId: string): YrsParagraphSpan;
    /** How many paragraphs of `story` carry `paraId`: 0, 1, or 2 for two or more. */
    paragraphIdCount(story: string, paraId: string): number;
    /**
     * Session, persisted and source anchors of every paragraph, including the
     * source package's paragraphs outside the stories, and the Word paragraph ID
     * each saves with. Reads only.
     */
    paragraphIdentities(): DocxParagraphIdentitySnapshot;
    /**
     * Gives every paragraph that saves without a Word paragraph ID a fresh one,
     * editor-only paragraphs excepted, and repairs duplicates, so persisted
     * anchors survive save and reopen. Source IDs and saved claims keep their
     * IDs over unsaved claims and copies. A replicated change outside undo
     * history that later saves keep; a refusal changes nothing.
     */
    persistParagraphIds(): DocxParagraphIdentityReceipt;
    /** Resolves an anchor to the paragraph that currently holds it. Reads only. */
    resolveParagraphAnchor(anchor: DocxParagraphAnchor): DocxParagraphAnchorResult;
    /** The Word paragraph ID each paragraph of a story saves with, in pilcrow order. @internal */
    storyParagraphIds(story: string): Array<string | null>;
    /** The paragraph IDs a save of the session applies. @internal */
    paragraphSavePlan(): DocxParagraphSavePlan;
    /**
     * Publishes the `[owner, paraId]` pairs a save captured and returns those
     * whose binding changed since. @internal
     */
    recordSavedParagraphIds(saved: ReadonlyArray<readonly [string, string]>): Array<[string, string]>;
    /**
     * The Word paragraph IDs a DOCX package holds, by part URI, in document
     * order and upper case. Reads only. @internal
     */
    writtenParagraphIds(bytes: Uint8Array): Record<string, string[]>;
    /** Resolves what runs inherit under a package's `styles`. Reads only. @internal */
    runInheritance(styles: Document['package']['styles']): YrsRunInheritance;
    /**
     * The session-scoped version token. It changes on every committed change, local or remote,
     * and when the document is replaced; compare tokens only within this session.
     */
    version(): string;
    /** Paragraph texts in one view, with the version they were read at. */
    readParagraphs(request: DocxReadParagraphsRequest): DocxReadParagraphsResult;
    /**
     * Paragraph texts of the selected stories in one read. A story that cannot be read reports
     * why, and the read stops at its limits with `truncated`.
     */
    readStories(request: DocxReadStoriesRequest): DocxReadStoriesResult;
    /** Every story with its kind, container and, for a header or footer, its part and uses. */
    listStories(): DocxListStoriesResult;
    /** Exact, case-sensitive, paragraph-local search; overlapping matches count separately. */
    findText(request: DocxFindTextRequest): DocxFindTextResult;
    /** Resolves and checks an edit batch without changing anything or reserving ids. */
    validateEdits(request: DocxEditRequest): DocxValidationResult;
    /**
     * Applies every step or none, resolving all targets against `expectVersion`. Policy
     * failures are returned; malformed requests throw.
     */
    applyEdits(request: DocxEditRequest): DocxEditResult;
    /** Resolves a text target and formats it in one call. @internal */
    formatTextTarget(target: DocxTextTarget, delta: YrsInlineFormatDelta): YrsTargetEditResult;
    /** Resolves a text target and anchors side-map comment `id` over it in one call. @internal */
    commentTextTarget(target: DocxTextTarget, comment: {
        id: string;
        author: string;
        date: string;
        body: unknown;
    }): YrsTargetEditResult;
    /** Accepted-view texts around a paragraph-keyed selection. @internal */
    selectionText(range: YrsStoryRange): YrsSelectionText;
    /**
     * Proposes a round of tracked changes: every new proposal resolves against `expectVersion` and
     * the round applies as one batch outside undo history, or nothing changes. A retried id with
     * the same edit is a no-op; the same id with another edit refuses. Opening another document
     * forgets every proposal.
     * On an editor peer this registry is peer-local, invisible to worker rounds and ref API results.
     */
    proposeChanges(request: DocxProposalRequest): DocxProposalResult;
    /**
     * Sets how proposals render. Decisions change neither the document, its version nor undo
     * history; each call that changes one increments `previewVersion`.
     * On an editor peer this registry is peer-local, invisible to worker rounds and ref API results.
     */
    setProposalStates(request: DocxProposalStateRequest): DocxProposalResult;
    /**
     * Withdraws proposals, settling each as its decision previews it: accepted ones apply for good,
     * rejected and undecided ones are removed. The settlement is one change against `expectVersion`
     * outside undo history, so a later round resolves against the text the preview showed.
     * On an editor peer this registry is peer-local, invisible to worker rounds and ref API results.
     */
    withdrawProposals(request: DocxProposalWithdrawRequest): DocxProposalResult;
    /** The proposals in the order they were made. */
    getProposals(): DocxProposalSnapshot;
    /** @internal */
    mirrorWorkerDocument(mirror: YrsWorkerDocumentMirror | null): void;
    createWorkerProposalRegistry(state: DocxProposalRegistryState): DocxProposalRegistry;
    /** @internal */
    workerDocumentMirrored(): boolean;
    /** Listens for new proposals, decisions and a forgotten registry. Returns the unsubscribe. */
    onProposalChange(listener: (snapshot: DocxProposalSnapshot) => void): () => void;
    /**
     * Exports the committed document as read-only structured content with the version it was read
     * at; anchors resolve against that version. Nothing is committed, flushed or published.
     * Unusable options are refused; malformed ones throw.
     */
    exportStructured(options: DocxExportOptions): DocxExportResult<DocxStructuredContent>;
    /** {@link exportStructured} rendered as Markdown from the same read. */
    exportMarkdown(options: DocxExportOptions): DocxExportResult<DocxMarkdownContent>;
    /**
     * {@link exportStructured} with the page map of the region layout this session retains. The
     * layout must have lowered the current version from this session's stories with section,
     * settings and note metadata that describe it, and measured every font the document uses
     * with the fonts registered now; this call lays nothing out, flushes nothing and loads no
     * font, and refuses a stale or incomplete layout.
     */
    exportStructuredWithPages(options: DocxPageExportOptions): DocxExportResult<DocxPagedStructuredContent<DocxLayoutMap>>;
    /**
     * {@link exportStructuredWithPages} for an editor: `currentRequest` is the region layout
     * request it would lay the document out with now, and the retained layout must have used the
     * same fonts, measurement defaults, render environment and pagination options. @internal
     */
    exportStructuredWithPagesFor(options: DocxPageExportOptions, currentRequest: string): DocxExportResult<DocxPagedStructuredContent<DocxLayoutMap>>;
    /**
     * Lays this private session out with `fonts` alone, in a measurement font store of its own,
     * and exports it with snapshot anchors and a snapshot map. `fonts` holds the font files back
     * to back and `fontLengths` their lengths; `request`'s font chains name them by index. Throws
     * for a font the engine rejects. @internal
     */
    exportSnapshotWithPrivateFonts(fonts: Uint8Array, fontLengths: Uint32Array, request: string, options: DocxPageExportOptions): {
        ok: true;
        content: DocxPagedStructuredContent<DocxSnapshotLayoutMap>;
    } | {
        ok: false;
        failure: DocxExportFailure;
    };
    /**
     * The heading paragraphs of `story` in document order, classified as the structured export
     * classifies them. Throws for an unknown story.
     */
    headings(story: string): DocxParagraphHeading[];
    /**
     * The content controls of the committed document with the version they were read at; control
     * ids and anchors resolve against that version. Nothing is committed, flushed or published.
     * Unusable options are refused; malformed ones throw.
     */
    listContentControls(options?: DocxContentControlsOptions): DocxContentControlsResult;
    /** The controls {@link listContentControls} lists that match `query` exactly; none or several. */
    findContentControls(query: DocxContentControlQuery, options?: DocxContentControlsOptions): DocxContentControlsResult;
    /** Drops the observer and frees the wasm-side replica. Idempotent. */
    destroy(): void;
}
/** Options for {@link createYrsSession}. */
interface CreateYrsSessionOptions {
    /**
     * The yrs client id (non-negative safe integer). Omit to allocate a random
     * 32-bit id, yjs-style.
     */
    clientId?: number;
}
/**
 * Creates a yrs editing replica. The first call dynamically imports the edit
 * loader and preloads the external docx-edit wasm asset — callers must load
 * it lazily so non-editor consumers avoid the wasm startup cost.
 */
declare function createYrsSession(options?: CreateYrsSessionOptions): Promise<YrsSession>;

export { type DocxNavigationIntent as $, type DocxCommandPosition as A, type BuildCommandFrameInput as B, type DocxCommandPreflightResult as C, type DocxCommandHooksFactory as D, type DocxCommandRecoveryState as E, type DocxCommandRegistry as F, type DocxCommandReply as G, type DocxCommandSelection as H, type DocxCommandStagedPresentation as I, type DocxCommandTableContext as J, type DocxCommandViewportRequest as K, type LayoutMetaV1 as L, type DocxCommentChangeResult as M, type DocxCommentResult as N, type DocxEchoDamageDependency as O, type DocxEchoGlyphLine as P, type DocxEchoGraphemeBoundary as Q, type DocxEchoRect as R, type DocxEchoStyleRun as S, type DocxEchoTransform as T, type DocxEditState as U, type DocxEffectiveFormatting as V, type DocxEngineWorkerSourceOpened as W, type DocxFrameReservations as X, type YrsSession as Y, type DocxHostImage as Z, type DocxHostProposalGrant as _, type YrsRenderEnv as a, type DocxDocumentRead as a$, type DocxPointModifiers as a0, type DocxSelectionIntent as a1, type DocxSelectionPointIntent as a2, DocxSourceWorkerClient as a3, type DocxStagedPageBitmap as a4, type DocxStoredMarks as a5, type DocxSvgMedia as a6, type DocxWorkerCommandEngine as a7, type DocxWorkerCommandState as a8, type PreparedDocxCommand as a9, type CollaborationUpdateOrigin as aA, type CollaborationUser as aB, type YrsSidebarDisplayPoint as aC, type YrsRevisionInfo as aD, type YrsSidebarProjection as aE, type YrsStorySegmentSource$1 as aF, createYrsSidebarProjection as aG, yrsIdToNumericId as aH, type AnchorGeometryTarget as aI, type AnchorReader as aJ, type AnchorResolution as aK, type AnchorResolutionFailure as aL, type ClipboardPasteEngine as aM, type ClipboardSliceTarget as aN, type ClipboardTableReader as aO, type ClipboardTableRect as aP, type CreateYrsSessionOptions as aQ, DOCX_CLIPBOARD_FRAGMENT_VERSION as aR, DirtyProjectionStories as aS, type DocxClipboardFragment as aT, type DocxClipboardInline as aU, type DocxClipboardParagraph as aV, type DocxClipboardSlice as aW, type DocxCommentPatch as aX, type DocxDisplayRange as aY, type DocxDisplaySelectionInfo as aZ, type DocxDisplaySelectionText as a_, type ResolvedDocxCommandSelection as aa, SessionFailure as ab, takePreloadedDocxSourceWorker as ac, type CollaborationReplica as ad, type CollaborationTransport as ae, type CollaborationProviderOptions as af, type CollaborationStatus as ag, type CollaborationPeer as ah, type CollaborationCursor as ai, type CollaborationPeerListener as aj, type CollaborationStatusListener as ak, type CollaborationErrorListener as al, type PipeCursor as am, type PipePeer as an, type PipeOutput as ao, type PipeOp as ap, type AsyncCollaborationReplica as aq, type YrsSelection as ar, type CollaborationAwarenessState as as, CollaborationError as at, type CollaborationErrorCode as au, type CollaborationPresence as av, type CollaborationResolvedUser as aw, type CollaborationStatusChange as ax, type CollaborationTextInsertion as ay, type CollaborationTransportEvent as az, type DocxCommandClient as b, type DocxTableFragmentCell as b$, type DocxDocumentReadValues as b0, type DocxEngineWorkerHostModule as b1, type DocxEngineWorkerRequest as b2, type DocxEngineWorkerResponse as b3, type DocxFindDisplayMatch as b4, type DocxFindParagraphsOptions as b5, type DocxFontEnvironment as b6, type DocxFontEnvironmentEvent as b7, type DocxFontEnvironmentSnapshot as b8, type DocxFontFace as b9, type DocxProposalState as bA, type DocxProposalStateRequest as bB, type DocxProposalWithdrawRequest as bC, type DocxRangeHighlights as bD, type DocxReservation as bE, type DocxReservationAnchor as bF, type DocxReservationParagraph as bG, type DocxReservationsPayload as bH, type DocxResolvedPointPosition as bI, type DocxResolvedReservation as bJ, type DocxResolvedReservations as bK, type DocxReviewSnapshot as bL, type DocxReviewTarget as bM, type DocxReviewTargetRanges as bN, type DocxSavedDocument as bO, type DocxSavedParagraph as bP, type DocxSelectionUnit as bQ, type DocxSessionParagraphAnchor as bR, type DocxSessionSave as bS, type DocxSidebarAnchorPoints as bT, type DocxSidebarRead as bU, type DocxSidebarReader as bV, type DocxSourceOpenRequest as bW, type DocxSourceParagraphAnchor as bX, type DocxSourcePreviewOptions as bY, type DocxSourceStory as bZ, type DocxTableFragment as b_, type DocxFragmentSegment as ba, type DocxOccurrence as bb, type DocxOutlineHeading as bc, type DocxParagraphAnchor as bd, type DocxParagraphAnchorResult as be, type DocxParagraphIdAssignment as bf, type DocxParagraphIdDiagnostic as bg, type DocxParagraphIdOrigin as bh, type DocxParagraphIdRefusal as bi, type DocxParagraphIdentity as bj, type DocxParagraphIdentityReceipt as bk, type DocxParagraphIdentitySnapshot as bl, type DocxParagraphMatch as bm, type DocxParagraphOrigin as bn, type DocxParagraphRef as bo, type DocxParagraphSavePlan as bp, type DocxPersistedParagraphAnchor as bq, type DocxPresenceGeometry as br, type DocxPresencePeer as bs, type DocxProposalFailure as bt, type DocxProposalInput as bu, type DocxProposalRecord as bv, type DocxProposalRegistryState as bw, type DocxProposalRequest as bx, type DocxProposalResult as by, type DocxProposalSnapshot as bz, type DocxCommandInitRequest as c, type YrsProjectedNode as c$, type DocxTableFragmentRow as c0, type DocxToolbarMetadata as c1, DocxWorkerSaveUnavailableError as c2, EditorDirtyStories as c3, type EditorSaveRecord as c4, LAYOUT_META_VERSION as c5, MAX_TABLE_COLUMNS as c6, OPAQUE_SEED_BUDGET_BYTES as c7, OpaqueSeedBudgetError as c8, PeerMetadataError as c9, type YrsCommentReceipt as cA, type YrsContentControlValue as cB, type YrsDocxHost as cC, type YrsEngineApplyProfile as cD, type YrsHyperlinkAttrs as cE, type YrsImageGeometry as cF, type YrsInlineFormatDelta as cG, type YrsInputParagraphSeed as cH, type YrsInputParagraphSpan as cI, type YrsInputPositionMap as cJ, type YrsLoc as cK, type YrsLocProjection as cL, type YrsMediaSource as cM, type YrsNumberingProperties as cN, type YrsOpeningOptions as cO, type YrsParaOffset as cP, type YrsParagraph as cQ, type YrsParagraphAttrs as cR, type YrsParagraphLength as cS, type YrsParagraphReceipt as cT, type YrsParagraphSeed as cU, type YrsParagraphSpan as cV, type YrsParagraphTabStop as cW, type YrsPointerProjectionTarget as cX, type YrsPositionOutline as cY, YrsPositionProjection as cZ, type YrsProjectedCell as c_, type PlainTextReader as ca, type ProposalDisplayTarget as cb, type ProposalGeometryMirror as cc, type ProposalGeometryReader as cd, type ProposalGeometryRevision as ce, type ProposalGeometryTarget as cf, type RawAnchorRange as cg, type ResidentCaretPaintStyle as ch, type ResidentEngineOffscreenPage as ci, type ResidentEngineWorkerApplyResult as cj, ResidentEngineWorkerClient as ck, type ResidentEngineWorkerFrame as cl, type ResidentEngineWorkerOpened as cm, type ResidentProposalReply as cn, ResidentWorkerFailureError as co, ResidentWorkerOutOfMemoryError as cp, type RetainedLayoutMeta as cq, type TableCellAnchor as cr, type TablePayload as cs, type TablePayloadRow as ct, type YrsAuthor as cu, type YrsCellBorder as cv, type YrsCellBorders as cw, type YrsCellLoc as cx, type YrsChangeTarget as cy, type YrsCommentInfo as cz, type DocxCommandInitReply as d, hiddenRanges as d$, type YrsProjectedTable as d0, type YrsRawOp as d1, type YrsRegionLayoutProgress as d2, type YrsReplaceReceipt as d3, type YrsResidentCaretRect as d4, type YrsResidentCaretSnapshot as d5, type YrsResidentFontRegistration as d6, type YrsResidentWorkerSnapshot as d7, type YrsResidentWorkerSyncOptions as d8, type YrsResolveReceipt as d9, type YrsWorkerDocumentMirror as dA, anchorDisplayRoot as dB, anchorFailure as dC, applyClipboardFragment as dD, assertOpaqueSeedBudget as dE, breakRefusedWhileSuggesting as dF, canUseResidentEngineWorker as dG, captureSessionSave as dH, clipboardFragmentHasPictures as dI, clipboardTablePayload as dJ, compareYrsLocs as dK, computeAnchorTargetGeometry as dL, computeProposalGeometryMirror as dM, createYrsInputPositionMap as dN, createYrsLocProjectionFromOutline as dO, createYrsPositionProjection as dP, createYrsSession as dQ, decodeDocxHostJson as dR, dirtyProjectionStory as dS, displayPositionToYrsLoc as dT, documentToYrs as dU, editorSaveKeys as dV, embedPlainText as dW, findBodyMatches as dX, findParagraphs as dY, headerFooterDisplayRIds as dZ, headerFooterStory as d_, type YrsResolvedCommentAnchor as da, type YrsRevisionReceipt as db, type YrsRunInheritance as dc, type YrsRunMark as dd, type YrsSelectionContext as de, type YrsSelectionText as df, type YrsSplitReceipt as dg, type YrsStickyPosition as dh, type YrsStoryRange as di, type YrsStorySeed as dj, type YrsStorySegment as dk, type YrsStorySegmentSource as dl, type YrsTableFragmentReceipt as dm, type YrsTableInheritance as dn, type YrsTableLoc as dp, type YrsTablePropertiesPatch as dq, type YrsTableRange as dr, type YrsTableReceipt as ds, type YrsTargetEditResult as dt, type YrsTextColor as du, type YrsTextMatch as dv, type YrsTextSearchOptions as dw, type YrsTriState as dx, type YrsUndoCaptureMode as dy, type YrsWatermark as dz, type DocxCommandConnection as e, hiddenRangesForPreview as e0, hostSaveMetadata as e1, isBodyStory as e2, isLayoutMetaV1 as e3, layoutMetaSummary as e4, mergeDocxHostMetadata as e5, normalizeSeedError as e6, ownProjectedParagraphs as e7, paragraphInlineStart as e8, peerMetadataTags as e9, sessionSourcePackage as eA, storyOffsetForLoc as eB, storyPlainText as eC, tableAnchors as eD, tableBoundaryDeleteTarget as eE, tablePlainText as eF, tableRowGrid as eG, takePreloadedResidentEngineWorker as eH, textRangeToRaw as eI, validClipboardFragment as eJ, validReservationsPayload as eK, writeSessionSave as eL, yrsLocToDisplayPosition as eM, yrsLocToProjectedDisplayPosition as eN, yrsToDocument as eO, preloadDocxEngine as ea, preloadResidentEngineWorker as eb, prepareDocxBytes as ec, preparedDocxDigest as ed, projectYrsDisplayPosition as ee, proposalProjectionStories as ef, proposalRevisionPreview as eg, proposalSetIdentity as eh, readClipboardSlice as ei, readOutlineHeadings as ej, readRetainedLayoutMeta as ek, readSidebar as el, readTableFragment as em, residentCaretDeviceRect as en, residentCaretSnapshotForFrame as eo, resolveAnchorTarget as ep, resolveMirroredNavigationTarget as eq, resolveNavigationTarget as er, resolveReservations as es, resolvedTargetGeometry as et, retainPreloadedResidentEngineWorker as eu, retainReservationOwners as ev, sameYrsSelection as ew, saveEditorDocument as ex, saveYrsDocx as ey, serialWorkerSaves as ez, type DocxWorkerEditSessionOptions as f, type DocxWorkerEditSession as g, type DocxCommandFrame as h, type DocxEchoGlyphSet as i, type DocxCommandAck as j, type DocxCommandApplyContext as k, type DocxCommandApplyResult as l, type DocxCommandCheckpoint as m, type DocxCommandEchoContext as n, type DocxCommandEnvelope as o, type DocxCommandFramePayload as p, type DocxCommandHooks as q, type DocxCommandHooksEnvironment as r, type DocxCommandHost as s, type DocxCommandHostOptions as t, type DocxCommandIntent as u, type DocxCommandKind as v, type DocxCommandMethods as w, type DocxCommandPageIdentity as x, type DocxCommandPayload as y, type DocxCommandPayloads as z };
