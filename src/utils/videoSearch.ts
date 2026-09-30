const LATIN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./"
const CYRILLIC_KEYS = 'ёйцукенгшщзхъфывапролджэячсмитьбю.'

const latinToCyrillic = new Map<string, string>()
const cyrillicToLatin = new Map<string, string>()
for (let index = 0; index < LATIN_KEYS.length; index += 1) {
  latinToCyrillic.set(LATIN_KEYS[index], CYRILLIC_KEYS[index])
  cyrillicToLatin.set(CYRILLIC_KEYS[index], LATIN_KEYS[index])
}

function convertLayout(query: string, layout: Map<string, string>, preservePunctuation: boolean): string {
  return Array.from(query, (key) => {
    if (preservePunctuation && !/[a-zа-яё]/u.test(key)) return key
    return layout.get(key) ?? key
  }).join('')
}

export function matchesVideoFileName(fileName: string, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true

  const name = fileName.toLowerCase()
  if (name.includes(query)) return true

  return [latinToCyrillic, cyrillicToLatin].some((layout) =>
    name.includes(convertLayout(query, layout, false)) ||
    name.includes(convertLayout(query, layout, true)),
  )
}
