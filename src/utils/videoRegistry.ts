/**
 * Global map that VideoTile components use to register their <video> elements.
 * The Canvas F3 handler looks up the selected tile's video here to capture
 * the current frame without needing React context or prop drilling.
 */
export const videoRegistry = new Map<string, HTMLVideoElement>()
