/**
 * Global registry that ImageTile components use to expose their drawing
 * undo callback.  Returns true if a stroke was undone, false if the stack
 * was already empty (signals Canvas to fall through to global undo).
 */
export const imageDrawUndoRegistry = new Map<string, () => boolean>()
