import { f as SectionProperties } from './content-DVT06V_6.mjs';

type SectionStartKind = 'nextPage' | 'continuous' | 'evenPage' | 'oddPage';
interface SectionPropertyPatch {
    orientation?: 'portrait' | 'landscape';
    pageWidth?: number;
    pageHeight?: number;
    margins?: Partial<Record<'top' | 'bottom' | 'left' | 'right' | 'header' | 'footer' | 'gutter', number>>;
}
interface SectionInfo {
    closingParagraphId: string;
    firstParagraph: number;
    lastParagraph: number;
    authored: SectionProperties;
    resolved: SectionProperties;
}
declare class DocxSectionError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}

/**
 * Result envelopes shared by the formats' host edit APIs. Targets, steps, receipts and failure
 * codes stay format-owned; these shapes only fix how every format reports success and refusal.
 */
/** Why a host operation was refused, as data. The document is unchanged. */
interface OperationFailure<Code extends string, Target> {
    code: Code;
    /** The request step that failed, when one did. */
    stepIndex?: number;
    /** The earlier step an `overlapping-steps` failure conflicts with. */
    conflictingStepIndex?: number;
    /** The failing step's target as requested or resolved. */
    target?: Target;
    message: string;
}
/** A policy refusal carrying the version the document is still at. */
interface OperationRefusal<Failure> {
    ok: false;
    version: string;
    failure: Failure;
}
/**
 * An accepted edit request. `applied` is false when every step was a no-op; the version then
 * stays `baseVersion` and no history or change notification was produced.
 */
interface EditSuccess<Receipt> {
    ok: true;
    baseVersion: string;
    version: string;
    applied: boolean;
    /** One receipt per request step, in request order. */
    receipts: Receipt[];
}
/** A validated edit request. Validation reserves nothing and cannot be committed later. */
interface ValidationSuccess<Preview> {
    ok: true;
    baseVersion: string;
    wouldApply: boolean;
    previews: Preview[];
}

/**
 * Shapes shared by the formats' read-only structured exports. Content trees, anchors, story or
 * sheet selectors, diagnostic codes and limits stay format-owned; these only fix how every format
 * reports diagnostics, truncation and Markdown markers.
 */
type ExportSeverity = 'info' | 'warning' | 'error';
/** Something an export omitted or could not represent, anchored where it applies. */
interface ExportDiagnostic<Code extends string, Anchor> {
    code: Code;
    severity: ExportSeverity;
    anchor: Anchor | null;
    message: string;
}
/** Whether an export stopped at its limits before the end of the content. */
interface ExportCompletion {
    truncated: boolean;
}
/** A Markdown marker comment and the anchor of the content it precedes. */
interface MarkdownAnchor<Anchor> {
    marker: string;
    anchor: Anchor;
}

/**
 * Read types shared by the DOCX read APIs: where read content lives, which stories a read
 * covers, heading classification and content-control metadata. Plain JSON, produced by Rust.
 */

/**
 * Where a piece of read content lives. Paragraph, range, table and control anchors resolve
 * against the version or snapshot they were read at; table indices and control ids are not stable
 * across saves. A `sourcePart` anchor addresses retained source XML (the part, its SHA-256 and
 * zero-based element-child ordinals from the part's root); it is provenance, not an edit target.
 * An `unlocated` anchor marks content of `story` with no location of its own, and says why.
 */
type DocxAnchor = {
    kind: 'paragraph';
    story: string;
    paraId: string;
} | ({
    kind: 'range';
} & DocxTextRange) | {
    kind: 'table';
    story: string;
    tableIndex: number;
} | {
    kind: 'control';
    story: string;
    controlId: string;
} | {
    kind: 'sourcePart';
    part: string;
    partSha256: string;
    path: number[];
} | {
    kind: 'unlocated';
    story: string;
    reason: DocxUnlocatedReason;
};
/**
 * Why content has no location: another paragraph of the story carries the same id, the story is
 * too large to read within `maxBytes` or does not exist, or content the editing stream leaves out
 * can no longer be found in its source XML.
 */
type DocxUnlocatedReason = 'duplicate-paragraph-id' | 'story-too-large' | 'missing-story' | 'provenance-unavailable';
/** A category of stories a read covers. */
type DocxStorySelection = 'body' | 'headers' | 'footers' | 'footnotes' | 'endnotes' | 'comments';
/**
 * A content control's identity and properties. `controlId` is the engine identity, distinct from
 * the authored `w:id` (`ooxmlId`), tag and alias, none of which need be unique.
 */
interface DocxControlMetadata {
    controlId: string;
    ooxmlId: string | null;
    controlType: string;
    tag: string | null;
    alias: string | null;
    lock: string | null;
    showingPlaceholder: boolean;
    dataBound: boolean;
}
/**
 * A zero-based outline level (0..8). Direct formatting wins, then the paragraph style with
 * inheritance, then document defaults; only without any of them does a `HeadingN` style id count.
 */
interface DocxHeadingInfo {
    outlineLevel: number;
    source: {
        kind: 'direct';
    } | {
        kind: 'style';
        styleId: string;
    } | {
        kind: 'documentDefault';
    } | {
        kind: 'builtinStyleId';
        styleId: string;
    };
}
/** A heading paragraph of a story. */
interface DocxParagraphHeading {
    paraId: string;
    heading: DocxHeadingInfo;
}

/**
 * Read-only structured export of DOCX content: ordered stories of typed blocks and inlines, each
 * with the location it was read from, and diagnostics for everything omitted or unrepresentable.
 * Plain JSON, produced by one Rust walker for sessions, bytes and the native facade.
 *
 * Text, tab and atom inlines carry `range` anchors into the projected text of their view (the
 * batch projection: tabs are `\t`, every other atom one U+FFFC). In the markup view inserted and
 * unchanged text use accepted-view ranges and deleted text original-view ranges. Children of an
 * atom carry the atom's or control's anchor. Ids are deterministic export-tree paths.
 */

type DocxRevisionView = 'accepted' | 'original' | 'markup';
/** `session` anchors resolve against the returned version; `snapshot` ones against the content. */
type DocxAnchorScope = 'session' | 'snapshot';
type DocxStoryKind = 'body' | 'header' | 'footer' | 'footnote' | 'endnote' | 'comment';
interface DocxStructuredContent extends ExportCompletion {
    schemaVersion: 1;
    revisionView: DocxRevisionView;
    anchorScope: DocxAnchorScope;
    includedStories: DocxStorySelection[];
    includeFormatting: boolean;
    stories: DocxExportStory[];
    diagnostics: DocxExportDiagnostic[];
}
/** One story. Table cells and block controls nest inside the blocks that own them. */
interface DocxExportStory {
    story: string;
    kind: DocxStoryKind;
    part: string | null;
    noteId: string | null;
    comment: DocxCommentMetadata | null;
    /** The sections referencing a header or footer part, inheritance applied. */
    uses: Array<{
        sectionIndex: number;
        variant: 'default' | 'first' | 'even';
    }>;
    blocks: DocxExportBlock[];
}
interface DocxCommentMetadata {
    id: string;
    author: string | null;
    date: string | null;
    parentId: string | null;
    resolved: boolean;
    /** The ranges the comment annotates. */
    anchors: DocxAnchor[];
}
interface DocxParagraphData {
    styleId: string | null;
    inlines: DocxExportInline[];
}
/** `format` is the OOXML numbering format; `marker` the rendered marker, `null` if unresolved. */
interface DocxListInfo {
    numId: string;
    abstractNumId: string | null;
    level: number;
    format: string;
    marker: string | null;
    suffix: 'tab' | 'space' | 'nothing';
    markerHidden: boolean;
}
type DocxExportBlock = {
    id: string;
    anchor: DocxAnchor;
} & ({
    kind: 'paragraph';
    paragraph: DocxParagraphData;
} | {
    kind: 'heading';
    paragraph: DocxParagraphData;
    heading: DocxHeadingInfo;
}
/** A numbered heading is a list item with a heading. */
 | {
    kind: 'listItem';
    paragraph: DocxParagraphData;
    list: DocxListInfo;
    heading: DocxHeadingInfo | null;
} | {
    kind: 'table';
    table: DocxExportTable;
} | {
    kind: 'contentControl';
    control: DocxControlMetadata;
    story: string | null;
    blocks: DocxExportBlock[];
}
/** The break that starts section `sectionIndex`, typed by that section's start. */
 | {
    kind: 'sectionBreak';
    sectionIndex: number;
    breakType: 'continuous' | 'nextPage' | 'nextColumn' | 'oddPage' | 'evenPage';
}
/** A page or column break between blocks. */
 | {
    kind: 'break';
    breakType: 'page' | 'column';
} | {
    kind: 'unsupported';
    element: string;
});
/**
 * A table on its zero-based grid. Every covered grid position of a row appears once, as a cell
 * owning content or as a vertical-merge continuation (`rowSpan: 0`) naming its origin.
 */
interface DocxExportTable {
    gridColumns: number;
    rows: Array<{
        header: boolean;
        gridBefore: number;
        gridAfter: number;
        cells: DocxExportCell[];
    }>;
}
interface DocxExportCell {
    anchor: DocxAnchor;
    story: string | null;
    column: number;
    gridSpan: number;
    rowSpan: number;
    verticalMerge: 'none' | 'restart' | 'continue';
    mergeOrigin: {
        row: number;
        column: number;
    } | null;
    blocks: DocxExportBlock[];
}
type DocxExportInline = {
    id: string;
    anchor: DocxAnchor;
    /** `null` when the export excludes formatting. */
    marks: DocxFormattingMark[] | null;
    link: {
        href: string;
        title: string | null;
    } | null;
    /** Revision attribution; only the markup view carries any. */
    revisions: DocxInlineRevision[];
} & ({
    kind: 'text';
    text: string;
} | {
    kind: 'tab';
} | {
    kind: 'break';
    breakType: 'line' | 'page' | 'column';
} | {
    kind: 'noteReference';
    noteKind: 'footnote' | 'endnote';
    noteId: string;
    story: string | null;
} | {
    kind: 'commentReference';
    commentId: string;
    story: string | null;
}
/** A field with its cached result; never evaluated. */
 | {
    kind: 'field';
    fieldType: string;
    instruction: string;
    cachedResult: DocxCachedResult;
    dirty: boolean;
    locked: boolean;
} | {
    kind: 'image';
    altText: string | null;
    relationshipId: string | null;
    part: string | null;
    externalTarget: string | null;
} | {
    kind: 'contentControl';
    control: DocxControlMetadata;
    inlines: DocxExportInline[];
} | {
    kind: 'unsupported';
    element: string;
    altText: string | null;
});
type DocxCachedResult = {
    kind: 'missing';
} | {
    kind: 'inline';
    inlines: DocxExportInline[];
} | {
    kind: 'blocks';
    blocks: DocxExportBlock[];
};
type DocxFormattingMark = {
    kind: 'bold' | 'italic' | 'strike' | 'subscript' | 'superscript' | 'hidden';
} | {
    kind: 'underline';
    style: string;
};
interface DocxInlineRevision {
    kind: 'insertion' | 'deletion' | 'moveFrom' | 'moveTo';
    id: string | null;
    author: string | null;
    date: string | null;
}
type DocxExportDiagnosticCode = 'unsupported-content' | 'unsupported-revision' | 'unsupported-numbering' | 'unresolved-style' | 'unresolved-reference' | 'provenance-unavailable' | 'ambiguous-identity' | 'image-data-omitted' | 'field-cached-result' | 'missing-field-result' | 'formatting-omitted' | 'stories-omitted' | 'revision-content-excluded' | 'merge-continuation-content-omitted' | 'legacy-control-value' | 'parse-warning' | 'truncated' | 'markdown-lossy';
type DocxExportDiagnostic = ExportDiagnostic<DocxExportDiagnosticCode, DocxAnchor>;
/**
 * What to export. `revisionView` is required; `stories` defaults to `['body']`,
 * `includeFormatting` to `true`, `maxBlocks` to 10,000 (at most 1,000,000; every nested block
 * counts) and `maxBytes` to 8,388,608 (1,024 to 67,108,864, measured on the compact JSON).
 */
interface DocxExportOptions {
    revisionView: DocxRevisionView;
    stories?: readonly DocxStorySelection[];
    includeFormatting?: boolean;
    maxBlocks?: number;
    maxBytes?: number;
}
/** `maxBytes` bounds the Markdown text; the default and range are the export's. */
interface DocxMarkdownOptions {
    maxBytes?: number;
}
/**
 * Markdown rendered from structured content. Each `<!-- docx-export:N -->` marker precedes the
 * block `anchors` maps it to. Markdown keeps no Word pagination, typography or layout.
 */
interface DocxMarkdownContent extends ExportCompletion {
    markdown: string;
    anchors: MarkdownAnchor<DocxAnchor>[];
    diagnostics: DocxExportDiagnostic[];
}
/**
 * Options out of range or above a hard maximum, or a session holding no document content.
 * Unsupported document content is diagnosed, never refused. A paged export also refuses a
 * layout older than the document (`stale-document`), one whose fonts, options or named version
 * changed (`stale-layout`), no retained or measurable layout (`layout-unavailable`), a revision
 * view the markup pages do not show (`unsupported-revision-layout`) and notes that did not
 * settle (`layout-not-converged`).
 */
type DocxExportFailureCode = 'invalid-options' | 'limit-exceeded' | 'unsupported' | 'stale-document' | 'stale-layout' | 'layout-unavailable' | 'unsupported-revision-layout' | 'layout-not-converged';
/** Why an export was refused; `target` is the anchor the refusal concerns, if any. */
interface DocxExportFailure {
    code: DocxExportFailureCode;
    target: DocxAnchor | null;
    message: string;
}
type DocxExportRefusal = OperationRefusal<DocxExportFailure>;
/** A session export: the content with the version it was read at, or a refusal. */
type DocxExportResult<T> = {
    ok: true;
    version: string;
    content: T;
} | DocxExportRefusal;

/**
 * Content-control discovery: every control of a document in document order, with the metadata the
 * structured export reports, its canonical text, placement, anchor, nesting and effective lock.
 * Plain JSON, produced by one Rust inventory for sessions, bytes, the native facade and Python.
 *
 * `controlId` is an opaque engine locator scoped to the version (or snapshot) it was read at; it
 * does not survive save and reopen. An inline control's id can name a different control after
 * edits, so list again after a version change or select by tag or `ooxmlId`. Fill controls with a
 * `setContentControlText` edit step; concurrent fills from collaborators resolve last-writer-wins
 * for an inline control and merge like concurrent typing for a block control.
 */

/**
 * A control's canonical displayed text: tabs stay tabs, line breaks and paragraph boundaries read
 * as LF. `unavailable` when the content has no faithful text projection or the session cannot
 * read it.
 */
type DocxContentControlValue = {
    kind: 'text';
    text: string;
} | {
    kind: 'unavailable';
    reason: 'non-text-content' | 'tracked-revisions' | 'provenance-unavailable' | 'unsupported-story';
};
/**
 * One content control. `lock` is the control's own authored lock; `effectiveLock` combines it
 * with every control containing it, and `known` is false when any of them carries a lock value
 * the engine does not know.
 */
interface DocxContentControl extends DocxControlMetadata {
    placement: 'inline' | 'block';
    anchor: DocxAnchor;
    parentControlId: string | null;
    value: DocxContentControlValue;
    /** Whether a plain-text control accepts line breaks (`w:multiLine`); `null` for other types. */
    multiLine: boolean | null;
    effectiveLock: {
        content: boolean;
        control: boolean;
        known: boolean;
    };
}
/**
 * What to list. `stories` defaults to every category, `maxControls` to 10,000 (at most
 * 1,000,000) and `maxBytes` to 8,388,608 (1,024 to 67,108,864, measured on the compact JSON).
 * Exceeding a limit refuses with `limit-exceeded` rather than returning a prefix.
 */
interface DocxContentControlsOptions {
    stories?: readonly DocxStorySelection[];
    maxControls?: number;
    maxBytes?: number;
}
/**
 * The control a write addresses. `controlId` is the engine locator for the version it was read
 * at; `tag` is the template author's name; `ooxmlId` is the authored `w:id` as listings report it,
 * which survives save and reopen. A tag or `ooxmlId` must be carried by exactly one control of the
 * whole document.
 */
type DocxContentControlSelector = {
    kind: 'id';
    controlId: string;
} | {
    kind: 'tag';
    tag: string;
} | {
    kind: 'ooxmlId';
    ooxmlId: string;
};
/** Which controls a find returns: every exact, case-sensitive match, none trimmed. */
type DocxContentControlQuery = DocxContentControlSelector | {
    kind: 'alias';
    alias: string;
};
type DocxContentControlDiagnostic = ExportDiagnostic<DocxExportDiagnosticCode, DocxAnchor>;
/**
 * The controls of a document in document order: body, headers, footers, footnotes, endnotes,
 * comments, each control before its descendants. `complete` is false when diagnostics name a
 * coverage gap. Controls kept only as source XML (raw blocks, comment bodies) are never writable;
 * they carry `sourcePart` anchors while the package holds their current XML, and a raw block
 * changed since opening anchors its controls to the block instead.
 */
interface DocxContentControlsSnapshot {
    schemaVersion: 1;
    anchorScope: 'session' | 'snapshot';
    includedStories: DocxStorySelection[];
    controls: DocxContentControl[];
    complete: boolean;
    diagnostics: DocxContentControlDiagnostic[];
}
/** Options out of range or above a hard maximum, or a session holding no document content. */
type DocxContentControlReadFailure = DocxExportFailure;
/** A session read: the controls with the version they were read at, or a refusal. */
type DocxContentControlsResult = {
    ok: true;
    version: string;
    content: DocxContentControlsSnapshot;
} | OperationRefusal<DocxContentControlReadFailure>;

/**
 * What a session story holds. Comment bodies live outside the session's stories, so there is no
 * comment kind; `other` is a story the session cannot place, such as a header or footer story
 * whose part it does not know.
 */
type DocxStoryInfoKind = 'body' | 'tableCell' | 'contentControl' | 'header' | 'footer' | 'footnote' | 'endnote' | 'other';
/** A section that references a header or footer part, as the structured export reports it. */
type DocxStoryUse = DocxExportStory['uses'][number] & {
    /**
     * Whether this part is painted in the section. Absent before the first complete layout of
     * the current version and after an edit until the next layout; listen for `layout-change`
     * and read again.
     */
    shown?: boolean;
};
interface DocxStoryInfo {
    story: string;
    kind: DocxStoryInfoKind;
    /** The story a table cell or block content control sits in. */
    parent?: string;
    /** The top-level story this one belongs to; itself for a top-level story. */
    root: string;
    /** A header's or footer's package part, when the session was opened from DOCX bytes. */
    part?: string;
    /**
     * A header's or footer's sections whose properties reference the part, inheritance applied,
     * whether or not a page shows it; plugin anchor geometry tells where it is painted. A
     * first-page preview reads only the sections it holds, so its uses may be incomplete.
     */
    uses?: DocxStoryUse[];
}
/** Every story of the session at one version, sorted by id. */
interface DocxListStoriesResult {
    ok: true;
    version: string;
    stories: DocxStoryInfo[];
}

type DocxTextView = 'accepted' | 'original';
/** Provenance only: history and revision authorship are chosen separately. */
type DocxEditSource = 'host' | 'agent';
/** `separate`: exactly one undo step. `none`: outside undo history, keeping existing entries. */
type DocxEditHistory = 'separate' | 'none';
interface DocxParagraphTarget {
    story: string;
    paraId: string;
}
interface DocxTextPosition {
    paraId: string;
    offset: number;
}
interface DocxTextRange {
    story: string;
    start: DocxTextPosition;
    end: DocxTextPosition;
    view: DocxTextView;
}
type DocxSearchScope = {
    kind: 'story';
    story: string;
} | ({
    kind: 'paragraph';
} & DocxParagraphTarget);
/**
 * The text a step addresses: a paragraph's whole accepted text, an explicit range (both ends in
 * one paragraph), or the one exact, case-sensitive, paragraph-local match of `text`.
 */
type DocxTextTarget = ({
    kind: 'paragraph';
} & DocxParagraphTarget) | ({
    kind: 'range';
} & DocxTextRange) | {
    kind: 'search';
    text: string;
    within: DocxSearchScope;
    view: DocxTextView;
};
type DocxEditTarget = DocxTextTarget | {
    kind: 'paragraphs';
    story: string;
    firstParaId: string;
    lastParaId: string;
} | {
    kind: 'contentControl';
    selector: DocxContentControlSelector;
};
/** Refuses the step unless its target currently reads exactly `text`. */
interface DocxEditGuard {
    text: string;
}
/** Records a text step as a tracked change with host-supplied authorship. */
interface DocxEditSuggestion {
    author: string;
    date: string;
}
/** One new paragraph; without `styleId` it takes the anchor paragraph's style. */
interface DocxParagraphInput {
    text: string;
    styleId?: string;
}
type DocxEditOperation = {
    op: 'insertText';
    target: DocxTextTarget;
    at: 'start' | 'end';
    text: string;
} | {
    op: 'replaceText';
    target: DocxTextTarget;
    text: string;
} | {
    op: 'deleteText';
    target: DocxTextTarget;
} | {
    op: 'insertParagraphs';
    target: DocxParagraphTarget;
    at: 'start' | 'end';
    paragraphs: readonly DocxParagraphInput[];
} | {
    op: 'deleteParagraphs';
    story: string;
    firstParaId: string;
    lastParaId: string;
} | {
    op: 'insertSectionBreakAfter';
    target: DocxParagraphTarget;
    kind: SectionStartKind;
} | {
    op: 'setSectionProperties';
    section: string;
    properties: SectionPropertyPatch;
} | {
    op: 'setParagraphStyle';
    target: DocxParagraphTarget;
    styleId: string;
} | Omit<DocxSetContentControlTextStep, 'expect'>;
/**
 * Replaces a plain- or rich-text content control's content with plain text and clears its
 * placeholder state. CRLF becomes LF; LF is a line break (a paragraph break in a rich-text block
 * control), and a plain-text control accepts it only with `w:multiLine`. The text takes the
 * formatting of the control's first text run (a control showing its placeholder takes its own run
 * properties). `expect` compares against the control's `value`; `suggest` is refused.
 */
interface DocxSetContentControlTextStep {
    op: 'setContentControlText';
    target: DocxContentControlSelector;
    text: string;
    expect?: DocxEditGuard;
}
type DocxEditStep = (Exclude<DocxEditOperation, {
    op: 'setContentControlText';
}> & {
    expect?: DocxEditGuard;
    suggest?: DocxEditSuggestion;
}) | DocxSetContentControlTextStep;
interface DocxEditRequest {
    /** The version the targets were read at; a changed document refuses with `stale-version`. */
    expectVersion: string;
    /** Defaults to `host`. */
    source?: DocxEditSource;
    /** Defaults to `separate`. */
    history?: DocxEditHistory;
    steps: readonly DocxEditStep[];
}
/**
 * `locked-target` is locked document content. `read-only` comes only from an editor host that
 * does not accept edits, never from a session.
 */
type DocxEditFailureCode = 'stale-version' | 'missing-target' | 'ambiguous-target' | 'content-mismatch' | 'overlapping-steps' | 'locked-target' | 'read-only' | 'tracked-revision-conflict' | 'unsupported' | 'invalid-step' | 'limit-exceeded';
/** Why a `setContentControlText` step was refused, beside its failure code. */
type DocxEditFailureReason = 'missing-control' | 'missing-tag' | 'ambiguous-tag' | 'ambiguous-control-id' | 'missing-ooxml-id' | 'ambiguous-ooxml-id' | 'content-locked' | 'bound-control' | 'unsupported-control-type' | 'unsupported-children' | 'nested-controls' | 'unknown-lock' | 'unsupported-suggestion' | 'provenance-unavailable' | 'unsupported-story' | 'multiline-not-allowed' | 'invalid-text';
type DocxEditFailure = OperationFailure<DocxEditFailureCode, DocxEditTarget> & {
    reason?: DocxEditFailureReason;
};
/** The content control a step resolved to, and where it is. */
interface DocxResolvedControl {
    controlId: string;
    anchor: DocxAnchor;
}
type DocxEditRefusal = OperationRefusal<DocxEditFailure>;
/**
 * What one step did. Ranges use the final accepted view; a deletion reports its collapsed
 * boundary. `removedParagraphs` are historical ids, not anchors.
 */
interface DocxEditReceipt {
    stepIndex: number;
    changed: boolean;
    range?: DocxTextRange;
    newParagraphs: DocxParagraphTarget[];
    removedParagraphs: DocxParagraphTarget[];
    revisionIds: string[];
    control?: DocxResolvedControl;
}
/** What one step would do; it cannot be committed later. */
interface DocxEditPreview {
    stepIndex: number;
    target: DocxEditTarget;
    wouldChange: boolean;
    newParagraphCount: number;
    wouldCreateRevisions: boolean;
    control?: DocxResolvedControl;
}
type DocxEditResult = (EditSuccess<DocxEditReceipt> & {
    source: DocxEditSource;
    changedStories: string[];
}) | DocxEditRefusal;
type DocxValidationResult = ValidationSuccess<DocxEditPreview> | DocxEditRefusal;
type DocxAtomKind = 'lineBreak' | 'image' | 'contentControl' | 'noteReference' | 'field' | 'other';
/** One U+FFFC in projected text that stands for an inline atom. */
interface DocxTextAtom {
    offset: number;
    kind: DocxAtomKind;
}
/** Numbering in the requested view, counted from the start of the root story. */
interface DocxParagraphList {
    /** Rendered marker, including when hidden; null when unresolved, empty string when empty. */
    marker: string | null;
    /** Zero-based list level, 0..8. */
    level: number;
    /** OOXML numbering instance id. */
    numId: string;
    /** OOXML numFmt, including `bullet`. */
    format: string;
}
interface DocxParagraphText {
    story: string;
    paraId: string;
    text: string;
    styleId?: string;
    /** Style-resolved outline level in the requested view, 0..8, or null for body text. */
    outlineLevel?: number | null;
    /** Numbering in the requested view, counted from the root story start; null without numbering. */
    list?: DocxParagraphList | null;
    atoms: DocxTextAtom[];
}
interface DocxReadParagraphsRequest {
    /** Defaults to `body`; child stories are never included implicitly. */
    story?: string;
    /** Restricts the read to these paragraphs, returned in story order. */
    paraIds?: readonly string[];
    view: DocxTextView;
}
type DocxReadParagraphsResult = {
    ok: true;
    version: string;
    view: DocxTextView;
    paragraphs: DocxParagraphText[];
} | DocxEditRefusal;
interface DocxReadStoriesRequest {
    /**
     * `'all'` (the default) reads every story in id order. Listed entries are read in their order
     * without repeats; an entry naming a kind stands for its stories in id order.
     */
    stories?: 'all' | ReadonlyArray<DocxStoryInfoKind | (string & {})>;
    /** Matches listed kinds against each story's root, so `header` also selects header cells. */
    byRoot?: boolean;
    view: DocxTextView;
    /** Refuses with `stale-version` when the document is at another version. */
    expectVersion?: string;
}
/** One story's paragraphs, or why it could not be read. */
type DocxStoryText = {
    story: string;
    ok: true;
    paragraphs: DocxParagraphText[];
} | {
    story: string;
    ok: false;
    failure: DocxEditFailure;
};
type DocxReadStoriesResult = {
    ok: true;
    version: string;
    view: DocxTextView;
    stories: DocxStoryText[];
    /**
 * The read limits stopped the read before the next selected story. A story larger than the
 * limits on its own reports `limit-exceeded` instead; page it with `readParagraphs` `paraIds`.
 */
    truncated: boolean;
} | DocxEditRefusal;
interface DocxFindTextRequest {
    text: string;
    within: DocxSearchScope;
    view: DocxTextView;
    /** Defaults to 100; at most 10,000. */
    limit?: number;
}
/** One search hit; `range` is reusable as a `{ kind: 'range' }` target. */
interface DocxTextMatch {
    text: string;
    range: DocxTextRange;
}
type DocxFindTextResult = {
    ok: true;
    version: string;
    matches: DocxTextMatch[];
    truncated: boolean;
} | DocxEditRefusal;

/**
 * Page fragments of a structured export: the physical page, region and story occurrence showing
 * each exported block and inline, read from the layout the export was captured with. Plain JSON
 * produced by the Rust engine; ordinary exports never lay anything out.
 *
 * Pages are counted physically from zero, blank parity fillers included; the displayed number and
 * label follow the section's PAGE numbering and may restart, repeat or use Roman and letter
 * formats. A header or footer part is exported once and has an occurrence on every page that
 * shows it. Text slices use the export's paragraph-local ranges; an atom (field, control, image,
 * note mark, break) is sliced whole, or marked `partial` when only part of its display content is
 * on the page. Geometry, when requested, is in unzoomed CSS pixels (96 per inch) from the
 * physical page's top-left corner.
 */

/**
 * A paged export's options: the export's, plus `includeGeometry` (default `false`),
 * `expectLayoutVersion` (refused as `stale-layout` when the retained layout is another),
 * `maxFragments` (default 100,000, at most 1,000,000) and `maxLayoutBytes` (the page map's own
 * budget: default 8,388,608, 1,024 to 67,108,864).
 */
interface DocxPageExportOptions extends DocxExportOptions {
    includeGeometry?: boolean;
    expectLayoutVersion?: string;
    maxFragments?: number;
    maxLayoutBytes?: number;
}
/** Structured content with the page map captured with it. */
interface DocxPagedStructuredContent<L> {
    structured: DocxStructuredContent;
    layout: L;
}
/** Markdown options for a paged export; `pageMarkers` defaults to `false`. */
interface DocxPageMarkdownOptions extends DocxMarkdownOptions {
    pageMarkers?: boolean;
}
/**
 * The page map of a session export. Its references describe the authoritative layout of
 * `documentVersion` computed from the inputs `provenance` fingerprints; a later edit may
 * supersede that layout before it is ever painted.
 */
interface DocxLayoutMap extends DocxPageMapContent {
    documentVersion: string;
    layoutVersion: string;
    provenance: DocxLayoutProvenance;
}
/** The page map of a bytes export: deterministic, with no session token. */
interface DocxSnapshotLayoutMap extends DocxPageMapContent {
    snapshotFingerprint: string;
    provenance: DocxSnapshotLayoutProvenance;
}
/**
 * What both page maps hold. `exportFingerprint` identifies the structured content.
 * `schemaVersion` versions the map on its own: additive fields keep it, and a change existing
 * readers would misread bumps it.
 */
interface DocxPageMapContent {
    schemaVersion: 1;
    exportFingerprint: string;
    revisionView: DocxRevisionView;
    /** Pages are laid out with revision markup. */
    layoutRevisionView: 'markup';
    pages: DocxExportPage[];
    occurrences: DocxStoryOccurrence[];
    fragments: DocxPageFragment[];
    diagnostics: DocxPageDiagnostic[];
    truncated: boolean;
}
interface DocxSnapshotLayoutProvenance {
    engineVersion: string;
    /** The fonts, fallback order and measurement defaults, by font content. */
    fontSetFingerprint: string;
    /** Sections, settings, notes, render environment and layout options. */
    optionsFingerprint: string;
}
interface DocxLayoutProvenance extends DocxSnapshotLayoutProvenance {
    layoutEpoch: string;
}
interface DocxExportPage {
    pageIndex: number;
    sectionIndex: number;
    sectionPageIndex: number;
    displayedNumber: number;
    displayedLabel: string;
    numberingFormat: string;
    /** `fallback` when the format could not be written and the page is numbered in decimal. */
    numberingStatus: 'resolved' | 'fallback';
    parityFiller: boolean;
    size: {
        width: number;
        height: number;
    };
}
interface DocxStoryOccurrence {
    id: string;
    pageIndex: number;
    story: string;
    part: string | null;
    sectionIndex: number | null;
    region: {
        kind: 'body';
    } | {
        kind: 'header' | 'footer';
        variant: 'default' | 'first' | 'even';
    } | {
        kind: 'footnote' | 'endnote';
        noteId: string;
        placement: 'pageBottom' | 'beneathText' | 'sectionEnd' | 'documentEnd';
    };
}
/** The part of one exported node (`nodeId`, in block `blockId`) one occurrence shows. */
interface DocxPageFragment {
    id: string;
    pageIndex: number;
    occurrenceId: string;
    nodeId: string;
    blockId: string;
    anchor: DocxAnchor;
    slice: {
        kind: 'text';
        range: DocxTextRange;
    } | {
        kind: 'atom';
        range: DocxTextRange | null;
        coverage: 'whole' | 'partial';
    } | {
        kind: 'block';
    } | {
        kind: 'table';
        rows: Array<{
            rowIndex: number;
            continuedFromPrevious: boolean;
            continuedOnNext: boolean;
            repeatedHeader: boolean;
        }>;
    };
    continuedFromPrevious: boolean;
    continuedOnNext: boolean;
    repeatedTableHeader: boolean;
    geometry: DocxFragmentGeometry | null;
}
interface DocxFragmentGeometry {
    unit: 'cssPx';
    origin: 'pageTopLeft';
    rects: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}
interface DocxPageDiagnostic {
    code: 'unmapped-content' | 'anchor-only' | 'not-laid-out' | 'unsupported-numbering' | 'unsupported-note-layout' | 'clipped-content' | 'geometry-unavailable' | 'truncated' | 'note-layout-fallback';
    nodeId: string | null;
    pageIndex: number | null;
    message: string;
}
/** One font a headless layout may measure with. */
interface DocxHeadlessFont {
    /** Names the font in `fontChains` and `defaultChain`. */
    key: string;
    /** TrueType or OpenType bytes, base64-encoded. */
    data: string;
}
/**
 * The fonts and options of a headless layout, plain JSON. Only these fonts are measured with;
 * nothing is looked up on the system. A font requirement (`family|bold|italic`, family
 * lowercase) takes the chain named by its key, else by its lowercase family, else
 * `defaultChain`, in fallback order; one left with no font is not laid out, and the export is
 * refused as `layout-unavailable`.
 */
interface DocxHeadlessLayoutOptions {
    fonts: readonly DocxHeadlessFont[];
    fontChains?: Readonly<Record<string, readonly string[]>>;
    defaultChain: readonly string[];
    /**
     * Text naming no font or size, measured and given its font chain in this family: default
     * `Calibri` at 11 points.
     */
    measurementDefaults?: {
        fontFamily?: string;
        fontSize?: number;
    };
    /**
     * How stories render: hidden text laid out (default `false`) and the default tab stop in
     * twips (default the document's).
     */
    renderEnvironment?: {
        showHiddenText?: boolean;
        defaultTabStopTwips?: number;
    };
    /** Word layout compatibility options; default the document's settings. */
    compatibility?: {
        noLeading?: boolean;
        doNotExpandShiftReturn?: boolean;
    };
}

export { type DocxStoryOccurrence as $, type DocxExportDiagnostic as A, type DocxExportDiagnosticCode as B, type DocxExportFailureCode as C, type DocxExportFailure as D, type DocxExportInline as E, type DocxExportPage as F, type DocxExportRefusal as G, type DocxExportResult as H, type DocxExportStory as I, type DocxExportTable as J, type DocxFormattingMark as K, type DocxFragmentGeometry as L, type DocxHeadingInfo as M, type DocxHeadlessFont as N, type DocxInlineRevision as O, type DocxLayoutProvenance as P, type DocxListInfo as Q, type DocxPageDiagnostic as R, type DocxPageFragment as S, type DocxPageMapContent as T, type DocxParagraphData as U, type DocxParagraphHeading as V, type DocxParagraphList as W, type DocxParagraphText as X, type DocxRevisionView as Y, type DocxSnapshotLayoutProvenance as Z, type DocxStoryKind as _, type DocxExportOptions as a, type DocxStorySelection as a0, type DocxUnlocatedReason as a1, type DocxEditSuggestion as a2, type DocxEditFailure as a3, type DocxEditFailureCode as a4, type DocxFindTextRequest as a5, type DocxFindTextResult as a6, type DocxReadParagraphsRequest as a7, type DocxReadParagraphsResult as a8, type DocxEditRequest as a9, type DocxSetContentControlTextStep as aA, type DocxStoryInfo as aB, type DocxStoryInfoKind as aC, type DocxStoryText as aD, type DocxStoryUse as aE, type DocxTextAtom as aF, type DocxTextMatch as aG, type DocxTextPosition as aH, type DocxTextView as aI, type EditSuccess as aJ, type OperationFailure as aK, type OperationRefusal as aL, type ValidationSuccess as aM, type DocxEditResult as aa, type DocxTextRange as ab, type DocxReadStoriesRequest as ac, type DocxValidationResult as ad, type DocxListStoriesResult as ae, type DocxReadStoriesResult as af, type SectionStartKind as ag, type SectionPropertyPatch as ah, type SectionInfo as ai, type DocxTextTarget as aj, type DocxEditRefusal as ak, type DocxAtomKind as al, type DocxEditFailureReason as am, type DocxEditGuard as an, type DocxEditHistory as ao, type DocxEditOperation as ap, type DocxEditPreview as aq, type DocxEditReceipt as ar, type DocxEditSource as as, type DocxEditStep as at, type DocxEditTarget as au, type DocxParagraphInput as av, type DocxParagraphTarget as aw, type DocxResolvedControl as ax, type DocxSearchScope as ay, DocxSectionError as az, type DocxMarkdownContent as b, type DocxStructuredContent as c, type DocxPageExportOptions as d, type DocxHeadlessLayoutOptions as e, type DocxPagedStructuredContent as f, type DocxSnapshotLayoutMap as g, type DocxMarkdownOptions as h, type DocxLayoutMap as i, type DocxPageMarkdownOptions as j, type DocxContentControlReadFailure as k, type DocxContentControlQuery as l, type DocxContentControlsOptions as m, type DocxContentControlsSnapshot as n, type DocxAnchor as o, type DocxAnchorScope as p, type DocxCachedResult as q, type DocxCommentMetadata as r, type DocxContentControl as s, type DocxContentControlDiagnostic as t, type DocxContentControlSelector as u, type DocxContentControlValue as v, type DocxContentControlsResult as w, type DocxControlMetadata as x, type DocxExportBlock as y, type DocxExportCell as z };
