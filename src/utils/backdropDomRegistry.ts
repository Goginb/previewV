export interface BackdropDomEntry {
  body: HTMLElement | null
  header: HTMLElement | null
}

export const backdropDomRegistry = new Map<string, BackdropDomEntry>()
