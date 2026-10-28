/**
 * #1690 ([ADR-772](../../../docs/06-decisions.md#adr-772)) — a construction's tool-made midpoint never takes the letter of a
 * point the figure already has.
 *
 * Measured on `main` 422cda84 through `decideDeterministic2D` → `commitVerdict` → `replay`, the model mocked to throw:
 *  - «משולש MPQ» · «קטע EK» · «אנך אמצעי ל-EK» committed `midpoint M of EK`, silently and green: the triangle's vertex M
 *    moved onto the midpoint of EK;
 *  - «משולש ABC» · «נקודה M» · «תיכון מ-A במשולש ABC» and «… · אנך אמצעי ל-AB» wrote `midpoint M` over the point M;
 *  - «משולש ABC» · «תיכון מ-A במשולש ABC» · «תיכון מ-B במשולש ABC» refused the second median «M coincides with its
 *    constructed target».
 * The root: `freeLabel` excluded only what each caller passed, and the median's stated-triangle and stated-side forms
 * and the singular perpendicular bisector passed no figure points. It now excludes `ctx.points` itself.
 * Operator ruling 2026-10-02 (#1620): *"M for a midpoint, F for a foot, the next free letter if taken"*.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';

const st = () => useGeoStore.getState();

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
  if (v.kind === 'commit' || v.kind === 'noop') commitVerdict(v, line);
  return v;
}
async function run(lines: string[]) {
  const kinds: string[] = [];
  for (const l of lines) kinds.push((await submit(l)).kind);
  return kinds;
}
const fig = () => replay(st().facts, st().seed);
const pos = (id: string) => fig().positions.get(id)!;
const points = () => [...fig().positions.keys()].filter((k) => /^[A-Z]\d*$/.test(k)).sort();
const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
const mid = (a: string, b: string) => ({ x: (pos(a).x + pos(b).x) / 2, y: (pos(a).y + pos(b).y) / 2 });

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockRejectedValue(new Error('the model is never called here'));
});

describe('#1690 — the tool-made midpoint takes the next free letter, never an existing point', () => {
  it.each([
    ['אנך אמצעי ל-EK'],
    ['perpendicular bisector of EK'],
  ])('«משולש MPQ» · «קטע EK» · «%s»: the vertex M stays put, the midpoint is N', async (line) => {
    await run(['משולש MPQ', 'קטע EK']);
    const before = { M: pos('M'), P: pos('P'), Q: pos('Q') };
    expect(await submit(line)).toMatchObject({ kind: 'commit' });
    expect(fig().lastError).toBeNull();
    for (const [id, p] of Object.entries(before)) expect(near(pos(id), p), `${id} did not move`).toBe(true);
    expect(near(pos('N'), mid('E', 'K')), 'N is the midpoint of EK').toBe(true);
    expect(near(pos('M'), mid('E', 'K'))).toBe(false);
  });

  it('a second unnamed median is drawn, with its own letter (M, then N)', async () => {
    expect(await run(['משולש ABC', 'תיכון מ-A במשולש ABC', 'תיכון מ-B במשולש ABC'])).toEqual(['commit', 'commit', 'commit']);
    expect(fig().lastError).toBeNull();
    expect(near(pos('M'), mid('B', 'C'))).toBe(true);
    expect(near(pos('N'), mid('A', 'C'))).toBe(true);
  });

  it.each([
    ['תיכון מ-A במשולש ABC', 'B', 'C'],
    ['אנך אמצעי ל-AB', 'A', 'B'],
  ])('a free point M is never overwritten: «%s» midpoints into N', async (line, a, b) => {
    await run(['משולש ABC', 'נקודה M']);
    const m = pos('M');
    expect(await submit(line)).toMatchObject({ kind: 'commit' });
    expect(near(pos('M'), m), 'M did not move').toBe(true);
    expect(near(pos('N'), mid(a, b))).toBe(true);
  });

  it('the bisector reuses the segment\'s existing midpoint — no twin on the same spot', async () => {
    await run(['קטע AB', 'K אמצע AB', 'אנך אמצעי ל-AB']);
    expect(points()).toEqual(['A', 'B', 'K']);
    expect(st().facts.map((f) => f.cmd)).toContainEqual(expect.objectContaining({ type: 'perpendicular-line', through: 'K' }));
  });

  it('a restated bisector is already drawn, whatever letter its midpoint took', async () => {
    expect(await run(['משולש MPQ', 'קטע EK', 'אנך אמצעי ל-EK', 'אנך אמצעי ל-EK'])).toEqual(['commit', 'commit', 'commit', 'noop']);
    expect(points()).toEqual(['E', 'K', 'M', 'N', 'P', 'Q']);
  });

  // The stated-side form («תיכון מ-A לצלע BC») is refused at submit by the one-statement-per-line scope (found
  // separately, #2587); its lowering — what the model's canonical line or a later scope reading reaches — is locked here.
  it.each([
    ['תיכון מ-A לצלע BC'],
    ['median from A to side BC'],
  ])('the lowering of «%s» over a point M mints N', async (line) => {
    await run(['משולש ABC', 'נקודה M']);
    const ctx = buildParseCtx(fig().construction, fig().positions);
    const r = parse(line, ctx);
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands).toContainEqual({ type: 'midpoint', id: 'N', a: 'B', b: 'C' });
  });
});
