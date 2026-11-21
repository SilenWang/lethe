import { C as CollaborationReplica, a as CollaborationTransport, b as CollaborationProviderOptions, c as CollaborationStatus, A as AwarenessPeer, d as CollaborationStatusListener, e as CollaborationErrorListener, f as AwarenessListener, g as AwarenessCursor, h as AwarenessPayload, i as AwarenessUpdate, j as CollaborationUserOptions, k as CollaborationUser } from './asyncReplica-DuZEFXjI.js';
export { l as AsyncCollaborationReplica, m as AsyncReplicaAdapter, n as AwarenessCell, o as AwarenessState, p as CollaborationAwareness, q as CollaborationError, r as CollaborationErrorCode, s as CollaborationStatusChange, t as CollaborationTransportEvent, u as CollaborationUpdateOrigin, v as attachCollaborationPipe, w as collaborationPipeFor, x as createAsyncCollaborationReplica } from './asyncReplica-DuZEFXjI.js';

declare class CollaborationProvider {
    private readonly replica;
    private readonly piped;
    private readonly asyncReplica;
    private replicaTail;
    private replicaBytes;
    private updateBatch;
    private syncArrival;
    private openEpoch;
    private readonly transport;
    private readonly maxFrameBytes;
    private readonly maxMessagesPerFrame;
    private readonly maxPendingBytes;
    private readonly statusListeners;
    private readonly errorListeners;
    private readonly awarenessListeners;
    private readonly awarenessStore;
    private readonly awarenessUser;
    private readonly pendingFrames;
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
    private transportCleanup;
    private statusRevision;
    private awarenessClock;
    private reportedClockExhaustion;
    private awarenessCursor;
    private lastAwarenessSentAt;
    private awarenessBroadcastTimer;
    private awarenessHeartbeatTimer;
    private awarenessExpiryTimer;
    private hasPublishedAwarenessForOpen;
    constructor(replica: CollaborationReplica, transport: CollaborationTransport, options?: CollaborationProviderOptions);
    get status(): CollaborationStatus;
    get synced(): boolean;
    get pendingBytes(): number;
    get peers(): readonly AwarenessPeer[];
    connect(): void;
    private connectPipedTransport;
    private startConnection;
    disconnect(): void;
    destroy(): void;
    onStatus(listener: CollaborationStatusListener): () => void;
    onError(listener: CollaborationErrorListener): () => void;
    onAwareness(listener: AwarenessListener): () => void;
    setCursor(cursor: AwarenessCursor | null): void;
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
    /** Remote updates that arrive while the replica is busy join the queued batch and merge in one call. */
    private enqueueRemoteUpdates;
    private respondToSyncStep1;
    private beginArrival;
    private leaveFrame;
    private applyRemoteUpdate;
    private forwardLocalUpdate;
    private publishAwareness;
    private startAwarenessTimers;
    private stopAwarenessTimers;
    private clearAwarenessPeers;
    private emitAwareness;
    private sendFrame;
    private sendBestEffort;
    private queueFrame;
    private flushPending;
    private clearPending;
    private setStatus;
    private report;
}

declare const AWARENESS_BROADCAST_INTERVAL_MS = 80;
declare const AWARENESS_HEARTBEAT_INTERVAL_MS = 20000;
declare const AWARENESS_PEER_TIMEOUT_MS = 45000;
declare const AWARENESS_LABEL_DURATION_MS = 3000;
declare const XLSX_MAX_ROWS = 1048576;
declare const XLSX_MAX_COLUMNS = 16384;
declare const MAX_TRACKED_AWARENESS_PEERS = 1024;
declare const AWARENESS_COLORS: readonly ["#0B57D0", "#B3261E", "#146C2E", "#6B4EFF", "#8E24AA", "#00639B", "#8E4E00", "#7D5260"];
interface AwarenessPeerEntry {
    clock: number;
    state: AwarenessPayload | null;
    lastSeen: number;
    cursorMovedAt: number;
}
type AwarenessPeerStore = Map<number, AwarenessPeerEntry>;
interface ApplyAwarenessUpdateOptions {
    maxPeers?: number;
    onPeersDiscarded?: (count: number) => void;
}
interface ResolvedAwarenessCursor {
    sheetIndex: number;
    range: {
        top: number;
        left: number;
        bottom: number;
        right: number;
    };
}
declare function colorForClientId(clientId: number): string;
declare function normalizeAwarenessColor(color: unknown, clientId: number): string;
declare function normalizeCollaborationUser(user: CollaborationUserOptions | undefined, clientId: number): CollaborationUser;
declare function applyAwarenessUpdates(store: AwarenessPeerStore, updates: readonly AwarenessUpdate[], localClientId: number, now: number, options?: ApplyAwarenessUpdateOptions): boolean;
declare function expireAwarenessPeers(store: AwarenessPeerStore, now: number, timeout?: number): boolean;
declare function awarenessPeers(store: AwarenessPeerStore): AwarenessPeer[];
declare function resolveAwarenessCursor(cursor: AwarenessCursor, sheetIds: readonly string[], rows?: number, columns?: number): ResolvedAwarenessCursor | null;

export { AWARENESS_BROADCAST_INTERVAL_MS, AWARENESS_COLORS, AWARENESS_HEARTBEAT_INTERVAL_MS, AWARENESS_LABEL_DURATION_MS, AWARENESS_PEER_TIMEOUT_MS, type ApplyAwarenessUpdateOptions, AwarenessCursor, AwarenessListener, AwarenessPayload, AwarenessPeer, type AwarenessPeerEntry, type AwarenessPeerStore, AwarenessUpdate, CollaborationErrorListener, CollaborationProvider, CollaborationProviderOptions, CollaborationReplica, CollaborationStatus, CollaborationStatusListener, CollaborationTransport, CollaborationUser, CollaborationUserOptions, MAX_TRACKED_AWARENESS_PEERS, type ResolvedAwarenessCursor, XLSX_MAX_COLUMNS, XLSX_MAX_ROWS, applyAwarenessUpdates, awarenessPeers, colorForClientId, expireAwarenessPeers, normalizeAwarenessColor, normalizeCollaborationUser, resolveAwarenessCursor };
