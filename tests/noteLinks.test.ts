import test from 'node:test'
import assert from 'node:assert/strict'
import { isSupportedNoteUrl, splitNoteLinks } from '../src/utils/noteLinks'
import { deserializeProject, serializeProject } from '../src/utils/projectSerializer'
import type { NoteItem } from '../src/types'

test('note links preserve Cyrillic, query parameters and original percent encoding', () => {
  const urls = [
    'http://example.com/a?x=1&y=2#part',
    'https://example.com/%d0%bf%D1%83%D1%82%D1%8C?q=a%2fb+%20&next=%252F',
    'cerebro:/путь?tid=123&pid=456',
    'cerebro:/%d0%bf%D1%83%D1%82%D1%8C?tid=123&pid=456',
  ]
  const text = `Ссылки:\n${urls.join('\n')}\nготово`
  const parts = splitNoteLinks(text)
  assert.deepEqual(parts.filter((part) => part.url).map((part) => part.url), urls)
  assert.equal(parts.map((part) => part.text).join(''), text)
})

test('note links support upper-case protocols and balanced parentheses', () => {
  const text = 'См. (HTTPS://example.com/a(b)) и cerebro:/проект?tid=1&pid=2.'
  const parts = splitNoteLinks(text)
  assert.deepEqual(parts.filter((part) => part.url).map((part) => part.url), [
    'HTTPS://example.com/a(b)', 'cerebro:/проект?tid=1&pid=2',
  ])
  assert.equal(parts.map((part) => part.text).join(''), text)
})

test('only complete URLs with the requested protocols can reach the system handler', () => {
  for (const url of ['https://example.com/', 'http://example.com/', 'cerebro:/путь?tid=1&pid=2']) {
    assert.equal(isSupportedNoteUrl(url), true, url)
  }
  for (const url of [null, 12, '', 'cerebro:', 'https://', 'https://?', 'file:///C:/test.exe',
    'javascript:alert(1)', 'mailto:a@example.com', ' https://example.com', 'https://example.com\nfile:///test']) {
    assert.equal(isSupportedNoteUrl(url), false, String(url))
  }
  const text = 'Не ссылки: file:///test, javascript:alert(1), словоhttps://example.com'
  assert.deepEqual(splitNoteLinks(text), [{ text }])
})

test('existing v1 and v2 notes acquire links without altering serialized note text', () => {
  const text = 'Cerebro: cerebro:/путь?tid=123&pid=456\nWeb: https://example.com/%2f?q=%252F'
  const meta = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
  for (const version of [1, 2]) {
    const loaded = deserializeProject({
      version, meta, viewport: { x: 0, y: 0, scale: 1 },
      items: [{ type: 'note', id: 'existing-note', x: 10, y: 20, width: 600, height: 300, text }],
    })
    const note = loaded.items[0] as NoteItem
    assert.equal(note.text, text)
    assert.equal(splitNoteLinks(note.text).filter((part) => part.url).length, 2)
    const saved = serializeProject({ items: loaded.items, viewport: loaded.viewport, meta, assetPathForImage: () => '' })
    assert.equal((saved.items[0] as { text: string }).text, text)
  }
})
