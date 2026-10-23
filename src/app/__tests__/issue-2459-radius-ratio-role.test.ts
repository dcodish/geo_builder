/**
 * #2459 ([ADR-754](../../../docs/06-decisions.md#adr-754)) — a radius ratio between the circles of a concentric pair,
 * named by their ROLES, is a relation; and a factor is never drawn as a size.
 *
 * Measured on `main` 050c04a9 through `decideDeterministic2D` + `replay`, the model stubbed: after «שני מעגלים בעלי
 * מרכז משותף O» · «רדיוס מעגל פנימי 1.5», «רדיוס המעגל החיצוני גדול פי 2 מרדיוס המעגל הפנימי» committed
 * `set-radius circle-O = 2` — outer 2, inner 1.5, green and wrong. The ratio reader (`radiusRatio`, ADR-649) read only
 * the letter form, so `setRadius` claimed the line: its value slot took the factor, and the span accountant let that
 * size «pay» for «פי 2».
 *
 * Class: a factor relating a circle's radius to another radius is lowered to an absolute radius equal to the factor
 * whenever the ratio reader cannot read the comparand — and it could not read any comparand named by its role. Two
 * layers, both fixed: the radius references are resolved per span (letter, role, a pair's shared centre letter), and
 * the span accountant pays a factor only with a ratio coefficient. Ruling basis: #2100 (2026-10-14), #2264 A, #2206.
 *
 * Path: `decideDeterministic2D` (the submit pipeline's decision) + the gate + `replay`, the model mocked; the LLM seam
 * through `runSubmit`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { firstSatisfyingSeed, searchAnotherView } from '@/replay/core';
import { driveThroughGate } from '../../__tests__/submit-gate';

const PAIR = 'שני מעגלים בעלי מרכז משותף O';
const IN = 'רדיוס מעגל פנימי 1.5';
const OP = 'רדיוס המעגל החיצוני גדול פי 2 מרדיוס המעגל הפנימי';
const PAIR_EN = 'two circles with a common center O';
const IN_EN = 'the radius of the inner circle is 1.5';

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** Drive the sequence through the gate; assert it commits green, and return the drawn radii. */
function build(lines: string[], { violations = 0 } = {}) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations.length, 'violations').toBe(violations);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return { facts, fig, out: fig.circles.get('circle-O')!.r, inn: fig.circles.get('circle-O-2')!.r };
}

const committed = (v: Awaited<ReturnType<typeof decide>>) => (v.kind === 'commit' ? v.commands : null);
const ratioOf = (v: Awaited<ReturnType<typeof decide>>) => {
  const c = committed(v);
  return c && c.length === 1 && c[0].type === 'set-radius-ratio' ? { c1: c[0].c1, c2: c[0].c2, k: c[0].k } : null;
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2459 A — both circles of the pair named by role: r_out = 2·r_in', () => {
  it.each([
    [OP],
    ['רדיוס מעגל חיצוני גדול פי 2 מרדיוס מעגל פנימי'],
    ['רדיוס של המעגל החיצוני גדול פי 2 מהרדיוס של המעגל הפנימי'],
    ['רדיוס המעגל החיצוני פי 2 מרדיוס המעגל הפנימי'],
    ['רדיוס המעגל החיצוני הוא פי 2 מרדיוס המעגל הפנימי'],
    ['רדיוס המעגל החיצוני גדול מרדיוס המעגל הפנימי פי 2'],
    ['רדיוס המעגל החיצוני שווה ל-2 פעמים רדיוס המעגל הפנימי'],
    ['רדיוס המעגל החיצוני 2 פעמים רדיוס המעגל הפנימי'],
    ['רדיוס המעגל הגדול גדול פי 2 מרדיוס המעגל הקטן'],
  ])('«%s» → outer 3 over inner 1.5, read deterministically', async (line) => {
    expect(ratioOf(await decide([PAIR, IN], line))).toEqual({ c1: 'circle-O', c2: 'circle-O-2', k: 2 });
    const { out, inn } = build([PAIR, IN, line]);
    expect(inn).toBeCloseTo(1.5, 5);
    expect(out).toBeCloseTo(3, 5);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each([
    ['the radius of the outer circle is 2 times the radius of the inner circle'],
    ['the radius of the outer circle is 2 times larger than the radius of the inner circle'],
  ])('en «%s» → outer 3', async (line) => {
    expect(ratioOf(await decide([PAIR_EN, IN_EN], line, 'en'))).toEqual({ c1: 'circle-O', c2: 'circle-O-2', k: 2 });
    const { out, inn } = build([PAIR_EN, IN_EN, line]);
    expect([out, inn].map((r) => +r.toFixed(5))).toEqual([3, 1.5]);
  });

  it('«פי 1.5» → outer 2.25', async () => {
    const line = 'רדיוס המעגל החיצוני גדול פי 1.5 מרדיוס המעגל הפנימי';
    expect(ratioOf(await decide([PAIR, IN], line))).toEqual({ c1: 'circle-O', c2: 'circle-O-2', k: 1.5 });
    expect(build([PAIR, IN, line]).out).toBeCloseTo(2.25, 5);
  });

  it.each([
    ['he', [PAIR, 'רדיוס מעגל חיצוני 3'], 'רדיוס המעגל הפנימי קטן פי 2 מרדיוס המעגל החיצוני'],
    ['en', [PAIR_EN, 'the radius of the outer circle is 3'], 'the radius of the inner circle is 2 times smaller than the radius of the outer circle'],
  ] as const)('%s: the inner stated «קטן פי 2» of the outer → k = ½, the «2» declared consumed; inner 1.5', async (loc, pre, line) => {
    const v = await decide([...pre], line, loc);
    expect(committed(v)).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O-2', c2: 'circle-O', k: 0.5, consumed: { numbers: [2] } }]);
    const { out, inn } = build([...pre, line]);
    expect([out, inn].map((r) => +r.toFixed(5))).toEqual([3, 1.5]);
  });

  it('the inner stated BIGGER than the outer commits with the radius-order warning, as «רדיוס מעגל פנימי 4» after outer 3 does', async () => {
    const line = 'רדיוס המעגל הפנימי גדול פי 2 מרדיוס המעגל החיצוני';
    expect(ratioOf(await decide([PAIR, 'רדיוס מעגל חיצוני 3'], line))).toEqual({ c1: 'circle-O-2', c2: 'circle-O', k: 2 });
    const { inn } = build([PAIR, 'רדיוס מעגל חיצוני 3', line], { violations: 1 });
    expect(inn).toBeCloseTo(6, 5);
    build([PAIR, 'רדיוס מעגל חיצוני 3', 'רדיוס מעגל פנימי 4'], { violations: 1 }); // the 2-D twin it mirrors
  });
});

describe('#2459 B — every order of stating the sizes', () => {
  it('both radii free: the ratio holds at every sampled size (ADR-052)', () => {
    const { facts, out, inn } = build([PAIR, OP]);
    expect(out / inn).toBeCloseTo(2, 5);
    // The free size is a sampled DOF: every seed draws the ratio, at a different size.
    const sizes = new Set<string>();
    for (let seed = 0; seed < 4; seed++) {
      const c = replay(facts, seed).circles;
      expect(c.get('circle-O')!.r / c.get('circle-O-2')!.r).toBeCloseTo(2, 5);
      sizes.add(c.get('circle-O')!.r.toFixed(3));
    }
    expect(sizes.size, 'the free size is sampled').toBeGreaterThan(1);
    // Measured, not the plan's lock: two concentric circles with r_out = 2·r_in are ONE figure up to scale, so
    // «הציגו תצורה אחרת» has no other configuration to show — exactly 2-D's answer for «ריבוע ABCD» or a lone circle.
    expect(searchAnotherView(facts, firstSatisfyingSeed(facts), undefined, Number.POSITIVE_INFINITY)).toBeNull();
    expect(searchAnotherView(driveThroughGate(['ריבוע ABCD']).facts, 0, undefined, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('the ratio first, the inner size after → 3 / 1.5', () => {
    const { out, inn } = build([PAIR, OP, IN]);
    expect([out, inn].map((r) => +r.toFixed(5))).toEqual([3, 1.5]);
  });

  it('the outer stated 3 first → the ratio sizes the inner to 1.5 (it was refused)', () => {
    const { out, inn } = build([PAIR, 'רדיוס מעגל חיצוני 3', OP]);
    expect([out, inn].map((r) => +r.toFixed(5))).toEqual([3, 1.5]);
  });

  it('the ratio «קטן פי 2» first, then the inner size → 3 / 1.5 (it was refused)', () => {
    const { out, inn } = build([PAIR, 'רדיוס המעגל הפנימי קטן פי 2 מרדיוס המעגל החיצוני', IN]);
    expect([out, inn].map((r) => +r.toFixed(5))).toEqual([3, 1.5]);
  });

  it('both sizes stated and contradicting → refused with the existing contradiction message, as «R = 2r» is', async () => {
    const v = await decide([PAIR, IN, 'רדיוס מעגל חיצוני 4'], OP);
    expect(v.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.category).toBe('conflict');
  });
});

describe('#2459 C — mixed letter and role references', () => {
  it('«רדיוס מעגל P גדול פי 2 מרדיוס המעגל הפנימי» sizes P to twice the inner', async () => {
    const pre = [PAIR, IN, 'מעגל P'];
    const line = 'רדיוס מעגל P גדול פי 2 מרדיוס המעגל הפנימי';
    expect(ratioOf(await decide(pre, line))).toEqual({ c1: 'circle-P', c2: 'circle-O-2', k: 2 });
    const { fig } = build([...pre, line]);
    expect(fig.circles.get('circle-P')!.r).toBeCloseTo(3, 5);
  });

  it.each([
    [[PAIR, IN], 'רדיוס המעגל החיצוני גדול פי 2 מרדיוס מעגל O'],
    [[PAIR, IN], 'רדיוס מעגל O גדול פי 2 מרדיוס המעגל הפנימי'],
    [[PAIR, 'מעגל P'], 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P'],
  ])('the pair\'s shared centre letter is asked about, never silently the outer: %j «%s»', async (pre, line) => {
    const v = await decide(pre, line);
    expect(v.kind === 'refuse' && v.note).toEqual({ key: 'input.ambiguousCircle', params: { center: 'O' } });
  });

  it.each([
    ['רדיוס המעגל החיצוני שווה לרדיוס המעגל הפנימי'],
    ['רדיוס המעגל החיצוני גדול פי 1 מרדיוס המעגל הפנימי'],
  ])('equal radii of the pair «%s» → the existing equal-concentric refusal (#2206, ADR-713)', async (line) => {
    const v = await decide([PAIR, IN], line);
    expect(v).toMatchObject({ kind: 'refuse', note: { key: 'input.equalCirclesNested.concentric' } });
  });

  it('a role with no single pair names no circle: escalate, never a guess', async () => {
    expect((await decide([PAIR, 'שני מעגלים בעלי מרכז משותף Q'], OP)).kind).toBe('escalate');
    expect((await decide(['מעגל O', 'מעגל P'], 'רדיוס המעגל החיצוני גדול פי 2 מרדיוס מעגל P')).kind).toBe('escalate');
  });
});

describe('#2459 D — a factor whose comparand is not read is never drawn as a size', () => {
  it.each([
    [[PAIR, IN], 'רדיוס המעגל החיצוני גדול פי 2'],
    [[PAIR, IN], 'רדיוס המעגל החיצוני גדול פי 2 מזה של המעגל הפנימי'],
    [[PAIR, IN], 'רדיוס המעגל החיצוני גדול פי 2 מרדיוס הפנימי'],
    [['מעגל O', 'מעגל P ברדיוס 1.5'], 'רדיוס מעגל O גדול פי 2'],
    [['מעגל O'], 'רדיוס המעגל גדול פי 2'],
    [['מעגל O ברדיוס 1.5'], 'רדיוס המעגל גדול פי 2'],
    [['מעגל O ברדיוס 1.5'], 'הרדיוס גדול פי 2'],
    [['מעגל O ברדיוס 1.5'], 'רדיוס מעגל O הוא פי 2'],
    [['מעגל O ברדיוס 1.5'], 'רדיוס מעגל O קטן פי 2'],
  ])('%j «%s» → escalates (the factor is unpaid), no set-radius', async (pre, line) => {
    const v = await decide(pre, line);
    expect(v.kind).toBe('escalate');
  });

  it.each([
    [[PAIR_EN, IN_EN], "the outer circle's radius is 2 times the inner circle's radius"],
    [['circle O with radius 1.5'], 'the radius of circle O is 2 times larger'],
  ])('en %j «%s» → escalates', async (pre, line) => {
    expect((await decide(pre, line, 'en')).kind).toBe('escalate');
  });

  it('the LLM seam: an AI reading of «פי 2» as the radius 2 is refused, nothing recorded', async () => {
    useGeoStore.getState().clear();
    const notes: string[] = [];
    const deps: SubmitDeps = {
      t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
      locale: 'he',
      ui: { setInputNote: (m) => notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const d = replay(st.facts, st.seed);
        return { construction: d.construction, positions: d.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw) => raw ?? '',
    };
    for (const l of [PAIR, IN]) await runSubmit(l, deps);
    const before = useGeoStore.getState().facts.length;
    llmParseMock.mockResolvedValue({ built: [{ step: 'רדיוס המעגל החיצוני הוא 2', commands: [{ type: 'set-radius', circle: 'circle-O', value: 2 }] }], dropped: [] });
    notes.length = 0;
    await runSubmit('רדיוס המעגל החיצוני גדול פי 2', deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(notes.filter(Boolean).join(' ')).toMatch(/input\.labelsDropped/);
  });
});

describe('#2459 — controls, unchanged', () => {
  it('the letter forms read byte-identical commands (#2100)', async () => {
    const two = ['מעגל O', 'מעגל P'];
    expect(committed(await decide(two, 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P'))).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 2 }]);
    expect(committed(await decide(two, 'רדיוס מעגל O קטן פי 2 מרדיוס מעגל P'))).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 0.5, consumed: { numbers: [2] } }]);
    expect(committed(await decide(two, 'רדיוס מעגל O שווה לרדיוס מעגל P'))).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 1 }]);
  });

  it('a single role value is still a size', async () => {
    expect(committed(await decide([PAIR, IN], 'רדיוס המעגל החיצוני הוא 3'))).toEqual([{ type: 'set-radius', circle: 'circle-O', value: 3 }]);
  });

  it('«AB גדול פי 2» still asks for the comparand; «AB גדול פי 2 מ-AC» is still the ratio', async () => {
    const v = await decide(['משולש ABC'], 'AB גדול פי 2');
    expect(v).toMatchObject({ kind: 'refuse', note: { key: 'input.incompleteComparative' } });
    expect(committed(await decide(['משולש ABC'], 'AB גדול פי 2 מ-AC'))?.[0]).toMatchObject({ type: 'set-ratio', k: 2 });
  });
});

describe('#2459 — stability: the ratio lands without moving what it does not govern', () => {
  it('A on the outer, B on the inner: inner stays 1.5, outer 3, members stay on their circles, no violation', () => {
    const { fig } = build([PAIR, IN, 'A על המעגל החיצוני', 'B על המעגל הפנימי', OP]);
    const O = fig.positions.get('O')!, A = fig.positions.get('A')!, B = fig.positions.get('B')!;
    expect(fig.circles.get('circle-O-2')!.r).toBeCloseTo(1.5, 5);
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(3, 5);
    expect(Math.hypot(A.x - O.x, A.y - O.y)).toBeCloseTo(3, 6);
    expect(Math.hypot(B.x - O.x, B.y - O.y)).toBeCloseTo(1.5, 6);
  });
});
