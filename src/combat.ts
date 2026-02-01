import type { CombatEnemy, CombatState, EnemyIntent, Character, StatKey } from './types'
import { clamp, d20, modFromStat, pick, rollDie, uid } from './utils'

export function weaponForClass(className: Character['className']): { name: string; stat: StatKey; dice: number; sides: 4 | 6 | 8 | 10 | 12 } {
  switch (className) {
    case 'Rogue':
      return { name: 'Shortsword', stat: 'DEX', dice: 1, sides: 6 }
    case 'Wizard':
      return { name: 'Staff', stat: 'STR', dice: 1, sides: 6 }
    case 'Barbarian':
      return { name: 'Greataxe', stat: 'STR', dice: 1, sides: 12 }
    case 'Fighter':
      return { name: 'Longsword', stat: 'STR', dice: 1, sides: 8 }
    case 'Paladin':
      return { name: 'Mace', stat: 'STR', dice: 1, sides: 8 }
    case 'Druid':
      return { name: 'Club', stat: 'STR', dice: 1, sides: 6 }
  }
}

export function cantripForClass(className: Character['className']): { name: string; stat: StatKey; dice: number; sides: 4 | 6 | 8 | 10 | 12 } | null {
  if (className === 'Wizard') return { name: 'Firebolt', stat: 'INT', dice: 1, sides: 10 }
  if (className === 'Druid') return { name: 'Thorn Whip', stat: 'WIS', dice: 1, sides: 6 }
  return null
}

export function spellForClass(className: Character['className']): { name: string; stat: StatKey; dice: number; sides: 4 | 6 | 8 | 10 | 12 } | null {
  if (className === 'Wizard') return { name: 'Magic Missile', stat: 'INT', dice: 3, sides: 4 }
  if (className === 'Druid') return { name: 'Moonbeam', stat: 'WIS', dice: 2, sides: 6 }
  return null
}

export function makeEnemy(kind: 'thug' | 'hound' | 'rival'): CombatEnemy {
  if (kind === 'hound') {
    const intent: EnemyIntent = { kind: 'attack', label: 'Lunge', toHit: 2, dmg: { dice: 1, sides: 6 }, stat: 'DEX' }
    return { id: uid('e'), name: 'Starving Hound', maxHp: 10, hp: 10, ac: 12, intent }
  }
  if (kind === 'rival') {
    const intent: EnemyIntent = { kind: 'heavy', label: 'Power strike', toHit: 3, dmg: { dice: 1, sides: 10 }, stat: 'STR' }
    return { id: uid('e'), name: 'Rival Adventurer', maxHp: 16, hp: 16, ac: 13, intent }
  }
  const intent: EnemyIntent = { kind: 'attack', label: 'Cheap shot', toHit: 3, dmg: { dice: 1, sides: 8 }, stat: 'STR' }
  return { id: uid('e'), name: 'Tavern Thug', maxHp: 14, hp: 14, ac: 12, intent }
}

export function nextIntent(_enemy: CombatEnemy): EnemyIntent {
  const intents: EnemyIntent[] = [
    { kind: 'attack', label: 'Attack', toHit: 3, dmg: { dice: 1, sides: 6 }, stat: 'STR' },
    { kind: 'heavy', label: 'Heavy swing', toHit: 1, dmg: { dice: 1, sides: 10 }, stat: 'STR' },
    { kind: 'defend', label: 'Defend', acBonus: 2 },
  ]
  // Keep some variety
  return pick(intents)
}

export function startCombat(input: {
  c: Character
  enemyKind: 'thug' | 'hound' | 'rival'
  onWin: CombatState['onWin']
  onLose: CombatState['onLose']
  onFlee: CombatState['onFlee']
}): CombatState {
  const enemy = makeEnemy(input.enemyKind)
  return {
    enemy,
    round: 1,
    fleeProgress: 0,
    guard: false,
    onWin: input.onWin,
    onLose: input.onLose,
    onFlee: input.onFlee,
  }
}

export function rollDamage(dice: number, sides: number, mod = 0) {
  let total = 0
  for (let i = 0; i < dice; i++) total += rollDie(sides)
  total += mod
  return Math.max(1, total)
}

export function playerAttack(c: Character, combat: CombatState, kind: 'weapon' | 'cantrip' | 'spell') {
  const enemy = { ...combat.enemy }
  let c2: Character = { ...c }

  const weapon = weaponForClass(c2.className)
  const cantrip = cantripForClass(c2.className)
  const spell = spellForClass(c2.className)

  let name = weapon.name
  let stat: StatKey = weapon.stat
  let dmg = weapon

  if (kind === 'cantrip' && cantrip) {
    name = cantrip.name
    stat = cantrip.stat
    dmg = { ...cantrip, name: cantrip.name }
  }
  if (kind === 'spell' && spell) {
    if (c2.spellSlotsRemaining <= 0) {
      return { c: c2, combat, text: 'No spell slots left.' }
    }
    c2.spellSlotsRemaining -= 1
    name = spell.name
    stat = spell.stat
    dmg = { ...spell, name: spell.name }
  }

  const toHit = d20() + modFromStat(c2.stats[stat])
  const enemyAc = enemy.ac + (enemy.intent.kind === 'defend' ? enemy.intent.acBonus : 0)
  const hit = toHit !== 1 && toHit >= enemyAc

  if (hit) {
    const amount = rollDamage(dmg.dice, dmg.sides, modFromStat(c2.stats[stat]))
    enemy.hp = clamp(enemy.hp - amount, 0, enemy.maxHp)
    const nextCombat: CombatState = { ...combat, enemy, guard: false }
    return { c: c2, combat: nextCombat, text: `You use ${name}. Hit! (-${amount} HP)` }
  }

  return { c: c2, combat: { ...combat, enemy, guard: false }, text: `You use ${name}. Miss.` }
}

export function playerGuard(combat: CombatState) {
  return { combat: { ...combat, guard: true }, text: 'You brace and guard.' }
}

export function playerRun(c: Character, combat: CombatState) {
  // Progress-based fleeing to make it "chunky".
  // Check uses DEX or CON (whichever is higher).
  const dex = modFromStat(c.stats.DEX)
  const con = modFromStat(c.stats.CON)
  const mod = Math.max(dex, con)
  const roll = d20()
  const total = roll + mod
  const dc = 13
  const ok = roll !== 1 && total >= dc

  const gain = ok ? 40 : 20
  const next = clamp(combat.fleeProgress + gain, 0, 100)

  const text = ok
    ? `You make distance. (Run check ${roll} + ${mod} = ${total} vs DC ${dc})`
    : `You stumble but keep moving. (Run check ${roll} + ${mod} = ${total} vs DC ${dc})`

  return { combat: { ...combat, fleeProgress: next, guard: false }, text }
}

export function enemyTurn(c: Character, combat: CombatState) {
  let c2: Character = { ...c }
  let enemy = { ...combat.enemy }

  const intent = enemy.intent

  if (intent.kind === 'defend') {
    enemy.intent = nextIntent(enemy)
    return { c: c2, combat: { ...combat, enemy, guard: false, round: combat.round + 1 }, text: `${enemy.name} defends.` }
  }

  const statMod = modFromStat(c2.stats[intent.stat])
  const toHit = d20() + intent.toHit
  const ac = 10 + statMod + (combat.guard ? 3 : 0)
  const hit = toHit !== 1 && toHit >= ac

  if (hit) {
    const amount = rollDamage(intent.dmg.dice, intent.dmg.sides, 0)
    c2.hp = clamp(c2.hp - amount, 0, c2.maxHp)
    enemy.intent = nextIntent(enemy)
    return { c: c2, combat: { ...combat, enemy, guard: false, round: combat.round + 1 }, text: `${enemy.name} hits (${intent.label}). -${amount} HP` }
  }

  enemy.intent = nextIntent(enemy)
  return { c: c2, combat: { ...combat, enemy, guard: false, round: combat.round + 1 }, text: `${enemy.name} misses (${intent.label}).` }
}
