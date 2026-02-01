import type { Character, Scene, SceneChoice } from './types'
import { clamp } from './utils'

export function mimicFinaleScene(opts: {
  setArcFlag: (c: Character, key: string, value?: boolean) => Character
  advanceArc: (c: Character, delta: number) => Character
}): Scene {
  const { setArcFlag, advanceArc } = opts

  const scene = (id: string, category: string, title: string, body: string, choices: SceneChoice[]): Scene => ({
    id,
    category,
    title,
    body,
    choices,
  })

  return scene(
    'camp.mimic_finale',
    'Camp',
    'Chesty’s Ultimatum',
    'At midnight, the chest opens itself politely. Inside is a tiny velvet collar… and a contract written in drool. Chesty wants a role in the party. You suspect this ends with a bite either way.',
    [
      {
        id: 'party',
        text: 'Make it official: Chesty joins the party',
        stat: 'CHA',
        dc: 14,
        onSuccess: (ch) => ({
          c: advanceArc(
            setArcFlag(
              {
                ...ch,
                xp: ch.xp + 6,
                party: { ...ch.party, inParty: true, members: [...new Set([...ch.party.members, 'Chesty'])] },
                companions: [...ch.companions, { id: 'comp_chesty', name: 'Chesty', relationship: 65 }],
              },
              'mimic_party'
            ),
            20
          ),
          text: 'You give a stirring speech about found family and acceptable biting. Chesty clicks happily. You have a new party member. +6 XP.',
          logs: ['New companion acquired: Chesty', 'Relationship unlocked: Chesty'],
        }),
        onFail: (ch) => ({
          c: advanceArc(
            setArcFlag(
              {
                ...ch,
                hp: clamp(ch.hp - 2, 0, ch.maxHp),
                xp: ch.xp + 4,
                party: { ...ch.party, inParty: true, members: [...new Set([...ch.party.members, 'Chesty'])] },
                companions: [...ch.companions, { id: 'comp_chesty', name: 'Chesty', relationship: 55 }],
              },
              'mimic_party'
            ),
            16
          ),
          text: 'Your speech is bad. Chesty joins anyway. It bites your hand like a signature. -2 HP, +4 XP.',
          logs: ['New companion acquired: Chesty', 'Relationship unlocked: Chesty'],
        }),
      },
      {
        id: 'banish',
        text: 'Banish it (gently, with snacks)',
        stat: 'WIS',
        dc: 13,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, gold: ch.gold + 3, xp: ch.xp + 3 }, 'mimic_banished'), 18),
          text: 'You set boundaries so firm they briefly become law. Chesty leaves you three coins as closure. You feel victorious and slightly lonely. +3 gold, +3 XP.',
        }),
        onFail: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, gold: clamp(ch.gold - 2, 0, 999999) }, 'mimic_banished'), 14),
          text: 'Chesty refuses, steals two coins, and disappears into the night like a tiny wooden menace. -2 gold.',
        }),
      },
      {
        id: 'weaponize',
        text: 'Weaponize it (morally questionable, strategically correct)',
        stat: 'INT',
        dc: 15,
        onSuccess: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, xp: ch.xp + 5, gold: ch.gold + 2 }, 'mimic_weapon'), 18),
          text: 'You invent “consensual ambush tactics.” Chesty purrs like a trap. You gain a reputation and some loot. +2 gold, +5 XP.',
        }),
        onFail: (ch) => ({
          c: advanceArc(setArcFlag({ ...ch, hp: clamp(ch.hp - 3, 0, ch.maxHp) }, 'mimic_weapon'), 14),
          text: 'Chesty weaponizes you. You wake up inside it for three minutes and come out humbled. -3 HP.',
        }),
      },
    ]
  )
}
