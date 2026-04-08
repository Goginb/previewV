export function isTypingTarget(e: KeyboardEvent | React.KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    // Sliders / toggles are not text fields — canvas shortcuts must still work
    if (
      type === 'range' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'file' ||
      type === 'color'
    ) {
      return false
    }
    return true
  }
  return false
}
