/**
 * #2078 (ADR-CX-070) — the letter in the modulus slot of a polar form is POSITIVE.
 *
 * The operator, 2026-10-13: *"in complex numbers, r is always positive so rcis30 shoudl not be as image
 * shows"* — «z = r(cos30° + i sin30°)» alternated between the 30° and the 210° ray on «הציגו תצורה אחרת»
 * and the canvas read «z ≈ |r|·cis210°». `paramSigns` read a factor written as `cis θ` as a plain number,
 * so r was sign-free like the `r` of `2 + r·i`. A written `cis θ` now carries a polar mark from the
 * parser, and a parameter in one product with it is a size, as with a complex name (ADR-CX-045).
 *
 * Operator ruling, 2026-10-13: «z = r cis 30» · «r = -3» refuses the second line (an existing message),
 * and «z = r cis 90» (r > 0) and «z = r·i» (sign-free, as before) both build.
 *
 * Every lock runs the real `parseLineV2` / `submitLine` / `deriveLines` path. «הציגו תצורה אחרת» is the
 * next seed, so walking the seeds is walking the button.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { paramSigns } from '../model/paramSign';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const zOf = (lines: string[], seed: number) => {
  const d = deriveLines(lines, seed, seed);
  const z = d.points.find((p) => p.name === 'z');
  if (!z) throw new Error(`no z for ${JSON.stringify(lines)}`);
  return { d, z };
};
const signsOf = (line: string) => {
  const r = parseLineV2(line);
  if (!r.ok) throw new Error(`«${line}» did not parse`);
  return paramSigns({ constraints: r.line.constraints });
};

describe('#2078 — the operator’s line: z stays on the 30° ray at every press', () => {
  it('«z = r(cos30° + i sin30°)» — arg z = 30°, one configuration, «z ≈ r·cis30°», seeds 0–9', () => {
    for (const seed of SEEDS) {
      const { d, z } = zOf(['z = r(cos30° + i sin30°)'], seed);
      expect(d.configCount).toBe(1);
      expect(z.argumentDeg).toBeCloseTo(30, 9);
      expect(Math.hypot(z.z.re, z.z.im)).toBeGreaterThan(0);
      expect(z.reading).toBe('z ≈ r·cis30°');
    }
  });

  it('the store accepts it', () => {
    expect(submitLine('z = r(cos30° + i sin30°)')).toBe(true);
    expect(store().lines).toEqual(['z = r(cos30° + i sin30°)']);
  });
});

describe('#2078 — the class: every spelling of a letter modulus with a closed angle', () => {
  it.each([
    ['z = r cis 30', 30],
    ['z = rcis30°', 30],
    ['z = r·cis(30°)', 30],
    ['z = r cis(30°)', 30],
    ['z = 2r cis 30', 30],
    ['z = r (cos 30 + i sin 30)', 30],
    ['z = r cis(π/6)', 30],
    ['z = r cis 0', 0],
    ['z = r cis 150', 150],
  ])('«%s» — arg z = %s° at every seed', (line, deg) => {
    for (const seed of SEEDS) {
      const { d, z } = zOf([line], seed);
      expect(d.configCount).toBe(1);
      expect(((z.argumentDeg - deg + 540) % 360) - 180).toBeCloseTo(0, 9);
    }
  });

  it('r is classified a size in the polar form', () => {
    expect([...signsOf('z = r cis 30').size]).toEqual(['r']);
    expect([...signsOf('z = r(cos30° + i sin30°)').size]).toEqual(['r']);
  });
});

describe('#2078 — the consequences of r > 0', () => {
  it('«z = r cis 30» · «|z| = 5» gives r = 5, z = 5·cis30° at every seed', () => {
    for (const seed of SEEDS) {
      const { d, z } = zOf(['z = r cis 30', '|z| = 5'], seed);
      expect(d.params).toEqual([{ name: 'r', value: '5' }]);
      expect(z.z.re).toBeCloseTo(5 * Math.cos(Math.PI / 6), 9);
      expect(z.z.im).toBeCloseTo(2.5, 9);
    }
  });

  it('«z^3 = r cis 60» draws the r > 0 roots only — the same figure as «z^3 = 8 cis 60»', () => {
    for (const seed of SEEDS) {
      const d = deriveLines(['z^3 = r cis 60'], seed, seed);
      const n = deriveLines(['z^3 = 8 cis 60'], seed, seed);
      expect(d.configCount).toBe(n.configCount);
      const args = (x: typeof d) => x.points.map((p) => Math.round(p.argumentDeg)).sort((a, b) => a - b);
      expect(args(d)).toEqual([20, 140, 260]);
      expect(args(d)).toEqual(args(n));
    }
  });

  it('«z ברביע השלישי» after «z = r cis 30» is refused, never drawn green', () => {
    expect(submitLine('z = r cis 30')).toBe(true);
    expect(submitLine('z ברביע השלישי')).toBe(false);
    expect(store().lines).toEqual(['z = r cis 30']);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z = r cis 30' });
  });
});

describe('#2078 — operator ruling: «r = -3» after «z = r cis 30» is refused with the existing message', () => {
  it('the second line is refused, naming the polar line it conflicts with', () => {
    expect(submitLine('z = r cis 30')).toBe(true);
    expect(submitLine('r = -3')).toBe(false);
    expect(store().lines).toEqual(['z = r cis 30']);
    // «המשפט לא נוסף — אינו מתיישב עם: "z = r cis 30"» — the acceptance gate's existing refusal
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z = r cis 30' });
  });

  it('the trigonometric spelling refuses the same way, and «r = 3» is still accepted', () => {
    expect(submitLine('z = r(cos30° + i sin30°)')).toBe(true);
    expect(submitLine('r = -3')).toBe(false);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z = r(cos30° + i sin30°)' });
    expect(submitLine('r = 3')).toBe(true);
    expect(store().lines).toEqual(['z = r(cos30° + i sin30°)', 'r = 3']);
  });
});

describe('#2078 — operator ruling: «z = r cis 90» and «z = r·i» both build', () => {
  it('«z = r cis 90» — polar, r > 0: on the positive imaginary axis at every seed', () => {
    for (const seed of SEEDS) {
      const { d, z } = zOf(['z = r cis 90'], seed);
      expect(d.configCount).toBe(1);
      expect(z.argumentDeg).toBeCloseTo(90, 9);
    }
    expect(submitLine('z = r cis 90')).toBe(true);
  });

  it('«z = r·i» — cartesian, unchanged (ADR-CX-045): r is any real, two configurations', () => {
    expect([...signsOf('z = r·i').signed]).toEqual(['r']);
    const args = new Set<number>();
    for (const seed of SEEDS) {
      const { d, z } = zOf(['z = r·i'], seed);
      expect(d.configCount).toBe(2);
      args.add(Math.round(z.argumentDeg));
    }
    expect([...args].sort((a, b) => a - b)).toEqual([90, 270]);
    expect(submitLine('z = r·i')).toBe(true);
  });

  it('the two lower to the same unit value — only the polar mark tells them apart', () => {
    const v = (line: string) => {
      const r = parseLineV2(line);
      if (!r.ok) throw new Error(line);
      const rhs = r.line.constraints[0].rhs;
      if (rhs.t !== 'mul' || rhs.r.t !== 'val') throw new Error(`unexpected shape for «${line}»`);
      return rhs.r;
    };
    expect(v('z = r cis 90').v).toEqual(v('z = r·i').v);
    expect(v('z = r cis 90').polar).toBe(true);
    expect(v('z = r·i').polar).toBeUndefined();
  });
});
