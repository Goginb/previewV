/**
 * Registry for exporting current annotated image (base + overlay strokes)
 * without forcing an immediate "Bake" into the store.
 *
 * ImageTile registers a function that returns a dataUrl (PNG).
 */
export const imageExportRegistry = new Map<string, () => string>()

