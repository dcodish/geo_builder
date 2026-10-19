/**
 * #2195 / #2234 ([ADR-738](../../../docs/06-decisions.md#adr-738)) — ENGLISH WORDS ARE NEVER READ AS POINT LABELS.
 *
 * Rulings: 2026-10-16 (#2195, card 6) *"lowercase English words are never read as point labels"*; 2026-10-18 (#2195)
 * lowercase teaching A — *"Keep teaching on an empty figure; on a drawn figure, teach only letters that exist or that
 * the line defines"*; 2026-10-18 (#2234) side effects A — *"Accept both changes."*
 *
 * Measured at b7d6223c through `decideDeterministic2D`, the model mocked, after «משולש ABC»: "the triangle is
 * right-angled" committed ∠TRI = 90 on three invented points, green, and taught «∠TRI = 90»; "the triangle is acute"
 * an acute ∠TRI; "highlight right triangles" a green row ∠TRI = s; "angles are 40" was refused about a vertex S, and
 * "the circle is right-angled" about a vertex D, that the student never typed. The angle noun matched inside
 * «tri**angle**» / «**angle**d» and the label reader took the leftover «tri» / «d».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';

const st = () => useGeoStore.getState();

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(['commit', 'noop'], `the prefix line «${p}» builds`).toContain(v.kind);
    commitVerdict(v, p);
  }
}
const lettersOf = (s: string) => new Set((s.match(/[A-Za-z]/g) ?? []).map((c) => c.toUpperCase()));
/** every letter a note names must be a letter the student typed as a label (uppercase) or a figure point */
const namedLetters = (v: unknown): string[] => JSON.stringify((v as { note?: unknown }).note ?? {}).match(/(?<![A-Za-z])[A-Z](?![A-Za-z])/g) ?? [];

const TRI = ['משולש ABC'];
const CIRCLE = ['מעגל O'];
const RECT = ['מלבן ABCD'];

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('an English word is never read as point labels: the line goes to the AI', () => {
  it.each([
    // the report and its family (#2234 A1–A4)
    [TRI, 'the triangle is right-angled'], [TRI, 'the triangle is right angled'], [TRI, 'triangle is right-angled'],
    [TRI, 'the triangles are right-angled'], [TRI, 'the other triangle is right-angled'], [TRI, 'the TRIangle is right-angled'],
    [TRI, 'the triangle is acute'], [TRI, 'the triangle is obtuse'],
    // #2195 table (a)
    [TRI, 'highlight right triangles'], [TRI, 'show the triangles'], [TRI, 'angles are 40'],
    // a lone-vertex fragment («angle**d**» → D)
    [CIRCLE, 'the circle is right-angled'], [TRI, 'the rectangle is right-angled'], [TRI, 'the line is right-angled'], [RECT, 'the rectangle is right-angled'],
    // the plural / singular twins
    [TRI, 'the rectangles are right-angled'], [TRI, 'the quadrangle is right-angled'], [TRI, 'the other angle is 40'],
    // ruled side effect A: no fragment list
    [TRI, 'the triangle is isosceles and right-angled'],
  ] as [string[], string][])('%j · «%s» → escalate, nothing committed', async (prefix, line) => {
    await drive(prefix);
    const before = JSON.stringify(st().facts);
    const v = await decideHere(line);
    expect(v.kind, `«${line}»: ${JSON.stringify(v).slice(0, 300)}`).toBe('escalate');
    const typed = new Set([...(line.match(/[A-Z]/g) ?? []), ...prefix.flatMap((p) => p.match(/[A-Z]/g) ?? [])]);
    for (const l of namedLetters(v)) expect(typed.has(l), `a note naming ${l}`).toBe(true);
    expect(JSON.stringify(st().facts)).toBe(before);
  });

  it('the same on an empty figure', async () => {
    for (const line of ['the triangle is right-angled', 'the triangle is acute', 'highlight right triangles', 'the triangle is isosceles and right-angled']) {
      await drive([]);
      const v = await decideHere(line);
      expect(v.kind, line).not.toBe('commit');
      if (v.kind === 'refuse') for (const l of namedLetters(v)) expect(lettersOf(line).has(l) && /[A-Z]/.test(line), `«${line}» names ${l}`).toBe(true);
    }
  });
});

describe('ruled side effect A: «mark all right angles» / «show all angles» get the existing marks message', () => {
  it.each([
    [TRI, 'mark all right angles'], [TRI, 'show all angles'], [[], 'mark all right angles'], [[], 'show all angles'],
  ] as [string[], string][])('%j · «%s»', async (prefix, line) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect((v.note as { key?: string } | null)?.key).toBe('input.scope.ui-command');
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('the lowercase teaching (ruling 2026-10-18): empty figure as before; a drawn figure only for letters that exist or the line defines', () => {
  const nudge = (corrected: string) => ({ key: 'input.scope.lowercase-labels', params: { corrected } });
  it.each([
    ['angle at the top is 40', 'angle at the TOP is 40'],
    ['angle one is 40', 'angle ONE is 40'],
    ['a circle through all vertices', 'A circle through ALL vertices'],
    ['ab = 5', 'AB = 5'],
    ['point d on ab', 'point D on AB'],
    ['segment ab', 'segment AB'],
    ['angle abc = 40', 'angle ABC = 40'],
  ])('empty figure: «%s» → «%s» (as before)', async (line, corrected) => {
    await drive([]);
    const v = await decideHere(line);
    expect(v.kind === 'refuse' && v.note).toEqual(nudge(corrected));
  });
  it.each(['angle at the top is 40', 'angle one is 40', 'a circle through all vertices'])('△ABC: «%s» is not taught — it goes to the AI', async (line) => {
    await drive(TRI);
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('escalate');
  });
  it.each([
    [TRI, 'ab = 5', 'AB = 5'],
    [TRI, 'point d on ab', 'point D on AB'],
    [TRI, 'angle at b is 40', 'angle at B is 40'],
    [TRI, 'triangle abc', 'triangle ABC'],
    [CIRCLE, 'circle o', 'circle O'],
  ] as [string[], string, string][])('%j · «%s» → «%s» (unchanged)', async (prefix, line, corrected) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind === 'refuse' && v.note).toEqual(nudge(corrected));
  });
});

describe('unchanged: letters the student typed', () => {
  it.each([
    ['ABC is right-angled', 'B', 'A', 'C', 90],
    ['TRI is right-angled', 'R', 'T', 'I', 90],
    ['angle ABC is right-angled', 'B', 'A', 'C', 90],
    ['angle B is a right angle', 'B', 'A', 'C', 90],
    ['angleABC = 40', 'B', 'A', 'C', 40],
  ] as [string, string, string, string, number][])('△ABC · «%s» commits ∠%s', async (line, vertex, ray1, ray2, value) => {
    await drive(TRI);
    const v = await decideHere(line);
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands).toContainEqual({ type: 'set-angle', vertex, ray1, ray2, value });
  });
  it('△ABC · «angle ABC is acute» commits the acuteness on ∠ABC', async () => {
    await drive(TRI);
    const v = await decideHere('angle ABC is acute');
    expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'set-angle-acuteness', vertex: 'B', ray1: 'A', ray2: 'C', obtuse: false });
  });
  it('the named twins keep escalating; «the circle O is right-angled» keeps its refusal about O', async () => {
    await drive(TRI);
    for (const line of ['the triangle ABC is right-angled', 'triangle ABC is right-angled', 'the triangle ABC is acute']) expect((await decideHere(line)).kind, line).toBe('escalate');
    await drive(CIRCLE);
    const v = await decideHere('the circle O is right-angled');
    expect(v.kind === 'refuse' && v.note).toEqual({ key: 'input.noAngleYet', params: { vertex: 'O' } });
  });
});
