# Critical Miss — Scenario Schema (draft)

Goal: BitLife-like freshness via *lots* of short scenes that can chain into mini-arcs.

## Scene node
A scene is a single prompt + 2–5 choices.

Recommended fields:
- `id`: stable string id (`"tavern.rumors"`, `"dungeon.mimic_001"`)
- `category`: UI label ("Tavern", "Dungeon", "Court", "Road", ...)
- `title`: short headline
- `body`: 1–3 short paragraphs
- `tags`: optional ("combat", "social", "travel", "romance", "crime", "magic")
- `weight`: optional number for random selection
- `gates`: optional prerequisites
  - `minDay`, `maxDay`
  - required flags (e.g. `flags.hasMap === true`)
  - stat/class/alignment gates
- `choices`: array of choices

## Choice
- `id`: unique within scene
- `text`: button text
- `stat`: one of `STR/DEX/CON/INT/WIS/CHA`
- `dc`: integer difficulty
- `crit`: optional (on natural 20 / natural 1) special text/effects
- `onSuccess`:
  - `text`: outcome narrative
  - `effects`: hp/xp/gold changes, flags set/unset, party changes
  - `next`: optional next scene id (continue an arc)
- `onFail`:
  - same as above

## Effects (suggested)
- `hpDelta`, `xpDelta`, `goldDelta`
- `flagsSet: Record<string, boolean | string | number>`
- `flagsUnset: string[]`
- `addToParty`, `removeFromParty`
- `status: "cursed" | "blessed" | ...` (later)

## Notes on BitLife-like feel
- Each choice should *feel* different, not just different DCs.
- Failures are often funnier than successes.
- Long arcs are built from small scenes with callbacks.
- Rare outcomes (crit/fumble) create story you remember.
