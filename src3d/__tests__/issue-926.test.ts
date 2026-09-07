/**
 * #926 (ADR-3D-220, ADR-W-044) — a value whose defining row is edited away, deleted or muted is a FACT IN
 * ERROR that the action reports, never a green row that constrains nothing.
 *
 * Measured at the pre-fix HEAD (`82d87c6`, 2026-09-07), the three symbol lanes #902 widened:
 *
 *   «∠SAB = α» + «α = 70»,  replaceFact('∠SAB = α' → '∠SAB = 40')  → returns TRUE, lastError null
 *   remove('∠SAB = α')                                              → lastError null, symbolPins []
 *   remove('C(p²,1,0)') under «p=3» / remove('SN = k·SC') under «k = 1/2» → the same
 *   remove + re-add «∠SAB = α»                                      → «α = 70» STAYS red (in-order fold)
 *
 * The fold already stamped the orphan `unknown-symbol` (the resolver `symbolOwnersOf` answering "no
 * owner"); what was missing is (1) the ACTION reporting what it did to the other rows, and (2) the
 * value taking effect again when its definition comes back later in the list. The class is "a fact
 * whose subject no longer exists" — one report for the symbol lanes and the point lanes alike, judged
 * on the fold's own per-row status rather than a second dependency walk.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const BOX = "תיבה ABCDA'B'C'D'";
const PYR = 'פירמידה SABCD שבסיסה ריבוע';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const factByText = (u: string) => {
  const f = state().facts.find((x) => x.utterance === u);
  if (!f) throw new Error(`no fact «${u}»`);
  return f;
};
const statusOf = (u: string) => derived().status[factByText(u).id];
const statedAngleDegs = () => derived().construction.scalarPins.flatMap((p) => (p.kind === 'vangle' ? [p.deg] : []));

beforeEach(reset);

describe('#926 — deleting the row that defines a letter', () => {
  it('angle lane: «α = 70» turns red, the delete names it, and the figure no longer pins 70', () => {
    [PYR, '∠SAB = α', 'α = 70'].forEach(submit);
    expect(state().lastError).toBeNull();
    expect(statedAngleDegs()).toEqual([70]);

    state().remove(factByText('∠SAB = α').id);

    expect(state().facts.map((f) => f.utterance), 'the value row STAYS — the tool never deletes the student\'s sentence for them').toEqual([PYR, 'α = 70']);
    expect(statusOf('α = 70')).toEqual({ code: 'unknown-symbol', id: 'α' });
    expect(state().lastError).toEqual({ code: 'dependents-broken', items: '«α = 70»', cause: '∠SAB = α' });
    expect(statedAngleDegs(), 'the figure must not pretend the value applies').toEqual([]);
  });

  it('pin lane: «p=3» after «C(p²,1,0)» is deleted', () => {
    [BOX, 'C(p²,1,0)', 'p=3'].forEach(submit);
    expect(state().lastError).toBeNull();
    state().remove(factByText('C(p²,1,0)').id);
    expect(statusOf('p=3')).toEqual({ code: 'unknown-symbol', id: 'p' });
    expect(state().lastError).toEqual({ code: 'dependents-broken', items: '«p=3»', cause: 'C(p²,1,0)' });
    expect(derived().construction.symbolPins).toEqual([]);
  });

  it('vec-def lane: «k = 1/2» after «SN = k·SC» is deleted', () => {
    [PYR, 'SN = k·SC', 'k = 1/2'].forEach(submit);
    expect(state().lastError).toBeNull();
    state().remove(factByText('SN = k·SC').id);
    expect(statusOf('k = 1/2')).toEqual({ code: 'unknown-symbol', id: 'k' });
    expect(state().lastError).toEqual({ code: 'dependents-broken', items: '«k = 1/2»', cause: 'SN = k·SC' });
    expect(derived().construction.symbolPins).toEqual([]);
  });
});

describe('#926 — editing the defining row away', () => {
  it('replaceFact commits the edit (true) but is NOT a bare success: lastError names the orphaned row', () => {
    [PYR, '∠SAB = α', 'α = 70'].forEach(submit);
    const def = factByText('∠SAB = α');

    const ok = state().replaceFact(def.id, '∠SAB = 40');

    expect(ok, 'the edit itself passed its gate and is committed').toBe(true);
    expect(factByText('∠SAB = 40').id).toBe(def.id);
    expect(statusOf('α = 70')).toEqual({ code: 'unknown-symbol', id: 'α' });
    expect(state().lastError).toEqual({ code: 'dependents-broken', items: '«α = 70»', cause: '∠SAB = α' });
    expect(statedAngleDegs(), 'only the edited 40 pins the angle — the orphaned 70 does not').toEqual([40]);
  });

  it('editing it BACK restores the value silently (no retyping), and the report clears', () => {
    [PYR, '∠SAB = α', 'α = 70'].forEach(submit);
    const def = factByText('∠SAB = α');
    state().replaceFact(def.id, '∠SAB = 40');
    expect(state().replaceFact(def.id, '∠SAB = α')).toBe(true);
    expect(state().lastError).toBeNull();
    expect(statusOf('α = 70')).toBe('ok');
    expect(statedAngleDegs()).toEqual([70]);
  });
});

describe('#926 — muting the defining row', () => {
  it('toggle off reports the orphan; toggle back on clears it', () => {
    [PYR, '∠SAB = α', 'α = 70'].forEach(submit);
    const def = factByText('∠SAB = α');
    state().toggle(def.id);
    expect(statusOf('α = 70')).toEqual({ code: 'unknown-symbol', id: 'α' });
    expect(state().lastError).toEqual({ code: 'dependents-broken', items: '«α = 70»', cause: '∠SAB = α' });
    state().toggle(def.id);
    expect(state().lastError).toBeNull();
    expect(statusOf('α = 70')).toBe('ok');
    expect(statedAngleDegs()).toEqual([70]);
  });
});

describe('#926 — re-adding the definition AFTER the value row (the armed ruling)', () => {
  it('the value takes effect again without being retyped — the fold retries a symbol statement once its letter exists', () => {
    [PYR, '∠SAB = α', 'α = 70'].forEach(submit);
    state().remove(factByText('∠SAB = α').id);
    expect(statusOf('α = 70')).toEqual({ code: 'unknown-symbol', id: 'α' });

    submit('∠SAB = α');

    expect(state().lastError).toBeNull();
    expect(state().facts.map((f) => f.utterance)).toEqual([PYR, 'α = 70', '∠SAB = α']);
    expect(statusOf('α = 70')).toBe('ok');
    expect(statedAngleDegs(), 'the angle is pinned to the stated 70 again').toEqual([70]);
    expect(derived().construction.angleMarks.map((m) => m.label)).toEqual(['α']);
  });

  it('the same for the pin lane: «p=3» before a re-added «C(p²,1,0)»', () => {
    [BOX, 'C(p²,1,0)', 'p=3'].forEach(submit);
    state().remove(factByText('C(p²,1,0)').id);
    submit('C(p²,1,0)');
    expect(state().lastError).toBeNull();
    expect(statusOf('p=3')).toBe('ok');
    expect(derived().construction.symbolPins).toEqual([{ rel: 'value', value: 3, sym: 'p' }]);
    const C = derived().positions.get('C');
    expect(C && Math.abs(C.x - 9) < 1e-6, 'C lands at (9, 1, 0) as in #902').toBe(true);
  });
});

describe('#926 — unchanged guards', () => {
  it('a value whose letter IS defined stays exactly as it was — no report on the happy path', () => {
    [PYR, '∠SAB = α', 'α = 70'].forEach(submit);
    for (const f of state().facts) expect(derived().status[f.id]).toBe('ok');
    expect(state().lastError).toBeNull();
  });

  it('deleting, muting or editing a row nothing depends on reports nothing', () => {
    [PYR, '∠SAB = α', 'α = 70', 'AB = 5'].forEach(submit);
    const len = factByText('AB = 5');
    state().toggle(len.id);
    expect(state().lastError).toBeNull();
    state().toggle(len.id);
    expect(state().replaceFact(len.id, 'AB = 6')).toBe(true);
    expect(state().lastError).toBeNull();
    state().remove(len.id);
    expect(state().lastError).toBeNull();
    expect(statusOf('α = 70')).toBe('ok');
  });

  it('typing a value BEFORE any definition is still refused at submit (keep-prior), as before', () => {
    submit(PYR);
    submit('α = 70');
    expect(state().facts.map((f) => f.utterance)).toEqual([PYR]);
    expect(state().lastError).toEqual({ code: 'unknown-symbol', id: 'α' });
  });

  it('a delete that breaks a POINT dependent is the same class and gets the same report', () => {
    [BOX, 'E אמצע AB', "|EC'| = 4"].forEach(submit);
    expect(state().facts.map((f) => f.utterance), 'precondition: all three rows were accepted').toEqual([BOX, 'E אמצע AB', "|EC'| = 4"]);
    expect(statusOf("|EC'| = 4"), 'precondition: the dependent row is green before the delete').toBe('ok');
    state().remove(factByText('E אמצע AB').id);
    expect(state().lastError?.code).toBe('dependents-broken');
    expect(state().lastError && 'items' in state().lastError! ? (state().lastError as { items: string }).items : '').toContain("|EC'| = 4");
  });
});
