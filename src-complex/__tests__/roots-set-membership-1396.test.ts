/**
 * #1396 — «z1 = 2cis120» then «z^3 = 8» was REFUSED although 2cis120 is a cube root of 8.
 *
 * ADR-CX-042 matched the solutions of `X^n = …` to X₁..Xₙ by INDEX: X₁ pinned to the principal root,
 * Xₖ `(k−1)/n` of a turn from it. The operator ruled (2026-09-24): *accept it, and name the rest* —
 * SET membership. A stated member must be A root; the unstated names take the remaining roots in
 * argument order from the principal root. Implemented in `app/deriveLines.ts` (`placeSolutionSets`,
 * ADR-CX-044): the rest of the figure is solved once, each DETERMINED member is placed exactly, and the
 * index lowering stands whenever nothing is off its index root.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { EXAMPLE_LINES } from '../app/example';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (lines: string[]) => lines.map((l) => submitLine(l));
/** each point's direction in whole degrees, by name */
const dirs = () => {
  const d = deriveLines(store().lines, store().seed, store().seed);
  return Object.fromEntries(d.points.map((p) => [p.name, Math.round(p.argumentDeg) % 360]));
};

describe('#1396 — a stated member is matched as ONE OF the roots', () => {
  it('«z1 = 2cis120 · z^3 = 8»: accepted; z₁ at 120°, and z₂, z₃ on the other two roots in argument order', () => {
    expect(play(['z1 = 2cis120', 'z^3 = 8'])).toEqual([true, true]);
    expect(dirs()).toEqual({ z1: 120, z2: 0, z3: 240 });
  });

  it('the other ORDER draws the same figure (ADR-CX-042 item 3, order independence)', () => {
    expect(play(['z^3 = 8', 'z1 = 2cis120'])).toEqual([true, true]);
    expect(dirs()).toEqual({ z1: 120, z2: 0, z3: 240 });
  });

  it('«z2 = 2 · z^3 = 8»: accepted; z₂ = 2, and z₁, z₃ take the other two', () => {
    expect(play(['z2 = 2', 'z^3 = 8'])).toEqual([true, true]);
    expect(dirs()).toEqual({ z1: 120, z2: 0, z3: 240 });
  });

  it('a negative right-hand side: «z1 = -2 · z^3 = -8» is accepted (-2 IS a cube root of -8)', () => {
    expect(play(['z1 = -2', 'z^3 = -8'])).toEqual([true, true]);
    expect(dirs()).toEqual({ z1: 180, z2: 60, z3: 300 });
  });

  it('two members off their index roots: both placed, the third name takes what is left', () => {
    expect(play(['z1 = 2cis120', 'z^3 = 8', 'z2 = 2cis240'])).toEqual([true, true, true]);
    expect(dirs()).toEqual({ z1: 120, z2: 240, z3: 0 });
  });
});

describe('#1396 — what still refuses', () => {
  it('«z1 = 3 · z^3 = 8» is refused naming «z1 = 3» — 3 is no root at all', () => {
    expect(play(['z1 = 3', 'z^3 = 8'])).toEqual([true, false]);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z1 = 3' });
  });

  it('…and in the other order, naming the equation it cannot join', () => {
    expect(play(['z^3 = 8', 'z1 = 3'])).toEqual([true, false]);
    expect(store().lastError?.key).toBe('incompatible');
  });

  it('two names cannot be ONE root: «z1 = 2cis120 · z2 = 2cis120 · z^3 = 8» is refused', () => {
    expect(play(['z1 = 2cis120', 'z2 = 2cis120', 'z^3 = 8'])).toEqual([true, true, false]);
  });

  it('the #1367 T5 sequence (members that are no roots) stays refused', () => {
    expect(play(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2', 'z^5 = w^2'])).toEqual([true, true, true, false]);
  });
});

describe('#1396 — what does not move', () => {
  it('a member ON its index root lowers exactly as before («z1 = 2 · z^3 = 8»)', () => {
    expect(play(['z1 = 2', 'z^3 = 8'])).toEqual([true, true]);
    expect(dirs()).toEqual({ z1: 0, z2: 120, z3: 240 });
  });

  it('a clean «z^3 = 8» and the example button are unchanged', () => {
    expect(play(['z^3 = 8'])).toEqual([true]);
    expect(dirs()).toEqual({ z1: 0, z2: 120, z3: 240 });
    store().resetSession();
    expect(play([...EXAMPLE_LINES])).toEqual(EXAMPLE_LINES.map(() => true));
  });
});
