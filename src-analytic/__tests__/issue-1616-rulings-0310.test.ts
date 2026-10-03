/**
 * The four operator rulings of 2026-10-03 on the analytic V4 stack (#1616, ADR-AG-222).
 *
 * - **#1662 — keep the median.** «משוואת התיכון AD היא …» / «משוואת הגובה AD היא …» state the median / altitude claim
 *   of the triangle the FIGURE holds with vertex A whose opposite side contains D (slice C's `cevian-of`, ADR-AG-209):
 *   one builds, several ask, none refuses — never a plain line with the claim dropped. The same foot rule narrows
 *   «AD גובה» (2-D measured: it commits after «D על BC» with two triangles on A).
 * - **#1706 — position words.** «D מעל A», «D מתחת ל-A», «C מימין ל-B», «C משמאל ל-B» are `coord-compare` selectors on
 *   analytic's fixed axes, inside an aside too. Corpus 6/5 lands whole, D(0,9) A(0,6) B(4,0) C(6,0). 2-D refuses screen
 *   orientation (`input.scope.orientation`) — an X1 exception row.
 * - **#1707 — corpus 7/4 re-checked.** The page prints «S_BDC / S_ODC = 0.8» with D on BC: impossible as printed, so the
 *   refusal stays. The exam's answer key (BC = 4√5, S_OBC = 40) is B(6,8), the reading «S_BEC / S_ODC = 0.8».
 * - **#1708 — «משולש קהה זווית ABC».** ONE of the three angles is obtuse: a `choice` over the vertices (a region choice,
 *   each option D3's «זווית ABC קהה» order), cycled by «הציגו תצורה אחרת», never a fixed default (ADR-052). 2-D: not-handled.
 *
 * Every lock CALLS the real path — `decideSubmit`, `derive`, `parseLine`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { angleAt } from '../engine/solve';
import { parseLine } from '../parser/parseAnalytic';
import { confirmTaught, decideSubmit, type SubmitVerdict } from '../app/submit';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
/** The solver's own resolution, scaled to a figure of size ~10. */
const EPS = 1e-5;

const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
const deg = (d: Derivation, v: string, a: string, b: string): number => (angleAt(pt(d, v), pt(d, a), pt(d, b))! * 180) / Math.PI;
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
  return r.facts;
};

describe('#1662 — «משוואת התיכון AD היא …» keeps the median (the triangle the figure resolves)', () => {
  it('the equation sentence states the claim as the cevian `cevian-of` reads — apex A, foot D', () => {
    expect(factsOf('משוואת התיכון AD היא y=x')).toContainEqual(expect.objectContaining({ t: 'cevian-of', role: 'median', apex: 'A', foot: 'D' }));
    expect(factsOf('משוואת הגובה AD היא y=2x+1')).toContainEqual(expect.objectContaining({ t: 'cevian-of', role: 'altitude', apex: 'A', foot: 'D' }));
  });

  it('a median: D is the midpoint of BC at every seed, and A and D are on the stated line', () => {
    const lines = typed(['משולש ABC', 'משוואת התיכון AD היא y=x']);
    expect(lines.verdicts.map((v) => v.kind)).toEqual(['record', 'record']);
    for (const seed of SEEDS) {
      const d = clean(lines.lines, seed);
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
      expect(Math.hypot(D.x - (B.x + C.x) / 2, D.y - (B.y + C.y) / 2), `@${seed}`).toBeLessThan(EPS);
      expect(Math.abs(A.y - A.x), `@${seed}`).toBeLessThan(EPS);
      expect(Math.abs(D.y - D.x), `@${seed}`).toBeLessThan(EPS);
    }
  });

  it('an altitude: AD ⊥ BC with D on the line BC, at every seed', () => {
    const lines = typed(['משולש ABC', 'משוואת הגובה AD היא y=2x+1']).lines;
    for (const seed of SEEDS) {
      const d = clean(lines, seed);
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
      const dot = (D.x - A.x) * (C.x - B.x) + (D.y - A.y) * (C.y - B.y);
      const cross = (D.x - B.x) * (C.y - B.y) - (D.y - B.y) * (C.x - B.x);
      expect(Math.abs(dot) / Math.max(1, Math.hypot(D.x - A.x, D.y - A.y) * Math.hypot(C.x - B.x, C.y - B.y)), `@${seed}`).toBeLessThan(1e-5);
      expect(Math.abs(cross) / Math.max(1, Math.hypot(C.x - B.x, C.y - B.y) ** 2), `@${seed}`).toBeLessThan(1e-5);
      expect(Math.abs(A.y - (2 * A.x + 1)), `@${seed}`).toBeLessThan(EPS);
    }
  });

  it('two triangles on A, D on neither side: it ASKS which (ambiguous-cevian) — never a plain line', () => {
    expect(kinds(['משולש ABC', 'משולש ABE', 'משוואת התיכון AD היא y=x'])).toEqual(['record', 'record', 'refused:ambiguous-cevian']);
    expect(kinds(['משולש ABC', 'משולש ABE', 'משוואת הגובה AD היא y=x'])).toEqual(['record', 'record', 'refused:ambiguous-cevian']);
  });

  it('two triangles on A, D on BC: the triangle whose opposite side contains D (the ruling)', () => {
    const { verdicts, lines } = typed(['משולש ABC', 'משולש ABE', 'D על BC', 'משוואת התיכון AD היא y=x']);
    expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    for (const seed of SEEDS.slice(0, 4)) {
      const d = clean(lines, seed);
      const [B, C, D] = ['B', 'C', 'D'].map((id) => pt(d, id));
      expect(Math.hypot(D.x - (B.x + C.x) / 2, D.y - (B.y + C.y) / 2), `@${seed}`).toBeLessThan(EPS);
    }
  });

  it('no triangle on A: refused naming the sentence — the claim cannot be kept, so the line is not recorded plain', () => {
    expect(kinds(['משוואת התיכון AD היא y=x'])).toEqual(['refused:cevian-no-triangle']);
  });

  it('the class: «AD גובה» is narrowed by the foot the same way (2-D commits it)', () => {
    const { verdicts, lines } = typed(['משולש ABC', 'משולש ABE', 'D על BC', 'AD גובה']);
    expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    const d = clean(lines, 0);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
    expect(Math.abs((D.x - A.x) * (C.x - B.x) + (D.y - A.y) * (C.y - B.y))).toBeLessThan(1e-5);
    // …and a foot on no candidate's side still asks (the #1240 lock's reading, unchanged).
    expect(kinds(['משולש ABC', 'משולש ABD', 'AE גובה'])).toEqual(['record', 'record', 'refused:ambiguous-cevian']);
  });
});

describe('#1706 — a position word between two points is a coordinate comparison (analytic only)', () => {
  it.each([
    ['D מעל A', 'D', 'y', true, 'A'],
    ['D מתחת ל-A', 'D', 'y', false, 'A'],
    ['D מתחת לA', 'D', 'y', false, 'A'],
    ['C מימין ל-B', 'C', 'x', true, 'B'],
    ['C משמאל ל-B', 'C', 'x', false, 'B'],
    ['הנקודה C נמצאת מימין לנקודה B', 'C', 'x', true, 'B'],
    ['D is above A', 'D', 'y', true, 'A'],
    ['D is below A', 'D', 'y', false, 'A'],
    ['C is to the right of B', 'C', 'x', true, 'B'],
    ['C is to the left of B', 'C', 'x', false, 'B'],
  ])('«%s» is the coord-compare selector', (line, id, axis, greater, other) => {
    expect(factsOf(line)).toEqual([expect.objectContaining({ t: 'selector', sel: { kind: 'coord-compare', id, axis, greater, rhs: { point: other } } })]);
  });

  it('a side of an AXIS is not this sentence — «D משמאל לציר ה-y» is not a comparison with a point', () => {
    const r = parseLine('D משמאל לציר ה-y');
    const sels = r.ok ? r.facts.filter((f) => f.t === 'selector' && f.sel.kind === 'coord-compare' && 'point' in f.sel.rhs) : [];
    expect(sels).toEqual([]);
  });

  it('the selector CHOOSES: on the y-axis, 3 from A(0,6), «D מעל A» puts D at (0,9) and «D מתחת ל-A» at (0,3), at every seed', () => {
    for (const [word, y] of [['D מעל A', 9], ['D מתחת ל-A', 3]] as const) {
      const lines = ['A(0,6)', 'D על ציר ה-y', 'AD = 3', word];
      expect(kinds(lines), word).toEqual(['record', 'record', 'record', 'record']);
      for (const seed of SEEDS) {
        const D = pt(clean(lines, seed), 'D');
        expect(Math.abs(D.x) + Math.abs(D.y - y), `${word} @${seed}`).toBeLessThan(EPS);
      }
    }
  });

  it('corpus 6/5 lands whole, line by line, at its printed coordinates D(0,9) A(0,6) B(4,0) C(6,0)', () => {
    const corpus: { id: string; lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
    const q = corpus.find((x) => x.id === '6/5')!;
    const { verdicts, lines } = typed(q.lines);
    expect(verdicts.map((v) => v.kind)).toEqual(q.lines.map(() => 'record'));
    for (const seed of SEEDS) {
      const d = clean(lines, seed);
      for (const [id, x, y] of [['O', 0, 0], ['A', 0, 6], ['D', 0, 9], ['B', 4, 0], ['C', 6, 0]] as const) {
        const p = pt(d, id);
        expect(Math.hypot(p.x - x, p.y - y), `${id} @${seed}`).toBeLessThan(1e-6);
      }
    }
  });

  it('the aside is read wherever it sits — each clause of the comma list keeps its own', () => {
    const facts = factsOf('A ו-D על ציר ה-y (D מעל A), B ו-C על ציר ה-x (C מימין ל-B)');
    const sels = facts.filter((f) => f.t === 'selector' && f.sel.kind === 'coord-compare').map((f) => (f.t === 'selector' ? JSON.stringify(f.sel) : ''));
    expect(new Set(sels)).toEqual(
      new Set([
        JSON.stringify({ kind: 'coord-compare', id: 'D', axis: 'y', greater: true, rhs: { point: 'A' } }),
        JSON.stringify({ kind: 'coord-compare', id: 'C', axis: 'x', greater: true, rhs: { point: 'B' } }),
      ]),
    );
  });
});

describe('#1707 — corpus 7/4 re-checked against the page: the printed ratio cannot hold', () => {
  const corpus: { id: string; lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
  const q = corpus.find((x) => x.id === '7/4')!;

  it('the corpus keeps the printed sentence «נתון: S_BDC / S_ODC = 0.8»', () => {
    expect(q.lines[4]).toBe('נתון: S_BDC / S_ODC = 0.8');
  });

  it('typed as printed, the first four lines build and the printed ratio is refused (D is on BC, so S_BDC = 0)', () => {
    const { verdicts } = typed(confirmTaught(q.lines, 0));
    expect(verdicts.map((v) => (v.kind === 'refused' ? `refused:${v.error.key}` : v.kind))).toEqual(['record', 'record', 'record', 'record', 'refused:unsatisfiable']);
  });

  it("the answer key's reading «S_BEC / S_ODC = 0.8» builds B(6,8) — BC = 4√5 and S_OBC = 40, as the exam answers", () => {
    const lines = [...confirmTaught(q.lines, 0).slice(0, 4), 'נתון: S_BEC / S_ODC = 0.8'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record', 'record', 'record']);
    const bs = SEEDS.map((seed) => {
      const B = pt(clean(lines, seed), 'B');
      return `${B.x.toFixed(3)},${B.y.toFixed(3)}`;
    });
    // B is on the line BC at the area the ratio fixes; the mirror below the axis is the other configuration.
    for (const b of bs) expect(['6.000,8.000', '14.000,-8.000']).toContain(b.replace(/-0\.000(?!\d)/g, '0.000'));
    expect(bs).toContain('6.000,8.000');
  });
});

describe('#1708 — «משולש קהה זווית ABC»: one of its angles is obtuse, a choice over the three', () => {
  const OBTUSE = ['משולש קהה זווית ABC', 'משולש קהה-זווית ABC', 'ABC משולש קהה זווית', 'obtuse triangle ABC', 'obtuse-angled triangle ABC', 'ABC is an obtuse triangle'];

  it.each(OBTUSE.map((s) => [s]))('«%s» states the triangle and a CHOICE of three obtuse-angle orders', (line) => {
    const facts = factsOf(line);
    expect(facts).toContainEqual(expect.objectContaining({ t: 'polygon', vertices: ['A', 'B', 'C'] }));
    const choice = facts.find((f) => f.t === 'selector' && f.sel.kind === 'choice');
    expect(choice, line).toBeDefined();
    const options = choice!.t === 'selector' && choice!.sel.kind === 'choice' ? choice!.sel.options : [];
    expect(options.map((o) => (o.kind === 'sign' && o.q.k === 'order' && o.q.left.t === 'angle' ? o.q.left.at.v : '?'))).toEqual(['A', 'B', 'C']);
    for (const o of options) expect(o).toMatchObject({ kind: 'sign', positive: true, q: { k: 'order', right: { t: 'value', value: { kind: 'num', value: 90 } } } });
  });

  it('every configuration is obtuse at exactly one vertex, and «הציגו תצורה אחרת» reaches all three (ADR-052)', () => {
    const at = new Set<string>();
    for (const seed of SEEDS) {
      const d = clean(['משולש קהה זווית ABC'], seed);
      const obtuse = ([['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B']] as const).filter(([v, a, b]) => deg(d, v, a, b) > 90).map(([v]) => v);
      expect(obtuse, `@${seed}`).toHaveLength(1);
      at.add(obtuse[0]);
    }
    expect(at).toEqual(new Set(['A', 'B', 'C']));
  });

  it('a later given picks the vertex: ∠A = 30, ∠B = 40 leave only C, at every seed', () => {
    const lines = ['משולש קהה זווית ABC', 'זווית BAC = 30', 'זווית ABC = 40'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS) expect(deg(clean(lines, seed), 'C', 'A', 'B'), `@${seed}`).toBeGreaterThan(90);
  });

  it('givens that leave no obtuse angle are refused on the sentence that breaks it', () => {
    expect(kinds(['משולש קהה זווית ABC', 'זווית BAC = 60', 'זווית ABC = 60'])).toEqual(['record', 'record', 'refused:unsatisfiable']);
    expect(kinds(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש קהה זווית ABC'])).toEqual(['record', 'record', 'record', 'refused:unsatisfiable']);
    expect(kinds(['A(0,0)', 'B(4,0)', 'C(5,1)', 'משולש קהה זווית ABC'])).toEqual(['record', 'record', 'record', 'record']);
  });

  it('the acute adjective is unchanged, and now reads letters-first too', () => {
    for (const line of ['משולש חד זוויות ABC', 'ABC משולש חד זוויות']) {
      expect(factsOf(line), line).toContainEqual(expect.objectContaining({ t: 'selector', sel: { kind: 'acute', ids: ['A', 'B', 'C'] } }));
    }
  });

  it('only a triangle carries it — «מרובע קהה זווית ABCD» is not read as a shape', () => {
    const r = parseLine('מרובע קהה זווית ABCD');
    expect(r.ok && r.facts.some((f) => f.t === 'polygon')).toBe(false);
  });
});
