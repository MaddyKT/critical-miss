import packV1 from './content/pack_v1.md?raw'
import schema from './content/SCENARIO_SCHEMA.md?raw'

export type ScenarioPack = {
  id: string
  title: string
  category: string
  text: string
}

export const SCENARIO_PACKS: ScenarioPack[] = [
  { id: 'schema', title: 'Scenario Schema (draft)', category: 'Docs', text: schema },
  { id: 'pack_v1', title: 'Scenario Pack v1 (draft)', category: 'Packs', text: packV1 },
]
