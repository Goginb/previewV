import test from 'node:test'
import assert from 'node:assert/strict'
import type { CanvasItem, VideoItem } from '../src/types'
import { chooseVideoSources, MAX_LOADED_VIDEOS } from '../src/utils/videoSourceBudget'

const video = (id: string, x = 0, y = 0): VideoItem => ({
  type: 'video', id, x, y, width: 100, height: 100, fileName: id, srcUrl: 'media:///test.mov',
})
const choose = (items: CanvasItem[], selectedIds: string[] = [], navigationMode = false) => chooseVideoSources({
  items, selectedIds, navigationMode, viewport: { x: 0, y: 0, scale: 1 }, width: 1000, height: 800,
})

test('hundreds of paused videos still obey the media-source cap and selected visible tiles win', () => {
  const items = Array.from({ length: 445 }, (_, i) => video(String(i), 450, 350))
  const ids = choose(items, ['444'])
  assert.equal(ids.length, MAX_LOADED_VIDEOS)
  assert.equal(ids[0], '444')
})

test('off-screen and collapsed videos never acquire sources, including selected videos', () => {
  const items: CanvasItem[] = [video('visible'), video('outside', 3000), video('collapsed'), {
    type: 'backdrop', id: 'group', x: 0, y: 0, width: 300, height: 300,
    color: '#333333', brightness: 100, saturation: 100, label: '', labelSize: 'sm',
    collapsed: true, attachedVideoIds: ['collapsed'], displayMode: 'solid',
  }]
  assert.deepEqual(choose(items, ['outside', 'collapsed']), ['visible'])
})

test('source selection follows pan/zoom and navigation overview releases every decoder', () => {
  const items = [video('first'), video('next', 3000)]
  assert.deepEqual(choose(items), ['first'])
  assert.deepEqual(chooseVideoSources({ items, selectedIds: [], navigationMode: false,
    viewport: { x: -3000, y: 0, scale: 1 }, width: 1000, height: 800 }), ['next'])
  assert.deepEqual(choose(items, [], true), [])
})
