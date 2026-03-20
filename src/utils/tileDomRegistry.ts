/**
 * Registry to do live visual group dragging without re-rendering React.
 * Key: item.id, Value: root HTMLElement for that tile.
 */
export const tileDomRegistry = new Map<string, HTMLElement>()

