/**
 * #1367 — the solutions of `z^n = …` ARE z₁..zₙ, and a student's existing zₖ must be solution k.
 *
 * Operator ruling (2026-09-22, reaffirmed 2026-09-24 against the stated cost): *"if users writes z3= it
 * is accepted. if user writes z= it is accepted but if he writes z^3= and z3 doesnt fit one of the
 * solutions, it should be rejected."* Index matching, not set membership: if z₁ could be ANY solution,
 * the naming z₁..zₙ would stop being well defined.
 *
 * Root cause (measured): when an indexed name was taken, `rootsMode` returned `'anonymous'` and the
 * solutions were drawn as internal `#sz5_N` ids. Having given up the name, the solver never compared the
 * student's z₁ with the root that would have claimed it — so the two halves of the report (the roots
 * have no names; the contradiction is not detected) were one fallback, seen from two sides. The
 * `enumerate` lowering already pins z₁ to the principal root and zₖ to (k−1)/n of a turn from it, so
 * claiming the names IS the consistency check.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { EXAMPLE_LINES } from '../app/example';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

/** Submit through the real gate; returns which lines landed. */
const play = (lines: string[]) => lines.map((l) => submitLine(l));

describe('#1367 — the operator\'s T5: the roots of «z^5 = w^2» over his own z₁, z₂', () => {
  it('is REFUSED — z₁ = 3+4i is not the principal fifth root of w², and the lines before it stand', () => {
    expect(play(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2', 'z^5 = w^2'])).toEqual([true, true, true, false]);
    expect(store().lastError?.key).toBe('incompatible');
    expect(store().lines).toEqual(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2']);
  });

  it('no internal id ever reaches the canvas — every drawn point has a name the student can write', () => {
    for (const lines of [['z^3 = 8'], ['z1 = 2', 'z^3 = 8'], EXAMPLE_LINES]) {
      for (const p of deriveLines(lines).points) expect(p.name, JSON.stringify(lines)).toMatch(/^[a-zA-Z]\w*$/);
    }
  });
});

describe('#1367 — a member that IS its solution is reused, and the set is named around it', () => {
  it('«z1 = 2» then «z^3 = 8»: z₁ is solution 1 — accepted, named z₁, z₂, z₃', () => {
    expect(play(['z1 = 2', 'z^3 = 8'])).toEqual([true, true]);
    const d = deriveLines(store().lines);
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z2', 'z3']);
    expect(d.points.find((p) => p.name === 'z1')!.z.re).toBeCloseTo(2, 9);
  });

  it('«z2 = 2cis120» then «z^3 = 8»: z₂ is solution 2 — accepted', () => {
    expect(play(['z2 = 2cis120', 'z^3 = 8'])).toEqual([true, true]);
  });
});

describe('#1367 — a member that is NOT its solution refuses, naming the student\'s statement', () => {
  it('«z1 = 3» then «z^3 = 8» (not a cube root of 8) — refused, naming «z1 = 3»', () => {
    expect(play(['z1 = 3', 'z^3 = 8'])).toEqual([true, false]);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z1 = 3' });
  });

  it('ORDER-INDEPENDENT: «z^3 = 8» then «z1 = 3» is refused too — the same two statements, the same verdict', () => {
    expect(play(['z^3 = 8', 'z1 = 3'])).toEqual([true, false]);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z^3 = 8' });
  });

  it('INDEX matching, not set membership: «z1 = 2cis120» is a cube root of 8 but not solution 1 — refused', () => {
    expect(play(['z1 = 2cis120', 'z^3 = 8'])).toEqual([true, false]);
    expect(play(['z2 = 2cis240', 'z^3 = 8'])).toEqual([true, false]);
  });
});

describe('#1367 — what the ruling leaves alone', () => {
  it('«z^3 = 8» in a clean session plots every solution (catalog F8 row 1)', () => {
    expect(deriveLines(['z^3 = 8']).points.map((p) => p.name)).toEqual(['z1', 'z2', 'z3']);
  });

  it('a RELATION between numbers — «z1^3 = z3» — is unaffected (catalog F8 row 2)', () => {
    expect(play(['z1 = 2', 'z3 = 8', 'z1^3 = z3'])).toEqual([true, true, true]);
  });

  it('defining a member or the bare letter on its own is always accepted', () => {
    expect(play(['z3 = 1+i'])).toEqual([true]);
    store().resetSession();
    expect(play(['z = 1+i'])).toEqual([true]);
  });

  it("the tool's own EXAMPLE builds end to end — every line lands, five solutions named z₁..z₅", () => {
    expect(play(EXAMPLE_LINES)).toEqual(EXAMPLE_LINES.map(() => true));
    const sols = deriveLines(store().lines).points.filter((p) => /^z\d$/.test(p.name));
    expect(sols.map((p) => p.name).sort()).toEqual(['z1', 'z2', 'z3', 'z4', 'z5']);
  });
});
