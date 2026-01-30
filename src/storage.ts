import type { SaveFile } from './types'

const KEY = 'critical-miss.save.v2'

export function loadSave(): SaveFile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { version: 2, character: null, log: [], stage: { kind: 'idle' } }
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 2) return { version: 2, character: null, log: [], stage: { kind: 'idle' } }
    return parsed
  } catch {
    return { version: 2, character: null, log: [], stage: { kind: 'idle' } }
  }
}

export function saveGame(save: SaveFile) {
  localStorage.setItem(KEY, JSON.stringify(save))
}

export function clearSave() {
  localStorage.removeItem(KEY)
}
