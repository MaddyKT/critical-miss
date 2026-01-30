import { useEffect, useMemo, useState } from 'react'

type Props = {
  value?: number
  rolling: boolean
  durationMs?: number
  onSettled?: () => void
}

// Phone-safe dice visual: SVG d20 with a quick spin.
// Always works (no WebGL). Number is shown on the face.
export function Dice2D({ value = 20, rolling, durationMs = 520, onSettled }: Props) {
  const [spin, setSpin] = useState(false)

  const display = useMemo(() => {
    const v = Math.round(value)
    return Math.max(1, Math.min(20, v))
  }, [value])

  useEffect(() => {
    if (!rolling) return
    setSpin(true)
    const t = window.setTimeout(() => {
      setSpin(false)
      onSettled?.()
    }, durationMs)
    return () => window.clearTimeout(t)
  }, [rolling, durationMs, onSettled])

  return (
    <div className={`d20_2d ${spin ? 'spin' : ''}`} aria-label={`d20 showing ${display}`}>
      <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="d20">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7f7f7" />
            <stop offset="1" stopColor="#d8d8d8" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000" floodOpacity="0.25" />
          </filter>
        </defs>
        <polygon
          points="100,18 173,60 186,140 100,182 14,140 27,60"
          fill="url(#g)"
          stroke="rgba(0,0,0,0.18)"
          strokeWidth="3"
          filter="url(#shadow)"
        />
        <text x="100" y="118" textAnchor="middle" fontSize="56" fontWeight="900" fill="#111">
          {display}
        </text>
      </svg>
    </div>
  )
}
