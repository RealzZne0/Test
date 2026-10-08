import { expect, test } from 'claude-code/testing'

import { NEW_PET, feed, gainXp, squash, tick } from '../hooks/register'

test('xp levels Clawd up every 100', async () => {
  const p = gainXp({ ...NEW_PET, xp: 98 }, 5)
  expect(p.level).toBe(2)
  expect(p.xp).toBe(3)
})

test('time drains needs and sleep restores energy', async () => {
  const awake = tick(NEW_PET)
  expect(awake.food).toBe(77)
  expect(awake.energy).toBe(78)
  const asleep = tick({ ...NEW_PET, isAsleep: true })
  expect(asleep.energy).toBe(88)
  expect(feed({ ...NEW_PET, food: 90 }).food).toBe(100)
})

test('squashing the bug scores, three misses end the game', async () => {
  const start = { isOn: true, lane: 1, score: 0, misses: 0, message: '' }
  const hit = squash(start, 1)
  expect(hit.score).toBe(1)
  expect(hit.lane).not.toBe(1)
  let g = hit
  for (let i = 0; i < 3; i++) g = squash(g, g.lane === 0 ? 2 : 0)
  expect(g.isOn).toBe(false)
  expect(g.misses).toBe(3)
})
