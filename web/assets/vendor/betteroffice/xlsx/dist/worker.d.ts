import { bD as WorkbookReplayReply, bE as WorkbookEditPeer, bF as WorkbookReplayMethod, bG as WorkbookReplayOp } from './editPeer-DiFeIMPk.js';
export { bH as CommandBasis, bI as CommandIdentity, bJ as CommandStatus, J as OpenWorkbookSessionOptions, bK as WorkbookAck, a5 as WorkbookCellGeometry, a6 as WorkbookCellInputs, bL as WorkbookCommand, bM as WorkbookCommandContext, bN as WorkbookCommandFrame, bO as WorkbookCommandFrameRequest, bP as WorkbookCommandKind, bQ as WorkbookCommandPayload, bR as WorkbookCommandSelection, bS as WorkbookCommandTicket, bT as WorkbookEchoHooks, bU as WorkbookEditConnection, bV as WorkbookEditFrame, bW as WorkbookEditPayload, a7 as WorkbookEditPeerFailedError, bX as WorkbookEditPeerOptions, a8 as WorkbookEditSession, bY as WorkbookEditState, a9 as WorkbookFrame, aa as WorkbookFrameOptions, ad as WorkbookInitialPaint, ae as WorkbookInitialPaintRequest, af as WorkbookPeerHydrationError, ag as WorkbookPngUnavailableError, ah as WorkbookRecoveryReplayError, ai as WorkbookSession, aj as WorkbookSessionEvents, ak as WorkbookSessionMethods, al as WorkbookSessionOpenOptions, am as WorkbookSessionOpenReply, an as WorkbookSessionRecovery, ao as WorkbookSessionState, bZ as WorkbookSharedAck, b_ as WorkbookSharedCommand, b$ as WorkbookSharedOutcome, c0 as WorkbookSharedWireAck, ap as WorkbookSheetSummary, aq as WorkbookSheetView, c1 as WorkbookSubmitOptions, c2 as WorkbookTicketOutcome, c3 as createWorkbookEditPeer, bq as createWorkbookEditSession, c4 as hydratePeer, bz as openWorkbookSession, c5 as workbookSessionInternals, bC as workbookSessionRecovery } from './editPeer-DiFeIMPk.js';
import './types-DdoEoFSX.js';
import './asyncReplica-DuZEFXjI.js';

/** @internal */
declare function localNowSerial(ms: number): number;

interface WorkbookEditPeerOperations {
    fail(error: unknown): void;
    whenAcknowledged(): Promise<void>;
    applyQueuedOp(op: WorkbookReplayOp): WorkbookReplayReply['result'];
    applyRecoveryOp(op: WorkbookReplayOp): WorkbookReplayReply['result'];
}
declare class WorkbookRecoveryRefusal extends Error {
    readonly result: WorkbookReplayReply['result'];
    constructor(result: WorkbookReplayReply['result']);
}
/** @internal */
declare function failWorkbookEditPeer(peer: WorkbookEditPeer, error: unknown): void;
declare function workbookEditPeerOperations(peer: WorkbookEditPeer): WorkbookEditPeerOperations;
/** @internal */
declare function createWorkbookRecoveryMutators(peer: WorkbookEditPeer): Pick<WorkbookEditPeer, WorkbookReplayMethod>;

export { WorkbookEditPeer, WorkbookRecoveryRefusal, WorkbookReplayOp, createWorkbookRecoveryMutators, failWorkbookEditPeer, localNowSerial, workbookEditPeerOperations };
