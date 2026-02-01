export type ClassName = 'Rogue' | 'Wizard' | 'Barbarian' | 'Fighter' | 'Paladin' | 'Druid'

export type Sex = 'Male' | 'Female'

export type Stats = {
  STR: number
  DEX: number
  CON: number
  INT: number
  WIS: number
  CHA: number
}

export type CampaignArcId = 'taxman' | 'internship' | 'mimic' | 'treasure' | 'vengeance'

export type CampaignState = {
  arcId: CampaignArcId
  /** 1..3 */
  act: 1 | 2 | 3
  /** 0..100 */
  progress: number
  /** lightweight continuity flags scoped to the arc */
  flags: Record<string, boolean>
  /** scene ids already used in this arc; used to prevent repeats */
  seenSceneIds: string[]
}

export type Companion = {
  id: string
  name: string
  /** 0..100 */
  relationship: number
}

export type Character = {
  name: string
  sex: Sex
  className: ClassName
  alignment: 'Good' | 'Neutral' | 'Evil'

  level: number // 1-20
  xp: number
  day: number
  hp: number
  maxHp: number
  gold: number

  inventory: string[]
  companions: Companion[]

  // Resource systems
  hitDieSize: 6 | 8 | 10 | 12
  hitDiceMax: number
  hitDiceRemaining: number

  /** spell slots (DnD-ish): cantrips unlimited; slots refresh on long rest */
  spellSlotsMax: number
  spellSlotsRemaining: number

  stats: Stats
  flags: Record<string, boolean>
  nextSceneId?: string | null
  lastSceneId?: string | null
  recentSceneIds?: string[]

  campaign: CampaignState

  party: {
    inParty: boolean
    members: string[]
  }
}

export type GameLogEntry = {
  id: string
  day: number
  text: string
}

export type StatKey = keyof Stats

export type SceneOutcome = {
  c: Character
  text: string
  /** additional log lines to append (e.g., items, companions) */
  logs?: string[]
}

export type SceneChoice = {
  id: string
  text: string
  stat: StatKey
  dc: number
  // for later: adv/disadv, multi-stat, etc.
  onSuccess: (c: Character) => SceneOutcome
  onFail: (c: Character) => SceneOutcome
}

export type Scene = {
  id: string
  category: string
  title: string
  body: string
  choices: SceneChoice[] // 2–4
}

export type PendingRoll = {
  sceneId: string
  choiceId: string
  stat: StatKey
  dc: number
}

export type UIStage =
  | { kind: 'idle' } // waiting for +Turn
  | { kind: 'scene'; scene: Scene }
  | { kind: 'roll'; scene: Scene; pending: PendingRoll }
  | { kind: 'outcome'; scene: Scene; outcomeText: string }

export type SaveFile = {
  version: 3
  character: Character | null
  log: GameLogEntry[]
  stage: UIStage
}
