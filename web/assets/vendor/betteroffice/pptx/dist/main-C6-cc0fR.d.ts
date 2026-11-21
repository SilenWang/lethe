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

export type { CollaborationPipeChannel as C, PipeCommandPayload as P, PipeOutputBatch as a };
