import test from 'node:test'
import assert from 'node:assert/strict'

import type { CanvasItem } from '../src/types'
import { useCanvasStore } from '../src/store/canvasStore'
import { buildColorUpdatesForIds, getContextColorableIds } from '../src/utils/selectionColors'

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
    canvasLocked: false,
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

test('locked items and a locked canvas reject destructive layout actions', () => {
  resetStore()
  useCanvasStore.setState({
    items: [note('free'), { ...note('pinned', 40, 40), locked: true }],
    selectedIds: ['free', 'pinned'],
  })

  useCanvasStore.getState().removeItems(['free', 'pinned'])
  assert.deepEqual(useCanvasStore.getState().items.map((item) => item.id), ['pinned'])

  useCanvasStore.getState().setCanvasLocked(true)
  useCanvasStore.getState().addItem(note('blocked-add'))
  useCanvasStore.getState().removeItems(['pinned'])
  assert.deepEqual(useCanvasStore.getState().items.map((item) => item.id), ['pinned'])
  assert.equal(useCanvasStore.getState().canvasLocked, true)
})

test('selection locking is undoable and saved with the project', () => {
  resetStore()
  useCanvasStore.setState({ items: [note('note-a')] })

  useCanvasStore.getState().setItemsLocked(['note-a'], true)
  assert.equal(useCanvasStore.getState().items[0]?.locked, true)

  useCanvasStore.getState().undo()
  assert.equal(useCanvasStore.getState().items[0]?.locked, undefined)

  useCanvasStore.getState().setItemsLocked(['note-a'], true)
  useCanvasStore.getState().setCanvasLocked(true)
  const saved = useCanvasStore.getState().getProjectDataForSave()
  assert.equal(saved.items[0]?.locked, true)
  assert.equal(saved.canvasLocked, true)
})

test('getProjectDataForSave refreshes nested backdrop attachments from geometry', () => {
  resetStore()
  useCanvasStore.setState({
    items: [
      {
        type: 'backdrop',
        id: 'outer-bd',
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        color: '#1f2937',
        brightness: 40,
        saturation: 100,
        label: 'Outer',
        labelSize: 'md',
        displayMode: 'solid',
        collapsed: false,
        expandedHeight: 800,
        attachedVideoIds: [],
      },
      {
        type: 'backdrop',
        id: 'inner-bd',
        x: 100,
        y: 180,
        width: 400,
        height: 280,
        color: '#0f766e',
        brightness: 40,
        saturation: 100,
        label: 'Inner',
        labelSize: 'sm',
        displayMode: 'frame',
        collapsed: false,
        expandedHeight: 280,
        attachedVideoIds: [],
      },
      {
        type: 'note',
        id: 'note-a',
        x: 140,
        y: 300,
        width: 160,
        height: 120,
        text: 'nested',
      },
    ],
  })

  const projectData = useCanvasStore.getState().getProjectDataForSave()
  const outer = projectData.items.find((item) => item.id === 'outer-bd') as Extract<CanvasItem, { type: 'backdrop' }>
  const inner = projectData.items.find((item) => item.id === 'inner-bd') as Extract<CanvasItem, { type: 'backdrop' }>

  assert.deepEqual(outer.attachedVideoIds, ['inner-bd', 'note-a'])
  assert.deepEqual(inner.attachedVideoIds, ['note-a'])
})

test('mixed selected colorable items produce color updates for all selected types', () => {
  const items: CanvasItem[] = [
    {
      type: 'video',
      id: 'video-a',
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      fileName: 'clip.mov',
      srcUrl: 'media:///clip.mov',
    },
    {
      type: 'backdrop',
      id: 'bd-a',
      x: 20,
      y: 20,
      width: 800,
      height: 400,
      color: '#475569',
      brightness: 40,
      saturation: 100,
      label: '',
      labelSize: 'md',
      collapsed: false,
      displayMode: 'solid',
      attachedVideoIds: [],
    },
    {
      type: 'note',
      id: 'note-a',
      x: 60,
      y: 60,
      width: 160,
      height: 120,
      text: 'hello',
    },
    {
      type: 'image',
      id: 'img-a',
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      srcUrl: 'data:image/png;base64,AAAA',
      storage: 'asset',
      sourceVideoId: '',
    },
  ]

  const ids = getContextColorableIds(items, ['video-a', 'bd-a', 'note-a', 'img-a'], 'img-a')
  assert.deepEqual(ids, ['video-a', 'bd-a', 'note-a'])

  const updates = buildColorUpdatesForIds(items, ids, '#1d4ed8')
  assert.deepEqual(updates, [
    { id: 'video-a', updates: { uiColor: '#1d4ed8' } },
    { id: 'bd-a', updates: { color: '#1d4ed8' } },
    { id: 'note-a', updates: { color: '#1d4ed8' } },
  ])
})
