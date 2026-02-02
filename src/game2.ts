import type { CampaignArcId, CampaignState, Character, GameLogEntry, Scene, SceneChoice, PendingRoll, Stats, RaceName } from './types'
import { clamp, d20, modFromStat, pick, uid } from './utils'
import { startCombat } from './combat'

const NAME_FIRST_F: string[] = [
  'Aelira',
  'Brina',
  'Carys',
  'Elowen',
  'Isolde',
  'Liora',
  'Mara',
  'Rowena',
  'Seren',
  'Tamsin',
]

const NAME_FIRST_M: string[] = [
  'Alaric',
  'Bram',
  'Cedric',
  'Dorian',
  'Garrick',
  'Lucan',
  'Rowan',
  'Thane',
  'Wulfric',
  'Ronan',
]

const NAME_LAST: string[] = [
  'Ashford',
  'Blackwood',
  'Brightwater',
  'Duskryn',
  'Everwinter',
  'Frostmere',
  'Hollowmere',
  'Ironwood',
  'Ravenscar',
  'Stonebrook',
]

function d6() {
  return 1 + Math.floor(Math.random() * 6)
}

function roll4d6DropLowest() {
  const rolls = [d6(), d6(), d6(), d6()].sort((a, b) => a - b)
  return rolls[1] + rolls[2] + rolls[3]
}

function clampStat(n: number) {
  return clamp(n, 3, 18)
}

function clampStatAfterBonus(n: number) {
  return clamp(n, 1, 20)
}

export function applyRaceBonuses(stats: Stats, race: RaceName): { stats: Stats; note: string } {
  const s: Stats = { ...stats }
  const add = (k: keyof Stats, n: number) => {
    s[k] = clampStatAfterBonus((s[k] ?? 10) + n)
  }

  let note = ''

  switch (race) {
    case 'Human':
      ;(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).forEach((k) => add(k, 1))
      note = '+1 to all stats'
      break
    case 'Elf':
      add('DEX', 2)
      add('INT', 1)
      note = '+2 DEX, +1 INT'
      break
    case 'Dwarf':
      add('CON', 2)
      add('WIS', 1)
      note = '+2 CON, +1 WIS'
      break
    case 'Halfling':
      add('DEX', 2)
      add('CHA', 1)
      note = '+2 DEX, +1 CHA'
      break
    case 'Half-Elf':
      add('CHA', 2)
      add('DEX', 1)
      note = '+2 CHA, +1 DEX'
      break
    case 'Half-Orc':
      add('STR', 2)
      add('CON', 1)
      note = '+2 STR, +1 CON'
      break
    case 'Gnome':
      add('INT', 2)
      add('DEX', 1)
      note = '+2 INT, +1 DEX'
      break
    case 'Tiefling':
      add('CHA', 2)
      add('INT', 1)
      note = '+2 CHA, +1 INT'
      break
  }

  return { stats: s, note }
}

function statPriorityForClass(className: Character['className']): Array<keyof Stats> {
  switch (className) {
    case 'Rogue':
      return ['DEX', 'INT', 'CHA', 'CON', 'WIS', 'STR']
    case 'Wizard':
      return ['INT', 'WIS', 'CON', 'DEX', 'CHA', 'STR']
    case 'Barbarian':
      return ['STR', 'CON', 'DEX', 'WIS', 'CHA', 'INT']
    case 'Fighter':
      return ['STR', 'CON', 'DEX', 'WIS', 'CHA', 'INT']
    case 'Paladin':
      return ['CHA', 'STR', 'CON', 'WIS', 'DEX', 'INT']
    case 'Druid':
      return ['WIS', 'CON', 'INT', 'DEX', 'CHA', 'STR']
  }
}

export function generateStats(input: {
  className: Character['className']
  mode: StatGenMode
}): Stats {
  const rolls = Array.from({ length: 6 }, roll4d6DropLowest).sort((a, b) => b - a)

  const keys: Array<keyof Stats> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

  if (input.mode === 'chaos') {
    const shuffled = [...rolls]
    // Fisher–Yates
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const out: any = {}
    keys.forEach((k, idx) => (out[k] = clampStat(shuffled[idx] ?? 10)))
    return out as Stats
  }

  // weighted: assign best rolls to class priorities.
  const prio = statPriorityForClass(input.className)
  const out: any = {}
  prio.forEach((k, idx) => (out[k] = clampStat(rolls[idx] ?? 10)))
  // Ensure all keys exist
  keys.forEach((k) => {
    if (typeof out[k] !== 'number') out[k] = 10
  })
  return out as Stats
}

export type StatGenMode = 'weighted' | 'chaos'

// D&D 5e XP thresholds (levels 1..20), scaled down for this game.
// Goal: it should take multiple full campaigns to reach level 20.
const XP_SCALE = 100
const XP_FOR_LEVEL_RAW: number[] = [
  0,
  0, // level 1
  300,
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000,
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000, // level 20
]
const XP_FOR_LEVEL: number[] = XP_FOR_LEVEL_RAW.map((x) => Math.ceil(x / XP_SCALE))

export function xpForLevel(level: number) {
  const l = Math.max(1, Math.min(20, Math.floor(level)))
  return XP_FOR_LEVEL[l] ?? 0
}

export function levelFromXp(xp: number) {
  const x = Math.max(0, Math.floor(xp))
  let level = 1
  for (let l = 20; l >= 1; l--) {
    if (x >= (XP_FOR_LEVEL[l] ?? 0)) {
      level = l
      break
    }
  }
  return level
}

export function spellSlotsMaxFor(className: Character['className'], level: number) {
  // Very simplified "full caster" slot count.
  // (DnD uses spell levels; we're just giving a pool.)
  if (className !== 'Wizard' && className !== 'Druid') return 0
  if (level <= 1) return 2
  if (level <= 2) return 3
  if (level <= 3) return 4
  if (level <= 4) return 5
  if (level <= 6) return 6
  if (level <= 8) return 7
  if (level <= 10) return 8
  if (level <= 12) return 9
  return 10
}

function hpGainOnLevelUp(hitDieSize: Character['hitDieSize'], conStat: number) {
  // D&D average: d6->4, d8->5, d10->6, d12->7
  const avg = hitDieSize === 6 ? 4 : hitDieSize === 8 ? 5 : hitDieSize === 10 ? 6 : 7
  const gain = avg + modFromStat(conStat)
  return Math.max(1, gain)
}

export function applyLeveling(c0: Character): { c: Character; logs: string[] } {
  let c: Character = { ...c0 }
  const logs: string[] = []

  const targetLevel = levelFromXp(c.xp)
  if (targetLevel <= c.level) {
    // Still ensure spell slots match level.
    const slots = spellSlotsMaxFor(c.className, c.level)
    if (c.spellSlotsMax !== slots) {
      const delta = slots - c.spellSlotsMax
      c.spellSlotsMax = slots
      c.spellSlotsRemaining = Math.max(0, c.spellSlotsRemaining + delta)
    }
    return { c, logs }
  }

  while (c.level < targetLevel && c.level < 20) {
    const nextLevel = c.level + 1
    const hpGain = hpGainOnLevelUp(c.hitDieSize, c.stats.CON)

    c = {
      ...c,
      level: nextLevel,
      maxHp: c.maxHp + hpGain,
      hp: Math.min(c.maxHp + hpGain, c.hp + hpGain),
    }

    // Spell slots scale for casters.
    const nextSlots = spellSlotsMaxFor(c.className, c.level)
    if (c.spellSlotsMax !== nextSlots) {
      const delta = nextSlots - c.spellSlotsMax
      c.spellSlotsMax = nextSlots
      c.spellSlotsRemaining = Math.max(0, c.spellSlotsRemaining + delta)
    }

    logs.push(`Level up! You reached level ${c.level}. (+${hpGain} max HP)`) 

    // Class feature unlock callouts (combat code uses level for these).
    if (c.level === 3 && c.className === 'Rogue') logs.push('New feature: Sneak Attack.')
    if (c.level === 5 && (c.className === 'Fighter' || c.className === 'Paladin' || c.className === 'Barbarian')) logs.push('New feature: Extra Attack.')
    if (c.level === 5 && (c.className === 'Wizard' || c.className === 'Druid')) logs.push('Your cantrips grow stronger.')
  }

  return { c, logs }
}

export function makeNewCharacter(input: {
  name?: string
  sex: Character['sex']
  race: RaceName
  className: Character['className']
  alignment: Character['alignment']
  stats?: Stats
  statGenMode?: StatGenMode
}): Character {
  const baseStats: Stats =
    input.stats ??
    generateStats({ className: input.className, mode: input.statGenMode ?? 'weighted' })

  const { stats } = applyRaceBonuses(baseStats, input.race)

  const maxHp = 10 + modFromStat(stats.CON) + (input.className === 'Barbarian' ? 4 : 0)

  const hitDieSize: Character['hitDieSize'] =
    input.className === 'Wizard'
      ? 6
      : input.className === 'Rogue' || input.className === 'Druid'
        ? 8
        : input.className === 'Fighter' || input.className === 'Paladin'
          ? 10
          : 12

  const spellSlotsMax = input.className === 'Wizard' || input.className === 'Druid' ? 2 : 0

  return {
    name: (input.name?.trim() || '').length ? input.name!.trim() : randomName(input.sex),
    sex: input.sex,
    race: input.race,
    className: input.className,
    alignment: input.alignment,

    level: 1,
    xp: 0,
    day: 1,
    hp: maxHp,
    maxHp,
    gold: 12,

    inventory: [],
    companions: [],

    hitDieSize,
    hitDiceMax: 6,
    hitDiceRemaining: 6,

    spellSlotsMax,
    spellSlotsRemaining: spellSlotsMax,

    stats,
    flags: {},
    nextSceneId: null,
    lastSceneId: null,
    recentSceneIds: [],

    campaign: newCampaign(),

    party: { inParty: false, members: [] },
  }
}

export function randomName(sex: Character['sex']) {
  // Keep name choice correlated to the selected sex to match player expectations.
  const firstPool = sex === 'Female' ? NAME_FIRST_F : NAME_FIRST_M
  const first = pick(firstPool)
  const last = pick(NAME_LAST)
  return `${first} ${last}`
}

export function generateBackground(c: Character) {
  const arc = ARC_META[c.campaign.arcId]
  const raceNote = applyRaceBonuses(c.stats, c.race).note

  // Plain, archetypal hooks that don't tell the player what they feel.
  const templates: string[] = [
    'You were abandoned as a child and raised in a temple. You learned discipline, patience, and how to keep your head down. When you were old enough to choose your own life, you left with nothing but a name. You have been surviving on your own ever since. Now you are ready to step into something bigger.',
    'You grew up on a hard border where danger was common and help was rare. You learned to work, to fight, and to keep moving. When trouble started spreading beyond your home, you didn’t wait for someone else to answer the call. You left to do what you can.',
    'You studied under a mentor who taught you the basics and warned you about the world outside. You learned enough to be dangerous, and enough to know how unprepared you are. When rumors reached you of a threat that could not be ignored, you packed your things and set out.',
    'You lived most of your life in the shadows of a city. You learned how to stay unnoticed, how to read people, and how to leave before the trouble arrives. The life kept you alive, but it did not give you a future. You left to make one.',
    'You were part of a small order that believed service mattered more than comfort. You learned to endure, to hold a line, and to keep your word. When the realm began to fracture under new fears, you took up your gear and went to meet it.',
    'You grew up close to the wild places and learned to respect what you cannot control. You watched seasons turn wrong and animals behave strangely. When you realized it was not a local problem, you left home to find the source.',
  ]

  const backstory = pick(templates)

  return `You are a level 1 ${c.className.toLowerCase()} ${c.race.toLowerCase()} ${c.sex.toLowerCase()}.\n${backstory}\n\nRace bonuses: ${raceNote}.\nCurrent campaign: ${arc.title} (Act ${c.campaign.act}).`
}

export function nextTurnScene(c: Character): Scene {
  // If we have an explicit follow-up queued, run it next.
  if (c.nextSceneId) {
    const id = c.nextSceneId
    c.nextSceneId = null
    markSeen(c, id)
    return getSceneById(id)
  }

  // Narrative continuity: choose scenes from a single campaign arc.
  const arc = c.campaign.arcId
  const act = c.campaign.act

  // Soft force a "finale" once progress is high.
  if (act === 3 && c.campaign.progress >= 85) {
    const id = ARC_FINALES[arc]
    markSeen(c, id)
    return getSceneById(id)
  }

  const pool0 = ARC_SCENE_POOLS[arc][act]

  // Hard rule: do not repeat scenes within an arc.
  const seen = new Set(c.campaign.seenSceneIds ?? [])

  const unseen = pool0.filter((x) => !seen.has(x.id))

  // If we run out of authored scenes for this act, generate a unique "travel" scene
  // so the arc can continue without repeats.
  if (unseen.length === 0) {
    const s = makeFillerScene(c)
    markSeen(c, s.id)
    return s
  }

  const chosen = weightedPick(unseen)
  markSeen(c, chosen)
  return getSceneById(chosen)
}

export function chooseToRoll(scene: Scene, choiceId: string): PendingRoll {
  const ch = scene.choices.find((x) => x.id === choiceId)
  if (!ch) throw new Error('choice not found')
  return { sceneId: scene.id, choiceId: ch.id, stat: ch.stat, dc: ch.dc }
}

export function resolveRoll(
  c0: Character,
  scene: Scene,
  pending: PendingRoll,
  forcedRoll?: number
): { c: Character; log: GameLogEntry[]; outcomeText: string; breakdown: string; roll: number; success: boolean } {
  const choice = scene.choices.find((x) => x.id === pending.choiceId)
  if (!choice) throw new Error('choice not found')

  let c = { ...c0 }
  const roll = typeof forcedRoll === 'number' ? forcedRoll : d20()
  const bonus = modFromStat(c.stats[choice.stat])
  const total = roll + bonus
  const success = roll !== 1 && total >= choice.dc

  // advance time on resolution
  c.day += 1

  // baseline story momentum: every scene nudges the arc forward a bit.
  c = advanceArc(c, 8)

  const entries: GameLogEntry[] = []
  const breakdown = `d20 ${roll} + ${choice.stat} ${bonus >= 0 ? `+${bonus}` : bonus} = ${total} vs DC ${choice.dc}`

  const hpBefore = c0.hp

  const applyOutcome = (r: { c: Character; text: string; logs?: string[] }) => {
    let cNext = r.c
    entries.push(log(cNext.day, r.text))
    for (const extra of r.logs ?? []) entries.push(log(cNext.day, extra))

    // If an outcome causes HP loss due to an attacker, trigger combat instead of direct damage.
    // (Environmental damage like falling, cold water, fire, etc. can still be direct.)
    const hpLoss = hpBefore - cNext.hp
    const alreadyCombat = Boolean((cNext.flags as any)?.__startCombat)

    if (!alreadyCombat && hpLoss > 0 && shouldTriggerCombat(scene, r.text)) {
      // restore HP; the fight will determine damage
      cNext = { ...cNext, hp: hpBefore }

      const enemyKind = enemyKindForScene(scene)
      ;(cNext.flags as any).__startCombat = startCombat({
        c: cNext,
        enemyKind,
        onWin: { text: 'You survive the violence and the world keeps turning.', logs: ['Combat won'] },
        onLose: { text: 'You lose the fight. The consequences are immediate and personal.', logs: ['Combat lost'] },
        onFlee: { text: 'You escape. The story continues with your breath still in your chest.', logs: ['Fled combat'] },
      })

      entries.push(log(cNext.day, 'Combat triggered.'))
    }

    // Apply leveling after any XP changes.
    const leveled = applyLeveling(cNext)
    cNext = leveled.c
    for (const t of leveled.logs) entries.push(log(cNext.day, t))

    return cNext
  }

  if (success) {
    const r = choice.onSuccess(c)
    c = applyOutcome(r)
    return { c, log: entries, outcomeText: r.text, breakdown, roll, success }
  } else {
    const r = choice.onFail(c)
    c = applyOutcome(r)
    return { c, log: entries, outcomeText: r.text, breakdown, roll, success }
  }
}

function shouldTriggerCombat(scene: Scene, text: string) {
  const t = `${scene.category} ${scene.title} ${text}`.toLowerCase()

  // Exclusions: obvious environment / non-combat harm
  if (t.includes('falling masonry') || t.includes('freezing water') || t.includes('smoke') || t.includes('fire')) return false
  if (t.includes('paper') || t.includes('bureaucr') || t.includes('paragraph bites')) return false
  if (t.includes('emotional')) return false

  // Keywords that imply an attacker
  const attacker = /(hit|hits|jab|jabs|stab|stabs|punch|punches|bite|bites|ambush|blade|swing|swings|attack)/
  if (attacker.test(t)) return true

  // Also treat some categories as likely combat when HP is on the line.
  if (t.includes('tavern') || t.includes('street') || t.includes('road') || t.includes('manor')) return true

  return false
}

function enemyKindForScene(scene: Scene): 'thug' | 'hound' | 'rival' | 'cultist' {
  // Star-Fall uses the Black Choir as the default human opponent.
  if (scene.id.startsWith('starfall.')) return 'cultist'

  const cat = scene.category.toLowerCase()
  if (cat.includes('tavern') || cat.includes('street')) return 'thug'
  if (cat.includes('manor')) return 'rival'
  if (cat.includes('road') || cat.includes('ruins') || cat.includes('vault')) return 'hound'
  return 'thug'
}

function setNext(c: Character, nextSceneId: string | null): Character {
  return { ...c, nextSceneId }
}

function setArcFlag(c: Character, key: string, value = true): Character {
  return { ...c, campaign: { ...c.campaign, flags: { ...c.campaign.flags, [key]: value } } }
}

function advanceArc(c: Character, delta: number): Character {
  const nextProgress = clamp(c.campaign.progress + delta, 0, 100)
  const nextAct: 1 | 2 | 3 = nextProgress >= 70 ? 3 : nextProgress >= 35 ? 2 : 1
  return { ...c, campaign: { ...c.campaign, progress: nextProgress, act: nextAct } }
}

function newCampaign(): CampaignState {
  // Single authored campaign for now.
  const arcId = 'starfall'
  return { arcId: arcId as CampaignArcId, act: 1, progress: 0, flags: {}, seenSceneIds: [] }
}

export function restartAdventure(c: Character): Character {
  // Keep the character identity/stats, but start a fresh campaign.
  return {
    ...c,
    day: 1,
    hp: c.maxHp,
    hitDiceRemaining: c.hitDiceMax,
    spellSlotsRemaining: c.spellSlotsMax,
    nextSceneId: null,
    lastSceneId: null,
    recentSceneIds: [],
    campaign: newCampaign(),
  }
}

const ARC_META: Record<CampaignArcId, { title: string; blurb: string }> = {
  starfall: {
    title: 'Star-Fall Engine',
    blurb: 'A comet hangs too low. An ancient dwarven engine groans beneath the mountain.',
  },
}

const ARC_SCENE_POOLS: Record<CampaignArcId, Record<1 | 2 | 3, Array<{ id: string; weight: number }>>> = {
  starfall: {
    1: [
      { id: 'starfall.observatory', weight: 4 },
      { id: 'starfall.watchtower', weight: 2 },
      { id: 'starfall.stonewake', weight: 3 },
    ],
    2: [
      { id: 'starfall.windbridge', weight: 2 },
      { id: 'starfall.bramdur_gate', weight: 3 },
      { id: 'starfall.korrin_lift', weight: 2 },
      { id: 'starfall.varyn_bells', weight: 3 },
      { id: 'starfall.craterwood', weight: 2 },
      { id: 'starfall.anchor_vault', weight: 3 },
      { id: 'starfall.choir_sabotage', weight: 2 },
    ],
    3: [
      { id: 'starfall.rift_mouth', weight: 2 },
      { id: 'starfall.engine_heart', weight: 4 },
      { id: 'starfall.aftermath', weight: 2 },
    ],
  },
}

const ARC_FINALES: Record<CampaignArcId, string> = {
  starfall: 'starfall.engine_heart',
}

function scene(id: string, category: string, title: string, body: string, choices: SceneChoice[]): Scene {
  return { id, category, title, body, choices }
}

function getSceneById(id: string): Scene {
  const s = SCENES[id]
  if (!s) return SCENES['starfall.observatory']
  return s
}

function markSeen(c: Character, id: string) {
  c.lastSceneId = id

  const prev = Array.isArray(c.recentSceneIds) ? c.recentSceneIds : []
  c.recentSceneIds = [...prev, id].slice(-6)

  const seen = Array.isArray(c.campaign.seenSceneIds) ? c.campaign.seenSceneIds : []
  if (!seen.includes(id)) {
    c.campaign = { ...c.campaign, seenSceneIds: [...seen, id] }
  }
}

function weightedPick(items: Array<{ id: string; weight: number }>) {
  const total = items.reduce((sum, x) => sum + x.weight, 0)
  let r = Math.random() * total
  for (const it of items) {
    r -= it.weight
    if (r <= 0) return it.id
  }
  return items[items.length - 1].id
}

function randomStatKey(): keyof Stats {
  return pick(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const)
}

function makeFillerScene(c: Character): Scene {
  const arc = ARC_META[c.campaign.arcId]
  const mood = pick([
    'A long road and longer thoughts.',
    'You make camp and listen to the world breathing.',
    'A small detour becomes a lesson in humility.',
    'You follow a rumor that turns into… mostly walking.',
    'The day is quiet. That makes you nervous.',
  ])

  const statA = randomStatKey()
  const statB = randomStatKey()
  const dcA = 10 + Math.floor(Math.random() * 6)
  const dcB = 10 + Math.floor(Math.random() * 6)

  const id = `filler.${c.campaign.arcId}.day${c.day}.act${c.campaign.act}`

  const choices: SceneChoice[] = [
    {
      id: 'push_on',
      text: 'Push onward',
      stat: statA,
      dc: dcA,
      onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 20 }, text: 'You make good time. +20 XP.' }),
      onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'You trip over a root that was clearly placed by fate. -1 HP.' }),
    },
    {
      id: 'scavenge',
      text: 'Scavenge for supplies',
      stat: statB,
      dc: dcB,
      onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 2 }, text: 'You find something valuable and mostly legal. +2 gold.' }),
      onFail: (ch) => ({ c: { ...ch, xp: ch.xp + 10 }, text: 'You find nothing, but you learn what doesn’t work. +10 XP.' }),
    },
  ]

  return scene(id, 'Travel', arc.title, `${mood}\n\n(You feel the campaign tightening around you.)`, choices)
}

const SCENES: Record<string, Scene> = {
  // ARC — Star-Fall Engine (Ancient dwarven)
  'starfall.observatory': scene(
    'starfall.observatory',
    'Observatory',
    'The Low Comet',
    'At Cliff Observatory, Master Astronomer Ilyra Voss holds a slate of star-charts against the lantern light. A red comet hangs too low in the sky, steady as a nail.\n\n“Skybreak Mountain is waking,” she says. “If the old wards fail, it will not just be the mountain that breaks.”',
    [
      {
        id: 'study',
        text: 'Study the charts',
        stat: 'INT',
        dc: 12,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 30 }, 'starfall_charts'), 12),
          text: 'You learn the pattern: the comet is not drifting. It is being held in place by something below. +30 XP.',
          logs: ['Clue: “bound trajectory” noted on the charts'],
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 10 }, 10),
          text: 'The numbers blur, but the conclusion is simple: this is not natural. +10 XP.',
        }),
      },
      {
        id: 'question',
        text: 'Question Ilyra about the wards',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch }, 'starfall_wards'), 10),
          text: 'She names it plainly: a dwarven machine under Skybreak. “The Star-Fall Engine.” The words sound like a warning.',
          logs: ['Named: Star-Fall Engine'],
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8),
          text: 'She speaks carefully and gives you the one thing you need: a direction and a deadline. +10 XP.',
        }),
      },
      {
        id: 'go',
        text: 'Leave for Skybreak at once',
        stat: 'CON',
        dc: 11,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You pack quickly and leave before dawn. +20 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 8), text: 'You rush and pay for it with a twisted ankle. -1 HP.' }),
      },
    ]
  ),

  'starfall.watchtower': scene(
    'starfall.watchtower',
    'Watchtower',
    'Captain Pike',
    'The Mountain Watch keeps a stone tower above the switchbacks. Captain Jorren Pike meets you at the door, eyes on the sky and hand on a spear.\n\n“We hold the road,” he says. “You go higher. If you hear the stone start to sing, don’t stand under anything you like.”',
    [
      {
        id: 'earn',
        text: 'Earn Pike’s trust',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 30 }, 'starfall_pike'), 12),
          text: 'He gives you a stamped writ and a coil of good rope. “Bring me proof the engine still runs.” +30 XP.',
          logs: ['Item: Watch Writ (stamped)'],
        }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'He doesn’t like speeches. He still lets you pass. +10 XP.' }),
      },
      {
        id: 'route',
        text: 'Ask for the safest route',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'He marks a path that avoids the worst rockfall. It costs time. +20 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'He points up the mountain. “There is no safe route. Only routes.” +10 XP.' }),
      },
      {
        id: 'push',
        text: 'Push into the high pass',
        stat: 'CON',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You climb until your breath turns sharp. +20 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'Cold and altitude take their due. -2 HP.' }),
      },
    ]
  ),

  'starfall.stonewake': scene(
    'starfall.stonewake',
    'Ruins',
    'Stonewake Hall',
    'Stonewake Hall is cut straight into the mountain. Dwarven runes cover the lintel like a diagram. Inside, a ring of bronze and stone hums faintly, warm under your palm.',
    [
      {
        id: 'inspect',
        text: 'Inspect the ring and its markings',
        stat: 'INT',
        dc: 13,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Sigil-Shard'] }, 'starfall_sigil'), 14),
          text: 'You find a missing segment: a Sigil-Shard, broken free from its socket. It fits your hand like a key.',
          logs: ['Item acquired: Sigil-Shard'],
        }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'A hidden edge bites your fingers as the ring shifts. -1 HP.' }),
      },
      {
        id: 'listen',
        text: 'Listen to the hum',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'The sound has a rhythm. It matches the tremors outside. The machine is answering the mountain. +30 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You hear only stone and your own breathing. +10 XP.' }),
      },
      {
        id: 'leave',
        text: 'Leave before anything else moves',
        stat: 'DEX',
        dc: 11,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You back out without making noise. +10 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 8), text: 'Loose gravel slides underfoot. You catch yourself late. -1 HP.' }),
      },
    ]
  ),

  'starfall.windbridge': scene(
    'starfall.windbridge',
    'Pass',
    'Windbridge Pass',
    'Windbridge Pass is a span of iron chains and stone teeth over a deep cut in the mountain. The wind comes through like a living thing and tries to peel you from the walkway.',
    [
      { id: 'cross', text: 'Cross carefully', stat: 'DEX', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'You keep three points of contact and make it across. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The bridge snaps you sideways into chain and stone. -2 HP.' }) },
      { id: 'wait', text: 'Wait for a lull', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You move when the wind hesitates. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'The wind does not hesitate. You cross anyway. +10 XP.' }) },
      { id: 'race', text: 'Run for it', stat: 'CON', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You sprint and keep your footing. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 10), text: 'You run at the wrong moment. The wind slams you into the rail. -3 HP.' }) },
    ]
  ),

  'starfall.bramdur_gate': scene(
    'starfall.bramdur_gate',
    'Gate',
    'Bramdur Gate',
    'A dwarven pressure door blocks the corridor—stone fused to bronze. A warning is carved in clean, readable runes: “DO NOT REMOVE THE PIN.” The pin is missing.',
    [
      { id: 'solve', text: 'Work the mechanism', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 40 }, 'starfall_gate_open'), 14), text: 'You seat the gears by hand and bleed off pressure. The door unlocks with a low sigh. +40 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The mechanism bites back. Hot metal kisses your palm. -2 HP.' }) },
      { id: 'force', text: 'Force it', stat: 'STR', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp), xp: ch.xp + 30 }, 12), text: 'You wrench the door enough to slip through. Your shoulder pays for it. -1 HP, +30 XP.' }), onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You drive them back and take the corridor.', logs: ['Combat won: Bramdor Gate'] }, onLose: { text: 'You are forced away from the door.', logs: ['Combat lost: Bramdor Gate'] }, onFlee: { text: 'You retreat into side tunnels.', logs: ['Fled: Bramdor Gate'] } }) as any } }, 'starfall_gate_fight'), 10), text: 'Your noise brings black-robed figures from the dark.' }) },
      { id: 'mark', text: 'Mark it and move on', stat: 'WIS', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You memorize the layout and move before you waste time. +10 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You lose your place in the tunnels and circle back. +10 XP.' }) },
    ]
  ),

  'starfall.korrin_lift': scene(
    'starfall.korrin_lift',
    'Works',
    'Korrin Lift',
    'A vertical lift shaft drops into darkness. The platform is chained, counterweighted, and jammed. Dwarven maker-marks cover the crank housing.',
    [
      { id: 'repair', text: 'Unjam the lift', stat: 'INT', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'You clear grit and reset the governor. The platform descends smoothly. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'The crank snaps your knuckles. -1 HP.' }) },
      { id: 'climb', text: 'Climb the chains', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'You climb hand over hand, slow and steady. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 10), text: 'A chain link shifts. You drop hard onto the platform. -3 HP.' }) },
      { id: 'drop', text: 'Drop the counterweight (fast)', stat: 'STR', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You release it cleanly. The platform falls, controlled—barely. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The platform lurches and slams. Your teeth click together. -2 HP.' }) },
    ]
  ),

  'starfall.varyn_bells': scene(
    'starfall.varyn_bells',
    'Temple',
    'Varyn Bell Chamber',
    'A stone chamber holds a ring of dwarven bells tuned to different pitches. A bronze lens rests in a cradle, etched with fine lines like a map. The air here vibrates even when no one moves.',
    [
      { id: 'align', text: 'Align the tones', stat: 'WIS', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Harmonic Lens'] }, 'starfall_lens'), 14), text: 'You strike the bells in the right order. The lens warms and settles into your hand. It is meant to be carried.', logs: ['Item acquired: Harmonic Lens'] }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'You choose the wrong tone. The chamber answers with a pressure wave. -2 HP.' }) },
      { id: 'study', text: 'Study the etchings', stat: 'INT', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'The lines are not decoration. They show how the engine routes force through the mountain. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You learn enough to know this place was built by engineers, not priests. +10 XP.' }) },
      { id: 'leave', text: 'Leave quietly', stat: 'DEX', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You leave without disturbing the chamber. +10 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'A bell rings once as you pass. You keep going. +10 XP.' }) },
    ]
  ),

  'starfall.craterwood': scene(
    'starfall.craterwood',
    'Wilds',
    'Craterwood',
    'The forest near the crater grows at angles that don’t look natural. Stones sit half an inch above the ground as if they forgot how weight works. Your hair lifts with static when you step near the rim.',
    [
      { id: 'track', text: 'Follow the strange tracks', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'You find bootprints that stop, then resume ten feet away. Someone has been jumping the weak spots. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A patch of ground shifts under you. Your stomach lurches as gravity changes. -2 HP.' }) },
      { id: 'sample', text: 'Take a shard of crater-stone', stat: 'INT', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'The stone is cold and heavy. It pulls at the light around it. +20 XP.', logs: ['Clue: crater-stone distorts light'] }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 8), text: 'The shard slips and cuts your palm. -1 HP.' }) },
      { id: 'avoid', text: 'Avoid the crater rim', stat: 'DEX', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You keep to stable ground and lose less time than you fear. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You detour wider than you meant to. +10 XP.' }) },
    ]
  ),

  'starfall.anchor_vault': scene(
    'starfall.anchor_vault',
    'Vault',
    'Anchor Vault',
    'A dwarven vault door sits in the rock with no handle—only a recessed seal and three grooves worn by use. The air here feels heavier, steadier. Like the mountain remembers how to hold itself.',
    [
      { id: 'open', text: 'Open the vault', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Anchor Seal'] }, 'starfall_anchor'), 16), text: 'The seal releases with a click. Inside rests the Anchor Seal, warm and dense as forged truth.', logs: ['Item acquired: Anchor Seal'] }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A pressure vent hisses. Heat burns your forearm. -2 HP.' }) },
      { id: 'listen', text: 'Listen for guards', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You hear quiet voices beyond the stone—The Black Choir is close. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'Only your own breath answers you. +10 XP.' }) },
      { id: 'rush', text: 'Take it fast', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Anchor Seal'] }, 'starfall_anchor'), 14), text: 'You take the seal and leave before anyone can close the corridor behind you.', logs: ['Item acquired: Anchor Seal'] }), onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You hold the corridor long enough to escape with the seal.', logs: ['Combat won: Anchor Vault'] }, onLose: { text: 'They beat you back from the vault.', logs: ['Combat lost: Anchor Vault'] }, onFlee: { text: 'You flee into the side works, seal in hand.', logs: ['Fled: Anchor Vault'] } }) as any } }, 'starfall_anchor_fight'), 12), text: 'Boots on stone. Black robes in lantern light.' }) },
    ]
  ),

  'starfall.choir_sabotage': scene(
    'starfall.choir_sabotage',
    'Tunnels',
    'Sabotage',
    'A section of dwarven works has been wrecked on purpose. A support pin lies on the floor beside fresh footprints. Someone removed what the runes said not to remove.',
    [
      { id: 'repair', text: 'Re-seat the pin and stabilize the works', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 40 }, 14), text: 'You wedge the pin back into place and brace the beam. The tunnel stops complaining. +40 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'Stone shifts. Dust floods your lungs. -2 HP.' }) },
      { id: 'hunt', text: 'Follow the footprints', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 20 }, 'starfall_choir_seen'), 12), text: 'You catch sight of them: black robes, disciplined spacing, moving uphill toward the rift. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'The prints vanish in rubble. They are still ahead of you. +10 XP.' }) },
      { id: 'push', text: 'Push onward', stat: 'CON', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You keep moving. The air grows hotter. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 8), text: 'You push through dust and scrape your knee on stone. -1 HP.' }) },
    ]
  ),

  'starfall.rift_mouth': scene(
    'starfall.rift_mouth',
    'Rift',
    'Rift Mouth',
    'The rift is a crack down into heat and copper air. Far below, a steady hum rises through the stone. The comet’s red light seems to lean toward the opening.',
    [
      { id: 'descend', text: 'Descend into the rift', stat: 'DEX', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'You climb down with careful hands. The stone is warm enough to sting. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 10), text: 'You slip and slam into the wall. -3 HP.' }) },
      { id: 'plan', text: 'Check your gear and plan the approach', stat: 'INT', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You choose a route through the broken catwalks. It will work if nothing changes. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You lose time arguing with the map in your head. +10 XP.' }) },
      { id: 'listen', text: 'Listen for chanting', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 20 }, 'starfall_chant'), 10), text: 'You hear it: voices keeping time with the engine’s hum. The Choir is already inside. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'Only the engine answers you. +10 XP.' }) },
    ]
  ),

  'starfall.engine_heart': scene(
    'starfall.engine_heart',
    'Engine',
    'The Engine Heart',
    'The Star-Fall Engine fills a chamber the size of a chapel—bronze rings, stone columns, and runes cut like instructions. The Black Choir stands in a wide circle, chanting in measured breaths.\n\nThree sockets wait at the central console.',
    [
      { id: 'keys', text: 'Set the keys and stabilize the engine', stat: 'INT', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 100, gold: ch.gold + 12 }, 24), text: 'You fit the pieces where they belong and turn the sequence back into safety. The hum steadies. The comet holds. +12 gold, +100 XP.', logs: ['Campaign complete: Star-Fall Engine'] }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 4, 0, ch.maxHp) }, 14), text: 'The console kicks back with heat and force. The chamber tilts for a heartbeat. -4 HP.' }) },
      { id: 'break', text: 'Break the Choir’s circle', stat: 'STR', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You break their line and buy the engine time to recover.', logs: ['Combat won: Engine Heart'] }, onLose: { text: 'They drag you down as the chant continues.', logs: ['Combat lost: Engine Heart'] }, onFlee: { text: 'You escape the circle and regroup behind the console.', logs: ['Fled: Engine Heart'] } }) as any } }, 'starfall_final_fight'), 14), text: 'You step into the circle and meet steel with steel.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A blade finds you in the crush. -2 HP.' }) },
      { id: 'counter', text: 'Speak the counter-words carved into the stone', stat: 'WIS', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 60 }, 14), text: 'You match their rhythm with older words. The chanting falters. The engine’s hum deepens. +60 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 12), text: 'Your voice breaks in the heat. The pressure answers. -3 HP.' }) },
    ]
  ),

  'starfall.aftermath': scene(
    'starfall.aftermath',
    'Aftermath',
    'A Sky That Holds',
    'Dawn comes thin and pale over Skybreak. The comet is still there, but it no longer feels like it is falling. The mountain’s tremors ease into silence.',
    [
      { id: 'return', text: 'Return to the Watch', stat: 'CHA', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 10), text: 'Captain Pike listens, then nods once. “Good,” he says. “Now go sleep.” +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'The Watch believes results more than stories. You still brought results. +10 XP.' }) },
      { id: 'leave', text: 'Leave before anyone turns you into a legend', stat: 'WIS', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 20 }, 10), text: 'You leave the mountain behind you. The road feels ordinary again. +20 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'You take one last look at the sky, then go. +10 XP.' }) },
      { id: 'study', text: 'Speak with Ilyra and record what you learned', stat: 'INT', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 30 }, 12), text: 'Ilyra writes without stopping. “This changes everything,” she says quietly. +30 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10 }, 8), text: 'The notes are incomplete, but the warning is recorded. +10 XP.' }) },
    ]
  ),

  // Only the Star-Fall campaign is active right now. Legacy scenes may remain in the file but are unreachable.

  // ARC — Treasure
  'tavern.rumor_black_road': scene(
    'tavern.rumor_black_road',
    'Tavern',
    'A Rumor With Teeth',
    'A veteran with road-dust in his beard leans in. “If you’re going to be stupid,” he says, “be stupid in the Black Road ruins. There’s a lantern room down there that only opens for liars and the desperate.”',
    [
      {
        id: 'buy_info',
        text: 'Buy him another drink and get details',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, gold: clamp(ch.gold - 2, 0, 999999) }, 'treasure_rumor'), 14),
          text: 'He sketches a crude route and a warning: “Don’t trust the first light you see.” -2 gold.',
          logs: ['Clue gained: route sketch (Black Road)'],
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, gold: clamp(ch.gold - 2, 0, 999999) }, 10),
          text: 'He takes your coin and forgets your face mid-sentence. You learn humility. -2 gold.',
        }),
      },
      {
        id: 'mock',
        text: 'Mock the rumor (quietly)',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10),
          text: 'You keep your skepticism inside your mouth. You leave with your teeth intact. +2 XP.',
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10),
          text: 'You laugh. He breaks your nose with a mug, very calmly. -1 HP.',
        }),
      },
      {
        id: 'leave',
        text: 'Leave now',
        stat: 'WIS',
        dc: 10,
        onSuccess: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8),
          text: 'You decide to live another day. It feels… unfamiliar. +1 XP.',
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8),
          text: 'You try to leave, but your curiosity follows you out the door. +1 XP.',
        }),
      },
    ]
  ),

  'street.map_drop': scene(
    'street.map_drop',
    'Street',
    'The Dropped Map',
    'A man runs past you with panic in his eyes. Something falls from his cloak: a folded map sealed with black wax. He doesn’t look back.',
    [
      {
        id: 'take',
        text: 'Take the map',
        stat: 'DEX',
        dc: 12,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Sealed Map (Black Wax)'] }, 'map_acquired'), 14),
          text: 'Your hands move before your morals can speak. The wax is still warm.',
          logs: ['Item acquired: Sealed Map (Black Wax)'],
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10),
          text: 'You fumble. A boot heel catches your fingers. Pain teaches speed. -1 HP.',
        }),
      },
      {
        id: 'return',
        text: 'Chase him and return it',
        stat: 'CON',
        dc: 14,
        onSuccess: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12),
          text: 'You catch him. He thanks you like a man who expects to be dead soon. +3 XP.',
          logs: ['Clue gained: “Don’t go to the vault.”'],
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10),
          text: 'He vanishes into the crowd. You run until your lungs revolt. -2 HP.',
        }),
      },
      {
        id: 'burn',
        text: 'Burn it',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10),
          text: 'You destroy it before it can destroy you. Smart choices feel disgusting. +2 XP.',
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10),
          text: 'The wax won’t catch. The paper feels… treated. You decide to keep it anyway. +1 XP.',
        }),
      },
    ]
  ),

  'road.first_blood': scene(
    'road.first_blood',
    'Road',
    'First Blood on the Black Road',
    'The road narrows into pine and shadow. You feel eyes on you — hungry, patient eyes.',
    [
      {
        id: 'camp',
        text: 'Make camp early',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You choose a defensible spot. The night passes without teeth. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'You camp in a hollow like an idiot. Something takes a bite. -2 HP.' }),
      },
      {
        id: 'press',
        text: 'Press on through the dark',
        stat: 'CON',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You keep moving. Fear becomes fuel. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You stumble and swear loudly. The forest remembers. -1 HP.' }),
      },
      {
        id: 'trail',
        text: 'Follow the tracks you “definitely” see',
        stat: 'INT',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, gold: ch.gold + 2 }, 10), text: 'You find a dropped pouch before the tracks vanish. +2 gold.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You follow nothing for an hour. You learn the shape of embarrassment. +1 XP.' }),
      },
    ]
  ),

  'road.bridge_toll': scene(
    'road.bridge_toll',
    'Road',
    'The Bridge Toll',
    'A narrow bridge spans a cold river. A guard in patchwork armor blocks the way with a spear and a bored expression.',
    [
      {
        id: 'pay',
        text: 'Pay the toll',
        stat: 'WIS',
        dc: 10,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 3, 0, 999999) }, 10), text: 'You pay. The guard nods like you’ve validated his entire existence. -3 gold.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 5, 0, 999999) }, 10), text: 'You pay too much. He does not correct you. -5 gold.' }),
      },
      {
        id: 'talk',
        text: 'Talk your way across',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 12), text: 'You sell him a story about urgent business and tragic orphans. He waves you through. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'He calls your bluff and jabs you in the ribs “by accident.” -1 HP.' }),
      },
      {
        id: 'ford',
        text: 'Find another way',
        stat: 'DEX',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You find a shallow ford and keep your boots mostly dry. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'You slip into freezing water and crawl out like a drowned rat. -2 HP.' }),
      },
    ]
  ),

  'road.rival_party': scene(
    'road.rival_party',
    'Road',
    'Rival Adventurers',
    'You find another party at the roadside shrine — better equipped, cleaner, and smiling too easily. One of them eyes your pack like he already owns it.',
    [
      {
        id: 'trade',
        text: 'Trade information',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You trade half-truths and keep your real lead. They leave thinking they won. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You talk too much. Their smiles sharpen. +1 XP.' }),
      },
      {
        id: 'threat',
        text: 'Threaten them',
        stat: 'STR',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You make it clear the next step is violence. They decide it’s not worth the blood. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'They laugh — then someone hits you when you’re not looking. -2 HP.' }),
      },
      {
        id: 'leave',
        text: 'Leave quietly',
        stat: 'DEX',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You disappear before pride can ruin you. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 2, 0, 999999) }, 10), text: 'You leave… and notice later that two coins are missing. -2 gold.' }),
      },
    ]
  ),

  'ruins.stone_gate': scene(
    'ruins.stone_gate',
    'Ruins',
    'The Stone Gate',
    'The ruins breathe cold air. A stone gate blocks the descent, carved with warnings that have been scraped away and rewritten. Someone has been here recently.',
    [
      {
        id: 'study',
        text: 'Study the carvings',
        stat: 'INT',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You decipher the pattern: the gate responds to lies spoken with conviction. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You learn only that someone hated this place enough to vandalize it twice. +1 XP.' }),
      },
      {
        id: 'force',
        text: 'Force it',
        stat: 'STR',
        dc: 15,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp), xp: ch.xp + 2 }, 12), text: 'It opens with a scream of stone. You bruise your shoulder, but you’re in. -1 HP, +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 10), text: 'The gate does not move. Something does. You get hit by falling masonry. -3 HP.' }),
      },
      {
        id: 'lie',
        text: 'Lie to the gate with confidence',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 14), text: 'You tell a lie so clean it almost becomes truth. The gate opens. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The gate rejects your lie and punishes your honesty. A stone shard slices your palm. -2 HP.' }),
      },
    ]
  ),

  'vault.lantern_room': scene(
    'vault.lantern_room',
    'Vault',
    'The Lantern Room',
    'A chamber lined with dead lanterns. One burns with a steady flame though no one has lit it. In its light, you see scratches on the floor — a fight happened here.',
    [
      {
        id: 'take',
        text: 'Take the lantern',
        stat: 'DEX',
        dc: 14,
        onSuccess: (ch) => ({
          c: advanceArc({ ...ch, inventory: [...ch.inventory, 'Lantern of True Flame'] }, 16),
          text: 'The lantern is warm in your hand. The shadows hate it.',
          logs: ['Item acquired: Lantern of True Flame'],
        }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 12), text: 'The flame flares and bites. Your fingers blister. -2 HP.' }),
      },
      {
        id: 'inspect',
        text: 'Inspect the scratches',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You read the fight like a story: someone came for the lock. Someone left bleeding. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You learn nothing except that fear has handwriting. +1 XP.' }),
      },
      {
        id: 'wait',
        text: 'Wait in the dark',
        stat: 'CON',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You wait. Nothing comes. That feels wrong. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You drift and startle awake. Something small scurries away. -1 HP (panic).' }),
      },
    ]
  ),

  'vault.final_lock': scene(
    'vault.final_lock',
    'Vault',
    'The Final Lock',
    'The vault door is sealed by a lock with three tumblers: bone, iron, and glass. You can hear water behind it, like a river trapped in a throat.',
    [
      {
        id: 'pick',
        text: 'Pick the lock',
        stat: 'DEX',
        dc: 15,
        onSuccess: (ch) => ({
          c: advanceArc({ ...ch, gold: ch.gold + 25, xp: ch.xp + 8 }, 20),
          text: 'The tumblers click like prayers. The door opens. Inside: treasure and silence. +25 gold, +8 XP.',
          logs: ['Arc complete: The Map That Shouldn’t Exist'],
        }),
        onFail: (ch) => ({
          c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 16),
          text: 'The lock bites back. A thin glass needle pierces your thumb. -3 HP.',
        }),
      },
      {
        id: 'smash',
        text: 'Smash it open',
        stat: 'STR',
        dc: 16,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp), gold: ch.gold + 18, xp: ch.xp + 6 }, 18), text: 'You break the door, and it breaks you a little back. Treasure spills out like guilt. -2 HP, +18 gold, +6 XP.', logs: ['Arc complete: The Map That Shouldn’t Exist'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 4, 0, ch.maxHp) }, 14), text: 'Stone wins. You lose. -4 HP.' }),
      },
      {
        id: 'leave',
        text: 'Walk away',
        stat: 'WIS',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 5 }, 18), text: 'You leave the treasure behind. You keep your life. That is a trade most people never learn. +5 XP.', logs: ['Arc complete: The Map That Shouldn’t Exist'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 14), text: 'You try to leave. The map in your pocket feels heavier with every step. You turn back. +2 XP.' }),
      },
    ]
  ),

  // ARC — Vengeance
  'letter.black_seal': scene(
    'letter.black_seal',
    'Letter',
    'A Black Seal',
    'A courier finds you by name. He won’t meet your eyes. The letter is sealed in black wax. Your sister’s name is written in the corner in a hand you don’t recognize.',
    [
      {
        id: 'open',
        text: 'Open it',
        stat: 'CON',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 2 }, 'sister_dead'), 14), text: 'The words cut clean: she’s dead. A place is named. A man is blamed. Your grief becomes direction. +2 XP.', logs: ['Quest hook: Vengeance'] }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 'sister_dead'), 12), text: 'Your hands shake. You smear ink like blood. The message remains. -1 HP (shock).' }),
      },
      {
        id: 'ask',
        text: 'Question the courier',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'He admits the sender paid extra to rush it — and paid extra to stay anonymous. +3 XP.', logs: ['Clue gained: sender anonymous (paid extra)'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'He says only, “I just deliver.” His fear answers more than his words. +1 XP.' }),
      },
      {
        id: 'burn',
        text: 'Burn the letter',
        stat: 'WIS',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You burn it and swear you don’t need paper to remember. The ashes don’t help. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'It won’t catch. The wax blackens and refuses. You take it as a sign. +1 XP.' }),
      },
    ]
  ),

  'village.funeral': scene(
    'village.funeral',
    'Village',
    'The Funeral',
    'They’ve buried her, but the earth still looks raw. People speak softly around you like you might break. Someone watches from the edge of the crowd and leaves when you look back.',
    [
      {
        id: 'ask',
        text: 'Ask who left',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'A widow says he was a hired man — not local. “He didn’t cry.” +3 XP.', logs: ['Clue gained: hired man at funeral'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'No one wants to talk. Fear has swallowed the village. +1 XP.' }),
      },
      {
        id: 'kneel',
        text: 'Kneel at the grave',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You promise vengeance out loud. The wind answers like it heard you. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You can’t find words. The silence becomes your oath. +1 XP.' }),
      },
      {
        id: 'leave',
        text: 'Leave before you fall apart',
        stat: 'CON',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You walk away with your spine intact. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'Your legs nearly give out. You catch yourself on the headstone. -1 HP.' }),
      },
    ]
  ),

  'road.witness': scene(
    'road.witness',
    'Road',
    'A Witness With Loose Teeth',
    'You find a man in a roadside ditch with a split lip and a ruined coat. He flinches when you say your sister’s name.',
    [
      {
        id: 'help',
        text: 'Help him up',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'He tells you the name of the man who hired the killers — and where to find him. +3 XP.', logs: ['Clue gained: “House Merrow”'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'He’s too scared to say much. But fear points in a direction. +1 XP.' }),
      },
      {
        id: 'threaten',
        text: 'Threaten him',
        stat: 'STR',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'He talks fast. He talks ugly. He talks true. +2 XP.', logs: ['Clue gained: manor on the hill'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'He panics and swings a rock. It clips your jaw. -1 HP.' }),
      },
      {
        id: 'leave',
        text: 'Leave him',
        stat: 'WIS',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You decide you don’t need him. You’re probably wrong. +1 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'Your conscience follows you for a mile before it shuts up. +1 XP.' }),
      },
    ]
  ),

  'road.hired_blade': scene(
    'road.hired_blade',
    'Road',
    'Hired Blade',
    'A rider blocks the road, cloak hiding his hands. “Turn around,” he says. “This isn’t your fight.” His tone says it absolutely is.',
    [
      {
        id: 'talk',
        text: 'Talk him down',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'He hesitates. For a moment you see the man under the job. He lets you pass. +4 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 12), text: 'He doesn’t hesitate. Something sharp kisses your ribs. -2 HP.' }),
      },
      {
        id: 'fight',
        text: 'Draw steel',
        stat: 'STR',
        dc: 15,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4, gold: ch.gold + 3 }, 14), text: 'You win the exchange and take his coin purse. He rides away bleeding pride. +3 gold, +4 XP.', logs: ['Item acquired: Bloodstained Signet (Merrow)'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 4, 0, ch.maxHp) }, 12), text: 'He’s better than you hoped. You stagger back, alive by luck. -4 HP.' }),
      },
      {
        id: 'sneak',
        text: 'Slip past through the brush',
        stat: 'DEX',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You vanish off-road and reappear behind him. He swears. You keep walking. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'Thorns grab you like hands. He hears you, and you get hit for your trouble. -2 HP.' }),
      },
    ]
  ),

  'manor.closed_doors': scene(
    'manor.closed_doors',
    'Manor',
    'Closed Doors',
    'The manor looms above the village like a judgment. The doors are shut. The windows are lit. Somewhere inside, someone is comfortable.',
    [
      {
        id: 'front',
        text: 'Knock at the front door',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'A servant answers and lies badly. You step inside before he can close the door. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'The servant says “no” like he’s practiced it. You get nothing but a closed door. +1 XP.' }),
      },
      {
        id: 'climb',
        text: 'Climb to a window',
        stat: 'DEX',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You slip inside like a secret. The house smells of wax and money. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A gutter gives. You fall hard. The manor remains unimpressed. -2 HP.' }),
      },
      {
        id: 'bribe',
        text: 'Bribe a guard',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 4, 0, 999999), xp: ch.xp + 2 }, 12), text: 'He takes your gold and looks the other way. -4 gold, +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 4, 0, 999999) }, 10), text: 'He takes your gold and calls you “brave.” Then he calls for help. -4 gold.' }),
      },
    ]
  ),

  'manor.confrontation': scene(
    'manor.confrontation',
    'Manor',
    'The Confrontation',
    'You find him in a warm room with cold eyes. He’s older than you expected. He recognizes your face and doesn’t bother to hide it.',
    [
      {
        id: 'kill',
        text: 'Kill him',
        stat: 'STR',
        dc: 15,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 8, gold: ch.gold + 10 }, 20), text: 'Steel ends the conversation. It does not end the feeling. +10 gold, +8 XP.', logs: ['Arc complete: Black Letter'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 5, 0, ch.maxHp) }, 14), text: 'He’s guarded. You get hurt and learn the shape of failure. -5 HP.' }),
      },
      {
        id: 'confess',
        text: 'Make him confess',
        stat: 'CHA',
        dc: 16,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 8 }, 20), text: 'You corner him with words sharper than knives. He admits it. Out loud. In front of witnesses. +8 XP.', logs: ['Arc complete: Black Letter'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 12), text: 'He laughs. He has practiced being untouchable. You leave with your rage intact. +2 XP.' }),
      },
      {
        id: 'burn',
        text: 'Burn the manor',
        stat: 'INT',
        dc: 15,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 6, gold: ch.gold + 5 }, 18), text: 'Fire does what law won’t. You walk away while the world screams behind you. +5 gold, +6 XP.', logs: ['Arc complete: Black Letter'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 12), text: 'The fire turns on you. Smoke fills your lungs. You escape barely. -3 HP.' }),
      },
    ]
  ),

  'manor.aftermath': scene(
    'manor.aftermath',
    'Aftermath',
    'Aftermath',
    'Morning arrives like nothing happened. The village is quieter. Your hands are still the same hands.',
    [
      {
        id: 'stay',
        text: 'Stay and face what you’ve done',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 12), text: 'You stay. You answer questions. You learn that vengeance doesn’t finish anything. +4 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You try to stay, but your body refuses. You leave before dawn. +2 XP.' }),
      },
      {
        id: 'leave',
        text: 'Leave',
        stat: 'CON',
        dc: 10,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You leave. The road takes your tears and gives you distance. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You leave anyway. Some choices don’t require success. +1 XP.' }),
      },
      {
        id: 'pray',
        text: 'Pray',
        stat: 'WIS',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 10), text: 'You pray for her. You don’t know who’s listening. You feel a fraction lighter. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You try to pray. The words don’t come. The silence is honest. +1 XP.' }),
      },
    ]
  ),

  // ARC 01 — Taxman
  'tavern.taxman': scene(
    'tavern.taxman',
    'Tavern',
    'A Man With A Ledger',
    'A well-dressed stranger slides onto the bench like he’s been waiting for your financial mistakes. He introduces himself as a “volunteer auditor” for the Crown.',
    [
      {
        id: 'confess',
        text: 'Confess everything',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, xp: ch.xp + 3 }, 'taxman_met'), 12), 'street.paperwork'), text: 'You confess only plausible crimes. He nods like a man enjoying a list. +3 XP.' }),
        onFail: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, gold: clamp(ch.gold - 2, 0, 999999), xp: ch.xp + 1 }, 'taxman_met'), 10), 'street.paperwork'), text: 'You accidentally invent a felony mid-sentence. He writes it down. -2 gold, +1 XP.' }),
      },
      {
        id: 'bribe',
        text: 'Bribe him with sincerity',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, gold: clamp(ch.gold - 3, 0, 999999) }, 'taxman_bribed'), 14), 'street.paperwork'), text: 'He takes your coin and your handshake. You are now “friends,” which is somehow worse. -3 gold.' }),
        onFail: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, gold: clamp(ch.gold - 5, 0, 999999) }, 'taxman_bribed'), 12), 'street.paperwork'), text: 'He takes your coin as “evidence.” You feel sponsored by anxiety. -5 gold.' }),
      },
      {
        id: 'between',
        text: 'Explain you’re “between incomes”',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, xp: ch.xp + 2 }, 'taxman_met'), 11), 'street.paperwork'), text: 'You spin a tragic backstory involving a cursed wallet. His eyes glisten. +2 XP.' }),
        onFail: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, xp: ch.xp + 1 }, 'taxman_met'), 9), 'street.paperwork'), text: 'He asks for references. You cite a barstool. It does not help. +1 XP.' }),
      },
    ]
  ),

  'street.paperwork': scene(
    'street.paperwork',
    'Street',
    'Forms: The True Dungeon',
    'Paperwork thick enough to stop an arrow is placed in your hands. The auditor watches you like a hawk watching a mouse learn cursive.',
    [
      {
        id: 'forge',
        text: 'Forge it',
        stat: 'DEX',
        dc: 15,
        onSuccess: (ch) => ({ c: setNext(advanceArc({ ...ch, gold: ch.gold + 6, xp: ch.xp + 3 }, 14), 'court.day'), text: 'Your handwriting becomes a weapon. The forms look… legally alive. +6 gold, +3 XP.' }),
        onFail: (ch) => ({ c: setNext(advanceArc({ ...ch, gold: clamp(ch.gold - 4, 0, 999999) }, 10), 'court.day'), text: 'You spell your own name wrong. The paper judges you. -4 gold.' }),
      },
      {
        id: 'read',
        text: 'Actually read it',
        stat: 'INT',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext(advanceArc({ ...ch, gold: ch.gold + 4, xp: ch.xp + 2 }, 12), 'court.day'), text: 'You find a loophole: “Adventuring expenses” are deductible. Your soul relaxes. +4 gold, +2 XP.' }),
        onFail: (ch) => ({ c: setNext(advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 9), 'court.day'), text: 'The words swim. One paragraph bites you. -1 HP.' }),
      },
      {
        id: 'eat',
        text: 'Eat the paper',
        stat: 'CON',
        dc: 13,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 3 }, 'court.day'), text: 'You finish the stack. The auditor is horrified. You are technically “done.” +3 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 'court.day'), text: 'You gag on bureaucracy. The ink tastes like regret. -2 HP.' }),
      },
    ]
  ),

  'court.day': scene(
    'court.day',
    'Court',
    'The Crown vs. Your Vibes',
    'The judge looks like a disappointed statue. The prosecutor looks like he moisturizes with grudges.',
    [
      {
        id: 'represent',
        text: 'Represent yourself',
        stat: 'CHA',
        dc: 15,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 4, gold: ch.gold + 3 }, text: 'You give a speech about destiny, freedom, and how taxes are basically a curse. The courtroom claps reluctantly. +3 gold, +4 XP.' }),
        onFail: (ch) => ({ c: { ...ch, gold: clamp(ch.gold - 6, 0, 999999) }, text: 'You object to yourself. The judge allows it. You lose on principle. -6 gold.' }),
      },
      {
        id: 'witness',
        text: 'Call the auditor as a character witness',
        stat: 'WIS',
        dc: 14,
        onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 2, xp: ch.xp + 2 }, text: 'The auditor calls you “a mess, but an honest mess.” Case dismissed on vibes. +2 gold, +2 XP.' }),
        onFail: (ch) => ({ c: { ...ch, gold: clamp(ch.gold - 8, 0, 999999) }, text: 'He testifies you offered him “sincerity.” The courtroom gasps. -8 gold.' }),
      },
      {
        id: 'oops',
        text: 'Plead “Oops.”',
        stat: 'CHA',
        dc: 12,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 2 }, text: 'The judge respects humility. You get community service: dungeon latrines. You feel spiritually cleaner. +2 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp), gold: clamp(ch.gold - 4, 0, 999999) }, text: 'The prosecutor respects nothing. The fine respects you even less. -4 gold, -1 HP.' }),
      },
    ]
  ),

  // ARC 02 — Mimic
  'dungeon.mimic_intro': scene(
    'dungeon.mimic_intro',
    'Dungeon',
    'Chest With Feelings',
    'A treasure chest sits alone in the corridor. It sighs. You hate that it sighs.',
    [
      {
        id: 'open',
        text: 'Open it normally',
        stat: 'DEX',
        dc: 13,
        onSuccess: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, gold: ch.gold + 6, xp: ch.xp + 2 }, 'mimic_met'), 12), 'camp.mimic_followup'), text: 'You open it before it commits. Inside: coins and a tiny apology letter. +6 gold, +2 XP.' }),
        onFail: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 'mimic_met'), 10), 'camp.mimic_followup'), text: 'It kisses your hand with teeth. You learn boundaries. -3 HP.' }),
      },
      {
        id: 'compliment',
        text: 'Compliment it',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: ch.gold + 4 }, 'camp.mimic_followup'), text: 'The chest blushes (somehow) and offers you a “gift.” +4 gold.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 'camp.mimic_followup'), text: 'You compliment the hinges. It is a sensitive topic. -1 HP (emotional).' }),
      },
      {
        id: 'hit',
        text: 'Hit it first',
        stat: 'STR',
        dc: 12,
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: ch.gold + 3 }, 'camp.mimic_followup'), text: 'It yelps and retreats, leaving loot out of pure fear. +3 gold.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 'camp.mimic_followup'), text: 'You punch a wall. The chest watches. Your dignity dies quietly. -1 HP.' }),
      },
    ]
  ),

  'camp.mimic_followup': scene(
    'camp.mimic_followup',
    'Camp',
    'The Chest Returns',
    'That night, you hear scraping outside your tent. A small chest sits there like a stray cat with a violent hobby.',
    [
      {
        id: 'adopt',
        text: 'Adopt it',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag(setArcFlag({ ...ch, xp: ch.xp + 3 }, 'mimic_adopted'), 'mimic_followup_done'), 14), text: 'You gain a weird companion: “Chesty.” You regret nothing. (Yet.) +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag(setArcFlag({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp), xp: ch.xp + 2 }, 'mimic_adopted'), 'mimic_followup_done'), 12), text: 'It adopts you. You wake up briefly inside it. -2 HP, +2 XP.' }),
      },
      {
        id: 'boundaries',
        text: 'Set boundaries',
        stat: 'CHA',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag(setArcFlag({ ...ch, xp: ch.xp + 2 }, 'mimic_boundaries'), 'mimic_followup_done'), 12), text: 'It agrees to bite only enemies and people who deserve it. You feel oddly proud. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag(setArcFlag({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 'mimic_boundaries'), 'mimic_followup_done'), 10), text: 'It agrees loudly, then bites your boot to test the rules. -1 HP.' }),
      },
      {
        id: 'send',
        text: 'Send it away',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag(setArcFlag({ ...ch, gold: ch.gold + 1 }, 'mimic_sent_away'), 'mimic_followup_done'), 12), text: 'It leaves you a single coin as closure. You feel… free? +1 gold.' }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag(setArcFlag({ ...ch, gold: clamp(ch.gold - 1, 0, 999999) }, 'mimic_sent_away'), 'mimic_followup_done'), 10), text: 'It leaves anyway, but steals your socks. You are poorer in spirit. -1 gold.' }),
      },
    ]
  ),

  // (Market potion scene removed from the main pool; we’ll reintroduce as a dedicated arc later.)

  // ARC 03 — Internship
  'tower.internship': scene(
    'tower.internship',
    'Magic',
    'Unpaid, Unholy Internship',
    'A wizard offers you an internship. The pay is “experience” and a vague threat.',
    [
      {
        id: 'accept',
        text: 'Accept',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, xp: ch.xp + 2 }, 'internship_signed'), 12), 'lab.safety'), text: 'You accept and immediately regret it professionally. +2 XP.' }),
        onFail: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, xp: ch.xp + 1 }, 'internship_signed'), 10), 'lab.safety'), text: 'You sign a contract written in smoke. You cough once. +1 XP.' }),
      },
      {
        id: 'negotiate',
        text: 'Negotiate pay',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, gold: ch.gold + 2 }, 'internship_paid'), 14), 'lab.safety'), text: 'You get a stipend and a helmet. The helmet is emotional support. +2 gold.' }),
        onFail: (ch) => ({ c: setNext(advanceArc(setArcFlag({ ...ch, gold: clamp(ch.gold - 1, 0, 999999) }, 'internship_signed'), 9), 'lab.safety'), text: 'He laughs in several languages. You buy lunch anyway. -1 gold.' }),
      },
      {
        id: 'steal',
        text: 'Steal his spellbook',
        stat: 'DEX',
        dc: 16,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 4 }, 'lab.safety'), text: 'You steal it and immediately don’t understand it. Knowledge is humiliating. +4 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 'lab.safety'), text: 'The spellbook “accidentally” whacks you. The wizard smiles. -2 HP.' }),
      },
    ]
  ),

  'lab.safety': scene(
    'lab.safety',
    'Magic',
    'Safety Third',
    'The lab has three rules: don’t touch the glowing jar, don’t name it, don’t feed it. You already want to break all three.',
    [
      {
        id: 'follow',
        text: 'Follow the rules',
        stat: 'INT',
        dc: 13,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 2 }, 'fallout.jar'), text: 'You keep all your fingers. Rare achievement. +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 1 }, 'fallout.jar'), text: 'You misread “don’t name” as “do name.” It is now Gary. +1 XP.' }),
      },
      {
        id: 'ask',
        text: 'Ask what’s in the jar',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 1 }, 'fallout.jar'), text: '“Minor demon,” says the wizard. “Major attitude,” says the jar. +1 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 1 }, 'fallout.jar'), text: 'The wizard says “liability” and walks away. The jar laughs. +1 XP.' }),
      },
      {
        id: 'feed',
        text: 'Feed the jar',
        stat: 'CON',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 2 }, 'fallout.jar'), text: 'It purrs. You are disturbed but alive. +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 'fallout.jar'), text: 'It bites through the jar. Something escapes with purpose. -3 HP.' }),
      },
    ]
  ),

  'fallout.jar': scene(
    'fallout.jar',
    'Disaster',
    'Gary Wants Freedom',
    'Something escapes. The wizard blames you with the ease of a man who has never been wrong.',
    [
      {
        id: 'sack',
        text: 'Catch it with a sack',
        stat: 'DEX',
        dc: 14,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 3, gold: ch.gold + 1 }, text: 'You bag Gary. Gary is offended. The wizard is pleased. +1 gold, +3 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, text: 'You bag yourself. The wizard writes notes. -2 HP.' }),
      },
      {
        id: 'blame',
        text: 'Blame the wizard first',
        stat: 'CHA',
        dc: 15,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 3 }, text: 'The wizard is briefly speechless. You use the moment to leave. +3 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'He writes your name in a book titled “Later.” You feel a future headache. -1 HP.' }),
      },
      {
        id: 'deal',
        text: 'Make a deal with Gary',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 2 }, text: 'Gary agrees to haunt your enemies instead. You feel supported in a toxic way. +2 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'Gary agrees to haunt you, specifically. You feel noticed. -1 HP.' }),
      },
    ]
  ),

  // ARC — Princess
  'court.missing_princess': scene(
    'court.missing_princess',
    'Court',
    'The Stolen Heir',
    'The throne room is crowded with silence. The Queen’s hands shake once, then go still. “My daughter is gone,” she says. “Bring her back.”',
    [
      {
        id: 'oath',
        text: 'Swear an oath before the court',
        stat: 'CHA',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 4 }, 'princess_oath'), 14), text: 'Your vow lands like steel on stone. The court gives you leave and a sealed writ. +4 XP.', logs: ['Quest accepted: The Stolen Heir'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You speak, but the room does not follow. A captain steps in and makes it official anyway. +1 XP.' }),
      },
      {
        id: 'questions',
        text: 'Question the captain of the guard',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'guard_lead'), 12), text: 'He admits the truth: a gate was opened from the inside. A ribbon of ash leads toward the old road.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'He gives you ceremony instead of detail. You learn where the lies are, if not the path. +1 XP.' }),
      },
      {
        id: 'ride',
        text: 'Leave at once',
        stat: 'CON',
        dc: 11,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You ride until the castle lights are only memory. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You push too hard, too fast. Your body reminds you what it costs. -1 HP.' }),
      },
    ]
  ),

  'road.royal_messenger': scene(
    'road.royal_messenger',
    'Road',
    'The Queen’s Messenger',
    'A rider meets you at dusk. He is bleeding through his glove. “They took her east,” he says. “To the broken keep.”',
    [
      {
        id: 'stanch',
        text: 'Treat the wound and listen',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You stop the bleeding. He tells you what he saw: bandit cloaks, disciplined ranks, and a sigil painted over.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You do what you can. He talks anyway, voice going thin. +1 XP.' }),
      },
      {
        id: 'press',
        text: 'Press him for details',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'keep_named'), 12), text: 'He names it: Greywatch Keep. He spits like the word tastes wrong.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'Your patience runs out. His fear answers with a shove. -1 HP.' }),
      },
      {
        id: 'go',
        text: 'Ride through the night',
        stat: 'CON',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You keep moving until dawn finds you hollow-eyed and closer. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The road punishes haste. You arrive sore, but you arrive. -2 HP.' }),
      },
    ]
  ),

  'forest.tracks': scene(
    'forest.tracks',
    'Forest',
    'Tracks in Wet Earth',
    'Hoofprints. Bootprints. A dragged line where something heavy was pulled. Whoever did this knew the land.',
    [
      {
        id: 'follow',
        text: 'Follow the tracks',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You keep to the quiet places and find where they camped. The ashes are fresh.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'A branch snaps under your foot. Something moves ahead of you. -1 HP.' }),
      },
      {
        id: 'shortcut',
        text: 'Cut them off',
        stat: 'INT',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'You read the terrain like a map. You gain ground. +4 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'You misjudge the ridge and lose an hour. You can still catch them. +1 XP.' }),
      },
      {
        id: 'wait',
        text: 'Set a trap and wait',
        stat: 'DEX',
        dc: 14,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'bandits_wounded'), 12), text: 'A snare bites into a rider’s leg. You hear curses, then hurried orders.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'Your trap catches you first. Pain is honest. -2 HP.' }),
      },
    ]
  ),

  'forest.bandit_ambush': scene(
    'forest.bandit_ambush',
    'Forest',
    'The Ambush',
    'They come out of the ferns like a practiced thought: blades low, voices calm. “Turn around,” one says. “This road is not for you.”',
    [
      {
        id: 'fight',
        text: 'Refuse and reach for your weapon',
        stat: 'STR',
        dc: 12,
        onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'thug', onWin: { text: 'They break and run. You keep moving.', logs: ['Combat won: Bandit ambush'] }, onLose: { text: 'They leave you in the dirt and take your writ.', logs: ['Combat lost: Bandit ambush'] }, onFlee: { text: 'You vanish into the trees. They curse and give up.', logs: ['Fled: Bandit ambush'] } }) as any } }, 'ambush'), 12), text: 'Steel answers steel.' }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'thug', onWin: { text: 'You force a path through them.', logs: ['Combat won: Bandit ambush'] }, onLose: { text: 'You are beaten down and robbed.', logs: ['Combat lost: Bandit ambush'] }, onFlee: { text: 'You escape, bleeding but alive.', logs: ['Fled: Bandit ambush'] } }) as any } }, 'ambush'), 10), text: 'You hesitate. They don’t.' }),
      },
      {
        id: 'talk',
        text: 'Talk them down',
        stat: 'CHA',
        dc: 15,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 5 }, 14), text: 'You name the Crown and the consequence. Their eyes flicker. They let you pass. +5 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'They laugh once, and a fist finds your mouth. -1 HP.' }),
      },
      {
        id: 'run',
        text: 'Run for the ravine',
        stat: 'DEX',
        dc: 13,
        onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 12), text: 'You slip between trees and stone. Their pursuit fails. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A thrown stone catches your shoulder. You keep moving. -2 HP.' }),
      },
    ]
  ),

  'ruins.witch_gate': scene(
    'ruins.witch_gate',
    'Ruins',
    'The Witch-Gate',
    'An arch of old stone stands in a clearing. Runes cut deep into the lintel are black with age. The air is colder beneath it.',
    [
      { id: 'study', text: 'Study the runes', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'The gate wants a name, spoken true. You learn how to pass. +4 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'The meaning slips away. The gate remains, patient. +1 XP.' }) },
      { id: 'force', text: 'Force your way through', stat: 'STR', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp), xp: ch.xp + 3 }, 12), text: 'Stone yields. You pay for it in bruises. -1 HP, +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The gate rejects you with a shove of cold. -2 HP.' }) },
      { id: 'around', text: 'Go around', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You find the safer path. It costs time, not blood. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You lose the path and return to the arch anyway. +1 XP.' }) },
    ]
  ),

  'keep.outer_wall': scene(
    'keep.outer_wall',
    'Keep',
    'Greywatch Walls',
    'Greywatch Keep rises from rock like a clenched fist. Torches move along the battlements. Somewhere inside, a girl waits and tries not to scream.',
    [
      { id: 'climb', text: 'Climb the outer wall', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'Your fingers find holds in old stone. You are over the wall before anyone looks down. +4 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A loose stone turns. You fall hard and swallow pain. -2 HP.' }) },
      { id: 'sneak', text: 'Slip in through the drain', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You find the hidden mouth of the keep and crawl into darkness. +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'A rat bites you. It’s not heroic, but it’s real. -1 HP.' }) },
      { id: 'front', text: 'Walk in like you belong', stat: 'CHA', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 5 }, 14), text: 'Confidence is a disguise. They let you through the gate. +5 XP.' }), onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You force entry through blood and fear.', logs: ['Combat won: Gatehouse'] }, onLose: { text: 'You are driven back from the gate.', logs: ['Combat lost: Gatehouse'] }, onFlee: { text: 'You flee into the rocks and darkness.', logs: ['Fled: Gatehouse'] } }) as any } }, 'gate_fight'), 10), text: 'They see the lie in your eyes.' }) },
    ]
  ),

  'keep.tower_rescue': scene(
    'keep.tower_rescue',
    'Keep',
    'The Tower',
    'The tower room stinks of lamp oil and old fear. The princess stands with wrists bound, chin lifted. “Took you long enough,” she whispers.',
    [
      { id: 'unlock', text: 'Pick the lock', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 6, gold: ch.gold + 10 }, 20), text: 'The lock gives. You free her, and you take the kidnappers’ coin. +10 gold, +6 XP.', logs: ['Arc complete: The Stolen Heir'] }), onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You cut your way to her side and break the bonds.', logs: ['Combat won: Tower rescue'] }, onLose: { text: 'You fall before you reach her.', logs: ['Combat lost: Tower rescue'] }, onFlee: { text: 'You retreat, regrouping in the dark corridors.', logs: ['Fled: Tower rescue'] } }) as any } }, 'tower_fight'), 14), text: 'Footsteps on the stairs. You are out of time.' }) },
      { id: 'talk', text: 'Ask her what she saw', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'She names the sigil: a black sun. “They serve something under the mountain.” +4 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'She gives you fragments. Enough to be afraid. +1 XP.' }) },
      { id: 'rush', text: 'Cut the bonds with your blade', stat: 'STR', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp), xp: ch.xp + 3 }, 14), text: 'You snap the rope and nick your own hand. Blood on duty. -1 HP, +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'You slip and cut deeper than you mean to. -2 HP.' }) },
    ]
  ),

  'keep.escape': scene(
    'keep.escape',
    'Keep',
    'Breakout',
    'Alarms bloom through the keep. Shouts. Boots. You have the heir. Now you need daylight.',
    [
      { id: 'sprint', text: 'Sprint for the stable', stat: 'CON', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 10), text: 'You reach the horses and ride hard into open country. +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A blade finds you in the crush. You keep running. -2 HP.' }) },
      { id: 'hide', text: 'Hide in the cistern passage', stat: 'WIS', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 12), text: 'You disappear into water and echo. They search above you and find nothing. +4 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'Cold water steals your breath. -1 HP.' }) },
      { id: 'fight', text: 'Turn and fight your way out', stat: 'STR', dc: 12, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You break their line and escape with her.', logs: ['Combat won: Breakout'] }, onLose: { text: 'They take her back as you fall.', logs: ['Combat lost: Breakout'] }, onFlee: { text: 'You flee through smoke and stone.', logs: ['Fled: Breakout'] } }) as any } }, 'breakout'), 12), text: 'You plant your feet and make a promise with steel.' }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You survive the crush and force a path.', logs: ['Combat won: Breakout'] }, onLose: { text: 'You are overwhelmed.', logs: ['Combat lost: Breakout'] }, onFlee: { text: 'You slip away, bruised and breathing.', logs: ['Fled: Breakout'] } }) as any } }, 'breakout'), 10), text: 'They come fast. Faster than your plan.' }),
      },
    ]
  ),

  // ARC — Plague
  'village.ashwater': scene(
    'village.ashwater',
    'Village',
    'Ashwater',
    'The village smells of wet ash and boiled cloth. People keep their doors shut. A bell rings once every hour, counting the living.',
    [
      { id: 'offer', text: 'Offer help', stat: 'CHA', dc: 12, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 3 }, 'plague_arrived'), 12), text: 'They let you in. They do not thank you. They are saving their breath. +3 XP.', logs: ['Quest accepted: Ashwater Plague'] }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'They distrust you, but desperation wins. You are pointed toward the sickhouse. +1 XP.' }) },
      { id: 'observe', text: 'Observe the symptoms', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'symptoms_known'), 12), text: 'Grey tongue. Black veins at the wrist. Fever that breaks, then returns. This is not a simple illness.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You get too close. A cough finds your face. -1 HP.' }) },
      { id: 'supplies', text: 'Buy masks and clean cloth', stat: 'CHA', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 2, 0, 999999), xp: ch.xp + 1 }, 10), text: 'You pay what you must. -2 gold, +1 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, gold: clamp(ch.gold - 3, 0, 999999) }, 8), text: 'They charge you more. Everyone is afraid. -3 gold.' }) },
    ]
  ),

  'village.sickhouse': scene(
    'village.sickhouse',
    'Village',
    'The Sickhouse',
    'Cots line the floor. The healer’s hands are raw from washing. “If you’re here to help,” she says, “bring me a miracle or bring me ingredients.”',
    [
      { id: 'tend', text: 'Tend to the sick', stat: 'WIS', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'You keep people breathing until the fever breaks. Some will live. +4 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'You misstep and get exposed. Your throat burns for a day. -2 HP.' }) },
      { id: 'question', text: 'Question the healer', stat: 'INT', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'cure_hint'), 12), text: 'She says it started after the miners broke into a sealed tunnel. “Something down there breathes poison.”' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'She’s too tired for details. You get the direction anyway: the swamp, then the catacombs. +1 XP.' }) },
      { id: 'leave', text: 'Leave to gather ingredients', stat: 'CON', dc: 10, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You set out before night falls. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You hesitate, then go. +1 XP.' }) },
    ]
  ),

  'chapel.prayer': scene(
    'chapel.prayer',
    'Chapel',
    'Candles and Quiet',
    'The chapel is full of smoke and whispered names. A priest looks up as if you are late to something important.',
    [
      { id: 'ask', text: 'Ask for a blessing', stat: 'CHA', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'He marks your brow with ash and salt. “Do not breathe deep in the dark.” +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'He offers you a candle and a warning. It’s something. +1 XP.' }) },
      { id: 'study', text: 'Study the chapel records', stat: 'INT', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'plague_history'), 12), text: 'You find the last mention of this sickness. It ended when the sealed tunnel was collapsed.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'The ink is old and the names blur. You learn only that this has happened before. +1 XP.' }) },
      { id: 'go', text: 'Leave before grief sticks to you', stat: 'WIS', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You leave with purpose intact. +1 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You stay long enough to hear one more name. Then you go. +1 XP.' }) },
    ]
  ),

  'swamp.rare_herb': scene(
    'swamp.rare_herb',
    'Swamp',
    'Nightroot',
    'The swamp steams. In the black water, something glides without ripples. You find nightroot under a fallen log, pale as bone.',
    [
      { id: 'harvest', text: 'Harvest the herb carefully', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Nightroot'] }, 'nightroot'), 14), text: 'You take what you need and leave the rest. The swamp does not object.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The log shifts. Teeth find your calf. -2 HP.' }) },
      { id: 'listen', text: 'Listen for movement', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You spot the ripple in time and avoid it. +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You misread the sound. Cold water grabs your ankle. -1 HP.' }) },
      { id: 'torch', text: 'Use a torch and move fast', stat: 'CON', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You get in and out with smoke in your lungs. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'The smoke burns your throat. -1 HP.' }) },
    ]
  ),

  'lab.apothecary': scene(
    'lab.apothecary',
    'Apothecary',
    'Bitter Work',
    'Mortar. Pestle. Boiling water. The healer watches your hands. “If you ruin this,” she says, “people die.”',
    [
      { id: 'brew', text: 'Brew the tonic', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 5 }, 'tonic_brewed'), 14), text: 'The mixture turns clear. The room smells like iron and rain. +5 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You spill boiling liquid. Your hand blisters. -1 HP.' }) },
      { id: 'taste', text: 'Taste and adjust', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You fix the bitterness without weakening the medicine. +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'It burns on the tongue. You cough until your eyes water. -1 HP.' }) },
      { id: 'rest', text: 'Rest a moment', stat: 'CON', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You keep yourself steady. +1 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You lose time, not hope. +1 XP.' }) },
    ]
  ),

  'road.quarantine': scene(
    'road.quarantine',
    'Road',
    'Quarantine Line',
    'A militia blocks the road with carts and rope. Behind them, you hear coughing. “No one leaves,” the captain says.',
    [
      { id: 'argue', text: 'Argue your way through', stat: 'CHA', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'You convince them the cure requires passage. Reluctantly, they open the line. +4 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'A soldier shoves you back. In the scuffle, someone coughs in your face. -1 HP.' }) },
      { id: 'sneak', text: 'Sneak around at dusk', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You slip through the reeds and past their lanterns. +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A dog finds you. Teeth and shouting follow. -2 HP.' }) },
      { id: 'help', text: 'Help reinforce the line', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You earn trust by doing the hard thing. The captain lets you pass with an escort. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You try. They still don’t trust you. You learn who they’re afraid of. +1 XP.' }) },
    ]
  ),

  'catacombs.source': scene(
    'catacombs.source',
    'Catacombs',
    'The Source',
    'Below the mine, the stone is wet with a black sheen. A shallow pool breathes like a lung. The sickness has a home.',
    [
      { id: 'sample', text: 'Take a sample', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, inventory: [...ch.inventory, 'Black Ichorsample'] }, 'ichor'), 14), text: 'You bottle it without touching it. The glass fogs from within.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 12), text: 'Your glove tears. The cold goes straight into your veins. -3 HP.' }) },
      { id: 'seal', text: 'Try to seal the pool', stat: 'STR', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 5 }, 14), text: 'You collapse stone into stone. The pool’s “breathing” slows. +5 XP.' }), onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'hound', onWin: { text: 'You drive it back into the dark.', logs: ['Combat won: Catacombs'] }, onLose: { text: 'It mauls you and retreats, satisfied.', logs: ['Combat lost: Catacombs'] }, onFlee: { text: 'You escape the tunnel before it closes on you.', logs: ['Fled: Catacombs'] } }) as any } }, 'catacombs_fight'), 12), text: 'Something rises from the water, hungry for heat.' }) },
      { id: 'leave', text: 'Retreat with what you’ve learned', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You leave before the dark learns your name. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You turn too late and scrape your arm on stone. -1 HP.' }) },
    ]
  ),

  'temple.cure_ritual': scene(
    'temple.cure_ritual',
    'Temple',
    'The Cure',
    'The ritual circle is drawn in salt and soot. The healer holds the tonic like it’s a prayer. “Do it,” she says. “Now.”',
    [
      { id: 'perform', text: 'Perform the ritual', stat: 'WIS', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 8, gold: ch.gold + 12 }, 22), text: 'The air sharpens. The sickness recoils. The bell stops ringing for a while. +12 gold, +8 XP.', logs: ['Arc complete: Ashwater Plague'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 14), text: 'The circle breaks. The backlash steals your breath. -3 HP.' }) },
      { id: 'lead', text: 'Let the healer lead', stat: 'CHA', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'You give her courage when her hands shake. She finishes the chant. +4 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'She falters. You recover, barely. The cure still works, but it costs time. +1 XP.' }) },
      { id: 'guard', text: 'Stand guard', stat: 'STR', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You keep the doorway clear. Fear stays outside. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'hound', onWin: { text: 'You hold the line until the chant ends.', logs: ['Combat won: Temple'] }, onLose: { text: 'You fall as the ritual completes without you.', logs: ['Combat lost: Temple'] }, onFlee: { text: 'You retreat, and the healer finishes alone.', logs: ['Fled: Temple'] } }) as any } }, 'temple_fight'), 12), text: 'A fever-mad thing charges the door. You meet it head on.' }) },
    ]
  ),

  // ARC — Catastrophe
  'observatory.red_comet': scene(
    'observatory.red_comet',
    'Observatory',
    'Red Comet',
    'The astronomer points with a trembling finger. A red comet drags its tail across the sky, too low, too bright. “It was not here yesterday.”',
    [
      { id: 'learn', text: 'Learn what it means', stat: 'INT', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 4 }, 'omen_known'), 14), text: 'Old charts agree: when this comet returns, the mountain opens. +4 XP.', logs: ['Quest accepted: The Skybreak Omen'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'The charts contradict each other. Only the fear is consistent. +1 XP.' }) },
      { id: 'climb', text: 'Head for the mountain', stat: 'CON', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You leave before dawn. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'The cold takes a bite. -1 HP.' }) },
      { id: 'warn', text: 'Warn the town', stat: 'CHA', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'They listen. Some pack. Some pray. Some sharpen knives. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'They call it superstition until the ground shivers under their feet. +1 XP.' }) },
    ]
  ),

  'mountain.tremors': scene(
    'mountain.tremors',
    'Mountain',
    'Tremors',
    'The path up is cracked. Small stones roll downhill on their own. Something deep inside the mountain is turning over in its sleep.',
    [
      { id: 'press', text: 'Press higher', stat: 'CON', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You keep your footing. The air thins and sharpens. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A stone shelf gives way. You catch yourself late. -2 HP.' }) },
      { id: 'listen', text: 'Listen for patterns', stat: 'WIS', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'The tremors come in a rhythm. Something is being fed. +4 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'All you hear is your own blood. +1 XP.' }) },
      { id: 'shelter', text: 'Find shelter', stat: 'INT', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You find a crack in the rock and wait out the worst shaking. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You shelter in the wrong place and get showered in grit. -1 HP.' }) },
    ]
  ),

  'town.omens': scene(
    'town.omens',
    'Town',
    'Bad Signs',
    'Goats refuse water. Dogs howl at empty doorways. A child draws the comet in ash and won’t stop.',
    [
      { id: 'calm', text: 'Calm the crowd', stat: 'CHA', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You keep panic from becoming violence. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'Fear wins. People run in all directions. +1 XP.' }) },
      { id: 'supply', text: 'Gather supplies', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, gold: ch.gold + 3 }, 10), text: 'Someone presses coin into your palm. “For the mountain,” they say. +3 gold.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'The shelves are bare. People have been preparing without admitting it. +1 XP.' }) },
      { id: 'follow', text: 'Follow the black-robed strangers', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch }, 'cult_seen'), 12), text: 'You trail them to a cellar door marked with a black sun.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You are spotted and shoved into a wall. -1 HP.' }) },
    ]
  ),

  'cult.black_chant': scene(
    'cult.black_chant',
    'Cult',
    'The Black Chant',
    'Below the town, candles burn with a blue flame. Voices chant in a language that scrapes the teeth. A black sun is painted on the floor.',
    [
      { id: 'interrupt', text: 'Interrupt the ritual', stat: 'STR', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'thug', onWin: { text: 'The chant breaks. They scatter into tunnels.', logs: ['Combat won: Cult cellar'] }, onLose: { text: 'They overwhelm you and continue chanting.', logs: ['Combat lost: Cult cellar'] }, onFlee: { text: 'You escape before they drag you to the circle.', logs: ['Fled: Cult cellar'] } }) as any } }, 'cult_fight'), 12), text: 'You kick over the nearest candle and step into the smoke.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A knife finds your ribs in the dark. -2 HP.' }) },
      { id: 'listen', text: 'Listen and learn the chant', stat: 'INT', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 5 }, 14), text: 'You catch a phrase: “Open the Skybreak.” You learn their goal. +5 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'The words refuse meaning. You learn only dread. +1 XP.' }) },
      { id: 'leave', text: 'Leave and warn the mountain watch', stat: 'CON', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You run until your legs burn. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'You slip on the steps and crack your knee. -1 HP.' }) },
    ]
  ),

  'ruins.ancient_engine': scene(
    'ruins.ancient_engine',
    'Ruins',
    'Ancient Engine',
    'In a buried chamber, an enormous ring of metal hums without fire. Runes pulse like a heartbeat. This is not a shrine. It is a machine.',
    [
      { id: 'study', text: 'Study the controls', stat: 'INT', dc: 15, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 5 }, 'engine_known'), 14), text: 'You learn what it does: it vents pressure from the mountain into the sky. Someone is trying to reverse it. +5 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'The runes blur. The machine keeps humming. +1 XP.' }) },
      { id: 'break', text: 'Break it so no one can use it', stat: 'STR', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You damage a key strut. The hum drops an octave. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'The machine throws you back with a burst of heat. -2 HP.' }) },
      { id: 'mark', text: 'Mark the path and leave', stat: 'WIS', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You memorize the route. You will need to return here. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You mark it poorly. You can still find it… maybe. +1 XP.' }) },
    ]
  ),

  'mountain.rift': scene(
    'mountain.rift',
    'Mountain',
    'The Rift',
    'A crack runs down the mountainside, venting warm air that smells like copper. Down inside, something glows. The earth is splitting.',
    [
      { id: 'descend', text: 'Descend into the rift', stat: 'DEX', dc: 14, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 4 }, 14), text: 'You climb down with careful hands. The stone is alive with heat. +4 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 12), text: 'You slip. Rock tears skin. -3 HP.' }) },
      { id: 'observe', text: 'Observe from above', stat: 'WIS', dc: 13, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You see shapes moving in the glow. Cultists. And something else. +3 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 10), text: 'Heat distorts everything. You can’t be sure. +1 XP.' }) },
      { id: 'retreat', text: 'Retreat and plan', stat: 'INT', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You choose caution. It is not cowardice. +2 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'You waste time arguing with yourself. +1 XP.' }) },
    ]
  ),

  'skybreak.finale': scene(
    'skybreak.finale',
    'Skybreak',
    'Prevent the Catastrophe',
    'At the mountain’s heart, the cult chants around the ancient engine. The red comet’s light pours down through the rift like blood. One wrong moment, and the sky tears.',
    [
      { id: 'shut', text: 'Shut the engine down', stat: 'INT', dc: 16, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 10, gold: ch.gold + 15 }, 24), text: 'You reverse the sequence. The hum steadies. The mountain exhales. The sky stays whole. +15 gold, +10 XP.', logs: ['Arc complete: The Skybreak Omen'] }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 4, 0, ch.maxHp) }, 14), text: 'The backlash hurls you across stone. The engine screams. -4 HP.' }) },
      { id: 'fight', text: 'Fight through the cult', stat: 'STR', dc: 13, onSuccess: (ch) => ({ c: advanceArc(setArcFlag({ ...ch, flags: { ...ch.flags, __startCombat: startCombat({ c: ch, enemyKind: 'rival', onWin: { text: 'You break the circle and buy the world time.', logs: ['Combat won: Skybreak'] }, onLose: { text: 'They drag you down as the chant continues.', logs: ['Combat lost: Skybreak'] }, onFlee: { text: 'You escape the chamber as the mountain roars.', logs: ['Fled: Skybreak'] } }) as any } }, 'skybreak_fight'), 14), text: 'You step into the circle and make yourself the problem.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, 10), text: 'A blade catches you in the crowd. -2 HP.' }) },
      { id: 'prayer', text: 'Attempt a counter-chant', stat: 'WIS', dc: 15, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 6 }, 14), text: 'You speak old words with a steady mouth. The comet-light falters. +6 XP.' }),
        onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 12), text: 'Your voice breaks, and the darkness answers. -3 HP.' }) },
    ]
  ),

  'skybreak.aftermath': scene(
    'skybreak.aftermath',
    'Skybreak',
    'Aftermath',
    'Dawn comes. The mountain is quiet. People look up at an ordinary sky and cry like they forgot they could.',
    [
      { id: 'leave', text: 'Leave before they make you a story', stat: 'WIS', dc: 11, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'You leave while it is still yours. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'They stop you long enough to say thank you. +1 XP.' }) },
      { id: 'stay', text: 'Stay and help rebuild', stat: 'CON', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 3 }, 12), text: 'You help carry stone and set beams. It matters. +3 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 10), text: 'Your body argues. You work anyway. -1 HP.' }) },
      { id: 'speak', text: 'Speak with the astronomer', stat: 'INT', dc: 12, onSuccess: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 2 }, 10), text: 'He shows you a fresh chart. “There are other omens,” he says. +2 XP.' }), onFail: (ch) => ({ c: advanceArc({ ...ch, xp: ch.xp + 1 }, 8), text: 'He can’t stop shaking. You leave him to the sky. +1 XP.' }) },
    ]
  ),

  // (Bard MLM arc removed from the main pool for now; we’ll reintroduce as a dedicated arc later.)
}

function log(day: number, text: string): GameLogEntry {
  return { id: uid('log'), day, text }
}
