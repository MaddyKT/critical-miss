import { useMemo, useState } from 'react'
import { Dice2D } from './Dice2D'
import { DiceD20 } from './DiceD20'

export function DiceModal(props: {
  stat: string
  dc: number
  onRoll: (roll: number) => void
}) {
  const [phase, setPhase] = useState<'ready' | 'rolling' | 'done'>('ready')
  const [roll, setRoll] = useState<number | null>(null)

  // Default to 2D because Safari/WebGL can render as a blank/black box on some devices.
  // 3D is opt-in via the toggle below.
  const [use3d, setUse3d] = useState(false)

  const label = useMemo(() => {
    if (phase === 'ready') return 'Roll'
    if (phase === 'rolling') return 'Rolling…'
    return 'OK'
  }, [phase])

  function doRoll() {
    if (phase === 'ready') {
      const r = 1 + Math.floor(Math.random() * 20)
      setRoll(r)
      setPhase('rolling')
    }
  }

  function settled() {
    setPhase('done')
  }

  function ok() {
    if (roll == null) return
    props.onRoll(roll)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 18,
            background:
              'radial-gradient(140px 140px at 30% 30%, rgba(124,92,255,0.35), rgba(0,0,0,0.25)), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.25))',
            border: '1px solid rgba(255,255,255,0.14)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {use3d ? (
            <DiceD20
              rolling={phase === 'rolling'}
              onSettled={settled}
              onError={() => {
                // Fallback for devices where WebGL/model rendering is flaky
                setUse3d(false)
              }}
            />
          ) : (
            <Dice2D value={roll ?? 20} rolling={phase === 'rolling'} onSettled={settled} />
          )}
        </div>
        <div style={{ marginTop: 8, fontWeight: 900, fontSize: 32 }}>
          {phase === 'done' && roll != null ? roll : ''}
        </div>
      </div>

      <div className="fine">Check: {props.stat} vs DC {props.dc}</div>

      <div className="fine" style={{ opacity: 0.75 }}>
        Dice view: <button className="cm_link" type="button" onClick={() => setUse3d((v) => !v)} style={{ padding: 0 }}>
          {use3d ? '3D' : '2D'} (tap to toggle)
        </button>
      </div>

      {phase === 'ready' ? (
        <button className="cm_button" onClick={doRoll}>
          {label}
        </button>
      ) : phase === 'rolling' ? (
        <button className="cm_button" disabled>
          {label}
        </button>
      ) : (
        <button className="cm_button" onClick={ok}>
          {label}
        </button>
      )}
    </div>
  )
}
