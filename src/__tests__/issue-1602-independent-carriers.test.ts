/**
 * #1602 (ADR-557) — independent driven points are solved one at a time, exactly; ⟂/∥ riders root exactly.
 *
 * Class 1: SEVERAL driven parameters that do not reach one another were sent to the joint Nelder–Mead
 * optimizer merely for being more than one. Two tangents from P («PA ו PB משיקים למעגל») became a 2-D
 * search whose every step re-evaluated the whole figure — ~2 s per sample on the operator's #1601 figure,
 * and 5 of 16 seeds lost. They now take the ADR-028 1-D path in dependency order; a genuinely COUPLED set
 * (a common tangent's two touch points) keeps the joint solver.
 *
 * Class 2: an `on-segment-solved` point driven by ⟂ / ∥ / collinear was placed by a 257-step grid scan,
 * which then ran inside every step of any solve upstream of it. Those conditions are polynomials of degree
 * ≤ 2 in the rider's t, so their roots are computed exactly; the lock below holds them to the scan's roots.
 *
 * Every lock here counts OPERATIONS (joint-optimizer calls), never time — the operator's ruling on #1601.
 */
import { describe, it, expect } from 'vitest';
import type { Constraint, Id, Vec } from '@/engine';
import { directionRoots } from '@/engine/solve';
import { drivenSolveStats } from '@/engine/evaluate';
import { residual } from '@/engine';
import { solveParam } from '@/engine/geometry';
import { dryRunOutcome, samplingJobs } from '@/replay/core';
import { parse, buildParseCtx } from '@/parser';
import { factsOf, replayFacts } from './scenario-pipeline';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Joint-optimizer calls spent building a sequence's whole 16-sample pool. */
function jointCallsForPool(lines: string[]): number {
  const facts = factsOf(lines);
  const before = drivenSolveStats.joint;
  const { jobs, finish } = samplingJobs(facts);
  for (const j of jobs) j();
  finish(true);
  return drivenSolveStats.joint - before;
}

/** The touch point really is a tangency: OT ⟂ PT with T off the centre. */
function expectTangent(pos: Map<Id, Vec>, T: Id, O = 'O', X = 'P') {
  const o = pos.get(O)!, t = pos.get(T)!, x = pos.get(X)!;
  const dot = (t.x - o.x) * (t.x - x.x) + (t.y - o.y) * (t.y - x.y);
  expect(Math.abs(dot) / (dist(o, t) * dist(t, x)), `O${T} ⟂ ${X}${T}`).toBeLessThan(1e-6);
}

const OPENER = ['מעגל O', 'נקודה P מחוץ למעגל'];

describe('#1602 class 1 — independent driven points never reach the joint optimizer', () => {
  const spellings: [string, string][] = [
    ['corner form (he)', 'PA ו PB משיקים למעגל'],
    ['corner form (en)', 'PA and PB are tangent to the circle'],
  ];
  for (const [name, line] of spellings) {
    it(`${name}: «${line}» — both tangents hold, A ≠ B, and the pool spends 0 joint solves`, () => {
      const d = replayFacts(factsOf([...OPENER, line]));
      expect(d.lastError).toBeNull();
      expectTangent(d.positions, 'A');
      expectTangent(d.positions, 'B');
      expect(dist(d.positions.get('A')!, d.positions.get('B')!), 'the two touch points are distinct').toBeGreaterThan(0.1);
      expect(jointCallsForPool([...OPENER, line])).toBe(0);
    });
  }

  it('the operator\'s #1601 figure, both spellings of the C line: 16/16 samples, 0 joint solves', () => {
    for (const c of ['C על הקוטר DB', 'C נמצאת על DB']) {
      const lines = [...OPENER, 'PA ו PB משיקים למעגל', 'המשך BO חותך את המעגל בנקודה D', 'PO', 'AD', c, 'AC⊥DB', 'PD חותך את AC בנקודה E', 'EC=x'];
      expect(jointCallsForPool(lines), `«${c}»`).toBe(0);
      const { jobs, finish } = samplingJobs(factsOf(lines));
      for (const j of jobs) j();
      expect(finish(true).samples.length, `«${c}»: every sample survives`).toBe(16);
    }
  });

  it('a genuinely COUPLED pair — a common tangent\'s two touch points — still uses the joint solver', () => {
    const lines = ['שני מעגלים זרים', 'AB משיק משותף חיצוני'];
    const d = replayFacts(factsOf(lines));
    expect(d.lastError).toBeNull();
    expect(jointCallsForPool(lines)).toBeGreaterThan(0);
  });
});

describe('#1602 class 3 — a relation the construction already guarantees claims no carrier', () => {
  const drivenBy = (lines: string[]) =>
    replayFacts(factsOf(lines)).construction.objects.filter((o) => (o as { solve?: unknown }).solve !== undefined).map((o) => o.id);
  const PREFIX = [...OPENER, 'PA ו PB משיקים למעגל', 'המשך BO חותך את המעגל בנקודה D'];

  it('«C על הקוטר DB» after D was built on line BO: the restated D·O·B collinearity drives nothing (was: the centre O)', () => {
    expect(drivenBy([...PREFIX, 'C על הקוטר DB'])).not.toContain('O');
    expect(drivenBy([...PREFIX, 'C על הקוטר DB'])).toEqual(drivenBy([...PREFIX, 'C נמצאת על DB']));
  });

  it('entry order: the same diameter statement BEFORE D exists (D new) still puts D on the diameter', () => {
    const d = replayFacts(factsOf([...OPENER, 'PA ו PB משיקים למעגל', 'C על הקוטר DB']));
    expect(d.lastError).toBeNull();
    const o = d.positions.get('O')!, dd = d.positions.get('D')!, b = d.positions.get('B')!;
    expect(Math.abs((dd.x - o.x) * (b.y - o.y) - (dd.y - o.y) * (b.x - o.x)), 'D, O, B collinear').toBeLessThan(1e-6);
  });

  it('a collinearity that is NOT implied still claims a carrier, and holds', () => {
    const d = replayFacts(factsOf(['משולש ABC', 'M אמצע BC', 'D נמצאת על AB', 'E נמצאת על המשך AC', 'ישר DME']));
    expect(d.lastError).toBeNull();
    const [D, E, M] = ['D', 'E', 'M'].map((id) => d.positions.get(id)!);
    expect(Math.abs((E.x - D.x) * (M.y - D.y) - (E.y - D.y) * (M.x - D.x)), 'D, M, E collinear').toBeLessThan(1e-6);
    const solved = d.construction.objects.filter((o) => (o as { solve?: unknown }).solve !== undefined || o.kind === 'on-segment-solved');
    expect(solved.length, 'the collinearity placed something').toBeGreaterThan(0);
  });
});

describe('#1602 — the "already implied" door reads the DRIVEN constraints a step adds, not only its checks', () => {
  const outcome = (prefix: string[], line: string) => {
    const facts = factsOf(prefix);
    const d = replayFacts(facts);
    const r = parse(line, buildParseCtx(d.construction, d.positions));
    if (!r.ok) throw new Error(`«${line}» did not parse`);
    return dryRunOutcome(facts, r.commands, 0);
  };

  it('«AB משיק למעגל בנקודה F» on a cyclic GCHF: its implied half («F on the circle») no longer hides the tangency that drives F', () => {
    const prefix = ['משולש ABC ישר זוית', 'נקודות F, G, H נמצאות על הישרים AB, AC, CB', 'מרובע GCHF חסום במעגל'];
    expect(outcome(prefix, 'AB משיק למעגל בנקודה F')).toEqual({ produced: true });
  });

  it('a genuine restatement is still declined at the door (#999)', () => {
    expect(outcome(['משולש ABC', 'זווית ABC = 90'], 'AB ⟂ BC')).toEqual({ produced: false, reason: 'implied' });
  });
});

describe('#1602 class 2 — exact ⟂ / ∥ / collinear roots on a rider equal the grid scan\'s', () => {
  // A deterministic LCG, so a failure names a reproducible case.
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 10 - 5;
  const kinds: Constraint['type'][] = ['perpendicular', 'parallel', 'collinear'];
  it('600 random configurations: same roots (to 1e-6), same count', () => {
    let compared = 0;
    for (let n = 0; n < 600; n++) {
      const type = kinds[n % 3];
      const a = { x: rnd(), y: rnd() }, b = { x: rnd(), y: rnd() };
      const pos = new Map<Id, Vec>([['P', { x: rnd(), y: rnd() }], ['Q', { x: rnd(), y: rnd() }], ['R', { x: rnd(), y: rnd() }]]);
      // the rider X appears in one or both compared vectors, in varying slots
      const con = (
        type === 'collinear'
          ? { type, a: 'P', b: 'X', c: n % 2 ? 'Q' : 'X' }
          : n % 2
            ? { type, a: 'P', b: 'X', c: 'Q', d: 'R' }
            : { type, a: 'X', b: 'P', c: 'X', d: 'Q' }
      ) as Constraint;
      if (type === 'collinear' && (con as { c: Id }).c === 'X') continue; // X twice in one ray — degenerate by construction
      const exact = directionRoots(con, 'X', a, b, pos, 0, 1);
      if (exact === null) continue;
      const f = (t: number) => residual(con, (id) => (id === 'X' ? { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) } : pos.get(id)!));
      const grid = solveParam(f);
      // the grid also brackets the NaN holes where the rider hits a referenced point; both paths drop those
      // downstream, so compare only roots away from them
      const clean = (ts: number[]) => ts.filter((t) => [...pos.values()].every((q) => Math.hypot(a.x + t * (b.x - a.x) - q.x, a.y + t * (b.y - a.y) - q.y) > 1e-3));
      const e = clean(exact), g = clean(grid);
      expect(e.length, `case ${n} (${type}): exact ${JSON.stringify(exact)} vs grid ${JSON.stringify(grid)}`).toBe(g.length);
      e.forEach((t, i) => expect(Math.abs(t - g[i]), `case ${n} root ${i}`).toBeLessThan(1e-6));
      compared++;
    }
    expect(compared, 'the sweep actually compared cases (not vacuous)').toBeGreaterThan(300);
  });
});
