import type { Character, GameLogEntry } from './types'
import { clamp, uid } from './utils'

export type RestResult = {
  c: Character
  log: GameLogEntry[]
  summary: string
}

function log(day: number, text: string): GameLogEntry {
  return { id: uid('log'), day, text }
}

function conMod(c: Character) {
  return Math.floor((c.stats.CON - 10) / 2)
}

function rollTotal(rolls: number[], modPerDie: number) {
  const base = rolls.reduce((a, b) => a + b, 0)
  return base + rolls.length * modPerDie
}

export function shortRest(c0: Character, rolls: number[], consequenceRoll: number): RestResult {
  let c = { ...c0 }
  const mod = conMod(c)
  const diceSpent = rolls.length

  c.day += 1
  c.hitDiceRemaining = clamp(c.hitDiceRemaining - diceSpent, 0, c.hitDiceMax)

  const heal = clamp(rollTotal(rolls, mod), 1, 9999)
  const hp0 = c.hp
  c.hp = clamp(c.hp + heal, 0, c.maxHp)

  const entries: GameLogEntry[] = []
  entries.push(log(c.day, `Short rest: spent ${diceSpent}d${c.hitDieSize}. Healed ${c.hp - hp0} HP.`))

  // Consequences: smaller chance.
  if (consequenceRoll <= 25) {
    // Mild consequence: advance the arc and/or small gold loss.
    c.gold = clamp(c.gold - 1, 0, 999999)
    entries.push(log(c.day, 'While you rest, time moves. A small “fee” finds its way out of your coin pouch. -1 gold.'))
    const nextProgress = clamp(c.campaign.progress + 6, 0, 100)
    const nextAct: 1 | 2 | 3 = nextProgress >= 70 ? 3 : nextProgress >= 35 ? 2 : 1
    c.campaign = { ...c.campaign, progress: nextProgress, act: nextAct }
  }

  return { c, log: entries, summary: `Short rest: +${c.hp - hp0} HP` }
}

export function longRest(c0: Character, consequenceRoll: number): RestResult {
  let c = { ...c0 }

  c.day += 2

  // Full heal
  c.hp = c.maxHp

  // Refresh spell slots
  c.spellSlotsRemaining = c.spellSlotsMax

  // Restore hit dice (simple MVP: full restore)
  c.hitDiceRemaining = c.hitDiceMax

  const entries: GameLogEntry[] = []
  entries.push(log(c.day, 'Long rest: fully healed. Spell slots refreshed. Hit dice restored.'))

  // Consequences: higher chance.
  if (consequenceRoll <= 55) {
    // Heavier consequence: you wake up to trouble next turn.
    c.gold = clamp(c.gold - 3, 0, 999999)
    entries.push(log(c.day, 'You wake to missing supplies and the distant sound of consequences. -3 gold.'))
    const nextProgress = clamp(c.campaign.progress + 12, 0, 100)
    const nextAct: 1 | 2 | 3 = nextProgress >= 70 ? 3 : nextProgress >= 35 ? 2 : 1
    c.campaign = { ...c.campaign, progress: nextProgress, act: nextAct }
  }

  return { c, log: entries, summary: 'Long rest: fully restored' }
}
