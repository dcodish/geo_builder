/**
 * #1622 E5 (ADR-AG-221) — the last three analytic rows of slice E: an ORDER between angle aliases, an angle NAMED by
 * a label, and an AREA LABEL on an empty canvas.
 *
 * 2-D is the reference (operator ruling 2026-10-02) and was measured through `decideDeterministic2D`:
 * - «α < β» commits `measure-order` on its variables, «α < 30» / «20 < α < 60» `measure-bound` — on an empty canvas
 *   too; they bind when «∢ABC = α» / «∢BAC = β» name the angles, and a later pin they contradict is refused.
 *   «α < 2β» and «α < AB» escalate.
 * - «נסמן זוית BAM כ-A1» draws the arms AB, AM and binds the label A1 to the angle (`angle-alias`); «כ 1», «∠CAB=A1»
 *   (after the verb), «בתור», «כזוית», "denote angle CAB as/by A1" are the same. A label already on another angle, or
 *   a point's name, is `aliasTaken` (either order). No later sentence reads A1 («A1 = 30» escalates).
 * - «נסמן את שטח ABCD ב-S» commits its area label with no quadrilateral; an area VALUE about missing points
 *   («שטח ABCD = 20», «שטח ABC = שטח ABD») is refused.
 *
 * Analytic: the order is D3's `order` selector (ADR-AG-216) with the alias as a value side, seeded into its region;
 * the label is D2's alias (ADR-AG-215) under the parameter `∠A1`; the area label introduces its quadrilateral as
 * «AB = 5» introduces A and B (ADR-AG-210). Every lock CALLS the real path — `decideSubmit`, `derive`, `parseLine`.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { angleAt } from '../engine/solve';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit, type SubmitVerdict } from '../app/submit';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
/** The unsigned angle at `v`, in degrees — the function the `angle` residual constrains. */
const deg = (d: Derivation, v: string, a: string, b: string): number => (angleAt(pt(d, v), pt(d, a), pt(d, b))! * 180) / Math.PI;
/** The area of the ring the points make, by the shoelace. */
const area = (d: Derivation, ids: string[]): number =>
  Math.abs(ids.reduce((s, id, i) => {
    const p = pt(d, id);
    const q = pt(d, ids[(i + 1) % ids.length]);
    return s + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
const clean = (lines: readonly string[], seed: number): Derivation => {
  const d = derive(lines, seed);
  expect(d.faults, `${lines.join(' · ')} @${seed}: ${JSON.stringify(d.faults)}`).toEqual([]);
  return d;
};
/** Type every line through the submit gate, as the student does; the verdicts, and the lines recorded. */
function typed(steps: readonly string[]): { verdicts: SubmitVerdict[]; lines: string[] } {
  const lines: string[] = [];
  const verdicts = steps.map((line) => {
    const v = decideSubmit(line, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    return v;
  });
  return { verdicts, lines };
}
const kinds = (steps: readonly string[]) => typed(steps).verdicts.map((v) => (v.kind === 'refused' ? `refused:${v.error.key}` : v.kind));
const factsOf = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return r.facts.map((f) => ({ ...f, src: '' }));
};
const distinct = (xs: number[]) => new Set(xs.map((x) => x.toFixed(2))).size;

describe('#1622 E5 — an order between angle aliases is D3\'s order (2-D: measure-order / measure-bound)', () => {
  it('«α < β», «α < 30», «α ≤ β», «20 < α < 60» are order SELECTORS over the aliases — no constraint, no second mechanism', () => {
    for (const line of ['α < β', 'α < 30', 'α ≤ β', '20 < α < 60', 'α > 150°']) {
      const facts = factsOf(line);
      expect(facts.length, line).toBeGreaterThan(0);
      for (const f of facts) {
        expect(f.t, line).toBe('selector');
        expect(f.t === 'selector' && f.sel.kind === 'sign' && f.sel.q.k, line).toBe('order');
      }
    }
    expect(factsOf('α ≤ β')[0]).toMatchObject({ sel: { closed: true, positive: false } });
    expect(factsOf('20 < α < 60')).toHaveLength(2);
  });

  it('a bare order builds on an EMPTY canvas, as 2-D commits it', () => {
    for (const line of ['α < β', 'α < 30', 'α ≤ β', '20 < α < 60']) expect(kinds([line]), line).toEqual(['record']);
  });

  it('typed FIRST, «α < β» binds when the aliases name angles: ∢ABC < ∢BAC at every seed, and the figure still moves', () => {
    const { verdicts, lines } = typed(['α < β', 'משולש ABC', '∢ABC = α', '∢BAC = β']);
    expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    const gaps = SEEDS.map((seed) => {
      const d = clean(lines, seed);
      expect(deg(d, 'B', 'A', 'C'), `seed ${seed}`).toBeLessThan(deg(d, 'A', 'B', 'C'));
      return deg(d, 'B', 'A', 'C');
    });
    expect(distinct(gaps)).toBeGreaterThanOrEqual(3);
  });

  it('typed AFTER, «α > β» holds the other way at every seed', () => {
    const lines = ['משולש ABC', '∢ABC = α', '∢BAC = β', 'α > β'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record', 'record']);
    for (const seed of SEEDS) {
      const d = clean(lines, seed);
      expect(deg(d, 'B', 'A', 'C'), `seed ${seed}`).toBeGreaterThan(deg(d, 'A', 'B', 'C'));
    }
  });

  it('an alias and a number: «α < 30», «α > 150», «20 < α < 60» draw the angle INSIDE the region at every seed, still varying', () => {
    const cases: Array<[string, (x: number) => boolean]> = [
      ['α < 30', (x) => x < 30],
      ['α > 150', (x) => x > 150],
      ['20 < α < 60', (x) => x > 20 && x < 60],
    ];
    for (const [order, holds] of cases) {
      const lines = [order, 'משולש ABC', '∢ABC = α'];
      expect(kinds(lines), order).toEqual(['record', 'record', 'record']);
      const angles = SEEDS.map((seed) => deg(clean(lines, seed), 'B', 'A', 'C'));
      for (const x of angles) expect(holds(x), `${order}: ${x}`).toBe(true);
      expect(distinct(angles), order).toBeGreaterThanOrEqual(3);
    }
  });

  it('a pin the order contradicts is refused ON THE PIN, naming it', () => {
    const v = typed(['α < β', 'משולש ABC', '∢ABC = α', '∢BAC = β', 'α = 50', 'β = 40']).verdicts;
    expect(v.slice(0, 5).map((x) => x.kind)).toEqual(['record', 'record', 'record', 'record', 'record']);
    expect(v[5]).toMatchObject({ kind: 'refused', error: { key: 'unsatisfiable', detail: 'β = 40' } });
  });

  it('an alias beside a LENGTH is two kinds of thing (refused by name, as «AB < ∢ABC»); «α < 2β» stays unread, as in 2-D', () => {
    expect(parseLine('α < AB')).toMatchObject({ ok: false, code: 'bad-operand' });
    expect(parseLine('α < 2β')).toMatchObject({ ok: false, code: 'not-handled' });
  });

  it('the neighbours keep their readings: a Latin domain is a parameter, a Latin pair is not an alias order', () => {
    expect(factsOf('a > 0').map((f) => f.t)).toEqual(['param']);
    expect(factsOf('0 < k < 6').map((f) => f.t)).toEqual(['param']);
    const latin = parseLine('a < b');
    expect(latin.ok && latin.facts.some((f) => f.t === 'selector' && f.sel.kind === 'sign' && f.sel.q.k === 'order')).toBe(false);
  });
});

describe('#1622 E5 — «נסמן זוית BAM כ-A1»: an angle named by a label (2-D: angle-alias)', () => {
  const base = ['משולש ABC', 'נקודה M על BC'];

  it('binds the label to the angle and draws the two arms, as 2-D does', () => {
    const lines = [...base, 'נסמן זוית BAM כ-A1'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    const facts = factsOf('נסמן זוית BAM כ-A1');
    expect(facts).toEqual([
      { t: 'constraint', k: { t: 'angle', at: { v: 'A', a: 'B', b: 'M' }, value: { kind: 'sym', name: '∠A1' } }, src: '' },
      { t: 'segment', id: 'seg-AB', a: 'A', b: 'B', ref: true, src: '' },
      { t: 'segment', id: 'seg-AM', a: 'A', b: 'M', ref: true, src: '' },
    ]);
    for (const seed of SEEDS) {
      const d = clean(lines, seed);
      expect(d.figure.segments.some((s) => s.id === 'seg-AM'), `seed ${seed}`).toBe(true);
      // The label IS the angle: the panel's ∠A1 is ∢BAM's own value.
      expect(d.figure.env['∠A1'], `seed ${seed}`).toBeCloseTo(deg(d, 'A', 'B', 'M'), 4);
    }
  });

  it('states no magnitude: the figure is exactly as free, and on a determined figure the label reads its angle', () => {
    const free = SEEDS.map((seed) => deg(clean([...base, 'נסמן זוית BAM כ-A1'], seed), 'A', 'B', 'M'));
    expect(distinct(free)).toBeGreaterThanOrEqual(3);
    const fixed = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'נסמן זוית BAC כ-A1'];
    expect(kinds(fixed)).toEqual(['record', 'record', 'record', 'record']);
    const d = clean(fixed, 0);
    expect(d.figure.env['∠A1']).toBeCloseTo(90, 6);
    expect(pt(d, 'C')).toMatchObject({ x: 0, y: 3 });
  });

  it('on an EMPTY canvas it introduces A, B, M and draws the arms, as 2-D mints them; free at every seed', () => {
    expect(kinds(['נסמן זוית BAM כ-A1'])).toEqual(['record']);
    const angles = SEEDS.map((seed) => {
      const d = clean(['נסמן זוית BAM כ-A1'], seed);
      expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'M']);
      expect(d.figure.segments.map((s) => s.id).sort()).toEqual(['seg-AB', 'seg-AM']);
      return deg(d, 'A', 'B', 'M');
    });
    expect(distinct(angles)).toBeGreaterThanOrEqual(3);
  });

  it('every spelling 2-D binds is the same statement: «כ 1» (vertex + digit), «∠CAB=A1», «בתור», «כזוית», «את הזוית», English', () => {
    const canonical = factsOf('נסמן זוית CAB כ-A1');
    for (const line of [
      'נסמן זוית CAB כ 1',
      'נסמן ∠CAB=A1',
      'נסמן ∢CAB = A1',
      'נסמן זווית CAB בתור A1',
      'נסמן זוית CAB כזוית A1',
      'נסמן את הזוית CAB כ-A1',
      'נסמן זוית CAB כ-∠A1',
      'denote angle CAB as A1',
      'denote angle CAB by A1',
      'let angle CAB be A1',
    ]) {
      expect(factsOf(line), line).toEqual(canonical);
    }
  });

  it('a GREEK name is D2\'s alias: «נסמן זוית BAM כ-α» is «∢BAM = α» (2-D commits measure-angle on α)', () => {
    expect(factsOf('נסמן זוית BAM כ-α')).toEqual(factsOf('∢BAM = α'));
    expect(kinds([...base, 'נסמן זוית BAM כ-α', 'α = 30'])).toEqual(['record', 'record', 'record', 'record']);
  });

  it('a label already on ANOTHER angle is refused naming it — never read as the equality ∢BAM = ∢MAC', () => {
    const v = typed([...base, 'נסמן זוית BAM כ-A1', 'נסמן זוית MAC כ-A1']).verdicts;
    expect(v[3]).toMatchObject({ kind: 'refused', error: { key: 'alias-taken', holder: 'A1' } });
    // The same binding restated (rays in either order) is absorbed.
    expect(kinds([...base, 'נסמן זוית BAM כ-A1', 'נסמן זוית MAB כ-A1'])[3]).toBe('already-known');
  });

  it('a label that is a POINT\'s name is refused, in either order (2-D: aliasTaken both ways)', () => {
    expect(typed(['נקודה A1', 'נסמן זוית BAM כ-A1']).verdicts[1]).toMatchObject({ kind: 'refused', error: { key: 'alias-taken', holder: 'A1' } });
    expect(typed(['משולש BAM', 'נסמן זוית BAM כ-A1', 'נקודה A1']).verdicts[2]).toMatchObject({ kind: 'refused', error: { key: 'alias-taken', holder: 'A1' } });
    expect(typed(['משולש BAM', 'נסמן זוית BAM כ-A1', 'A1(1,2)']).verdicts[2]).toMatchObject({ kind: 'refused', error: { key: 'alias-taken' } });
  });

  it('nothing reads the label later — «A1 = 30» stays unread, as in 2-D; a repeated vertex is refused', () => {
    expect(kinds([...base, 'נסמן זוית BAM כ-A1', 'A1 = 30'])[3]).toBe('refused:not-handled');
    expect(parseLine('נסמן זוית ABA כ-A1')).toMatchObject({ ok: false, code: 'repeated-vertex' });
  });
});

describe('#1622 E5 — «נסמן את שטח ABCD ב-S» on an empty canvas introduces the quadrilateral it names', () => {
  it('builds: the quadrilateral ABCD with free vertices, and S is the area of the drawn ring at every seed', () => {
    expect(kinds(['נסמן את שטח ABCD ב-S'])).toEqual(['record']);
    const areas = SEEDS.map((seed) => {
      const d = clean(['נסמן את שטח ABCD ב-S'], seed);
      expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(d.figure.segments.filter((s) => s.id.startsWith('poly-ABCD')).length).toBe(4);
      expect(d.figure.env.S, `seed ${seed}`).toBeCloseTo(area(d, ['A', 'B', 'C', 'D']), 4);
      return area(d, ['A', 'B', 'C', 'D']);
    });
    expect(areas.every((a) => a > 1e-6)).toBe(true);
    expect(distinct(areas)).toBeGreaterThanOrEqual(2);
  });

  it('the shape the student names next takes the ring over: «ריבוע ABCD», then «AB = 5» gives S = 25', () => {
    const lines = ['נסמן את שטח ABCD ב-S', 'ריבוע ABCD', 'AB = 5'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS.slice(0, 4)) {
      const d = clean(lines, seed);
      expect(d.figure.env.S).toBeCloseTo(25, 4);
      expect(Math.hypot(pt(d, 'A').x - pt(d, 'C').x, pt(d, 'A').y - pt(d, 'C').y)).toBeCloseTo(5 * Math.SQRT2, 4);
    }
  });

  it('a triangle\'s area label too; English is the same statement', () => {
    expect(kinds(['נסמן את שטח המשולש ABC ב-S'])).toEqual(['record']);
    expect(kinds(['denote the area of ABCD by S'])).toEqual(['record']);
    expect(factsOf('denote the area of ABCD by S')).toEqual(factsOf('נסמן את שטח ABCD ב-S'));
  });

  it('on a figure that has ABCD it is unchanged: no second ring', () => {
    const d = clean(['מרובע ABCD', 'נסמן את שטח ABCD ב-S'], 0);
    expect(d.figure.segments.filter((s) => s.id.startsWith('poly-')).length).toBe(4);
  });

  it('only the LABEL introduces its region: an area VALUE about points that do not exist stays refused, as in 2-D', () => {
    expect(kinds(['שטח ABCD = 20'])).toEqual(['refused:unknown-reference']);
    expect(kinds(['שטח ABC = שטח ABD'])).toEqual(['refused:unknown-reference']);
    expect(kinds(['משולש ABC', 'S_{XYZ} / S_{ABC} = 2'])[1]).toBe('refused:unknown-reference');
  });
});
