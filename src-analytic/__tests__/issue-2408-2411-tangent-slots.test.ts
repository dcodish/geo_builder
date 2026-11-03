/**
 * #2408 + #2411 ([ADR-AG-385](../../docs/06c-decisions-analytic.md#adr-ag-385)) — A LETTER-NAMED COMMON TANGENT TAKES A
 * SLOT OF THE PAIR.
 *
 * «AB / CD / EF … משיק משותף למעגלים O ו-K» was lowered to two free tangencies solved jointly with the circles, so two names
 * could land on one line, a fifth tangent of two disjoint circles was accepted, the free circles moved whenever a tangent
 * was added, and a circle inside another got the generic «לא נמצאה תצורה». Now each one is one of the pair's
 * common-tangent families (ADR-AG-314's closed form): its touches are that family's, which family stays the unstated
 * choice a later given picks, earlier touches are kept apart, and one past 2-D's count is refused with 2-D's sentence
 * for the pair's position — the suite's `tangentsExhausted*` keys, which 2-D reads too.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { commonTangentLine, reversedFamily } from '../engine/commonTangents';
import { analyticI18n } from '../i18n';
import heSuite from '../../shell/locales/he.json';
import fixed from './fixtures/issue-2408-four-tangents-fixed.analytic.json';
import free from './fixtures/issue-2408-four-tangents-free.analytic.json';

type Pt = { id: string; x: number; y: number };
type C = { kind: 'circle'; cx: number; cy: number; r: number };
type Tr = (k: string, o?: Record<string, unknown>) => string;
const t = ((k, o) => (analyticI18n.getFixedT('he') as unknown as Tr)(k, o).replace(/[⁦-⁩]/g, '')) as Tr;

type Run = { ok: true; lines: string[] } | { ok: false; line: string; key?: string; text: string };
function run(lines: readonly string[], seed = 0): Run {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed);
    if (v.kind === 'already-known') continue;
    if (v.kind !== 'record') {
      const e = v.kind === 'refused' ? v.error : undefined;
      return { ok: false, line, key: e?.key, text: e ? errorText(e, t) : v.kind };
    }
    acc.push(v.line);
  }
  return { ok: true, lines: acc };
}
function built(lines: readonly string[], seed = 0) {
  const r = run(lines, seed);
  if (!r.ok) throw new Error(`refused «${r.line}»: ${r.text}`);
  const d = derive(r.lines, seed);
  expect(d.faults).toEqual([]);
  return d;
}
const pts = (d: ReturnType<typeof derive>) => new Map((d.figure.points as Pt[]).map((p) => [p.id, p]));
const circles = (d: ReturnType<typeof derive>) => (d.figure.curves as Array<{ id: string; curve: C }>).filter((c) => c.curve.kind === 'circle').map((c) => c.curve);
/** Distance from (x, y) to the line through a and b. */
const toLine = (x: number, y: number, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (a.y - y) - (a.x - x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
/** A line through a and b as a normalized key (unit normal with a fixed sign, offset), to tell lines apart. */
const lineKey = (a: Pt, b: Pt) => {
  let nx = b.y - a.y;
  let ny = a.x - b.x;
  const n = Math.hypot(nx, ny);
  nx /= n;
  ny /= n;
  if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny < 0)) [nx, ny] = [-nx, -ny];
  return [nx, ny, -(nx * a.x + ny * a.y)].map((v) => v.toFixed(4)).join();
};

const PAIR = ['AB', 'CD', 'EF', 'GH'];
const T = (n: string, tail = 'למעגלים O ו-K') => `${n} משיק משותף ${tail}`;
const FIXED = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו K(6,0) ורדיוסו 1'];
const FREE = ['מעגל O', 'מעגל K'];
const suite = heSuite.suite.refusal;

/** Every named tangent touches both circles (distance r from each centre, from the circles, never the closed form), and no two share a line. */
function expectDistinctTangents(d: ReturnType<typeof derive>, names: readonly string[]) {
  const p = pts(d);
  const [o, k] = circles(d);
  const keys = new Set<string>();
  for (const n of names) {
    const a = p.get(n[0])!;
    const b = p.get(n[1])!;
    expect(toLine(o.cx, o.cy, a, b)).toBeCloseTo(o.r, 5);
    expect(toLine(k.cx, k.cy, a, b)).toBeCloseTo(k.r, 5);
    expect(Math.hypot(a.x - o.cx, a.y - o.cy)).toBeCloseTo(o.r, 5);
    expect(Math.hypot(b.x - k.cx, b.y - k.cy)).toBeCloseTo(k.r, 5);
    keys.add(lineKey(a, b));
  }
  expect(keys.size).toBe(names.length);
}

describe('#2408 — the saved figures (rule 4): four different common tangents', () => {
  it('two fixed disjoint circles: AB, CD, EF, GH are the four tangents', () => {
    expectDistinctTangents(built(fixed.lines, fixed.seed), PAIR);
  });
  it.each([0, 1, 2, 3, 4])('two free circles at seed %i: four different tangents', (seed) => {
    expectDistinctTangents(built(free.lines, seed), PAIR);
  });
});

describe('#2408 — one past the pair’s count is refused with 2-D’s sentence for its position', () => {
  it('a fifth on two disjoint circles: tangentsExhaustedAny, fixed and free', () => {
    for (const ctx of [FIXED, FREE]) {
      const r = run([...ctx, ...PAIR.map((n) => T(n)), T('IJ')]);
      expect(r).toMatchObject({ ok: false, line: T('IJ'), key: 'no-common-tangent', text: suite.tangentsExhaustedAny });
    }
  });
  it('«… חיצוני» three times: tangentsExhaustedExternal; an internal one still builds', () => {
    const ext = (n: string) => `${n} משיק משותף חיצוני למעגלים O ו-K`;
    expect(run([...FIXED, ext('AB'), ext('CD'), ext('EF')])).toMatchObject({ ok: false, text: suite.tangentsExhaustedExternal });
    expect(run([...FIXED, ext('AB'), ext('CD'), 'EF משיק משותף פנימי למעגלים O ו-K']).ok).toBe(true);
  });
  it('«… פנימי» three times: tangentsExhaustedInternal', () => {
    const int = (n: string) => `${n} משיק משותף פנימי למעגלים O ו-K`;
    expect(run([...FIXED, int('AB'), int('CD'), int('EF')])).toMatchObject({ ok: false, text: suite.tangentsExhaustedInternal });
  });
  it.each([
    ['apart: 4', FIXED, 4, 'tangentsExhaustedAny'],
    ['touching from outside: 2 two-touch, then the sentence for 3', ['נתון מעגל שמרכזו O(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו K(3,0) ורדיוסו 1'], 2, 'tangentsExhaustedExtTangent'],
    ['crossing: 2', ['נתון מעגל שמרכזו O(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו K(3,0) ורדיוסו 2'], 2, 'tangentsExhaustedIntersecting'],
    ['touching from inside: none with two touches', ['נתון מעגל שמרכזו O(0,0) ורדיוסו 3', 'נתון מעגל שמרכזו K(1,0) ורדיוסו 2'], 0, 'tangentsExhaustedIntTangent'],
    ['one inside the other: none (#2411)', ['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(1,0) ורדיוסו 2'], 0, 'tangentsExhaustedContained'],
  ] as const)('%s', (_, ctx, count, key) => {
    const names = ['AB', 'CD', 'EF', 'GH', 'IJ'];
    for (let i = 0; i < count; i++) expect(run([...ctx, ...names.slice(0, i + 1).map((n) => T(n))]).ok).toBe(true);
    const r = run([...ctx, ...names.slice(0, count + 1).map((n) => T(n))]);
    expect(r).toMatchObject({ ok: false, line: T(names[count]), key: 'no-common-tangent', text: suite[key] });
  });
  it('#2411 — the operator’s nested pair, «AB משיק משותף», is refused naming the reason, not «לא נמצאה תצורה»', () => {
    const r = run(['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(1,0) ורדיוסו 2', 'AB משיק משותף למעגלים O ו-K']);
    expect(r).toMatchObject({ ok: false, text: 'למעגל המוכל בתוך מעגל אין אף משיק משותף.' });
  });
  it('touching from outside with its touch point named: the third is the tangent at T (2-D builds it), the fourth refused', () => {
    const ctx = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו K(3,0) ורדיוסו 1', 'המעגלים משיקים בנקודה T'];
    const d = built([...ctx, T('AB'), T('CD'), T('EF')]);
    const p = pts(d);
    expect(toLine(2, 0, p.get('E')!, p.get('F')!)).toBeLessThan(1e-6);
    expect(run([...ctx, T('AB'), T('CD'), T('EF'), T('GH')])).toMatchObject({ ok: false, text: suite.tangentsExhaustedExtTangent });
  });
});

describe('#2408 — stability: adding a tangent moves nothing already drawn', () => {
  const same = (u: Pt | C, v: Pt | C) => JSON.stringify(Object.values(u).map((x) => (typeof x === 'number' ? x.toFixed(6) : x))) === JSON.stringify(Object.values(v).map((x) => (typeof x === 'number' ? x.toFixed(6) : x)));
  for (const [label, ctx, seeds] of [['fixed', FIXED, [0]], ['free', FREE, [0, 1, 2, 3, 4]]] as const) {
    it.each(seeds)(`${label} pair at seed %i: every earlier point and both circles stay put`, (seed) => {
      let before = built(ctx, seed);
      for (let i = 0; i < PAIR.length; i++) {
        const after = built([...ctx, ...PAIR.slice(0, i + 1).map((n) => T(n))], seed);
        const [p0, p1] = [pts(before), pts(after)];
        for (const [id, q] of p0) expect(same(p1.get(id)!, q), `${id} moved at «${T(PAIR[i])}»`).toBe(true);
        circles(before).forEach((c, j) => expect(same(circles(after)[j], c), `circle ${j} moved at «${T(PAIR[i])}»`).toBe(true));
        before = after;
      }
    });
  }
});

describe('#2408 — the tangent stays the unstated choice it was (ADR-052)', () => {
  it('restating a tangent is known, never a second slot', () => {
    const r = run([...FIXED, T('AB'), T('AB')]);
    expect(r.ok && r.lines.length).toBe(3);
  });
  it('the pair named in the other order is the same pair: four in all, the fifth refused', () => {
    const lines = [...FIXED, T('AB'), T('CD', 'למעגלים K ו-O'), T('EF'), T('GH', 'למעגלים K ו-O')];
    expectDistinctTangents(built(lines), PAIR);
    expect(run([...lines, T('IJ', 'למעגלים K ו-O')])).toMatchObject({ ok: false, text: suite.tangentsExhaustedAny });
  });
  it('a later given picks which tangent («הישר AB חותך את ציר ה-y מתחת לציר ה-x»), and CD is then a different one', () => {
    const d = built([...FIXED, T('AB'), 'הישר AB חותך את ציר ה-y מתחת לציר ה-x', T('CD')]);
    const p = pts(d);
    const [A, B] = [p.get('A')!, p.get('B')!];
    const yAt0 = A.y - (A.x * (B.y - A.y)) / (B.x - A.x);
    expect(yAt0).toBeLessThan(0);
    expectDistinctTangents(d, ['AB', 'CD']);
  });
  it('a reversed pair swaps the external letters and keeps the internal ones (the closed form, measured)', () => {
    const p: C = { kind: 'circle', cx: 0, cy: 0, r: 2 };
    const q: C = { kind: 'circle', cx: 6, cy: 1, r: 1 };
    for (const g of ['ext-a', 'ext-b', 'int-a', 'int-b'] as const) {
      const l = commonTangentLine(p, q, g)!;
      const m = commonTangentLine(q, p, reversedFamily(g))!;
      expect([m.a, m.b, m.c].map((v) => v.toFixed(9))).toEqual([l.a, l.b, l.c].map((v) => v.toFixed(9)));
    }
  });
});
