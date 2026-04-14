/**
 * Allows global hotkeys (F4) to request "bake current drawing"
 * on the image tile currently in edit mode.
 */
export const imageDrawBakeRegistry = new Map<string, () => boolean>()
