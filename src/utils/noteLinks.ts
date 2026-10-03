export interface NoteTextPart {
  text: string
  url?: string
}

/** Validate the supported protocols without normalizing or re-encoding the URL. */
export function isSupportedNoteUrl(value: unknown): value is string {
  if (typeof value !== 'string' || /[\s<>"\u0000-\u001f\u007f]/u.test(value)) return false
  if (/^cerebro:.+/i.test(value)) return true
  if (!/^https?:\/\//i.test(value)) return false
  try {
    return new URL(value).hostname.length > 0
  } catch {
    return false
  }
}

/** Derive links from plain text, including notes loaded from older projects. */
export function splitNoteLinks(text: string): NoteTextPart[] {
  const parts: NoteTextPart[] = []
  const pattern = /(?<![\p{L}\p{N}_])(?:https?:\/\/|cerebro:)[^\s<>"\u0000-\u001f\u007f]+/giu
  let end = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index!
    let url = match[0]
    // Sentence punctuation and unmatched closing brackets belong to the note.
    url = url.replace(/[.,;!]+$/u, '')
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (url.endsWith(close) && url.split(close).length > url.split(open).length) {
        url = url.slice(0, -1)
      }
    }
    if (!isSupportedNoteUrl(url)) continue
    if (start > end) parts.push({ text: text.slice(end, start) })
    parts.push({ text: url, url })
    end = start + url.length
  }
  if (end < text.length) parts.push({ text: text.slice(end) })
  return parts.length ? parts : [{ text }]
}
