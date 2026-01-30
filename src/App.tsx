import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { ClassName, SaveFile, Sex } from './types'
import { SCENARIO_PACKS, type ScenarioPack } from './scenarioPacks'
import { clearSave, loadSave, saveGame } from './storage'
import { pick } from './utils'
import { ModalCard } from './components/ModalCard'
import { generateBackground, makeNewCharacter, nextTurnScene, resolveRoll, chooseToRoll } from './game2'
import { DiceModal } from './dice/DiceModal'

const CLASSES: ClassName[] = ['Rogue', 'Wizard', 'Barbarian', 'Fighter', 'Paladin', 'Druid']
const ALIGNMENTS: Array<'Good' | 'Neutral' | 'Evil'> = ['Good', 'Neutral', 'Evil']

export default function App() {
  const [save, setSave] = useState<SaveFile>(() => {
    const s = loadSave() as SaveFile
    if (!s || s.version !== 2) return { version: 2, character: null, log: [], stage: { kind: 'idle' } }
    return s
  })

  const [sex, setSex] = useState<Sex>('Female')
  const [className, setClassName] = useState<ClassName>('Rogue')
  const [alignment, setAlignment] = useState<'Good' | 'Neutral' | 'Evil'>('Neutral')

  const [packsOpen, setPacksOpen] = useState(false)
  const [activePack, setActivePack] = useState<ScenarioPack>(() => SCENARIO_PACKS[0])

  useEffect(() => {
    saveGame(save)
  }, [save])

  const character = save.character

  const canStart = useMemo(() => !!className && !!alignment && !!sex, [className, alignment, sex])

  function randomize() {
    setSex(pick(['Male', 'Female'] as const))
    setClassName(pick(CLASSES))
    setAlignment(pick(ALIGNMENTS))
  }

  function newGame() {
    const c = makeNewCharacter({ sex, className, alignment })
    const bg = generateBackground(c)
    setSave({ version: 2, character: c, log: [{ id: `log_${Date.now()}`, day: 0, text: bg }], stage: { kind: 'idle' } })
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
                setSave({ version: 2, character: null, log: [], stage: { kind: 'idle' } })
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
            <label>Sex</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className={sex === 'Female' ? 'primary' : 'ghost'} type="button" onClick={() => setSex('Female')} style={{ flex: 1 }}>
                Female
              </button>
              <button className={sex === 'Male' ? 'primary' : 'ghost'} type="button" onClick={() => setSex('Male')} style={{ flex: 1 }}>
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
              <div className="bar">
                <div className="barLabel">HP</div>
                <div className="barValue">
                  {character.hp}/{character.maxHp}
                </div>
              </div>
              <div className="bar">
                <div className="barLabel">XP</div>
                <div className="barValue">{character.xp}</div>
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

          <section className="log">
            <div className="logHeader">Campaign log</div>
            <div className="logList">
              {save.log.slice(-50).map((l) => (
                <div key={l.id} className="logItem">
                  <span className="logDay">Day {l.day}:</span> {l.text}
                </div>
              ))}
            </div>
            <div className="choices">
              <button className="choice" onClick={nextTurn}>
                + Turn
              </button>
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
