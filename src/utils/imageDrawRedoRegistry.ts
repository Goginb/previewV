/**
 * Similar to imageDrawUndoRegistry, but for redo.
 * Returns true if a redo was performed, false if stack is empty.
 */
export const imageDrawRedoRegistry = new Map<string, () => boolean>()

