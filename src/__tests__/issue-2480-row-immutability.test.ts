/**
 * #2480 ([ADR-757](../../docs/06-decisions.md#adr-757), [ADR-W-156](../../docs/06w-decisions-workspace.md#adr-w-156)) —
 * A LATER LINE NEVER TAKES OVER AN EARLIER ROW. The operator, 2026-10-24: "I cannot think of a case we want to change
 * a user input that previously passed."
 *
 * Measured at main 1944d866 through `decideDeterministic2D` → `commitVerdict` (the pipeline's one commit door), model
 * mocked: «מעגל O» · «ריבוע חוסם את מעגל O» rewrote fact #0 IN PLACE — its utterance became line 2's and its command a
 * `circle-through` depending on letters line 2 defines later — so the list showed line 2 twice, «מעגל O» was gone, and
 * line 3 «ריבוע חסום במעגל O» was refused «מעגל O לא הוגדר». 26 of 78 measured sequences took over a row: every
 * quadrilateral drawn around an existing circle (the circle collapse-in-place of 471da348) and every free point a
 * later line re-ensured (ADR-011's move). #2454's refusal was the same misplaced fact.
 *
 * Two parts, one fix: (A) `foldCommand` never rewrites a committed fact — a later line's re-statement appends in its
 * own row; (B) the incircle rule builds a quadrilateral AROUND an existing circle (ADR-115's dual, n = 4), so the
 * circle keeps its centre and its stated radius. Every tangency and shape property below is computed HERE.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, groupKey, type Fact } from '@/store/geoStore';
import { foldCommand, searchAnotherView, meetsRequirements } from '@/replay/core';
import type { AnyCommand, Vec } from '@/engine';

const st = () => useGeoStore.getState();
type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function submit(line: string): Promise<Verdict> {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[a-z]{3}/.test(line) ? 'en' : 'he');
  commitVerdict(v, line);
  return v;
}

/** Every earlier fact is still there — same object fields, same index — apart from ADR-578's ruled re-enable. */
function expectRowsKept(before: Fact[], after: Fact[], line: string) {
  before.forEach((b, i) => {
    const a = after[i];
    expect(a, `«${line}»: fact #${i} («${b.utterance}») still exists`).toBeDefined();
    expect({ id: a.id, utterance: a.utterance, group: groupKey(a), cmd: a.cmd }, `«${line}»: fact #${i} («${b.utterance}») is untouched`).toEqual({ id: b.id, utterance: b.utterance, group: groupKey(b), cmd: b.cmd });
    if (b.enabled) expect(a.enabled).toBe(true);
  });
}

/** Play `lines`, asserting each line's verdict kind and the immutability of every row before it. */
async function play(lines: string[], verdicts: Verdict['kind'][]) {
  st().clear();
  for (const [i, line] of lines.entries()) {
    const before = st().facts.slice();
    const v = await submit(line);
    expect(v.kind, `«${line}»`).toBe(verdicts[i]);
    expectRowsKept(before, st().facts, line);
  }
  const fig = replay(st().facts, st().seed);
  expect(fig.lastError).toBeNull();
  expect(fig.violations.map((x) => x.message), 'the givens hold').toEqual([]);
  return fig;
}

const C = 'commit' as const;
/** The measured class (rows 1–21 of the plan's matrix, plus #2454): at main each one took over a row. */
const TAKEOVERS: [string[], Verdict['kind'][]][] = [
  [['מעגל O', 'ריבוע חוסם את מעגל O', 'ריבוע חסום במעגל O'], [C, C, C]], // the operator's T5 — line 3 was refused
  [['מעגל O', 'ריבוע ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'מעוין ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'מלבן ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'מקבילית ABCD חוסמת את מעגל O'], [C, C]],
  [['מעגל O', 'טרפז ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'טרפז ישר זווית ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'טרפז שווה שוקיים ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'מרובע ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'מעגל O חסום במרובע ABCD'], [C, C]],
  [['מעגל O', 'מעגל O חסום בריבוע ABCD'], [C, C]],
  [['מעגל O', 'מעגל O חסום במעוין ABCD'], [C, C]],
  [['מעגל O', 'מעגל O חסום בדלתון ABCD'], [C, C]],
  [['מעגל O', 'מעגל O חסום בטרפז ABCD'], [C, C]],
  [['מעגל O', 'circle O inscribed in square ABCD'], [C, C]],
  [['מעגל O', 'square ABCD circumscribes circle O'], [C, C]],
  [['מעגל O ברדיוס 3', 'ריבוע חוסם את מעגל O'], [C, C]],
  [['מעגל O ברדיוס 3', 'מעוין ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O ברדיוס 3', 'מרובע ABCD חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'ריבוע ABCD חוסם את מעגל O', 'ריבוע EFGH חוסם את מעגל O'], [C, C, C]],
  [['מעגל O', 'משולש ABC חוסם את מעגל O', 'ריבוע EFGH חוסם את מעגל O'], [C, C, C]],
  [['מעגל O', 'ריבוע ABCD חסום במעגל O', 'ריבוע EFGH חוסם את מעגל O'], [C, C, C]],
  [['מעגל O', 'ריבוע ABCD חוסם את מעגל O', 'מעגל O ברדיוס 3'], [C, C, C]],
  [['נקודה A', 'M נקודת החיתוך של AB ו-CD'], [C, C]],
  [['נקודה C', 'M נקודת החיתוך של AB ו-CD'], [C, C]],
  [['נקודה A', 'נקודה B', 'נקודה C', 'נקודה D', 'M נקודת החיתוך של AB ו-CD'], [C, C, C, C, C]],
  [['מעגל O', 'ריבוע ABCD חוסם את מעגל O', 'מרובע EFGH חסום במעגל O', 'EFGH ריבוע'], [C, C, C, C]], // #2454
  [['ריבוע ABCD', 'מעגל O', 'מעגל O חסום בריבוע ABCD'], [C, C, C]], // existing ring AND circle: the generic path, appended
];
/** Controls that never took over at main: their verdicts are unchanged (measured at 1944d866 and after the fix). */
const CONTROLS: [string[], Verdict['kind'][]][] = [
  [['מעגל O', 'משולש ABC חסום במעגל O'], [C, C]],
  [['מעגל O', 'משולש ABC חוסם את מעגל O'], [C, C]],
  [['מעגל O', 'ריבוע ABCD חסום במעגל O'], [C, C]],
  [['מעגל O', 'מלבן ABCD חסום במעגל O'], [C, C]],
  [['מעגל O', 'משושה משוכלל ABCDEF חסום במעגל O'], [C, C]],
  [['מעגל O', 'מעגל O ברדיוס 3'], [C, C]],
  [['מעגל O', 'רדיוס מעגל O הוא 3'], [C, C]],
  [['מעגל O', 'AB מיתר במעגל O'], [C, C]],
  [['מעגל O', 'AB קוטר במעגל O'], [C, C]],
  [['מעגל O', 'מעגל O שקוטרו AB'], [C, C]],
  [['מעגל O', 'מעגל O עובר דרך A'], [C, C]],
  [['מעגל O', 'מעגל O חוסם את משולש ABC'], [C, C]],
  [['מעגל O', 'מעגל O חוסם את ריבוע ABCD'], [C, C]],
  [['מעגל O', 'מעגל O חסום במשולש ABC'], [C, C]],
  [['משולש ABC', 'מעגל O חוסם את משולש ABC'], [C, C]],
  [['משולש ABC', 'מעגל O חסום במשולש ABC'], [C, C]],
  [['משולש ABC', 'משולש ABC חסום במעגל O'], [C, C]],
  [['משולש ABC', 'ריבוע ABCD'], [C, C]],
  [['משולש ABC', 'AD גובה'], [C, C]],
  [['משולש ABC', 'BC = 5'], [C, C]],
  [['קטע AB', 'משולש ABC'], [C, C]],
  [['מרובע ABCD', 'ABCD ריבוע'], [C, C]],
  [['נקודה A', 'נקודה A'], [C, 'noop']],
  [['נקודה A', 'משולש ABC'], [C, C]],
  [['נקודה A', 'קטע AB'], [C, C]],
  [['נקודה A', 'נקודה A נמצאת על הישר BC'], [C, C]],
  [['נקודה G', 'G על הישר BD'], [C, C]],
  [['נקודה O', 'מעגל O'], [C, C]],
  [['נקודה O', 'מעגל O ברדיוס 3'], [C, C]],
  [['מעגל O ברדיוס 3', 'מעגל O'], [C, 'noop']],
  [['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O'], [C, C]],
  [['BC = 5', 'משולש ABC'], [C, C]],
  [['ריבוע ABCD חוסם את מעגל O', 'מעגל O'], [C, 'noop']],
  [['ריבוע ABCD חוסם את מעגל O', 'מרובע EFGH חסום במעגל O', 'EFGH ריבוע'], [C, C, C]],
];

beforeEach(() => llmParseMock.mockReset());

describe('#2480 — a committed row keeps its text, group, command and place when a later line is added', () => {
  for (const [lines, verdicts] of [...TAKEOVERS, ...CONTROLS])
    it(lines.join(' · '), async () => {
      await play(lines, verdicts);
      expect(llmParseMock).not.toHaveBeenCalled();
    });

  it('a stated second radius over a circle is still refused, and the first row stays (ADR-683, unchanged)', async () => {
    st().clear();
    await submit('מעגל O ברדיוס 3');
    const before = st().facts.slice();
    expect((await submit('מעגל O ברדיוס 5')).kind).toBe('refuse');
    expect(st().facts).toEqual(before);
  });

  it('the operator\'s T5: three rows in order, verbatim, both squares on the one circle O', async () => {
    const lines = ['מעגל O', 'ריבוע חוסם את מעגל O', 'ריבוע חסום במעגל O'];
    const fig = await play(lines, [C, C, C]);
    const rows: string[] = [];
    st().facts.forEach((f, i) => { if (i === 0 || groupKey(f) !== groupKey(st().facts[i - 1])) rows.push(f.utterance!); });
    expect(rows).toEqual(lines);
    expect([...fig.circles.keys()]).toEqual(['circle-O']);
  });
});

// ── Part B: the quadrilateral is built AROUND the circle the student already has ─────────────────────────────────

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / d(a, b);
const dot = (a: Vec, b: Vec, c: Vec, e: Vec) => (b.x - a.x) * (e.x - c.x) + (b.y - a.y) * (e.y - c.y);
const cross = (a: Vec, b: Vec, c: Vec, e: Vec) => (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x);

/** Each side of ABCD is tangent to circle O AT A POINT OF THE SIDE (an incircle, never an excircle), the ring is convex. */
function expectTangential(fig: ReturnType<typeof replay>, v: string[], what: string) {
  const c = fig.circles.get('circle-O')!;
  const P = v.map((k) => fig.positions.get(k)!);
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    expect(Math.abs(distToLine(c.center, a, b) - c.r), `${what}: side ${v[i]}${v[(i + 1) % 4]} tangent`).toBeLessThan(1e-6);
    const t = dot(a, b, a, c.center) / d(a, b) ** 2; // the foot of the centre on the side
    expect(t > 1e-6 && t < 1 - 1e-6, `${what}: side ${v[i]}${v[(i + 1) % 4]} touches within the side`).toBe(true);
  }
  const turns = [0, 1, 2, 3].map((i) => Math.sign(cross(P[i], P[(i + 1) % 4], P[(i + 1) % 4], P[(i + 2) % 4])));
  expect(new Set(turns).size, `${what}: convex`).toBe(1);
}

const SHAPE: Record<string, (P: Vec[]) => [string, number][]> = {
  square: ([A, B, C, D]) => [['AB=BC', d(A, B) - d(B, C)], ['AB⟂BC', dot(A, B, B, C)], ['BC=CD', d(B, C) - d(C, D)]],
  rhombus: ([A, B, C, D]) => [['AB=BC', d(A, B) - d(B, C)], ['BC=CD', d(B, C) - d(C, D)]],
  trapezoid: ([A, B, C, D]) => [['AB∥DC', cross(A, B, D, C)]],
  rightTrapezoid: ([A, B, C, D]) => [['AB∥DC', cross(A, B, D, C)], ['AD⟂AB', dot(A, D, A, B)]],
  isoTrapezoid: ([A, B, C, D]) => [['AB∥DC', cross(A, B, D, C)], ['AD=BC', d(A, D) - d(B, C)]],
  // either axis (ADR-138: «הציגו תצורה אחרת» cycles it): AC (|AB|=|AD|, |CB|=|CD|) or BD (|AB|=|BC|, |AD|=|DC|)
  // #2538 (ADR-763): the kite's equal pairs are SOLVED (a shape-variant over four free touch angles, jointly with each
  // side's within-the-side order), so they hold to the solver's relative tolerance: read the mismatch per unit perimeter
  kite: ([A, B, C, D]) => [['a kite', Math.min(Math.abs(d(A, B) - d(A, D)) + Math.abs(d(C, B) - d(C, D)), Math.abs(d(A, B) - d(B, C)) + Math.abs(d(A, D) - d(D, C))) / (d(A, B) + d(B, C) + d(C, D) + d(D, A))]],
  quad: () => [],
};

const AROUND: [string, keyof typeof SHAPE][] = [
  ['ריבוע ABCD חוסם את מעגל O', 'square'],
  ['מלבן ABCD חוסם את מעגל O', 'square'], // only a square is a tangential rectangle
  ['מעוין ABCD חוסם את מעגל O', 'rhombus'],
  ['מקבילית ABCD חוסמת את מעגל O', 'rhombus'], // only a rhombus is a tangential parallelogram
  ['טרפז ABCD חוסם את מעגל O', 'trapezoid'],
  ['טרפז ישר זווית ABCD חוסם את מעגל O', 'rightTrapezoid'],
  ['טרפז שווה שוקיים ABCD חוסם את מעגל O', 'isoTrapezoid'],
  ['מעגל O חסום בדלתון ABCD', 'kite'],
  ['מרובע ABCD חוסם את מעגל O', 'quad'],
  ['מעגל O חסום במרובע ABCD', 'quad'],
];

describe('#2480 Part B — a quadrilateral around an existing circle keeps the circle and touches it on every side', () => {
  for (const [line, shape] of AROUND)
    it(`«מעגל O ברדיוס 3» · «${line}» → circle O unchanged (centre, radius 3), every side tangent, the ${shape} holds — in the shown and cycled views`, async () => {
      st().clear();
      await submit('מעגל O ברדיוס 3');
      const was = replay(st().facts, st().seed).circles.get('circle-O')!;
      let fig = await play(['מעגל O ברדיוס 3', line], [C, C]);
      let cur = { facts: st().facts, seed: st().seed };
      for (let k = 0; k <= 3; k++) {
        const c = fig.circles.get('circle-O')!;
        expect(c.r, 'the stated radius is kept').toBeCloseTo(3, 9);
        if (k === 0) expect(d(c.center, was.center), 'the circle did not move').toBeLessThan(1e-9);
        expectTangential(fig, ['A', 'B', 'C', 'D'], `view ${k}`);
        const P = ['A', 'B', 'C', 'D'].map((x) => fig.positions.get(x)!);
        for (const [name, r] of SHAPE[shape](P)) expect(Math.abs(r), `view ${k}: ${name}`).toBeLessThan(1e-6);
        const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
        if (!next) break;
        expect(meetsRequirements(next.facts, next.seed)).toBe(true);
        cur = next;
        fig = replay(cur.facts, cur.seed);
      }
    });

  it('«מעגל O ברדיוס 3» · «ריבוע חוסם את מעגל O» draws a square of side 6', async () => {
    const fig = await play(['מעגל O ברדיוס 3', 'ריבוע חוסם את מעגל O'], [C, C]);
    const ring = fig.construction.objects.find((o) => o.kind === 'polygon' && o.vertices.length === 4);
    expect(ring && ring.kind === 'polygon' && ring.declaredAs).toBe('square');
    const P = ring!.kind === 'polygon' ? ring!.vertices.map((x) => fig.positions.get(x)!) : [];
    for (let i = 0; i < 4; i++) expect(d(P[i], P[(i + 1) % 4])).toBeCloseTo(6, 6);
  });

  it('two squares around one circle are two distinct squares, both tangent', async () => {
    const fig = await play(['מעגל O', 'ריבוע ABCD חוסם את מעגל O', 'ריבוע EFGH חוסם את מעגל O'], [C, C, C]);
    expectTangential(fig, ['A', 'B', 'C', 'D'], 'ABCD');
    expectTangential(fig, ['E', 'F', 'G', 'H'], 'EFGH');
    expect(d(fig.positions.get('A')!, fig.positions.get('E')!)).toBeGreaterThan(0.1);
  });

  it('the kite keeps its cyclable axis (ADR-138): «הציגו תצורה אחרת» reaches the other axis, still tangent', async () => {
    await play(['מעגל O', 'מעגל O חסום בדלתון ABCD'], [C, C]);
    expect(st().cycleVariant()).toBe(true);
    const fig = replay(st().facts, st().seed);
    expectTangential(fig, ['A', 'B', 'C', 'D'], 'axis BD');
    const [A, B, Cc, D] = ['A', 'B', 'C', 'D'].map((x) => fig.positions.get(x)!);
    expect(Math.abs(d(A, B) - d(B, Cc))).toBeLessThan(1e-6);
    expect(Math.abs(d(A, D) - d(D, Cc))).toBeLessThan(1e-6);
  });

  it('a stated right angle is marked like the standalone right trapezoid\'s', async () => {
    const fig = await play(['מעגל O', 'טרפז ישר זווית ABCD חוסם את מעגל O'], [C, C]);
    expect(fig.angleMarks.some((m) => m.right && m.vertex === 'A')).toBe(true);
  });
});

// ── the fold rule itself ─────────────────────────────────────────────────────────────────────────────────────────

describe('#2480 — foldCommand never rewrites a committed fact', () => {
  let n = 0;
  const mint = (cmd: AnyCommand): Fact => ({ id: `new.${n++}`, group: 'new', utterance: 'later', enabled: true, cmd });
  const circleO: Fact = { id: 'f0', utterance: 'מעגל O', enabled: true, cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } };
  const pointA: Fact = { id: 'f1', utterance: 'נקודה A', enabled: true, cmd: { type: 'free-point', id: 'A', x: 1, y: 2 } };

  it('a circle-through re-emitted for a standalone committed circle appends; the first fact is the same object', () => {
    const facts = [circleO];
    const out = foldCommand(facts, { type: 'circle-through', id: 'circle-O', center: 'O', through: 'P' }, mint, 'later');
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(circleO);
  });
  it('an ifAbsent free point over a committed free point changes nothing', () => {
    const facts = [pointA];
    expect(foldCommand(facts, { type: 'free-point', id: 'A', x: 7, y: 7, ifAbsent: true }, mint, 'later')).toBe(facts);
  });
  it('a re-placed committed free point appends a move fact', () => {
    const facts = [pointA];
    const out = foldCommand(facts, { type: 'free-point', id: 'A', x: 7, y: 7 }, mint, 'later');
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(pointA);
  });
  it('within ONE batch the same commands still collapse in place (no other row is at stake)', () => {
    const facts = [pointA];
    const out = foldCommand(facts, { type: 'free-point', id: 'A', x: 7, y: 7 }, mint, 'line', 0);
    expect(out).toHaveLength(1);
    expect(out[0].cmd).toEqual({ type: 'free-point', id: 'A', x: 7, y: 7 });
  });
  it('the ruled ADR-578 re-enable of an unticked twin is the one change to an earlier fact', () => {
    const off = { ...circleO, enabled: false };
    const out = foldCommand([off], circleO.cmd, mint, 'later');
    expect(out).toEqual([{ ...off, enabled: true }]);
  });
});
