/**
 * #1973 ([ADR-AG-430](../../docs/06c-decisions-analytic.md#adr-ag-430); 2-D's ADR-797) — THE `cevian-of` ARM RECORDS THE
 * SHAPE IT RESOLVED IN, AND A RECORDED HOST PINS IT.
 *
 * «A(0,0)» … «D(1,3)» · «משולש ABC» · «AE גובה» · «מרובע ABCD» — the operator's seven lines. When «AE גובה» was accepted the
 * triangle was the only shape A belonged to. The ruling of 2026-10-10 (option C): that host is recorded at accept time,
 * so the line keeps meaning the triangle's height, and the row shows it beside the student's words.
 *
 * The unit test of M1: the parsed facts folded directly (`fold`), the pin written on the fact as `derive` writes it.
 * The session half — the store's `hosts`, the submit decision that records one, undo, edit, mute — is locked in
 * `history.test.ts` and `session.test.ts`; the operator's lines are the fixture `issue-1973-cevian-host.analytic.json`.
 */
import { describe, expect, it } from 'vitest';
import { fold } from '../engine/apply';
import type { Fact } from '../engine/types';
import { parseLine } from '../parser/parseAnalytic';

const POINTS = ['A(0,0)', 'B(6,0)', 'C(5,4)', 'D(1,3)'];
/** Parse the lines, pin the line at `pinAt` (as `derive` does from the session's hosts), fold. */
function folded(lines: readonly string[], pin?: { at: number; ring: string[] }) {
  const facts: Fact[] = [];
  const owner: number[] = [];
  lines.forEach((line, i) => {
    const r = parseLine(line);
    if (!r.ok) throw new Error(`«${line}» does not parse: ${r.code}`);
    for (const f of r.facts) {
      facts.push(pin && pin.at === i && f.t === 'cevian-of' ? { ...f, pin: pin.ring } : f);
      owner.push(i);
    }
  });
  const r = fold(facts, owner);
  /** Per line: the hosts its facts recorded, and whether it faulted. */
  const line = (i: number) => ({
    hosts: [...new Set(r.hosts.filter((_, j) => owner[j] === i).flatMap((h) => (h ? [JSON.stringify(h)] : [])))].map((h) => JSON.parse(h) as unknown),
    error: r.errors.find((e, j) => owner[j] === i && e)?.code ?? null,
  });
  return { line, construction: r.construction };
}
const TRIANGLE = { ring: ['A', 'B', 'C'], kind: 'triangle' };

describe('#1973 — M1 records the ring an open cevian resolved in', () => {
  it('the operator’s «AE גובה» → triangle ABC; the shapes around it record nothing', () => {
    const r = folded([...POINTS, 'משולש ABC', 'AE גובה', 'מרובע ABCD']);
    expect(r.line(5)).toEqual({ hosts: [TRIANGLE], error: null });
    expect(r.line(4).hosts).toEqual([]);
    expect(r.line(6).hosts).toEqual([]);
  });
  it.each([
    ['the median', 'AE תיכון'],
    ['the apex-only height', 'גובה מ-A'],
    ['the apex-only median', 'תיכון מ-A'],
    ['English', 'AE is an altitude'],
  ])('%s → triangle ABC', (_why, line) => {
    expect(folded([...POINTS, 'משולש ABC', line]).line(5)).toEqual({ hosts: [TRIANGLE], error: null });
  });
  it.each([
    ['a trapezoid’s height (its own parallel base)', 'טרפז ABCD', 'trapezoid'],
    ['a parallelogram’s height (the first opposite side)', 'מקבילית ABCD', 'parallelogram'],
    ['a plain quadrilateral', 'מרובע ABCD', 'quadrilateral'],
  ])('%s → the ring, by its noun', (_why, shape, kind) => {
    expect(folded([shape, 'AE גובה']).line(1)).toEqual({ hosts: [{ ring: ['A', 'B', 'C', 'D'], kind }], error: null });
  });
  it.each([
    ['a stated side', 'AE גובה לצלע BC'],
    ['a stated triangle', 'AE גובה במשולש ABC'],
    ['the vertex-less side form', 'גובה לצלע BC'],
  ])('%s records nothing extra', (_why, line) => {
    expect(folded([...POINTS, 'משולש ABC', line]).line(5)).toEqual({ hosts: [], error: null });
  });
});

describe('#1973 — a recorded host pins the line while the figure holds its ring', () => {
  /** A second shape REACHES the cevian's position — the case an edited or un-muted earlier row makes. */
  const BOTH = [...POINTS, 'משולש ABC', 'מרובע ABCD', 'AE גובה'];

  it('unpinned, two shapes ask (today’s ambiguity, unchanged)', () => {
    expect(folded(BOTH).line(6).error).toBe('ambiguous-cevian');
  });
  it('pinned to the triangle, it resolves there — the height it was accepted as', () => {
    const r = folded(BOTH, { at: 6, ring: ['A', 'B', 'C'] });
    expect(r.line(6)).toEqual({ hosts: [TRIANGLE], error: null });
  });
  it('pinned to the quadrilateral, it resolves there — the pin decides, not the order of the shapes', () => {
    const r = folded(BOTH, { at: 6, ring: ['A', 'B', 'C', 'D'] });
    expect(r.line(6)).toEqual({ hosts: [{ ring: ['A', 'B', 'C', 'D'], kind: 'quadrilateral' }], error: null });
  });
  it('a pinned ring the figure no longer holds pins nothing: the line resolves as it always did', () => {
    const gone = [...POINTS, 'מרובע ABCD', 'AE גובה'];
    const pinned = folded(gone, { at: 5, ring: ['A', 'B', 'C'] });
    const plain = folded(gone);
    expect(pinned.line(5)).toEqual(plain.line(5));
    expect(pinned.line(5).hosts).toEqual([{ ring: ['A', 'B', 'C', 'D'], kind: 'quadrilateral' }]);
  });
  it('a pin never reaches a sentence that states its side', () => {
    const r = folded([...BOTH.slice(0, 6), 'AE גובה לצלע CD'], { at: 6, ring: ['A', 'B', 'C'] });
    expect(r.line(6)).toEqual({ hosts: [], error: null });
  });
});
