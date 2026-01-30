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

  stats: Stats
  flags: Record<string, boolean>
  nextSceneId?: string | null
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

export type SceneChoice = {
  id: string
  text: string
  stat: StatKey
  dc: number
  // for later: adv/disadv, multi-stat, etc.
  onSuccess: (c: Character) => { c: Character; text: string }
  onFail: (c: Character) => { c: Character; text: string }
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
  version: 2
  character: Character | null
  log: GameLogEntry[]
  stage: UIStage
}
