/**
 * #363 / ADR-418 — a concurrency statement that names no result point builds it anyway, auto-labelled.
 *
 * `specialPointMeet` resolved everything — the meet verb, the centre family, the host polygon — and then
 * bailed on `if (!X) return null` purely for want of a visible name, so «נקודת מפגש האלכסונים» went to the
 * paid LLM although every command it would emit is fully determined without the label. This grammar
 * already auto-names elsewhere (the midsegment's endpoints; ADR-263's altitude foot), so the fix is to
 * reach that discipline, preferring the CONVENTIONAL centre letter of each family.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenarios-harness';
import type { AnyCommand } from '@/engine/types';

const ctxOf = (steps: string[]) => {
  const { construction, positions } = replay(factsOf(steps));
  return buildParseCtx(construction, positions);
};
const cmds = (u: string, steps: string[]): AnyCommand[] => {
  const r = parse(u, ctxOf(steps));
  expect(r.ok, `«${u}» parses deterministically`).toBe(true);
  return r.ok ? r.commands : [];
};
/** the id of the crossing the rule builds (the last command is always the intersection) */
const centreId = (u: string, steps: string[]): string => {
  const list = cmds(u, steps);
  const last = list[list.length - 1] as { type: string; id: string };
  expect(['line-line-intersection', 'line-intersection']).toContain(last.type);
  return last.id;
};

describe('#363 — an unnamed concurrency point is built and auto-labelled', () => {
  it('the quad diagonal crossing, in three registers', () => {
    for (const u of ['נקודת מפגש האלכסונים', 'האלכסונים נחתכים', 'the diagonals meet']) {
      expect(centreId(u, ['ריבוע ABCD']), u).toBe('M');
    }
  });

  it('each triangle family takes its CONVENTIONAL letter', () => {
    expect(centreId('מפגש התיכונים במשולש ABC', []), 'centroid').toBe('M');
    expect(centreId('מפגש הגבהים במשולש ABC', []), 'orthocentre').toBe('H');
    expect(centreId('מפגש חוצי הזוויות במשולש ABC', []), 'incentre').toBe('I');
    expect(centreId('מפגש האנכים האמצעיים במשולש ABC', []), 'circumcentre').toBe('O');
  });

  it('a NAMED result stays exactly as the student wrote it', () => {
    expect(centreId('אלכסוני הריבוע נחתכים בנקודה O', ['ריבוע ABCD'])).toBe('O');
    expect(centreId('K נקודת מפגש האלכסונים', ['ריבוע ABCD'])).toBe('K');
  });

  it('never steals a letter already in use', () => {
    // M is taken by the circle's centre ⇒ the next preference wins
    expect(centreId('נקודת מפגש האלכסונים', ['ריבוע ABCD', 'מעגל M'])).toBe('O');
    // and never a vertex of its own host
    const id = centreId('מפגש התיכונים במשולש ABC', ['משולש ABC']);
    expect(['A', 'B', 'C']).not.toContain(id);
  });

  it('still DEFERS when the host shape is ambiguous (ADR-052 — a label is not a licence to guess)', () => {
    const r = parse('נקודת מפגש האלכסונים', ctxOf(['ריבוע ABCD', 'מרובע EFGH']));
    expect(r.ok, 'two candidate quads ⇒ defer, not a guess').toBe(false);
  });
});

describe('#363 — the figure it builds', () => {
  it('the auto-labelled crossing really is the centre of the square', () => {
    const facts = factsOf(['ריבוע ABCD', 'נקודת מפגש האלכסונים']);
    const fig = replay(facts);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `step ${id}`).toBe('ok');
    const at = (id: string) => fig.positions.get(id)!;
    const [A, B, C, D, M] = ['A', 'B', 'C', 'D', 'M'].map(at);
    expect(M, 'M was created').toBeTruthy();
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    // the diagonal crossing of a square is equidistant from all four vertices
    for (const [name, v] of [['A', A], ['B', B], ['C', C], ['D', D]] as const) {
      expect(d(M, v), `|M${name}| equals the others`).toBeCloseTo(d(M, A), 6);
    }
  });
});
