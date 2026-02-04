import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { ClassName, RaceName, SaveFile, Sex } from './types'
import { SCENARIO_PACKS, type ScenarioPack } from './scenarioPacks'
import { clearSave, loadSave, saveGame } from './storage'
import { clamp, modFromStat, pick, rollDie } from './utils'
import { ModalCard } from './components/ModalCard'
import { generateBackground, makeNewCharacter, nextTurnScene, resolveRoll, chooseToRoll, randomName, restartAdventure, xpForLevel, applyLeveling } from './game2'
import { enemyTurn, playerAttack, playerGuard, playerRun, cantripFor, spellFor, weaponForClass } from './combat'
import { longRest, shortRest } from './rest'
import { DiceModal } from './dice/DiceModal'

const RACES: RaceName[] = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Half-Elf', 'Half-Orc', 'Gnome', 'Tiefling']
const CLASSES: ClassName[] = ['Rogue', 'Wizard', 'Barbarian', 'Fighter', 'Paladin', 'Druid']
const ALIGNMENTS: Array<'Good' | 'Neutral' | 'Evil'> = ['Good', 'Neutral', 'Evil']

export default function App() {
  const [save, setSave] = useState<SaveFile>(() => {
    const s = loadSave() as any
    if (!s || s.version !== 4) return { version: 4, character: null, log: [], stage: { kind: 'idle' } }
    return s as SaveFile
  })

  const [sex, setSex] = useState<Sex>('Female')
  const [race, setRace] = useState<RaceName>('Human')
  const [className, setClassName] = useState<ClassName>('Rogue')
  const [alignment, setAlignment] = useState<'Good' | 'Neutral' | 'Evil'>('Neutral')
  const [charName, setCharName] = useState('')

  const [packsOpen, setPacksOpen] = useState(false)
  const [activePack, setActivePack] = useState<ScenarioPack>(() => SCENARIO_PACKS[0])

  const [restOpen, setRestOpen] = useState<null | { kind: 'short' } | { kind: 'long' }>(null)
  const [restDiceCount, setRestDiceCount] = useState(1)
  const [restRolls, setRestRolls] = useState<number[]>([])
  const [restConsequenceRoll, setRestConsequenceRoll] = useState<number | null>(null)
  const [restStoryRoll, setRestStoryRoll] = useState<number | null>(null)

  const [companionsOpen, setCompanionsOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [itemInspect, setItemInspect] = useState<string | null>(null)
  const [pressTimer, setPressTimer] = useState<number | null>(null)

  const [adWatching, setAdWatching] = useState(false)

  useEffect(() => {
    saveGame(save)
  }, [save])

  const character = save.character

  const canStart = useMemo(() => !!className && !!alignment && !!sex && !!race, [className, alignment, sex, race])

  function randomize() {
    const s = pick(['Male', 'Female'] as const)
    setSex(s)
    setRace(pick(RACES))
    setClassName(pick(CLASSES))
    setAlignment(pick(ALIGNMENTS))
    setCharName(randomName(s))
  }

  function randomizeName() {
    setCharName(randomName(sex))
  }

  function newGame() {
    const c = makeNewCharacter({ name: charName.trim() || undefined, sex, race, className, alignment })
    const bg = generateBackground(c)
    setSave({ version: 4, character: c, log: [{ id: `log_${Date.now()}`, day: 0, text: bg }], stage: { kind: 'idle' } })
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

    // Death check
    if (c.hp <= 0) {
      setSave((prev) => ({
        ...prev,
        character: c,
        log: [...prev.log, ...log, { id: `log_${Date.now()}_dead`, day: c.day, text: 'You died.' }],
        stage: { kind: 'dead' },
      }))
      return
    }

    // Some outcomes will trigger combat instead of direct HP loss.
    const combatToStart = (c.flags as any)?.__startCombat
    if (combatToStart && typeof combatToStart === 'object') {
      // clear flag
      const cc = { ...c, flags: { ...c.flags } }
      delete (cc.flags as any).__startCombat
      setSave((prev) => ({ ...prev, character: cc, log: [...prev.log, ...log], stage: { kind: 'combat', combat: combatToStart } }))
      return
    }

    setSave((prev) => ({ ...prev, character: c, log: [...prev.log, ...log], stage: { kind: 'outcome', scene, outcomeText } }))
  }

  function closeOutcome() {
    setSave((prev) => ({ ...prev, stage: { kind: 'idle' } }))
  }

  function combatXpReward(enemy: { name: string; maxHp: number }) {
    // Simple pacing: small fights still feel rewarding.
    // Tune later; baseline around 20–50 XP.
    return clamp(Math.round(enemy.maxHp * 3), 20, 60)
  }

  function finalizeCombatOutcome(input: {
    c: any
    combat: any
    actionText: string
    out: { text: string; nextSceneId?: string | null; logs?: string[] }
    kind: 'win' | 'flee'
  }) {
    let c2 = input.c

    // Apply reward for wins (and a smaller reward for fleeing).
    const base = combatXpReward(input.combat.enemy)
    const xpGain = input.kind === 'win' ? base : Math.max(10, Math.floor(base / 2))
    c2 = { ...c2, xp: (c2.xp ?? 0) + xpGain }

    if (typeof input.out.nextSceneId === 'string') {
      c2 = { ...c2, nextSceneId: input.out.nextSceneId }
    }

    // Leveling after XP changes.
    const leveled = applyLeveling(c2)
    c2 = leveled.c

    const extraLogs: any[] = []
    for (const t of input.out.logs ?? []) extraLogs.push({ id: `log_${Date.now()}_${Math.random()}`, day: c2.day, text: t })
    for (const t of leveled.logs) extraLogs.push({ id: `log_${Date.now()}_${Math.random()}`, day: c2.day, text: t })

    setSave((prev) => ({
      ...prev,
      character: c2,
      log: [
        ...prev.log,
        { id: `log_${Date.now()}`, day: c2.day, text: input.actionText },
        { id: `log_${Date.now()}_xp`, day: c2.day, text: `+${xpGain} XP.` },
        ...extraLogs,
      ],
      stage: { kind: 'outcome', scene: { id: 'combat', category: 'Combat', title: input.kind === 'win' ? 'Victory' : 'Escaped', body: '', choices: [] } as any, outcomeText: input.out.text },
    }))
  }

  function openShortRest() {
    if (!character) return
    setRestOpen({ kind: 'short' })
    setRestDiceCount(1)
    setRestRolls([])
    setRestConsequenceRoll(null)
    setRestStoryRoll(null)
  }

  function openLongRest() {
    if (!character) return
    setRestOpen({ kind: 'long' })
    setRestDiceCount(1)
    setRestRolls([])
    setRestConsequenceRoll(null)
    setRestStoryRoll(null)
  }

  function rollRestDice() {
    if (!character || !restOpen) return
    const count = Math.max(1, Math.min(restDiceCount, character.hitDiceRemaining || 1))
    const die = character.hitDieSize
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * die))
    setRestRolls(rolls)
    setRestConsequenceRoll(1 + Math.floor(Math.random() * 100))
    setRestStoryRoll(1 + Math.floor(Math.random() * 20))
  }

  function applyRest() {
    if (!character || !restOpen) return
    if (!restConsequenceRoll || !restStoryRoll) return

    if (restOpen.kind === 'short') {
      const used = restRolls.length ? restRolls : [1]
      const r = shortRest(character, used, restConsequenceRoll, restStoryRoll)
      if (r.c.hp <= 0) {
        setSave((prev) => ({ ...prev, character: r.c, log: [...prev.log, ...r.log, { id: `log_${Date.now()}_dead`, day: r.c.day, text: 'You died.' }], stage: { kind: 'dead' } }))
      } else {
        setSave((prev) => ({ ...prev, character: r.c, log: [...prev.log, ...r.log] }))
      }
    } else {
      const r = longRest(character, restConsequenceRoll, restStoryRoll)
      if (r.c.hp <= 0) {
        setSave((prev) => ({ ...prev, character: r.c, log: [...prev.log, ...r.log, { id: `log_${Date.now()}_dead`, day: r.c.day, text: 'You died.' }], stage: { kind: 'dead' } }))
      } else {
        setSave((prev) => ({ ...prev, character: r.c, log: [...prev.log, ...r.log] }))
      }
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
                setSave({ version: 4, character: null, log: [], stage: { kind: 'idle' } })
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
            <label>Race</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {RACES.map((r) => (
                <button
                  key={r}
                  className={race === r ? 'primary' : 'ghost'}
                  type="button"
                  onClick={() => setRace(r)}
                >
                  {r}
                </button>
              ))}
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
            {(() => {
              const dexMod = modFromStat(character.stats.DEX)
              const conMod = modFromStat(character.stats.CON)
              const init = dexMod
              const ac = 10 + dexMod
              const initials = character.name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]!.toUpperCase())
                .join('')

              const xpCur = xpForLevel(character.level)
              const xpNext = character.level >= 20 ? xpCur : xpForLevel(character.level + 1)
              const xpSpan = Math.max(1, xpNext - xpCur)
              const xpInto = Math.max(0, character.xp - xpCur)
              const xpPct = Math.max(0, Math.min(100, (xpInto / xpSpan) * 100))

              return (
                <>
                  <div className="dashHeader">
                    <div className="dashIdentity">
                      <div className="avatar" aria-hidden>
                        {initials}
                      </div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div className="dashName">{character.name}</div>
                        <div className="dashSub">
                          {character.sex} • {character.race} • {character.className} • Level {character.level}
                        </div>
                      </div>
                    </div>

                    <div className="dashHpBox">
                      <div className="dashHpLabel">HIT POINTS</div>
                      <div className="dashHpValue">
                        {character.hp}/{character.maxHp}
                      </div>
                      <div className="hpTrack" aria-label="HP bar">
                        <div
                          className="hpFill"
                          style={{
                            width: `${Math.max(0, Math.min(100, (character.hp / Math.max(1, character.maxHp)) * 100))}%`,
                            backgroundColor: (() => {
                              const pct = Math.max(0, Math.min(1, character.hp / Math.max(1, character.maxHp)))
                              const hue = Math.round(pct * 120)
                              return `hsl(${hue} 85% 50%)`
                            })(),
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="dashQuick">
                    <div className="dashStatBox">
                      <div className="dashStatTop">INIT</div>
                      <div className="dashStatBig">{init >= 0 ? `+${init}` : init}</div>
                    </div>
                    <div className="dashStatBox">
                      <div className="dashStatTop">AC</div>
                      <div className="dashStatBig">{ac}</div>
                    </div>
                  </div>

                  <div className="dashXp">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <div className="dashXpLabel">XP</div>
                      <div className="dashXpValue">
                        {character.level >= 20 ? `${character.xp}` : `${xpInto}/${xpSpan}`}
                      </div>
                    </div>
                    <div className="xpTrack" aria-label="XP bar">
                      <div className="xpFill" style={{ width: `${character.level >= 20 ? 100 : xpPct}%` }} />
                    </div>
                    <div className="fine" style={{ opacity: 0.7 }}>
                      CON mod {conMod >= 0 ? `+${conMod}` : conMod} • Hit Dice {character.hitDiceRemaining}/{character.hitDiceMax}
                    </div>
                  </div>

                  <div className="dashAbilities">
                    {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map((k) => {
                      const score = character.stats[k]
                      const mod = modFromStat(score)
                      return (
                        <div key={k} className="abilityCard">
                          <div className="abilityName">{k}</div>
                          <div className="abilityMod">{mod >= 0 ? `+${mod}` : mod}</div>
                          <div className="abilityScore">{score}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
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
              <DiceModal
                stat={save.stage.pending.stat}
                dc={save.stage.pending.dc}
                bonus={modFromStat(character.stats[save.stage.pending.stat])}
                onRoll={applyRoll}
              />
              <div className="fine" style={{ marginTop: 8 }}>
                (d20 + your stat modifier. Natural 1 always fails.)
              </div>
            </ModalCard>
          ) : null}

          {save.stage.kind === 'combat' ? (
            <ModalCard category={'Combat'} title={`${save.stage.combat.enemy.name} • Round ${save.stage.combat.round}`}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 900 }}>Enemy HP</div>
                    <div className="fine">{save.stage.combat.enemy.hp}/{save.stage.combat.enemy.maxHp} • AC {save.stage.combat.enemy.ac}</div>
                  </div>
                  <div className="hpTrack">
                    <div
                      className="hpFill"
                      style={{
                        width: `${Math.max(0, Math.min(100, (save.stage.combat.enemy.hp / Math.max(1, save.stage.combat.enemy.maxHp)) * 100))}%`,
                        backgroundColor: (() => {
                          const pct = Math.max(0, Math.min(1, save.stage.combat.enemy.hp / Math.max(1, save.stage.combat.enemy.maxHp)))
                          const hue = Math.round(pct * 120)
                          return `hsl(${hue} 85% 45%)`
                        })(),
                      }}
                    />
                  </div>
                </div>

                <div className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 900 }}>Enemy intent</div>
                    <div className="fine">{save.stage.combat.enemy.intent.label}</div>
                  </div>
                  <div className="fine" style={{ opacity: 0.85 }}>
                    (They are about to: {save.stage.combat.enemy.intent.kind})
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <button
                    className="cm_button"
                    onClick={() => {
                      if (!character) return
                      if (save.stage.kind !== 'combat') return
                      const r = playerAttack(character, save.stage.combat, 'weapon')
                      // win?
                      if (r.combat.enemy.hp <= 0) {
                        finalizeCombatOutcome({ c: r.c, combat: r.combat, actionText: r.text, out: r.combat.onWin, kind: 'win' })
                        return
                      }
                      // enemy turn
                      const e = enemyTurn(r.c, { ...r.combat, enemy: { ...r.combat.enemy } })
                      // lose?
                      if (e.c.hp <= 0) {
                        const c2 = e.c
                        setSave((prev) => ({
                          ...prev,
                          character: c2,
                          log: [...prev.log, { id: `log_${Date.now()}`, day: c2.day, text: r.text }, { id: `log_${Date.now()}_e`, day: c2.day, text: e.text }, { id: `log_${Date.now()}_dead`, day: c2.day, text: 'You died.' }],
                          stage: { kind: 'dead' },
                        }))
                        return
                      }
                      setSave((prev) => ({
                        ...prev,
                        character: e.c,
                        log: [...prev.log, { id: `log_${Date.now()}`, day: e.c.day, text: r.text }, { id: `log_${Date.now()}_e`, day: e.c.day, text: e.text }],
                        stage: { kind: 'combat', combat: e.combat },
                      }))
                    }}
                  >
                    Attack ({weaponForClass(character.className).name})
                  </button>

                  {cantripFor(character) ? (
                    <button
                      className="cm_button"
                      onClick={() => {
                        if (!character) return
                        if (save.stage.kind !== 'combat') return
                        const r = playerAttack(character, save.stage.combat, 'cantrip')
                        if (r.combat.enemy.hp <= 0) {
                          finalizeCombatOutcome({ c: r.c, combat: r.combat, actionText: r.text, out: r.combat.onWin, kind: 'win' })
                          return
                        }
                        const e = enemyTurn(r.c, { ...r.combat, enemy: { ...r.combat.enemy } })
                        setSave((prev) => ({
                          ...prev,
                          character: e.c,
                          log: [...prev.log, { id: `log_${Date.now()}`, day: e.c.day, text: r.text }, { id: `log_${Date.now()}_e`, day: e.c.day, text: e.text }],
                          stage: { kind: 'combat', combat: e.combat },
                        }))
                      }}
                    >
                      Cantrip ({cantripFor(character)!.name})
                    </button>
                  ) : null}

                  {spellFor(character) ? (
                    <button
                      className="cm_button"
                      onClick={() => {
                        if (!character) return
                        if (save.stage.kind !== 'combat') return
                        const r = playerAttack(character, save.stage.combat, 'spell')
                        if (r.text === 'No spell slots left.') {
                          setSave((prev) => ({ ...prev, log: [...prev.log, { id: `log_${Date.now()}`, day: character.day, text: r.text }] }))
                          return
                        }
                        if (r.combat.enemy.hp <= 0) {
                          finalizeCombatOutcome({ c: r.c, combat: r.combat, actionText: r.text, out: r.combat.onWin, kind: 'win' })
                          return
                        }
                        const e = enemyTurn(r.c, { ...r.combat, enemy: { ...r.combat.enemy } })
                        setSave((prev) => ({
                          ...prev,
                          character: e.c,
                          log: [...prev.log, { id: `log_${Date.now()}`, day: e.c.day, text: r.text }, { id: `log_${Date.now()}_e`, day: e.c.day, text: e.text }],
                          stage: { kind: 'combat', combat: e.combat },
                        }))
                      }}
                    >
                      Spell ({spellFor(character)!.name}) • Slots {character.spellSlotsRemaining}
                    </button>
                  ) : null}

                  <button
                    className="cm_button"
                    onClick={() => {
                      if (!character) return
                      if (save.stage.kind !== 'combat') return
                      const g = playerGuard(save.stage.combat)
                      const e = enemyTurn(character, g.combat)
                      if (e.c.hp <= 0) {
                        const c2 = e.c
                        setSave((prev) => ({
                          ...prev,
                          character: c2,
                          log: [...prev.log, { id: `log_${Date.now()}`, day: c2.day, text: g.text }, { id: `log_${Date.now()}_e`, day: c2.day, text: e.text }, { id: `log_${Date.now()}_dead`, day: c2.day, text: 'You died.' }],
                          stage: { kind: 'dead' },
                        }))
                        return
                      }
                      setSave((prev) => ({
                        ...prev,
                        character: e.c,
                        log: [...prev.log, { id: `log_${Date.now()}`, day: e.c.day, text: g.text }, { id: `log_${Date.now()}_e`, day: e.c.day, text: e.text }],
                        stage: { kind: 'combat', combat: e.combat },
                      }))
                    }}
                  >
                    Guard
                  </button>

                  <button
                    className="cm_button"
                    onClick={() => {
                      if (!character) return
                      if (save.stage.kind !== 'combat') return
                      const r = playerRun(character, save.stage.combat)
                      if (r.combat.fleeProgress >= 100) {
                        finalizeCombatOutcome({ c: character, combat: r.combat, actionText: r.text, out: r.combat.onFlee, kind: 'flee' })
                        return
                      }
                      const e = enemyTurn(character, r.combat)
                      setSave((prev) => ({
                        ...prev,
                        character: e.c,
                        log: [...prev.log, { id: `log_${Date.now()}`, day: e.c.day, text: r.text }, { id: `log_${Date.now()}_e`, day: e.c.day, text: e.text }],
                        stage: { kind: 'combat', combat: e.combat },
                      }))
                    }}
                  >
                    Run (progress {save.stage.combat.fleeProgress}%)
                  </button>
                </div>
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

          {save.stage.kind === 'dead' ? (
            <ModalCard category={'Death'} title={'You died.'}>
              <div style={{ marginBottom: 10 }}>
                Your HP hit zero.
              </div>
              <div className="fine" style={{ marginBottom: 12, opacity: 0.85 }}>
                (Revive is an ad prototype for now. “New adventure” will be premium later.)
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <button
                  className="cm_button"
                  disabled={adWatching}
                  onClick={() => {
                    if (!character) return
                    if (adWatching) return

                    // Prototype ad flow.
                    setAdWatching(true)
                    setTimeout(() => {
                      setAdWatching(false)

                      if (character.hitDiceRemaining <= 0) {
                        setSave((prev) => ({
                          ...prev,
                          log: [...prev.log, { id: `log_${Date.now()}_nohd`, day: character.day, text: 'No hit dice remaining. You cannot revive.' }],
                        }))
                        return
                      }

                      const conMod = modFromStat(character.stats.CON)
                      const heal = Math.max(1, rollDie(character.hitDieSize) + conMod)
                      const nextHp = clamp(heal, 1, character.maxHp)

                      const revived = {
                        ...character,
                        hp: nextHp,
                        hitDiceRemaining: clamp(character.hitDiceRemaining - 1, 0, character.hitDiceMax),
                      }

                      setSave((prev) => ({
                        ...prev,
                        character: revived,
                        log: [...prev.log, { id: `log_${Date.now()}_revive`, day: revived.day, text: `You revive with ${nextHp} HP.` }],
                        stage: { kind: 'idle' },
                      }))
                    }, 1200)
                  }}
                >
                  {adWatching ? 'Watching ad…' : `Watch ad → roll 1d${character.hitDieSize} to revive`}
                </button>

                <button
                  className="cm_button"
                  onClick={() => {
                    if (confirm('Die forever? This will end the run.')) {
                      clearSave()
                      setSave({ version: 4, character: null, log: [], stage: { kind: 'idle' } })
                    }
                  }}
                >
                  Die forever
                </button>

                <button
                  className="cm_button"
                  onClick={() => {
                    if (!character) return
                    const next = restartAdventure(character)
                    const bg = generateBackground(next)
                    setSave({
                      version: 4,
                      character: next,
                      log: [
                        { id: `log_${Date.now()}_newadv`, day: 0, text: 'A new adventure begins.' },
                        { id: `log_${Date.now()}_bg`, day: 0, text: bg },
                      ],
                      stage: { kind: 'idle' },
                    })
                  }}
                >
                  Start a new adventure (same character)
                </button>
              </div>
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
                    <button className="cm_button" onClick={applyRest} disabled={!restConsequenceRoll || !restStoryRoll}>
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
                    <button className="cm_button" onClick={applyRest} disabled={!restConsequenceRoll || !restStoryRoll}>
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
              {(() => {
                const weapon = weaponForClass(character.className)
                const carried = character.inventory ?? []

                const ITEM_LORE: Record<string, { title: string; body: string }> = {
                  'Sigil-Shard': {
                    title: 'Sigil-Shard',
                    body: 'A broken key-segment pried from a dwarven socket. It hums faintly when held near carved runes.',
                  },
                  'Harmonic Lens': {
                    title: 'Harmonic Lens',
                    body: 'A bronze lens etched like a map. It warms when certain tones ring nearby—as if it remembers a route.',
                  },
                  'Anchor Seal': {
                    title: 'Anchor Seal',
                    body: 'Dense and warm as forged truth. The air steadies around it, like the mountain is being reminded how to hold itself.',
                  },
                  'Watch Writ (stamped)': {
                    title: 'Watch Writ',
                    body: 'A stamped writ from the Mountain Watch. It opens doors that would otherwise stay politely closed.',
                  },
                }

                const inspect = (item: string) => {
                  setItemInspect(item)
                }

                const longPressHandlers = (item: string) => ({
                  onPointerDown: () => {
                    if (pressTimer) window.clearTimeout(pressTimer)
                    const t = window.setTimeout(() => inspect(item), 450)
                    setPressTimer(t)
                  },
                  onPointerUp: () => {
                    if (pressTimer) window.clearTimeout(pressTimer)
                    setPressTimer(null)
                  },
                  onPointerCancel: () => {
                    if (pressTimer) window.clearTimeout(pressTimer)
                    setPressTimer(null)
                  },
                  onPointerLeave: () => {
                    if (pressTimer) window.clearTimeout(pressTimer)
                    setPressTimer(null)
                  },
                })

                // Simple "equipped" heuristics (MVP):
                // - Weapon is determined by class.
                // - Up to 3 special items appear as equipped relics.
                const relics = carried.filter((x) => x && x !== weapon.name).slice(0, 3)
                const otherItems = carried.filter((x) => x && x !== weapon.name && !relics.includes(x))

                return (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div className="equipGrid">
                      <div className="equipSlot equipWeapon">
                        <div className="equipLabel">Weapon</div>
                        <div className="equipItem">{weapon.name}</div>
                      </div>
                      <div className="equipSlot equipArmor">
                        <div className="equipLabel">Armor</div>
                        <div className="equipItem equipEmpty">None</div>
                      </div>
                      <div className="equipSlot equipOffhand">
                        <div className="equipLabel">Offhand</div>
                        <div className="equipItem equipEmpty">Empty</div>
                      </div>
                      <div className="equipSlot equipRelic1">
                        <div className="equipLabel">Relic</div>
                        <div className={relics[0] ? 'equipItem' : 'equipItem equipEmpty'}>{relics[0] ?? 'Empty'}</div>
                      </div>
                      <div className="equipSlot equipRelic2">
                        <div className="equipLabel">Relic</div>
                        <div className={relics[1] ? 'equipItem' : 'equipItem equipEmpty'}>{relics[1] ?? 'Empty'}</div>
                      </div>
                      <div className="equipSlot equipRelic3">
                        <div className="equipLabel">Relic</div>
                        <div className={relics[2] ? 'equipItem' : 'equipItem equipEmpty'}>{relics[2] ?? 'Empty'}</div>
                      </div>
                    </div>

                    <div>
                      <div className="fine" style={{ marginBottom: 8, opacity: 0.85 }}>
                        Other items
                      </div>
                      {otherItems.length === 0 ? (
                        <div className="fine">No unequipped items.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {otherItems.map((it, idx) => (
                            <div
                              key={`${it}_${idx}`}
                              className="bar"
                              style={{ justifyContent: 'space-between' }}
                              {...longPressHandlers(it)}
                              title="Long press for details"
                            >
                              <div style={{ fontWeight: 800 }}>{it}</div>
                              <div className="fine" style={{ opacity: 0.7 }}>Hold</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {itemInspect ? (
                        <div style={{ marginTop: 12 }}>
                          <div className="bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 900 }}>{(ITEM_LORE[itemInspect]?.title ?? itemInspect)}</div>
                              <button className="ghost" onClick={() => setItemInspect(null)}>Close</button>
                            </div>
                            <div className="fine" style={{ opacity: 0.9 }}>
                              {ITEM_LORE[itemInspect]?.body ?? 'No additional details yet.'}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })()}

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
