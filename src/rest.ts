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

export function shortRest(
  c0: Character,
  rolls: number[],
  consequenceRoll: number,
  storyRoll: number
): RestResult {
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

  // Random rest story events (arc-specific), resolved by a d20 roll.
  // Example: in Mimic arc, the "scratching at the tent" can happen during a rest.
  if (c.campaign.arcId === 'mimic' && c.campaign.flags.mimic_met && !c.campaign.flags.mimic_followup_done) {
    // 25% chance on short rest
    if (consequenceRoll <= 25) {
      const dc = 13
      const wisMod = Math.floor((c.stats.WIS - 10) / 2)
      const total = storyRoll + wisMod
      const ok = storyRoll !== 1 && total >= dc

      c.campaign = { ...c.campaign, flags: { ...c.campaign.flags, mimic_followup_done: true, ...(ok ? { mimic_rest_good: true } : { mimic_rest_bad: true }) } }
      c.nextSceneId = 'camp.mimic_followup'

      entries.push(log(c.day, `Rest event: scratching outside your tent… (WIS check d20 ${storyRoll} + ${wisMod} = ${total} vs DC ${dc})`))
      entries.push(log(c.day, ok ? 'You wake in time. Whatever it is, you have the upper hand.' : 'You do NOT wake in time. Something bites.'))
      if (!ok) {
        c.hp = clamp(c.hp - 1, 0, c.maxHp)
        entries.push(log(c.day, 'Rest consequence: -1 HP.'))
      }
    }
  }

  // Generic consequences (non-arc specific): smaller chance.
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

export function longRest(c0: Character, consequenceRoll: number, storyRoll: number): RestResult {
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

  // Random rest story events (arc-specific), resolved by a d20 roll.
  if (c.campaign.arcId === 'mimic' && c.campaign.flags.mimic_met && !c.campaign.flags.mimic_followup_done) {
    // 40% chance on long rest (riskier)
    if (consequenceRoll <= 40) {
      const dc = 13
      const wisMod = Math.floor((c.stats.WIS - 10) / 2)
      const total = storyRoll + wisMod
      const ok = storyRoll !== 1 && total >= dc

      c.campaign = { ...c.campaign, flags: { ...c.campaign.flags, mimic_followup_done: true, ...(ok ? { mimic_rest_good: true } : { mimic_rest_bad: true }) } }
      c.nextSceneId = 'camp.mimic_followup'

      entries.push(log(c.day, `Rest event: scratching outside your tent… (WIS check d20 ${storyRoll} + ${wisMod} = ${total} vs DC ${dc})`))
      entries.push(log(c.day, ok ? 'You wake in time. Whatever it is, you have the upper hand.' : 'You do NOT wake in time. Something bites.'))
      if (!ok) {
        // Long rest is riskier: bigger bite.
        c.hp = clamp(c.hp - 2, 0, c.maxHp)
        entries.push(log(c.day, 'Rest consequence: -2 HP.'))
      }
    }
  }

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
