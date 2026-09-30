import test from 'node:test'
import assert from 'node:assert/strict'

import { matchesVideoFileName } from '../src/utils/videoSearch'

test('video search matches file names typed in the other keyboard layout', () => {
  assert.equal(matchesVideoFileName('ике_01.mov', 'brt'), true)
  assert.equal(matchesVideoFileName('brt_01.mov', 'ике'), true)
  assert.equal(matchesVideoFileName('ике.001.mov', 'brt.001'), true)
  assert.equal(matchesVideoFileName('brt.001.mov', 'ике.001'), true)
  assert.equal(matchesVideoFileName('Ёлка.mov', '`krf'), true)
})

test('video search keeps direct matching and excludes unrelated names', () => {
  assert.equal(matchesVideoFileName('Ике_01.mov', 'ИКЕ'), true)
  assert.equal(matchesVideoFileName('brt_01.mov', '  BRT  '), true)
  assert.equal(matchesVideoFileName('other.mov', 'brt'), false)
})
