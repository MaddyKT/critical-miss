import type { Character, GameLogEntry, Scene, SceneChoice, PendingRoll, Stats } from './types'
import { clamp, d20, modFromStat, pick, uid } from './utils'

const NAME_FIRST_F: string[] = ['Astra', 'Lilith', 'Morgana', 'Nyx', 'Seraphine', 'Vera', 'Tess', 'Rowan']
const NAME_FIRST_M: string[] = ['Bromley', 'Thorn', 'Garrick', 'Roland', 'Osric', 'Dorian', 'Milo', 'Cedric']
const NAME_LAST: string[] = ['Underfoot', 'Tax-Evasion', 'McSidequest', 'the Uninsured', 'von Bad Idea', 'of Regret', 'Two-Swords', 'Half-Plan']

export function makeNewCharacter(input: {
  name?: string
  sex: Character['sex']
  className: Character['className']
  alignment: Character['alignment']
  stats?: Stats
}): Character {
  const base: Stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }

  const bumps: Record<Character['className'], Partial<Stats>> = {
    Rogue: { DEX: 14, INT: 12, CHA: 11 },
    Wizard: { INT: 15, WIS: 12, CON: 11 },
    Barbarian: { STR: 15, CON: 14, INT: 8 },
    Fighter: { STR: 14, CON: 13, DEX: 12 },
    Paladin: { STR: 13, CHA: 14, CON: 12 },
    Druid: { WIS: 15, CON: 12, INT: 11 },
  }

  const stats: Stats = input.stats ?? ({ ...base, ...bumps[input.className] } as Stats)
  const maxHp = 10 + modFromStat(stats.CON) + (input.className === 'Barbarian' ? 4 : 0)

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

    stats,
    flags: {},
    nextSceneId: null,
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
  return `You are a ${c.sex.toLowerCase()} ${c.className.toLowerCase()} who was ${pick(hooks)}.`
}

export function nextTurnScene(c: Character): Scene {
  // If we have an explicit follow-up queued, run it next.
  if (c.nextSceneId) {
    const id = c.nextSceneId
    c.nextSceneId = null
    return getSceneById(id)
  }

  // Otherwise pick a fresh scene. (Entry points only.)
  const entries: Array<{ id: string; weight: number }> = [
    { id: 'tavern.dripping_goblet', weight: 3 },
    { id: 'tavern.taxman', weight: 2 },
    { id: 'tavern.mlm_pitch', weight: 2 },
    { id: 'market.potion', weight: 2 },
    { id: 'dungeon.mimic_intro', weight: 2 },
    { id: 'tower.internship', weight: 2 },
  ]

  const pickId = weightedPick(entries)
  return getSceneById(pickId)
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

  const entries: GameLogEntry[] = []
  const breakdown = `d20 ${roll} + ${choice.stat} ${bonus >= 0 ? `+${bonus}` : bonus} = ${total} vs DC ${choice.dc}`

  if (success) {
    const r = choice.onSuccess(c)
    c = r.c
    entries.push(log(c.day, r.text))
    return { c, log: entries, outcomeText: r.text, breakdown, roll, success }
  } else {
    const r = choice.onFail(c)
    c = r.c
    entries.push(log(c.day, r.text))
    return { c, log: entries, outcomeText: r.text, breakdown, roll, success }
  }
}

function setNext(c: Character, nextSceneId: string | null): Character {
  return { ...c, nextSceneId }
}

function scene(id: string, category: string, title: string, body: string, choices: SceneChoice[]): Scene {
  return { id, category, title, body, choices }
}

function getSceneById(id: string): Scene {
  const s = SCENES[id]
  if (!s) return SCENES['tavern.dripping_goblet']
  return s
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

const SCENES: Record<string, Scene> = {
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
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 4 }, text: 'The barkeep leans in and shares a juicy rumor. It is probably only 40% cursed. +4 XP.' }),
        onFail: (ch) => ({ c: { ...ch, gold: clamp(ch.gold - 2, 0, 999999) }, text: 'The barkeep charges you for “information” and gives you a weather report. -2 gold.' }),
      },
      {
        id: 'suspicious',
        text: 'Approach the suspicious stranger',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 5 }, text: 'You defuse the tension with alarming competence. The stranger offers a lead. +5 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, text: 'You say the wrong thing. There is a chair. The chair is now part of your face. -3 HP.' }),
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
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 3 }, 'street.paperwork'), text: 'You confess only plausible crimes. He nods like a man enjoying a list. +3 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 2, 0, 999999), xp: ch.xp + 1 }, 'street.paperwork'), text: 'You accidentally invent a felony mid-sentence. He writes it down. -2 gold, +1 XP.' }),
      },
      {
        id: 'bribe',
        text: 'Bribe him with sincerity',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 3, 0, 999999) }, 'street.paperwork'), text: 'He takes your coin and your handshake. You are now “friends,” which is somehow worse. -3 gold.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 5, 0, 999999) }, 'street.paperwork'), text: 'He takes your coin as “evidence.” You feel sponsored by anxiety. -5 gold.' }),
      },
      {
        id: 'between',
        text: 'Explain you’re “between incomes”',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 2 }, 'street.paperwork'), text: 'You spin a tragic backstory involving a cursed wallet. His eyes glisten. +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 1 }, 'street.paperwork'), text: 'He asks for references. You cite a barstool. It does not help. +1 XP.' }),
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
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: ch.gold + 6, xp: ch.xp + 3 }, 'court.day'), text: 'Your handwriting becomes a weapon. The forms look… legally alive. +6 gold, +3 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 4, 0, 999999) }, 'court.day'), text: 'You spell your own name wrong. The paper judges you. -4 gold.' }),
      },
      {
        id: 'read',
        text: 'Actually read it',
        stat: 'INT',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: ch.gold + 4, xp: ch.xp + 2 }, 'court.day'), text: 'You find a loophole: “Adventuring expenses” are deductible. Your soul relaxes. +4 gold, +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 'court.day'), text: 'The words swim. One paragraph bites you. -1 HP.' }),
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
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: ch.gold + 6, xp: ch.xp + 2 }, 'camp.mimic_followup'), text: 'You open it before it commits. Inside: coins and a tiny apology letter. +6 gold, +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 'camp.mimic_followup'), text: 'It kisses your hand with teeth. You learn boundaries. -3 HP.' }),
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
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 3 }, text: 'You gain a weird companion: “Chesty.” You regret nothing. (Yet.) +3 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp), xp: ch.xp + 2 }, text: 'It adopts you. You wake up briefly inside it. -2 HP, +2 XP.' }),
      },
      {
        id: 'boundaries',
        text: 'Set boundaries',
        stat: 'CHA',
        dc: 12,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 2 }, text: 'It agrees to bite only enemies and people who deserve it. You feel oddly proud. +2 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'It agrees loudly, then bites your boot to test the rules. -1 HP.' }),
      },
      {
        id: 'send',
        text: 'Send it away',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 1 }, text: 'It leaves you a single coin as closure. You feel… free? +1 gold.' }),
        onFail: (ch) => ({ c: { ...ch, gold: clamp(ch.gold - 1, 0, 999999) }, text: 'It leaves anyway, but steals your socks. You are poorer in spirit. -1 gold.' }),
      },
    ]
  ),

  // ARC 05 — Potion
  'market.potion': scene(
    'market.potion',
    'Market',
    'Discount Elixir',
    'A vendor sells “healing potions” in unmarked bottles. The liquid is the color of optimism and bad science.',
    [
      {
        id: 'drink',
        text: 'Drink it',
        stat: 'CON',
        dc: 13,
        onSuccess: (ch) => ({ c: { ...ch, hp: clamp(ch.hp + 3, 0, ch.maxHp), gold: clamp(ch.gold - 2, 0, 999999) }, text: 'It works. Somehow. Your organs forgive you. +3 HP, -2 gold.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp), gold: clamp(ch.gold - 2, 0, 999999), xp: ch.xp + 1 }, text: 'You heal emotionally, not physically. -1 HP, -2 gold, +1 XP.' }),
      },
      {
        id: 'ask',
        text: 'Ask what’s inside',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 1, gold: clamp(ch.gold - 1, 0, 999999) }, text: '“Mostly mint,” he says. You hear “mostly” and flinch. -1 gold, +1 XP.' }),
        onFail: (ch) => ({ c: { ...ch, xp: ch.xp + 1 }, text: 'He says “trade secret” and bites the bottle to show confidence. You learn fear. +1 XP.' }),
      },
      {
        id: 'rat',
        text: 'Test it on a rat',
        stat: 'INT',
        dc: 14,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 2 }, text: 'The rat becomes swole and files a complaint. You respect it. +2 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'The rat explodes politely. You feel judged by nature. -1 HP.' }),
      },
    ]
  ),

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
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 2 }, 'lab.safety'), text: 'You accept and immediately regret it professionally. +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 1 }, 'lab.safety'), text: 'You sign a contract written in smoke. You cough once. +1 XP.' }),
      },
      {
        id: 'negotiate',
        text: 'Negotiate pay',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: ch.gold + 2 }, 'lab.safety'), text: 'You get a stipend and a helmet. The helmet is emotional support. +2 gold.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 1, 0, 999999) }, 'lab.safety'), text: 'He laughs in several languages. You buy lunch anyway. -1 gold.' }),
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

  // ARC 04 — Bard MLM
  'tavern.mlm_pitch': scene(
    'tavern.mlm_pitch',
    'Tavern',
    'Multi-Level Minstrelsy',
    'A bard promises riches if you recruit “downline” bards. He says “passive income” like it’s a spell.',
    [
      {
        id: 'buy',
        text: 'Buy in',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 3, 0, 999999), xp: ch.xp + 1 }, 'street.recruit'), text: 'You receive pamphlets and shame. -3 gold, +1 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, gold: clamp(ch.gold - 5, 0, 999999) }, 'street.recruit'), text: 'You accidentally buy the “premium” package. It includes more shame. -5 gold.' }),
      },
      {
        id: 'expose',
        text: 'Expose him',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 2 }, 'street.recruit'), text: 'The tavern cheers. The bard cries and tries to sell tissues. +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, 'street.recruit'), text: 'The crowd turns on you. They love scams if they feel smart. -1 HP.' }),
      },
      {
        id: 'recruit',
        text: 'Recruit him into your heist',
        stat: 'CHA',
        dc: 13,
        onSuccess: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 2 }, 'street.recruit'), text: 'He joins, still pitching mid-heist. You respect the hustle. +2 XP.' }),
        onFail: (ch) => ({ c: setNext({ ...ch, xp: ch.xp + 1 }, 'street.recruit'), text: 'He recruits you harder. You feel your resolve melting. +1 XP.' }),
      },
    ]
  ),

  'street.recruit': scene(
    'street.recruit',
    'Street',
    'The Downline Hunger',
    'You corner strangers with a lute and desperation. The bard watches you like a proud parent who made bad choices.',
    [
      {
        id: 'charm',
        text: 'Charm them',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 2, xp: ch.xp + 1 }, text: 'Someone signs up. They will regret it forever. +2 gold, +1 XP.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 1, 0, ch.maxHp) }, text: 'A tomato is thrown. It is accurate. -1 HP.' }),
      },
      {
        id: 'threaten',
        text: 'Threaten them',
        stat: 'STR',
        dc: 13,
        onSuccess: (ch) => ({ c: { ...ch, gold: ch.gold + 1 }, text: 'Fear works briefly. You feel terrible in a profitable way. +1 gold.' }),
        onFail: (ch) => ({ c: { ...ch, hp: clamp(ch.hp - 2, 0, ch.maxHp) }, text: 'They threaten you back. They’re better at it. -2 HP.' }),
      },
      {
        id: 'quit',
        text: 'Quit',
        stat: 'WIS',
        dc: 12,
        onSuccess: (ch) => ({ c: { ...ch, xp: ch.xp + 1 }, text: 'You walk away. Freedom tastes like air. +1 XP.' }),
        onFail: (ch) => ({ c: { ...ch, xp: ch.xp + 1 }, text: 'You try to quit, but the bard finds you later with more pamphlets. It’s a haunting. +1 XP.' }),
      },
    ]
  ),
}

function log(day: number, text: string): GameLogEntry {
  return { id: uid('log'), day, text }
}
