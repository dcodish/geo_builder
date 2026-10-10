/**
 * #1941 ([ADR-609](../../../docs/06-decisions.md#adr-609)) — «מעגל חסום ב-ABC», A RING NAMED ONLY BY ITS
 * LETTERS, DRAWS THE INSCRIBED CIRCLE, NEVER THE CIRCLE THROUGH THE VERTICES.
 *
 * Measured on `main` @ 8e0debff: «משולש ABC» · «מעגל חסום ב-ABC» emitted a single `circumcircle` — the circle
 * THROUGH A, B, C, green — and «ריבוע ABCD» · «מעגל חסום ב-ABCD» emitted `circumcircle + set-concyclic +
 * quadrilateral`. The control «מעגל חסום במשולש ABC» drew the incircle correctly.
 *
 * Root cause: `isCircleInPolygon` decides the DIRECTION of every inscription sentence, and both of its
 * container tests need a polygon NOUN. With no noun it fell through to an index comparison that requires
 * `polyIdx >= 0`, which a noun-less sentence can never satisfy — so the line was read as "ABC is inscribed in
 * a circle" and `inscribedPolygon` built the CONVERSE figure. The direction test is the one chokepoint both
 * rules consult; the marker riding a bare letter run is now ONE spelling (`markerOnBareRun`) shared with the
 * arity reader that already knew it for n ≥ 5 (ADR-606).
 *
 * Operator ruling 2026-10-09 (option A, "Draw the incircle"): the bare-run spelling CONVERGES on the noun
 * spelling, for three and four letters, in both languages. Five or more keeps ADR-606's known-limit refusal.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { ctxOf, factsOf, replayFacts } from '../../__tests__/scenario-pipeline';
import type { Fact } from '@/store/geoStore';
import type { Vec } from '@/engine';

const NO_CTX = ctxOf([]);

/** The commands `line` lowers to against `prefix` — the app's own path (parse with the prefix's context). */
function commandsFor(prefix: string[], line: string) {
  const facts: Fact[] = prefix.length ? factsOf(prefix) : [];
  const r = parse(line, ctxOf(facts));
  expect(r.ok, `"${line}" parsed: ${JSON.stringify(r)}`).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  return r.commands;
}

/** Perpendicular distance from `p` to the LINE through `a`,`b` — the tangency measure for a side. */
function distToLine(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  expect(len).toBeGreaterThan(1e-6);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

describe('#1941 — the bare-run incircle CONVERGES on the noun spelling', () => {
  // This is the ruling, stated as a test: the two spellings are the same sentence, so they must lower
  // identically. A future divergence between them is exactly the defect this issue reported.
  const CONVERGE: [string, string[], string, string][] = [
    ['3 letters, Hebrew', ['משולש ABC'], 'מעגל חסום ב-ABC', 'מעגל חסום במשולש ABC'],
    ['4 letters, Hebrew', ['מרובע ABCD'], 'מעגל חסום ב-ABCD', 'מעגל חסום במרובע ABCD'],
    ['3 letters, «בתוך» spelled out', ['משולש ABC'], 'מעגל חסום בתוך ABC', 'מעגל חסום במשולש ABC'],
    ['3 letters, definite «החסום»', ['משולש ABC'], 'המעגל החסום ב-ABC', 'מעגל חסום במשולש ABC'],
    ['3 letters, English', ['triangle ABC'], 'circle inscribed in ABC', 'circle inscribed in triangle ABC'],
    ['4 letters, English', ['quadrilateral ABCD'], 'circle inscribed in ABCD', 'circle inscribed in quadrilateral ABCD'],
  ];
  for (const [what, prefix, bare, noun] of CONVERGE) {
    it(`${what}: «${bare}» lowers exactly as «${noun}»`, () => {
      expect(commandsFor(prefix, bare)).toEqual(commandsFor(prefix, noun));
    });
  }

  it('the bare run needs no prefix figure either — the ring is declared by the sentence', () => {
    const cmds = parse('מעגל חסום ב-ABC', NO_CTX);
    expect(cmds.ok).toBe(true);
    if (!cmds.ok) return;
    expect(cmds.commands.some((c) => c.type === 'triangle')).toBe(true);
    expect(cmds.commands.some((c) => c.type === 'circumcircle')).toBe(false);
  });
});

describe('#1941 — the circle is TANGENT to every side, not through the vertices', () => {
  const TANGENT: [string, string[], number][] = [
    ['triangle', ['משולש ABC', 'מעגל חסום ב-ABC'], 3],
    ['quadrilateral', ['ריבוע ABCD', 'מעגל חסום ב-ABCD'], 4],
    ['triangle, English', ['triangle ABC', 'circle inscribed in ABC'], 3],
    ['quadrilateral, English', ['square ABCD', 'circle inscribed in ABCD'], 4],
  ];
  for (const [what, steps, n] of TANGENT) {
    it(`${what}: one radius touches all ${n} sides, and no vertex is on the circle`, () => {
      const d = replayFacts(factsOf(steps));
      expect(d.lastError).toBe(null);
      const ids = ['A', 'B', 'C', 'D'].slice(0, n);
      const verts = ids.map((id) => {
        const p = d.positions.get(id);
        expect(p, `${id} placed`).toBeTruthy();
        return p!;
      });
      const circle = [...d.circles.values()][0];
      expect(circle, 'a circle was drawn').toBeTruthy();
      expect(d.circles.size).toBe(1);
      const r = circle.r;
      expect(r).toBeGreaterThan(1e-3);
      for (let i = 0; i < n; i++) {
        // tangency: the centre sits exactly one radius from the LINE of every side
        expect(distToLine(circle.center, verts[i], verts[(i + 1) % n])).toBeCloseTo(r, 4);
      }
      // the circumcircle — the bug — would put every VERTEX at distance r instead
      for (const v of verts) expect(Math.hypot(v.x - circle.center.x, v.y - circle.center.y)).toBeGreaterThan(r * 1.05);
    });
  }
});

describe('#1941 — the opposite reading stays disjoint (the one way this fix could regress)', () => {
  // «ABC חסום במעגל» puts the "in" marker on «מעגל», so the CIRCLE is the container: the circle through the
  // vertices is correct here and must be untouched. The new bare-run branch only fires when the marker is NOT
  // on the circle, so the two readings can never both claim a sentence.
  const CONVERSE: [string[], string][] = [
    [['משולש ABC'], 'ABC חסום במעגל'],
    [['triangle ABC'], 'ABC inscribed in a circle'],
    [['מרובע ABCD'], 'ABCD חסום במעגל'],
    [['quadrilateral ABCD'], 'ABCD inscribed in a circle'],
  ];
  for (const [prefix, line] of CONVERSE) {
    it(`«${line}» still draws the circle THROUGH the vertices`, () => {
      const cmds = commandsFor(prefix, line);
      expect(cmds.some((c) => c.type === 'circumcircle' || c.type === 'set-concyclic')).toBe(true);
      expect(cmds.some((c) => c.type === 'bisector')).toBe(false); // no incircle construction
    });
  }

  it('«ABCD בר חסימה» keeps its hidden-circle cyclic reading', () => {
    const cmds = commandsFor(['מרובע ABCD'], 'ABCD בר חסימה');
    expect(cmds.some((c) => c.type === 'set-concyclic')).toBe(true);
  });
});

describe('#1941 — what stays refused (ADR-606 and the untouched gaps)', () => {
  it('five letters keep ADR-606’s known-limit refusal, with the arity', () => {
    const r = parse('מעגל חסום ב-ABCDE', NO_CTX);
    expect(r).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
  });

  it('six letters too — the refusal reads the run, not the reported length', () => {
    expect(parse('מעגל חסום ב-ABCDEF', NO_CTX)).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 6 });
    expect(parse('circle inscribed in ABCDE', NO_CTX)).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
  });

  it('«מעגל חסום במצולע ABCD» and «מעגל חסום ב-AB» are left `not-handled`, as before the fix', () => {
    expect(parse('מעגל חסום במצולע ABCD', ctxOf(factsOf(['מרובע ABCD'])))).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse('מעגל חסום ב-AB', ctxOf(factsOf(['משולש ABC'])))).toEqual({ ok: false, reason: 'not-handled' });
  });

  it('the lettered noun spellings this fix must not disturb still build', () => {
    expect(commandsFor(['משולש ABC'], 'מעגל חסום במשולש ABC').some((c) => c.type === 'bisector')).toBe(true);
    expect(commandsFor(['טרפז ABCD'], 'מעגל חסום בטרפז ABCD').some((c) => c.type === 'bisector')).toBe(true);
    expect(commandsFor(['דלתון ABCD'], 'מעגל חסום בדלתון ABCD').some((c) => c.type === 'bisector')).toBe(true);
  });
});
