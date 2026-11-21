import { Y as YrsSession, a as YrsRenderEnv, L as LayoutMetaV1 } from '../index-DGvJBf34.mjs';
import { R as ResidentMeasurementConfig } from '../rustMeasureSource-BXgZnHPw.mjs';
import { L as Layout, a as LayoutOptions } from '../types-bvPg3KsF.mjs';
import { MeasuredBlock } from '../layout/pagination/index.mjs';
import { b as DisplayListHeadersFooters } from '../displayListQueries-6XjS7B5e.mjs';
import { Document } from '../types/document.mjs';
import { f as SectionProperties, N as NoteKind, g as DocumentBody } from '../content-DVT06V_6.mjs';
import '../pagedExport-Bi89gMk0.mjs';
import '../formatting-p5MneNuy.mjs';
import '../styles-DZZz2oRy.mjs';
import '../plugin-api/index.mjs';
import '../utils/comments.mjs';
import '../docx/wrapTypes.mjs';
import '../utils/findReplace.mjs';
import '../utils/stylePreview.mjs';
import '../loadWasmAsset-Cr95TImt.mjs';
import '../rezip-CfwAYdV4.mjs';

interface ResidentRegionLayoutRequest {
    bodyStory: 'body';
    /** @internal Use saved page totals while the layout is partial. */
    cachedPageTotals?: boolean;
    options: Pick<LayoutOptions, 'contractVersion' | 'pageGap'>;
    regions: {
        sections: Array<{
            sectionId?: string;
            properties: SectionProperties;
        }>;
        settings?: Document['package']['settings'];
        watermark?: SectionProperties['watermark'];
    };
    notes: {
        contents: Array<{
            id: number;
            noteKind: NoteKind;
            height: 0;
        }>;
    };
    renderEnv: YrsRenderEnv;
    measurement?: ResidentMeasurementConfig;
}
interface ComputeLayoutInputs {
    document: Document | null;
    pageGap: number;
    session: Pick<YrsSession, 'layoutDocumentWithRegionsRetainedJson' | 'residentWorkerProbe' | 'retainedKernelInputsJson'>;
    renderEnv: YrsRenderEnv;
    measurement: ResidentMeasurementConfig;
    /** @internal See `ResidentRegionLayoutRequest.cachedPageTotals`. */
    cachedPageTotals?: boolean;
}
interface LayoutComputation {
    layout: Layout;
    notesConverged: boolean;
}
declare function buildResidentRegionLayoutRequest(document: Document | null, pageGap: number, renderEnv: YrsRenderEnv): ResidentRegionLayoutRequest;
declare function getLayoutKernelInputs(layout: Layout): {
    measured: MeasuredBlock[];
    options: unknown;
    headersFooters?: DisplayListHeadersFooters;
    layoutRevision?: number;
} | undefined;
declare function computeLayout(inputs: ComputeLayoutInputs): LayoutComputation;
/**
 * The layout a resident worker ran, from its region layout reply. The
 * measured blocks stay in the worker, so the main-thread display fallback has
 * to lay the document out on this thread first.
 */
declare function workerLayoutComputation(layoutReply: string | LayoutMetaV1, layoutRevision?: number, headersFooters?: string): LayoutComputation;

/**
 * The last section with inherited references; `finalSectionProperties`
 * is the body sectPr as authored.
 */
declare function resolvedFinalSectionProperties(body: DocumentBody | null | undefined): SectionProperties | undefined;
/**
 * Applies an edit to the last section on both views: the resolved entry the
 * engine lays out and the authored sectPr the serializer saves.
 */
declare function updateFinalSectionProperties<T extends Pick<DocumentBody, 'sections' | 'finalSectionProperties'>>(body: T, update: (properties: SectionProperties) => SectionProperties): T;

export { type ComputeLayoutInputs, type LayoutComputation, buildResidentRegionLayoutRequest, computeLayout, getLayoutKernelInputs, resolvedFinalSectionProperties, updateFinalSectionProperties, workerLayoutComputation };
