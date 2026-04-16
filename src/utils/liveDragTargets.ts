import { backdropDomRegistry } from './backdropDomRegistry'
import { tileDomRegistry } from './tileDomRegistry'

export function collectLiveDragTargets(ids: Iterable<string>, excludeId?: string): HTMLElement[] {
  const out = new Set<HTMLElement>()

  for (const id of ids) {
    if (excludeId && id === excludeId) continue

    const tileDom = tileDomRegistry.get(id)
    if (tileDom) out.add(tileDom)

    const backdropDom = backdropDomRegistry.get(id)
    if (backdropDom?.body) out.add(backdropDom.body)
    if (backdropDom?.header) out.add(backdropDom.header)
  }

  return Array.from(out)
}
