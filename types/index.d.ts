export type Pet = {
  food: number
  energy: number
  fun: number
  xp: number
  level: number
  isAsleep: boolean
  bestScore: number
}

export type Game = {
  isOn: boolean
  lane: number
  score: number
  misses: number
  message: string
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-pet': { pet: Pet; game: Game }
  }
}
