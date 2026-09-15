/**
 * THE SHAPE REGISTRY (#1049).
 *
 * Operator, 2026-09-15: *"we need support for **all kinds of 2d shapes**. **I don't want to mention
 * each one.**"*
 *
 * These are written against that sentence rather than against a list of nouns. Two of them — the
 * geometry check and the table-shape check — fail if a future noun is implemented as a special case
 * instead of a row, which is the requirement the operator actually stated.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { SHAPES, normalizeShapeNoun, shapeRow } from '../engine/shapes';
import { parseLine } from '../parser/parseAnalytic';

type Pt = { x: number; y: number };

const at = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  return { d, p: Object.fromEntries(d.figure.points.map((q) => [q.id, q])) as Record<string, Pt> };
};
const len = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a: Pt, b: Pt) => {
  const n = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / n, y: (b.y - a.y) / n };
};
const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const u = unit(a, b);
  const v = unit(c, d);
  return u.x * v.y - u.y * v.x;
};
const dot = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const u = unit(a, b);
  const v = unit(c, d);
  return u.x * v.x + u.y * v.y;
};
const dof = (line: string) => {
  const d = derive([line], 0);
  return reportedDof(d.construction, d.figure.carrierDof);
};
const ring = (noun: string) => (shapeRow(noun)!.arity === 3 ? 'ABC' : 'ABCD');

describe('#1049 — every noun in the table BUILDS, and its givens actually HOLD', () => {
  /**
   * Verified from the PLACED POINTS, never from the constraint list: a figure that merely records
   * «AB ∥ DC» and draws something else is the exact defect ADR-AG-013 refused these nouns to avoid.
   * Four seeds each, because one configuration proves nothing about a figure free to move.
   */
  for (const seed of [0, 1, 2, 3]) {
    it(`a parallelogram really is one (seed ${seed})`, () => {
      const { p } = at(['מקבילית ABCD'], seed);
      expect(cross(p.A, p.B, p.D, p.C)).toBeCloseTo(0, 6);
      expect(cross(p.A, p.D, p.B, p.C)).toBeCloseTo(0, 6);
    });

    it(`a square has four equal sides and a right angle (seed ${seed})`, () => {
      const { p } = at(['ריבוע ABCD'], seed);
      expect(len(p.B, p.C)).toBeCloseTo(len(p.A, p.B), 5);
      expect(len(p.C, p.D)).toBeCloseTo(len(p.A, p.B), 5);
      expect(dot(p.A, p.B, p.A, p.D)).toBeCloseTo(0, 6);
    });

    it(`a kite has its two pairs of ADJACENT equal sides (seed ${seed})`, () => {
      const { p } = at(['דלתון ABCD'], seed);
      expect(len(p.A, p.D)).toBeCloseTo(len(p.A, p.B), 5);
      expect(len(p.C, p.D)).toBeCloseTo(len(p.C, p.B), 5);
    });

    it(`an isosceles trapezoid keeps BOTH givens (seed ${seed})`, () => {
      const { p } = at(['טרפז שווה שוקיים ABCD'], seed);
      expect(cross(p.A, p.B, p.D, p.C)).toBeCloseTo(0, 6);
      expect(len(p.A, p.D)).toBeCloseTo(len(p.B, p.C), 5);
    });
  }

  it('reports the freedom each noun leaves — the DOF cue must not lie', () => {
    // 8 for a quadrilateral, minus one per independent given. A noun that silently over- or
    // under-constrained would show up here before it showed up on the canvas.
    expect(dof('מרובע ABCD')).toBe(8);
    expect(dof('טרפז ABCD')).toBe(7);
    expect(dof('מקבילית ABCD')).toBe(6);
    expect(dof('דלתון ABCD')).toBe(6);
    expect(dof('מעוין ABCD')).toBe(5);
    expect(dof('מלבן ABCD')).toBe(5);
    expect(dof('ריבוע ABCD')).toBe(4);
  });
});

describe('#1049 — an unstated choice is a DISCRETE degree of freedom, and it CYCLES', () => {
  /**
   * 02c R14: *"every unstated choice is a DOF, discrete or continuous… continuous ones sample and
   * resample; discrete ones cycle"*. «משולש ישר-זווית ABC» does not say which angle is right, so
   * picking one and drawing it would assert a given the question never gave (ADR-052).
   */
  it('walks all three seats of «משולש ישר-זווית ABC» as the configuration changes', () => {
    const seats = new Set<number>();
    for (let seed = 0; seed < 3; seed += 1) {
      const { p } = at(['משולש ישר-זווית ABC'], seed);
      const dots = [dot(p.A, p.B, p.A, p.C), dot(p.B, p.A, p.B, p.C), dot(p.C, p.A, p.C, p.B)];
      // EXACTLY one: two right angles in a triangle is not a configuration, it is a bug.
      expect(dots.filter((v) => Math.abs(v) < 1e-6)).toHaveLength(1);
      seats.add(dots.findIndex((v) => Math.abs(v) < 1e-6));
    }
    expect(seats.size).toBe(3);
  });

  it('walks all three pairs of «משולש שווה שוקיים ABC»', () => {
    const apexes = new Set<string>();
    for (let seed = 0; seed < 3; seed += 1) {
      const { p } = at(['משולש שווה שוקיים ABC'], seed);
      const gaps: Array<[string, number]> = [
        ['A', Math.abs(len(p.A, p.B) - len(p.A, p.C))],
        ['B', Math.abs(len(p.B, p.A) - len(p.B, p.C))],
        ['C', Math.abs(len(p.C, p.A) - len(p.C, p.B))],
      ];
      const apex = gaps.find(([, gap]) => gap < 1e-4);
      expect(apex, `seed ${seed}`).toBeDefined();
      apexes.add(apex![0]);
    }
    expect(apexes.size).toBe(3);
  });

  it('«זווית B ישרה» CONSUMES the choice — the seat is B at every seed', () => {
    // The operator's own reason for asking: *"so I can tell the tool what is the right angle"*.
    for (let seed = 0; seed < 4; seed += 1) {
      const { p, d } = at(['משולש ישר-זווית ABC', 'זווית B ישרה'], seed);
      expect(d.faults).toEqual([]);
      expect(dot(p.B, p.A, p.B, p.C)).toBeCloseTo(0, 6);
      // NARROWED, not created: the constraint count is unchanged and what moved is the freedom.
      expect(d.outcomes[1]).toBe('narrowed');
    }
  });

  it('accepts every spelling of the right angle, and they mean one thing', () => {
    for (const line of ['זווית B ישרה', 'הזווית B היא 90', '∡B = 90', 'angle B is right']) {
      const { p, d } = at(['משולש ישר-זווית ABC', line]);
      expect(d.faults, line).toEqual([]);
      expect(dot(p.B, p.A, p.B, p.C)).toBeCloseTo(0, 6);
    }
    // Three letters need no figure at all, and must agree with the one-letter form.
    const { p } = at(['משולש ישר-זווית ABC', 'זווית ABC ישרה']);
    expect(dot(p.B, p.A, p.B, p.C)).toBeCloseTo(0, 6);
  });

  it('refuses a vertex that names no single angle, rather than guessing the rays', () => {
    expect(at(['A(0,0)', 'B(4,0)', 'C(0,3)', 'זווית A ישרה']).d.faults.map((f) => f.code)).toEqual([
      'ambiguous-angle',
    ]);
    expect(at(['משולש ABC', 'מרובע ABCD', 'זווית B ישרה']).d.faults.map((f) => f.code)).toEqual([
      'ambiguous-angle',
    ]);
  });
});

describe('#1049 — a contradiction is REPORTED, never drawn as though it held', () => {
  it('«ריבוע ABCD» with «AB = 2BC»', () => {
    expect(derive(['ריבוע ABCD', 'AB = 2BC'], 0).faults.map((f) => f.code)).toContain(
      'unsatisfiable',
    );
  });
});

describe('#1049 — the area rule reads the TABLE, not a fourth list of nouns', () => {
  /**
   * This rule had its own `משולש|מרובע|מצולע`, which is why «שטח הדלתון ABCD» was refused by a tool
   * that had just drawn the kite. Four hand-written lists of shape nouns in one file is the drift
   * ADR-043 names; a lookup is the answer to it.
   */
  it('names every registry noun', () => {
    for (const noun of Object.keys(SHAPES)) {
      const names = ring(noun);
      const d = derive([`${noun} ${names}`, `שטח ה${noun} ${names} הוא 24`], 0);
      expect(d.faults, noun).toEqual([]);
    }
  });

  it('resolves a shape named by its NOUN alone — «שטח הדלתון הוא 24»', () => {
    expect(derive(['דלתון ABCD', 'שטח הדלתון הוא 24'], 0).faults).toEqual([]);
  });

  it('and refuses that reference where it names no single shape', () => {
    expect(derive(['שטח הדלתון הוא 24'], 0).faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
    expect(
      derive(['דלתון ABCD', 'דלתון EFGH', 'שטח הדלתון הוא 24'], 0).faults.map((f) => f.code),
    ).toEqual(['ambiguous-shape']);
  });
});

describe('#1049 — adding a noun is adding a ROW', () => {
  /**
   * The operator's requirement was about the shape of the CODE: *"I don't want to mention each one"*.
   * So this asserts the mechanism rather than any noun: every row parses, brings its own arity, and
   * carries its givens as ordinary constraints. A noun implemented as a special case elsewhere would
   * satisfy none of it.
   */
  it('every row in SHAPES parses and lowers to constraints the engine already had', () => {
    for (const [noun, row] of Object.entries(SHAPES)) {
      const names = ring(noun);
      const r = parseLine(`${noun} ${names}`);
      expect(r.ok, noun).toBe(true);
      if (!r.ok) continue;
      const kinds = new Set(r.facts.map((f) => f.t));
      expect(kinds.has('polygon'), noun).toBe(true);
      // The givens the row declares, and no other fact kind — a row may not smuggle in a mechanism.
      expect([...kinds].every((k) => k === 'polygon' || k === 'constraint'), noun).toBe(true);
      expect(r.facts.filter((f) => f.t === 'constraint').length, noun).toBe(
        row.givens([...names]).length,
      );
    }
  });

  it('the arity comes from the row — «משולש ABCD» and «מקבילית ABC» are both bad arity', () => {
    expect(derive(['משולש ABCD'], 0).faults.map((f) => f.code)).toEqual(['bad-arity']);
    expect(derive(['מקבילית ABC'], 0).faults.map((f) => f.code)).toEqual(['bad-arity']);
  });

  it('a phrase that is NOT a shape noun falls through rather than being refused', () => {
    // The rule contract: a rule that does not recognise a sentence declines it, so the rules after
    // it still get their turn. «D על הצלע BC» must not be eaten by a noun-shaped matcher.
    expect(derive(['A(0,0)', 'B(4,0)', 'C(0,4)', 'משולש ABC', 'D על הצלע BC'], 0).faults).toEqual(
      [],
    );
  });

  it('the English nouns are ALIASES onto the same rows, never a second table', () => {
    const en = derive(['parallelogram ABCD'], 0);
    const he = derive(['מקבילית ABCD'], 0);
    expect(JSON.stringify(en.construction)).toBe(JSON.stringify(he.construction));
  });

  it('«מרובע ABCD» then «דלתון ABCD» is ONE ring that learns what it is', () => {
    const d = derive(['מרובע ABCD', 'דלתון ABCD'], 0);
    expect(d.faults).toEqual([]);
    const rings = d.construction.objects.filter((o) => o.kind === 'polygon');
    expect(rings).toHaveLength(1);
    expect((rings[0] as { noun?: string }).noun).toBe('דלתון');
  });

  it('normalizes «ישר-זווית» and «ישר זווית» to one row', () => {
    expect(normalizeShapeNoun('משולש ישר-זווית')).toBe(normalizeShapeNoun('המשולש ישר זווית'));
    expect(derive(['משולש ישר זווית ABC'], 0).faults).toEqual([]);
  });
});
