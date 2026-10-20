/**
 * #2428 ([ADR-741](../../docs/06-decisions.md#adr-741)) — THE ONLY COMMON TANGENT IS THE TANGENT AT T, AND THE AI LANE
 * READS THE FIGURE AS THE GRAMMAR DOES.
 *
 * Operator, 2026-10-20 (round #2414 T5, on an internally tangent pair with free A, B): *"In my test, it took a long time
 * and points A B and T are not on the same point"*; ruling: *"there is an option for drawing AB correctly … we should
 * draw correctly."* Measured at main 17168818 (headless, model mocked):
 *  - his six lines: `not-handled` deterministically (the capacity exit built the tangent at T but left the existing
 *    free A, B unlowered, so the accountant declined it) → the AI echoed the line → the lane re-parsed it with 8 of the
 *    context's fields, read no pair position, and lowered a TWO-TOUCH tangent the pair does not have; the solver shrank
 *    the circles toward A ≈ B ≈ T (|AB| = 0.005), green, after 13.2 s in the browser with an instant model;
 *  - siblings, same shape: «… פנימי …» on an externally tangent pair, and a third tangent after the two externals.
 * Root causes: R1 the capacity exit had no seat for existing free letters; R2 the lane re-parsed with a hand-built
 * subset of `ParseContext`; R3 the engine accepted a two-touch record on a pair the statements give none.
 *
 * Every tangency is computed HERE from the resolved circles and the drawn letters. The model is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', async (orig) => ({ ...(await orig<typeof import('@/parser/llm')>()), llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { laneContext } from '@/app/laneContext';
import { replay, trialFacts, useGeoStore, type Fact } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { TANGENTS_EXHAUSTED } from '@/engine/radiusFeasibility';
import { emptyConstruction, type AnyCommand, type Vec } from '@/engine';
import { COMMAND_CATALOG } from '@/parser/catalog';

const st = () => useGeoStore.getState();
type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function submit(line: string): Promise<Verdict> {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[a-z]{3}/.test(line) ? 'en' : 'he');
  commitVerdict(v, line);
  return v;
}
async function play(lines: string[]) {
  st().clear();
  for (const line of lines.slice(0, -1)) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const before = st().facts.slice();
  const v = await submit(lines[lines.length - 1]);
  return { v, before };
}
const distToLine = (p: Vec, a: Vec, d: Vec) => Math.abs((p.x - a.x) * d.y - (p.y - a.y) * d.x) / Math.hypot(d.x, d.y);

/** AB is the common tangent at T: tangent to both drawn circles, through T, A and B distinct points on it, green. */
function expectAbAtT(seed: number) {
  const r = replay(st().facts, seed);
  expect(r.lastError, `seed ${seed}`).toBeNull();
  expect(r.violations, `seed ${seed} green`).toEqual([]);
  const circles = [...r.circles.values()];
  expect(circles.length, 'exactly the two drawn circles').toBe(2);
  const [A, B, T] = ['A', 'B', 'T'].map((k) => r.positions.get(k)!);
  const d = { x: B.x - A.x, y: B.y - A.y };
  const scale = Math.max(...circles.map((c) => c.r));
  expect(Math.hypot(d.x, d.y), `seed ${seed}: A and B are two points, not one`).toBeGreaterThan(0.05 * scale);
  for (const c of circles) expect(Math.abs(distToLine(c.center, A, d) - c.r), `seed ${seed}: tangent to the circle at (${c.center.x.toFixed(2)},${c.center.y.toFixed(2)})`).toBeLessThan(1e-6);
  expect(distToLine(T, A, d), `seed ${seed}: through T`).toBeLessThan(1e-6);
  for (const c of circles) expect(Math.abs(Math.hypot(T.x - c.center.x, T.y - c.center.y) - c.r), `seed ${seed}: T on both circles`).toBeLessThan(1e-6);
}

beforeEach(() => llmParseMock.mockReset());

const INT = ['מעגל M', 'מעגל N', 'המעגלים משיקים מבפנים בנקודה T'];
const EXT = ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T'];
const FREE = ['נקודה A', 'נקודה B'];
/** The operator's exact six lines (T2's internal prefix, then T5's last three). */
const OPERATOR = [...INT, ...FREE, 'AB משיק משותף למעגלים M ו-N'];

describe('#2428 R1 — the only common tangent the pair has is the tangent at T: free A, B are seated on it', () => {
  const ROWS: [string, string[]][] = [
    ['the operator\'s exact six lines (inside pair)', OPERATOR],
    ['inside pair, «AB משיק משותף לשני המעגלים»', [...INT, ...FREE, 'AB משיק משותף לשני המעגלים']],
    ['sibling: «… פנימי …» on an outside pair (its one internal tangent is at T)', [...EXT, ...FREE, 'AB משיק משותף פנימי למעגלים M ו-N']],
    ['sibling: the third tangent of an outside pair after its two externals', [...EXT, 'CD משיק משותף למעגלים M ו-N', 'EF משיק משותף למעגלים M ו-N', ...FREE, 'AB משיק משותף למעגלים M ו-N']],
  ];
  for (const [name, lines] of ROWS)
    it(`${name} → AB is the tangent at T, A ≠ B on it, green at seeds 0–3, no model call`, async () => {
      const { v } = await play(lines);
      expect(v.kind).toBe('commit');
      for (const seed of [0, 1, 2, 3]) expectAbAtT(seed);
      expect(llmParseMock).not.toHaveBeenCalled();
    });

  it('stability: the circles, T and both radii do not move (the shown configuration)', async () => {
    const { before } = await play(OPERATOR);
    const r0 = replay(before, st().seed);
    const r1 = replay(st().facts, st().seed);
    const c0 = [...r0.circles.values()], c1 = [...r1.circles.values()];
    c0.forEach((c, i) => {
      expect(Math.hypot(c.center.x - c1[i].center.x, c.center.y - c1[i].center.y), `centre ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(c.r - c1[i].r), `radius ${i}`).toBeLessThan(1e-6);
    });
    const [T0, T1] = [r0.positions.get('T')!, r1.positions.get('T')!];
    expect(Math.hypot(T0.x - T1.x, T0.y - T1.y), 'T').toBeLessThan(1e-6);
  });

  it('the lowering: the tangent at T and the `at` seat record over the existing letters, no two-touch record', async () => {
    const { before } = await play(OPERATOR);
    const added = st().facts.slice(before.length).map((f) => f.cmd as AnyCommand);
    expect(added.some((c) => c.type === 'tangent' && c.id === 'tan-T')).toBe(true);
    expect(added.find((c) => c.type === 'common-tangent')).toMatchObject({ a: 'A', b: 'B', at: 'T' });
    expect(added.some((c) => c.type === 'common-tangent' && c.at === undefined)).toBe(false);
  });

  it('the control keeps its reading: an outside pair with free A, B still pulls them onto the circles (two-touch)', async () => {
    await play([...EXT, ...FREE, 'AB משיק משותף למעגלים M ו-N']);
    const added = st().facts.map((f) => f.cmd as AnyCommand);
    expect(added.some((c) => c.type === 'common-tangent' && c.at === undefined)).toBe(true);
    expect(replay(st().facts, st().seed).violations).toEqual([]);
  });

  it('a letter something else places is not seated: a triangle vertex beside an inside pair keeps the line declined', async () => {
    const { v } = await play([...INT, 'משולש ABC', 'AB משיק משותף למעגלים M ו-N']);
    expect(v.kind).not.toBe('commit');
  });
});

describe('#2428 R2 — the AI lane re-parses each line with the full context of its figure', () => {
  /** The real lane, the model's answer stubbed. */
  async function lane(lines: string[], answer: string[]) {
    st().clear();
    for (const line of lines) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
    const { llmParse } = await vi.importActual<typeof import('@/parser/llm')>('@/parser/llm');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ steps: answer }) })));
    const f = replay(st().facts, st().seed);
    const first = buildParseCtx(f.construction, f.positions);
    const out = await llmParse(answer.join(' '), '', laneContext(first, () => ({ facts: st().facts, seed: st().seed })));
    vi.unstubAllGlobals();
    return { out: out!, first };
  }

  it('the operator\'s echoed line reads exactly as the typed line: the tangent at T, never a two-touch tangent', async () => {
    const { out, first } = await lane(OPERATOR.slice(0, -1), [OPERATOR[5]]);
    const typed = parse(OPERATOR[5], first);
    expect(typed.ok).toBe(true);
    expect(out.built.flatMap((b) => b.commands)).toEqual(typed.ok ? typed.commands : []);
  });

  it('a multi-line answer: the later line reads the figure the earlier lines built (free A, B made by the model)', async () => {
    const { out } = await lane(INT, [...FREE, OPERATOR[5]]);
    expect(out.dropped).toEqual([]);
    // the deterministic reading of the same three lines typed one by one
    let facts: Fact[] = st().facts;
    const expected: AnyCommand[] = [];
    for (const line of [...FREE, OPERATOR[5]]) {
      const d = replay(facts, st().seed);
      const r = parse(line, buildParseCtx(d.construction, d.positions));
      expect(r.ok, line).toBe(true);
      if (r.ok) {
        expected.push(...r.commands);
        facts = trialFacts(st().facts, expected);
      }
    }
    expect(out.built.flatMap((b) => b.commands)).toEqual(expected);
    expect(out.built.flatMap((b) => b.commands).some((c) => c.type === 'common-tangent' && c.at === undefined)).toBe(false);
  });

  it('parity over the catalog: an echoed line re-parses to the deterministic reading on the same figure (3 figures × He/En)', async () => {
    const { llmParse } = await vi.importActual<typeof import('@/parser/llm')>('@/parser/llm');
    let checked = 0;
    for (const prefix of [[], OPERATOR.slice(0, -1), ['משולש ABC', 'נקודה D על BC']]) {
      st().clear();
      for (const line of prefix) expect((await submit(line)).kind).toBe('commit');
      const f = replay(st().facts, st().seed);
      const ctx = buildParseCtx(f.construction, f.positions);
      for (const c of COMMAND_CATALOG.filter((x) => x.supported)) {
        for (const line of [c.he, c.en]) {
          vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ steps: [line] }) })));
          const out = await llmParse(line, '', laneContext(ctx, () => ({ facts: st().facts, seed: st().seed })));
          const want = parse(line, ctx);
          expect(out!.built.flatMap((b) => b.commands), `«${line}» on [${prefix.join(' · ')}]`).toEqual(want.ok ? want.commands : []);
          checked++;
        }
      }
    }
    vi.unstubAllGlobals();
    expect(checked, 'the parity loop ran').toBeGreaterThan(100);
  });

  it('guard: llm.ts builds no ParseContext of its own — every re-parse reads the caller\'s `ctxFor`', () => {
    const src = readFileSync(join(__dirname, '../parser/llm.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const fields = Object.keys(buildParseCtx(emptyConstruction(), new Map()));
    expect(fields.length, 'the field list was read').toBeGreaterThan(20);
    for (const k of fields) expect(src, `llm.ts names the ParseContext field «${k}»`).not.toMatch(new RegExp(`\\b${k}\\s*:`));
    const calls = [...src.matchAll(/\bparse\(([^)]*\))?/g)].map((m) => m[0]);
    expect(calls.length, 'llm.ts re-parses').toBeGreaterThan(0);
    for (const c of calls) expect(c, 'each re-parse reads ctxFor').toMatch(/^parse\(step, ctxFor\(/);
  });
});

describe('#2428 R3 — the engine refuses a two-touch common tangent the stated pair does not have', () => {
  /** The figure the lane built on the operator's prefix: the logged commands, replayed as one line. */
  const TWO_TOUCH: AnyCommand[] = [
    { type: 'point-on-circle', id: 'A', circle: 'circle-M', softPair: true },
    { type: 'point-on-circle', id: 'B', circle: 'circle-N', softPair: true },
    { type: 'common-tangent', a: 'A', b: 'B', circle1: 'circle-M', circle2: 'circle-N', variant: 0 },
    { type: 'set-perpendicular', a: 'M', b: 'A', c: 'A', d: 'B', implicit: true },
    { type: 'set-perpendicular', a: 'N', b: 'B', c: 'A', d: 'B', implicit: true },
    { type: 'segment', a: 'A', b: 'B' },
  ] as AnyCommand[];
  const withKind = (kind: 'internal' | 'external') => TWO_TOUCH.map((c) => (c.type === 'common-tangent' ? { ...c, kind } : c)) as AnyCommand[];

  for (const [name, prefix, cmds, position] of [
    ['inside pair, kind-less (the operator\'s lane figure)', [...INT, ...FREE], TWO_TOUCH, 'int-tangent'],
    ['inside pair, «פנימי»', [...INT, ...FREE], withKind('internal'), 'int-tangent'],
    ['outside pair, «פנימי»', [...EXT, ...FREE], withKind('internal'), 'ext-tangent'],
    ['a circle inside the other', ['מעגל M', 'מעגל N', 'מעגל N מוכל בתוך מעגל M', ...FREE], TWO_TOUCH, 'contained'],
  ] as const)
    it(`${name}: refused by name, the circles unmoved`, async () => {
      st().clear();
      for (const line of prefix) expect((await submit(line)).kind, line).toBe('commit');
      const r0 = replay(st().facts, st().seed);
      const r = replay(trialFacts(st().facts, [...cmds]), st().seed);
      const failed = Object.values(r.status).find((s) => typeof s === 'string' && s !== 'ok') as string | undefined;
      expect(failed, 'the line is refused').toMatch(TANGENTS_EXHAUSTED);
      expect(failed).toContain(position);
      for (const [id, c] of r0.circles) expect(Math.abs(r.circles.get(id)!.r - c.r), `${id} radius unmoved`).toBeLessThan(1e-9);
    });

  it('control: a two-touch tangent on circles stated apart (no circle-position tangency) still builds', async () => {
    st().clear();
    for (const line of ['שני מעגלים זרים', 'AB משיק משותף לשני המעגלים']) expect((await submit(line)).kind, line).toBe('commit');
    expect(replay(st().facts, st().seed).violations).toEqual([]);
  });
});
