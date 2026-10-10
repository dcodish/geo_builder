/**
 * #1891, SECOND PASS ([ADR-610](../../../docs/06-decisions.md#adr-610)) — AN N-GON OF FIVE OR MORE SIDES
 * INSCRIBED IN A CIRCLE BUILDS, AND THE CIRCLE IS DRAWN.
 *
 * Measured on `main` @ e503ec52 through `parse` with the prefix's context: **every** inscribed-n-gon sentence
 * escalated `not-handled` — «מחומש ABCDE חסום במעגל», «מחומש משוכלל ABCDE חסום במעגל», «משושה ABCDEF חסום
 * במעגל», «מתומן ABCDEFGH חסום במעגל», the English twins and the `n-gon` forms, lettered or not. The model
 * then answered with the bare noun, and `regularPolygon`'s HIDDEN scaffold circle "accounted for" the stated
 * «מעגל» in the object gate, so the regular pentagon committed GREEN WITH NO CIRCLE anywhere on the canvas.
 *
 * Root cause: `inscribedPolygon` capped its subject at four sides — `INSCRIBED_KIND` maps only the 3-/4-gon
 * kinds, the generic-polygon branch bails by its own comment ("or a 5+-gon, which this rule can't lower"),
 * and the bare-letter-run branch infers 3 or 4. The reading simply did not exist; the gate was the last net.
 *
 * Operator rulings 2026-10-09:
 *  - Q1 *"Show the circle."* — the regular n-gon's scaffold circle IS its circumcircle, so «חסום במעגל» draws it.
 *  - Q2 *"Build it too."* — the PLAIN n-gon inscribed in a circle builds as «מרובע ABCD חסום במעגל» does for
 *    four: a visible circle, n free vertices on it, unequal sides, re-samplable.
 *
 * The chokepoint: ONE scaffold emitter (`ringOnCircle`) and ONE n-gon arity reader (`ngonArity`), shared with
 * `regularPolygon` — a second copy of this lowering is how the divergence became invisible in the first place.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import { ctxOf, factsOf, replayFacts } from '../../__tests__/scenario-pipeline';
import { gateVerdict } from '../../__tests__/submit-gate';
import { firstSatisfyingSeed, meetsRequirements, searchAnotherView } from '@/replay/core';
import type { AnyCommand, Vec } from '@/engine';
import type { Fact } from '@/store/geoStore';

const NO_CTX = ctxOf([]);

function commandsFor(line: string, prefix: string[] = []): AnyCommand[] {
  const facts: Fact[] = prefix.length ? factsOf(prefix) : [];
  const r = parse(line, ctxOf(facts));
  expect(r.ok, `"${line}" parsed: ${JSON.stringify(r)}`).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  return r.commands;
}

const circleCmd = (cmds: AnyCommand[]) => cmds.find((c) => c.type === 'circle') as undefined | { type: 'circle'; hidden?: boolean; freeRadius?: boolean };
const onCircle = (cmds: AnyCommand[]) => cmds.filter((c) => c.type === 'point-on-circle') as { id: string; theta?: number; free?: boolean }[];

/** Do two non-adjacent sides of the ring properly cross? */
function crossed(pts: Vec[]): boolean {
  const n = pts.length;
  const cr = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      const [p1, p2, p3, p4] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]];
      if (cr(p3, p4, p1) * cr(p3, p4, p2) < 0 && cr(p1, p2, p3) * cr(p1, p2, p4) < 0) return true;
    }
  }
  return false;
}

const RING = (n: number) => 'ABCDEFGH'.slice(0, n).split('');

describe('#1891 — «חסום במעגל» DRAWS the circle, for every n-gon noun and both languages', () => {
  const DRAWN: [string, number][] = [
    ['מחומש משוכלל ABCDE חסום במעגל', 5],
    ['מחומש ABCDE חסום במעגל', 5],
    ['משושה ABCDEF חסום במעגל', 6],
    ['מתומן ABCDEFGH חסום במעגל', 8],
    ['המחומש המשוכלל ABCDE חסום במעגל', 5],
    ['regular pentagon ABCDE inscribed in a circle', 5],
    ['pentagon ABCDE inscribed in a circle', 5],
    ['hexagon ABCDEF inscribed in a circle', 6],
    ['regular 7-gon ABCDEFG inscribed in a circle', 7],
  ];
  for (const [line, n] of DRAWN) {
    it(`«${line}» emits a VISIBLE circle with ${n} vertices on it`, () => {
      const cmds = commandsFor(line);
      const circ = circleCmd(cmds);
      expect(circ, 'a circle is emitted').toBeTruthy();
      expect(circ!.hidden, 'the circle is NOT hidden — this is the whole ruling').toBeUndefined();
      expect(circ!.freeRadius, 'an unstated radius is a free DOF (ADR-052)').toBe(true);
      expect(onCircle(cmds).map((c) => c.id)).toEqual(RING(n));
      expect(cmds.some((c) => c.type === 'polygon')).toBe(true);
    });
  }

  it('«בר חסימה» / "cyclic" keeps the circle HIDDEN — the distinction the rule already had', () => {
    for (const line of ['מחומש ABCDE בר חסימה', 'משושה ABCDEF בר-חסימה', 'cyclic pentagon ABCDE', 'pentagon ABCDE inscribable in a circle']) {
      const circ = circleCmd(commandsFor(line));
      expect(circ, `«${line}» emits a circle`).toBeTruthy();
      expect(circ!.hidden, `«${line}» keeps the circle hidden`).toBe(true);
    }
  });

  it('«מחומש משוכלל ABCDE» (NOT inscribed) still keeps its scaffold circle hidden — regularPolygon is unchanged', () => {
    expect(circleCmd(commandsFor('מחומש משוכלל ABCDE'))!.hidden).toBe(true);
    expect(circleCmd(commandsFor('regular hexagon ABCDEF'))!.hidden).toBe(true);
  });
});

describe('#1891 — θ is PINNED for a regular subject and FREE for a plain one (the ADR-052 assertion)', () => {
  it('the commands say so', () => {
    for (const line of ['מחומש משוכלל ABCDE חסום במעגל', 'regular pentagon ABCDE inscribed in a circle', 'regular 7-gon ABCDEFG inscribed in a circle']) {
      for (const p of onCircle(commandsFor(line))) {
        expect(p.theta, `«${line}»: θ is stated`).toBeTypeOf('number');
        expect(p.free, `«${line}»: a regular n-gon is rigid up to similarity — θ is PINNED`).toBeUndefined();
      }
    }
    for (const line of ['מחומש ABCDE חסום במעגל', 'משושה ABCDEF חסום במעגל', 'pentagon ABCDE inscribed in a circle']) {
      for (const p of onCircle(commandsFor(line))) {
        expect(p.free, `«${line}»: a plain ring states nothing about its vertex angles — θ is FREE`).toBe(true);
      }
    }
  });

  it('the FIGURE says so: the plain pentagon re-samples its shape, the regular one cannot', () => {
    // similarity-invariant signature: the sorted pairwise distances, scaled by the largest
    const sig = (facts: Fact[], seed: number) => {
      const d = replay(facts, seed);
      const pts = RING(5).map((id) => d.positions.get(id)!);
      const ds: number[] = [];
      for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) ds.push(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      const m = Math.max(...ds);
      return ds.map((x) => (x / m).toFixed(3)).sort().join(',');
    };
    const plain = factsOf(['מחומש ABCDE חסום במעגל']);
    const regular = factsOf(['מחומש משוכלל ABCDE חסום במעגל']);
    const plainShapes = new Set([0, 1, 2, 3, 4, 5].map((s) => sig(plain, s)));
    const regularShapes = new Set([0, 1, 2, 3, 4, 5].map((s) => sig(regular, s)));
    expect(plainShapes.size, 'the plain pentagon is a different pentagon at another configuration').toBeGreaterThan(1);
    expect(regularShapes.size, 'the regular pentagon is the SAME pentagon at every configuration').toBe(1);
  });

  it('the regular subject really is regular, and the plain one draws UNEQUAL sides from the first view', () => {
    // The ruling: «מחומש ABCDE חסום במעגל» draws "a visible circle with five free vertices on it, UNEQUAL
    // sides". Measured at pickup, the equal 360/n starting spread drew a REGULAR pentagon at the default
    // view — a default silently asserting equal sides the student never stated (ADR-052). `cyclicSpread`
    // is the generalisation of `CYCLIC_QUAD_ANGLES`, whose own comment gives exactly this reason for the quad.
    for (const [line, n, equal] of [
      ['מחומש משוכלל ABCDE חסום במעגל', 5, true],
      ['regular pentagon ABCDE inscribed in a circle', 5, true],
      ['מחומש ABCDE חסום במעגל', 5, false],
      ['משושה ABCDEF חסום במעגל', 6, false],
      ['מתומן ABCDEFGH חסום במעגל', 8, false],
      ['pentagon ABCDE inscribed in a circle', 5, false],
    ] as [string, number, boolean][]) {
      const d = replayFacts(factsOf([line]));
      const pts = RING(n).map((id) => d.positions.get(id)!);
      const sides = pts.map((p, i) => Math.hypot(p.x - pts[(i + 1) % n].x, p.y - pts[(i + 1) % n].y));
      const spread = Math.max(...sides) - Math.min(...sides);
      if (equal) expect(spread, `«${line}» is regular`).toBeLessThan(1e-6);
      else expect(spread, `«${line}» is NOT drawn regular`).toBeGreaterThan(1e-2);
      // every side distinct, so no pair reads as an incidental equal-sides relation
      if (!equal) {
        const sorted = [...sides].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1], `«${line}»: sides are pairwise distinct`).toBeGreaterThan(1e-6);
      }
    }
  });

  it('every default spread goes once round the circle: the ring is simple at the first view, per n', () => {
    for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
      const ids = 'ABCDEFGHIJKL'.slice(0, n).split('');
      const d = replayFacts(factsOf([`regular ${n}-gon ${ids.join('')} inscribed in a circle`]));
      expect(d.lastError, `${n}-gon builds`).toBe(null);
      expect(crossed(ids.map((id) => d.positions.get(id)!)), `the regular ${n}-gon is simple`).toBe(false);
    }
  });
});

describe('#1891 — the circle is REAL: every vertex rides it and the figure is green', () => {
  for (const [line, n] of [['מחומש ABCDE חסום במעגל', 5], ['מחומש משוכלל ABCDE חסום במעגל', 5], ['משושה ABCDEF חסום במעגל', 6], ['מתומן ABCDEFGH חסום במעגל', 8]] as [string, number][]) {
    it(`«${line}»`, () => {
      const d = replayFacts(factsOf([line]));
      expect(d.lastError).toBe(null);
      expect(d.pending).toBe(false);
      expect(d.violations.map((v) => v.messageKey)).toEqual([]);
      expect(d.circles.size).toBe(1);
      const { center, r } = [...d.circles.values()][0];
      expect(r).toBeGreaterThan(1e-3);
      for (const id of RING(n)) {
        const p = d.positions.get(id)!;
        expect(Math.hypot(p.x - center.x, p.y - center.y), `${id} is on the circle`).toBeCloseTo(r, 4);
      }
      // the DEFAULT drawing is never a crossed ring
      expect(crossed(RING(n).map((id) => d.positions.get(id)!)), 'the default drawing is simple').toBe(false);
    });
  }

  it('«הציגו תצורה אחרת» keeps the pentagon and the hexagon simple at every view it offers', () => {
    for (const [line, n] of [['מחומש ABCDE חסום במעגל', 5], ['משושה ABCDEF חסום במעגל', 6]] as [string, number][]) {
      const facts = factsOf([line]);
      let cur = { facts, seed: firstSatisfyingSeed(facts) };
      for (let k = 0; k <= 12; k++) {
        const d = replay(cur.facts, cur.seed);
        expect(crossed(RING(n).map((id) => d.positions.get(id)!)), `«${line}» press ${k} (seed ${cur.seed})`).toBe(false);
        const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
        if (!next) break;
        expect(meetsRequirements(next.facts, next.seed)).toBe(true);
        cur = next;
      }
    }
  });
});

describe('#1891 — the existing-circle questions, at exact 3-/4-gon parity', () => {
  it('RE-ENTRY mints nothing: the same line twice is a clean no-op (ADR-156)', () => {
    for (const line of ['מחומש ABCDE חסום במעגל', 'מחומש משוכלל ABCDE חסום במעגל', 'משושה ABCDEF חסום במעגל']) {
      const first = factsOf([line]);
      expect(gateVerdict(first, line).kind, `«${line}» re-entered`).toBe('noop');
      const d = replay(factsOf([line, line]), 0);
      expect(d.circles.size, `«${line}»: one circle, never a second on the same centre`).toBe(1);
      expect(d.lastError).toBe(null);
    }
    // the 4-gon reference this is parity with
    expect(gateVerdict(factsOf(['מרובע ABCD חסום במעגל']), 'מרובע ABCD חסום במעגל').kind).toBe('noop');
  });

  it('a NAMED circle the figure already has is BOUND to, never re-declared (its radius is not reset)', () => {
    const cmds = commandsFor('מחומש ABCDE חסום במעגל O', ['מעגל O']);
    expect(cmds.some((c) => c.type === 'circle'), 'no second declaration of circle O').toBe(false);
    expect(onCircle(cmds).map((c) => c.id)).toEqual(RING(5));
    // the 4-gon reference
    expect(commandsFor('מרובע ABCD חסום במעגל O', ['מעגל O']).some((c) => c.type === 'circle')).toBe(false);
  });

  it('STABILITY: adding the circle to an existing «מחומש ABCDE» anchors A, B, C exactly where they were', () => {
    // The 2-D reference, measured: «מרובע ABCD» then «מרובע ABCD חסום במעגל» holds A, B, C and moves D onto
    // the circle (five arbitrary points are not concyclic, so some must move — the first three anchor it).
    const before = factsOf(['מחומש ABCDE']);
    const d0 = replay(before, 0);
    expect(gateVerdict(before, 'מחומש ABCDE חסום במעגל').kind).toBe('commit');
    const d1 = replay(factsOf(['מחומש ABCDE', 'מחומש ABCDE חסום במעגל']), 0);
    expect(d1.lastError).toBe(null);
    for (const id of ['A', 'B', 'C']) {
      const a = d0.positions.get(id)!;
      const b = d1.positions.get(id)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${id} does not jump`).toBeLessThan(1e-6);
    }
    const { center, r } = [...d1.circles.values()][0];
    for (const id of RING(5)) {
      const p = d1.positions.get(id)!;
      expect(Math.hypot(p.x - center.x, p.y - center.y), `${id} ends up on the circle`).toBeCloseTo(r, 4);
    }
  });
});

describe('#1891 — the opposite direction and the neighbours this must not touch', () => {
  it('«מעגל חסום במחומש ABCDE» keeps ADR-606’s refusal — `isCircleInPolygon` still routes it to `incircle`', () => {
    expect(parse('מעגל חסום במחומש ABCDE', NO_CTX)).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
    expect(parse('circle inscribed in pentagon ABCDE', NO_CTX)).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
    expect(parse('מעגל חסום במחומש משוכלל ABCDE', NO_CTX)).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
    // …even after the n-gon is in the figure, inscribed in its own circle
    expect(parse('מעגל חסום במחומש ABCDE', ctxOf(factsOf(['מחומש ABCDE חסום במעגל'])))).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
  });

  it('«מעגל חסום במשולש ABC» still draws the incircle, and #1941’s bare run with it', () => {
    expect(commandsFor('מעגל חסום במשולש ABC', ['משולש ABC']).some((c) => c.type === 'bisector')).toBe(true);
    expect(commandsFor('מעגל חסום ב-ABC', ['משולש ABC']).some((c) => c.type === 'bisector')).toBe(true);
  });

  it('the 3-/4-gon inscriptions are untouched', () => {
    expect(commandsFor('משולש ABC חסום במעגל').some((c) => c.type === 'triangle')).toBe(true);
    expect(onCircle(commandsFor('מרובע ABCD חסום במעגל')).every((p) => p.free)).toBe(true);
    expect(circleCmd(commandsFor('מרובע ABCD בר חסימה'))!.hidden).toBe(true);
    expect(commandsFor('טרפז ABCD חסום במעגל').some((c) => c.type === 'set-parallel')).toBe(true);
    // the #1918 contradiction refusal still fires before any label is read
    expect(parse('טרפז ישר זווית ABCD חסום במעגל', NO_CTX)).toMatchObject({ ok: false });
  });

  it('«מצולע ABCDE חסום במעגל» is left `not-handled` — «מצולע» is not an n-gon NOUN', () => {
    expect(parse('מצולע ABCDE חסום במעגל', NO_CTX)).toEqual({ ok: false, reason: 'not-handled' });
  });

  // Measured at parity with the 4-gon twin, not asserted from the plan: a compound line is split by the
  // clause fallback (ADR-264) and BOTH clauses build, and a stated radius is READ (it must never be dropped —
  // «מחומש ABCDE חסום במעגל שרדיוסו 5» refused the line until the n-gon branch stripped the consumed number
  // the way the 3-/4-gon path does).
  it('a stated magnitude on the line is read, exactly as on the 4-gon twin', () => {
    for (const [ngon, quad] of [
      ['מחומש ABCDE חסום במעגל ו-AB = 5', 'מרובע ABCD חסום במעגל ו-AB = 5'],
      ['מחומש ABCDE חסום במעגל שרדיוסו 5', 'מרובע ABCD חסום במעגל שרדיוסו 5'],
      ['pentagon ABCDE inscribed in a circle of radius 5', 'quadrilateral ABCD inscribed in a circle of radius 5'],
    ]) {
      const a = parse(ngon, NO_CTX);
      const b = parse(quad, NO_CTX);
      expect(a.ok, `«${ngon}» reads iff its 4-gon twin «${quad}» does`).toBe(b.ok);
      if (a.ok && b.ok) {
        const types = (cs: AnyCommand[]) => cs.map((c) => c.type).filter((t) => t !== 'point-on-circle' && t !== 'polygon' && t !== 'quadrilateral');
        expect(types(a.commands), `«${ngon}» reads the same extras as its twin`).toEqual(types(b.commands));
      }
    }
  });

  it('a stated numeric radius is a FIXED size on the n-gon too, never silently freed', () => {
    const cmds = commandsFor('מחומש ABCDE חסום במעגל שרדיוסו 5');
    const circ = circleCmd(cmds) as undefined | { freeRadius?: boolean; radius?: number };
    expect(circ!.freeRadius, 'a stated radius is not a free DOF').toBeUndefined();
    expect(circ!.radius).toBe(5);
    const d = replayFacts(factsOf(['מחומש ABCDE חסום במעגל שרדיוסו 5']));
    expect(d.lastError).toBe(null);
    expect([...d.circles.values()][0].r).toBeCloseTo(5, 6);
  });
});
