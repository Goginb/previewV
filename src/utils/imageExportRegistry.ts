/**
 * Registry for exporting current annotated image (base + overlay strokes)
 * without forcing an immediate "Bake" into the store.
 *
 * ImageTile registers a function that returns a PNG data URL when there are
 * unsaved overlay strokes, or `null` when the current store source is already up to date.
 */
export const imageExportRegistry = new Map<string, () => string | null>()

