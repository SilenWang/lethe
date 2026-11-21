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
interface PipeCommandPayload<C = PipeCursor> {
    provider: number;
    ops: PipeOp<C>[];
}

type CollaborationUpdateOrigin = 'local' | 'remote';
interface CollaborationReplica {
    readonly clientId: number;
    encodeStateVector(): Uint8Array;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    applyUpdate(update: Uint8Array): unknown;
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
    /** Starts one attempt; after close, reopen internally or require another provider.connect(). */
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
interface CollaborationUser {
    name: string;
    color: string;
}
interface CollaborationUserOptions {
    name: string;
    color?: string;
}
interface AwarenessCell {
    row: number;
    col: number;
}
interface AwarenessCursor {
    sheet: string;
    anchor: AwarenessCell;
    head: AwarenessCell;
}
interface AwarenessPayload {
    user: CollaborationUser;
    cursor: AwarenessCursor | null;
}
interface AwarenessState extends AwarenessPayload {
    clientId: number;
    clock: number;
}
interface AwarenessUpdate {
    clientId: number;
    clock: number;
    state: AwarenessPayload | null;
}
interface AwarenessPeer extends AwarenessState {
    lastSeen: number;
    cursorMovedAt: number;
}
interface CollaborationAwareness {
    readonly peers: readonly AwarenessPeer[];
    setCursor(cursor: AwarenessCursor | null): void;
    onAwareness(listener: AwarenessListener): () => void;
}
type CollaborationErrorCode = 'backpressure' | 'protocol' | 'replica' | 'transport';
declare class CollaborationError extends Error {
    readonly code: CollaborationErrorCode;
    readonly cause: unknown;
    constructor(code: CollaborationErrorCode, message: string, cause?: unknown);
}
interface CollaborationProviderOptions {
    maxFrameBytes?: number;
    maxMessagesPerFrame?: number;
    maxPendingBytes?: number;
    user?: CollaborationUserOptions;
}
type CollaborationStatusListener = (change: CollaborationStatusChange) => void;
type CollaborationErrorListener = (error: CollaborationError) => void;
type AwarenessListener = (peers: readonly AwarenessPeer[]) => void;

/** One provider's line to the worker that runs it. */
interface CollaborationPipeEndpoint<C = PipeCursor> {
    /** Runs `ops` in the worker, in order after earlier posts; settles once the worker has run them. */
    post(ops: PipeOp<C>[], transfer: ArrayBuffer[]): Promise<unknown>;
    close(): void;
}
/** What a worker replica offers a provider that can run in its worker. */
interface CollaborationPipeChannel<C = PipeCursor, P = PipePeer> {
    /** `receive` takes the worker's output for this provider; `lost` reports the worker is gone for it. */
    open(receive: (out: readonly PipeOutput<P>[]) => void, lost: (reason: string) => void): CollaborationPipeEndpoint<C>;
}

/** @experimental */
interface AsyncCollaborationReplica {
    readonly clientId: number;
    encodeStateVector(): Promise<Uint8Array>;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Promise<Uint8Array>;
    applyUpdate(update: Uint8Array): Promise<unknown>;
    /** Applies updates in order as one merge; rejects at the first refused update, keeping the ones before it. */
    applyUpdateChunks?(updates: readonly Uint8Array[]): Promise<unknown>;
    onUpdate(listener: (update: Uint8Array, origin: CollaborationUpdateOrigin) => void): () => void;
}
/** @experimental */
interface AsyncReplicaAdapter extends CollaborationReplica {
    readonly async: AsyncCollaborationReplica;
}
/** @internal */
declare function attachCollaborationPipe(adapter: AsyncReplicaAdapter, channel: CollaborationPipeChannel<AwarenessCursor, AwarenessPeer> | undefined): void;
/** @internal */
declare function collaborationPipeFor(replica: CollaborationReplica): CollaborationPipeChannel<AwarenessCursor, AwarenessPeer> | undefined;
/** @experimental */
declare function createAsyncCollaborationReplica(replica: AsyncCollaborationReplica): AsyncReplicaAdapter;

export { type AwarenessPeer as A, type CollaborationReplica as C, type PipeCommandPayload as P, type CollaborationTransport as a, type CollaborationProviderOptions as b, type CollaborationStatus as c, type CollaborationStatusListener as d, type CollaborationErrorListener as e, type AwarenessListener as f, type AwarenessCursor as g, type AwarenessPayload as h, type AwarenessUpdate as i, type CollaborationUserOptions as j, type CollaborationUser as k, type AsyncCollaborationReplica as l, type AsyncReplicaAdapter as m, type AwarenessCell as n, type AwarenessState as o, type CollaborationAwareness as p, CollaborationError as q, type CollaborationErrorCode as r, type CollaborationStatusChange as s, type CollaborationTransportEvent as t, type CollaborationUpdateOrigin as u, attachCollaborationPipe as v, collaborationPipeFor as w, createAsyncCollaborationReplica as x };
