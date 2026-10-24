/**
 * #2499 ([ADR-766](../../../docs/06-decisions.md#adr-766)) — AN EARLIER GIVEN THAT A MEMBERSHIP'S LOWERING LEAVES
 * WITHOUT A WORKING CARRIER IS RE-HOMED BY THE FAILURE LADDER (LADDER stage 2e, M2 law i for every obligation).
 *
 * Measured at 045a8546 through `decideDeterministic2D` + the store (model mocked): «מעגל O · AB = 6 · AB קוטר של
 * המעגל» (the operator's T30) was refused «… סותר את «AB = 6»» while the other order built r = 3; «OA = 4 · נקודה A על
 * המעגל» was refused the same way; «OA = 4 · רבע מעגל OAB» / «גזרה AOB» committed a circle centred at B with a re-read
 * hint. Root cause: the membership is lowered as STRUCTURE (A → `on-circle`, A → the antipode `line-circle`), adding no
 * new constraint, so the earlier distance — whose carrier (A's θ) can no longer move it — was in no recruit list and
 * the free radius was never offered to it. Fix: `brokenEarlierGivens` (step.ts) joins every violated earlier given
 * that names or is carried by a REWRITTEN object to 2e's recruit list (trace `:rehome`).
 *
 * Every row below failed at 045a8546 (refused, or centred at B). Positions are never compared across orders: the
 * free gauge legitimately differs; the invariants are.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { applyStep, emptyConstruction } from '../step';
import { freeDofs } from '../sample';
import type { Command, Construction } from '../types';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

type Out = { kind: string; key: string | null; explain: string | null };
async function submit(lines: string[], lng: 'he' | 'en' = 'he'): Promise<Out[]> {
  useGeoStore.getState().clear();
  const out: Out[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lng);
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const note = (v as { note?: { key?: string; explain?: string } }).note;
    out.push({ kind: v.kind, key: note?.key ?? null, explain: note?.explain ?? null });
  }
  return out;
}

const figure = (seed?: number) => {
  const st = useGeoStore.getState();
  return replay(st.facts, seed ?? st.seed);
};
const allGreen = () => {
  const st = useGeoStore.getState();
  const fig = figure();
  expect(fig.lastError).toBeNull();
  for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
};
const d = (fig: ReturnType<typeof figure>, a: string, b: string) => {
  const p = fig.positions.get(a)!;
  const q = fig.positions.get(b)!;
  return Math.hypot(p.x - q.x, p.y - q.y);
};

type Row = { id: string; lines: string[]; lng?: 'he' | 'en'; radii: Record<string, number>; lengths?: [string, string, number][]; diameter?: [string, string, string]; arcCentre?: string };
const R3 = { 'circle-O': 3 };
const R4 = { 'circle-O': 4 };
const DIAM: [string, string, string] = ['A', 'O', 'B'];

/** Table A of the plan: every forward ("first") row, refused or centred at B at 045a8546. */
const ROWS: Row[] = [
  { id: 'D1', lines: ['מעגל O', 'AB = 6', 'AB קוטר של המעגל'], radii: R3, lengths: [['A', 'B', 6]], diameter: DIAM }, // the operator's
  { id: 'D2', lines: ['מעגל O', 'AB = 6', 'AB קוטר במעגל'], radii: R3, lengths: [['A', 'B', 6]], diameter: DIAM },
  { id: 'D3', lines: ['circle O', 'AB = 6', 'AB is a diameter of the circle'], lng: 'en', radii: R3, lengths: [['A', 'B', 6]], diameter: DIAM },
  { id: 'EN1', lines: ['circle O', 'AB = 6', 'AB is a diameter'], lng: 'en', radii: R3, lengths: [['A', 'B', 6]], diameter: DIAM },
  { id: 'D4', lines: ['מעגל O שרדיוסו R', 'AB = 6', 'AB קוטר במעגל'], radii: R3, lengths: [['A', 'B', 6]], diameter: DIAM },
  { id: 'I1', lines: ['מעגל O', 'AB = 6', 'AB קוטר במעגל', 'נקודה C על המעגל'], radii: R3, diameter: DIAM },
  { id: 'IA2', lines: ['מעגל O', 'AB = 6', 'נקודה C על המעגל', 'AB קוטר במעגל'], radii: R3, diameter: DIAM },
  { id: 'IA1', lines: ['מעגל O', 'AB = 6', 'AB קוטר במעגל', 'נקודה C על המעגל', '∠CAB = 30'], radii: R3, lengths: [['A', 'C', 3 * Math.sqrt(3)], ['B', 'C', 3]] },
  { id: 'T3', lines: ['מעגל O', 'AC = 6', 'BC = 8', 'AB קוטר במעגל', 'נקודה C על המעגל'], radii: { 'circle-O': 5 }, lengths: [['A', 'B', 10], ['A', 'C', 6], ['B', 'C', 8]], diameter: DIAM },
  { id: 'R1', lines: ['מעגל O', 'OA = 4', 'OA רדיוס במעגל'], radii: R4 },
  { id: 'RD1', lines: ['מעגל O', 'OA = 4', 'OA רדיוס'], radii: R4 },
  { id: 'RD2', lines: ['circle O', 'OA = 4', 'OA is a radius of the circle'], lng: 'en', radii: R4 },
  { id: 'P1', lines: ['מעגל O', 'OA = 4', 'נקודה A על המעגל'], radii: R4 },
  { id: 'P2', lines: ['circle O', 'OA = 4', 'point A on the circle'], lng: 'en', radii: R4 },
  { id: 'EN2', lines: ['circle O', 'OA = 4', 'A lies on the circle'], lng: 'en', radii: R4 },
  { id: 'RL1', lines: ['מעגל O שרדיוסו r', 'OA = 4', 'A על המעגל'], radii: R4 },
  { id: 'P3', lines: ['נקודה O', 'נקודה A', 'OA = 4', 'מעגל O', 'A על המעגל'], radii: R4 },
  { id: 'M1', lines: ['מעגל O', 'OA = 4', 'OB = 4', 'A ו-B על המעגל'], radii: R4, lengths: [['O', 'B', 4]] },
  { id: 'M2', lines: ['מעגל O', 'נקודה B על המעגל', 'OA = 4', 'נקודה A על המעגל'], radii: R4, lengths: [['O', 'B', 4]] },
  { id: 'M4', lines: ['מעגל O', 'OA = 4', 'AB = 7', 'A על המעגל', 'B על המעגל'], radii: R4, lengths: [['A', 'B', 7]] },
  { id: 'CH3', lines: ['מעגל O', 'OA = 4', 'AB מיתר במעגל'], radii: R4, lengths: [['O', 'B', 4]] },
  { id: 'TW1', lines: ['מעגל O', 'מעגל P', 'OA = 4', 'A על מעגל O', 'PA = 2', 'A על מעגל P'], radii: { 'circle-O': 4, 'circle-P': 2 } },
  // the arcs: the centre the student wrote (ADR-759's middle letter), never the re-read centre B
  { id: 'Q1', lines: ['OA = 4', 'רבע מעגל OAB'], radii: R4, arcCentre: 'O', lengths: [['O', 'B', 4]] },
  { id: 'Q2', lines: ['OA = 4', 'quarter circle OAB'], lng: 'en', radii: R4, arcCentre: 'O' },
  { id: 'Q3', lines: ['OA = 4', 'רבע מעגל AOB'], radii: R4, arcCentre: 'O' },
  { id: 'H3', lines: ['OA = 4', 'חצי מעגל AOB'], radii: R4, arcCentre: 'O', lengths: [['A', 'B', 8]] },
  { id: 'S1', lines: ['OA = 4', 'גזרה AOB'], radii: R4, arcCentre: 'O' },
  { id: 'S2', lines: ['OA = 4', 'sector AOB'], lng: 'en', radii: R4, arcCentre: 'O' },
  { id: 'S3', lines: ['OA = 4', 'גזרה AOB בזווית 80'], radii: R4, arcCentre: 'O', lengths: [['A', 'B', 8 * Math.sin((40 * Math.PI) / 180)]] },
];

const expectRow = (row: Row, out: Out[]) => {
  out.forEach((o, i) => expect(o.kind, `${row.id} line ${i + 1} «${row.lines[i]}»: ${o.explain ?? ''}`).toBe('commit'));
  expect(out[out.length - 1].key, `${row.id}: the student's own reading built, nothing re-read`).not.toBe('input.canonicalHint');
  allGreen();
  for (const seed of [0, 1, 2]) {
    const fig = figure(seed);
    expect(fig.lastError, `${row.id} @ ${seed}`).toBeNull();
    expect([...fig.circles.keys()].sort(), `${row.id} @ ${seed}: the circles`).toEqual(Object.keys(row.radii).sort());
    for (const [c, r] of Object.entries(row.radii)) expect(fig.circles.get(c)!.r, `${row.id} r(${c}) @ ${seed}`).toBeCloseTo(r, 6);
    if (row.radii['circle-O'] !== undefined && fig.positions.has('A')) expect(d(fig, 'O', 'A'), `${row.id} |OA| @ ${seed}`).toBeCloseTo(row.radii['circle-O'], 6);
    for (const [a, b, len] of row.lengths ?? []) expect(d(fig, a, b), `${row.id} |${a}${b}| @ ${seed}`).toBeCloseTo(len, 4);
    if (row.diameter) {
      const [a, o, b] = row.diameter;
      const A = fig.positions.get(a)!;
      const O = fig.positions.get(o)!;
      const B = fig.positions.get(b)!;
      expect((A.x + B.x) / 2, `${row.id}: O is AB's midpoint @ ${seed}`).toBeCloseTo(O.x, 6);
      expect((A.y + B.y) / 2, `${row.id}: O is AB's midpoint @ ${seed}`).toBeCloseTo(O.y, 6);
    }
  }
  if (row.arcCentre) {
    const arcs = figure().construction.objects.filter((o) => o.kind === 'arc') as unknown as { center: string }[];
    expect(arcs.map((a) => a.center), `${row.id}: the arc's centre`).toEqual([row.arcCentre]);
  }
};

describe('#2499 — a membership after a distance that pins its point sizes the circle (table A)', () => {
  it.each(ROWS.map((r) => [r.id, r] as const))('%s', async (_id, row) => {
    expectRow(row, await submit(row.lines, row.lng ?? 'he'));
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 120_000);

  it('TT1: after two tangent circles and «T על AB», «A על מעגל M» builds (B slides on the line through T)', async () => {
    const out = await submit(['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'T על AB', 'A על מעגל M']);
    out.forEach((o, i) => expect(o.kind, `line ${i + 1}: ${o.explain ?? ''}`).toBe('commit'));
    allGreen();
    const fig = figure();
    const M = fig.circles.get('circle-M')!;
    expect(Math.hypot(fig.positions.get('A')!.x - M.center.x, fig.positions.get('A')!.y - M.center.y)).toBeCloseTo(M.r, 6);
  }, 120_000);

  it.each([
    ['segment', ['קטע CD', 'CE = 8', 'E על CD'], ['C', 'E', 8]],
    ['triangle', ['משולש ABC', 'AD = 20', 'D על BC'], ['A', 'D', 20]],
  ] as [string, string[], [string, string, number]][])('the %s member outside circles builds (the figure grows to fit)', async (_k, lines, [a, b, len]) => {
    const out = await submit(lines);
    out.forEach((o, i) => expect(o.kind, `line ${i + 1}: ${o.explain ?? ''}`).toBe('commit'));
    allGreen();
    expect(d(figure(), a, b)).toBeCloseTo(len, 4);
  }, 120_000);
});

describe('#2499 — genuine contradictions stay refused, on the line that creates them (table B)', () => {
  it.each([
    ['K0', ['מעגל O ברדיוס 2', 'AB = 6', 'AB קוטר במעגל'], 2, 'over-constrained: |AB| = 6 cannot hold [vs #1]'],
    ['CH2', ['מעגל O ברדיוס 2', 'AB = 6', 'AB מיתר במעגל'], 2, 'over-constrained: |AB| = 6 cannot hold [vs #1]'],
    ['RL2', ['מעגל O שרדיוסו r', 'r = 3', 'OA = 4', 'A על המעגל'], 3, 'over-constrained: |OA| = 4 cannot hold [vs #3]'],
    // M3: A alone fits a radius-4 circle — line 4 builds now (it was refused falsely); line 5 is the real conflict
    ['M3', ['מעגל O', 'OA = 4', 'OB = 5', 'נקודה A על המעגל', 'נקודה B על המעגל'], 4, 'over-constrained: |OA| = 4 cannot hold [vs #3]'],
    ['M3r', ['מעגל O', 'נקודה A על המעגל', 'נקודה B על המעגל', 'OA = 4', 'OB = 5'], 4, 'over-constrained: |OB| = 5 cannot hold [vs #3]'],
  ] as [string, string[], number, string][])('%s', async (_id, lines, refusedAt, explain) => {
    const out = await submit(lines);
    out.forEach((o, i) => {
      if (i === refusedAt) {
        expect(o.kind, `line ${i + 1}`).toBe('refuse');
        expect(o.explain).toBe(explain);
      } else expect(o.kind, `line ${i + 1} «${lines[i]}»: ${o.explain ?? ''}`).toBe('commit');
    });
  }, 120_000);
});

describe('#2499 — A then B ≡ B then A', () => {
  const PAIRS: [string, string[], string[], 'he' | 'en'][] = [
    ['D1', ['מעגל O', 'AB = 6', 'AB קוטר של המעגל'], ['מעגל O', 'AB קוטר של המעגל', 'AB = 6'], 'he'],
    ['D2', ['מעגל O', 'AB = 6', 'AB קוטר במעגל'], ['מעגל O', 'AB קוטר במעגל', 'AB = 6'], 'he'],
    ['D3', ['circle O', 'AB = 6', 'AB is a diameter of the circle'], ['circle O', 'AB is a diameter of the circle', 'AB = 6'], 'en'],
    ['D4', ['מעגל O שרדיוסו R', 'AB = 6', 'AB קוטר במעגל'], ['מעגל O שרדיוסו R', 'AB קוטר במעגל', 'AB = 6'], 'he'],
    ['P1', ['מעגל O', 'OA = 4', 'נקודה A על המעגל'], ['מעגל O', 'נקודה A על המעגל', 'OA = 4'], 'he'],
    ['P2', ['circle O', 'OA = 4', 'point A on the circle'], ['circle O', 'point A on the circle', 'OA = 4'], 'en'],
    ['R1', ['מעגל O', 'OA = 4', 'OA רדיוס במעגל'], ['מעגל O', 'OA רדיוס במעגל', 'OA = 4'], 'he'],
    ['Q1', ['OA = 4', 'רבע מעגל OAB'], ['רבע מעגל OAB', 'OA = 4'], 'he'],
    ['Q3', ['OA = 4', 'רבע מעגל AOB'], ['רבע מעגל AOB', 'OA = 4'], 'he'],
    ['H3', ['OA = 4', 'חצי מעגל AOB'], ['חצי מעגל AOB', 'OA = 4'], 'he'],
    ['S1', ['OA = 4', 'גזרה AOB'], ['גזרה AOB', 'OA = 4'], 'he'],
    ['S3', ['OA = 4', 'גזרה AOB בזווית 80'], ['גזרה AOB בזווית 80', 'OA = 4'], 'he'],
    ['T3', ['מעגל O', 'AC = 6', 'BC = 8', 'AB קוטר במעגל', 'נקודה C על המעגל'], ['מעגל O', 'AB קוטר במעגל', 'נקודה C על המעגל', 'AC = 6', 'BC = 8'], 'he'],
    ['M4', ['מעגל O', 'OA = 4', 'AB = 7', 'A על המעגל', 'B על המעגל'], ['מעגל O', 'A על המעגל', 'B על המעגל', 'OA = 4', 'AB = 7'], 'he'],
    // Excluded: «קטע CD · CE = 8 · E על CD» — its reverse order («E על CD · CE = 8») is still refused, which is #1781.
  ];
  const invariants = () => {
    const fig = figure();
    const c: Construction = fig.construction;
    const centres = c.objects
      .filter((o) => o.kind === 'circle' || o.kind === 'arc')
      .map((o) => `${o.kind}:${(o as unknown as { center?: string }).center ?? '?'}`)
      .sort();
    const radii = [...fig.circles.entries()].map(([k, v]) => [k, +v.r.toFixed(6)]).sort();
    const lens = (['AB', 'OA', 'OB', 'AC', 'BC'] as const)
      .filter((s) => fig.positions.has(s[0]) && fig.positions.has(s[1]))
      .map((s) => [s, +d(fig, s[0], s[1]).toFixed(5)]);
    return { centres, radii, lens, dof: freeDofs(c).length, lastError: fig.lastError };
  };
  it.each(PAIRS)('%s', async (_id, fwd, rev, lng) => {
    const a = await submit(fwd, lng);
    a.forEach((o, i) => expect(o.kind, `forward line ${i + 1}: ${o.explain ?? ''}`).toBe('commit'));
    const ia = invariants();
    const b = await submit(rev, lng);
    b.forEach((o, i) => expect(o.kind, `reverse line ${i + 1}: ${o.explain ?? ''}`).toBe('commit'));
    const ib = invariants();
    expect(ia.lastError).toBeNull();
    expect(ia.centres).toEqual(ib.centres);
    expect(ia.radii).toEqual(ib.radii);
    // T3: the forward order hands the radius to |AC| = 6 (1 free DOF, the centre); the reverse order keeps a free radius
    // that the two distances and the diameter in fact force (r = 5), so it over-counts by one. That is the reverse order's
    // pre-existing sampler-family note (ADR-476; its seeds 1–2 are filtered), not this item's — forward is the exact count.
    if (_id === 'T3') expect(ia.dof).toBe(ib.dof - 1);
    else expect(ia.dof).toBe(ib.dof);
    // the STATED lengths agree (an unstated one, e.g. AB beside a free sector angle, may legitimately differ)
    const stated = new Set(fwd.flatMap((l) => [...l.matchAll(/\b([A-Z]{2})\s*=\s*\d/g)].map((m) => m[1])));
    if (fwd.some((l) => /קוטר|diameter/.test(l))) stated.add('OA').add('OB');
    const pick = (x: (string | number)[][]) => x.filter(([s]) => stated.has(s as string));
    expect(pick(ia.lens)).toEqual(pick(ib.lens));
  }, 180_000);
});

describe('#2499 — stability (FR-EN-7): the re-home moves nothing already drawn', () => {
  it.each([
    ['D2', ['AB = 6', 'AB קוטר במעגל']],
    ['P1', ['OA = 4', 'נקודה A על המעגל']],
  ] as [string, string[]][])('%s beside a triangle leaves X, Y, Z in place', async (id, tail) => {
    await submit(['משולש XYZ', 'מעגל O', tail[0]]);
    const before = figure().positions;
    const snap = new Map(['X', 'Y', 'Z', 'A'].filter((k) => before.has(k)).map((k) => [k, { ...before.get(k)! }]));
    const out = await submit(['משולש XYZ', 'מעגל O', ...tail]);
    out.forEach((o, i) => expect(o.kind, `line ${i + 1}: ${o.explain ?? ''}`).toBe('commit'));
    const after = figure().positions;
    for (const k of ['X', 'Y', 'Z']) {
      expect(after.get(k)!.x, `${id} ${k}.x`).toBeCloseTo(snap.get(k)!.x, 9);
      expect(after.get(k)!.y, `${id} ${k}.y`).toBeCloseTo(snap.get(k)!.y, 9);
    }
    if (id === 'P1') expect(Math.hypot(after.get('A')!.x - snap.get('A')!.x, after.get('A')!.y - snap.get('A')!.y), 'A already sat at |OA| = 4').toBeLessThan(0.1);
  }, 120_000);
});

describe('#2499 — the ladder: the broken earlier given is re-homed at 2e, only when the step rewrote what it is about', () => {
  const circleO: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true };
  const dist = (a: string, b: string, value: number): Command[] => [{ type: 'segment', a, b }, { type: 'set-distance', a, b, value }] as Command[];
  const onO = (id: string): Command => ({ type: 'point-on-circle', id, circle: 'circle-O' }) as Command;
  const run = (cmds: Command[]) => {
    let cur = emptyConstruction();
    let last: ReturnType<typeof applyStep> | null = null;
    for (const cmd of cmds) {
      last = applyStep(cur, cmd);
      if (last.ok) cur = last.construction;
    }
    return last!;
  };

  it('P1 «OA = 4 · נקודה A על המעגל»: main:rehome, then the recruiter gives the radius to |OA| = 4', () => {
    const r = run([circleO, ...dist('O', 'A', 4), onO('A')]);
    expect(r.ok).toBe(true);
    expect(r.ladder).toEqual(expect.arrayContaining(['main:rehome', 'recruit:B', 'main:recruit']));
  });

  it('P1r (the other order) is unchanged: the distance is the NEW constraint, recruited at 3B, no re-home', () => {
    const r = run([circleO, onO('A'), ...dist('O', 'A', 4)]);
    expect(r.ok).toBe(true);
    expect(r.ladder).toContain('recruit:B');
    expect(r.ladder).not.toContain('main:rehome');
  });

  it('M3r line 5 «OB = 5»: a stated value\'s own conflict rewrites nothing — refused with no re-home', () => {
    const r = run([circleO, onO('A'), onO('B'), ...dist('O', 'A', 4), ...dist('O', 'B', 5)]);
    expect(r.ok).toBe(false);
    expect(r.ladder ?? []).not.toContain('main:rehome');
  });
});
