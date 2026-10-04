/**
 * #1411 ([ADR-577](../../../docs/06-decisions.md#adr-577)) — a row that CREATES a point, left above the
 * row that declares its operands, builds once they exist. The 2-D half of ADR-W-089.
 *
 * Measured on d9a5910f through the real submit path (`runSubmit`, LLM mocked) + the row's delete button
 * (`removeGroup`):
 *
 * ```
 * משולש ABC · M אמצע AB · delete the triangle · משולש ABC  -> M row «unresolved dependencies for: M», no M
 * משולש ABC · AM תיכון  · delete the triangle · משולש ABC  -> the re-typed triangle REFUSED «A is no longer available»
 * משולש ABC · AD גובה   · delete the triangle · משולש ABC  -> refused the same way
 * ```
 *
 * The row was parsed when A, B existed, so it carries no `segment AB` that would create them; after the
 * delete it sits above its operands. Two fold seams: the ADR-104 retry skipped CREATING facts, and a FAILED
 * fact claimed the free points it would only have auto-created (the red `segment AM` claimed A, so the
 * re-typed triangle cascaded). The row's message also named M — the point it creates — instead of A, B.
 *
 * Drives the production adapter (the #1041/#1133 lesson): `runSubmit` for every typed line.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { foldStats, groupKey, replay, useGeoStore, type Fact } from '@/store/geoStore';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const notes: string[] = [];

function deps(): SubmitDeps {
  return {
    t: (key, o) => (o ? `${key}:${JSON.stringify(o)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => { if (m) notes.push(m); },
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
}

const submit = async (...lines: string[]) => { for (const l of lines) await runSubmit(l, deps()); };
/** The row's 🗑 — delete the statement whose utterance is `u`. */
const deleteRow = (u: string) => st().removeGroup(groupKey(st().facts.find((f) => f.utterance === u)!));
const view = () => replay(st().facts, st().seed);
const statuses = () => { const d = view(); return st().facts.map((f) => d.status[f.id]); };
const at = (id: string): Vec => { const p = view().positions.get(id); expect(p, `${id} is placed`).toBeDefined(); return p!; };
const mid = (P: Vec, Q: Vec): Vec => ({ x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 });
const near = (P: Vec, Q: Vec, what: string) => {
  expect(P.x, what).toBeCloseTo(Q.x, 6);
  expect(P.y, what).toBeCloseTo(Q.y, 6);
};

beforeEach(() => {
  st().clear();
  notes.length = 0;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#1411 — a creating row above its re-typed parent builds', () => {
  it('(a) «M אמצע AB» above the re-typed triangle: every row ok, M the midpoint of AB', async () => {
    await submit('משולש ABC', 'M אמצע AB');
    deleteRow('משולש ABC');
    await submit('משולש ABC');
    expect(st().facts.map((f) => f.utterance)).toEqual(['M אמצע AB', 'משולש ABC']);
    expect(statuses()).toEqual(['ok', 'ok']);
    near(at('M'), mid(at('A'), at('B')), 'M is the midpoint of AB');
  });

  it('(b) «AM תיכון»: the re-typed triangle is COMMITTED (was refused «A is no longer available»), M the midpoint of BC', async () => {
    await submit('משולש ABC', 'AM תיכון');
    deleteRow('משולש ABC');
    await submit('משולש ABC');
    expect(notes.join(' | '), 'no refusal note').not.toMatch(/no longer available/);
    expect(st().facts.some((f) => f.utterance === 'משולש ABC'), 'the triangle is in the list').toBe(true);
    expect(statuses().every((s) => s === 'ok'), JSON.stringify(statuses())).toBe(true);
    near(at('M'), mid(at('B'), at('C')), 'M is the midpoint of BC');
    expect(view().construction.objects.some((o) => o.kind === 'segment' && ((o.a === 'A' && o.b === 'M') || (o.a === 'M' && o.b === 'A'))), 'the median AM is drawn').toBe(true);
  });

  it('(c) «AD גובה»: D is the foot of the altitude on BC', async () => {
    await submit('משולש ABC', 'AD גובה');
    deleteRow('משולש ABC');
    await submit('משולש ABC');
    expect(statuses().every((s) => s === 'ok'), JSON.stringify(statuses())).toBe(true);
    const A = at('A'), B = at('B'), C = at('C'), D = at('D');
    const dot = (A.x - D.x) * (C.x - B.x) + (A.y - D.y) * (C.y - B.y);
    expect(Math.abs(dot), 'AD ⟂ BC').toBeLessThan(1e-6);
    const cross = (D.x - B.x) * (C.y - B.y) - (D.y - B.y) * (C.x - B.x);
    expect(Math.abs(cross), 'D on line BC').toBeLessThan(1e-6);
  });

  it('(d) a chain — «N אמצע AM» under «M אמצע AB» — settles: M and N both placed', async () => {
    await submit('משולש ABC', 'M אמצע AB', 'N אמצע AM');
    deleteRow('משולש ABC');
    await submit('משולש ABC');
    expect(statuses().every((s) => s === 'ok'), JSON.stringify(statuses())).toBe(true);
    near(at('M'), mid(at('A'), at('B')), 'M is the midpoint of AB');
    near(at('N'), mid(at('A'), at('M')), 'N is the midpoint of AM');
  });

  it('(e) REFUSAL — delete without re-typing: the row is red and names A, B, never M', async () => {
    await submit('משולש ABC', 'M אמצע AB');
    deleteRow('משולש ABC');
    const raw = statuses()[0];
    expect(raw).toBe('undefined point: A, B');
    const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;
    const shown = humanizeError(raw as string, t);
    expect(shown).toContain('A, B');
    expect(shown).not.toMatch(/\bM\b/);
    expect(view().positions.has('M'), 'no M drawn').toBe(false);
  });

  it('(f) MUTING the triangle still cascades the M row; un-muting restores it (ADR-015 unchanged)', async () => {
    await submit('משולש ABC', 'M אמצע AB');
    const key = groupKey(st().facts[0]);
    st().setGroupEnabled(key, false);
    expect(statuses()[0]).toBe('disabled');
    expect(statuses()[1]).not.toBe('ok');
    expect(view().positions.has('M')).toBe(false);
    st().setGroupEnabled(key, true);
    expect(statuses()).toEqual(['ok', 'ok']);
    near(at('M'), mid(at('A'), at('B')), 'M is back on AB');
  });

  it('(g) STABILITY — after the re-type, A, B, C sit where «משולש ABC» typed alone puts them', async () => {
    await submit('משולש ABC');
    const alone = new Map(['A', 'B', 'C'].map((k) => [k, at(k)]));
    st().clear();
    await submit('משולש ABC', 'M אמצע AB');
    deleteRow('משולש ABC');
    await submit('משולש ABC');
    expect(st().seed).toBe(0);
    for (const k of ['A', 'B', 'C']) near(at(k), alone.get(k)!, `${k} unmoved`);
  });

  it('(h) MEMO — an appended line never resumes from a fold where a creating row landed late, and equals a cold fold', async () => {
    await submit('משולש ABC', 'M אמצע AB');
    deleteRow('משולש ABC');
    await submit('משולש ABC');
    const resumesBefore = foldStats.resumes;
    await submit('AB = 6');
    expect(foldStats.resumes - resumesBefore, 'no #365 prefix resume from a retriedCreating node').toBe(0);
    const warm = view();
    expect(Object.values(warm.status).every((s) => s === 'ok'), JSON.stringify(warm.status)).toBe(true);
    // Evict the 8-entry memo with unrelated content, then fold the same list cold.
    const facts: Fact[] = st().facts.map((f) => ({ ...f }));
    for (let i = 0; i < 9; i++) replay([{ id: `junk${i}`, group: `junk${i}`, enabled: true, cmd: { type: 'segment', a: `P${i}`, b: `Q${i}` } } as Fact], 0);
    const cold = replay(facts, st().seed);
    for (const k of ['A', 'B', 'C', 'M']) near(warm.positions.get(k)!, cold.positions.get(k)!, `${k}: warm ≡ cold`);
    expect(Object.values(cold.status)).toEqual(Object.values(warm.status));
  });
});
