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
