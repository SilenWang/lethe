type CollaborationUpdateOrigin = 'local' | 'remote';
interface CollaborationReplica {
    readonly clientId: number;
    encodeStateVector(): Uint8Array;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array;
    applyUpdate(update: Uint8Array): unknown;
    onUpdate(listener: (update: Uint8Array, origin: CollaborationUpdateOrigin) => void): () => void;
    /** Replicas that wrap a PresentationHandle must forward this to it. */
    setCollaborative?(): void;
}
interface AsyncCollaborationReplica {
    readonly clientId: number;
    encodeStateVector(): Promise<Uint8Array>;
    encodeStateAsUpdate(remoteStateVector?: Uint8Array): Promise<Uint8Array>;
    /** Optional. Encodes the update for `remoteStateVector` as chunks of at most `maxChunkBytes`. */
    encodeStateAsUpdateChunks?(remoteStateVector: Uint8Array, maxChunkBytes: number): Promise<Uint8Array[]>;
    applyUpdate(update: Uint8Array): Promise<unknown>;
    /** Optional. Resolves once the worker has merged the updates as a single change. */
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
    maxFrameBytes?: number;
    maxMessagesPerFrame?: number;
    maxPendingBytes?: number;
    user?: CollaborationUser;
}
type CollaborationStatusListener = (change: CollaborationStatusChange) => void;
type CollaborationErrorListener = (error: CollaborationError) => void;
interface CollaborationUser {
    name: string;
    color?: string;
}
interface PptxPresenceUser {
    name: string;
    color: string;
}
interface PptxPresenceCursor {
    slideId: string;
    shapeId?: string;
}
interface PptxPresenceState {
    clientId: number;
    clock: number;
    user: PptxPresenceUser;
    cursor: PptxPresenceCursor | null;
}
interface PptxPresencePeer {
    state: PptxPresenceState;
    lastSeen: number;
    cursorMovedAt: number;
}
type PptxPresenceListener = (peers: readonly PptxPresencePeer[]) => void;
interface PptxPresence {
    readonly peers: readonly PptxPresencePeer[];
    setCursor(cursor: PptxPresenceCursor | null): void;
    onPresence(listener: PptxPresenceListener): () => void;
}

export { type AsyncCollaborationReplica as A, type CollaborationReplica as C, type PptxPresenceCursor as P, type PptxPresencePeer as a, CollaborationError as b, type CollaborationErrorCode as c, type CollaborationErrorListener as d, type CollaborationProviderOptions as e, type CollaborationStatus as f, type CollaborationStatusChange as g, type CollaborationStatusListener as h, type CollaborationTransport as i, type CollaborationTransportEvent as j, type CollaborationUpdateOrigin as k, type CollaborationUser as l, type PptxPresence as m, type PptxPresenceListener as n, type PptxPresenceState as o, type PptxPresenceUser as p };
