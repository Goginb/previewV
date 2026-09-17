import test from 'node:test'
import assert from 'node:assert/strict'
import { clampMenuPosition } from '../src/hooks/useClampedMenuPosition'

test('context menu stays inside the viewport near the bottom-right corner', () => {
  assert.deepEqual(
    clampMenuPosition(
      { x: 780, y: 580 },
      220,
      360,
      8,
      { width: 800, height: 600 },
    ),
    { left: 572, top: 232 },
  )
})

test('context menu is pinned to the viewport padding when it is larger than the viewport', () => {
  assert.deepEqual(
    clampMenuPosition(
      { x: 400, y: 300 },
      900,
      700,
      8,
      { width: 800, height: 600 },
    ),
    { left: 8, top: 8 },
  )
})
