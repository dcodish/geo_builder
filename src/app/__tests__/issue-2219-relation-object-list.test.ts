/**
 * #2219 ([ADR-744](../../../docs/06-decisions.md#adr-744)) — A RELATION STATED TO A LIST OF OBJECTS HOLDS FOR EACH (the
 * honesty invariant: *"both relations are read. A pair that cannot hold together is refused, naming the contradiction;
 * one that can builds both. Never a dropped relation"*).
 *
 * Measured at `e9346d32` through `decideDeterministic2D` → `commitVerdict` → `replay`, after MID = «משולש ABC» · «D אמצע
 * AB» · «E אמצע AC» · «F אמצע BC»: "DE is parallel to BC and segment AB" COMMITTED `set-parallel DE∥BC` + a bare
 * `segment AB`, green, though DE ∥ AB cannot hold; "AF is perpendicular to BC and DE" recorded only AF ⊥ BC. Root cause:
 * the whole-line rule read the first object, and the clause split turned the rest of the list into draw statements.
 * Fix: one object-list shape in the distributor — the line reads as the same relation typed once per object.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { distributedClauses } from '@/parser';
import { clausesOf } from '@/app/independence';
import type { AnyCommand, Vec } from '@/engine';

const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function play(lines: string[]) {
  st().clear();
  let last: { kind: string; category?: string; commands: AnyCommand[] } = { kind: '', commands: [] };
  for (const line of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
    commitVerdict(v, line);
    last = { kind: v.kind, category: (v as { category?: string }).category, commands: v.kind === 'commit' ? [...v.commands] : [] };
  }
  return last;
}

const MID = ['משולש ABC', 'D אמצע AB', 'E אמצע AC', 'F אמצע BC'];
const QUAD = ['מרובע ABCD', 'E אמצע AD', 'F אמצע BC'];
const P = (f: ReturnType<typeof replay>, id: string): Vec => f.positions.get(id)!;
const angleDeg = (f: ReturnType<typeof replay>, a: string, b: string, c: string, d: string) => {
  const u = { x: P(f, b).x - P(f, a).x, y: P(f, b).y - P(f, a).y };
  const v = { x: P(f, d).x - P(f, c).x, y: P(f, d).y - P(f, c).y };
  return (Math.acos(Math.abs(u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
};

describe('#2219 — a pair that cannot hold together is refused, nothing drawn', () => {
  const REFUSED: [string[], string][] = [
    [MID, 'DE is parallel to BC and segment AB'], // the report (A1)
    [MID, 'DE is parallel to BC and AB'],
    [MID, 'DE is parallel to BC and to AB'],
    [MID, 'DE is parallel to both BC and AB'],
    [MID, 'DE is parallel to segments BC and AB'],
    [MID, 'segment DE is parallel to segment BC and segment AB'],
    [MID, 'DE ∥ BC, AB'],
    [MID, 'DE מקביל ל-BC ו-AB'],
    [MID, 'DE מקביל ל-BC ול-AB'],
    [MID, 'DE מקביל ל-BC וגם ל-AB'],
    [MID, 'DE מקביל לקטע BC ולקטע AB'],
    [MID, 'DE מקביל לקטעים BC ו-AB'],
    [MID, 'DE מקביל ל-BC, AB'],
    [MID, 'DE ∥ BC ו-AB'],
    [['משולש ABC'], 'DE מקביל ל-BC ו-AB'], // A4: D, E new
    [QUAD, 'EF מקביל ל-AB ו-AD'], // C3
    [['מרובע ABCD'], 'AB ⊥ BC ו-CD'], // C5
    [['משולש ABC'], 'D על AB ו-AC'], // C7
    [['משולש ABC'], 'AD מאונך ל-BC ו-AC'], // C9, a new D: the two lines refuse the second the same way
  ];
  for (const [prefix, line] of REFUSED)
    it(`«${line}»`, async () => {
      const r = await play([...prefix, line]);
      expect(r.kind).toBe('refuse');
      expect(st().facts).toHaveLength(prefix.length);
    });
});

describe('#2219 — a list that can hold builds every relation', () => {
  it('"AF is perpendicular to BC and DE" and its spellings record AF ⊥ BC and AF ⊥ DE, 90° / 90°', async () => {
    for (const line of ['AF is perpendicular to BC and DE', 'AF is perpendicular to BC and to DE', 'AF ⊥ BC and DE', 'AF מאונך ל-BC ו-DE', 'AF מאונך ל-BC ול-DE', 'AF מאונך לקטע BC ולקטע DE']) {
      const r = await play([...MID, line]);
      expect(r.kind, line).toBe('commit');
      const perps = r.commands.filter((c) => c.type === 'set-perpendicular').map((c) => JSON.stringify(c));
      expect(perps.some((c) => c.includes('"c":"D"') && c.includes('"d":"E"')), `${line}: AF ⊥ DE recorded`).toBe(true);
      for (const seed of [0, 1, 2, 3]) {
        const f = replay(st().facts, seed);
        expect(angleDeg(f, 'A', 'F', 'B', 'C'), `${line} seed ${seed}`).toBeCloseTo(90, 4);
        expect(angleDeg(f, 'A', 'F', 'D', 'E'), `${line} seed ${seed}`).toBeCloseTo(90, 4);
      }
    }
  });
  it('«מעגל O משיק ל-AB ו-AC» and its spellings: O tangent to every named side', async () => {
    for (const [line, sides] of [
      ['מעגל O משיק ל-AB ו-AC', ['AB', 'AC']],
      ['מעגל O משיק לצלעות AB ו-AC', ['AB', 'AC']],
      ['circle O is tangent to AB and AC', ['AB', 'AC']],
      ['מעגל O משיק ל-AB, BC ו-AC', ['AB', 'BC', 'AC']],
    ] as const) {
      expect((await play(['משולש ABC', line])).kind, line).toBe('commit');
      for (const seed of [0, 1, 2, 3]) {
        const f = replay(st().facts, seed);
        const c = f.circles.get('circle-O')!;
        for (const s of sides) {
          const a = P(f, s[0]), b = P(f, s[1]);
          const d = Math.abs((b.x - a.x) * (a.y - c.center.y) - (a.x - c.center.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
          expect(Math.abs(d - c.r), `${line} seed ${seed} ${s}`).toBeLessThan(1e-3); // the solver's tolerance (the two lines measure ≤ 2e-4)
        }
      }
    }
  });
  it('«M אמצע AC ו-BD»: M the midpoint of both diagonals', async () => {
    expect((await play(['מרובע ABCD', 'M אמצע AC ו-BD'])).kind).toBe('commit');
    for (const seed of [0, 1, 2, 3]) {
      const f = replay(st().facts, seed);
      const m = P(f, 'M');
      for (const [a, b] of [['A', 'C'], ['B', 'D']]) expect(Math.hypot(m.x - (P(f, a).x + P(f, b).x) / 2, m.y - (P(f, a).y + P(f, b).y) / 2), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });
  it('the equality lists build both equalities (they were refused with a fragment note)', async () => {
    for (const line of ['EF = AD ו-AE', 'EF = AD and AE', 'EF = AD, AE']) {
      const r = await play([...MID, line]);
      expect(r.kind, line).toBe('commit');
      expect(r.commands.filter((c) => c.type === 'set-equal'), line).toHaveLength(2);
    }
  });
  it('an entailed second relation is recorded: «EF = AD ו-DB», «EF מקביל ל-AB ו-DC»', async () => {
    expect((await play([...MID, 'EF = AD ו-DB'])).commands.filter((c) => c.type === 'set-equal')).toHaveLength(2);
    expect((await play([...QUAD, 'EF מקביל ל-AB ו-DC'])).commands.filter((c) => c.type === 'set-parallel')).toHaveLength(2);
  });
  it('the invariant: a committed list relates the subject to every object it names', async () => {
    for (const line of ['AF is perpendicular to BC and DE', 'AF מאונך ל-BC ו-DE']) {
      const r = await play([...MID, line]);
      for (const obj of ['BC', 'DE']) {
        expect(r.commands.some((c) => c.type === 'set-perpendicular' && JSON.stringify(c).includes(`"c":"${obj[0]}","d":"${obj[1]}"`)), `${line}: ${obj}`).toBe(true);
      }
    }
  });
});

describe('#2219 — the ✎ editor reads the line the same way', () => {
  const deps: EditDeps = { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => {} };
  const lastGroup = () => {
    const keys = [...new Set(st().facts.map(groupKey))];
    return keys[keys.length - 1];
  };
  // The edit seam's contradiction is the edited row's own error (it is how a single-relation edit «DE מקביל ל-AB» lands,
  // measured): never green, naming DE ∥ AB — the list is read exactly as that single relation, never its first object only.
  it('editing «DE מקביל ל-BC» into "DE is parallel to BC and AB" lands as «DE מקביל ל-AB» does; "AF ⊥ BC ו-DE" builds both', async () => {
    for (const edit of ['DE is parallel to BC and AB', 'DE מקביל ל-BC ו-AB', 'DE מקביל ל-AB']) {
      await play([...MID, 'DE מקביל ל-BC']);
      runEditCommit(lastGroup(), edit, deps);
      const r = replay(st().facts, st().seed);
      expect(r.lastError, edit).toMatch(/DE ∥ AB cannot hold/);
    }
    await play([...MID, 'AF מאונך ל-BC']);
    expect(runEditCommit(lastGroup(), 'AF מאונך ל-BC ו-DE', deps)).toBe(true);
    expect(st().facts.filter((f) => f.cmd.type === 'set-perpendicular')).toHaveLength(2);
  });
});

describe('#2219 — controls (unchanged)', () => {
  const SAME: [string[], string][] = [
    [['מרובע ABCD'], 'O חיתוך של AC ו-BD'],
    [['מרובע ABCD'], 'M מפגש AC ו-BD'],
    [['מעגל O'], 'AB קוטר במעגל O ו-CD'],
    [['משולש ABC'], 'AB ו-AC משיקים למעגל O'],
    [MID, 'DE מקביל ל-BC ו-AF מאונך ל-BC'],
    [[], 'ריבוע ABCD ו-AC'],
    [[], 'משולש ABC, AD'],
    [[], 'מעגל O ומעגל P'],
    [MID, 'DE ו-AF מקבילים ל-BC'],
  ];
  for (const [, line] of SAME)
    it(`«${line}» is not an object list`, () => expect(distributedClauses(line)).toBeNull());
  it('clausesOf sees each clause of a recognised list (the coverage gate shares the distributor)', () => {
    expect(clausesOf('DE is parallel to BC and segment AB')).toEqual(['DE is parallel to BC', 'DE is parallel to segment AB']);
    expect(clausesOf('DE מקביל ל-BC ו-AB')).toEqual(['DE מקביל ל-BC', 'DE מקביל ל-AB']);
  });
  it('the model is never called', async () => {
    await play([...MID, 'DE is parallel to BC and segment AB']);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
