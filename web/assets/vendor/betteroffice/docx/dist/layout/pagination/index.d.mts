import { b as LayoutBlock, B as BlockExtent } from '../../types-bvPg3KsF.mjs';
export { A as AnchoredObjectPositionInput, d as BlockId, e as BorderStyle, C as CellBorderSpec, f as CellBorders, g as ChartBlock, h as ChartExtent, i as ChartFragment, j as ColumnBreakBlock, k as ColumnBreakExtent, l as ColumnLayout, D as DEFAULT_TEXTBOX_MARGINS, m as DEFAULT_TEXTBOX_WIDTH, n as DocumentPosition, o as FieldRun, p as FloatingTablePosition, F as FootnoteContent, q as FootnoteRenderItem, r as Fragment, s as FragmentBase, H as HeaderFooterContent, t as HeaderFooterContentHeights, u as HeaderFooterLayout, v as HitTestResult, w as HyperlinkInfo, I as ImageBlock, x as ImageExtent, y as ImageFragment, z as ImageRun, E as ImageRunPosition, G as InlineSdtWidget, L as Layout, a as LayoutOptions, J as LineBreakRun, K as ListNumPr, N as NoteAreaContract, M as NoteLayoutItem, O as NoteSettingsContract, P as Page, Q as PageBorderContract, S as PageBreakBlock, T as PageBreakExtent, U as PageGeometry, V as PageHeaderFooterRefs, W as PageMargins, X as PageNumberingContract, Y as ParagraphAttrs, Z as ParagraphBlock, _ as ParagraphBorders, $ as ParagraphExtent, a0 as ParagraphFragment, a1 as ParagraphIndent, a2 as ParagraphSpacing, R as ResolvedLine, c as ResolvedSegment, a3 as Run, a4 as RunFontSlots, a5 as RunFormatting, a6 as RunLanguageSlots, a7 as SdtGroup, a8 as SectionBreakBlock, a9 as SectionBreakExtent, aa as ShapeBlock, ab as ShapeBlockFill, ac as ShapeBlockStroke, ad as ShapeBlockTransform, ae as ShapeExtent, af as ShapeFragment, ag as TabAlignment, ah as TabRun, ai as TabStop, aj as TableBlock, ak as TableCell, al as TableCellExtent, am as TableExtent, an as TableFragment, ao as TableRow, ap as TableRowExtent, aq as TextBoxBlock, ar as TextBoxExtent, as as TextBoxFragment, at as TextRun, au as TypesetBidiSlice, av as TypesetClusterAdvance, aw as TypesetRow, ax as TypesetRowSegment, ay as TypesetRunAdvance, az as WrapTextDirection, aA as assertExhaustiveLayoutBlock, aB as isTextWrappingFloatingImageRun, aC as pageGeometryFromPage, aD as resolveAnchoredObjectVerticalTop } from '../../types-bvPg3KsF.mjs';
import '../../content-DVT06V_6.mjs';
import '../../formatting-p5MneNuy.mjs';
import '../../docx/wrapTypes.mjs';

interface MeasuredBlock {
    block: LayoutBlock;
    measure: BlockExtent;
}

export { BlockExtent, LayoutBlock, type MeasuredBlock };
