import { useEffect, useMemo, useRef, useState } from 'react'

// Lightweight "fancy" dice: a CSS 3D cube (d6) that spins quickly and lands on the rolled face.
// We use this for visuals now; rules can still be d20 etc. Later we can swap in real d20 mesh.

const faceMap = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
} as const

type Face = keyof typeof faceMap

type Props = {
  value: number
  durationMs?: number
  onDone?: () => void
  label?: string
}

export function DiceRoll({ value, durationMs = 520, onDone, label = 'Roll' }: Props) {
  const v = Math.min(6, Math.max(1, Math.round(value))) as Face
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<number | null>(null)

  const showClass = useMemo(() => `show-${faceMap[v]}`, [v])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  function roll() {
    if (spinning) return
    setSpinning(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setSpinning(false)
      onDone?.()
    }, durationMs)
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
      <div className={`die_scene ${spinning ? 'spin' : ''}`}>
        <div className={`die ${showClass}`}>
          <div className="face one">1</div>
          <div className="face two">2</div>
          <div className="face three">3</div>
          <div className="face four">4</div>
          <div className="face five">5</div>
          <div className="face six">6</div>
        </div>
      </div>
      <button className="cm_button" onClick={roll} disabled={spinning}>
        {label}
      </button>
    </div>
  )
}
