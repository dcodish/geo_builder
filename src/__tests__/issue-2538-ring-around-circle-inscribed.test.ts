/**
 * #2538 ([ADR-763](../../docs/06-decisions.md#adr-763)) — A RING AROUND A CIRCLE IS DRAWN WITH THE CIRCLE INSIDE IT.
 *
 * Measured at main 422cda84 through the commit door (`decideDeterministic2D` → `commitVerdict`, model mocked to throw):
 * «מעגל O» · «משולש ABC חוסם את מעגל O» · «ABC משולש שווה צלעות» was green at every seed, but the circle sat OUTSIDE
 * the triangle (an excircle) at 15 of 24 seeds and on 6 of 9 views of «הציגו תצורה אחרת». The same with a right angle,
 * «AB = AC», an angle, another figure inscribed in O first, a point on O first, a second triangle around O, a new
 * circle inside a quadrilateral with «AB = AD», and «AB = 8» around a radius-3 circle (wrong in the FIRST view).
 *
 * Root cause: every emitter of «a ring around a circle» stated each side's LINE tangent to the circle, never that the
 * touch lies WITHIN the side, so no layer could tell the incircle from an excircle. The fix states, for every side of
 * every ring around a circle, the order `[v, touch, w]` (`set-line … structural`), the one encoding of "tangent to a
 * side" the tangent rule already uses.
 *
 * The invariant this file locks is "shown wrong = 0": EVERY seed whose figure meets its givens has the circle inside
 * the ring, touching every side within the side, whatever the green rate is.
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));
llmParseMock.mockImplementation(() => {
  throw new Error('LIVE LLM CALLED');
});

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { searchAnotherView, meetsRequirements } from '@/replay/core';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();

async function play(lines: string[]) {
  st().clear();
  for (const line of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never,
      line,
      /[a-z]{3}/.test(line) ? 'en' : 'he',
    );
    expect(v.kind, `«${line}»`).toBe('commit');
    commitVerdict(v, line);
  }
}

type Fig = ReturnType<typeof replay>;
const cross = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const green = (facts: Fact[], fig: Fig) => facts.every((f) => !f.enabled || fig.status[f.id] === 'ok') && !fig.lastError && fig.violations.length === 0;

/** The circle's centre strictly inside the ring, and the foot from it onto every side strictly within the side. */
function inside(fig: Fig, ids: string[]): boolean {
  const c = fig.circles.get('circle-O');
  const P = ids.map((k) => fig.positions.get(k));
  if (!c || P.some((p) => !p)) return false;
  const V = P as Vec[];
  const s = V.map((p, i) => Math.sign(cross(p, V[(i + 1) % V.length], c.center)));
  if (!s.every((x) => x === s[0] && x !== 0)) return false;
  return V.every((a, i) => {
    const b = V[(i + 1) % V.length];
    const t = ((c.center.x - a.x) * (b.x - a.x) + (c.center.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    return t > 0 && t < 1;
  });
}

const T = ['A', 'B', 'C'];
const Q = ['A', 'B', 'C', 'D'];
/** [name, lines, ring, presses] — every row the plan measured shown wrong at HEAD. */
const ROWS: [string, string[], string[], number][] = [
  ['R1 equilateral (the report)', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'ABC משולש שווה צלעות'], T, 6],
  ['R1 r = 3 twin', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'ABC משולש שווה צלעות'], T, 2],
  ['R2 ∠ACB = 90°', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'זווית ACB = 90°'], T, 6],
  ['R3 right-triangle noun', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'ABC משולש ישר זווית'], T, 2],
  ['R4 AB = AC', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'AB = AC'], T, 6],
  ['R5 ∠BAC = 50°', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'זווית BAC = 50°'], T, 2],
  ['R6 circle voice', ['מעגל O', 'מעגל O חסום במשולש ABC', 'ABC משולש שווה צלעות'], T, 1],
  ['R7 English', ['circle O', 'triangle ABC circumscribes circle O', 'ABC is an equilateral triangle'], T, 1],
  ['R8 another figure inscribed first', ['מעגל O', 'משולש DEF חסום במעגל O', 'משולש ABC חוסם את מעגל O'], T, 6],
  ['P1 a point on O first', ['מעגל O', 'נקודה P על מעגל O', 'משולש ABC חוסם את מעגל O'], T, 2],
  ['Q1 quadrilateral around O + AB = AD', ['מעגל O', 'מרובע ABCD חוסם את מעגל O', 'AB = AD'], Q, 2],
  ['N1 new circle, quadrilateral + AB = AD', ['מרובע ABCD חוסם את מעגל O', 'AB = AD'], Q, 6],
  ['DEF a second triangle around O', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], ['D', 'E', 'F'], 2],
  ['X2 r = 3, AB = 8 (a real incircle triangle)', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'AB = 8'], T, 2],
];

describe('#2538: a ring around a circle is the incircle in every view a student can reach (ADR-763)', () => {
  for (const [name, lines, ids, n] of ROWS) {
    it(name, async () => {
      await play(lines);
      const facts = st().facts;
      const commitSeed = st().seed;
      let ok = 0;
      for (let seed = 0; seed < 24; seed++) {
        const fig = replay(facts, seed);
        const inn = inside(fig, ids);
        if (meetsRequirements(facts, seed)) expect(inn, `seed ${seed} meets its givens, so the circle is inside`).toBe(true);
        if (inn && green(facts, fig)) ok++;
      }
      expect(ok, 'green & inside of 24 seeds (docs/17 §9 bar)').toBeGreaterThanOrEqual(20);
      // the views a student reaches: the commit seed, then «הציגו תצורה אחרת»
      let f = facts;
      let seed = commitSeed;
      for (let k = 0; k <= n; k++) {
        const fig = replay(f, seed);
        expect(green(f, fig) && inside(fig, ids), `${k ? `press ${k}` : 'the commit view'} (seed ${seed})`).toBe(true);
        if (k === n) break;
        const nx = searchAnotherView(f, seed, undefined, 60_000);
        if (!nx) break;
        f = nx.facts;
        seed = nx.seed;
      }
    });
  }

  it('the equilateral triangle around O offers no other configuration, as a lone equilateral triangle does', async () => {
    await play(['מעגל O', 'משולש ABC חוסם את מעגל O', 'ABC משולש שווה צלעות']);
    expect(searchAnotherView(st().facts, st().seed, undefined, 60_000), 'around O').toBeNull();
    await play(['משולש שווה צלעות ABC']);
    expect(searchAnotherView(st().facts, st().seed, undefined, 60_000), 'alone').toBeNull();
  });

  it('a right angle around O still varies on «הציגו תצורה אחרת» (variety kept)', async () => {
    await play(['מעגל O', 'משולש ABC חוסם את מעגל O', 'זווית ACB = 90°']);
    let f = st().facts;
    let seed = st().seed;
    const shapes = new Set<string>();
    for (let k = 0; k < 5; k++) {
      const fig = replay(f, seed);
      const [A, B, C] = T.map((id) => fig.positions.get(id)!);
      const sides = [Math.hypot(A.x - B.x, A.y - B.y), Math.hypot(B.x - C.x, B.y - C.y), Math.hypot(C.x - A.x, C.y - A.y)];
      const m = Math.max(...sides);
      shapes.add(sides.map((s) => (s / m).toFixed(3)).join(','));
      const nx = searchAnotherView(f, seed, undefined, 60_000);
      if (!nx) break;
      f = nx.facts;
      seed = nx.seed;
    }
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });

  it('adding the relation never moves the circle (stability)', async () => {
    await play(['מעגל O', 'משולש ABC חוסם את מעגל O']);
    const before = replay(st().facts, st().seed).circles.get('circle-O')!;
    await play(['מעגל O', 'משולש ABC חוסם את מעגל O', 'ABC משולש שווה צלעות']);
    const after = replay(st().facts, st().seed).circles.get('circle-O')!;
    expect(after.center.x).toBeCloseTo(before.center.x, 9);
    expect(after.center.y).toBeCloseTo(before.center.y, 9);
    expect(after.r).toBeCloseTo(before.r, 9);
  });

  it('a figure that was right keeps its first view: the untyped triangle around O at seed 0', async () => {
    await play(['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O']);
    const fig = replay(st().facts, 0);
    // measured identical at main 422cda84 and after the fix
    const want: Record<string, [number, number]> = { A: [0.739706, 5.954228], B: [-5.526366, -2.336510], C: [4.786660, -3.617718] };
    for (const [k, [x, y]] of Object.entries(want)) {
      expect(fig.positions.get(k)!.x, k).toBeCloseTo(x, 5);
      expect(fig.positions.get(k)!.y, k).toBeCloseTo(y, 5);
    }
  });

  it('«AB = 4» around a radius-3 circle, which only an excircle can meet, is never green and never drawn outside', async () => {
    // ADR-W-158: this locks what must never happen. The interim answer (waiting for givens, operator ruling
    // "2538 - A", 2026-10-28) is not pinned as right; #2572 makes it a refusal.
    st().clear();
    await play(['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O']);
    const f0 = replay(st().facts, st().seed);
    const v = await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: f0.construction, positions: f0.positions } } as never,
      'AB = 4',
      'he',
    );
    if (v.kind !== 'commit') return; // a refusal is the end state #2572 delivers
    commitVerdict(v, 'AB = 4');
    for (let seed = 0; seed < 4; seed++) {
      const fig = replay(st().facts, seed);
      expect(green(st().facts, fig), `seed ${seed} is never green`).toBe(false);
      expect(inside(fig, T), `seed ${seed} never draws the circle outside`).toBe(true);
    }
  }, 60_000);
});
