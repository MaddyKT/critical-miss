import type { SaveFile } from './types'

const KEY_V2 = 'critical-miss.save.v2'
const KEY_V3 = 'critical-miss.save.v3'
const KEY_V4 = 'critical-miss.save.v4'

export function loadSave(): SaveFile {
  try {
    const raw4 = localStorage.getItem(KEY_V4)
    if (raw4) {
      const parsed = JSON.parse(raw4)
      if (parsed && parsed.version === 4) return normalizeV4(parsed as SaveFile)
    }

    // Migrate forward from v3 if present.
    const raw3 = localStorage.getItem(KEY_V3)
    if (raw3) {
      const parsed = JSON.parse(raw3)
      if (parsed && parsed.version === 3) {
        const migrated = normalizeV4({ ...parsed, version: 4 } as any)
        try {
          localStorage.setItem(KEY_V4, JSON.stringify(migrated))
        } catch {
          // ignore
        }
        return migrated
      }
    }

    // Legacy: v2 save exists, but isn't compatible (new campaign state). Start fresh.
    const raw2 = localStorage.getItem(KEY_V2)
    if (raw2) {
      return { version: 4, character: null, log: [], stage: { kind: 'idle' } }
    }

    return { version: 4, character: null, log: [], stage: { kind: 'idle' } }
  } catch {
    return { version: 4, character: null, log: [], stage: { kind: 'idle' } }
  }
}

function normalizeV4(save: SaveFile): SaveFile {
  if (!save.character) return save
  const c: any = save.character

  // Backfill fields (now required)
  if (typeof c.race !== 'string') c.race = 'Human'
  // Normalize/upgrade legacy race values.
  if (c.race === 'Orc') c.race = 'Half-Orc'
  if (!['Human', 'Elf', 'Dwarf', 'Halfling', 'Half-Elf', 'Half-Orc', 'Gnome', 'Tiefling'].includes(c.race)) c.race = 'Human'

  // arrays
  if (!Array.isArray(c.inventory)) c.inventory = []
  if (!Array.isArray(c.companions)) c.companions = []
  if (typeof c.lastSceneId !== 'string') c.lastSceneId = null
  if (!Array.isArray(c.recentSceneIds)) c.recentSceneIds = []

  // hit dice
  if (![6, 8, 10, 12].includes(c.hitDieSize)) c.hitDieSize = 8
  if (typeof c.hitDiceMax !== 'number') c.hitDiceMax = 6
  if (typeof c.hitDiceRemaining !== 'number') c.hitDiceRemaining = c.hitDiceMax

  // spell slots
  if (typeof c.spellSlotsMax !== 'number') c.spellSlotsMax = 0
  if (typeof c.spellSlotsRemaining !== 'number') c.spellSlotsRemaining = c.spellSlotsMax

  // campaign defaults (only allow our current arc)
  if (!c.campaign || typeof c.campaign !== 'object') {
    c.campaign = { arcId: 'starfall', act: 1, progress: 0, flags: {}, seenSceneIds: [] }
  }
  if (!['starfall'].includes(c.campaign.arcId)) c.campaign.arcId = 'starfall'
  if (!Array.isArray(c.campaign.seenSceneIds)) c.campaign.seenSceneIds = []

  save.character = c
  return save
}

export function saveGame(save: SaveFile) {
  localStorage.setItem(KEY_V4, JSON.stringify(save))
}

export function clearSave() {
  localStorage.removeItem(KEY_V4)
}
