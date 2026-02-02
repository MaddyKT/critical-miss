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

  // level / xp normalization (D&D-ish thresholds)
  if (typeof c.xp !== 'number') c.xp = 0
  if (typeof c.level !== 'number') c.level = 1
  const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
  let lvl = 1
  for (let l = 20; l >= 1; l--) {
    if (c.xp >= (XP_FOR_LEVEL[l] ?? 0)) {
      lvl = l
      break
    }
  }
  c.level = Math.max(1, Math.min(20, lvl))

  // spellSlotsMax derived from class+level (MVP pool)
  const caster = c.className === 'Wizard' || c.className === 'Druid'
  const slots = !caster
    ? 0
    : c.level <= 1
      ? 2
      : c.level <= 2
        ? 3
        : c.level <= 3
          ? 4
          : c.level <= 4
            ? 5
            : c.level <= 6
              ? 6
              : c.level <= 8
                ? 7
                : c.level <= 10
                  ? 8
                  : c.level <= 12
                    ? 9
                    : 10
  if (typeof c.spellSlotsMax === 'number') c.spellSlotsMax = slots
  if (typeof c.spellSlotsRemaining === 'number') c.spellSlotsRemaining = Math.min(c.spellSlotsRemaining, c.spellSlotsMax)

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
