import { ad as CollaborationReplica, ae as CollaborationTransport, af as CollaborationProviderOptions, ag as CollaborationStatus, ah as CollaborationPeer, ai as CollaborationCursor, aj as CollaborationPeerListener, ak as CollaborationStatusListener, al as CollaborationErrorListener, am as PipeCursor, an as PipePeer, ao as PipeOutput, ap as PipeOp, aq as AsyncCollaborationReplica, ar as YrsSelection, Y as YrsSession } from '../index-DGvJBf34.mjs';
export { as as CollaborationAwarenessState, at as CollaborationError, au as CollaborationErrorCode, av as CollaborationPresence, aw as CollaborationResolvedUser, ax as CollaborationStatusChange, ay as CollaborationTextInsertion, az as CollaborationTransportEvent, aA as CollaborationUpdateOrigin, aB as CollaborationUser } from '../index-DGvJBf34.mjs';
import '../pagedExport-Bi89gMk0.mjs';
import '../content-DVT06V_6.mjs';
import '../formatting-p5MneNuy.mjs';
import '../docx/wrapTypes.mjs';
import '../types-bvPg3KsF.mjs';
import '../displayListQueries-6XjS7B5e.mjs';
import '../layout/pagination/index.mjs';
import '../types/document.mjs';
import '../styles-DZZz2oRy.mjs';
import '../plugin-api/index.mjs';
import '../utils/comments.mjs';
import '../utils/findReplace.mjs';
import '../utils/stylePreview.mjs';
import '../loadWasmAsset-Cr95TImt.mjs';
import '../rezip-CfwAYdV4.mjs';

declare class CollaborationProvider {
    private readonly replica;
    private readonly piped;
    private readonly asyncReplica;
    private replicaTail;
    private replicaBytes;
    private openEpoch;
    private readonly transport;
    private readonly maxFrameBytes;
    private readonly maxMessagesPerFrame;
    private readonly maxPendingBytes;
    private readonly syncChunkBytes;
    private readonly maxSyncBytes;
    private syncHeld;
    private syncHeldBytes;
    private syncJoinPending;
    private syncRequestOwed;
    private updateBatch;
    private readonly localUser;
    private readonly statusListeners;
    private readonly errorListeners;
    private readonly peerListeners;
    private readonly pendingFrames;
    private awarenessRecords;
    private readonly awarenessGenerations;
    private awarenessGeneration;
    private awarenessFloor;
    private readonly arrivalsInFlight;
    private unsubscribeReplica;
    private unsubscribeTransport;
    private hasTransportSubscription;
    private connectionStatus;
    private isSynced;
    private wantsConnection;
    private isOpen;
    private isDestroyed;
    private epoch;
    private connectAttempt;
    private nextListenerId;
    private queuedBytes;
    private isFlushing;
    /** Whether the merge the replica is handed now may report typing; a SyncStep2 may not. */
    private arrivalInfers;
    private localClock;
    private reportedClockExhaustion;
    private localCursor;
    private lastAwarenessSentAt;
    private cursorBroadcastTimer;
    private heartbeatTimer;
    private expiryTimer;
    constructor(replica: CollaborationReplica, transport: CollaborationTransport, options?: CollaborationProviderOptions);
    get status(): CollaborationStatus;
    get synced(): boolean;
    get pendingBytes(): number;
    get peers(): readonly CollaborationPeer[];
    setCursor(cursor: CollaborationCursor | null, broadcast?: boolean): void;
    onPeers(listener: CollaborationPeerListener): () => void;
    connect(): void;
    disconnect(): void;
    destroy(): void;
    onStatus(listener: CollaborationStatusListener): () => void;
    onError(listener: CollaborationErrorListener): () => void;
    private isCurrent;
    private failConnection;
    private takeTransportSubscription;
    private cleanupTransport;
    private handleTransportEvent;
    private handleOpen;
    private sendHandshake;
    private sendFullUpdate;
    private handleMessage;
    private isCurrentOpen;
    private resetReplicaQueue;
    private enqueueReplicaMessages;
    /** Queues a remote update; updates arriving while the replica is busy merge in one `applyUpdateChunks` call. */
    private enqueueRemoteUpdate;
    private respondToSyncStep1;
    /**
     * Whether the SyncStep1 owed to an opening peer waits for the held join to merge. Only a provider that chunks its
     * answers waits; one that does not asks at once with its current state vector, so a first joiner whose open nobody
     * answered still gets the SyncStep2 that ends its hold.
     */
    private defersSyncRequest;
    /**
     * Once the join merges, sends the SyncStep1 put off while it was held: the answer carries only what the join missed,
     * not a second, unchunked copy of the joined state.
     */
    private sendOwedSyncRequest;
    private sendWorkerSyncRequest;
    /**
     * A SyncStep1 sent before the held join merges asks for chunks: its state vector predates the join, so the answer can
     * be as large as the join.
     */
    private syncRequestVector;
    private sendSyncRequest;
    /**
     * Chunks only when `syncChunkBytes` is set and the SyncStep1 asks for it: that peer holds the chunks and applies them
     * as one change. A peer applying them one at a time, such as another peer in a room, would run its repairs on
     * partial states.
     */
    private chunksAnswer;
    /** Largest update a chunked sync answer may carry: `syncChunkBytes`, within one frame. */
    private syncChunkLimit;
    /**
     * Sends every update but the last as an Update and the last as the SyncStep2 that completes the answer, encoding one
     * frame at a time once all are known to fit.
     */
    private sendSyncAnswer;
    /** Holds a pre-sync update for the SyncStep2; past `maxSyncBytes` the connection fails. */
    private holdSyncUpdate;
    /** Ends holding for this connection and returns what was held. */
    private takeSyncHeld;
    private applySyncStep2;
    private applyRemoteUpdate;
    private beginArrival;
    private settleArrival;
    private setAwarenessRecords;
    private applyTypingInference;
    private forwardLocalUpdate;
    private nextAwarenessClock;
    private encodeLocalAwareness;
    private broadcastLocalAwareness;
    private scheduleCursorBroadcast;
    private clearCursorBroadcastTimer;
    private startPresence;
    private stopPresence;
    private leaveFrame;
    private sendLeaveBestEffort;
    private emitPeers;
    private sendFrame;
    private queueFrame;
    private flushPending;
    private clearPending;
    private setStatus;
    private report;
}

declare function resolvePresenceColor(clientId: number, color: unknown): string;

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

/**
 * @experimental A `CollaborationReplica` whose state lives in a worker. `CollaborationProvider` reads it
 * through `async`. The synchronous `encodeStateVector`, `encodeStateAsUpdate` and `encodeStateAsUpdateChunks`
 * throw; use their `async` counterparts, or open the editor with `legacySyncApi` for a synchronous replica.
 * `applyUpdate` and `async`'s apply methods copy the caller's updates, which stay usable.
 */
interface AsyncReplicaAdapter extends CollaborationReplica {
    readonly async: AsyncCollaborationReplica;
}
/**
 * @internal Lets a `CollaborationProvider` built on `replica` run its protocol in the worker that hosts the
 * replica, through `channel`; the provider on the calling thread then only moves transport bytes.
 */
declare function attachCollaborationPipe(replica: AsyncReplicaAdapter, channel: CollaborationPipeChannel): void;
/** @experimental Wraps a worker replica so `CollaborationProvider` and `onReplica` accept it unchanged. */
declare function createAsyncCollaborationReplica(replica: AsyncCollaborationReplica): AsyncReplicaAdapter;

interface WorkerCollaborationTarget {
    invalidate(update: Uint8Array, selection: YrsSelection | null): void;
}
declare function createDirectCollaborationReplica(session: YrsSession): CollaborationReplica;
declare function createWorkerCollaborationReplica(session: YrsSession, worker: WorkerCollaborationTarget): CollaborationReplica;

export { AsyncCollaborationReplica, type AsyncReplicaAdapter, CollaborationCursor, CollaborationErrorListener, CollaborationPeer, CollaborationPeerListener, CollaborationProvider, CollaborationProviderOptions, CollaborationReplica, CollaborationStatus, CollaborationStatusListener, CollaborationTransport, type WorkerCollaborationTarget, attachCollaborationPipe, createAsyncCollaborationReplica, createDirectCollaborationReplica, createWorkerCollaborationReplica, resolvePresenceColor };
