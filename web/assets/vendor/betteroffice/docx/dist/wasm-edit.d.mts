import { W as WasmAsyncInput } from './loadWasmAsset-Cr95TImt.mjs';

/* tslint:disable */
/* eslint-disable */

/**
 * One yrs replica of the DOCX editing model, held for a JS host.
 *
 * Owns the [`EditingDoc`] plus the (single) JS update observer. The JS facade
 * multiplexes its own listener set over that one callback.
 */
declare class EditSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Accepts tracked changes: pending insertions become plain content,
     * pending deletions are carried out; `pPrIns` marks clear so the split
     * stays, `pPrDel` marks join with the following paragraph, whose own
     * properties survive.
     *
     * `target_json` is either `{"revisionId": string}`, resolving that one
     * coalesced revision wherever it appears in any story, or
     * `{"story","startPara","startOffset","endPara","endOffset"}`, resolving
     * every tracked change overlapping that range regardless of revision id.
     * Receipt: `{"revisionIds": [string, …]}` — the ids actually resolved, in
     * resolution order and deduplicated. Resolving applies a revision rather
     * than authoring one, so it never stamps a new revision and ignores
     * suggesting mode. Errors on an empty range and on a `revisionId` that
     * matches nothing.
     */
    accept_change(target_json: string): string;
    /**
     * Adds a comment anchored to one or more ranges. `ranges_json`:
     * `[{"story","startPara","startOffset","endPara","endOffset"}, …]`;
     * `body_json` is any JSON value, stored as given. The anchors are sticky,
     * so they follow the text they cover, and the comment lives outside the
     * story rather than as an attribute on it. Receipt: `{"commentId"}` — a
     * freshly minted id. Errors when `ranges_json` is not an array of
     * well-formed ranges, or is empty.
     */
    add_comment(ranges_json: string, author: string, date: string, body_json: string): string;
    /**
     * Closes the current undo capture without adding an empty step.
     */
    add_undo_boundary(): void;
    /**
     * Deletes up to `count` characters at this session's collapsed selection,
     * lays out once, and returns the resulting binary `FrameDelta`.
     * `direction` is `"backward"` or `"forward"`; a surrogate pair is removed
     * whole. At a paragraph boundary a deletion merges with the neighbouring
     * paragraph instead. Deleting stops early at the document start or end,
     * before a second paragraph merge, or at a paragraph the resident state
     * cannot absorb; [`EditSession::resident_deleted_units`] reports how many
     * were removed.
     *
     * Errors on an unknown `direction`, a zero `count`, when
     * `expected_frame_epoch` is not a non-negative safe integer, under the
     * same selection and readiness conditions as [`EditSession::apply_input`],
     * and when there is no character to delete in that direction.
     */
    apply_delete(direction: string, expected_frame_epoch: number, count: number): Uint8Array;
    /**
     * Instrumented twin of [`EditSession::apply_delete`]: identical arguments,
     * result and error contract, but it also records stage timings for
     * [`EditSession::apply_input_profile_json`].
     */
    apply_delete_profiled(direction: string, expected_frame_epoch: number, count: number): Uint8Array;
    /**
     * Applies an edit batch all-or-nothing:
     * `{"ok":true,"baseVersion","version","applied","source","changedStories",
     * "receipts"}`. An applied batch commits one transaction; `history`
     * `"separate"` makes it exactly one undo step.
     */
    apply_edits_json(request: string): string;
    /**
     * Applies an update another replica of this document committed for a host batch.
     * It commits outside undo history and notifies as a local change.
     */
    apply_host_update(update: Uint8Array): void;
    /**
     * Applies one ordinary insertion at this session's collapsed selection
     * and returns the resulting binary `FrameDelta`. The inserted text
     * inherits the formatting at the caret; selection, measurement inputs,
     * pagination checkpoints and display state all stay resident, so nothing
     * but the frame crosses the boundary.
     *
     * Errors when `text` is empty or contains `\r`/`\n`, when
     * `expected_frame_epoch` is not a non-negative safe integer, when there is
     * no resident selection or it no longer resolves, when the selection is
     * not collapsed, or when the resident layout state cannot absorb an edit
     * in that paragraph. The caller must then run the full layout path.
     */
    apply_input(text: string, expected_frame_epoch: number): Uint8Array;
    /**
     * Stage timings of the last profiled apply, in milliseconds:
     * `{"selectionMs","editMs","lowerMs","measureMs","paginateMs",
     * "displayInputMs","displayBuildMs","displayFinalizeMs","displayMs",
     * "encodeMs"}`. `{}` before the first profiled call.
     */
    apply_input_profile_json(): string;
    /**
     * Instrumented twin of [`EditSession::apply_input`]: identical arguments,
     * result and error contract, but it also records stage timings for
     * [`EditSession::apply_input_profile_json`]. Separate so the ordinary
     * input path pays no timer calls.
     */
    apply_input_profiled(text: string, expected_frame_epoch: number): Uint8Array;
    /**
     * Applies an update produced by this document's dedicated local worker.
     * The local origin lets the main replica's UndoManager retain ownership of
     * the edit; remote/collaboration updates must use `apply_update` instead.
     */
    apply_local_update(update: Uint8Array): void;
    /**
     * Applies a paragraph style and rebases inherited character formatting, preserving direct
     * formatting. Without a source package, only `pStyle` changes.
     */
    apply_paragraph_style(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, style_id: string, author_name?: string | null, author_date?: string | null): void;
    /**
     * Applies a batch of raw story mutations in ONE transaction. Unlike every
     * other op here these carry no user intent: indices are story-global
     * UTF-16 units, not Locs, and nothing is inferred or stamped on the
     * caller's behalf. `ops_json` is an array of:
     *
     * - `{"op":"insert","index","text"?,"attrs"?}`
     * - `{"op":"delete","index","len"}`
     * - `{"op":"format","index","len","attrs"?}`
     * - `{"op":"insertEmbed","index","kind"?,"payload"?,"attrs"?}`
     * - `{"op":"setEmbedAttr","index","key","value"?}`
     * - `{"op":"setComment","id","ranges":[[start,end], …],"author"?,"date"?,"body"?}`
     * - `{"op":"removeComment","id"}`
     *
     * Each op's `index`, and each `setComment` range, is read against the
     * story state AFTER every preceding op in the batch. `attrs` and
     * `payload` are JSON objects written verbatim, so tracked-change stamps
     * travel inside `attrs`; comments are keyed by the given id and anchored
     * sticky. Errors on an unknown `"op"`, a missing or negative `"index"`,
     * or a missing required field, and leaves the story untouched — parsing
     * completes before the transaction opens.
     */
    apply_raw_ops(story: string, ops_json: string): void;
    /**
     * Applies seed raw operations with deterministic item ordering.
     */
    apply_seed_raw_ops(story: string, ops_json: string): void;
    /**
     * Applies the ordered updates of one sync in a single remote transaction,
     * so the result matches [`EditSession::apply_update`] on the whole diff.
     * Errors on a non-`Uint8Array` entry or a malformed or oversized update,
     * before applying any.
     */
    apply_update_chunks(updates: Array<any>): void;
    /**
     * Applies a remote or incremental yrs v1 update. It commits without a
     * local origin, so this replica's undo manager never claims it. Errors on
     * a malformed update.
     */
    apply_update(update: Uint8Array): void;
    /**
     * [`EditSession::apply_update`] plus an inference about where the peer
     * that authored it is typing, for caret presence. Returns
     * `{"clientId","story","paraId","endOffset"}` for the end of that peer's
     * last text insertion, or `"null"` when the update carries work from more
     * than one client, ends in a non-text insertion, or inserts nothing.
     * Errors on a malformed update.
     */
    apply_update_with_inference(update: Uint8Array): string;
    /**
     * Starts a new opening of the document; see [`EditingDoc::begin_opening`].
     */
    begin_opening(generation?: string | null): void;
    /**
     * Begins `layout_document_with_regions_retained_json` as a pass measured a
     * step at a time; see `EngineSession::begin_region_layout`. Returns the
     * progress JSON, with `layoutJson` once the pass is complete.
     */
    begin_region_layout(input: string): string;
    /**
     * Until the matching `end_shared_reads`, committed reads share story projections of each document state.
     */
    begin_shared_reads(): void;
    bootstrap_peer(state: Uint8Array, metadata: Uint8Array, source?: Uint8Array | null): void;
    /**
     * Display-only input JSON in, one binary `FrameDelta` v1 out (exposed as
     * a transferable `Uint8Array`). `expected_frame_epoch` is the epoch of the
     * frame the caller currently holds; pass `0` for the first frame. A
     * mismatch makes the engine emit a full frame instead of a delta, and the
     * returned frame's epoch is always greater than `expected_frame_epoch`. Errors
     * unless the epoch is a non-negative safe integer, and on build failure.
     */
    build_display_list_frame(input: string, expected_frame_epoch: number): Uint8Array;
    /**
     * `{ measured, options, layout }` JSON in, `DisplayList` JSON out, built
     * against the same resident font store this session measures with.
     */
    build_display_list_json(input: string): string;
    /**
     * Build the listed pages that are still unbuilt and return a FrameDelta
     * v1 carrying them; `expected_frame_epoch` works as for
     * [`Self::build_display_list_frame`].
     */
    build_display_pages_frame(pages: Uint32Array, expected_frame_epoch: number): Uint8Array;
    /**
     * Whether [`EditSession::redo`] would reapply something.
     */
    can_redo(): boolean;
    /**
     * Whether [`EditSession::undo`] would revert something.
     */
    can_undo(): boolean;
    /**
     * The current local cell selection as a [`TableRange`], or `"null"`
     * before one is set. An endpoint whose cell was deleted clamps to a
     * surviving nearby cell. Errors when the table itself no longer resolves.
     */
    cell_selection(): string;
    clear_cell_selection(): string | undefined;
    /**
     * Removes the authored `value` from the content-control embed carrying
     * `embed_id`, leaving the control and its content in place: it never
     * erases a text control's text. Errors when no embed has that id.
     */
    clear_content_control_value(embed_id: string): void;
    /**
     * Clears every direct run-formatting attribute over `[start, end)`.
     * Protected attributes — hyperlinks and tracked-change stamps — survive,
     * as do paragraph properties.
     */
    clear_formatting(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number): void;
    /**
     * Drops every registered measurement font (ids restart at zero) and
     * invalidates the retained paragraph measurement templates, so the next
     * edit must pass back through the full layout path.
     */
    clear_measure_fonts(): void;
    /**
     * Clears the pinned input span.
     */
    clear_undo_input_time(): void;
    /**
     * Stops queueing and discards anything not yet drained.
     */
    clear_update_event_observation(): void;
    /**
     * Drops the update observer registered by [`EditSession::set_update_observer`].
     */
    clear_update_observer(): void;
    /**
     * This replica's client id, as passed to the constructor.
     */
    client_id(): number;
    /**
     * Resolves a text target and anchors a side-map comment over it in one
     * call (legacy agent helpers). `comment_json`:
     * `{"id","author","date","body"?}`. Returns `{"ok":true,"version"}` or a
     * refusal.
     */
    comment_text_target_json(target_json: string, comment_json: string): string;
    /**
     * Compares two DOCX packages into this session, which must hold no document: the original
     * is opened here and the revised body text differences are applied as tracked changes,
     * outside undo history.
     *
     * `options` is `{"author","date","granularity"?,"unsupported"?,"limits"?}`. Returns a final
     * `{"ok":false,"diagnostics"}` or `{"ok":true,"noop":true,"changes":[],"diagnostics"}`, or
     * `{"ok":true,"noop":false,"save"}` naming what a save of the applied changes may write:
     * then pass the saved bytes to [`EditSession::finish_compared_docx_json`], or the save
     * failure to [`EditSession::fail_compared_docx_json`]. Malformed options and internal
     * failures throw.
     */
    compare_docx_json(original: Uint8Array, revised: Uint8Array, options: string): string;
    content_control_targets_json(): string;
    /**
     * Adds a story holding one paragraph with `initial_text` (which must not
     * contain paragraph breaks), `p_style` and `alignment`. Receipt:
     * `{"paraId"}` — the paragraph ending at the story's pilcrow. Errors when
     * the story id already exists.
     */
    create_story(story_id: string, initial_text: string, p_style: string, alignment: string): string;
    decode_font(bytes: Uint8Array): Uint8Array;
    /**
     * Deletes every column the [`TableRange`] `range_json` covers, along with
     * the stories of the cells removed. Always a plain local edit.
     */
    delete_column(range_json: string): string;
    /**
     * Deletes `[start, end)`. Because a range crossing a paragraph boundary
     * includes the boundary pilcrow, a plain delete also merges those
     * paragraphs. Suggesting mode removes nothing and stamps the content
     * `del` instead. Receipt: `{"revisionId": string|null, "range"}`, the
     * range being what the delete left.
     */
    delete_range(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, author_name?: string | null, author_date?: string | null): string;
    /**
     * Deletes every row the [`TableRange`] `range_json` covers. In suggesting
     * mode the rows are marked `trDel` instead of removed.
     */
    delete_row(range_json: string, author_name?: string | null, author_date?: string | null): string;
    /**
     * Removes one complete story and its content. Errors on an unknown story.
     */
    delete_story(story_id: string): void;
    /**
     * Removes the table `table_json` ([`TableLocator`]) names plus every one
     * of its reachable cell stories. Always a plain local edit; the receipt
     * has `deletedTable: true`.
     */
    delete_table(table_json: string): string;
    /**
     * The number of text batches applied directly to the live document.
     */
    direct_batches_applied(): number;
    /**
     * Region-aware hit test against the resident display list, so no
     * display-list JSON crosses the boundary. `x`/`y` are page-local px.
     * Returns
     * `{"region":"body"|"header"|"footer"|"footnote"|"endnote","rId"?,`
     * `"noteId"?,"pos":n|null,"target":"text"|"image"|"none"}`, or `"null"`
     * for a page index outside the frame. A header/footer `pos` refers to
     * that part's own document and a note `pos` to the `fn:{id}` / `en:{id}`
     * story, never the body; `target` is what sits under the point, which is
     * what a pointer cursor needs.
     */
    display_hit_test_regions_json(page_index: number, x: number, y: number): string;
    /**
     * [`EditSession::display_range_rects_region_json`] for many ranges, given as flat
     * `[from, to, from, to, ...]` pairs. Per range, in order: its rect count, then
     * `pageIndex, x, y, width, height` for each rect.
     */
    display_range_rects_batch(region: string, part_id: string, ranges: Float64Array): Float64Array;
    /**
     * Highlight rectangles for a body document range against the resident
     * display list: a JSON array of `{pageIndex,x,y,width,height}` in
     * page-local px, one entry per page the range touches. Body positions
     * only. Errors when no display list is resident.
     */
    display_range_rects_json(from: number, to: number): string;
    /**
     * @internal
     */
    display_range_rects_on_pages_json(from: number, to: number, first_page: number, last_page: number): string;
    /**
     * Same rectangles as [`EditSession::display_range_rects_json`], scoped to
     * a region. `region` is `"body"`, `"header"`, `"footer"`, `"footnote"` or
     * `"endnote"`; `part_id` names one header/footer part (an empty string
     * matches any) or the note whose story the positions belong to.
     * `from`/`to` are positions in THAT region's document, and a
     * header/footer part paints on every page carrying it, so the result
     * holds one rect set per such page, each tagged with its `pageIndex`.
     * Errors on an unknown `region` and when no display list is resident.
     */
    display_range_rects_region_json(region: string, part_id: string, from: number, to: number): string;
    /**
     * Nearest caret position on the adjacent visual line. `direction` is
     * `"up"` or `"down"`; `goal_x` is the page-local x the caret is trying to
     * hold across successive moves (a non-finite value falls back to the
     * caret's own x). Returns `{"position","goalX"}`, or `"null"` when there
     * is no line in that direction. Errors on an unknown `direction` and when
     * no display list is resident.
     */
    display_vertical_move_json(position: number, direction: string, goal_x: number): string;
    document_properties_json(): string;
    /**
     * Pops the oldest queued transaction, in arrival order. Byte 0 is `1`
     * when the transaction had no local origin and `0` otherwise; the rest is
     * the v1 update. Empty when the queue is drained or observation never
     * started.
     */
    drain_update_event(): Uint8Array;
    /**
     * Typing echo model of one font at one shaping size from this session's
     * resident font store: `{"horizontal","glyphIds","advances","kerning",
     * "unsafePairs"}`, indexed by the characters of `alphabet`. `kern` is the
     * run's kerning gate. Errors for an unknown font or a non-positive size.
     */
    echo_glyph_set_json(font_id: number, size: number, kern: boolean, alphabet: string): string;
    /**
     * A plain local text edit that the resident lowering records, so the next
     * [`Self::layout_document_with_regions_after_edit`] re-lowers and
     * re-measures only its paragraph: inserts `text` at the collapsed range,
     * or deletes `[start, end)` without it. The document changes exactly as
     * through [`Self::insert_text`] or [`Self::delete_range`] without an
     * author, and the receipt is theirs. An empty insertion, an edit that
     * spans paragraphs, or one whose paragraph resident input is not ready
     * for goes through them instead and records nothing for the relayout.
     */
    edit_text_resident(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, text?: string | null): string;
    /**
     * [`EditSession::encode_diff`] as ordered updates for a sync that must
     * travel in bounded frames: the whole diff when it fits
     * `max_chunk_bytes`, otherwise causally ordered struct updates followed
     * by the delete set alone. Each fits the limit except one that carries a
     * single larger struct. Errors on a malformed state vector or a zero
     * limit.
     */
    encode_diff_chunks(remote_state_vector: Uint8Array, max_chunk_bytes: number): Array<any>;
    /**
     * The yrs v1 update carrying everything this replica has that the peer
     * described by `remote_state_vector` does not. Errors on a malformed
     * state vector.
     */
    encode_diff(remote_state_vector: Uint8Array): Uint8Array;
    encode_peer_metadata(): Uint8Array;
    /**
     * The full document state as one yrs v1 update. Hand it to
     * [`EditSession::load`] on a fresh replica to reproduce this document.
     */
    encode_state(): Uint8Array;
    /**
     * This replica's yrs v1 state vector — what a peer sends so
     * [`EditSession::encode_diff`] can compute the update it is missing.
     */
    encode_state_vector(): Uint8Array;
    /**
     * Encodes one Loc as opaque sticky-position bytes that keep pointing at
     * the same content as the story is edited. Publish them over an awareness
     * transport and resolve them with
     * [`EditSession::resolve_sticky_position`].
     */
    encode_sticky_position(story: string, para_id: string, offset: number): Uint8Array;
    /**
     * This peer's selection in transportable form:
     * `{"story","anchor":[byte, …],"head":[byte, …]}` with sticky-encoded
     * endpoints, or `"null"` before a selection is set. A peer resolves it
     * with [`EditSession::resolve_encoded_selection`].
     */
    encoded_selection(): string;
    /**
     * Ends a shared-read scope, dropping shared story projections when the last scope ends.
     */
    end_shared_reads(): void;
    /**
     * [`EditSession::export_structured_json`] rendered as Markdown from the same read:
     * `{"ok":true,"version","content":{"markdown","anchors","diagnostics","truncated"}}`.
     */
    export_markdown_json(options: string): string;
    /**
     * Lays this private session out with its own fonts and exports it with pages as a
     * snapshot. `fonts` holds the font files back to back, `font_lengths` their byte lengths;
     * `request` is a region layout request whose font chains name fonts by their index. The
     * reply is `{"ok":true,"content"}` or `{"ok":false,"failure"}`; a rejected font or an
     * unusable request throws. The session's measurement fonts are left untouched.
     */
    export_snapshot_with_private_fonts_json(fonts: Uint8Array, font_lengths: Uint32Array, request: string, options: string): string;
    /**
     * Structured export of the committed document state:
     * `{"revisionView","stories"?,"includeFormatting"?,"maxBlocks"?,"maxBytes"?}` ->
     * `{"ok":true,"version","content"}` or `{"ok":false,"version","failure"}`. Anchors are scoped
     * to the returned version. Reads only: nothing is committed, minted or published.
     */
    export_structured_json(options: string): string;
    /**
     * [`EditSession::export_structured_json`] with the page map of the retained region
     * layout. `options` adds `"includeGeometry"?`, `"expectLayoutVersion"?`,
     * `"maxFragments"?` and `"maxLayoutBytes"?`; the reply is
     * `{"ok":true,"version","content":{"structured","layout"}}` or a refusal. An editor passes
     * the region layout request it would lay the document out with now as `current_request`,
     * and the layout must have been computed from the same inputs. Lays nothing out and changes
     * nothing.
     */
    export_structured_with_pages_json(options: string, current_request?: string | null): string;
    /**
     * The final comparison result when saving the applied changes failed with `message`.
     */
    fail_compared_docx_json(message: string): string;
    /**
     * [`EditSession::list_content_controls_json`] keeping the controls that match `query`
     * (`{"kind":"id","controlId"}`, `{"kind":"tag","tag"}`, `{"kind":"ooxmlId","ooxmlId"}` or
     * `{"kind":"alias","alias"}`) exactly.
     */
    find_content_controls_json(query: string, options: string): string;
    /**
     * Exact, case-sensitive, paragraph-local search:
     * `{"text","within","view","limit"?}` ->
     * `{"ok":true,"version","matches":[{"text","range"}],"truncated"}`.
     */
    find_text_json(request: string): string;
    /**
     * The final comparison result for `bytes`, the saved applied changes, verified against both
     * inputs: `{"ok":true,"changes","diagnostics"}` or `{"ok":false,"diagnostics"}`. Throws
     * when no comparison awaits its saved bytes.
     */
    finish_compared_docx_json(bytes: Uint8Array): string;
    /**
     * Applies a set-valued, tri-state inline formatting delta over
     * `[start, end)` in one transaction. An omitted key keeps the current
     * value, `null` clears it, and any other value sets it. `delta_json`:
     *
     * ```json
     * {
     *   "bold": true, "italic": true,
     *   "underline": true | {"style"?: string, "color"?: string},
     *   "strike": true | {"double"?: boolean},
     *   "color": {"rgb": string} | {"themeColor": string},
     *   "highlight": string,
     *   "fontSize": 12,
     *   "fontFamily": {"ascii": string, "hAnsi"?: string},
     *   "other": {"anyAttr": value}
     * }
     * ```
     *
     * `false` clears `bold`, `italic`, `underline` and `strike`. `color`
     * takes exactly one of `rgb` or `themeColor`. `other` writes arbitrary
     * run attributes, with `null` removing one. Always a plain local edit, so
     * there is no receipt. Errors when a key carries a type not listed here.
     */
    format_range(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, delta_json: string): void;
    /**
     * Resolves a text target and formats it in one call (legacy agent
     * helpers). `delta_json` is the [`EditSession::format_range`] delta.
     * Returns `{"ok":true,"version"}` or a refusal.
     */
    format_text_target_json(target_json: string, delta_json: string): string;
    geometry_position_outline_json(root: string): string;
    /**
     * Whether a remote update is waiting on one that has not arrived yet.
     */
    has_pending_update(): boolean;
    /**
     * Whether the document has a story with this id.
     */
    has_story(story: string): boolean;
    /**
     * Returns active alias-to-canonical relationship ids as a JSON object.
     */
    header_footer_aliases_json(): string;
    /**
     * The headings of `story` in document order, classified as the structured export
     * classifies them: `[{"paraId","heading":{"outlineLevel","source"}}]`.
     */
    headings_json(story: string): string;
    /**
     * Stories changed by the latest undo or redo, sorted.
     */
    history_stories(): string[];
    /**
     * Inserts a column left (`after = false`) or right (`after = true`) of
     * the cell `at_json` ([`CellLoc`]) names. Always a plain local edit.
     */
    insert_column(at_json: string, after: boolean): string;
    /**
     * Inserts one inline image embed at `(story, para_id, offset)`.
     * The embed occupies one story unit. Receipt:
     * `{"revisionId": string|null, "range"}`, the range being where the image
     * landed. Errors when the payload is not an object.
     */
    insert_image(story: string, para_id: string, offset: number, payload_json: string, author_name?: string | null, author_date?: string | null): string;
    insert_line_break(story: string, para_id: string, offset: number, author_name?: string | null, author_date?: string | null): string;
    /**
     * Inserts a page-break embed at `(story, para_id, offset)`, occupying one
     * story unit. Always a plain local edit.
     */
    insert_page_break(story: string, para_id: string, offset: number): void;
    /**
     * Inserts a row above (`after = false`) or below (`after = true`) the
     * cell `at_json` names. `at_json` is a [`CellLoc`].
     */
    insert_row(at_json: string, after: boolean, author_name?: string | null, author_date?: string | null): string;
    /**
     * Inserts a section-break embed at `(story, para_id, offset)`.
     * `break_type` must be `"nextPage"`, `"continuous"`, `"oddPage"` or
     * `"evenPage"`; anything else errors. Always a plain local edit.
     */
    insert_section_break(story: string, para_id: string, offset: number, break_type: string): void;
    /**
     * Inserts a `rows` x `columns` table at `(story, para_id, offset)`,
     * creating one story per cell. Errors when either dimension is zero.
     */
    insert_table(story: string, para_id: string, offset: number, rows: number, columns: number, author_name?: string | null, author_date?: string | null): string;
    /**
     * Inserts a clipboard table fragment at `(story, para_id, offset)`.
     * `fragment_json` is a [`DocxTableFragment`] (`packages/docx/src/yrs/clipboardFragment.ts`).
     * Returns the [`TableFragmentReceipt`] JSON, with `after` carrying the
     * caret right after the inserted table embed.
     */
    insert_table_fragment(story: string, para_id: string, offset: number, fragment_json: string, author_name?: string | null, author_date?: string | null): string;
    /**
     * Inserts `text` at `(story, para_id, offset)`. It must contain no
     * paragraph or line breaks, and it inherits the formatting at the
     * insertion point. Receipt: `{"revisionId": string|null, "range"}` —
     * the id is non-null in suggesting mode, where the text is stamped `ins`
     * and coalesces into an adjacent insertion by the same author rather than
     * opening a second revision; the range is where the text landed.
     */
    insert_text(story: string, para_id: string, offset: number, text: string, author_name?: string | null, author_date?: string | null): string;
    /**
     * Inserts a watermark embed at `(story, para_id, offset)`, its payload
     * taken verbatim from the `watermark_json` object. Always a plain local
     * edit. Errors when the JSON is not an object.
     */
    insert_watermark(story: string, para_id: string, offset: number, watermark_json: string): void;
    /**
     * `{ measured, options }` JSON in, `Layout` JSON out. Both the measured
     * input and the resulting layout are retained for the resident edit path.
     * Errors on unparseable input or on layout failure.
     */
    layout_document_json(input: string): string;
    /**
     * [`Self::layout_document_with_regions_retained`] after one edit: the
     * resident path when that edit was the [`Self::edit_text_resident`] taken
     * last; see `EngineSession::layout_document_with_regions_after_edit`.
     */
    layout_document_with_regions_after_edit(input: string): void;
    /**
     * The retained region layout of exactly the first `pages` pages when no
     * later content can change them, and of the whole document otherwise; see
     * `EngineSession::layout_document_with_regions_exact_prefix_retained`.
     * Returns `{ provisional, pages, documentWidth? }` as JSON.
     */
    layout_document_with_regions_exact_prefix_retained(input: string, pages: number): string;
    /**
     * Region-layout input JSON in, a paginated envelope with section and page
     * regions already composed as JSON out — ready for the display builder
     * with no host-side layout mutation. Retains the pass for resident edits.
     */
    layout_document_with_regions_json(input: string): string;
    /**
     * The retained region layout of the first `pages` pages only; see
     * `EngineSession::layout_document_with_regions_prefix_retained_json`.
     */
    layout_document_with_regions_prefix_retained_json(input: string, pages: number): string;
    /**
     * [`Self::layout_document_with_regions_retained_json`] without the reply,
     * for a caller that reads only the retained state.
     */
    layout_document_with_regions_retained(input: string): void;
    /**
     * Same full region pass as [`Self::layout_document_with_regions_json`],
     * but the reply carries only `{ layout, headersFooters?, notesConverged }`
     * — the measured arena stays retained wasm-side and is fetched on demand
     * via [`Self::retained_kernel_inputs_json`].
     */
    layout_document_with_regions_retained_json(input: string): string;
    layout_document_with_regions_retained_meta(input: string): RetainedLayoutMeta;
    /**
     * Region-layout input JSON in, the font families and sizes that input
     * needs as JSON out, so the host can register fonts before laying out.
     */
    layout_font_requirements_json(input: string): string;
    /**
     * Every comment the session holds, sorted by id:
     * `[{"id","author","date","done","parentId","body"}, …]`, `parentId`
     * null for a top-level comment and `body` the JSON value it was given.
     */
    list_comments(): string;
    /**
     * The content controls of the committed state:
     * `{"stories"?,"maxControls"?,"maxBytes"?}` -> `{"ok":true,"version","content"}` or
     * `{"ok":false,"version","failure"}`. Control ids and anchors are scoped to the returned
     * version. Reads only.
     */
    list_content_controls_json(options: string): string;
    /**
     * Every pending tracked change across all stories, in deterministic
     * story-then-position order:
     * `[{"revisionId","author","date","kind","story","preview",
     * "range":{"story","start":{"paraId","offset"},"end":{…}}}, …]`. `kind`
     * is one of `"insertion"`, `"deletion"`, `"pPrIns"`, `"pPrDel"`,
     * `"pPrChange"`, `"trIns"`, `"trDel"`, `"tableIns"` or `"tableDel"`.
     * `preview` holds the first few characters of the affected text, and is
     * empty for every structural kind, which covers no text.
     */
    list_revisions(): string;
    list_sections_json(): string;
    /**
     * Every story: `{"ok":true,"version","stories":[{"story","kind","parent"?,"root","part"?,
     * "uses"?:[{"sectionIndex","variant","shown"?}]}]}`, sorted by id. `shown` is present only
     * while a complete layout of the current version is retained.
     */
    list_stories_json(): string;
    /**
     * Hydrates from a yrs v1 update. The first load after an unseeded open retains prior
     * comment writes and marks loaded fields differing from seed placeholders as authored.
     */
    load(update: Uint8Array): void;
    /**
     * Seeds stories from JSON:
     * `[{"storyId","paragraphs":[{"text","pStyle"?,"alignment"?}, …]}, …]`.
     * `pStyle` defaults to `"Normal"` and `alignment` to `"left"`; paragraph
     * text must not contain paragraph breaks. Receipt:
     * `{storyId: [paraId, …]}` with each story's paragraphs in document
     * order. Errors when a story entry has no `storyId`, no `paragraphs`
     * array, or an empty one, and when a story id already exists. Seeding a
     * document that has no opening yet starts one; see
     * [`EditingDoc::begin_opening`].
     */
    load_json(stories_json: string): string;
    /**
     * Lays this replica's `data:` image sources out as the `media:{n}` tokens
     * another replica seeded them from.
     */
    load_media_sources(json: string): void;
    /**
     * Loads separator notes from a yrs v1 update; empty clears them.
     */
    load_note_separators(state: Uint8Array): void;
    /**
     * `{"start","end"}` — the paragraph's span in story-global UTF-16 units.
     * `end` is the index of its own pilcrow, so `end - start` is the
     * paragraph length and the upper bound of a Loc `offset` in it. Errors
     * when the paragraph is not in `story`.
     */
    locate_paragraph(story: string, para_id: string): string;
    /**
     * Re-parses the DOCX bytes retained by the last
     * [`EditSession::open_docx`] and returns the COMPLETE package envelope as
     * JSON, or `None` when no DOCX has been opened. Unlike `open_docx` this
     * keeps every part; it reflects the source file, not later edits.
     */
    materialize_docx(): string | undefined;
    /**
     * Measurement input JSON in, `ParagraphExtent` JSON out. Also records the
     * paragraph's immutable width/font envelope under its stable block id, so
     * a later resident edit re-measures only the changed block. Errors with
     * the engine's message for input it cannot measure.
     */
    measure_paragraph_json(input: string): string;
    /**
     * The bytes a `media:{n}` image source displays, as the part's
     * [`EditSession::media_type`]; `undefined` for any other source or a
     * part that cannot be read.
     */
    media_bytes(token: string): Uint8Array | undefined;
    /**
     * The `data:` URL a `media:{n}` image source stands for.
     */
    media_data_url(token: string): string | undefined;
    /**
     * The digests mapping the `data:` URLs this replica seeded to
     * `media:{n}` tokens, for [`EditSession::load_media_sources`]; empty
     * when it seeded none.
     */
    media_sources_json(): string;
    /**
     * The media type of [`EditSession::media_bytes`].
     */
    media_type(token: string): string | undefined;
    /**
     * Merges the rectangle the [`TableRange`] `range_json` covers into its
     * top-left cell, whose story survives; the other cells' stories are
     * deleted. Always a plain local edit. Errors when the range covers fewer
     * than two cells or has no top-left anchor cell.
     */
    merge_cells(range_json: string): string;
    /**
     * Merges `para_id` with the FOLLOWING paragraph by deleting (plain) or
     * `del`- and `pPrDel`-marking (suggesting) its pilcrow. On a plain merge
     * the survivor adopts the deleted mark's properties and paraId, so the
     * earlier paragraph's identity wins. Receipt:
     * `{"revisionId": string|null}`. Errors on the story's final paragraph,
     * which has no following paragraph to merge with.
     */
    merge_paragraphs(story: string, para_id: string, author_name?: string | null, author_date?: string | null): string;
    /**
     * Moves one inline embed in one local transaction.
     */
    move_embed(story: string, para_id: string, offset: number, to_story: string, to_para_id: string, to_offset: number): string;
    /**
     * Creates a replica. The host allocates `client_id` (a random 32-bit id
     * is fine) and must keep it unique across the replicas that will merge.
     * Errors unless it is a non-negative safe integer.
     */
    constructor(client_id: number);
    /**
     * The style a paragraph break at `(story, para_id, offset)` gives the new paragraph: the
     * paragraph style's `w:next` when the break falls at the paragraph end and `w:next` names
     * another paragraph style. `None` otherwise, and for a session without a source package.
     */
    next_paragraph_style(story: string, para_id: string, offset: number): string | undefined;
    /**
     * The separator notes for another replica; empty when the package has none.
     */
    note_separators_state(): Uint8Array;
    /**
     * Parses a DOCX package, optionally seeds its editable stories into this
     * replica, and retains the source bytes for
     * [`EditSession::materialize_docx`] and paragraph identity reads.
     * Seeding starts a new opening, with `generation` or a fresh one, so its
     * session anchors are its own; see [`EditingDoc::begin_opening`].
     *
     * Returns `{"envelope","referencedFonts":[string, …],"unusedScriptFonts":[string, …]}`:
     * `unusedScriptFonts` are the referenced fonts a seeded package names only
     * for East Asian or complex-script text it does not contain. The envelope is
     * the parsed package with the parts the host does not need stripped —
     * body content, header/footer and note content, numbering, media and
     * charts are emptied, section entries keep only their properties — so
     * styles, theme, settings, fonts and relationships still cross while the
     * bulk of the document stays in Rust. Errors on bytes that are not a
     * readable DOCX.
     * `digest`, when given, must be the SHA-256 of `bytes` in lowercase hex,
     * as a host that hashed them off this thread already knows it.
     */
    open_docx(bytes: Uint8Array, seed_stories: boolean, generation?: string | null, digest?: string | null): string;
    /**
     * Opens `bytes` for display only, seeded from the body's first `blocks`
     * blocks (see `seed::seed_docx_preview`): the reply is the host metadata
     * of that parse, as [`EditSession::open_docx`] replies, with the
     * `unusedScriptFonts` of its cut. The session keeps no source package, so
     * it cannot save.
     * Opens nothing and replies with nothing for a document the preview
     * refuses, which opens with [`EditSession::open_docx`] instead.
     */
    open_docx_preview(bytes: Uint8Array, blocks: number): string | undefined;
    open_docx_preview_with_budget(bytes: Uint8Array, blocks: number, paragraph_budget?: number | null): string | undefined;
    /**
     * One glyph outline from this session's resident font store:
     * `{"upem":n,"cmds":[{"t":"M"|"L"|"Q"|"C"|"Z", …}]}` — commands in font
     * units, y-up. `font_id` comes from
     * [`EditSession::register_measure_font`] and `glyph_id` from shaping.
     * Errors when the glyph cannot be extracted.
     */
    outline_glyph_json(font_id: number, glyph_id: number): string;
    /**
     * How many paragraphs of `story` carry `para_id`: 0, 1, or 2 for two or
     * more. Errors on an unknown story.
     */
    paragraph_id_count(story: string, para_id: string): number;
    /**
     * Every paragraph's identities: `{"sessionId","packageSha256",
     * "paragraphs":[{"session","origin","ooxmlParaId","idOrigin",
     * "persisted","source"}]}`, session paragraphs with stories sorted and
     * in document order, then source paragraphs outside the stories, whose
     * `session` is `null`. Reads only.
     */
    paragraph_identities(): string;
    /**
     * The paragraph IDs a save applies, as the package writer's
     * `paragraphIds` request field: `{"assignments":[{"part","ordinal",
     * "paraId"}],"patchedParts":[{"part","paraIds":[[ordinal,"ID"]]}]}`,
     * plus `"splicedParts":[{"part","sha256","paragraphs":[[ordinal,"key"]],
     * "changed":[ordinal],"inserted":[{"before"|"after":ordinal}],"removed":[ordinal]}]`,
     * whose session keys the caller resolves to the model paragraphs it marks
     * with their ordinals.
     */
    paragraph_save_plan(): string;
    /**
     * Compact paragraph-position projection built in one story traversal:
     * `[{"paraId","length"}, …]` in document order, where `length` counts the
     * UTF-16 text and inline embed units before that paragraph's pilcrow —
     * exactly the `offset` domain of a Loc in it. One call replaces crossing
     * the boundary once per paragraph. Errors on an unknown story.
     */
    paragraph_spans(story: string): string;
    /**
     * The index of the first paragraph of `story` that carries `para_id`, in
     * `paragraph_spans` order, or -1. Errors on an unknown story.
     */
    paragraph_unit(story: string, para_id: string): number;
    /**
     * `[{"paraId","text","properties"}, …]` in document order. `text` is the
     * paragraph's plain text without its pilcrow; `properties` is the
     * pilcrow's authored property map (`pStyle`, `alignment` and whatever
     * else has been set on it). Errors on an unknown story.
     */
    paragraphs(story: string): string;
    part_metadata_json(): string;
    /**
     * Gives every paragraph that saves without a Word paragraph ID a fresh
     * one and repairs duplicates; see [`EditingDoc::persist_paragraph_ids`].
     * Receipt: `{"status":"applied","assignments":[{"paragraph",
     * "replacedParaId","previousOoxmlParaId","ooxmlParaId","idOrigin",
     * "persisted"}],"diagnostics":[…]}`, or `{"status":"refused","refusal"}`
     * when nothing was changed.
     */
    persist_paragraph_ids(): string;
    proposal_revision_ranges_json(ids_json: string): string;
    /**
     * Versioned paragraph texts:
     * `{"story"?,"paraIds"?,"view":"accepted"|"original"}` ->
     * `{"ok":true,"version","view","paragraphs":[{"story","paraId","text",
     * "styleId"?,"atoms":[{"offset","kind"}]}]}`. Each inline atom occupies one
     * U+FFFC in `text`.
     */
    read_paragraphs_json(request: string): string;
    /**
     * Paragraph texts of selected stories in one read:
     * `{"stories"?:"all"|[kind|id…],"byRoot"?,"view","expectVersion"?}` -> `{"ok":true,
     * "version","view","truncated","stories":[{"story","ok":true,"paragraphs"}|{"story",
     * "ok":false,"failure"}]}`. Listed entries keep their order; a kind expands in id order.
     */
    read_stories_json(request: string): string;
    /**
     * Reconciles and publishes the `[owner, paraId]` pairs a save captured,
     * an owner being a session key or a source occurrence's
     * `{partUri}#{ordinal}`; returns the stale pairs as the same JSON shape.
     * See [`EditingDoc::record_saved_paragraph_ids`].
     */
    record_saved_paragraph_ids(saved_json: string): string;
    /**
     * Reapplies the latest locally undone transaction and reports whether
     * anything was reapplied.
     */
    redo(): boolean;
    /**
     * Registers raw sfnt bytes in this session's resident measurement store
     * and returns the font id that measurement and display inputs reference.
     * Errors on bytes the font parser rejects.
     */
    register_measure_font(bytes: Uint8Array): number;
    /**
     * Registers a measurement view of `base` carrying the vertical metrics
     * and advance pitch Word measures `requested_family` with — for a face
     * this host had to substitute. Returns `base` for a family whose metrics
     * are unknown.
     */
    register_substitute_measure_font(base: number, requested_family: string): number;
    /**
     * Rejects tracked changes — the inverse of
     * [`EditSession::accept_change`]: pending insertions roll back, pending
     * deletions restore their text; `pPrIns` marks join back with the
     * following paragraph, `pPrDel` marks clear so the split stays, and a
     * `pPrChange` restores the paragraph's previous properties. Same target,
     * receipt and error contract.
     */
    reject_change(target_json: string): string;
    /**
     * Release display pages; an empty result means the request was superseded.
     */
    release_display_pages_frame(pages: Uint32Array, expected_frame_epoch: number): Uint8Array;
    repeat_content_control_at(story: string, index: number, remove: boolean): boolean;
    /**
     * Replaces `[start, end)` with `text` in one transaction. The inserted
     * text adopts the first replaced unit's formatting; in suggesting mode
     * the deletion and the insertion share one revision id. Receipt:
     * `{"revisionId": string|null, "range": {"story", "start": {"paraId", "offset"}, "end": {"paraId", "offset"}}}`.
     */
    replace_range(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, text: string, author_name?: string | null, author_date?: string | null): string;
    /**
     * Makes the next display frame a full one whatever epoch its caller
     * passes, for a host that switches to this engine from another.
     */
    reset_frame_base(): void;
    /**
     * `{"frameEpoch", "caretRect": {…}|null}` for the session's own collapsed
     * body selection. `caretRect` is null whenever there is no selection, the
     * selection is not a collapsed body caret, or the retained layout has no
     * geometry for it. `frameEpoch` identifies the frame the rect belongs to.
     */
    resident_caret_snapshot_json(): string;
    /**
     * Characters the last [`EditSession::apply_delete`] removed.
     */
    resident_deleted_units(): number;
    resident_geometry_json(root: string, request: string): string;
    resident_section_revision(): string;
    /**
     * Where a comment's sticky anchors currently sit:
     * `[{"story","start","end"}, …]`, one entry per anchored range, in
     * story-global UTF-16 units. Errors on an unknown comment id and when an
     * anchor no longer resolves.
     */
    resolve_comment(comment_id: string): string;
    /**
     * Resolves another peer's encoded selection against this replica's
     * current state: `{"anchor":{"story","paraId","offset"},"head":{…}}`.
     * Errors on malformed bytes or an endpoint that no longer resolves.
     */
    resolve_encoded_selection(story: string, anchor: Uint8Array, head: Uint8Array): string;
    /**
     * Resolves a `session`, `source` or `persisted` anchor JSON against the
     * current state: `{"status":"found","anchor"}`, `{"status":"missing"}`,
     * `{"status":"ambiguous","candidates"}` or `{"status":"unsupported",
     * "reason"}` with a `foreign-session`, `foreign-package` or
     * `no-source-package` reason. A found source paragraph outside the
     * session stories comes back as its source anchor. Errors on a malformed
     * anchor.
     */
    resolve_paragraph_anchor(anchor_json: string): string;
    /**
     * Resolves sticky bytes from [`EditSession::encode_sticky_position`] back
     * to `{"story","paraId","offset"}`. Errors when the bytes are malformed
     * or the position no longer resolves in `story`.
     */
    resolve_sticky_position(story: string, position: Uint8Array): string;
    /**
     * Measures up to `blocks` more body blocks of the begun pass; see
     * `EngineSession::resume_region_layout`.
     */
    resume_region_layout(blocks: number): string;
    /**
     * The retained region layout's `headersFooters` JSON, when it has any.
     */
    retained_headers_footers_json(): string | undefined;
    /**
     * Retained `{ measured, options }` for the main-thread display-list
     * fallback after a retained-only region layout.
     */
    retained_kernel_inputs_json(): string;
    retained_layout_json(): string;
    /**
     * Ids of the tracked changes of `story` whose range holds the caret at
     * `para_id`/`offset`, in `list_revisions` order: `["id", …]`. The caret
     * and both range ends resolve through their paragraph's span start as
     * `locate_paragraph` gives it; a range whose paragraph does not resolve
     * holds nothing. Reads only `story`, unlike `list_revisions`.
     */
    revision_ids_at(story: string, para_id: string, offset: number): string;
    /**
     * Author and date stamps for the requested revision ids.
     */
    revision_stamps_json(ids_json: string): string;
    /**
     * Resolves what runs inherit under `styles_json`, a package's style definitions or `null`.
     */
    run_inheritance(styles_json: string): RunInheritance;
    search_text(query: string, case_sensitive: boolean, limit?: number | null): string;
    section_margins_json(): string;
    /**
     * Initializes imported metadata, creating an unanchored comment when absent.
     */
    seed_comment_metadata_json(comment_id: string, patch_json: string): void;
    /**
     * [`EditSession::open_docx`] with seeding always on.
     */
    seed_from_docx(bytes: Uint8Array, generation?: string | null): string;
    /**
     * Unions seeded opaque sequence names into document state.
     */
    seed_opaque_sequences(names_json: string): void;
    /**
     * Selects a story, closing capture unless manual grouping is selected.
     */
    select_story(story: string): void;
    /**
     * Aggregated toolbar and accessibility state over `[start, end)`:
     *
     * ```json
     * {
     *   "bold": true | false | "mixed", "italic": …, "underline": …, "strike": …,
     *   "superscript": …, "subscript": …,
     *   "fontFamily": string|null, "fontSize": number|null, "color": string|null,
     *   "highlight": string|null,
     *   "paraId": string, "styleId": string|null, "alignment": string|null,
     *   "paragraphProperties": {…},
     *   "hasSelection": bool, "isMultiParagraph": bool, "inTable": bool,
     *   "isSingleEmbed": bool, "embedKind": string|null, "isImage": bool,
     *   "inInsertion": bool, "inDeletion": bool
     * }
     * ```
     *
     * A toggle mark is `"mixed"` when the range disagrees about it; a value
     * mark is `null` when it is absent OR not uniform, so the two cases are
     * not distinguished. `isImage` is `embedKind == "image"`, and
     * `inInsertion`/`inDeletion` report whether the range sits inside a
     * pending tracked change.
     */
    selection_context(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number): string;
    /**
     * This peer's current selection as `{"anchor":{"story","paraId","offset"},
     * "head":{…}}`, or `"null"` before [`EditSession::set_selection`] is
     * called. Errors when an endpoint no longer resolves.
     */
    selection(): string;
    /**
     * Accepted-view texts around a paragraph-keyed selection:
     * `{"paraId","selectedText","paragraphText","before","after"}`, with
     * `\n` between paragraphs and U+FFFC for each inline atom.
     */
    selection_text_json(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number): string;
    /**
     * Merges the sides of the JSON object `borders_json` into every selected
     * cell's `tcPr.borders`; `insideH`/`insideV` resolve to the physical edges
     * interior to the selection. `range_json` is a [`TableRange`]. Always a
     * plain local edit.
     */
    set_cell_borders(range_json: string, borders_json: string): string;
    /**
     * Stores a rectangular anchor-cell to head-cell selection outside the yrs
     * document. `range_json` is a [`TableRange`]:
     * `{"anchor":{"story","tableIndex","row","column"},"head":{…}}`. The table
     * embed is held by a sticky index and each endpoint by its cell story's
     * stable identity, so the selection survives unrelated edits and follows
     * inserted or deleted rows and columns. Errors when the two endpoints are
     * not in the same table, or when either cell does not resolve.
     */
    set_cell_selection(range_json: string): void;
    /**
     * Sets every selected cell's background to `color` (hex, with or without
     * a leading `#`), or clears it when `color` is absent. `range_json` is a
     * [`TableRange`]. Always a plain local edit.
     */
    set_cell_shading(range_json: string, color?: string | null): string;
    /**
     * Merges the JSON object `patch_json` into every selected cell's `tcPr`;
     * a `null` value removes that key. `range_json` is a [`TableRange`].
     * Always a plain local edit. Errors when the patch touches `rowspan`,
     * `colspan`, `gridSpan` or `vMerge`, which only merge and split may set.
     */
    set_cell_text_format(range_json: string, patch_json: string): string;
    /**
     * Sets the grid width, in twips, of the column holding the cell `at_json`
     * ([`CellLoc`]) names. Always a plain local edit. Errors unless
     * `width_twips` is finite and positive.
     */
    set_column_width(at_json: string, width_twips: number): string;
    /**
     * Reanchors an existing comment without changing its metadata.
     */
    set_comment_ranges(comment_id: string, ranges_json: string): void;
    /**
     * Sets the authored `value` on the content-control embed at
     * `(story, para_id, offset)` — the way to reach a control with no
     * authored `w:id` or tag, which
     * [`EditSession::set_content_control_value`] cannot address. A text
     * control's string value fills it as that method does. Errors when that
     * position holds no embed.
     */
    set_content_control_value_at(story: string, para_id: string, offset: number, value_json: string): void;
    /**
     * Sets the authored `value` (any JSON) on the content-control embed
     * carrying `embed_id`, searching every story. A plain- or rich-text
     * control takes a string, which fills its content as one
     * version-checked batch step instead. Errors when no embed has that id
     * and when a fill is refused.
     */
    set_content_control_value(embed_id: string, value_json: string): void;
    set_content_control_value_index(story: string, index: number, json: string): void;
    /**
     * Apply admitted paragraph-local text batches directly. Off by default.
     */
    set_direct_batches(enabled: boolean): void;
    /**
     * Keep every previously built page while windowed builds are on.
     */
    set_display_retain_built_pages(retain: boolean): void;
    /**
     * Limit full display builds to pages `start..end` plus the pages already
     * built; the others stay unbuilt placeholders carrying their geometry
     * until [`Self::build_display_pages_frame`] builds them.
     */
    set_display_window(start: number, end: number): void;
    set_document_property(key: string, json: string): boolean;
    /**
     * Declares header/footer alias groups before host-side seeding.
     */
    set_header_footer_aliases(json: string): void;
    /**
     * Sets or clears the hyperlink attribute over `[start, end)`.
     * `hyperlink_json` is `{"href", "tooltip"?, "rId"?}` or `null` to unlink.
     * The attribute is protected: ordinary formatting ops cannot write or
     * erase it, only this one. Errors when the JSON is neither an object nor
     * `null`.
     */
    set_hyperlink(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, hyperlink_json: string): void;
    /**
     * [`EditSession::set_image_geometry`] for the image embed at
     * `(story, para_id, offset)` — the way to reach one of several images
     * sharing a relationship id, which the id variant resolves to the first.
     * Errors when that position holds no image.
     */
    set_image_geometry_at(story: string, para_id: string, offset: number, geometry_json: string): void;
    /**
     * Writes geometry fields onto the image embed carrying `embed_id` in one
     * transaction. Every key of the `geometry_json` object becomes a payload
     * entry, with `null` clearing it; the entries of a nested `"other"`
     * object are flattened into the payload alongside them. Errors when
     * `geometry_json` or its `"other"` is not an object, and when no embed
     * has that id.
     */
    set_image_geometry(embed_id: string, geometry_json: string): void;
    /**
     * Let an eligible resident text edit re-lower only its paragraph. Off by default.
     */
    set_local_lowering(enabled: boolean): void;
    /**
     * Whether [`EditSession::open_docx`] seeds images as `media:{n}` tokens,
     * which only a replica opened from the same package resolves, instead of
     * `data:` URLs. Off by default.
     */
    set_media_tokens(enabled: boolean): void;
    /**
     * Sets one paragraph property to any JSON value on `para_id`'s pilcrow,
     * searching every story. Unlike
     * [`EditSession::set_paragraph_attrs`] this writes a single key and never
     * records a revision. Errors when the paragraph is unknown and when `key`
     * names schema-managed identity (`paraId` or the embed discriminator).
     */
    set_paragraph_attr(para_id: string, key: string, value_json: string): void;
    /**
     * Applies a tri-state paragraph-property delta to every paragraph
     * intersecting `[start, end)` in one transaction. An omitted key keeps
     * the current value and `null` clears it. `attrs_json` recognises
     * `alignment`, `lineSpacing`, `lineSpacingRule`, `spaceBefore`,
     * `spaceAfter`, `indentLeft`, `indentRight`, `indentFirstLine`,
     * `hangingIndent`, `bidi`, `tabs`
     * (`[{"position":number,"alignment":string,"leader"?:string}, …]`) and
     * `defaultTextFormatting` (an object of run defaults). Any other key —
     * whether written at the top level or nested under `"other"` — is stored
     * as an opaque paragraph property. Spacing and indents are authored OOXML
     * units (twips, line-spacing units), never pixels. In suggesting mode a
     * change is recorded as a `pPrChange` revision. Errors when a recognised
     * key carries the wrong type, and when a key names schema-managed
     * identity such as `paraId`.
     */
    set_paragraph_attrs(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, attrs_json: string, author_name?: string | null, author_date?: string | null): void;
    set_part_metadata(json: string, remove_json: string): boolean;
    /**
     * Marks whether the session's document is part of a package, as a
     * replica of a preview is: its layouts render NUMPAGES empty.
     */
    set_partial_document(partial: boolean): void;
    set_section_margins(section: string, json: string): boolean;
    /**
     * Stores this peer's anchor and head as sticky positions, replacing any
     * previous selection. Both endpoints must lie in `story`. The positions
     * live outside the yrs document, so they are never serialized as content
     * or carried in an update. `Assoc::After` makes a collapsed caret advance
     * with text inserted at it.
     */
    set_selection(story: string, anchor_para: string, anchor_offset: number, head_para: string, head_offset: number): void;
    set_table_properties(table_json: string, patch_json: string): string;
    /**
     * Sets the preferred width, in twips, of the table `table_json`
     * ([`TableLocator`]) names. Always a plain local edit. Errors unless
     * `width_twips` is finite and positive.
     */
    set_table_width(table_json: string, width_twips: number): string;
    /**
     * Changes grouping policy while retaining undo and redo history.
     */
    set_undo_capture_mode(mode: string): void;
    /**
     * Pins the input span used to measure the next capture gap.
     */
    set_undo_input_time(first: number, last: number): void;
    /**
     * Subscribes `callback(update: Uint8Array, isRemote: 0|1)` to every
     * committed transaction. `update` is v1-encoded — feed it straight to
     * [`EditSession::apply_update`] on a peer — and is copied out of wasm
     * memory, so JS may hold it across later edits. The second argument is
     * `1` when the transaction had no local origin; a remote update's own
     * formatting cleanup follows it as a `0` update to forward. One observer
     * per session; a second call replaces the first, and a throwing callback
     * is ignored.
     */
    set_update_observer(callback: Function): void;
    /**
     * Limit incremental rebuilds to the display window and caret pages. Off by default.
     */
    set_windowed_incremental_builds(enabled: boolean): void;
    /**
     * Resolves tracked changes by revision id outside undo history:
     * `{"accept":[string, …],"reject":[string, …]}` -> `{"ok":true,"revisionIds":[string, …]}`,
     * the ids resolved, or `{"ok":false,"version","failure"}`. An id that matches nothing is
     * skipped. See [`EditingDoc::settle_revisions`].
     */
    settle_revisions_json(request: string): string;
    /**
     * Splits the cell `at_json` ([`CellLoc`]) covers into a `rows` x
     * `columns` grid; the original story stays in the top-left slot and every
     * other slot gets a fresh one-paragraph cell story. Omitting both
     * dimensions unmerges the cell into the slots it already covers, which
     * then requires a merged cell. Always a plain local edit. Errors on a
     * zero dimension or a grid smaller than the cell already covers.
     */
    split_cell(at_json: string, rows?: number | null, columns?: number | null): string;
    /**
     * Splits a paragraph at `(story, para_id, offset)` by inserting one
     * pilcrow. The FIRST half keeps the original paraId and the second is
     * re-minted. A split at the paragraph end leaves the empty second half
     * with only the inherited property subset; a mid-paragraph split keeps
     * its properties. Paragraph borders are cleared either way. Suggesting
     * mode stamps the new pilcrow `ins` and `pPrIns`. Receipt:
     * `{"firstParaId","secondParaId","revisionId": string|null}`.
     */
    split_paragraph(story: string, para_id: string, offset: number, author_name?: string | null, author_date?: string | null): string;
    /**
     * Starts queueing committed transactions for
     * [`EditSession::drain_update_event`] instead of pushing them through a
     * callback. Idempotent while observation is running.
     */
    start_update_event_observation(): void;
    /**
     * `{"revision","stories":[…]}`: the current story revision and the sorted
     * ids of the stories created, edited, or deleted after revision `since`.
     */
    stories_changed_since(since: number): string;
    /**
     * The story's `canonical-stream-v1` FNV-1a checksum (see
     * [`crate::canonical`]) as a DECIMAL STRING, because a u64 exceeds the
     * JavaScript safe-integer range. Two stories with the same authored
     * content share a checksum even when their paragraph and comment ids
     * differ. Errors on an unknown story.
     */
    story_checksum(story: string): string;
    /**
     * Every story id in the document, sorted so the order is stable across
     * replicas.
     */
    story_ids(): string[];
    /**
     * Story length in UTF-16 units, every embed (pilcrows included) counting
     * as one. Errors on an unknown story.
     */
    story_len(story: string): number;
    /**
     * The Word paragraph ID each paragraph of `story` saves with, as a JSON
     * array of strings or `null` in document order. Errors on an unknown story.
     */
    story_paragraph_ids(story: string): string;
    /**
     * `story_segments` split after each pilcrow into units, as one hex digest
     * per unit: `["digest", …]`. Equal digests mean equal segments.
     */
    story_segment_unit_digests(story: string): string;
    /**
     * The segments of the listed units (indices into
     * `story_segment_unit_digests`), each as `story_segments` gives them:
     * `[[segment, …], …]`. Errors on an index past the last unit.
     */
    story_segment_units(story: string, units: Uint32Array): string;
    /**
     * The story as an ordered run of formatted segments — the same view
     * lowering reads:
     *
     * - `{"kind":"text","text","attributes"}`
     * - `{"kind":"pilcrow","paraId","properties","attributes"}`
     * - `{"kind":"embed","embedKind","payload","attributes"}`
     *
     * A text segment covers one maximal run of identically formatted
     * characters; each pilcrow and embed is its own segment worth one unit.
     * `attributes` holds the segment's run marks together with any `ins`/`del`
     * tracked-change stamps. Errors on an unknown story.
     */
    story_segments(story: string): string;
    /**
     * The `payload` of the story's `table_index`-th table embed, as
     * `story_segments` gives it, or `None` when the story has no such
     * table. Errors on an unknown story.
     */
    table_payload(story: string, table_index: number): string | undefined;
    /**
     * Applies one run mark over `[start, end)`. `mark_json`:
     * `{"type":"bold"|"italic"|"underline"|"strike"|"superscript"|"subscript"} |
     * {"type":"fontFamily"|"color","value":string} |
     * {"type":"fontSize","value":number}`. The six boolean types TOGGLE —
     * they turn on unless the whole range already carries the mark — while
     * font family, size and color SET. Formatting is always a plain local
     * edit, never a tracked change, so there is no receipt. Errors on an
     * unknown `"type"` or a missing/mistyped `"value"`.
     */
    toggle_mark(story: string, start_para: string, start_offset: number, end_para: string, end_offset: number, mark_json: string): void;
    /**
     * Starts local-origin undo tracking across every story. Call this after
     * import or seeding but before the first edit, so the initial document is
     * not an undo step; later calls keep the history.
     */
    track_undo(): void;
    /**
     * Current undo grouping policy.
     */
    undo_capture_mode(): string;
    /**
     * Reverts the latest local-origin step and reports whether anything was
     * reverted. Remote and system transactions are excluded by the manager's
     * tracked-origin policy; `false` before tracking starts.
     */
    undo(): boolean;
    update_comment_metadata_json(comment_id: string, patch_json: string): void;
    /**
     * Runs every check of [`EditSession::apply_edits_json`], staging included,
     * without changing anything: `{"ok":true,"baseVersion","wouldApply","previews"}`.
     */
    validate_edits_json(request: string): string;
    validate_table_fragment(fragment_json: string): void;
    /**
     * The session-scoped version token of the committed document state. It
     * changes on every committed change, local or remote, and when the
     * document or its retained source is replaced.
     */
    version(): string;
    /**
     * The Word paragraph IDs a DOCX package holds, as JSON mapping each XML
     * part URI to its paragraphs' IDs in document order, in canonical form.
     */
    written_paragraph_ids(bytes: Uint8Array): string;
    /**
     * Lowers one story to a `LayoutBlock[]` JSON array — the block, run and
     * table vocabulary the layout engine consumes. `env_json` supplies the
     * document-level values lowering cannot read off the story:
     * `{"themeColors":{slot: hex},"defaultTabStopTwips":number|null,
     * "pageContentHeight":number|null,"numericIds":{yrsId: number},
     * "tocStyleIds":[styleId],"showHiddenText":bool,
     * "defaultParagraphStyleId":string,
     * "revisionPreview":{revisionId: "accepted"|"rejected"}}`, all
     * optional. Errors when the story does not end in a pilcrow, holds a
     * malformed table, references itself through a cell story, or contains an
     * embed lowering does not support.
     */
    yrs_blocks_for_story(story: string, env_json: string): string;
}

declare class RetainedLayoutMeta {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    layout_shell_json(): string;
    page_sizes(): Float64Array;
    readonly notes_converged: boolean;
    readonly page_count: number;
    readonly partial: boolean;
    readonly provisional: boolean;
}

/**
 * What runs inherit under one package's styles; see [`EditSession::run_inheritance`].
 */
declare class RunInheritance {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The attributes, as a JSON object, that seeding merges into the marks of a run of
     * `run_style` in a paragraph of `paragraph_style` before the run's direct formatting.
     */
    attributes(paragraph_style?: string | null, run_style?: string | null, table_run_json?: string | null): string;
    paragraph_formatting(paragraph_style: string | null | undefined, table_formatting_json: string): string;
    table_attributes(table_json: string): string;
}

/**
 * Loader for the docx-edit wasm (the Rust yrs editing core + resident layout
 * engine). External-asset pattern — see ./loadWasmAsset.ts for the init
 * contract and URL-geometry invariant.
 *
 * Reached only via the `src/yrs/` facade's dynamic `import()`, so the glue
 * (and the wasm fetch) stay out of every non-editor bundle path. The facade's
 * async `createYrsSession` awaits {@link preloadEditWasm} before constructing
 * a session, which also covers the resident engine worker (it bootstraps
 * through the same facade inside the worker context).
 */

/** Load + instantiate the editing-core wasm (browser path). Idempotent. */
declare function preloadEditWasm(input?: WasmAsyncInput): Promise<void>;
/** @internal */
declare function editWasmModule(): Promise<WebAssembly.Module | null>;
/** @internal */
declare function preloadEditWasmFrom(source: Promise<WebAssembly.Module | null>): Promise<void>;
/**
 * Caps the bytes the editing core in this thread may allocate at once; an
 * allocation past the cap fails as if the memory were full. Undefined removes it.
 */
declare function setEditWasmHeapLimit(bytes: number | undefined): void;
/**
 * Constructs a raw wasm `EditSession` replica after ensuring the module is
 * initialized. The `src/yrs/` facade wraps this in the typed `YrsSession`
 * surface — nothing else should call it.
 */
declare function createEditSession(clientId: number): EditSession;
/** Structured export of DOCX bytes: `{ok: true, content}` or `{ok: false, failure}` JSON. */
declare function exportDocxStructuredJson(bytes: Uint8Array, options: string): string;
/** {@link exportDocxStructuredJson} rendered as Markdown. */
declare function exportDocxMarkdownJson(bytes: Uint8Array, options: string): string;
/** Markdown rendering of structured content JSON. */
declare function renderDocxMarkdownJson(content: string, options: string): string;
/** Content controls of DOCX bytes: `{ok: true, content}` or `{ok: false, failure}` JSON. */
declare function listDocxContentControlsJson(bytes: Uint8Array, options: string): string;
/** The content controls of DOCX bytes matching a query, as {@link listDocxContentControlsJson}. */
declare function findDocxContentControlsJson(bytes: Uint8Array, query: string, options: string): string;
/** Markdown rendering of a paged export's JSON, with optional page markers. */
declare function renderDocxMarkdownWithPagesJson(content: string, options: string): string;

export { EditSession, createEditSession, editWasmModule, exportDocxMarkdownJson, exportDocxStructuredJson, findDocxContentControlsJson, listDocxContentControlsJson, preloadEditWasm, preloadEditWasmFrom, renderDocxMarkdownJson, renderDocxMarkdownWithPagesJson, setEditWasmHeapLimit };
