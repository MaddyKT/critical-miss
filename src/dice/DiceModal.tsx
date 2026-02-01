import { useMemo, useState } from 'react'
import { Dice2D } from './Dice2D'

export function DiceModal(props: {
  stat: string
  dc: number
  bonus: number
  onRoll: (roll: number) => void
}) {
  const [phase, setPhase] = useState<'ready' | 'rolling' | 'done'>('ready')
  const [roll, setRoll] = useState<number | null>(null)

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

  const total = roll == null ? null : roll + props.bonus

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
          <Dice2D value={roll ?? 20} rolling={phase === 'rolling'} onSettled={settled} />
        </div>
        <div style={{ marginTop: 8, fontWeight: 900, fontSize: 32 }}>{phase === 'done' && roll != null ? roll : ''}</div>
      </div>

      <div className="fine">
        Check: <b>{props.stat}</b> vs DC <b>{props.dc}</b>
      </div>
      <div className="fine" style={{ opacity: 0.85 }}>
        Bonus: {props.bonus >= 0 ? `+${props.bonus}` : props.bonus}
        {total != null ? (
          <>
            {' '}• Total: <b>{total}</b> {total >= props.dc && roll !== 1 ? '(success)' : '(fail)'}
          </>
        ) : null}
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
