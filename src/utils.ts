export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function rollDie(sides: number) {
  return 1 + Math.floor(Math.random() * sides)
}

export function d20() {
  return rollDie(20)
}

export function modFromStat(stat: number) {
  // classic-ish modifier; keeps it simple
  return Math.floor((stat - 10) / 2)
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

export function todayISO() {
  return new Date().toISOString()
}
