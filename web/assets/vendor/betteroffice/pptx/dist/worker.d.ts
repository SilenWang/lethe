import { bf as StorySnapshot, C as CanvasImageResolver, ay as PptxStoryTarget, b4 as ShapeRect, aP as Proposal, bn as TextStyle, bp as TextStyleSnapshot, t as ParagraphAlignment, D as DeckSnapshot, b3 as ShapeReceipt, W as PptxEditResult, bI as PresentationSlideSummary, bJ as PresentationWireFrame, aK as PresentationHandle, V as PptxEditRequest, aX as ShapeDraft, aL as PresetShapeDraft, at as PptxReadRequest, au as PptxReadResult, bK as SessionFailure, bL as PresentationSessionOpenOptions, bM as OpenPresentationSessionOptions, bN as PptxWorkerEditorFailedError, S as SlideDisplayList, bb as SlidePrimitive, bj as TextBoxPrimitive, y as PositionedTextLine, l as HitTestResult } from './editorSession-Cl_EWgAi.js';
export { bO as PptxPeerHydrationError, as as PptxPeerNotReadyError, bP as PptxWorkerEditorAccess, bQ as PptxWorkerEditorCollaborationError, aJ as PptxWorkerEditorDisposedError, bR as PptxWorkerEditorFrame, bS as PptxWorkerEditorInteractionAccess, bT as PptxWorkerEditorOperation, bU as PptxWorkerEditorOptions, bV as PptxWorkerEditorRecovery, bW as PptxWorkerEditorReply, bX as PptxWorkerEditorSession, bY as PptxWorkerEditorStage, bZ as PptxWorkerEditorState, b_ as PresentationFrame, b$ as PresentationSession, c0 as PresentationSessionEvents, c1 as PresentationSessionFont, c2 as PresentationSessionMethods, c3 as PresentationSessionState, bv as createPptxWorkerEditorSession, bD as openPresentationSession } from './editorSession-Cl_EWgAi.js';
import { P as PipeCommandPayload, a as PipeOutputBatch, C as CollaborationPipeChannel } from './main-C6-cc0fR.js';
import { P as PptxPresenceCursor, a as PptxPresencePeer } from './types-ui_ARP0o.js';

/** Endpoint seam: ordered reliable delivery; ports and sockets may copy instead of transfer. */
interface SessionTransport {
    post(message: unknown, transfer?: Transferable[]): void;
    listen(listener: (message: unknown) => void): () => void;
    onError(listener: (error: unknown) => void): () => void;
    close(): void;
}

interface EffectiveTextStyle {
    bold: boolean;
    italic: boolean;
    underline: string;
    fontSizePt: number;
    color: string;
    fontFamily: string;
}
declare const DEFAULT_EDITOR_TEXT_STYLE: EffectiveTextStyle;
interface SelectionTextFormatting {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    textColor?: string;
    fontFamily?: string;
}
declare function selectionFormattingFromStory(story: StorySnapshot, anchor: number, focus: number, fallback: EffectiveTextStyle): SelectionTextFormatting;
declare function storyFormattingFromStory(story: StorySnapshot, fallback: EffectiveTextStyle): SelectionTextFormatting;
declare function effectiveStyleFromSelection(story: StorySnapshot, anchor: number, focus: number, fallback: EffectiveTextStyle): EffectiveTextStyle;

declare function browserFrameImages(): {
    resolve(frame: {
        media: ReadonlyMap<string, Uint8Array>;
    }): CanvasImageResolver & {
        release(): void;
    };
    dispose(): void;
};

type PresentationCommandAccessMethods = Pick<PresentationHandle, 'snapshot' | 'story' | 'findText' | 'validateEdits' | 'exportStructured' | 'exportMarkdown' | 'searchText' | 'listProposals' | 'comments' | 'previewProposal' | 'layoutProposalSlide' | 'layoutProposalDiffSlide' | 'layoutSlide' | 'encodeStateVector' | 'encodeStateAsUpdate'>;
type PresentationCommandAccessMethod = keyof PresentationCommandAccessMethods;
type PresentationCommandAccessResult = ReturnType<PresentationCommandAccessMethods[PresentationCommandAccessMethod]>;
type PresentationCommandMutationMethods = Pick<PresentationHandle, 'insertTableRow' | 'deleteTableRow' | 'insertTableColumn' | 'deleteTableColumn' | 'setShapeFill' | 'setShapeStroke' | 'setShapeAdjust' | 'removeShape' | 'bringShapeToFront' | 'sendShapeToBack' | 'bringShapeForward' | 'sendShapeBackward' | 'insertSlide' | 'deleteSlide' | 'moveSlide' | 'setSlideNotes' | 'addComment' | 'replyToComment' | 'setCommentStatus' | 'setCommentPosition' | 'removeComment' | 'setCommentFlavor' | 'propose' | 'acceptProposal' | 'rejectProposal'>;
declare const PRESENTATION_COMMAND_MUTATIONS: readonly ["insertTableRow", "deleteTableRow", "insertTableColumn", "deleteTableColumn", "setShapeFill", "setShapeStroke", "setShapeAdjust", "removeShape", "bringShapeToFront", "sendShapeToBack", "bringShapeForward", "sendShapeBackward", "insertSlide", "deleteSlide", "moveSlide", "setSlideNotes", "addComment", "replyToComment", "setCommentStatus", "setCommentPosition", "removeComment", "setCommentFlavor", "propose", "acceptProposal", "rejectProposal"];
type PresentationCommandMutation = {
    [K in keyof PresentationCommandMutationMethods]: {
        method: K;
        args: Parameters<PresentationCommandMutationMethods[K]>;
    };
}[keyof PresentationCommandMutationMethods];
interface PresentationCommandIdentity {
    session: string;
    incarnation: string;
}
interface PresentationCommandBasis {
    epoch: number;
    version: string;
}
interface PresentationCommandSelection extends PptxStoryTarget {
    kind?: 'shape';
    anchor: number;
    focus: number;
    affinity: 'upstream' | 'downstream';
    goalX?: number;
}
interface PresentationCommandObjectSelection extends Omit<PresentationCommandSelection, 'kind'> {
    kind: 'object';
    token: string;
    bounds: ShapeRect;
    rect: ShapeRect | null;
    canMove: boolean;
    canResize: boolean;
    aspectRatioLocked?: boolean;
    units: {
        x: number;
        y: number;
    };
}
type PresentationCommandSelected = PresentationCommandSelection | PresentationCommandObjectSelection;
interface PresentationCommandObjectTarget {
    slideId: string;
    shapeId: string;
    token: string;
}
type PresentationCommandSelectionReference = {
    source: 'confirmed';
    selection: PresentationCommandSelection;
} | {
    source: 'afterSeq';
    seq: number;
};
type PresentationCommandMotion = 'left' | 'right' | 'wordLeft' | 'wordRight' | 'lineStart' | 'lineEnd' | 'storyStart' | 'storyEnd' | 'up' | 'down' | 'nextCell' | 'previousCell';
type PresentationCommandFrameTag = Pick<PresentationCommandFrame, 'slideId' | 'slideRevision' | 'coversThroughSeq' | 'documentEpoch' | 'incarnation'>;
interface PresentationCommandInput {
    inputTime: number;
    undoGroup: string;
}
interface PresentationCommandTextInput extends PresentationCommandInput {
    at: PresentationCommandSelectionReference;
}
type PresentationCommandPayloads = {
    setChangeObserver: PresentationCommandInput & {
        enabled: boolean;
    };
    invoke: PresentationCommandInput & PresentationCommandMutation;
    /** An array applies every update in order as one command. */
    applyRemoteUpdate: PresentationCommandInput & {
        bytes: ArrayBuffer | readonly ArrayBuffer[];
    };
    collabPipe: PresentationCommandInput & PipeCommandPayload<PptxPresenceCursor>;
    applyEdits: PresentationCommandInput & {
        request: PptxEditRequest;
    };
    registerFont: PresentationCommandInput & {
        font: {
            family: string;
            bytes: ArrayBuffer;
            bold?: boolean;
            italic?: boolean;
        };
        fallback?: boolean;
    };
    insertTextBox: PresentationCommandInput & {
        slideId: string;
        draft: ShapeDraft;
    };
    insertShape: PresentationCommandInput & {
        slideId: string;
        draft: PresetShapeDraft;
    };
    insertPicture: PresentationCommandInput & {
        slideId: string;
        name: string;
        rect: ShapeRect;
        contentType: string;
        bytes: ArrayBuffer;
    };
    selectObject: PresentationCommandInput & {
        frame: PresentationCommandFrameTag;
    } & ({
        x: number;
        y: number;
        scale: number;
    } | {
        shapeId: string;
    });
    moveShape: PresentationCommandInput & {
        frame: PresentationCommandFrameTag;
    } & ({
        target: PresentationCommandObjectTarget;
        x: number;
        y: number;
    } | {
        at: PresentationCommandSelectionReference;
        shapeId: string;
        delta: {
            x: number;
            y: number;
        };
    });
    setShapeRect: PresentationCommandInput & {
        frame: PresentationCommandFrameTag;
        target: PresentationCommandObjectTarget;
        rect: ShapeRect;
    };
    undo: PresentationCommandInput;
    redo: PresentationCommandInput;
    activateSlide: Partial<PresentationCommandInput> & {
        slideId: string;
    };
    insertText: PresentationCommandTextInput & {
        text: string;
        style?: TextStyle;
    };
    replaceText: PresentationCommandTextInput & {
        text: string;
        style?: TextStyle;
    };
    formatText: PresentationCommandTextInput & {
        patch: TextStyle;
        toggle?: 'bold' | 'italic' | 'underline';
        fontSizeStep?: {
            direction: 'increase' | 'decrease';
            sizes: readonly number[];
        };
    };
    setParagraphAlignment: PresentationCommandTextInput & {
        alignment: ParagraphAlignment | null;
    };
    deleteBackward: PresentationCommandTextInput & {
        unit: 'codePoint';
        count?: number;
    };
    deleteForward: PresentationCommandTextInput & {
        unit: 'codePoint';
        count?: number;
    };
    paragraphBreak: PresentationCommandTextInput;
    moveSelection: PresentationCommandTextInput & {
        motion: PresentationCommandMotion;
        extend: boolean;
    };
    selectAtPoint: PresentationCommandInput & {
        at?: PresentationCommandSelectionReference;
        frame: PresentationCommandFrameTag;
        x: number;
        y: number;
        extend: boolean;
        granularity?: 'character' | 'word' | 'paragraph';
        drag?: boolean;
    };
    setSelection: PresentationCommandInput & {
        selection: PresentationCommandSelection | null;
        at?: PresentationCommandSelectionReference;
    };
    compositionStart: PresentationCommandTextInput & {
        compositionId: string;
    };
    compositionEnd: PresentationCommandInput & {
        compositionId: string;
        cancelled?: boolean;
        at?: PresentationCommandSelectionReference;
    };
    compositionCommit: PresentationCommandTextInput & {
        compositionId: string;
        text: string;
        style?: TextStyle;
    };
    setReadOnly: PresentationCommandInput & {
        readOnly: boolean;
    };
};
type PresentationCommandKind = keyof PresentationCommandPayloads;
declare const PRESENTATION_COMMAND_ADMISSION: Readonly<{
    readonly setChangeObserver: "mode";
    readonly invoke: "local-write";
    readonly applyRemoteUpdate: "remote-update";
    readonly collabPipe: "remote-update";
    readonly applyEdits: "local-write";
    readonly registerFont: "local-write";
    readonly insertTextBox: "local-write";
    readonly insertShape: "local-write";
    readonly insertPicture: "local-write";
    readonly moveShape: "local-write";
    readonly setShapeRect: "local-write";
    readonly undo: "local-write";
    readonly redo: "local-write";
    readonly insertText: "local-write";
    readonly replaceText: "local-write";
    readonly formatText: "local-write";
    readonly setParagraphAlignment: "local-write";
    readonly deleteBackward: "local-write";
    readonly deleteForward: "local-write";
    readonly paragraphBreak: "local-write";
    readonly compositionStart: "local-write";
    readonly compositionCommit: "local-write";
    readonly activateSlide: "view";
    readonly selectObject: "view";
    readonly moveSelection: "view";
    readonly selectAtPoint: "view";
    readonly setSelection: "view";
    readonly compositionEnd: "view";
    readonly setReadOnly: "mode";
}>;
type PresentationCommandIntent = {
    [K in PresentationCommandKind]: {
        kind: K;
        payload: PresentationCommandPayloads[K];
    };
}[PresentationCommandKind];
type PresentationCommandEnvelope = PresentationCommandIdentity & {
    seq: number;
    basis: PresentationCommandBasis;
    afterSeq?: number;
} & PresentationCommandIntent;
type PresentationCommandRefusalReason = 'bad-target' | 'invalid-offset' | 'stale-basis' | 'read-only' | 'dependency-refused' | 'invalid-composition' | 'invalid-payload' | 'unsupported' | 'unknown-outcome';
declare class CommandOutcomeUnknown extends Error {
    readonly seq: number;
    readonly refusal: {
        seq: number;
        reason: 'unknown-outcome';
    };
    constructor(seq: number, message: string);
}
type PresentationCommandFailure = CommandOutcomeUnknown | SessionFailure;
interface PresentationCommandOutcome {
    seq: number;
    status: 'applied' | 'noop' | 'refused' | 'cancelled';
    reason?: PresentationCommandRefusalReason;
    committed: boolean;
}
interface PresentationCommandToolbarContext {
    target: PptxStoryTarget | null;
    textContext?: 'caret' | 'range' | 'shape' | null;
    storedMarks: TextStyle;
    formatting: TextStyleSnapshot | null;
    alignment: ParagraphAlignment | null;
    hyperlink: {
        url: string;
    } | null;
    table: {
        shapeId: string;
        row: number;
        column: number;
    } | null;
    canEditText: boolean;
    echoRun?: 'before' | 'after' | null;
}
interface PresentationCommandEditState {
    readOnly: boolean;
    notes?: {
        slideId: string;
        text: string;
    } | null;
    proposals?: Proposal[];
    object?: {
        formattable: boolean;
        geometry: string | null;
        fill: string | null;
        stroke: string | null;
        strokeWidth: number | null;
        adjustments: Record<string, number>;
        order: {
            index: number;
            count: number;
        } | null;
    } | null;
    canUndo: boolean;
    canRedo: boolean;
    toolbar: PresentationCommandToolbarContext;
}
interface PresentationCommandFrame extends PresentationWireFrame {
    slideId: string;
    slideRevision: number;
    coversThroughSeq: number;
    documentEpoch: number;
    incarnation: string;
}
interface PresentationCommandAck extends PresentationCommandIdentity {
    epoch: number;
    throughSeq: number;
    version: string;
    selection: PresentationCommandSelected | null;
    editState: PresentationCommandEditState;
    outcomes: PresentationCommandOutcome[];
    dirtySlideIds: string[];
    mutationResult?: unknown;
    change?: PresentationCommandIdentity & {
        throughSeq: number;
        version: string;
        snapshot: DeckSnapshot;
    };
    updates?: {
        bytes: ArrayBuffer;
        origin: 'local' | 'remote';
    }[];
    creation?: ShapeReceipt;
    editResult?: PptxEditResult;
    fontId?: number;
    activeSlideId?: string | null;
    historyThroughSeq?: number;
    slides?: PresentationSlideSummary[];
    size?: {
        width: number;
        height: number;
    };
    frame?: PresentationCommandFrame | null;
}
interface PresentationCommandOpenOptions extends PresentationSessionOpenOptions, PresentationCommandIdentity {
    readOnly?: boolean;
    activeSlideIndex?: number;
    collaboration?: boolean;
    observeChanges?: boolean;
}
interface PresentationCommandOpenResult extends PresentationCommandAck {
    recoveryUpdate?: ArrayBuffer;
    slides: PresentationSlideSummary[];
    size: {
        width: number;
        height: number;
    };
    activeSlideId: string | null;
    frame: PresentationCommandFrame | null;
}
interface PresentationCommandFence extends PresentationCommandIdentity {
    seq: number;
}
interface PresentationCommandThumbnailRequest extends PresentationCommandIdentity {
    slideId: string;
    knownRevision?: number;
}
type PresentationCommandThumbnailResult = PresentationCommandIdentity & {
    epoch: number;
    slideId: string;
    slideRevision: number;
} & ({
    status: 'unchanged';
} | {
    status: 'refused';
    reason: 'bad-target';
} | {
    status: 'frame';
    frame: PresentationCommandFrame;
});
interface PresentationCommandSaveResult extends PresentationCommandIdentity {
    epoch: number;
    throughSeq: number;
    version: string;
    bytes: ArrayBuffer;
    recoveryUpdate?: ArrayBuffer;
}
interface PresentationCommandReadResult extends PresentationCommandAck {
    result: PptxReadResult;
}
type PresentationCommandMethods = {
    openCommandEditor(bytes: ArrayBuffer, options: PresentationCommandOpenOptions): PresentationCommandOpenResult;
    command(envelope: PresentationCommandEnvelope): PresentationCommandAck;
    thumbnailFrame(request: PresentationCommandThumbnailRequest): PresentationCommandThumbnailResult;
    flushCommandEditor(fence: PresentationCommandFence): PresentationCommandAck;
    saveCommandEditor(fence: PresentationCommandFence): PresentationCommandSaveResult;
    accessCommandEditor(fence: PresentationCommandFence, method: PresentationCommandAccessMethod, args: unknown[]): PresentationCommandAccessResult;
    checkpointCommandEditor(fence: PresentationCommandFence): PresentationCommandSaveResult;
    prepareCommandPicture(fence: PresentationCommandFence, bytes: ArrayBuffer): ArrayBuffer;
    readEditor(fence: PresentationCommandFence, request?: PptxReadRequest): PresentationCommandReadResult;
};
type PresentationCommandEvents = {
    ack: PresentationCommandAck;
    collaborationPipe: PipeOutputBatch<PptxPresencePeer>[];
};
interface PresentationCommandClient {
    readonly state: PresentationCommandOpenResult;
    dispatch(intent: PresentationCommandIntent, basis?: PresentationCommandBasis): Promise<PresentationCommandAck>;
    flush(seq?: number): Promise<PresentationCommandAck>;
    save(): Promise<Uint8Array>;
    access?<K extends PresentationCommandAccessMethod>(method: K, ...args: Parameters<PresentationCommandAccessMethods[K]>): Promise<ReturnType<PresentationCommandAccessMethods[K]>>;
    checkpoint?(): Promise<PresentationCommandSaveResult>;
    preparePicture?(bytes: ArrayBuffer): Promise<ArrayBuffer>;
    read(request?: PptxReadRequest): Promise<PresentationCommandReadResult>;
    thumbnail(slideId: string, knownRevision?: number): Promise<PresentationCommandThumbnailResult>;
    subscribe(listener: (ack: PresentationCommandAck) => void): () => void;
    subscribeFrame(listener: (frame: PresentationCommandFrame) => void): () => void;
    subscribeMedia(listener: (media: PresentationCommandFrame['media']) => void): () => void;
    subscribeUpdate?(listener: (update: Uint8Array, origin: 'local' | 'remote') => void): () => void;
    subscribeFailure(listener: (error: PresentationCommandFailure) => void): () => void;
    dispose(): Promise<void>;
}
declare const PRESENTATION_COMMAND_METHODS: {
    openCommandEditor: true;
    command: true;
    thumbnailFrame: true;
    flushCommandEditor: true;
    saveCommandEditor: true;
    readEditor: true;
    prepareCommandPicture: true;
    accessCommandEditor: true;
    checkpointCommandEditor: true;
};

declare function createPresentationCommandClient(bytes: Uint8Array | ArrayBuffer, options: PresentationCommandOpenOptions, transport: SessionTransport): Promise<PresentationCommandClient>;

/** @internal */
interface PptxWorkerSessionOptions extends OpenPresentationSessionOptions {
    readOnly?: boolean;
    observeChanges?: boolean;
    activeSlideIndex?: number;
    collaboration?: {
        clientId: number;
        initialUpdate?: Uint8Array;
    };
    signal?: AbortSignal;
    onError?(error: PptxWorkerEditorFailedError): void;
}
/** @internal */
interface PptxWorkerSession {
    readonly ready: Promise<PresentationCommandClient>;
    readonly failure: PresentationCommandFailure | undefined;
    subscribeFailure(listener: (error: PresentationCommandFailure) => void): () => void;
    dispose(): Promise<void>;
}
/** @internal */
declare class PptxWorkerUnsupportedError extends Error {
    readonly operation: string;
    readonly alternative?: string | undefined;
    readonly code = "sync-api-unavailable";
    constructor(operation: string, alternative?: string | undefined);
}
/** @internal */
declare function createPptxWorkerSession(bytes: Uint8Array | ArrayBuffer, options?: PptxWorkerSessionOptions): PptxWorkerSession;

/** @internal Settled worker outcome for one command sequence. */
type CommandOutcome = {
    seq: number;
    status: 'applied' | 'noop' | 'refused' | 'cancelled' | 'duplicate';
    reason?: string;
    committed?: false;
    affectedSeqs?: number[];
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

interface PresentationSharedInput {
    subscribeSent(listener: () => void): () => void;
    submit(intent: PresentationCommandIntent, basis: PresentationCommandBasis, after?: CommandTicket): {
        ticket: CommandTicket;
        operation: Promise<PresentationCommandAck>;
    };
}
declare const presentationSharedInputs: {
    get(client: PresentationCommandClient): PresentationSharedInput | undefined;
    set(client: PresentationCommandClient, input: PresentationSharedInput): void;
    delete(client: PresentationCommandClient): void;
};

declare function frameAssetIds(displayList: SlideDisplayList): Set<string>;

interface CommandRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface CommandGeometryLine {
    box: TextBoxPrimitive;
    line: PositionedTextLine;
    transforms: readonly SlidePrimitive[];
}
interface CommandGeometryIndex {
    hits: {
        primitive: SlidePrimitive;
        transforms: readonly SlidePrimitive[];
        clips: readonly SlidePrimitive[];
        textLength?: number;
    }[];
    lines: Map<string, CommandGeometryLine[]>;
}
type GeometryBounds = Pick<SlidePrimitive, 'x' | 'y' | 'w' | 'h' | 'transform'>;
type CaretLine = Pick<PositionedTextLine, 'columnOffset' | 'x' | 'y' | 'height' | 'start' | 'end' | 'caretStops'>;
type HitPrimitive = GeometryBounds & {
    kind: SlidePrimitive['kind'];
    shapeId?: string;
    storyId?: string;
    lines?: CaretLine[];
};
interface NavigationLine {
    line: CaretLine;
}
interface NavigationIndex {
    lines: Map<string, NavigationLine[]>;
}
interface CommandHitGeometryIndex extends NavigationIndex {
    size?: {
        width: number;
        height: number;
    };
    hits: {
        primitive: HitPrimitive;
        transforms: readonly GeometryBounds[];
        clips: readonly GeometryBounds[];
        textLength?: number;
    }[];
}
declare function decodeCommandDisplayList(frame: PresentationCommandFrame): SlideDisplayList;
declare function indexGeometry(list: SlideDisplayList): CommandGeometryIndex;
declare function indexHitGeometry(list: SlideDisplayList): CommandHitGeometryIndex;
declare function findLine<T extends NavigationLine>(index: {
    lines: Map<string, T[]>;
}, selection: PresentationCommandSelected | null): T | null;
declare function transformedRect(transforms: readonly GeometryBounds[], rect: CommandRect): CommandRect;
declare function selectionGeometry(index: CommandGeometryIndex, selection: PresentationCommandSelected | null): {
    caret: CommandRect | null;
    selectionRects: CommandRect[];
};
declare function hitGeometry(index: Pick<CommandHitGeometryIndex, 'hits'>, point: {
    x: number;
    y: number;
}, target?: PresentationCommandSelection | null, borderScale?: number): (HitTestResult & {
    affinity?: PresentationCommandSelection['affinity'];
}) | null;
interface CellHit {
    primitive: {
        kind: string;
        shapeId?: string;
        storyId?: string;
    };
    clips: readonly object[];
    textLength?: number;
}
declare function navigateGeometry(index: NavigationIndex & {
    hits?: readonly CellHit[];
}, selection: PresentationCommandSelected | null, motion: PresentationCommandMotion, extend: boolean, text?: string): PresentationCommandSelection | null;

type Channel = CollaborationPipeChannel<PptxPresenceCursor, PptxPresencePeer>;
declare function createPresentationCollaborationPipe(): {
    channel(post: (payload: PipeCommandPayload<PptxPresenceCursor>) => Promise<unknown>): Channel;
    receive(batches: readonly PipeOutputBatch<PptxPresencePeer>[]): void;
    lose(reason: string): void;
};
type Router = ReturnType<typeof createPresentationCollaborationPipe>;
/** @internal */
declare const presentationCollaborationPipes: {
    get(client: PresentationCommandClient): Router | undefined;
    set(client: PresentationCommandClient, pipe: Router): void;
    delete(client: PresentationCommandClient): void;
};

export { type CommandGeometryIndex, type CommandGeometryLine, type CommandHitGeometryIndex, CommandOutcomeUnknown, type CommandRect, DEFAULT_EDITOR_TEXT_STYLE, type EffectiveTextStyle, OpenPresentationSessionOptions, PRESENTATION_COMMAND_ADMISSION, PRESENTATION_COMMAND_METHODS, PRESENTATION_COMMAND_MUTATIONS, PptxWorkerEditorFailedError, type PptxWorkerSession, type PptxWorkerSessionOptions, PptxWorkerUnsupportedError, type PresentationCommandAccessMethod, type PresentationCommandAccessMethods, type PresentationCommandAccessResult, type PresentationCommandAck, type PresentationCommandBasis, type PresentationCommandClient, type PresentationCommandEditState, type PresentationCommandEnvelope, type PresentationCommandEvents, type PresentationCommandFailure, type PresentationCommandFence, type PresentationCommandFrame, type PresentationCommandFrameTag, type PresentationCommandIdentity, type PresentationCommandInput, type PresentationCommandIntent, type PresentationCommandKind, type PresentationCommandMethods, type PresentationCommandMotion, type PresentationCommandMutation, type PresentationCommandMutationMethods, type PresentationCommandObjectSelection, type PresentationCommandObjectTarget, type PresentationCommandOpenOptions, type PresentationCommandOpenResult, type PresentationCommandOutcome, type PresentationCommandPayloads, type PresentationCommandReadResult, type PresentationCommandRefusalReason, type PresentationCommandSaveResult, type PresentationCommandSelected, type PresentationCommandSelection, type PresentationCommandSelectionReference, type PresentationCommandTextInput, type PresentationCommandThumbnailRequest, type PresentationCommandThumbnailResult, type PresentationCommandToolbarContext, PresentationSessionOpenOptions, PresentationSlideSummary, type SelectionTextFormatting, browserFrameImages, createPptxWorkerSession, createPresentationCommandClient, decodeCommandDisplayList, effectiveStyleFromSelection, findLine, frameAssetIds, hitGeometry, indexGeometry, indexHitGeometry, navigateGeometry, presentationCollaborationPipes, presentationSharedInputs, selectionFormattingFromStory, selectionGeometry, storyFormattingFromStory, transformedRect };
