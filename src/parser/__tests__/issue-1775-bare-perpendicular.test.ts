/**
 * #1775 ([ADR-796](../../../docs/06-decisions.md#adr-796)) — sr-12 (ADR-W-175): a definite noun binds the drawn object of its kind. Bare
 * «האנך» went to the model. With one perpendicular it lands on it, with several the tool asks with `ambiguous-construct` and the
 * options read, with none nothing changes.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { ctxOf, factsOf } from '@/__tests__/scenario-pipeline';

const after = (steps: string[], line: string) => parse(line, ctxOf(factsOf(steps)));
const THROUGH_P = ['משולש ABC', 'P על AB', 'דרך P מעבירים אנך ל-AB'];
const TWO = ['משולש ABC', 'P על AB', 'Q על AC', 'דרך P מעבירים אנך ל-AB', 'דרך Q מעבירים אנך ל-AC'];

describe('#1775 — one drawn perpendicular: the noun binds it', () => {
  it('a drawn line, crossed', () => {
    const r = after(THROUGH_P, 'האנך חותך את AC בנקודה E');
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.commands.at(-1)).toMatchObject({ type: 'line-intersection', id: 'E', line1: 'perp-P-AB', line2: 'line-AC', order: ['A', 'E', 'C'] });
  });

  it.each(['E על האנך', 'הנקודה E נמצאת על האנך'])('a drawn line, a point on it: %s', (line) => {
    const r = after(THROUGH_P, line);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.commands).toMatchObject([{ type: 'point-on-line', id: 'E', line: 'perp-P-AB' }]);
  });

  it.each([
    ['מ-A מורידים אנך ל-BC', 'F'],
    ['D רגל האנך מ-A ל-BC', 'D'],
    ['האנך מ-A ל-BC', 'F'],
  ])('a foot is the line from its point: %s', (first, foot) => {
    const r = after(['משולש ABC', first], 'E על האנך');
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.commands).toMatchObject([{ type: 'line-through', a: 'A', b: foot }, { type: 'point-on-line', id: 'E', line: `line-A${foot}` }]);
  });

  it('in English', () => {
    const r = after(['triangle ABC', 'P on AB', 'line through P perpendicular to AB'], 'E on the perpendicular');
    expect(r).toMatchObject({ ok: true });
  });
});

describe('#1775 — several: the existing question, and its options read', () => {
  it('asks, listing each by the sentence that reads', () => {
    expect(after(TWO, 'E על האנך')).toMatchObject({ ok: false, reason: 'ambiguous-construct', noun: 'האנך', options: ['האנך מ-P ל-AB', 'האנך מ-Q ל-AC'] });
  });

  it.each([
    ['E על האנך מ-P ל-AB', 'perp-P-AB'],
    ['E על האנך מ-Q ל-AC', 'perp-Q-AC'],
    ['E על האנך מ-Q', 'perp-Q-AC'],
  ])('the answer binds that one: %s', (line, id) => {
    const r = after(TWO, line);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.commands).toMatchObject([{ type: 'point-on-line', id: 'E', line: id }]);
  });
});

describe('#1775 — nothing new where nothing is drawn', () => {
  it.each(['E על האנך', 'האנך חותך את AC בנקודה E'])('no perpendicular: %s stays with the model', (line) => {
    expect(after(['משולש ABC'], line)).toMatchObject({ ok: false, reason: 'not-handled' });
  });

  it('a perpendicular bisector has its own noun', () => {
    expect(after(['משולש ABC', 'אנך אמצעי ל-AB'], 'E על האנך')).toMatchObject({ ok: false, reason: 'not-handled' });
  });

  it('a description of nothing drawn binds nothing', () => {
    expect(after(TWO, 'E על האנך מ-Z')).toMatchObject({ ok: false, reason: 'not-handled' });
  });
});
