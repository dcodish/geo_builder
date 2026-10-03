/**
 * #1621 stream D2 (ADR-AG-215) — an angle NAMED BY A GREEK LETTER, the «נסמן» lead-in, a parameter given its value,
 * and tan / cos OF AN ANGLE.
 *
 * 2-D is the reference (operator ruling 2026-10-02) and was measured through `decideDeterministic2D`: «נסמן ∢DCB = 2α»
 * commits `measure-angle` with the variable α — the angle is the FIGURE's, α labels it — and «α = 30» then commits
 * `set-var`. Analytic has no labels: a symbol is a parameter, free and sampled until a given pins it (ADR-052), so
 * the alias is a parameter the angle given holds, and the pin is a statement the solve must satisfy. The DOF are the
 * same: an alias on a free figure leaves the figure exactly as free, and the pin removes one.
 *
 * tan (operator ruling 2026-10-01, corpus 9/4) and cos are a MEASURE of the stated angle, one-to-one on its unsigned
 * range, so «tan∢BAO = 2» fixes ∠BAO = atan 2 and leaves the orientation exactly as free as «∠BAO = 63.43» does.
 * sin is not one-to-one there and stays unread. (2-D reads every one of these as degrees — #1698, P1, filed.)
 *
 * Every lock CALLS the real path — `decideSubmit`, `derive`, `parseLine` — never a copy of it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { angleAt } from '../engine/solve';
import { parseLine } from '../parser/parseAnalytic';
import { confirmTaught, decideSubmit } from '../app/submit';

const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
/** The unsigned angle at `v`, in degrees — the SAME function the residual constrains. */
const deg = (d: Derivation, v: string, a: string, b: string): number => {
  const r = angleAt(pt(d, v), pt(d, a), pt(d, b));
  if (r === null) throw new Error(`degenerate angle ${a}${v}${b}`);
  return (r * 180) / Math.PI;
};
const clean = (d: Derivation): Derivation => {
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
};
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const ATAN2 = (Math.atan(2) * 180) / Math.PI; // 63.4349…

// ---------------------------------------------------------------------------
// The angle alias
// ---------------------------------------------------------------------------

describe('an angle named by a Greek letter — free until pinned (ADR-052)', () => {
  it('«∢ABC = α» on a free triangle builds, and α MOVES with the seed: the angle is α, inside 0°–180°', () => {
    const values = SEEDS.map((seed) => {
      const d = clean(derive(['משולש ABC', '∢ABC = α'], seed));
      const a = d.figure.env['α'];
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(180);
      expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(a, 4);
      return a;
    });
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThanOrEqual(4);
  });

  it('«2α» is half the angle, and is sampled inside 0°–90° (the range the angle allows, never a 1°–4° sliver)', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(['משולש ABC', 'נסמן ∢ABC = 2α'], seed));
      const a = d.figure.env['α'];
      expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(2 * a, 4);
      expect(deg(d, 'B', 'A', 'C')).toBeGreaterThan(10); // a recognisable triangle at every seed
    }
  });

  it('a later «α = 30» PINS it — at every seed the angle is 30°, and the rest of the triangle stays free', () => {
    const others = SEEDS.map((seed) => {
      const d = clean(derive(['משולש ABC', '∢ABC = α', 'α = 30'], seed));
      expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(30, 4);
      return deg(d, 'C', 'A', 'B').toFixed(2);
    });
    expect(new Set(others).size).toBeGreaterThanOrEqual(3);
  });

  it('one alias on two angles holds them equal; «θ = 2β» relates two aliases', () => {
    for (const seed of [0, 1, 2]) {
      const d = clean(derive(['משולש ABC', '∢ABC = β', '∢ACB = β'], seed));
      expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(deg(d, 'C', 'A', 'B'), 4);
      const e = clean(derive(['משולש ABC', '∢ABC = θ', '∢BAC = β', 'θ = 2β'], seed));
      expect(deg(e, 'B', 'A', 'C')).toBeCloseTo(2 * deg(e, 'A', 'B', 'C'), 3);
    }
  });

  it('a pin the figure contradicts is `unsatisfiable` ON THE PIN, quoting the student’s statement', () => {
    // The triangle fixes ∠ABC = 36.87°, so α = 36.87 — and «α = 30» cannot hold.
    const fixed = derive(['A(0,0)', 'B(4,0)', 'C(0,3)', '∢ABC = α', 'α = 30'], 0);
    expect(fixed.faults.find((f) => f.index === 4)).toMatchObject({ code: 'unsatisfiable', detail: 'α = 30' });
    const stated = derive(['משולש ABC', '∢ABC = 40', '∢ABC = α', 'α = 30'], 0);
    expect(stated.faults.find((f) => f.index === 3)).toMatchObject({ code: 'unsatisfiable', detail: 'α = 30' });
    // …and an alias pinned outside every angle is refused the same way.
    const wide = derive(['משולש ABC', '∢ABC = α', 'α = 200'], 0);
    expect(wide.faults.find((f) => f.index === 2)).toMatchObject({ code: 'unsatisfiable', detail: 'α = 200' });
  });

  /**
   * ADR-AG-215 am. 1 (found by stream E5): a pin on an alias NO ANGLE USES YET was never registered — its subject was
   * a string the register's structural walk cannot see — so «α = 50» · «α = 40» both recorded green. Typed one line
   * at a time through `decideSubmit`, as the student types them.
   */
  const typed = (lines: readonly string[]) => {
    const kept: string[] = [];
    return lines.map((line) => {
      const v = decideSubmit(line, kept, 0);
      if (v.kind === 'record') kept.push(v.line);
      return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
    });
  };
  it('two pins on an unused alias: the second is refused `unsatisfiable`, naming it; a repeat is already known', () => {
    expect(typed(['α = 50', 'α = 40'])).toEqual(['record', 'refused:unsatisfiable']);
    expect(derive(['α = 50', 'α = 40'], 0).faults.find((f) => f.index === 1)).toMatchObject({ code: 'unsatisfiable', detail: 'α = 40' });
    expect(typed(['α = 50', 'α = 50'])).toEqual(['record', 'already-known']);
    expect(typed(['θ = 2β', 'β = 20', 'θ = 50'])).toEqual(['record', 'record', 'refused:unsatisfiable']);
  });
  it('a consistent pin on an unused alias records, holds its value, and binds the angle that uses it later', () => {
    expect(typed(['α = 50'])).toEqual(['record']);
    expect(clean(derive(['α = 50'], 0)).figure.env['α']).toBeCloseTo(50, 4);
    expect(typed(['α = 50', 'β = 40'])).toEqual(['record', 'record']);
    for (const seed of [0, 1, 2]) {
      const d = clean(derive(['α = 50', 'משולש ABC', '∢ABC = 2α'], seed));
      expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(100, 3);
    }
    // …and an angle that cannot take the pinned value is refused on the angle.
    expect(typed(['α = 200', 'משולש ABC', '∢ABC = α'])).toEqual(['record', 'record', 'refused:unsatisfiable']);
  });
  it('the sweep: two pins, then the angle; the angle, then two pins; the angle, then a repeated pin', () => {
    expect(typed(['α = 50', 'α = 40', 'משולש ABC', '∢ABC = α'])[1]).toBe('refused:unsatisfiable');
    expect(typed(['משולש ABC', '∢ABC = α', 'α = 50', 'α = 40'])).toEqual(['record', 'record', 'record', 'refused:unsatisfiable']);
    expect(typed(['משולש ABC', '∢ABC = α', 'α = 50', 'α = 50'])).toEqual(['record', 'record', 'record', 'already-known']);
  });

  it('a pin the figure AGREES with builds (the determined angle’s own value)', () => {
    const d = clean(derive(['A(0,0)', 'B(4,0)', 'C(0,3)', '∢ABC = 2a'], 0));
    expect(2 * d.figure.env['a']).toBeCloseTo((Math.atan(3 / 4) * 180) / Math.PI, 3);
  });

  it('Greek and Latin never meet: `a` and `α` are two parameters, π stays the constant, x = 3 stays a line', () => {
    const d = clean(derive(['משולש ABC', '∢ABC = α', 'AB = a'], 0));
    expect(Object.keys(d.figure.env).sort()).toEqual(['a', 'α']);
    expect(d.figure.env['a']).not.toBeCloseTo(d.figure.env['α'], 3);
    const pi = clean(derive(['A(0,0)', 'נקודה B', 'AB = 2π'], 0));
    expect(Object.keys(pi.figure.env)).toEqual([]);
    const line = parseLine('x = 3');
    expect(line.ok && line.facts[0].t).toBe('curve');
  });

  it('every spelling lowers to ONE statement: «נסמן», «נסמן:», the bare line, «זווית», English «let»', () => {
    const facts = (s: string) => {
      const r = parseLine(s);
      if (!r.ok) throw new Error(`${s}: ${r.code}`);
      return r.facts.map((f) => (f.t === 'constraint' ? f.k : f.t));
    };
    const one = facts('∢DCB = 2α');
    for (const s of ['נסמן ∢DCB = 2α', 'נסמן: ∢DCB = 2α', 'נסמן זווית DCB = 2α', 'let ∠DCB = 2α', 'angle DCB = 2α']) expect(facts(s), s).toEqual(one);
    // «נסמן» before a clause no rule reads stays unread — it is a lead-in, never a reading of its own. (The area LABEL
    // «נסמן את שטח ABCD ב-S» reads since #1622, ADR-AG-218, so the lead-in is shown on a clause that still does not.)
    const area = parseLine('נסמן את המשולש ABC ב-T');
    expect(area.ok ? 'built' : area.code).toBe('not-handled');
  });
});

// ---------------------------------------------------------------------------
// tan and cos of an angle
// ---------------------------------------------------------------------------

describe('tan and cos of an angle — a measure of the angle (operator ruling 2026-10-01)', () => {
  it('every spelling of tan is the same constraint: tan∢, tan(∢), tg, «טנגנס הזווית … הוא», English', () => {
    const k = (s: string) => {
      const r = parseLine(s);
      if (!r.ok) throw new Error(`${s}: ${r.code}`);
      return r.facts.map((f) => (f.t === 'constraint' ? f.k : f));
    };
    const one = k('tan∢BAO = 2');
    expect(one).toEqual([{ t: 'angle', at: { v: 'A', a: 'B', b: 'O' }, value: { kind: 'num', value: 2 }, measure: 'tan' }]);
    for (const s of ['tan(∢BAO) = 2', 'tg∢BAO = 2', 'tan ∠BAO = 2', 'טנגנס הזווית BAO הוא 2', 'the tangent of angle BAO is 2', 'tan of angle BAO = 2']) {
      expect(k(s), s).toEqual(one);
    }
    expect(k('קוסינוס הזווית ACB = 3/4')).toEqual(k('cos∢ACB = 3/4'));
  });

  it('tan∢ABC = 2 is atan 2 at every seed; a NEGATIVE tan is the obtuse angle; the triangle stays free', () => {
    const others = SEEDS.map((seed) => {
      const d = clean(derive(['משולש ABC', 'tan∢ABC = 2'], seed));
      expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(ATAN2, 4);
      const o = clean(derive(['משולש ABC', 'tan(∢ABC) = -2'], seed));
      expect(deg(o, 'B', 'A', 'C')).toBeCloseTo(180 - ATAN2, 4);
      return deg(d, 'A', 'B', 'C').toFixed(2);
    });
    expect(new Set(others).size).toBeGreaterThanOrEqual(3);
  });

  it('the one-letter vertex resolves through the M1 resolver, as «זווית B = 45» does', () => {
    const d = clean(derive(['משולש ABC', 'tan B = 1'], 0));
    expect(deg(d, 'B', 'A', 'C')).toBeCloseTo(45, 4);
  });

  it('cos∢ACB = 3/4 is acos ¾; a cosine outside [−1, 1] is `unsatisfiable`, quoting the statement', () => {
    for (const seed of [0, 1, 2]) {
      const d = clean(derive(['משולש ABC', 'קוסינוס הזווית ACB = 3/4'], seed));
      expect(deg(d, 'C', 'A', 'B')).toBeCloseTo((Math.acos(0.75) * 180) / Math.PI, 4);
    }
    const bad = derive(['משולש ABC', 'cos∢ACB = 3/2'], 0);
    expect(bad.faults).toEqual([expect.objectContaining({ index: 1, code: 'unsatisfiable', detail: 'cos∢ACB = 3/2' })]);
  });

  it('a tan that contradicts a determined angle is `unsatisfiable`; one that agrees builds', () => {
    const agree = derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'tan∢ABC = 3/4'], 0);
    expect(agree.faults).toEqual([]);
    const disagree = derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'tan∢ABC = 2'], 0);
    expect(disagree.faults.find((f) => f.index === 3)).toMatchObject({ code: 'unsatisfiable' });
  });

  it('a tan parameter is pinned by the figure (tan∢ABC = k on a fixed triangle gives k = ¾)', () => {
    const d = clean(derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'tan∢ABC = k'], 0));
    expect(d.figure.env['k']).toBeCloseTo(0.75, 4);
  });

  it('sin is NOT read — sin θ = sin(180° − θ) is a choice this measure does not carry (ADR-AG-215 "not built")', () => {
    for (const s of ['sin∢ACB = 1/2', 'סינוס הזווית ACB = 1/2']) {
      const d = derive(['משולש ABC', s], 0);
      expect(d.faults.map((f) => [f.index, f.code]), s).toEqual([[1, 'not-handled']]);
    }
  });
});

// ---------------------------------------------------------------------------
// The corpus questions this stream completes
// ---------------------------------------------------------------------------

interface CorpusQuestion {
  id: string;
  lines: string[];
}
const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const question = (id: string): string[] => confirmTaught(CORPUS.find((c) => c.id === id)!.lines, 0);

/** Typed one at a time, the app records each line — the submit path, not only the fold. */
const typedInOrder = (lines: readonly string[]) => {
  const kept: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, kept, 0);
    expect(v.kind, `«${line}»: ${JSON.stringify(v)}`).toBe('record');
    kept.push(v.kind === 'record' ? v.line : line);
  }
  return kept;
};

describe('corpus 471 — the questions D2 completes, line by line', () => {
  it('1/4: the right trapezoid with its bisectors meeting on AD; «נסמן ∢DCB = 2α» gives α = atan ½', () => {
    const kept = typedInOrder(question('1/4'));
    const d = clean(derive(kept, 0));
    expect(pt(d, 'A')).toMatchObject({ x: expect.closeTo(-0.2, 4), y: expect.closeTo(4.4, 4) });
    expect(pt(d, 'B')).toMatchObject({ x: expect.closeTo(1, 4), y: expect.closeTo(4, 4) });
    expect(pt(d, 'C')).toMatchObject({ x: expect.closeTo(3, 4), y: expect.closeTo(-2, 4) });
    expect(pt(d, 'D')).toMatchObject({ x: expect.closeTo(-1.8, 4), y: expect.closeTo(-0.4, 4) });
    expect(pt(d, 'E')).toMatchObject({ x: expect.closeTo(-1, 4), y: expect.closeTo(2, 4) });
    expect(d.figure.env['α']).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 3);
    expect(deg(d, 'C', 'D', 'B')).toBeCloseTo(2 * d.figure.env['α'], 3);
  });

  it('3/4: the trapezoid whose diagonal DB bisects ∢ADC; «נסמן: זווית ADB = α» gives α = atan ¾', () => {
    const kept = typedInOrder(question('3/4'));
    const d = clean(derive(kept, 0));
    expect(pt(d, 'A')).toMatchObject({ x: expect.closeTo(0, 4), y: expect.closeTo(3, 4) });
    expect(pt(d, 'B')).toMatchObject({ x: expect.closeTo(4, 4), y: expect.closeTo(0, 4) });
    expect(pt(d, 'C')).toMatchObject({ x: expect.closeTo(4, 4), y: expect.closeTo(-6, 4) });
    expect(pt(d, 'D')).toMatchObject({ x: expect.closeTo(-4, 4), y: expect.closeTo(0, 4) });
    expect(pt(d, 'E')).toMatchObject({ x: expect.closeTo(4 / 3, 4), y: expect.closeTo(0, 4) });
    expect(d.figure.env['α']).toBeCloseTo((Math.atan(0.75) * 180) / Math.PI, 3);
  });

  it('9/4: the rectangle with B on the y-axis, A and C on the x-axis; tan∢BAO = 2 and AO = 3 give BO = 6 — every seed', () => {
    const kept = typedInOrder(question('9/4'));
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const d = clean(derive(kept, seed));
      const [A, B, C, O] = ['A', 'B', 'C', 'O'].map((id) => pt(d, id));
      expect(O).toMatchObject({ x: expect.closeTo(0, 9), y: expect.closeTo(0, 9) });
      expect(Math.abs(A.x)).toBeCloseTo(3, 4);
      expect(A.y).toBeCloseTo(0, 4);
      expect(B.x).toBeCloseTo(0, 4);
      expect(Math.abs(B.y)).toBeCloseTo(6, 4);
      expect(C.y).toBeCloseTo(0, 4);
      expect(Math.abs(C.x)).toBeCloseTo(12, 4); // BA ⊥ BC: OC = OB²/OA
      expect(deg(d, 'A', 'B', 'O')).toBeCloseTo(ATAN2, 3);
      seen.add(`${Math.sign(A.x)},${Math.sign(B.y)}`);
    }
    // The tan given fixes the angle, never the orientation: the configurations still differ in their reflection.
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
