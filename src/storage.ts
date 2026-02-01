import type { SaveFile } from './types'

const KEY_V2 = 'critical-miss.save.v2'
const KEY_V3 = 'critical-miss.save.v3'

export function loadSave(): SaveFile {
  try {
    const raw3 = localStorage.getItem(KEY_V3)
    if (raw3) {
      const parsed = JSON.parse(raw3)
      if (parsed && parsed.version === 3) return normalizeV3(parsed as SaveFile)
    }

    // Legacy: v2 save exists, but isn't compatible (new campaign state). Start fresh.
    // (We keep the old key so you could migrate later if you want.)
    const raw2 = localStorage.getItem(KEY_V2)
    if (raw2) {
      return { version: 3, character: null, log: [], stage: { kind: 'idle' } }
    }

    return { version: 3, character: null, log: [], stage: { kind: 'idle' } }
  } catch {
    return { version: 3, character: null, log: [], stage: { kind: 'idle' } }
  }
}

function normalizeV3(save: SaveFile): SaveFile {
  if (!save.character) return save
  const c: any = save.character
  // Backfill fields added after v3 initial rollout.
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

  save.character = c
  return save
}

export function saveGame(save: SaveFile) {
  localStorage.setItem(KEY_V3, JSON.stringify(save))
}

export function clearSave() {
  localStorage.removeItem(KEY_V3)
}
