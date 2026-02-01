import type { CampaignArcId, CampaignState, Character, GameLogEntry, Scene, SceneChoice, PendingRoll, Stats } from './types'
import { clamp, d20, modFromStat, pick, uid } from './utils'
import { mimicFinaleScene } from './game2.mimicFinale'
import { startCombat } from './combat'

const NAME_FIRST_F: string[] = ['Astra', 'Lilith', 'Morgana', 'Nyx', 'Seraphine', 'Vera', 'Tess', 'Rowan']
const NAME_FIRST_M: string[] = ['Bromley', 'Thorn', 'Garrick', 'Roland', 'Osric', 'Dorian', 'Milo', 'Cedric']
const NAME_LAST: string[] = ['Underfoot', 'Tax-Evasion', 'McSidequest', 'the Uninsured', 'von Bad Idea', 'of Regret', 'Two-Swords', 'Half-Plan']

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

export function makeNewCharacter(input: {
  name?: string
  sex: Character['sex']
  className: Character['className']
  alignment: Character['alignment']
  stats?: Stats
  statGenMode?: StatGenMode
}): Character {
  const stats: Stats =
    input.stats ??
    generateStats({ className: input.className, mode: input.statGenMode ?? 'weighted' })

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
  const first = sex === 'Female' ? pick(NAME_FIRST_F) : pick(NAME_FIRST_M)
  const last = pick(NAME_LAST)
  return `${first} ${last}`
}

export function generateBackground(c: Character) {
  const hooks = [
    'raised by a cleric with debt and a bard with commitment issues',
    'cursed at birth by an intern wizard who was “pretty sure” it would wear off',
    'destined for greatness, according to a prophecy written on a bar napkin',
    'trained by monks until you got banned for “excessive vibes”',
    'born during a lightning storm that definitely meant something ominous',
  ]

  const arc = ARC_META[c.campaign.arcId]
  return `You are a ${c.sex.toLowerCase()} ${c.className.toLowerCase()} who was ${pick(hooks)}.\n\nCurrent campaign: ${arc.title} (Act ${c.campaign.act}).`
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

  // Arc-specific one-shot gating.
  const gated0 = pool0.filter((x) => {
    if (x.id === 'camp.mimic_followup' && (c.campaign.flags.mimic_followup_done || c.campaign.flags.mimic_sent_away)) return false
    return true
  })

  const unseen = gated0.filter((x) => !seen.has(x.id))

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

  if (success) {
    const r = choice.onSuccess(c)
    c = r.c
    entries.push(log(c.day, r.text))
    for (const extra of r.logs ?? []) entries.push(log(c.day, extra))
    return { c, log: entries, outcomeText: r.text, breakdown, roll, success }
  } else {
    const r = choice.onFail(c)
    c = r.c
    entries.push(log(c.day, r.text))
    for (const extra of r.logs ?? []) entries.push(log(c.day, extra))
    return { c, log: entries, outcomeText: r.text, breakdown, roll, success }
  }
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
  // Weight toward the new story-forward arcs.
  const arcId = weightedPick([
    { id: 'treasure', weight: 3 },
    { id: 'vengeance', weight: 3 },
    { id: 'taxman', weight: 2 },
    { id: 'internship', weight: 2 },
    { id: 'mimic', weight: 1 },
  ] as any)
  return { arcId: arcId as CampaignArcId, act: 1, progress: 0, flags: {}, seenSceneIds: [] }
}

const ARC_META: Record<CampaignArcId, { title: string; blurb: string }> = {
  taxman: {
    title: 'The Crown vs. Your Vibes',
    blurb: 'An auditor has taken an unholy interest in your finances.',
  },
  internship: {
    title: 'Unpaid, Unholy Internship',
    blurb: 'A wizard has offered you “experience.” You will pay in suffering.',
  },
  mimic: {
    title: 'Chest With Feelings',
    blurb: 'A mimic has chosen you. That is not a compliment.',
  },
  treasure: {
    title: 'The Map That Shouldn’t Exist',
    blurb: 'A map falls into your hands, and suddenly everyone wants you dead.',
  },
  vengeance: {
    title: 'Black Letter',
    blurb: 'A letter brings bad news. Your grief becomes a direction.',
  },
}

const ARC_SCENE_POOLS: Record<CampaignArcId, Record<1 | 2 | 3, Array<{ id: string; weight: number }>>> = {
  taxman: {
    1: [
      { id: 'tavern.taxman', weight: 5 },
      { id: 'street.paperwork', weight: 2 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
    2: [
      { id: 'street.paperwork', weight: 5 },
      { id: 'court.day', weight: 3 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
    3: [
      { id: 'court.day', weight: 6 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
  },
  internship: {
    1: [
      { id: 'tower.internship', weight: 5 },
      { id: 'lab.safety', weight: 2 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
    2: [
      { id: 'lab.safety', weight: 5 },
      { id: 'fallout.jar', weight: 3 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
    3: [
      { id: 'fallout.jar', weight: 6 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
  },
  mimic: {
    1: [
      { id: 'dungeon.mimic_intro', weight: 5 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
    2: [
      { id: 'dungeon.mimic_intro', weight: 3 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
    3: [
      { id: 'camp.mimic_finale', weight: 6 },
      { id: 'tavern.dripping_goblet', weight: 1 },
    ],
  },
  treasure: {
    1: [
      { id: 'tavern.rumor_black_road', weight: 4 },
      { id: 'street.map_drop', weight: 3 },
      { id: 'road.first_blood', weight: 2 },
    ],
    2: [
      { id: 'road.rival_party', weight: 3 },
      { id: 'road.bridge_toll', weight: 2 },
      { id: 'ruins.stone_gate', weight: 3 },
      { id: 'road.first_blood', weight: 1 },
    ],
    3: [
      { id: 'vault.lantern_room', weight: 3 },
      { id: 'vault.final_lock', weight: 3 },
    ],
  },
  vengeance: {
    1: [
      { id: 'letter.black_seal', weight: 4 },
      { id: 'village.funeral', weight: 2 },
      { id: 'road.witness', weight: 2 },
    ],
    2: [
      { id: 'road.witness', weight: 2 },
      { id: 'road.hired_blade', weight: 3 },
      { id: 'manor.closed_doors', weight: 3 },
    ],
    3: [
      { id: 'manor.confrontation', weight: 4 },
      { id: 'manor.aftermath', weight: 2 },
    ],
  },
}

const ARC_FINALES: Record<CampaignArcId, string> = {
  taxman: 'court.day',
  internship: 'fallout.jar',
  mimic: 'camp.mimic_finale',
  treasure: 'vault.final_lock',
  vengeance: 'manor.confrontation',
}

function scene(id: string, category: string, title: string, body: string, choices: SceneChoice[]): Scene {
  return { id, category, title, body, choices }
}

function getSceneById(id: string): Scene {
  const s = SCENES[id]
  if (!s) return SCENES['tavern.dripping_goblet']
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
      onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 2 }, text: 'You make good time. Your confidence grows legs. +2 XP.' }),
      onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'You trip over a root that was clearly placed by fate. -1 HP.' }),
    },
    {
      id: 'scavenge',
      text: 'Scavenge for supplies',
      stat: statB,
      dc: dcB,
      onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 2 }, text: 'You find something valuable and mostly legal. +2 gold.' }),
      onFail: (ch) => ({ c: { ...ch, xp: ch.xp + 1 }, text: 'You find nothing, but you do gain character. +1 XP.' }),
    },
  ]

  return scene(id, 'Travel', arc.title, `${mood}\n\n(You feel the campaign tightening around you.)`, choices)
}

const SCENES: Record<string, Scene> = {
  // Finale scenes are defined separately to keep the main file readable.
  'camp.mimic_finale': mimicFinaleScene({ setArcFlag, advanceArc }),

  'tavern.dripping_goblet': scene(
    'tavern.dripping_goblet',
    'Tavern',
    'The Dripping Goblet',
    'The air smells like stew and bad decisions. Someone is eying you suspiciously.',
    [
      {
        id: 'rumors',
        text: 'Ask the barkeep for rumors',
        stat: 'CHA',
        dc: 12,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 4 }, 'heard_rumor'), 10),
          text: 'The barkeep leans in and shares a rumor about a map that leads to a lantern-lit vault in the Black Road ruins. +4 XP.',
          logs: ['Quest hook: The Map That Shouldn’t Exist'],
        }),
        onFail: (ch) => ({ c: { ...ch, gold: clamp(ch.gold - 2, 0, 999999) }, text: 'The barkeep charges you for “information” and gives you a weather report. -2 gold.' }),
      },
      {
        id: 'suspicious',
        text: 'Approach the suspicious stranger',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 5 }, text: 'You defuse the tension with alarming competence. The stranger offers a lead. +5 XP.' }),
        onFail: (ch) => ({
          c: {
            ...ch,
            // start a combat via a hidden flag read by the UI
            flags: {
              ...ch.flags,
              __startCombat: startCombat({
                c: ch,
                enemyKind: 'thug',
                onWin: { text: 'The thug collapses and the tavern pretends it didn’t see. You keep your pride.', logs: ['Combat won: Tavern brawl'] },
                onLose: { text: 'You go down hard. Someone steps on your hand “by accident.”', logs: ['Combat lost: Tavern brawl'] },
                onFlee: { text: 'You slip out into the night with your dignity mostly intact.', logs: ['Fled: Tavern brawl'] },
              }) as any,
            },
          },
          text: 'You say the wrong thing. The stranger stands. Chairs scrape. Someone reaches for a bottle.',
          logs: ['Combat triggered: Tavern brawl'],
        }),
      },
      {
        id: 'flirt',
        text: 'Flirt with the barmaid',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 3 }, text: 'It works. You receive a free drink and a dangerous smile. +3 gold.' }),
        onFail: (ch) => ({ c: { ...ch, xp: ch.xp + 1 }, text: 'It does not work. You learn something about rejection. +1 XP.' }),
      },
    ]
  ),

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

  // (Bard MLM arc removed from the main pool for now; we’ll reintroduce as a dedicated arc later.)
}

function log(day: number, text: string): GameLogEntry {
  return { id: uid('log'), day, text }
}
