/**
 * #1790 ([ADR-595](../../../docs/06-decisions.md#adr-595)) — an inscription honours the shape's adjective, in
 * both directions, or it does not commit.
 *
 * Measured on `main` @ 9d1b0b1f through `decideDeterministic2D`:
 *  - «טרפז ישר זווית חסום במעגל» committed a TRIANGLE (the inscribed rule's private ladder tested «ישר זווית»
 *    before the noun); the lettered form was refused "'poly-ABCD' is already defined";
 *  - «מעגל חסום במשולש ישר זווית ABC» committed a GENERIC triangle (the incircle ladder read the noun only) —
 *    40/40 Hebrew and 18/18 English incircle rows dropped their adjective;
 *  - «מלבן DEFG חסום במשולש ישר זווית ABC» built a generic container.
 *
 * The class sweep: 8 nouns × 3 adjectives × 4 sentence shapes × {lettered, unlettered}, plus the English
 * mirror. Every row either COMMITS with its property measured on the figure at 24 seeds, or refuses /
 * escalates. No row commits without its property.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { parse } from '@/parser';
import { readShapePhrase } from '@/parser/shapePhrase';
import { droppedShapeNoun, droppedShapeAdjective } from '@/parser/parse';
import type { AnyCommand, Vec } from '@/engine';

type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function decide(prefix: string[], line: string): Promise<Verdict> {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const locale = /[א-ת]/.test(line) ? 'he' : 'en';
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** Commit `commands` on top of the current store (the app's own `execute`, one group). */
function commit(line: string, commands: readonly AnyCommand[]) {
  const group = `g${useGeoStore.getState().facts.length}`;
  for (const c of commands) useGeoStore.getState().execute(c, line, group);
  return useGeoStore.getState().facts;
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

// ── geometry on the figure ───────────────────────────────────────────────────────────────────────
const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const cosAt = (p: Vec, q: Vec, r: Vec) => {
  const u = sub(p, q), v = sub(r, q);
  return (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
};
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const parallel = (a: Vec, b: Vec, c: Vec, d: Vec) => {
  const u = sub(b, a), v = sub(d, c);
  return Math.abs(cross(u, v)) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) < 1e-4;
};
const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs(cross(sub(b, a), sub(p, a))) / len(a, b);
const TOL = 1e-3;

type Adj = 'right' | 'isosceles' | 'equilateral';
/** Does the ring `v` (in order) carry the property `adj`? */
function holds(adj: Adj, v: Vec[]): boolean {
  const n = v.length;
  const side = (i: number) => len(v[i], v[(i + 1) % n]);
  if (adj === 'right') return v.some((_, i) => Math.abs(cosAt(v[(i + n - 1) % n], v[i], v[(i + 1) % n])) < TOL);
  if (n === 3) {
    const s = [side(0), side(1), side(2)];
    const eq = (a: number, b: number) => Math.abs(a - b) < TOL * Math.max(a, b);
    if (adj === 'equilateral') return eq(s[0], s[1]) && eq(s[1], s[2]);
    return eq(s[0], s[1]) || eq(s[1], s[2]) || eq(s[2], s[0]);
  }
  // a quad: isosceles = one pair of opposite sides parallel, the other pair equal; equilateral = all sides equal
  if (adj === 'equilateral') return [1, 2, 3].every((i) => Math.abs(side(i) - side(0)) < TOL * side(0));
  return [0, 1].some((i) => parallel(v[i], v[i + 1], v[(i + 2) % 4], v[(i + 3) % 4]) && Math.abs(side(i + 1) - side((i + 3) % 4)) < TOL * side(i + 1));
}

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────
const NOUNS_HE: Array<[string, 3 | 4]> = [['משולש', 3], ['מרובע', 4], ['ריבוע', 4], ['מלבן', 4], ['מעוין', 4], ['טרפז', 4], ['מקבילית', 4], ['דלתון', 4]];
const ADJ_HE: Array<[string, Adj]> = [['ישר זווית', 'right'], ['שווה שוקיים', 'isosceles'], ['שווה צלעות', 'equilateral']];
const NOUNS_EN: Array<[string, 3 | 4]> = [['triangle', 3], ['trapezoid', 4], ['kite', 4], ['quadrilateral', 4]];
const ADJ_EN: Array<[string, Adj]> = [['right', 'right'], ['isosceles', 'isosceles'], ['equilateral', 'equilateral']];

type Dir = 'inscribed' | 'incircle';
interface Row { line: string; adj: Adj; n: 3 | 4; dir: Dir; noun: string }
const ROWS: Row[] = [];
for (const [noun, n] of NOUNS_HE)
  for (const [adj, a] of ADJ_HE)
    for (const L of [n === 3 ? 'ABC' : 'ABCD', '']) {
      const p = `${noun} ${adj}${L ? ` ${L}` : ''}`;
      ROWS.push({ line: `${p} חסום במעגל`, adj: a, n, dir: 'inscribed', noun });
      ROWS.push({ line: `מעגל חסום ב${p}`, adj: a, n, dir: 'incircle', noun });
      ROWS.push({ line: `ב${p} חסום מעגל`, adj: a, n, dir: 'incircle', noun });
      if (L) ROWS.push({ line: `${noun} ${L} ${adj} חוסם מעגל`, adj: a, n, dir: 'incircle', noun });
    }
for (const [noun, n] of NOUNS_EN)
  for (const [adj, a] of ADJ_EN)
    for (const L of [n === 3 ? 'ABC' : 'ABCD', '']) {
      const p = `${adj} ${noun}${L ? ` ${L}` : ''}`;
      ROWS.push({ line: `${p} inscribed in a circle`, adj: a, n, dir: 'inscribed', noun });
      ROWS.push({ line: `circle inscribed in ${p}`, adj: a, n, dir: 'incircle', noun });
    }

/** The rows that MUST commit (a non-vacuity floor): a property the noun can carry, in a constructible figure. */
const mustCommit = (r: Row) =>
  (r.noun === 'משולש' || r.noun === 'triangle') ||
  ((r.noun === 'טרפז' || r.noun === 'trapezoid') && (r.adj === 'isosceles' || (r.adj === 'right' && r.dir === 'incircle')));

/** A right trapezoid inscribed in a circle — the 2026-10-01 ruling: refused naming both nouns. */
const ruledRefusal = (r: Row) => (r.noun === 'טרפז' || r.noun === 'trapezoid') && r.adj === 'right' && r.dir === 'inscribed';

const SEEDS = 24;

describe('#1790 — every inscription row honours its adjective or does not commit', () => {
  it(`the ${ROWS.length}-row sweep: no row commits without its property (24 seeds per commit)`, async () => {
    let committed = 0;
    const faults: string[] = [];
    for (const r of ROWS) {
      useGeoStore.getState().clear();
      const v = await decide([], r.line);
      if (ruledRefusal(r)) {
        if (v.kind !== 'refuse' || (v.note as { key?: string } | null)?.key !== 'input.inscribedContradictsNoun') faults.push(`${r.line}: ${v.kind}, not the ruled refusal`);
        continue;
      }
      if (v.kind !== 'commit') {
        if (mustCommit(r)) faults.push(`${r.line}: ${v.kind}, must commit`);
        continue;
      }
      committed++;
      const facts = commit(r.line, v.commands);
      const ring = r.n === 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
      let built = 0;
      for (let seed = 0; seed < SEEDS; seed++) {
        const f = replay(facts, seed);
        if (f.lastError) continue;
        built++;
        const v4 = ring.map((id) => f.positions.get(id)!);
        if (!holds(r.adj, v4)) faults.push(`${r.line} @seed ${seed}: committed WITHOUT «${r.adj}»`);
        if (r.dir === 'incircle') {
          const c = [...f.circles.values()][0];
          const tangent = ring.every((_, i) => Math.abs(distToLine(c.center, v4[i], v4[(i + 1) % ring.length]) - c.r) < TOL * c.r);
          if (!tangent) faults.push(`${r.line} @seed ${seed}: the circle is not tangent to every side`);
        } else {
          const c = [...f.circles.values()][0];
          if (!v4.every((p) => Math.abs(len(p, c.center) - c.r) < TOL * c.r)) faults.push(`${r.line} @seed ${seed}: a vertex is off the circle`);
        }
      }
      if (built === 0) faults.push(`${r.line}: committed but builds at no seed`);
    }
    expect(faults).toEqual([]);
    expect(committed, 'the sweep exercised committed rows (non-vacuity)').toBeGreaterThanOrEqual(ROWS.filter(mustCommit).length);
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 600_000);
});

describe('#1790 — the right trapezoid inscribed in a circle is refused naming both nouns (the #1554 ruling)', () => {
  it.each(['טרפז ישר זווית חסום במעגל', 'טרפז ישר-זווית חסום במעגל', 'טרפז ישר זווית ABCD חסום במעגל', 'טרפז ABCD ישר זווית חסום במעגל', 'right trapezoid inscribed in a circle', 'right trapezoid ABCD inscribed in a circle'])(
    '«%s»',
    async (line) => {
      const v = await decide([], line);
      expect(v.kind).toBe('refuse');
      if (v.kind !== 'refuse') return;
      expect(v.note).toMatchObject({
        key: 'input.inscribedContradictsNoun',
        params: { detail: line, shape: { t: 'input.shapeNoun.right-trapezoid' }, forced: { t: 'input.shapeNoun.rectangle' } },
      });
      expect(JSON.stringify(v)).not.toMatch(/already defined|poly-/);
      expect(llmParseMock).not.toHaveBeenCalled();
    },
  );
});

describe('#1790 Arm C — restating an already-declared ring with the generic word is a reference', () => {
  it.each(['ריבוע', 'מלבן', 'מעוין', 'דלתון', 'טרפז', 'מקבילית', 'טרפז שווה שוקיים', 'מרובע'])('«%s ABCD» · «ABCD חסום במעגל» commits', async (noun) => {
    const v = await decide([`${noun} ABCD`], 'ABCD חסום במעגל');
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
  });

  // #1918 (ADR-607, operator ruling 2026-10-08 "Refuse in both"): this pair used to draw the rectangle with the amber
  // "no longer a trapezoid"; it is now refused naming both statements, like the one-line sentence. Never "already defined".
  it('«טרפז ישר זווית ABCD» · «ABCD חסום במעגל» is refused naming the declaring statement (ADR-607), never "already defined"', async () => {
    const v = await decide(['טרפז ישר זווית ABCD'], 'ABCD חסום במעגל');
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toMatch(/a circle through the vertices of right-trapezoid ABCD forces a rectangle cannot hold \[vs #0\]/);
    expect(JSON.stringify(v)).not.toMatch(/already defined|poly-/);
  });

  it('the restated ring keeps its declared noun', async () => {
    const v = await decide(['מלבן ABCD'], 'ABCD חסום במעגל');
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    const f = replay(commit('ABCD חסום במעגל', v.commands), 0);
    const poly = f.construction.objects.find((o) => o.id === 'poly-ABCD') as { declaredAs?: string } | undefined;
    expect(poly?.declaredAs).toBe('rectangle');
  });
});

describe('#1790 — a conflict inside ONE sentence names the sentence, never "edit the earlier step"', () => {
  it('«ריבוע ABCD, מלבן ABCD» on an empty canvas: refused quoting the sentence and the student’s letter', async () => {
    const v = await decide([], 'ריבוע ABCD, מלבן ABCD');
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.note).toMatchObject({ key: 'input.sentenceSelfConflict', params: { sentence: 'ריבוע ABCD, מלבן ABCD' } });
    expect((v.note as unknown as { params: { id: string } }).params.id).toMatch(/^[A-Z]+$/);
  });

  it('a redefinition of something an EARLIER step made keeps the engine’s "earlier step" message', async () => {
    const v = await decide(['טרפז ABCD'], 'ריבוע ABCD');
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).not.toMatch(/sentenceSelfConflict/);
  });
});

describe('#1790 — the reader: the noun decides the arity, the adjective only modifies it', () => {
  it.each([
    ['טרפז ישר זווית', 'right-trapezoid', 4, []],
    ['משולש ישר זווית', 'right-triangle', 3, []],
    ['ישר זווית', 'right-triangle', 3, []],
    ['מרובע ישר זווית', 'quad', 4, ['right']],
    ['דלתון שווה צלעות', 'kite', 4, ['equilateral']],
    ['טרפז שווה שוקיים', 'isosceles-trapezoid', 4, []],
    ['equilateral triangle', 'equilateral-triangle', 3, []],
  ] as const)('«%s» → %s (arity %i), unconsumed %j', (s, kind, arity, unconsumed) => {
    const p = readShapePhrase(s)!;
    expect(p.kind).toBe(kind);
    expect(p.arity).toBe(arity);
    expect(p.unconsumed).toEqual(unconsumed);
  });

  it('the standalone macros lower through the reader (byte-identical): «טרפז ישר זווית ABCD»', () => {
    const r = parse('טרפז ישר זווית ABCD');
    expect(r.ok && r.commands).toEqual(readShapePhrase('טרפז ישר זווית')!.lower(['A', 'B', 'C', 'D']));
  });
});

describe('#1790 Arm B — the gates', () => {
  it('droppedShapeNoun is arity-aware: a triangle does not account for «טרפז»', () => {
    const tri: AnyCommand[] = [{ type: 'triangle', ids: ['A', 'B', 'C'] }];
    expect(droppedShapeNoun('טרפז חסום במעגל', tri, {})).toBe(true);
    expect(droppedShapeNoun('משולש חסום במעגל', tri, {})).toBe(false);
    // a polygon in a polygon: the 4-ring and the 3-ring container both account
    expect(droppedShapeNoun('מעוין BDEF חסום במשולש ABC', [{ type: 'inscribe', shape: 'rhombus', ids: ['B', 'D', 'E', 'F'], container: ['A', 'B', 'C'], containerKind: 'triangle', variant: 0 }], {})).toBe(false);
  });

  it('droppedShapeAdjective: a stated property must travel in the commands', () => {
    const tri: AnyCommand[] = [{ type: 'triangle', ids: ['A', 'B', 'C'] }];
    expect(droppedShapeAdjective('מעגל חסום במשולש ישר זווית ABC', tri, {})).toBe(true);
    expect(droppedShapeAdjective('מעגל חסום במשולש ישר זווית ABC', [{ type: 'right-triangle', ids: ['A', 'B', 'C'] }], {})).toBe(false);
    expect(droppedShapeAdjective('משולש שווה שוקיים ABC', tri, {})).toBe(true);
    // a reference to an existing triangle restates — exempt
    expect(droppedShapeAdjective('במשולש ישר זווית ABC, CD גובה', [], { points: ['A', 'B', 'C'] })).toBe(false);
  });
});
