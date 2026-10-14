/**
 * #1975 (ADR-3D-341) — BOTH VOICES OF BOTH INSCRIPTION RELATIONS in 3-D (operator 2026-10-14: *"we need to have
 * both forms supported … for all shapes … in all tools"*).
 *
 * Measured at 939b160a through `decideSubmit3`: a circle NAMED first — «מעגל O חוסם את המשולש ABC», «מעגל O חסום
 * במשולש ABC», "the circle O circumscribes triangle ABC" — was `not-understood` (the ring reader took the circle's
 * letter as the ring), while «משולש ABC חסום במעגל O» built; and the relative clause «מעגל ש-ABC חוסם», whose
 * SUBJECT is the ring, drew the circle THROUGH A, B, C (word order put the circle first) — 2-D's #2098 trap.
 *
 * Each row: the two voices record the SAME facts, and the circle is the right one (`circum` / `incircle`).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, type Fact3 } from '../store/store3';

type State = { facts: Fact3[]; seed: number };
function run(lines: string[]) {
  let s: State = { facts: [], seed: 0 };
  const kinds: string[] = [];
  for (const line of lines) {
    const v = decideSubmit3(s, line);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.code}` : v.kind);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
  }
  return { kinds, facts: s.facts };
}
/** The last line's recorded commands, without its own text. */
const lastCmds = (lines: string[]) => {
  const { kinds, facts } = run(lines);
  expect(kinds.at(-1), `«${lines.at(-1)}»`).toBe('record');
  const f = facts.at(-1) as unknown as Record<string, unknown>;
  return JSON.parse(JSON.stringify(f, (k, x) => (k === 'text' || k === 'utterance' || k === 'id' && typeof x === 'string' && /^f/.test(x) ? undefined : x)));
};
const circleDef = (lines: string[]) => {
  const all = JSON.stringify(run(lines).facts.at(-1));
  return all.match(/"def":\{"kind":"(\w+)"/)?.[1];
};

describe('#1975 — the circle AROUND the shape, both voices, a named circle', () => {
  it.each([
    [['משולש ABC', 'מעגל O חוסם את המשולש ABC'], ['משולש ABC', 'משולש ABC חסום במעגל O']],
    [['ריבוע ABCD', 'מעגל O חוסם את הריבוע ABCD'], ['ריבוע ABCD', 'ריבוע ABCD חסום במעגל O']],
    [['משולש ABC', 'the circle O circumscribes triangle ABC'], ['משולש ABC', 'triangle ABC inscribed in circle O']],
  ])('%j records what %j records — the circumcircle named O', (active, passive) => {
    expect(circleDef(active)).toBe('circum');
    expect(lastCmds(active).cmds ?? lastCmds(active)).toEqual(lastCmds(passive).cmds ?? lastCmds(passive));
    expect(JSON.stringify(run(active).facts.at(-1))).toContain('"circle-O"');
  });
});

describe('#1975 — the circle INSIDE the shape, both voices, a named circle', () => {
  it.each([
    [['משולש ABC', 'מעגל O חסום במשולש ABC'], ['משולש ABC', 'משולש ABC חוסם את המעגל O']],
    [['משולש ABC', 'circle O inscribed in triangle ABC'], ['משולש ABC', 'triangle ABC circumscribes the circle O']],
  ])('%j records what %j records — the incircle named O', (a, b) => {
    expect(circleDef(a)).toBe('incircle');
    expect(circleDef(b)).toBe('incircle');
    expect(JSON.stringify(run(a).facts.at(-1))).toContain('"circle-O"');
  });
});

describe('#1975 — the relative clause: the RING is the subject, so the circle is inside (the #2098 trap in 3-D)', () => {
  it.each([
    ['משולש ABC', 'מעגל ש-ABC חוסם'],
    ['משולש ABC', 'מעגל שהמשולש ABC חוסם'],
  ])('%s · «%s» is the incircle, as «ABC חוסם מעגל» is', (shape, line) => {
    expect(circleDef([shape, line])).toBe('incircle');
    expect(circleDef([shape, 'ABC חוסם מעגל'])).toBe('incircle');
  });

  it('side by side: the circle as the subject is still the circumcircle', () => {
    expect(circleDef(['משולש ABC', 'מעגל שחוסם את המשולש ABC'])).toBe('circum');
    expect(circleDef(['משולש ABC', 'מעגל חוסם את ABC'])).toBe('circum');
    expect(circleDef(['משולש ABC', 'a circle circumscribed about triangle ABC'])).toBe('circum');
  });
});

describe('#1975 — unchanged refusals', () => {
  it('«מעגל שמרכזו O …» names a centre point 3-D does not carry: refused in both voices (#1902)', () => {
    expect(run(['משולש ABC', 'מעגל שמרכזו O חוסם את המשולש ABC']).kinds.at(-1)).toMatch(/^refused/);
    expect(run(['משולש ABC', 'המשולש ABC חסום במעגל שמרכזו O']).kinds.at(-1)).toMatch(/^refused/);
  });
  it('a quadrilateral incircle is refused in both voices until #1838', () => {
    expect(run(['ריבוע ABCD', 'מעגל O חסום בריבוע ABCD']).kinds.at(-1)).toBe('refused:incircle-needs-triangle');
    expect(run(['ריבוע ABCD', 'ריבוע ABCD חוסם את המעגל O']).kinds.at(-1)).toBe('refused:incircle-needs-triangle');
  });
});
