/**
 * #937 / #925 (ADR-W-047, ADR-3D-233) — THE PARAMETER DISPLAY CHIP.
 *
 * The operator's ruling, 2026-09-08: a parameter the student later VALUES gets a chip on the VALUING
 * line, flipping what the figure shows between their letter and its value; a parameter they never
 * valued is never replaced on the canvas. A bagrut question is worked in parts — part 1 reasons with
 * «α», a later part supplies 70 — and which form belongs on screen depends on the part the student is
 * in, which the tool cannot infer and must not guess.
 *
 * Measured before this change, through the real store → derive3 → buildScene3 path:
 *
 * | typed | arc | panel |
 * | --- | --- | --- |
 * | «∠SAB = α» | `α` | `α = ?` (open) |
 * | «∠SAB = α» · «α = 70» | **`70°`** — α unrecoverable from the canvas | `α = 70` (closed) |
 * | «∠SAB = 70» (no letter) | `70°` | — (no parameter at all) |
 *
 * The three answers the operator gave, each locked below: the chip appears **only where the displays
 * compete**; the choice **persists** across a reseed and a save/load round trip; and clause 3 —
 * a parameter the student never valued keeps its letter — is **existing behaviour**, locked so a
 * later change cannot start substituting a value they never stated.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { collectWedges, competingArcSymbols } from '../render/wedges';
import { paramChipsByFact } from '../store/paramChips';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import { displayModeFromIndexed, displayModeOf, displayModeToIndexed, pruneDisplayMode, toggleDisplayMode, readDisplayMode } from '../../shell/displayMode';

const state = () => useGeo3.getState();
const build = (steps: string[]) => {
  state().clear();
  for (const u of steps) state().submit(u);
  expect(state().lastError, steps.join(' · ')).toBeNull();
  return state();
};
const construction = () => derive3(state().facts, state().seed).construction;

/** The arc texts the canvas actually draws, with the student's current display choice applied. */
const arcs = (): string[] => {
  const st = state();
  const c = construction();
  const chips = paramChipsByFact(st.facts, competingArcSymbols(collectWedges(c, resolve3(c, st.seed).positions)));
  const symbolDisplay = (sym: string): 'letter' | 'value' => {
    for (const [factId, chip] of chips) if (chip.sym === sym) return displayModeOf(st.displayMode, factId);
    return 'value';
  };
  return buildScene3(c, resolve3(c, st.seed), HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true, false, symbolDisplay).angles.map((a) => a.text);
};

/** fact id → chip, exactly as App3 derives it. */
const chips = () => {
  const st = state();
  const c = construction();
  return paramChipsByFact(st.facts, competingArcSymbols(collectWedges(c, resolve3(c, st.seed).positions)));
};
const factWith = (needle: string) => state().facts.find((f) => f.utterance.includes(needle))!;

const PYRAMID = 'פירמידה SABCD שבסיסה ריבוע';

describe('#937 — the chip appears where the two displays COMPETE, and nowhere else', () => {
  beforeEach(() => state().clear());

  it('a NAMED angle later VALUED: the valuing row owns a chip', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    const c = chips();
    expect([...c.keys()], 'exactly one row').toHaveLength(1);
    expect(c.get(factWith('α = 70').id)).toEqual({ sym: 'α', value: 70 });
    expect(c.has(factWith('∠SAB = α').id), 'the row that USED the letter owns nothing').toBe(false);
  });

  it('NO competing display, NO chip — a valued symbol nothing renders as a letter', () => {
    // «t» names a rider's parameter; the canvas draws no letter for it, so there is nothing to
    // switch back to. This is the operator's "only when displays compete", stated as a case.
    build([PYRAMID, 'נסמן: AB = u, AD = v, AS = w', 'E על SA כך ש-SE = t·SA', 't = 1/2']);
    expect([...chips().keys()], 'no arc carries «t», so no row offers a choice').toEqual([]);
  });

  it('a value with NO letter offers nothing — «∠SAB = 70» alone', () => {
    build([PYRAMID, '∠SAB = 70']);
    expect([...chips().keys()]).toEqual([]);
    expect(arcs()).toEqual(['70°']);
  });

  it('a muted valuing row owns no chip — the chrome never offers an affordance that does nothing', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    const id = factWith('α = 70').id;
    expect(chips().has(id)).toBe(true);
    state().toggle(id);
    expect(chips().has(id), 'muted ⇒ not in effect ⇒ no chip').toBe(false);
  });
});

describe('#937 — the chip switches what the CANVAS shows', () => {
  beforeEach(() => state().clear());

  it('the default is the VALUE, and the chip sends the arc back to the letter', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    const id = factWith('α = 70').id;
    expect(arcs(), 'default: the student’s last statement wins').toEqual(['70°']);

    state().toggleDisplayMode(id);
    expect(displayModeOf(state().displayMode, id)).toBe('letter');
    expect(arcs(), 'part 1 again: the arc reads «α»').toEqual(['α']);

    state().toggleDisplayMode(id);
    expect(arcs(), 'and back').toEqual(['70°']);
  });

  it('the choice is PER PARAMETER — flipping α leaves β alone', () => {
    build([PYRAMID, '∠SAB = α', '∠SAD = β', 'α = 70', 'β = 50']);
    state().toggleDisplayMode(factWith('α = 70').id);
    const drawn = arcs();
    expect(drawn, 'α switched, β did not').toContain('α');
    expect(drawn).toContain('50°');
    expect(drawn).not.toContain('70°');
  });
});

describe('#937 — the choice PERSISTS: a reseed, and a save/load round trip', () => {
  beforeEach(() => state().clear());

  it('«הצג תצורה אחרת» keeps it — the key is a fact id, which a reseed does not rebuild', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    state().toggleDisplayMode(factWith('α = 70').id);
    const before = state().seed;
    state().resample();
    expect(state().seed, 'the figure really was reseeded').not.toBe(before);
    expect(arcs(), 'the arc still reads the letter').toEqual(['α']);
  });

  it('save → load keeps it; a file written BEFORE the chip loads showing values', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    state().toggleDisplayMode(factWith('α = 70').id);
    const st = state();
    const text = serializeFigure3(st.facts, st.seed, 'x', st.queries, st.planeDisplay, st.displayMode);
    // Keyed by INDEX, not by the session's fact id — a load re-parses the utterances into fresh ids,
    // so position is the only handle that crosses the file. (The first cut keyed by id and lost the
    // choice on every reload; this assertion is what caught it.)
    expect(JSON.parse(text).displayMode, 'the choice rides the file, by position').toEqual({ '2': 'letter' });

    const r = deserializeFigure3(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    state().clear();
    state().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode);
    expect(arcs(), 'restored to the letter').toEqual(['α']);

    // The pre-#937 file: no map at all ⇒ today's behaviour, no migration, load audit untouched.
    const old = JSON.parse(text) as Record<string, unknown>;
    delete old.displayMode;
    const r2 = deserializeFigure3(JSON.stringify(old));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.displayMode).toEqual({});
    state().clear();
    state().loadFigure(r2.facts, r2.seed, r2.queries, r2.planeDisplay, r2.displayMode);
    expect(arcs(), 'an older save shows the value — unchanged').toEqual(['70°']);
  });

  it('a figure with no choice writes NO displayMode key — an untouched file is unchanged', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    const st = state();
    expect(JSON.parse(serializeFigure3(st.facts, st.seed, 'x', st.queries, st.planeDisplay, st.displayMode))).not.toHaveProperty('displayMode');
  });

  it('deleting the valuing row drops its entry, and undo brings both back together', () => {
    build([PYRAMID, '∠SAB = α', 'α = 70']);
    const id = factWith('α = 70').id;
    state().toggleDisplayMode(id);
    expect(arcs()).toEqual(['α']);

    state().remove(id);
    // The map is pruned on the next flip and on load; what matters here is that the row is gone and
    // the arc falls back to the letter it never lost (clause 3 — α was never valued any more).
    expect(arcs()).toEqual(['α']);

    useGeo3.temporal.getState().undo();
    expect(state().facts.some((f) => f.id === id), 'the fact is back').toBe(true);
    expect(displayModeOf(state().displayMode, id), 'and so is its choice — one temporal state').toBe('letter');
  });
});

describe('#937 clause 3 — a parameter the student NEVER valued keeps its letter (existing behaviour, locked)', () => {
  beforeEach(() => state().clear());

  it('a named angle with no value shows «α», and offers no chip', () => {
    build([PYRAMID, '∠SAB = α']);
    expect(arcs()).toEqual(['α']);
    expect([...chips().keys()], 'nothing was chosen between').toEqual([]);
  });

  it('a letter the figure DETERMINES but the student never valued is not replaced on the canvas', () => {
    // «∠SAB = α» then «∠SAB = 70» states the ANGLE's value, not the letter's; α = 70 is computed.
    // The arc shows the magnitude the student stated about that corner; no row VALUED α, so there is
    // no chip and nothing to choose. Locked because the opposite — inventing «α = 70» as a valuing
    // line — is exactly the honesty failure clause 3 forbids.
    build([PYRAMID, '∠SAB = α', '∠SAB = 70']);
    expect([...chips().keys()], 'no row valued the LETTER').toEqual([]);
  });
});

describe('#937 — the shared state shape (shell/displayMode)', () => {
  it('default is the value; toggle flips one key and leaves the rest', () => {
    expect(displayModeOf(undefined, 'a')).toBe('value');
    expect(displayModeOf({}, 'a')).toBe('value');
    const m1 = toggleDisplayMode({}, 'a');
    expect(m1).toEqual({ a: 'letter' });
    const m2 = toggleDisplayMode({ ...m1, b: 'letter' }, 'a');
    expect(m2).toEqual({ a: 'value', b: 'letter' });
  });

  it('prune drops entries whose fact is gone and keeps the others', () => {
    expect(pruneDisplayMode({ a: 'letter', b: 'value' }, ['b'])).toEqual({ b: 'value' });
    expect(pruneDisplayMode({ a: 'letter' }, [])).toEqual({});
  });

  it('a persisted map is read leniently — junk entries are dropped, not trusted', () => {
    expect(readDisplayMode({ a: 'letter', b: 'value', c: 'sideways', d: 7 })).toEqual({ a: 'letter', b: 'value' });
    for (const bad of [null, undefined, 42, 'x', ['letter']]) expect(readDisplayMode(bad)).toEqual({});
  });

  it('the file boundary converts by POSITION, and drops indices that no longer exist', () => {
    const ids = ['f0', 'f1', 'f2'];
    // only non-default choices are written, so an untouched figure adds nothing to the file
    expect(displayModeToIndexed({ f1: 'letter', f2: 'value' }, ids)).toEqual({ '1': 'letter' });
    expect(displayModeToIndexed({}, ids)).toEqual({});
    // and back, against the FRESH ids a load minted
    expect(displayModeFromIndexed({ '1': 'letter' }, ['a', 'b', 'c'])).toEqual({ b: 'letter' });
    // a file whose list has since shrunk, or whose keys are junk
    expect(displayModeFromIndexed({ '9': 'letter', x: 'letter', '0': 'sideways' }, ['a'])).toEqual({});
    for (const bad of [null, undefined, 42, ['letter']]) expect(displayModeFromIndexed(bad, ids)).toEqual({});
  });
});
