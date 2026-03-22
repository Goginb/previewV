import test from 'node:test'
import assert from 'node:assert/strict'

import type { CanvasItem } from '../src/types'
import { useCanvasStore } from '../src/store/canvasStore'

const META = {
  createdAt: '2026-03-23T00:00:00.000Z',
  updatedAt: '2026-03-23T00:00:00.000Z',
}

function note(id: string, x = 0, y = 0): CanvasItem {
  return {
    type: 'note',
    id,
    x,
    y,
    width: 160,
    height: 120,
    text: '',
  }
}

function resetStore(): void {
  useCanvasStore.setState({
    items: [],
    selectedIds: [],
    viewport: { x: 0, y: 0, scale: 1 },
    clipboard: [],
    currentProjectPath: null,
    isDirty: false,
    projectMeta: META,
    imageEditModeId: null,
    _past: [],
    _future: [],
  })
}

test('viewport changes do not dirty the project', () => {
  resetStore()
  useCanvasStore.setState({ items: [note('note-a', 10, 10)] })

  useCanvasStore.getState().setViewport({ x: 120, y: 80, scale: 1.25 })
  assert.equal(useCanvasStore.getState().isDirty, false)

  useCanvasStore.getState().frameAllItemsInViewport(1280, 720)
  assert.equal(useCanvasStore.getState().isDirty, false)

  useCanvasStore.getState().resetViewport()
  assert.equal(useCanvasStore.getState().isDirty, false)
})

test('addItems and updateItemsBatch use batched commits with predictable history', () => {
  resetStore()

  useCanvasStore.getState().addItems([note('note-a'), note('note-b', 40, 60)])

  let state = useCanvasStore.getState()
  assert.equal(state.items.length, 2)
  assert.equal(state._past.length, 1)
  assert.deepEqual(state._past[0], [])
  assert.equal(state.isDirty, true)

  state.updateItemsBatch(
    [
      { id: 'note-a', updates: { x: 100 } },
      { id: 'note-b', updates: { y: 200 } },
    ],
    { recordHistory: true },
  )

  state = useCanvasStore.getState()
  assert.equal(state._past.length, 2)
  assert.equal(state.items.find((item) => item.id === 'note-a')?.x, 100)
  assert.equal(state.items.find((item) => item.id === 'note-b')?.y, 200)
})

test('syncSavedProjectState replaces runtime items while clearing dirty state', () => {
  resetStore()
  useCanvasStore.getState().addItems([note('note-a')])
  useCanvasStore.getState().setSelection(['note-a'])

  useCanvasStore.getState().syncSavedProjectState(
    {
      items: [note('note-a', 500, 600)],
      viewport: { x: 10, y: 20, scale: 1.5 },
      meta: {
        createdAt: META.createdAt,
        updatedAt: '2026-03-23T01:00:00.000Z',
      },
    },
    'C:\\projects\\demo.previewv',
  )

  const state = useCanvasStore.getState()
  assert.equal(state.isDirty, false)
  assert.equal(state.currentProjectPath, 'C:\\projects\\demo.previewv')
  assert.equal(state.viewport.scale, 1.5)
  assert.equal(state.items[0]?.x, 500)
  assert.deepEqual(state.selectedIds, ['note-a'])
})
