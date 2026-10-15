/**
 * #1999 + #1685 ([ADR-666](../../docs/06-decisions.md#adr-666)) — a named cevian lowers once, whichever letter of its
 * segment is the vertex; the copula and the English role phrase are one subject atom.
 *
 * Measured on d7b31e0a (main b0ef3240 + ADR-665) through `decideDeterministic2D`: on «משולש CMD», «AM חוצה זווית CMD»
 * refused «∠CMA = 1·∠AMD references an unknown point»; «AM תיכון לצלע CD» refused «collapsed: polygon C, M, D would
 * be flat»; «AM גובה לצלע CD» refused as redefining M; «AM הוא חוצה זווית CMD», «MA היא גובה לצלע CD» and "AM is the
 * bisector of angle CMD" went to the AI. Operator rulings 2026-10-13 (cards 11 and 15): *"Both letter orders and the
 * «הוא» form build the same figure"*, *"all cevians, both letter orders, in 2-D and analytic, plus the English form"*.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { driveThroughGate } from './submit-gate';

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** The commands as a multiset, a segment's letters sorted (MA and AM are one segment). */
const canon = (cmds: readonly AnyCommand[]): string[] =>
  cmds
    .map((c) => (c.type === 'segment' ? { ...c, a: [c.a, c.b].sort()[0], b: [c.a, c.b].sort()[1] } : c))
    .map((c) => JSON.stringify(c))
    .sort();

async function commands(prefix: string[], line: string, locale: 'he' | 'en' = 'he'): Promise<string[] | string> {
  const v = await decide(prefix, line, locale);
  return v.kind === 'commit' ? canon(v.commands) : `${v.kind}:${JSON.stringify(v).slice(0, 200)}`;
}

type P = { x: number; y: number };
const d = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);

/** The drawn figure of `lines` at `seed`, built through the gate; asserts every row is green and verified. */
function figure(lines: string[], seed: number) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, seed);
  expect(fig.lastError, `seed ${seed}`).toBeNull();
  expect(fig.violations).toEqual([]);
  return fig;
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const T = ['משולש CMD'];
const ROLES = [
  { role: 'median', he: 'תיכון', target: ['לצלע CD', 'במשולש CMD', ''] },
  { role: 'altitude', he: 'גובה', target: ['לצלע CD', 'במשולש CMD', ''] },
  { role: 'bisector', he: 'חוצה זווית CMD', target: ['לצלע CD', 'במשולש CMD', ''] },
] as const;
const COPULAS = ['', 'הוא ', 'היא ', 'הינו '];

describe('#1999 — the three ruled lines draw A where the cevian from M meets CD, with segment MA', () => {
  it.each([
    ['AM חוצה זווית CMD', 'bisector'],
    ['AM תיכון לצלע CD', 'median'],
    ['AM גובה לצלע CD', 'altitude'],
    ['AM הוא חוצה זווית CMD', 'bisector'],
    ['AM היא גובה לצלע CD', 'altitude'],
  ])('«%s» (%s), seeds 0–5', (line, role) => {
    for (let s = 0; s <= 5; s++) {
      const fig = figure([...T, line], s);
      const [C, M, D, A] = ['C', 'M', 'D', 'A'].map((id) => fig.positions.get(id)!);
      expect(Math.abs(d(C, A) + d(A, D) - d(C, D)), `seed ${s}: A on CD`).toBeLessThan(1e-6);
      if (role !== 'altitude') expect(Math.min(d(C, A), d(A, D)), `seed ${s}: A strictly inside CD`).toBeGreaterThan(1e-3);
      if (role === 'median') expect(d(C, A)).toBeCloseTo(d(A, D), 6);
      if (role === 'altitude') expect(Math.abs((A.x - M.x) * (D.x - C.x) + (A.y - M.y) * (D.y - C.y)) / (d(A, M) * d(C, D))).toBeLessThan(1e-6);
      if (role === 'bisector') {
        const ang = (p: P, v: P, q: P) => Math.acos(((p.x - v.x) * (q.x - v.x) + (p.y - v.y) * (q.y - v.y)) / (d(p, v) * d(q, v)));
        expect(ang(C, M, A)).toBeCloseTo(ang(A, M, D), 6);
      }
      expect(fig.construction.objects.some((o) => o.kind === 'segment' && [o.a, o.b].sort().join('') === 'AM'), 'segment MA drawn').toBe(true);
    }
  });
});

describe('#1999 — the class matrix: every role × letter order × copula × target lowers as its vertex-first twin', () => {
  for (const { role, he, target } of ROLES) {
    for (const t of target) {
      const twin = `MA ${he}${t ? ' ' + t : ''}`;
      for (const cop of COPULAS) {
        for (const pair of ['MA', 'AM']) {
          const line = `${pair} ${cop}${he}${t ? ' ' + t : ''}`;
          if (line === twin) continue;
          it(`${role}: «${line}» = «${twin}»`, async () => {
            const want = await commands(T, twin);
            expect(Array.isArray(want), `the twin «${twin}» commits: ${want}`).toBe(true);
            expect(await commands(T, line)).toEqual(want);
          });
        }
      }
    }
  }

  it.each([
    [['משולש ABC'], 'DA תיכון לצלע BC', 'AD תיכון לצלע BC'],
    [['משולש ABC'], 'DA גובה לצלע BC', 'AD גובה לצלע BC'],
    [['משולש ABC'], 'DA הוא גובה לצלע BC', 'AD גובה לצלע BC'],
    [['משולש ABC'], 'DA חוצה זווית BAC', 'AD חוצה זווית BAC'],
    [['משולש ABC'], 'DA חוצה זווית A', 'AD חוצה זווית A'],
    [['משולש ABC'], 'הקטע DA חוצה זווית BAC', 'AD חוצה זווית BAC'],
    [['משולש ABC'], 'AD הוא חוצה זווית BAC', 'AD חוצה זווית BAC'],
    [['משולש ABC'], 'AD הוא חוצה הזווית BAC', 'AD חוצה זווית BAC'],
    [['ריבוע ABCD'], 'EA חוצה זווית BAD', 'AE חוצה זווית BAD'],
    [T, 'AM חוצה זווית DMC', 'MA חוצה זווית DMC'],
    [T, 'AM חוצה זווית M', 'MA חוצה זווית M'],
    [T, 'AM חוצה את זווית CMD', 'MA חוצה זווית CMD'],
    [T, 'AM חוצה את זווית M במשולש CMD', 'MA חוצה את זווית M במשולש CMD'],
    [T, 'AM חוצה זווית CMD לצלע CD', 'MA חוצה זווית CMD לצלע CD'],
    [T, 'AM גובה לצלע CD במשולש CMD', 'MA גובה לצלע CD במשולש CMD'],
    [T, 'הקטע AM הוא תיכון לצלע CD', 'MA תיכון לצלע CD'],
  ])('%j · «%s» = «%s»', async (prefix, line, twin) => {
    const want = await commands(prefix, twin);
    expect(Array.isArray(want), `the twin commits: ${want}`).toBe(true);
    expect(await commands(prefix, line)).toEqual(want);
  });

  it.each([
    ['AM is the bisector of angle CMD', 'MA חוצה זווית CMD'],
    ['MA is the bisector of angle CMD', 'MA חוצה זווית CMD'],
    ['AM is the angle bisector of angle CMD', 'MA חוצה זווית CMD'],
    ['MA is an angle bisector of angle CMD', 'MA חוצה זווית CMD'],
    ['segment MA is the bisector of angle CMD', 'MA חוצה זווית CMD'],
    ['AM is the bisector of angle M', 'MA חוצה זווית M'],
    ['MA is a bisector of angle CMD', 'MA חוצה זווית CMD'],
    ['MA is the angle bisector of CMD', 'MA חוצה זווית CMD'],
    ['AM is the angle bisector of CMD', 'MA חוצה זווית CMD'],
    ['MA is the bisector of angle CMD in triangle CMD', 'MA חוצה זווית CMD במשולש CMD'],
    ['AM is the bisector of angle CMD to side CD', 'MA חוצה זווית CMD לצלע CD'],
    ['AM bisects angle CMD in triangle CMD', 'MA חוצה זווית CMD במשולש CMD'],
    ['AM bisects angle CMD', 'MA חוצה זווית CMD'],
    ['AM bisects angle M', 'MA חוצה זווית M'],
    ['AM is the median to side CD', 'MA תיכון לצלע CD'],
    ['AM is a median to CD', 'MA תיכון לצלע CD'],
    ['AM is the median in triangle CMD', 'MA תיכון במשולש CMD'],
    ['AM is a median', 'MA תיכון'],
    ['AM is the height to side CD', 'MA גובה לצלע CD'],
    ['AM is the altitude to CD', 'MA גובה לצלע CD'],
    ['AM is an altitude to CD', 'MA גובה לצלע CD'],
    ['MA is a height to CD', 'MA גובה לצלע CD'],
    ['MA is an altitude', 'MA גובה'],
    ['AM is the altitude in triangle CMD', 'MA גובה במשולש CMD'],
    ['MA is an altitude of triangle CMD', 'MA גובה במשולש CMD'],
  ])('English: "%s" = «%s»', async (line, twin) => {
    const want = await commands(T, twin);
    expect(Array.isArray(want), `the twin commits: ${want}`).toBe(true);
    expect(await commands(T, line, 'en')).toEqual(want);
  });
});

describe('#1999 — the far end already exists: the existing-id lowering plus segment MA', () => {
  it.each([
    ['AM חוצה זווית CMD', 'MA חוצה זווית CMD'],
    ['AM תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM גובה לצלע CD', 'MA גובה לצלע CD'],
  ])('«A על CD» · «%s» = «%s»', async (line, twin) => {
    const P = ['משולש CMD', 'A על CD'];
    const want = await commands(P, twin);
    expect(Array.isArray(want)).toBe(true);
    expect(await commands(P, line)).toEqual(want);
    expect((want as string[]).some((c) => c.includes('"segment"'))).toBe(true);
  });

  it('«משולש ABC» · «P על BC» · «PA תיכון לצלע BC» builds as «AP תיכון לצלע BC»', async () => {
    const P = ['משולש ABC', 'P על BC'];
    expect(await commands(P, 'PA תיכון לצלע BC')).toEqual(await commands(P, 'AP תיכון לצלע BC'));
  });

  it('«מעוין ABCD» · «BD חוצה זווית D» draws diagonal BD, as «DB חוצה זווית D» does', async () => {
    const P = ['מעוין ABCD'];
    const want = await commands(P, 'DB חוצה זווית D');
    expect(await commands(P, 'BD חוצה זווית D')).toEqual(want);
    expect((want as string[]).some((c) => c.includes('"segment"'))).toBe(true);
  });
});

describe('#1999 — the refusals that stay, and the stated side', () => {
  it('«AM חוצה זווית CMD לצלע CM» is refused as the wrong side, quoting CM and CD, exactly as «MA …» is', async () => {
    const a = await decide(T, 'AM חוצה זווית CMD לצלע CM');
    const b = await decide(T, 'MA חוצה זווית CMD לצלע CM');
    expect(a.kind).toBe('refuse');
    expect(JSON.stringify(a)).toContain('cevian-wrong-side:M:CM/CD');
    expect(JSON.stringify(a.kind === 'refuse' && a.note)).toBe(JSON.stringify(b.kind === 'refuse' && b.note));
  });

  it.each([['AM חוצה זווית C'], ['AM הוא חוצה זווית C']])('«%s» → bisector-wrong-apex', async (line) => {
    expect(JSON.stringify(await decide(T, line))).toContain('bisector-wrong-apex:A:C');
  });

  it.each([
    ['MA תיכון לצלע CM', 'cevian-degenerate:apex-on-side'],
    ['AM תיכון לצלע CM', 'cevian-degenerate:median-foot-at-end'],
    ['AM תיכון לצלע MD', 'cevian-degenerate:median-foot-at-end'],
    ['MA גובה לצלע CM', 'cevian-degenerate:apex-on-side'],
  ])('«%s» → %s (unchanged)', async (line, why) => {
    expect(JSON.stringify(await decide(T, line))).toContain(why);
  });

  it('«AM גובה לצלע CM» is still the right angle at M (#1247)', async () => {
    const v = await decide(T, 'AM גובה לצלע CM');
    expect(v.kind === 'commit' && v.commands.map((c) => c.type)).toEqual(['segment', 'segment', 'set-perpendicular']);
  });

  it('no ruled line reaches the model or refuses with an internal message', async () => {
    for (const line of ['AM חוצה זווית CMD', 'AM תיכון לצלע CD', 'AM גובה לצלע CD', 'AM הוא חוצה זווית CMD', 'AM היא גובה לצלע CD']) {
      const v = await decide(T, line);
      expect(v.kind, line).toBe('commit');
      expect(JSON.stringify(v)).not.toMatch(/references an unknown point|collapsed/);
    }
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
