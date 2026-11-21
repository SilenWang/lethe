/**
 * Pure list-state helpers that track whether the selection is in a
 * bullet or numbered list and at what indent level.
 * @packageDocumentation
 * @public
 */
type ListType = 'bullet' | 'numbered' | 'none';
interface ListState {
    type: ListType;
    level: number;
    isInList: boolean;
    numId?: number;
}
declare function createDefaultListState(): ListState;
declare function createBulletListState(level?: number, numId?: number): ListState;
declare function createNumberedListState(level?: number, numId?: number): ListState;
declare function isBulletListState(state: ListState | undefined): boolean;
declare function isNumberedListState(state: ListState | undefined): boolean;
declare function isAnyListState(state: ListState | undefined): boolean;
declare function getNextIndentLevel(currentLevel: number): number;
declare function getPreviousIndentLevel(currentLevel: number): number;
declare function toggleListType(state: ListState | undefined, targetType: ListType): ListState;

export { type ListState, type ListType, createBulletListState, createDefaultListState, createNumberedListState, getNextIndentLevel, getPreviousIndentLevel, isAnyListState, isBulletListState, isNumberedListState, toggleListType };
