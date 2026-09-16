import test from 'node:test'
import assert from 'node:assert/strict'

import { easePanVelocity, getArrowPanTarget, isArrowPanCode } from '../src/utils/keyboardPan'

test('arrow pan maps camera travel to viewport motion with normalized diagonals', () => {
  assert.equal(isArrowPanCode('ArrowLeft'), true)
  assert.equal(isArrowPanCode('KeyA'), false)

  assert.deepEqual(getArrowPanTarget(new Set(['ArrowLeft']), 100), { x: 100, y: 0 })
  assert.deepEqual(getArrowPanTarget(new Set(['ArrowRight']), 100), { x: -100, y: 0 })
  assert.deepEqual(getArrowPanTarget(new Set(['ArrowUp']), 100), { x: 0, y: 100 })
  assert.deepEqual(getArrowPanTarget(new Set(['ArrowDown']), 100), { x: 0, y: -100 })

  const diagonal = getArrowPanTarget(new Set(['ArrowRight', 'ArrowDown']), 100)
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 100) < 1e-9)
})

test('keyboard pan velocity eases toward the target without overshooting', () => {
  const accelerated = easePanVelocity({ x: 0, y: 0 }, { x: 100, y: -100 }, 0.1, 10)
  assert.ok(accelerated.x > 0 && accelerated.x < 100)
  assert.ok(accelerated.y < 0 && accelerated.y > -100)

  const decelerated = easePanVelocity(accelerated, { x: 0, y: 0 }, 0.1, 14)
  assert.ok(Math.abs(decelerated.x) < Math.abs(accelerated.x))
  assert.ok(Math.abs(decelerated.y) < Math.abs(accelerated.y))
})
