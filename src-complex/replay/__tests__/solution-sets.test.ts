/**
 * SOLUTION SETS — `z³ = 8` is three points at once, not three configurations (#680, ADR-CX-005 mode 1).
 *
 * The prototype named z₁, z₂, z₃ and let a later line refer to them; v2 drew one point and walked the
 * three as configurations. That difference is the ninth cutover gap (ADR-CX-019) and the reason #616
 * cannot close: deleting the prototype while it holds a capability v2 lacks would delete the capability.
 *
 * These drive the **v2** submit path — `app/submit.ts`, what the input box calls — and that correction is
 * [#686](https://github.com/dcodish/geo_builder/issues/686). The first version of this file never called
 * `setEngine`, and the store's default is `'proto'`, so it submitted through the PROTOTYPE and folded
 * through the retiring bridge: eight green tests describing a capability the shipped path did not have.
 * A test that calls the lowering cannot catch a pipeline that stops calling it, and neither can a test
 * that calls the wrong engine's pipeline.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useComplexStore } from '../../store/useComplexStore';
import { deriveLines } from '../../app/deriveLines';
import { submitLine } from '../../app/submit';
import { isAnonymous, prettyName, solutionNames } from '../../model/naming';

const store = () => useComplexStore.getState();

/** Stated, never inherited: the engine an assertion is about is the whole point of this file (#686). */
const fresh = () => {
  store().clearAll();
  return store();
};

beforeEach(fresh);

/** Submit each line through the real path; fail loudly on a refusal rather than testing nothing. */
const build = (...lines: string[]) => {
  fresh();
  for (const line of lines) {
    if (!submitLine(line)) {
      const err = store().lastError;
      throw new Error(`«${line}» was refused: ${err?.key} ${err?.detail ?? ''}`);
    }
  }
  return deriveLines(store().lines, store().seed, store().seed);
};

const at = (d: ReturnType<typeof deriveLines>, name: string) => d.points.find((p) => p.name === name);

describe('#680 — an enumerating equation draws its whole solution set', () => {
  it('«z^3 = 8» plots z₁, z₂, z₃ — three NAMED points in ONE configuration', () => {
    const d = build('z^3 = 8');

    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z2', 'z3']);

    // the cube roots of 8: modulus 2, arguments 0° / 120° / 240°
    for (const n of ['z1', 'z2', 'z3']) {
      expect(at(d, n)!.modulusKnown).toBe(true);
      expect(at(d, n)!.argumentKnown).toBe(true);
      expect(Math.hypot(at(d, n)!.z.re, at(d, n)!.z.im)).toBeCloseTo(2, 9);
    }
    const args = ['z1', 'z2', 'z3'].map((n) => at(d, n)!.argumentDeg).sort((a, b) => a - b);
    expect(args[0]).toBeCloseTo(0, 6);
    expect(args[1]).toBeCloseTo(120, 6);
    expect(args[2]).toBeCloseTo(240, 6);
  });

  it('the set is ONE configuration — there is nothing to cycle (ADR-CX-020)', () => {
    const d = build('z^3 = 8');
    expect(d.enumeratedConfigCount).toBe(1);
    expect(d.freeDof).toEqual([]);
    expect(d.canCycle).toBe(false);
  });

  it('the bare letter is RESERVED — a later definition of z names the equation that holds it', () => {
    expect(submitLine('z^3 = 8')).toBe(true);
    expect(submitLine('z = 1+i')).toBe(false);
    const err = store().lastError;
    // v2 reads a second mention as a GIVEN (ADR-CX-009 §1), so the refusal is `incompatible` rather
    // than the prototype's `duplicate-name`; what matters is that it quotes the STATEMENT owning the
    // letter and never internal state.
    expect(err?.key).toBe('incompatible');
    expect(err?.detail).toContain('z^3');
    expect(store().lines).toEqual(['z^3 = 8']);
  });

  /**
   * Reserving without enforcing only moves the phantom. «arg z» after an enumeration has no honest
   * reading — `z` is already three points — and left alone the fold auto-created a FOURTH free `z` and
   * drew it at a sampled direction, which is the very invention #680 was filed about.
   */
  it('and a WINDOW on the reserved letter is refused too, not answered with a phantom', () => {
    expect(submitLine('z^3 = 8')).toBe(true);
    expect(submitLine('90 < arg z < 180')).toBe(false);
    expect(store().lastError?.detail).toContain('z^3');
    // the figure is the solution set and nothing else — no fourth point called `z`
    expect(build('z^3 = 8').points.map((p) => p.name).sort()).toEqual(['z1', 'z2', 'z3']);
  });

  it('the solutions are REFERENCABLE — a later line may constrain z₁', () => {
    const d = build('z^3 = 8', 'w = z1 * 2');
    expect(at(d, 'w')).toBeDefined();
    // z₁ is the principal root, 2 — so w is 4 on the positive real axis
    expect(at(d, 'w')!.z.re).toBeCloseTo(4, 9);
    expect(at(d, 'w')!.z.im).toBeCloseTo(0, 9);
  });

  it('an equation whose indexed names are TAKEN enumerates anonymously instead of refusing', () => {
    const d = build('z1 = 5', 'z^4 = 16');

    // z₁ stays the student's, and the four solutions are drawn without claiming names
    expect(at(d, 'z1')!.z.re).toBeCloseTo(5, 9);
    const anon = d.points.filter((p) => isAnonymous(p.name));
    expect(anon).toHaveLength(4);
    for (const p of anon) expect(Math.hypot(p.z.re, p.z.im)).toBeCloseTo(2, 9);
  });

  it('an anonymous id never reaches a rendered string (ADR-447)', () => {
    for (const n of solutionNames('z', 4, true)) expect(prettyName(n)).toBe('');
    expect(prettyName('z1')).toBe('z₁');
  });
});

describe('#680 — solving is told from relating by what the earlier lines said', () => {
  it('«z1^3 = z3» typed cold RELATES two numbers — it does not enumerate into z₁₁, z₁₂, z₁₃', () => {
    // #607's own session. z3 is brought into being by this very line, so it cannot ground an
    // enumeration; the several solutions are the exam's «כל האפשרויות» and stay configurations.
    const d = build('z1^3 = z3', '-2z1 = conj(z3)');
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z3']);
    expect(d.enumeratedConfigCount).toBe(4);
  });

  it('...but the SAME shape enumerates once its right-hand side is grounded', () => {
    // §2b part ד: z⁴ = z₁·z₂ with both named earlier. The set is drawn; z₁ being taken makes it
    // anonymous rather than a refusal.
    const d = build('z1 = 2', 'z2 = 8', 'z^4 = z1*z2');
    expect(d.points.filter((p) => isAnonymous(p.name))).toHaveLength(4);
    expect(at(d, 'z1')).toBeDefined();
    expect(at(d, 'z2')).toBeDefined();
  });

  it('a name MENTIONED by an earlier relation counts as stated — it need not be defined', () => {
    // «|z1| = 9r» introduces z1 through a relation. A student who wrote that has stated z1, so an
    // equation about z1 constrains it rather than enumerating a fresh letter.
    const d = build('|z1| = 2', 'z1^3 = 8');
    expect(d.points.map((p) => p.name)).toEqual(['z1']);
    expect(d.enumeratedConfigCount).toBe(3); // one number, its three possible directions
  });
});

describe('#680 — the other two modes are untouched (#607 family keeps its branches)', () => {
  it('an EXISTING free letter is constrained, not enumerated — the solutions stay configurations', () => {
    const d = build('z', 'z^3 = 8');
    // one letter, one point; the three roots are the three configurations it may sit at
    expect(d.points.map((p) => p.name)).toEqual(['z']);
    expect(d.enumeratedConfigCount).toBe(3);
    expect(d.canCycle).toBe(true);
  });

  it('an EXISTING determined letter is VERIFIED — the equation is a claim', () => {
    const d = build('z1 = 2i', 'z1^2 = -4');
    expect(d.points.map((p) => p.name)).toEqual(['z1']);
    expect(d.enumeratedConfigCount).toBe(1);
  });
});
