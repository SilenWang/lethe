export { C as CollaborationProvider, P as PRESENCE_LABEL_DURATION_MS, p as presenceColorForClientId } from './presence-C1o8TDwu.js';
import { A as AsyncCollaborationReplica, P as PptxPresenceCursor, a as PptxPresencePeer, C as CollaborationReplica } from './types-ui_ARP0o.js';
export { b as CollaborationError, c as CollaborationErrorCode, d as CollaborationErrorListener, e as CollaborationProviderOptions, f as CollaborationStatus, g as CollaborationStatusChange, h as CollaborationStatusListener, i as CollaborationTransport, j as CollaborationTransportEvent, k as CollaborationUpdateOrigin, l as CollaborationUser, m as PptxPresence, n as PptxPresenceListener, o as PptxPresenceState, p as PptxPresenceUser } from './types-ui_ARP0o.js';
import { C as CollaborationPipeChannel } from './main-C6-cc0fR.js';

/** @internal */
declare function attachCollaborationPipe(replica: AsyncCollaborationReplica, channel: CollaborationPipeChannel<PptxPresenceCursor, PptxPresencePeer>): void;
/** @internal */
declare function collaborationPipeFor(replica: AsyncCollaborationReplica | CollaborationReplica): CollaborationPipeChannel<PptxPresenceCursor, PptxPresencePeer> | undefined;

export { AsyncCollaborationReplica, CollaborationReplica, PptxPresenceCursor, PptxPresencePeer, attachCollaborationPipe, collaborationPipeFor };
