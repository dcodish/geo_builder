/**
 * #986 (ADR-3D-242) — the arc shows the EXPRESSION the student wrote, not the binding letter.
 *
 * P1, found by the operator playing round #974 T17: «זווית ABC שווה 2α» drove the angle to 60° correctly
 * and **drew the arc labelled «α»**. The figure was right and the drawing lied — the worse direction of
 * the honesty invariant, because a wrong label is not silence.
 *
 * T18 is why it was P1 rather than cosmetic: «∠ABC = 2α» with «∠BCA = α» rendered **both** arcs «α» while
 * drawing them at 60° and 30°, so the canvas re-asserted the very equality ADR-3D-241's solver guard
 * deliberately withholds. One letter, two visibly different angles.
 *
 * **Root cause:** ADR-3D-241 split the symbol across two fields — `label` is the binding IDENTITY
 * (`symbolOwnersOf` collects by it; ADR-3D-052's reused-label equality compares it) and `coef` is part of
 * what was WRITTEN. Every display surface wants the second thing, and each one reached for `label`
 * directly. The fix composes the text in ONE place (`angleMarkText`, beside the type) so a third surface
 * cannot reintroduce it.
 *
 * **Why this file exists at all:** #977's 115 tests asserted the command (`{label:'α', coef:2}`) and the
 * driven angle (60°) and never asserted *what is drawn* — so they all passed while the canvas was wrong.
 * Every assertion below is taken from a display builder's own output.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { collectWedges, competingArcSymbols } from '../render/wedges';
import { dataView } from '../engine/dataView';
import { angleMarkText } from '../engine/types';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (lines: string[]) => {
  reset();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, st.seed);
  const wedges = collectWedges(d.construction, d.resolved.positions);
  return {
    /** vertex → the text the ARC carries. The canvas's own output, not the record behind it. */
    arcs: Object.fromEntries(wedges.map((w) => [w.vertex, w.label ?? ''])),
    /** the data panel's angle rows */
    panel: dataView(d.construction, st.seed).relations.filter((r) => /=.*°/.test(r)),
    /** the #937 chip's symbol set */
    syms: competingArcSymbols(wedges),
  };
};

beforeEach(reset);

describe('#986 — the composer', () => {
  it('prepends the coefficient, and only when there is one', () => {
    expect(angleMarkText({ label: 'α', coef: 2 })).toBe('2α');
    expect(angleMarkText({ label: 'α' })).toBe('α');
    expect(angleMarkText({ label: 'x', coef: 3 })).toBe('3x');
  });

  it('a marker with no letter shows nothing', () => {
    // `''` is what the renderer already means by "a bare ∠SDB marker" — not the string "undefined".
    expect(angleMarkText({})).toBe('');
    expect(angleMarkText({ coef: 2 })).toBe('');
  });
});

describe('#986 — the CANVAS shows what the student wrote', () => {
  it('the reported case: «זווית ABC שווה 2α» draws «2α», not «α»', () => {
    const { arcs } = build(['משולש ABC', 'זווית ABC שווה 2α', 'α = 30']);
    expect(arcs.B).toBe('2α');
  });

  it('T18 — two angles wearing the same letter carry DIFFERENT arc text', () => {
    // The assertion that makes the ratio visible. Before the fix both read «α» while being drawn at 60°
    // and 30°, so the drawing asserted an equality the solver refuses to hold (ADR-3D-241).
    const { arcs } = build(['משולש ABC', 'זווית ABC = 2α', 'זווית BCA = α', 'α = 30']);
    expect(arcs.B).toBe('2α');
    expect(arcs.C).toBe('α');
    expect(arcs.B).not.toBe(arcs.C);
  });

  it('a bare symbol is untouched, and a bare marker still shows nothing', () => {
    expect(build(['משולש ABC', 'זווית ABC = α', 'α = 40']).arcs.B).toBe('α');
    expect(build(['משולש ABC', '∠ABC']).arcs.B).toBe('');
  });
});

describe('#986 — the DATA PANEL says the same thing as the arc', () => {
  it('the row names the statement: «2α = 60°»', () => {
    const { panel } = build(['משולש ABC', 'זווית ABC שווה 2α', 'α = 30']);
    expect(panel).toContain('2α = 60°');
    expect(panel).not.toContain('α = 60°'); // the old row, which competed with a real «α = …» elsewhere
  });

  it('the ratio prints two distinguishable rows', () => {
    const { panel } = build(['משולש ABC', 'זווית ABC = 2α', 'זווית BCA = α', 'α = 30']);
    expect(panel).toContain('2α = 60°');
    expect(panel).toContain('α = 30°');
  });

  it('a bare symbol row is unchanged', () => {
    expect(build(['משולש ABC', 'זווית ABC = α', 'α = 40']).panel).toContain('α = 40°');
  });
});

describe('#986 — the #937 chip still matches on the SYMBOL', () => {
  it('a coefficient mark contributes «α», never «2α»', () => {
    // The regression this fix nearly introduced: the chip set is matched against the facts' letters, so
    // a set containing «2α» would match nothing and the chip would silently stop appearing.
    const { syms } = build(['משולש ABC', 'זווית ABC שווה 2α', 'α = 30']);
    expect([...syms]).toEqual(['α']);
  });

  it('a bare marker contributes no symbol', () => {
    expect([...build(['משולש ABC', '∠ABC']).syms]).toEqual([]);
  });
});
