/**
 * #2405 ([ADR-751](../../docs/06-decisions.md#adr-751)) — «כל המשיקים המשותפים» DRAWS EVERY COMMON TANGENT OF THE PAIR.
 *
 * Measured at main 37800b85 through `decideDeterministic2D` → `commitVerdict` → `replay`, model mocked: «כל המשיקים
 * המשותפים לשני המעגלים», «המשיקים המשותפים …» and "all the common tangents …" committed ONE tangent, green, on apart,
 * crossing and externally tangent pairs (4, 2 and 3 exist). The fixed-count rule knew 1 or 2 tangents, never "the set":
 * the definite plural did not even match its plural regex, so «כל» was dropped silently.
 *
 * Every tangency below is computed HERE from the resolved circles and the drawn lines (never the engine's records).
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { statedCirclePosition, type Construction, type Vec } from '@/engine';
import { commonTangentCapacityError } from '@/engine/radiusFeasibility';

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
const noteKey = (v: Verdict) => (v as { note?: { key?: string } }).note?.key;

type Line = { p: Vec; d: Vec; id: string };
/** Every drawn line (segment or the tangent at a touch) that is tangent to BOTH resolved circles, at `seed`. */
function commonTangentLines(seed = st().seed): Line[] {
  const r = replay(st().facts, seed);
  expect(r.lastError, `seed ${seed}`).toBeNull();
  expect(r.violations, `seed ${seed} green`).toEqual([]);
  const circles = [...r.circles.values()];
  expect(circles.length, 'exactly the two circles').toBe(2);
  const out: Line[] = [];
  for (const o of r.construction.objects) {
    let p: Vec | undefined, d: Vec | undefined;
    if (o.kind === 'segment') {
      const a = r.positions.get(o.a), b = r.positions.get(o.b);
      if (a && b) [p, d] = [a, { x: b.x - a.x, y: b.y - a.y }];
    } else if (o.kind === 'line' && o.spec.via === 'tangent') {
      const T = r.positions.get(o.spec.at)!;
      const c = r.circles.get(o.spec.circle)!;
      [p, d] = [T, { x: -(T.y - c.center.y), y: T.x - c.center.x }];
    }
    if (!p || !d || Math.hypot(d.x, d.y) < 1e-9) continue;
    const n = Math.hypot(d.x, d.y);
    const tangentTo = (c: { center: Vec; r: number }) => Math.abs(Math.abs((c.center.x - p!.x) * d!.y - (c.center.y - p!.y) * d!.x) / n - c.r) < 1e-6;
    if (circles.every(tangentTo)) out.push({ p, d: { x: d.x / n, y: d.y / n }, id: o.id });
  }
  return out;
}
/** Two lines are the same line: parallel and through each other's point. */
const sameLine = (a: Line, b: Line) => Math.abs(a.d.x * b.d.y - a.d.y * b.d.x) < 1e-6 && Math.abs((b.p.x - a.p.x) * a.d.y - (b.p.y - a.p.y) * a.d.x) < 1e-6;
/** The shown configuration and up to three more from «הציגו תצורה אחרת» (the store's own cycle): `count` distinct
 *  common tangents, green, at each. */
function expectSet(count: number, cycles = 3) {
  const seen: number[] = [];
  for (let k = 0; k <= cycles; k++) {
    if (k > 0 && !st().cycleVariant()) break;
    const seed = st().seed;
    seen.push(seed);
    const lines = commonTangentLines(seed);
    expect(lines.length, `seed ${seed}: ${lines.map((l) => l.id).join(',')}`).toBe(count);
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) expect(sameLine(lines[i], lines[j]), `seed ${seed}: ${lines[i].id} ≠ ${lines[j].id}`).toBe(false);
  }
  return seen;
}

beforeEach(() => llmParseMock.mockReset());

const APART = ['שני מעגלים זרים'];
const CROSSING = ['שני מעגלים נחתכים'];
const EXT = ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T'];
const EXT_STATED = ['מעגל M', 'מעגל N', 'המעגלים משיקים מבחוץ בנקודה T'];
const INT = ['מעגל M', 'מעגל N', 'המעגלים משיקים מבפנים בנקודה T'];
const CONTAINED = ['מעגל M', 'מעגל N', 'מעגל N מוכל בתוך מעגל M'];
const UNSTATED = ['שני מעגלים'];
const SPELLINGS = ['כל המשיקים המשותפים לשני המעגלים', 'המשיקים המשותפים לשני המעגלים', 'all the common tangents of the two circles'];

describe('#2405 — every common tangent of a pair whose position is stated', () => {
  const ROWS: [string, string[], number][] = [
    ['apart', APART, 4],
    ['crossing', CROSSING, 2],
    ['touching, side unstated (outside by default, FR-EN-3)', EXT, 3],
    ['touching from outside, stated', EXT_STATED, 3],
    ['touching from inside', INT, 1],
  ];
  for (const [name, prefix, n] of ROWS)
    for (const line of SPELLINGS)
      it(`${name} · «${line}» → ${n} distinct common tangents, green in the shown and three cycled configurations, no model call`, async () => {
        const { v } = await play([...prefix, line]);
        expect(v.kind).toBe('commit');
        expectSet(n);
        expect(llmParseMock).not.toHaveBeenCalled();
      });

  for (const line of SPELLINGS)
    it(`one circle inside the other · «${line}» → the existing «no common tangent» refusal`, async () => {
      const { v } = await play([...CONTAINED, line]);
      expect(v.kind).toBe('refuse');
      expect(noteKey(v)).toBe('input.tangentsExhaustedContained');
    });

  it('the tangents are named by auto touch letters AB, CD, EF, GH (the «שני המשיקים המשותפים» convention)', async () => {
    await play([...APART, SPELLINGS[0]]);
    const segs = replay(st().facts, st().seed).construction.objects.flatMap((o) => (o.kind === 'segment' ? [o.id] : []));
    expect(segs).toEqual(['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']);
  });

  it('tangents already drawn count toward the set: AB first, then «כל…» draws the 3 missing ones', async () => {
    const { v } = await play([...APART, 'AB משיק משותף לשני המעגלים', SPELLINGS[0]]);
    expect(v.kind).toBe('commit');
    expectSet(4);
  });

  it('the tangent at T already drawn counts too: on an outside pair «כל…» then adds the two separate ones', async () => {
    const { v } = await play([...EXT, 'המשיק המשותף בנקודה T', SPELLINGS[0]]);
    expect(v.kind).toBe('commit');
    expectSet(3);
  });

  it('a repeated «כל…» has nothing left to draw → the existing «all four are drawn» refusal', async () => {
    const { v } = await play([...APART, SPELLINGS[0], SPELLINGS[0]]);
    expect(v.kind).toBe('refuse');
    expect(noteKey(v)).toBe('input.tangentsExhaustedAny');
  });

  it('stability: the circles and T do not move across the line', async () => {
    const { before } = await play([...EXT, SPELLINGS[0]]);
    const r0 = replay(before, st().seed), r1 = replay(st().facts, st().seed);
    const c0 = [...r0.circles.values()], c1 = [...r1.circles.values()];
    c0.forEach((c, i) => {
      expect(Math.hypot(c.center.x - c1[i].center.x, c.center.y - c1[i].center.y), `centre ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(c.r - c1[i].r), `radius ${i}`).toBeLessThan(1e-6);
    });
    const [T0, T1] = [r0.positions.get('T')!, r1.positions.get('T')!];
    expect(Math.hypot(T0.x - T1.x, T0.y - T1.y), 'T').toBeLessThan(1e-6);
  });

  it('a count is still a count: «שני המשיקים המשותפים» draws two (AB, CD)', async () => {
    const { v } = await play([...APART, 'שני המשיקים המשותפים לשני המעגלים']);
    expect(v.kind).toBe('commit');
    expectSet(2);
  });

  it('letters in the sentence name the tangents when there are two per tangent', async () => {
    const { v } = await play([...CROSSING, 'PQ ו-RS המשיקים המשותפים לשני המעגלים']);
    expect(v.kind).toBe('commit');
    expectSet(2);
    const ids = replay(st().facts, st().seed).construction.objects.flatMap((o) => (o.kind === 'segment' ? [o.id] : []));
    expect(ids).toEqual(['seg-PQ', 'seg-RS']);
  });

  it('any other letter count escalates whole — never a partial build (two names for four tangents)', async () => {
    const { v, before } = await play([...APART, 'PQ ו-RS המשיקים המשותפים לשני המעגלים']);
    const f = replay(before, st().seed);
    expect(parse('PQ ו-RS המשיקים המשותפים לשני המעגלים', buildParseCtx(f.construction, f.positions))).toMatchObject({ ok: false });
    expect(v.kind).not.toBe('commit');
  });
});

describe('#2405 — a pair whose position nobody stated: the interim refusal (P1 exception; #2442 is the permanent answer)', () => {
  it('«שני מעגלים» · «כל…» → the existing ambiguousConstruct sentence, naming the three statements that settle it', async () => {
    const { v } = await play([...UNSTATED, SPELLINGS[0]]);
    expect(v.kind).toBe('refuse');
    expect(noteKey(v)).toBe('input.ambiguousConstruct');
    const params = (v as unknown as { note: { params: { noun: string; options: string } } }).note.params;
    expect(params.noun).toBe('כל המשיקים המשותפים');
    expect(params.options).toBe('המעגלים זרים, המעגלים נחתכים בנקודות E ו-F, המעגלים משיקים בנקודה T');
  });

  // docs/17 §9: a taught remedy is a grammar claim — every option, through the real door, then the set builds
  const TAUGHT: [string, string, number][] = [
    ['he', SPELLINGS[0], 0],
    ['en', SPELLINGS[2], 0],
  ];
  for (const [lang, line] of TAUGHT)
    it(`(${lang}) every taught option commits on the unstated pair, and «${line}» then builds the set`, async () => {
      const { v } = await play([...UNSTATED, line]);
      const options = (v as unknown as { note: { params: { options: string } } }).note.params.options.split(', ');
      expect(options).toHaveLength(3);
      const counts = [4, 2, 3];
      for (const [i, option] of options.entries()) {
        const { v: after } = await play([...UNSTATED, option, line]);
        expect(after.kind, `«${option}» then «${line}»`).toBe('commit');
        expectSet(counts[i], 0);
      }
    });
});

describe('#2405 — one reader of the stated position, shared by the engine and the parser', () => {
  it('statedCirclePosition reads the statements, and the parser field and the engine guard agree with it', async () => {
    const cases: [string[], ReturnType<typeof statedCirclePosition>][] = [
      [APART, 'disjoint'], [CROSSING, 'crossing'], [EXT, 'ext-tangent'], [EXT_STATED, 'ext-tangent'], [INT, 'int-tangent'], [CONTAINED, 'contained'], [UNSTATED, undefined],
    ];
    for (const [prefix, want] of cases) {
      st().clear();
      for (const l of prefix) expect((await submit(l)).kind).toBe('commit');
      const f = replay(st().facts, st().seed);
      const circles = f.construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.id] : []));
      expect(statedCirclePosition(f.construction, circles[0], circles[1]), prefix.join(' · ')).toBe(want);
      expect(statedCirclePosition(f.construction, circles[1], circles[0]), 'either order').toBe(want);
      const ctx = buildParseCtx(f.construction, f.positions);
      expect(ctx.statedPairPositions?.[[...circles].sort().join('|')]).toBe(want);
      // the engine's two-touch capacity guard reads the same position
      const probe = { type: 'common-tangent', a: 'X', b: 'Y', circle1: circles[0], circle2: circles[1] } as const;
      const refused = commonTangentCapacityError(f.construction as Construction, probe as never) !== null;
      expect(refused, `${want}: no two-touch tangent`).toBe(want === 'contained' || want === 'int-tangent');
      const internal = commonTangentCapacityError(f.construction as Construction, { ...probe, kind: 'internal' } as never) !== null;
      expect(internal, `${want}: no two-touch internal tangent`).toBe(want === 'contained' || want === 'int-tangent' || want === 'ext-tangent');
    }
  });

  it('the count never reads the drawn seed: a lying deictic position changes nothing', async () => {
    for (const prefix of [APART, CROSSING, EXT, UNSTATED]) {
      st().clear();
      for (const l of prefix) await submit(l);
      const f = replay(st().facts, st().seed);
      const ctx = buildParseCtx(f.construction, f.positions);
      const lie = Object.fromEntries(Object.keys(ctx.circlePairPositions ?? {}).map((k) => [k, 'int-tangent' as const]));
      const honest = parse(SPELLINGS[0], ctx);
      const lied = parse(SPELLINGS[0], { ...ctx, circlePairPositions: lie });
      expect(lied, prefix.join(' · ')).toEqual(honest);
    }
  });
});
