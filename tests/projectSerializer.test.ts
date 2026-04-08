import test from 'node:test'
import assert from 'node:assert/strict'

import type { CanvasItem, ImageItem, VideoItem } from '../src/types'
import { deserializeProject, localPathToMediaUrl, serializeProject } from '../src/utils/projectSerializer'

const META = {
  createdAt: '2026-03-23T00:00:00.000Z',
  updatedAt: '2026-03-23T00:00:00.000Z',
}

test('deserializeProject maps legacy v1 inline images to runtime legacy-inline items', () => {
  const project = deserializeProject({
    version: 1,
    viewport: { x: 0, y: 0, scale: 1 },
    meta: META,
    items: [
      {
        type: 'image',
        id: 'img-legacy',
        x: 10,
        y: 20,
        width: 200,
        height: 120,
        dataUrl: 'data:image/png;base64,AAAA',
        sourceVideoId: '',
        fileName: 'legacy.png',
      },
    ],
  })

  const image = project.items[0] as ImageItem
  assert.equal(image.storage, 'legacy-inline')
  assert.equal(image.srcUrl, 'data:image/png;base64,AAAA')
  assert.equal(image.fileName, 'legacy.png')
})

test('serializeProject writes v2 linked preview images and asset images distinctly', () => {
  const items: CanvasItem[] = [
    {
      type: 'video',
      id: 'video-1',
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      fileName: 'clip.mp4',
      srcUrl: localPathToMediaUrl('C:\\media\\clip.mp4'),
      aspectApplied: true,
      uiColor: '#0f766e',
    } satisfies VideoItem,
    {
      type: 'image',
      id: 'img-linked',
      x: 12,
      y: 18,
      width: 240,
      height: 160,
      srcUrl: localPathToMediaUrl('C:\\cache\\preview.png'),
      storage: 'linked',
      sourceVideoId: '',
      naturalWidth: 1920,
      naturalHeight: 1080,
      fileName: 'still.exr',
      sourceFilePath: 'C:\\plates\\still.exr',
      projectAssetPath: 'C:\\cache\\preview.png',
    } satisfies ImageItem,
    {
      type: 'image',
      id: 'img-asset',
      x: 24,
      y: 36,
      width: 200,
      height: 120,
      srcUrl: 'data:image/png;base64,BBBB',
      storage: 'asset',
      sourceVideoId: '',
      naturalWidth: 800,
      naturalHeight: 480,
      fileName: 'frame.png',
    } satisfies ImageItem,
  ]

  const serialized = serializeProject({
    items,
    viewport: { x: 1, y: 2, scale: 1.5 },
    meta: META,
    assetPathForImage: (item) => `images/${item.id}.png`,
    previewAssetPathForImage: (item) =>
      item.id === 'img-linked' ? 'images/img-linked-preview.png' : undefined,
  })

  assert.equal(serialized.version, 2)

  const video = serialized.items.find(
    (item) => item.type === 'video' && item.id === 'video-1',
  )
  assert.deepEqual(video, {
    type: 'video',
    id: 'video-1',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    fileName: 'clip.mp4',
    videoPath: 'C:\\media\\clip.mp4',
    aspectApplied: true,
    uiColor: '#0f766e',
  })

  const linked = serialized.items.find(
    (item) => item.type === 'image' && item.id === 'img-linked',
  )
  assert.deepEqual(linked, {
    type: 'image',
    storage: 'linked',
    id: 'img-linked',
    x: 12,
    y: 18,
    width: 240,
    height: 160,
    sourceVideoId: '',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'still.exr',
    imageSourcePath: 'C:\\plates\\still.exr',
    previewAssetPath: 'images/img-linked-preview.png',
  })

  const asset = serialized.items.find(
    (item) => item.type === 'image' && item.id === 'img-asset',
  )
  assert.deepEqual(asset, {
    type: 'image',
    storage: 'asset',
    id: 'img-asset',
    x: 24,
    y: 36,
    width: 200,
    height: 120,
    sourceVideoId: '',
    naturalWidth: 800,
    naturalHeight: 480,
    fileName: 'frame.png',
    assetPath: 'images/img-asset.png',
  })
})

test('deserializeProject resolves v2 project assets into runtime image sources', () => {
  const project = deserializeProject(
    {
      version: 2,
      viewport: { x: 0, y: 0, scale: 1 },
      meta: META,
      items: [
        {
          type: 'image',
          storage: 'linked',
          id: 'img-linked',
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          sourceVideoId: '',
          imageSourcePath: 'C:\\plates\\still.exr',
          previewAssetPath: 'images/img-linked-preview.png',
        },
        {
          type: 'image',
          storage: 'asset',
          id: 'img-asset',
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          sourceVideoId: '',
          assetPath: 'images/img-asset.png',
        },
      ],
    },
    {
      resolveAssetPath: (relativePath) => `C:\\projects\\demo.previewv.assets\\${relativePath.replace(/\//g, '\\')}`,
    },
  )

  const linked = project.items.find((item) => item.type === 'image' && item.id === 'img-linked') as ImageItem
  const asset = project.items.find((item) => item.type === 'image' && item.id === 'img-asset') as ImageItem

  assert.equal(linked.storage, 'linked')
  assert.equal(linked.sourceFilePath, 'C:\\plates\\still.exr')
  assert.equal(linked.projectAssetPath, 'C:\\projects\\demo.previewv.assets\\images\\img-linked-preview.png')
  assert.equal(asset.storage, 'asset')
  assert.equal(asset.projectAssetPath, 'C:\\projects\\demo.previewv.assets\\images\\img-asset.png')
  assert.equal(
    asset.srcUrl,
    localPathToMediaUrl('C:\\projects\\demo.previewv.assets\\images\\img-asset.png'),
  )
})

test('serializeProject preserves backdrop items', () => {
  const items: CanvasItem[] = [
    {
      type: 'backdrop',
      id: 'bd-1',
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      color: '#0f172a',
      brightness: 55,
      saturation: 130,
      label: 'Group A',
      labelSize: 'md',
      displayMode: 'solid',
      collapsed: false,
      expandedHeight: 120,
      attachedVideoIds: ['tile-1', 'tile-2'],
    },
  ]

  const serialized = serializeProject({
    items,
    viewport: { x: 1, y: 2, scale: 1.5 },
    meta: META,
    assetPathForImage: () => 'unused.png',
  })

  const backdrop = serialized.items.find((item) => item.type === 'backdrop' && item.id === 'bd-1')
  assert.deepEqual(backdrop, {
    type: 'backdrop',
    id: 'bd-1',
    x: 10,
    y: 20,
    width: 300,
    height: 120,
    color: '#0f172a',
    brightness: 55,
    saturation: 130,
    label: 'Group A',
    labelSize: 'md',
    displayMode: 'solid',
    collapsed: false,
    expandedHeight: 120,
    attachedVideoIds: ['tile-1', 'tile-2'],
  })
})

test('deserializeProject maps v2 backdrops', () => {
  const project = deserializeProject({
    version: 2,
    viewport: { x: 0, y: 0, scale: 1 },
    meta: META,
    items: [
      {
        type: 'backdrop',
        id: 'bd-1',
        x: 10,
        y: 20,
        width: 300,
        height: 48,
        color: '#0f172a',
        brightness: 80,
        saturation: 160,
        label: 'Group A',
        labelSize: 'lg',
        displayMode: 'frame',
        collapsed: true,
        expandedHeight: 120,
        attachedVideoIds: ['tile-1'],
      },
    ],
  })

  const backdrop = project.items.find((item) => item.type === 'backdrop' && item.id === 'bd-1') as any
  assert.equal(backdrop.color, '#0f172a')
  assert.equal(backdrop.collapsed, true)
  assert.deepEqual(backdrop.attachedVideoIds, ['tile-1'])
  assert.equal(backdrop.labelSize, 'lg')
  assert.equal(backdrop.brightness, 80)
  assert.equal(backdrop.saturation, 160)
  assert.equal(backdrop.displayMode, 'frame')
})

test('serialize/deserialize preserves nested backdrops', () => {
  const items: CanvasItem[] = [
    {
      type: 'backdrop',
      id: 'outer-bd',
      x: 0,
      y: 0,
      width: 1200,
      height: 900,
      color: '#1f2937',
      brightness: 50,
      saturation: 110,
      label: 'Outer',
      labelSize: 'md',
      displayMode: 'frame',
      collapsed: false,
      expandedHeight: 900,
      attachedVideoIds: ['inner-bd', 'video-1'],
    },
    {
      type: 'backdrop',
      id: 'inner-bd',
      x: 120,
      y: 180,
      width: 640,
      height: 420,
      color: '#0f766e',
      brightness: 60,
      saturation: 120,
      label: 'Inner',
      labelSize: 'sm',
      displayMode: 'solid',
      collapsed: false,
      expandedHeight: 420,
      attachedVideoIds: ['video-1'],
    },
    {
      type: 'video',
      id: 'video-1',
      x: 180,
      y: 320,
      width: 320,
      height: 180,
      fileName: 'clip.mp4',
      srcUrl: localPathToMediaUrl('C:\\media\\clip.mp4'),
      aspectApplied: true,
    } satisfies VideoItem,
  ]

  const serialized = serializeProject({
    items,
    viewport: { x: 0, y: 0, scale: 1 },
    meta: META,
    assetPathForImage: () => 'unused.png',
  })

  const reopened = deserializeProject(serialized)
  const outer = reopened.items.find((item) => item.type === 'backdrop' && item.id === 'outer-bd') as any
  const inner = reopened.items.find((item) => item.type === 'backdrop' && item.id === 'inner-bd') as any

  assert.ok(outer)
  assert.ok(inner)
  assert.deepEqual(outer.attachedVideoIds, ['inner-bd', 'video-1'])
  assert.deepEqual(inner.attachedVideoIds, ['video-1'])
  assert.equal(outer.displayMode, 'frame')
  assert.equal(inner.displayMode, 'solid')
})

test('deserializeProject preserves video aspectApplied flag', () => {
  const project = deserializeProject({
    version: 2,
    viewport: { x: 0, y: 0, scale: 1 },
    meta: META,
    items: [
      {
        type: 'video',
        id: 'video-1',
        x: 10,
        y: 20,
        width: 500,
        height: 240,
        fileName: 'clip.mp4',
        videoPath: 'C:\\media\\clip.mp4',
        aspectApplied: true,
        uiColor: '#b45309',
      },
    ],
  })

  const video = project.items[0] as VideoItem
  assert.equal(video.aspectApplied, true)
  assert.equal(video.uiColor, '#b45309')
  assert.equal(video.width, 500)
  assert.equal(video.height, 240)
})
