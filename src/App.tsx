import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { ClassName, SaveFile, Sex } from './types'
import { SCENARIO_PACKS, type ScenarioPack } from './scenarioPacks'
import { clearSave, loadSave, saveGame } from './storage'
import { pick } from './utils'
import { ModalCard } from './components/ModalCard'
import { generateBackground, makeNewCharacter, nextTurnScene, resolveRoll, chooseToRoll, randomName } from './game2'
import { longRest, shortRest } from './rest'
import { DiceModal } from './dice/DiceModal'

const CLASSES: ClassName[] = ['Rogue', 'Wizard', 'Barbarian', 'Fighter', 'Paladin', 'Druid']
const ALIGNMENTS: Array<'Good' | 'Neutral' | 'Evil'> = ['Good', 'Neutral', 'Evil']

export default function App() {
  const [save, setSave] = useState<SaveFile>(() => {
    const s = loadSave() as any
    if (!s || s.version !== 3) return { version: 3, character: null, log: [], stage: { kind: 'idle' } }
    return s as SaveFile
  })

  const [sex, setSex] = useState<Sex>('Female')
  const [className, setClassName] = useState<ClassName>('Rogue')
  const [alignment, setAlignment] = useState<'Good' | 'Neutral' | 'Evil'>('Neutral')
  const [charName, setCharName] = useState('')

  const [packsOpen, setPacksOpen] = useState(false)
  const [activePack, setActivePack] = useState<ScenarioPack>(() => SCENARIO_PACKS[0])

  const [restOpen, setRestOpen] = useState<null | { kind: 'short' } | { kind: 'long' }>(null)
  const [restDiceCount, setRestDiceCount] = useState(1)
  const [restRolls, setRestRolls] = useState<number[]>([])
  const [restConsequenceRoll, setRestConsequenceRoll] = useState<number | null>(null)

  const [companionsOpen, setCompanionsOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)

  useEffect(() => {
    saveGame(save)
  }, [save])

  const character = save.character

  const canStart = useMemo(() => !!className && !!alignment && !!sex, [className, alignment, sex])

  function randomize() {
    const s = pick(['Male', 'Female'] as const)
    setSex(s)
    setClassName(pick(CLASSES))
    setAlignment(pick(ALIGNMENTS))
    setCharName(randomName(s))
  }

  function randomizeName() {
    setCharName(randomName(sex))
  }

  function newGame() {
    const c = makeNewCharacter({ name: charName.trim() || undefined, sex, className, alignment })
    const bg = generateBackground(c)
    setSave({ version: 3, character: c, log: [{ id: `log_${Date.now()}`, day: 0, text: bg }], stage: { kind: 'idle' } })
  }

  function nextTurn() {
    if (!character) return
    const scene = nextTurnScene(character)
    setSave((prev) => ({ ...prev, stage: { kind: 'scene', scene } }))
  }

  function pickSceneChoice(choiceId: string) {
    if (!character) return
    if (save.stage.kind !== 'scene') return
    const scene = save.stage.scene
    const pending = chooseToRoll(scene, choiceId)
    setSave((prev) => ({ ...prev, stage: { kind: 'roll', scene, pending } }))
  }

  function surpriseMe() {
    if (save.stage.kind !== 'scene') return
    const choice = pick(save.stage.scene.choices)
    pickSceneChoice(choice.id)
  }

  function applyRoll(roll: number) {
    if (!character) return
    if (save.stage.kind !== 'roll') return
    const scene = save.stage.scene
    const pending = save.stage.pending
    const { c, log, outcomeText } = resolveRoll(character, scene, pending, roll)
    setSave((prev) => ({ ...prev, character: c, log: [...prev.log, ...log], stage: { kind: 'outcome', scene, outcomeText } }))
  }

  function closeOutcome() {
    setSave((prev) => ({ ...prev, stage: { kind: 'idle' } }))
  }

  function openShortRest() {
    if (!character) return
    setRestOpen({ kind: 'short' })
    setRestDiceCount(1)
    setRestRolls([])
    setRestConsequenceRoll(null)
  }

  function openLongRest() {
    if (!character) return
    setRestOpen({ kind: 'long' })
    setRestDiceCount(1)
    setRestRolls([])
    setRestConsequenceRoll(null)
  }

  function rollRestDice() {
    if (!character || !restOpen) return
    const count = Math.max(1, Math.min(restDiceCount, character.hitDiceRemaining || 1))
    const die = character.hitDieSize
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * die))
    setRestRolls(rolls)
    setRestConsequenceRoll(1 + Math.floor(Math.random() * 100))
  }

  function applyRest() {
    if (!character || !restOpen) return
    if (!restConsequenceRoll) return

    if (restOpen.kind === 'short') {
      const used = restRolls.length ? restRolls : [1]
      const r = shortRest(character, used, restConsequenceRoll)
      setSave((prev) => ({ ...prev, character: r.c, log: [...prev.log, ...r.log] }))
    } else {
      const r = longRest(character, restConsequenceRoll)
      setSave((prev) => ({ ...prev, character: r.c, log: [...prev.log, ...r.log] }))
    }

    setRestOpen(null)
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="title">Critical Miss</div>
          <div className="subtitle">A darkly funny campaign life sim (prototype)</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="ghost" type="button" onClick={() => setPacksOpen(true)}>
            Scenario packs
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (confirm('Wipe save and restart?')) {
                clearSave()
                setSave({ version: 3, character: null, log: [], stage: { kind: 'idle' } })
              }
            }}
          >
            Reset
          </button>
        </div>
      </header>

      {!character ? (
        <main className="panel">
          <h2>New campaign</h2>

          <div className="row">
            <label>Name</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                placeholder="e.g., Nyx Underfoot"
                style={{ flex: 1 }}
              />
              <button className="ghost" type="button" onClick={randomizeName}>
                Random
              </button>
            </div>
          </div>

          <div className="row">
            <label>Sex</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className={sex === 'Female' ? 'primary' : 'ghost'}
                type="button"
                onClick={() => {
                  setSex('Female')
                  if (!charName.trim()) setCharName(randomName('Female'))
                }}
                style={{ flex: 1 }}
              >
                Female
              </button>
              <button
                className={sex === 'Male' ? 'primary' : 'ghost'}
                type="button"
                onClick={() => {
                  setSex('Male')
                  if (!charName.trim()) setCharName(randomName('Male'))
                }}
                style={{ flex: 1 }}
              >
                Male
              </button>
            </div>
          </div>

          <div className="row">
            <label>Class</label>
            <select value={className} onChange={(e) => setClassName(e.target.value as ClassName)}>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <label>Alignment</label>
            <select value={alignment} onChange={(e) => setAlignment(e.target.value as any)}>
              <option value="Good">Good</option>
              <option value="Neutral">Neutral</option>
              <option value="Evil">Evil</option>
            </select>
          </div>

          <div className="row" style={{ display: 'flex', gap: 10 }}>
            <button className="ghost" type="button" onClick={randomize} style={{ flex: 1 }}>
              Randomize
            </button>
            <button className="primary" onClick={newGame} disabled={!canStart} style={{ flex: 2, opacity: canStart ? 1 : 0.6 }}>
              Start
            </button>
          </div>

          <div className="fine">Selected: {sex} • {className} • {alignment}</div>
        </main>
      ) : (
        <main className="game">
          <section className="sheet">
            <div className="nameRow">
              <div className="charName">{character.name}</div>
              <div className="pill">
                L{character.level} {character.className}
              </div>
            </div>
            <div className="bars">
              <div className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="barLabel">HP</div>
                  <div className="barValue">
                    {character.hp}/{character.maxHp}
                  </div>
                </div>
                <div className="hpTrack" aria-label="HP bar">
                  <div
                    className="hpFill"
                    style={{
                      width: `${Math.max(0, Math.min(100, (character.hp / Math.max(1, character.maxHp)) * 100))}%`,
                      backgroundColor: (() => {
                        const pct = Math.max(0, Math.min(1, character.hp / Math.max(1, character.maxHp)))
                        const hue = Math.round(pct * 120) // 120=green -> 0=red
                        return `hsl(${hue} 85% 50%)`
                      })(),
                    }}
                  />
                </div>
              </div>
              <div className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="barLabel">XP</div>
                  <div className="barValue">{character.xp}</div>
                </div>
                <div className="xpTrack" aria-label="XP bar">
                  {(() => {
                    const perLevel = 20 + (character.level - 1) * 10
                    const into = ((character.xp % perLevel) + perLevel) % perLevel
                    const pct = Math.max(0, Math.min(100, (into / perLevel) * 100))
                    return <div className="xpFill" style={{ width: `${pct}%` }} />
                  })()}
                </div>
                <div className="fine" style={{ opacity: 0.65 }}>Level {character.level} • Progress to next: {(() => {
                  const perLevel = 20 + (character.level - 1) * 10
                  const into = ((character.xp % perLevel) + perLevel) % perLevel
                  return `${into}/${perLevel}`
                })()}</div>
              </div>
              <div className="bar">
                <div className="barLabel">Gold</div>
                <div className="barValue">{character.gold}</div>
              </div>
              <div className="bar">
                <div className="barLabel">Day</div>
                <div className="barValue">{character.day}</div>
              </div>
            </div>
          </section>

          <section className="party">
            <div className="partyTitle">Companions</div>
            {character.companions.length === 0 ? (
              <div className="muted">None yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {character.companions.map((c) => (
                  <div key={c.id} className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800 }}>{c.name}</div>
                      <div className="fine">{c.relationship}/100</div>
                    </div>
                    <div className="hpTrack" aria-label="Relationship bar">
                      <div className="hpFill" style={{ width: `${Math.max(0, Math.min(100, c.relationship))}%`, background: 'linear-gradient(90deg, rgba(124,92,255,0.95), rgba(41,209,125,0.95))' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="log">
            <div className="logHeader">Campaign log</div>
            <div className="logList">
              {save.log.slice(-50).map((l) => (
                <div key={l.id} className="logItem">
                  <span className="logDay">Day {l.day}:</span> {l.text}
                </div>
              ))}
            </div>
            <div className="choices" style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="choice" onClick={nextTurn}>
                  + Turn
                </button>
                <button className="choice" onClick={openShortRest} disabled={save.stage.kind !== 'idle' || character.hitDiceRemaining <= 0}>
                  Short Rest ({character.hitDiceRemaining} HD)
                </button>
                <button className="choice" onClick={openLongRest} disabled={save.stage.kind !== 'idle'}>
                  Long Rest
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="choice" type="button" onClick={() => setCompanionsOpen(true)}>
                  Companions
                </button>
                <button className="choice" type="button" onClick={() => setInventoryOpen(true)}>
                  Inventory
                </button>
              </div>
            </div>
          </section>

          {save.stage.kind === 'scene' ? (
            <ModalCard category={save.stage.scene.category} title={save.stage.scene.title}>
              <div style={{ marginBottom: 10 }}>{save.stage.scene.body}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {save.stage.scene.choices.map((c) => (
                  <button key={c.id} className="cm_button" onClick={() => pickSceneChoice(c.id)}>
                    {c.text}
                  </button>
                ))}
                <button className="cm_link" onClick={surpriseMe}>
                  🎲 Surprise me
                </button>
              </div>
            </ModalCard>
          ) : null}

          {save.stage.kind === 'roll' ? (
            <ModalCard category={save.stage.scene.category} title={'Roll'}>
              <DiceModal stat={save.stage.pending.stat} dc={save.stage.pending.dc} onRoll={applyRoll} />
              <div className="fine" style={{ marginTop: 8 }}>
                (3D model is a real d20; number overlay is the official result.)
              </div>
            </ModalCard>
          ) : null}

          {save.stage.kind === 'outcome' ? (
            <ModalCard category={save.stage.scene.category} title={'Outcome'}>
              <div style={{ marginBottom: 12 }}>{save.stage.outcomeText}</div>
              <button className="cm_button" onClick={closeOutcome}>
                OK
              </button>
            </ModalCard>
          ) : null}

          {restOpen ? (
            <ModalCard category={'Rest'} title={restOpen.kind === 'short' ? 'Short Rest' : 'Long Rest'}>
              {restOpen.kind === 'short' ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    Spend hit dice to heal. You have <b>{character.hitDiceRemaining}</b> remaining.
                  </div>

                  <div className="fine" style={{ marginBottom: 8 }}>
                    Healing roll: {restDiceCount}d{character.hitDieSize} + CON mod per die.
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <label className="fine" style={{ minWidth: 70 }}>Dice</label>
                    <input
                      type="range"
                      min={1}
                      max={Math.max(1, character.hitDiceRemaining)}
                      value={Math.min(restDiceCount, Math.max(1, character.hitDiceRemaining))}
                      onChange={(e) => setRestDiceCount(Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <div style={{ width: 44, textAlign: 'right', fontWeight: 900 }}>{Math.min(restDiceCount, Math.max(1, character.hitDiceRemaining))}</div>
                  </div>

                  {restRolls.length ? (
                    <div className="fine" style={{ marginBottom: 10 }}>
                      Rolled: {restRolls.join(', ')}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="cm_button" onClick={rollRestDice}>Roll</button>
                    <button className="cm_button" onClick={applyRest} disabled={!restConsequenceRoll}>
                      Apply
                    </button>
                    <button className="cm_link" onClick={() => setRestOpen(null)}>Cancel</button>
                  </div>

                  <div className="fine" style={{ marginTop: 10, opacity: 0.8 }}>
                    Short rest advances time and has a small chance of consequences.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 10 }}>
                    Long rest fully heals and restores spell slots, but is riskier.
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="cm_button" onClick={rollRestDice}>Roll consequence</button>
                    <button className="cm_button" onClick={applyRest} disabled={!restConsequenceRoll}>
                      Long Rest
                    </button>
                    <button className="cm_link" onClick={() => setRestOpen(null)}>Cancel</button>
                  </div>

                  <div className="fine" style={{ marginTop: 10, opacity: 0.8 }}>
                    Long rest advances more time and can trigger consequences.
                  </div>
                </>
              )}
            </ModalCard>
          ) : null}

          {companionsOpen ? (
            <ModalCard category={'Companions'} title={'Companions'}>
              {character.companions.length === 0 ? (
                <div className="fine">No companions yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {character.companions.map((c) => (
                    <div key={c.id} className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 900 }}>{c.name}</div>
                        <div className="fine">{c.relationship}/100</div>
                      </div>
                      <div className="hpTrack" aria-label="Relationship bar">
                        <div
                          className="hpFill"
                          style={{
                            width: `${Math.max(0, Math.min(100, c.relationship))}%`,
                            backgroundColor: `hsl(${Math.round((c.relationship / 100) * 120)} 70% 50%)`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <button className="cm_button" onClick={() => setCompanionsOpen(false)}>Close</button>
              </div>
            </ModalCard>
          ) : null}

          {inventoryOpen ? (
            <ModalCard category={'Inventory'} title={'Inventory'}>
              {character.inventory.length === 0 ? (
                <div className="fine">Your inventory is empty (for now).</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {character.inventory.map((it, idx) => (
                    <div key={`${it}_${idx}`} className="bar" style={{ justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 800 }}>{it}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <button className="cm_button" onClick={() => setInventoryOpen(false)}>Close</button>
              </div>
            </ModalCard>
          ) : null}
        </main>
      )}

      {packsOpen ? (
        <div className="cm_modalBackdrop" role="dialog" aria-modal="true" onMouseDown={() => setPacksOpen(false)}>
          <div className="cm_modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cm_modalTop">
              <div>
                <div className="cm_modalTitle">Scenario packs</div>
                <div className="fine">Browse drafts without integrating them into gameplay yet.</div>
              </div>
              <button className="ghost" onClick={() => setPacksOpen(false)}>
                Close
              </button>
            </div>

            <div className="cm_packs">
              <div className="cm_packList">
                {SCENARIO_PACKS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={activePack.id === p.id ? 'primary' : 'ghost'}
                    onClick={() => setActivePack(p)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 800 }}>{p.title}</div>
                    <div className="fine" style={{ opacity: 0.8 }}>{p.category}</div>
                  </button>
                ))}
              </div>

              <div className="cm_packPreview">
                <div className="cm_packHeader">
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{activePack.title}</div>
                    <div className="fine" style={{ opacity: 0.8 }}>{activePack.category}</div>
                  </div>
                  <button
                    className="ghost"
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(activePack.text)
                        alert('Copied to clipboard')
                      } catch {
                        prompt('Copy pack text:', activePack.text)
                      }
                    }}
                  >
                    Copy
                  </button>
                </div>
                <pre className="cm_pre">{activePack.text}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
