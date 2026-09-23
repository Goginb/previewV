import test from 'node:test'
import assert from 'node:assert/strict'

import { useVideoColorStore } from '../src/store/videoColorStore'
import { videoColorCommandForKey } from '../src/utils/videoColor'

test('only the requested numpad keys control video color', () => {
  assert.equal(videoColorCommandForKey('NumpadAdd'), 'brightness-up')
  assert.equal(videoColorCommandForKey('NumpadSubtract'), 'brightness-down')
  assert.equal(videoColorCommandForKey('NumpadMultiply'), 'gamma-up')
  assert.equal(videoColorCommandForKey('NumpadDivide'), 'gamma-down')
  assert.equal(videoColorCommandForKey('Numpad5'), 'reset')
  assert.equal(videoColorCommandForKey('NumpadDecimal'), null)
  assert.equal(videoColorCommandForKey('Slash'), null)
})

test('video color steps independently, clamps, and resets both controls', () => {
  useVideoColorStore.setState({ brightness: 1, gamma: 1 })
  const apply = useVideoColorStore.getState().applyCommand

  apply('brightness-up')
  apply('gamma-up')
  assert.deepEqual(
    { brightness: useVideoColorStore.getState().brightness, gamma: useVideoColorStore.getState().gamma },
    { brightness: 1.05, gamma: 1.1 },
  )

  apply('brightness-down')
  apply('gamma-down')
  assert.equal(useVideoColorStore.getState().brightness, 1)
  assert.equal(useVideoColorStore.getState().gamma, 1)

  for (let i = 0; i < 100; i += 1) {
    apply('brightness-down')
    apply('gamma-down')
  }
  assert.equal(useVideoColorStore.getState().brightness, 0.2)
  assert.equal(useVideoColorStore.getState().gamma, 0.4)

  apply('reset')
  assert.equal(useVideoColorStore.getState().brightness, 1)
  assert.equal(useVideoColorStore.getState().gamma, 1)
})
