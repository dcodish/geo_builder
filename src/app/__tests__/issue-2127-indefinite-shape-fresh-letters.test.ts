/**
 * #2127 ([ADR-654](../../../docs/06-decisions.md#adr-654)) — AN INDEFINITE UNNAMED SHAPE IS A NEW SHAPE.
 *
 * Operator, 2026-10-14 (2-D, playing the #2107 sheet): «מעגל O» · «משולש חוסם את מעגל O» · «משולש חסום במעגל O» refused
 * the last line «…סותר את «משולש חוסם את מעגל O»…». Measured on `main` @ b0ef3240 + ADR-653 through
 * `decideDeterministic2D` → `commitVerdict` → `replay`: the second line's commands put A, B, C — the first triangle's
 * letters — on the circle (`over-constrained: |OA| = 1·R`); the other order refused the same way.
 *
 * Root cause: the inscription rules read an unnamed shape noun against the figure's one polygon of that size (ADR-029's
 * implicit reference, `existingPolygon`) whatever its article, so the indefinite «משולש …» was lowered as a statement
 * about the existing triangle. Fix: the parser reports an indefinite binding (`indefiniteShape`), and the seam keeps it
 * only when the sentence already holds of that shape (a restatement, «כבר קיים» as before); otherwise it re-reads the
 * line as a new shape with the next free letters.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { indefiniteShapeReading } from '@/store/indefiniteShape';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { auditLoadedFigure, refreshLoadedFigure } from '@/store/loadAudit';
import { buildParseCtx, parse } from '@/parser';
import { shapeNounIsDefinite } from '@/parser/shapePhrase';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
type V = { kind: string; note?: { key?: string } | null };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  const snaps: Map<string, Vec>[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    snaps.push(new Map(d.positions));
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    if (v.kind !== 'store-op' && v.kind !== 'refuse') commitVerdict(v as never, line);
  }
  return { verdicts, last: verdicts.at(-1)!, before: snaps.at(-1)! };
}

const dist = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const polys = () =>
  replay(st().facts, st().seed)
    .construction.objects.filter((o) => o.kind === 'polygon')
    .map((o) => (o as { vertices: string[] }).vertices.join(''))
    .sort();

/** Every vertex of `ring` lies on circle O. */
function onCircle(ring: string) {
  const r = replay(st().facts, st().seed);
  const k = r.circles.get('circle-O')!;
  for (const v of ring) expect(Math.abs(dist(r.positions.get(v)!, k.center) - k.r), `${v} on circle O`).toBeLessThan(1e-6);
}
/** Every side of `ring` is tangent to circle O (the centre is r from each side line). */
function aroundCircle(ring: string) {
  const r = replay(st().facts, st().seed);
  const k = r.circles.get('circle-O')!;
  for (let i = 0; i < ring.length; i++) {
    const a = r.positions.get(ring[i])!, b = r.positions.get(ring[(i + 1) % ring.length])!;
    const h = Math.abs((b.x - a.x) * (a.y - k.center.y) - (a.x - k.center.x) * (b.y - a.y)) / dist(a, b);
    expect(Math.abs(h - k.r), `side ${ring[i]}${ring[(i + 1) % ring.length]} tangent`).toBeLessThan(1e-6);
  }
}

beforeEach(() => llmParseMock.mockReset());

const O = 'מעגל O';
const AROUND = 'משולש חוסם את מעגל O';
const INSIDE = 'משולש חסום במעגל O';

describe('#2127 — the operator\'s lines: the indefinite «משולש …» is a second triangle', () => {
  it('around, then inside: a second triangle D, E, F inside the circle; the first stays', async () => {
    const g = await play([O, AROUND, INSIDE]);
    expect(g.last.kind).toBe('commit');
    expect(polys()).toEqual(['ABC', 'DEF']);
    aroundCircle('ABC');
    onCircle('DEF');
    const r = replay(st().facts, st().seed);
    expect(r.violations).toHaveLength(0);
    // stability: the first triangle and the circle do not move
    for (const id of ['O', 'A', 'B', 'C']) expect(dist(r.positions.get(id)!, g.before.get(id)!), id).toBeLessThan(1e-9);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('inside, then around: the same, the other way round', async () => {
    const g = await play([O, INSIDE, AROUND]);
    expect(g.last.kind).toBe('commit');
    expect(polys()).toEqual(['ABC', 'DEF']);
    onCircle('ABC');
    aroundCircle('DEF');
    const r = replay(st().facts, st().seed);
    for (const id of ['O', 'A', 'B', 'C']) expect(dist(r.positions.get(id)!, g.before.get(id)!), id).toBeLessThan(1e-9);
  });

  // #2355 (ADR-753): the inscribed square now STATES its shape. Before, this row committed a ring EFGH on O labelled a
  // square that was not one (#2355's own class, bound branch). With the shape stated, the replay fold over the outer
  // square's deferred circle refuses it — a pre-existing replay defect (#2454) whose wording names circle O as undefined.
  // Operator ruling 2026-10-23 (#2355, card d02, answer A): ship, the refusal is the accepted interim until #2454 lands.
  // The lock is the honesty half: never a non-square drawn green — a square on O, or refused with nothing added.
  it('the square: around, then «ריבוע חסום במעגל O» is a second square on O, or refused — never a non-square (#2355, #2454)', async () => {
    const g = await play([O, 'ריבוע חוסם את מעגל O', 'ריבוע חסום במעגל O']);
    if (g.last.kind === 'refuse') {
      expect(polys()).toEqual(['ABCD']);
      return;
    }
    expect(g.last.kind).toBe('commit');
    expect(polys()).toEqual(['ABCD', 'EFGH']);
    onCircle('EFGH');
    const r = replay(st().facts, st().seed);
    const v = [...'EFGH'].map((id) => r.positions.get(id)!);
    const sides = v.map((a, i) => dist(a, v[(i + 1) % 4]));
    for (const s of sides) expect(Math.abs(s - sides[0]) / sides[0], 'EFGH has equal sides').toBeLessThan(1e-6);
    expect(Math.abs(dist(v[0], v[2]) - dist(v[1], v[3])) / sides[0], 'EFGH has equal diagonals').toBeLessThan(1e-6);
  });

  it('English: "a triangle circumscribes circle O" · "a triangle inscribed in circle O"', async () => {
    const g = await play([O, 'a triangle circumscribes circle O', 'a triangle inscribed in circle O'], 'en');
    expect(g.last.kind).toBe('commit');
    expect(polys()).toEqual(['ABC', 'DEF']);
  });

  it('a saved figure reloads as drawn: the load refresh and audit read the second triangle the same way', async () => {
    await play([O, AROUND, INSIDE]);
    const saved = st().facts;
    const { facts, refreshed } = refreshLoadedFigure(saved, Number.POSITIVE_INFINITY);
    expect(refreshed).toEqual([]);
    expect(facts.map((f) => f.cmd)).toEqual(saved.map((f) => f.cmd));
    expect(auditLoadedFigure(saved, Number.POSITIVE_INFINITY).findings).toEqual([]);
  });

  it('the edit seam reads it the same way', async () => {
    await play([O, AROUND, 'משולש DEF חסום במעגל O']);
    const deps: EditDeps = { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => {} };
    expect(runEditCommit(groupKey(st().facts.at(-1)!), INSIDE, deps)).toBe(true);
    expect(polys()).toEqual(['ABC', 'DEF']);
    onCircle('DEF');
  });
});

describe('#2127 — unchanged (measured at b0ef3240)', () => {
  it('the definite «המשולש חסום במעגל O» is the existing triangle, and is refused', async () => {
    const g = await play([O, AROUND, 'המשולש חסום במעגל O']);
    expect(g.last.kind).toBe('refuse');
    expect(polys()).toEqual(['ABC']);
  });

  it.each([[INSIDE], [AROUND], ['ריבוע חסום במעגל O']])('«%s» typed twice still answers «כבר קיים»', async (line) => {
    const g = await play([O, line, line]);
    expect(g.last.kind).toBe('noop');
    expect(g.last.note?.key).toBe('input.alreadyDrawn');
    expect(polys()).toHaveLength(1);
  });

  it('«משולש חסום במעגל» (no letter) typed twice still answers «כבר קיים»', async () => {
    const g = await play(['משולש חסום במעגל', 'משולש חסום במעגל']);
    expect(g.last.kind).toBe('noop');
    expect(polys()).toEqual(['ABC']);
  });

  it('«מעגל O חסום במשולש» (the preposition hides the article) after the triangle around O still answers «כבר קיים»', async () => {
    const g = await play([O, AROUND, 'מעגל O חסום במשולש']);
    expect(g.last.kind).toBe('noop');
    expect(polys()).toEqual(['ABC']);
  });

  it('a square around O, then «משולש חסום במעגל O»: a new triangle E, F, G', async () => {
    await play([O, 'ריבוע חוסם את מעגל O', INSIDE]);
    expect(polys()).toEqual(['ABCD', 'EFG']);
  });

  it('a named second triangle «משולש DEF חסום במעגל O» builds D, E, F', async () => {
    const g = await play([O, AROUND, 'משולש DEF חסום במעגל O']);
    expect(g.last.kind).toBe('commit');
    expect(polys()).toEqual(['ABC', 'DEF']);
  });
});

describe('#2127 — the pieces', () => {
  it.each([
    ['משולש חסום במעגל O', false],
    ['ומשולש חסום במעגל O', false],
    ['המשולש חסום במעגל O', true],
    ['שהמשולש חסום במעגל O', true],
    ['מעגל חסום במשולש', true], // a preposition hides the article: a possible reference, as before
    ['a triangle inscribed in circle O', false],
    ['the triangle inscribed in circle O', true],
    ['the right triangle inscribed in circle O', true],
  ] as const)('«%s» → definite %s', (s, want) => expect(shapeNounIsDefinite(s)).toBe(want));

  it('a parse with no existing polygon reports no indefinite binding', () => {
    const r = parse(INSIDE, buildParseCtx(replay([], 0).construction, replay([], 0).positions));
    expect(r.ok && r.indefiniteShape).toBeFalsy();
  });

  it('a restatement keeps the bound reading', async () => {
    await play([O, INSIDE]);
    const d = replay(st().facts, st().seed);
    const ctx = buildParseCtx(d.construction, d.positions);
    const r = parse(INSIDE, ctx);
    expect(r.ok && r.indefiniteShape).toEqual(['A', 'B', 'C']);
    expect(indefiniteShapeReading(r, INSIDE, ctx, st().facts, st().seed)).toBe(r);
  });
});
