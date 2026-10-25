/**
 * #2257 ([ADR-767](../../docs/06-decisions.md#adr-767)) — AN INSCRIPTION WHOSE INNER SHAPE IS ALREADY DRAWN MOVES THAT
 * SHAPE. The operator, 2026-10-19 (Q1 = A, *"Q1 - A"*): with a square drawn, «הריבוע חסום במשולש EFG» and the named
 * «הריבוע ABCD חסום במשולש EFG» inscribe THAT square — its vertices move onto the triangle's sides, no second square.
 *
 * Measured at main 045a8546 through `decideDeterministic2D` → `commitVerdict` (the pipeline's one commit door), model
 * mocked: the definite line drew a second square HIJK, green; the named line was refused «would be flat»; a drawn
 * square in a square / a quadrilateral was refused «'poly-ABCD' is already defined»; «מרובע ABCD» · «הריבוע חסום במרובע
 * ABCD» read the container's run as the inner shape's name and was refused the same way.
 *
 * Every row also keeps the earlier rows verbatim (#2480's takeover probe, ADR-757): the move is the new line's own
 * facts, never a rewrite of «ריבוע ABCD».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, groupKey, type Fact } from '@/store/geoStore';
import type { Vec } from '@/engine';
import { meetsRequirements, searchAnotherView } from '@/replay/core';

const st = () => useGeoStore.getState();
type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function submit(line: string): Promise<Verdict> {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[a-z]{3}/.test(line) ? 'en' : 'he');
  commitVerdict(v, line);
  return v;
}

function expectRowsKept(before: Fact[], after: Fact[], line: string) {
  before.forEach((b, i) => {
    const a = after[i];
    expect(a, `«${line}»: fact #${i} still exists`).toBeDefined();
    expect({ id: a.id, utterance: a.utterance, group: groupKey(a), cmd: a.cmd }, `«${line}»: fact #${i} («${b.utterance}») untouched`).toEqual({ id: b.id, utterance: b.utterance, group: groupKey(b), cmd: b.cmd });
  });
}

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const dot = (a: Vec, b: Vec, c: Vec, e: Vec) => (b.x - a.x) * (e.x - c.x) + (b.y - a.y) * (e.y - c.y);
/** Distance from p to the closed segment ab. */
function toSegment(p: Vec, a: Vec, b: Vec): number {
  const L = d(a, b) ** 2;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L));
  return d(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

type Kind = 'square' | 'rectangle' | 'rhombus' | 'parallelogram';
function shapeDefects(kind: Kind, [A, B, C, D]: Vec[]): [string, number][] {
  const s = d(A, B);
  const out: [string, number][] = [];
  if (kind === 'square' || kind === 'rhombus') out.push(['AB=BC', d(A, B) - d(B, C)], ['BC=CD', d(B, C) - d(C, D)], ['CD=DA', d(C, D) - d(D, A)]);
  if (kind === 'square' || kind === 'rectangle') out.push(['∠B', dot(A, B, B, C) / s], ['∠C', dot(B, C, C, D) / s]);
  if (kind === 'parallelogram' || kind === 'rectangle') out.push(['AB=CD', d(A, B) - d(C, D)], ['BC=DA', d(B, C) - d(D, A)]);
  return out;
}

/** One figure: the drawn inner ABCD sits on the container's boundary (every vertex on some side), keeps its shape, is
 *  the only new quadrilateral, and the figure holds its givens. */
function expectInscribedIn(facts: Fact[], seed: number, kind: Kind, container: string[], what: string, quads: number) {
  const fig = replay(facts, seed);
  expect(fig.lastError, `${what} @${seed}`).toBeNull();
  expect(fig.violations.map((v) => v.message), `${what} @${seed}: the givens hold`).toEqual([]);
  const P = ['A', 'B', 'C', 'D'].map((k) => fig.positions.get(k)!);
  const Q = container.map((k) => fig.positions.get(k)!);
  const span = Math.max(...Q.map((q) => d(q, Q[0])));
  for (const [i, p] of P.entries()) {
    const off = Math.min(...Q.map((q, j) => toSegment(p, q, Q[(j + 1) % Q.length])));
    expect(off / span, `${what} @${seed}: ${'ABCD'[i]} on a side of ${container.join('')}`).toBeLessThan(1e-5);
  }
  expect(d(P[0], P[1]) / span, `${what} @${seed}: a real shape, not a point`).toBeGreaterThan(0.02);
  for (const [name, v] of shapeDefects(kind, P)) expect(Math.abs(v) / span, `${what} @${seed}: ${name}`).toBeLessThan(1e-5);
  const rings = fig.construction.objects.filter((o) => o.kind === 'polygon' && o.vertices.length === 4);
  expect(rings.length, `${what} @${seed}: no second quadrilateral`).toBe(quads);
}

/** The figure the student sees, and the one «הציגו תצורה אחרת» shows next: both inscribed. (Not every sampled seed:
 *  the fresh inscription itself fails at some — measured, e.g. «משולש EFG · ריבוע ABCD חסום במשולש EFG» builds at 6 of
 *  seeds 0–7 — and the configuration search skips a seed that does not build.) */
function expectInscribed(kind: Kind, container: string[], what: string, quads = container.length === 4 ? 2 : 1) {
  const facts = st().facts;
  expectInscribedIn(facts, st().seed, kind, container, what, quads);
  const next = searchAnotherView(facts, st().seed, undefined, Number.POSITIVE_INFINITY);
  expect(next, `${what}: «הציגו תצורה אחרת» finds another view`).not.toBeNull();
  expect(meetsRequirements(next!.facts, next!.seed), `${what}: the other view meets the givens`).toBe(true);
  expectInscribedIn(next!.facts, next!.seed, kind, container, `${what} (another view)`, quads);
}

beforeEach(() => llmParseMock.mockReset());

const NOUN: Record<Kind, { he: string; def: string; en: string; verb: string }> = {
  square: { he: 'ריבוע', def: 'הריבוע', en: 'square', verb: 'חסום' },
  rectangle: { he: 'מלבן', def: 'המלבן', en: 'rectangle', verb: 'חסום' },
  rhombus: { he: 'מעוין', def: 'המעוין', en: 'rhombus', verb: 'חסום' },
  parallelogram: { he: 'מקבילית', def: 'המקבילית', en: 'parallelogram', verb: 'חסומה' },
};
const CONTAINERS: { he: string; in: string; en: string; ids: string[] }[] = [
  { he: 'משולש EFG', in: 'במשולש EFG', en: 'triangle EFG', ids: ['E', 'F', 'G'] },
  { he: 'ריבוע EFGH', in: 'בריבוע EFGH', en: 'square EFGH', ids: ['E', 'F', 'G', 'H'] },
  { he: 'מרובע EFGH', in: 'במרובע EFGH', en: 'quadrilateral EFGH', ids: ['E', 'F', 'G', 'H'] },
];

describe('#2257 — a drawn inner shape is moved into the container, never drawn twice', () => {
  for (const kind of ['square', 'rectangle', 'rhombus', 'parallelogram'] as Kind[]) {
    for (const c of CONTAINERS) {
      const n = NOUN[kind];
      for (const named of [false, true]) {
        const lines = [`${n.he} ABCD`, c.he, `${n.def}${named ? ' ABCD' : ''} ${n.verb} ${c.in}`];
        it(lines.join(' · '), async () => {
          st().clear();
          await submit(lines[0]);
          await submit(lines[1]);
          const before = st().facts.slice();
          const prior = replay(before, st().seed);
          const v = await submit(lines[2]);
          expect(v.kind, lines[2]).toBe('commit');
          expectRowsKept(before, st().facts, lines[2]);
          expectInscribed(kind, c.ids, lines.join(' · '));
          // stability: the container does not move when the inner shape has no stated size
          const fig = replay(st().facts, st().seed);
          // (to 1e-3 of the figure: the convex ladder's vertex recruitment may nudge a free container vertex invisibly)
          const span = Math.max(...c.ids.map((k) => d(prior.positions.get(k)!, prior.positions.get(c.ids[0])!)));
          for (const k of c.ids) expect(d(fig.positions.get(k)!, prior.positions.get(k)!) / span, `${k} stays`).toBeLessThan(1e-3);
          expect(llmParseMock).not.toHaveBeenCalled();
        }, 60_000);
      }
    }
  }

  it('English: "the square is inscribed in triangle EFG" and "square ABCD is inscribed in triangle EFG"', async () => {
    for (const line of ['the square is inscribed in triangle EFG', 'square ABCD is inscribed in triangle EFG']) {
      st().clear();
      await submit('square ABCD');
      await submit('triangle EFG');
      expect((await submit(line)).kind, line).toBe('commit');
      expectInscribed('square', ['E', 'F', 'G'], line);
    }
  }, 60_000);

  it('a drawn general quadrilateral is bound and stated a square, inscribed (the circle twin, ADR-753)', async () => {
    for (const line of ['הריבוע חסום במשולש EFG', 'הריבוע ABCD חסום במשולש EFG']) {
      st().clear();
      await submit('מרובע ABCD');
      await submit('משולש EFG');
      expect((await submit(line)).kind, line).toBe('commit');
      expectInscribed('square', ['E', 'F', 'G'], line);
    }
  }, 60_000);

  it('a mirrored square (its vertices running the other way round) still seats', async () => {
    st().clear();
    await submit('ריבוע ADCB');
    await submit('משולש EFG');
    expect((await submit('הריבוע חסום במשולש EFG')).kind).toBe('commit');
    expectInscribed('square', ['E', 'F', 'G'], 'ADCB');
  }, 60_000);

  it('a stated size: the triangle grows to hold the square (search first)', async () => {
    st().clear();
    for (const l of ['ריבוע ABCD', 'AB = 3', 'משולש EFG']) await submit(l);
    expect((await submit('הריבוע חסום במשולש EFG')).kind).toBe('commit');
    expectInscribed('square', ['E', 'F', 'G'], 'AB = 3');
    const fig = replay(st().facts, st().seed);
    expect(d(fig.positions.get('A')!, fig.positions.get('B')!)).toBeCloseTo(3, 6);
  }, 60_000);

  it('two squares drawn: the question names them, and its example builds', async () => {
    st().clear();
    for (const l of ['ריבוע ABCD', 'ריבוע HIJK', 'משולש EFG']) await submit(l);
    const before = st().facts.slice();
    const v = await submit('הריבוע חסום במשולש EFG');
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toContain('ambiguous-definite-shape');
    expect(st().facts).toEqual(before);
    const example = (v as unknown as { note: { params: { example: string } } }).note.params.example;
    expect(example).toBe('הריבוע ABCD חסום במשולש EFG');
    expect((await submit(example)).kind).toBe('commit');
    expectInscribed('square', ['E', 'F', 'G'], example, 2);
  }, 60_000);

  it('a contradiction nothing saves is refused naming the earlier statement, never «would be flat»', async () => {
    st().clear();
    for (const l of ['ריבוע ABCD', 'AB = 10', 'משולש EFG', 'EF = 2', 'FG = 2', 'EG = 2']) await submit(l);
    const before = st().facts.slice();
    const v = await submit('הריבוע ABCD חסום במשולש EFG');
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toContain('over-constrained');
    expect(JSON.stringify(v)).not.toContain('flat');
    expect(st().facts).toEqual(before);
  }, 60_000);
});

describe('#2257 row 4 — the container\'s four-letter run is the container\'s, not the inner shape\'s name', () => {
  for (const [first, line, kind] of [
    ['מרובע ABCD', 'הריבוע חסום במרובע ABCD', 'square'],
    ['מרובע ABCD', 'ריבוע חסום במרובע ABCD', 'square'],
    ['ריבוע ABCD', 'מלבן חסום בריבוע ABCD', 'rectangle'],
    ['quadrilateral ABCD', 'a square is inscribed in quadrilateral ABCD', 'square'],
  ] as const)
    it(`${first} · ${line}`, async () => {
      st().clear();
      await submit(first);
      const v = await submit(line);
      expect(v.kind, line).toBe('commit');
      const inscribe = (v as unknown as { commands: { type: string; ids?: string[]; container?: string[] }[] }).commands.find((c) => c.type === 'inscribe')!;
      expect(inscribe.container).toEqual(['A', 'B', 'C', 'D']);
      expect(inscribe.ids).toEqual(['E', 'F', 'G', 'H']);
      const fig = replay(st().facts, st().seed);
      expect(fig.lastError).toBeNull();
      expect(fig.violations).toEqual([]);
      expect(kind).toBeTruthy();
    }, 60_000);
});

describe('#2257 — unchanged: an indefinite noun is a new shape, a fresh inscription and the circle twin', () => {
  it('«ריבוע ABCD» · «משולש EFG» · «ריבוע חסום במשולש EFG» draws a new square HIJK (FR-IN-11)', async () => {
    st().clear();
    await submit('ריבוע ABCD');
    await submit('משולש EFG');
    const v = await submit('ריבוע חסום במשולש EFG');
    expect(v.kind).toBe('commit');
    expect(JSON.stringify((v as { commands: unknown }).commands)).toContain('"ids":["H","I","J","K"]');
  }, 60_000);

  it('«משולש EFG» · «ריבוע חסום במשולש EFG» and «… הריבוע חסום במשולש EFG» build a fresh square ABCD', async () => {
    for (const line of ['ריבוע חסום במשולש EFG', 'הריבוע חסום במשולש EFG']) {
      st().clear();
      await submit('משולש EFG');
      const v = await submit(line);
      expect(v.kind, line).toBe('commit');
      expect(JSON.stringify((v as { commands: unknown }).commands)).toContain('"ids":["A","B","C","D"]');
      expectInscribed('square', ['E', 'F', 'G'], line);
    }
  }, 60_000);

  it('the circle twin «ריבוע ABCD · מעגל O · הריבוע חסום במעגל O» still binds the drawn square', async () => {
    st().clear();
    await submit('ריבוע ABCD');
    await submit('מעגל O');
    const v = await submit('הריבוע חסום במעגל O');
    expect(v.kind).toBe('commit');
    expect(JSON.stringify((v as { commands: unknown }).commands)).toContain('point-on-circle');
  }, 60_000);
});
