import type { SaveFile } from './types'

const KEY_V2 = 'critical-miss.save.v2'
const KEY_V3 = 'critical-miss.save.v3'

export function loadSave(): SaveFile {
  try {
    const raw3 = localStorage.getItem(KEY_V3)
    if (raw3) {
      const parsed = JSON.parse(raw3)
      if (parsed && parsed.version === 3) return parsed
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

export function saveGame(save: SaveFile) {
  localStorage.setItem(KEY_V3, JSON.stringify(save))
}

export function clearSave() {
  localStorage.removeItem(KEY_V3)
}
