import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Game, Pet } from '../types'

const PANE = 'clawd-pet'
const LANES = 3
const MAX_MISSES = 3

export const NEW_PET: Pet = {
  food: 80,
  energy: 80,
  fun: 80,
  xp: 0,
  level: 1,
  isAsleep: false,
  bestScore: 0,
}
const NEW_GAME: Game = { isOn: false, lane: 0, score: 0, misses: 0, message: '' }

const pet = atom({ plugin: 'clawd-pet', key: 'pet' } as const, NEW_PET)
const game = atom({ plugin: 'clawd-pet', key: 'game' } as const, NEW_GAME)

const clamp = (n: number) => Math.max(0, Math.min(100, n))
const randomLane = (not = -1) => {
  let lane = Math.floor(Math.random() * LANES)
  if (lane === not) lane = (lane + 1) % LANES
  return lane
}

/** Adds xp and levels up every 100 xp. */
export const gainXp = (p: Pet, amount: number): Pet => {
  const xp = p.xp + amount
  return { ...p, xp: xp % 100, level: p.level + Math.floor(xp / 100) }
}

/** One minute passing: needs drop, sleep restores energy. */
export const tick = (p: Pet): Pet => ({
  ...p,
  food: clamp(p.food - 3),
  fun: clamp(p.fun - (p.isAsleep ? 1 : 3)),
  energy: clamp(p.energy + (p.isAsleep ? 8 : -2)),
  isAsleep: p.isAsleep && p.energy < 100,
})

export const feed = (p: Pet): Pet => ({ ...p, food: clamp(p.food + 25) })

/** Squashing in `lane`: a hit scores and moves the bug, a miss counts. */
export const squash = (g: Game, lane: number): Game => {
  if (!g.isOn) return g
  if (lane === g.lane) {
    return { ...g, score: g.score + 1, lane: randomLane(g.lane), message: 'แปะ! โดนบั๊กแล้ว 🎯' }
  }
  const misses = g.misses + 1
  if (misses >= MAX_MISSES) {
    return { ...g, misses, isOn: false, message: `จบเกม! ได้ ${g.score} คะแนน` }
  }
  return { ...g, misses, message: 'พลาด! 💨' }
}

const mood = (p: Pet) => {
  if (p.isAsleep) return { face: '( - ᴗ - ) zZ', text: 'กำลังหลับปุ๋ย...' }
  if (p.food < 25) return { face: '( ; ﹏ ; )', text: 'หิวแล้ว ขอ token หน่อย!' }
  if (p.energy < 25) return { face: '( =_= )', text: 'ง่วงจัง...' }
  if (p.fun < 25) return { face: '( ._. )', text: 'เบื่อจัง มาเล่นกันเถอะ' }
  return { face: '( ^ ᴗ ^ )', text: 'มีความสุขมาก! พร้อมเขียนโค้ด' }
}

const bar = (n: number) => {
  const full = Math.round(n / 10)
  return '█'.repeat(full) + '░'.repeat(10 - full)
}

async function save($: EngineInterface, fn: (p: Pet) => Pet) {
  const before = await read($, pet)
  await update($, pet, fn)
  const after = await read($, pet)
  await $.store.set('pet', after)
  if (after.level > before.level) {
    $.ui.toast(`🎉 Clawd เลเวลอัปเป็น Lv.${after.level}!`)
  }
}

export const register: Register = on => {
  let bugTimer: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clawd',
      description: 'เปิดมินิเกมเลี้ยง Clawd สัตว์เลี้ยงของ Claude',
    })
    const saved = (await $.store.get('pet')) as Partial<Pet> | undefined
    if (saved) await update($, pet, () => ({ ...NEW_PET, ...saved }))

    $.clock.every(60_000, () => {
      void save($, tick)
    })

    return next(e)
  })

  on('command.run', { command: 'clawd' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Clawd 🦀', focus: true, rows: 18 })

    return { text: 'เปิดเกม Clawd แล้ว — ใช้ปุ่ม f/p/s หรือ 1/2/3 ตอนตีบั๊ก' }
  })

  // Clawd learns while Claude works: every tool call is a little xp.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    await save($, p => gainXp(p, 2)).catch(() => undefined)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, pet)
    const g = await read($, game)
    const m = mood(p)

    const stopGame = () => {
      bugTimer?.cancel()
      bugTimer = undefined
    }

    const startGame = async () => {
      if (p.isAsleep) return
      stopGame()
      await update($, game, () => ({ ...NEW_GAME, isOn: true, lane: randomLane() }))
      bugTimer = $.clock.every(1200, () => {
        void update($, game, cur => (cur.isOn ? { ...cur, lane: randomLane(cur.lane) } : cur))
      })
    }

    const hit = async (lane: number) => {
      await update($, game, cur => squash(cur, lane))
      const now = await read($, game)
      if (now.message.startsWith('แปะ')) {
        await save($, cur => gainXp({ ...cur, fun: clamp(cur.fun + 4) }, 3))
      }
      if (!now.isOn) {
        stopGame()
        await save($, cur => ({
          ...cur,
          energy: clamp(cur.energy - 10),
          bestScore: Math.max(cur.bestScore, now.score),
        }))
      }
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          <Text color="#D97757"> ▐▛███▜▌</Text>
          <Text color="#D97757">▝▜█████▛▘</Text>
          <Text color="#D97757">  ▘▘ ▝▝ </Text>
        </Box>
        <Text bold>
          Clawd Lv.{p.level} {m.face}
        </Text>
        <Text dimColor>{m.text}</Text>
        <Text>อาหาร   {bar(p.food)} {p.food}</Text>
        <Text>พลังงาน {bar(p.energy)} {p.energy}</Text>
        <Text>ความสนุก {bar(p.fun)} {p.fun}</Text>
        <Text dimColor>
          XP {p.xp}/100 · สถิติตีบั๊ก {p.bestScore}
        </Text>
        <Box>
          <Button key="feed" hotkey="f" label="ให้อาหาร" onPress={() => save($, feed)} />
          <Button key="play" hotkey="p" label="ตีบั๊ก!" variant="primary" onPress={startGame} />
          <Button
            key="sleep"
            hotkey="s"
            label={p.isAsleep ? 'ปลุก' : 'นอน'}
            onPress={() => {
              stopGame()
              void update($, game, cur => ({ ...cur, isOn: false }))
              return save($, cur => ({ ...cur, isAsleep: !cur.isAsleep }))
            }}
          />
        </Box>
        {g.isOn && (
          <Box flexDirection="column">
            <Text>
              คะแนน {g.score} · พลาด {g.misses}/{MAX_MISSES}
            </Text>
            <Box>
              {[0, 1, 2].map(lane => (
                <Button
                  key={`lane-${lane}`}
                  hotkey={String(lane + 1)}
                  label={lane === g.lane ? '🐛' : '  '}
                  onPress={() => hit(lane)}
                />
              ))}
            </Box>
          </Box>
        )}
        {g.message !== '' && <Text dimColor>{g.message}</Text>}
      </Box>
    )
  })
}
