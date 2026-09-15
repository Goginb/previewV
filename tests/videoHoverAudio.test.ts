import test from 'node:test'
import assert from 'node:assert/strict'

import { videoRegistry } from '../src/utils/videoRegistry'
import {
  beginVideoHoverAudio,
  endVideoHoverAudio,
  toggleVideoHoverAudioEnabled,
} from '../src/utils/videoHoverAudio'

function fakeVideo(): HTMLVideoElement {
  return { muted: true } as HTMLVideoElement
}

test('hover audio keeps one video audible and supports the tilde toggle', () => {
  const first = fakeVideo()
  const second = fakeVideo()
  videoRegistry.set('first', first)
  videoRegistry.set('second', second)

  try {
    beginVideoHoverAudio(first)
    assert.equal(first.muted, false)
    assert.equal(second.muted, true)

    beginVideoHoverAudio(second)
    assert.equal(first.muted, true)
    assert.equal(second.muted, false)

    assert.equal(toggleVideoHoverAudioEnabled(), false)
    assert.equal(first.muted, true)
    assert.equal(second.muted, true)

    assert.equal(toggleVideoHoverAudioEnabled(), true)
    assert.equal(first.muted, true)
    assert.equal(second.muted, false)

    endVideoHoverAudio(second)
    assert.equal(second.muted, true)
  } finally {
    videoRegistry.clear()
  }
})
