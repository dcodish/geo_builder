/**
 * #1892 (ADR-AG-248, superseding ADR-AG-198 decision 2(b)) — a point on a BARE pair («D על AB», no noun) is on the
 * SEGMENT AB, as «D על הקטע AB» is and as 2-D reads it. Operator ruling 2026-10-08: with «A(0,0) · B(4,0) · D על
 * AB», «AD = 5» is refused, as 2-D refuses it; it no longer draws D beyond B, green.
 *
 * Before the fix the bare pair took the extent of whatever the figure drew over A–B at that moment, so with
 * nothing drawn it rode the infinite line, and the verdict depended on the order the givens were typed.
 *
 * Every lock calls the real path (`decideSubmit` line by line, then `derive`), never a reproduction.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

type Verdict = { kind: string; key?: string; detail?: string; reusedId?: string };

/** The student's session: each line submitted in turn; a recorded line joins the list. */
function play(lines: readonly string[], seed = 0): { verdicts: Verdict[]; kept: string[] } {
  const kept: string[] = [];
  const verdicts = lines.map((l): Verdict => {
    const v = decideSubmit(l, kept, seed);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind === 'refused' ? { kind: 'refused', key: v.error.key, detail: v.error.detail, ...('reusedId' in v.error && v.error.reusedId ? { reusedId: v.error.reusedId } : {}) } : { kind: v.kind };
  });
  return { verdicts, kept };
}
const kinds = (lines: readonly string[]) => play(lines).verdicts.map((v) => (v.kind === 'refused' ? `refused:${v.key}` : v.kind));
const pointOf = (lines: readonly string[], id: string, seed = 0): { x: number; y: number } => {
  const p = (derive(lines, seed).figure?.points ?? []).find((q: { id: string }) => q.id === id);
  if (!p) throw new Error(`${id} not drawn`);
  return p;
};
const AB = ['A(0,0)', 'B(4,0)'];

describe('#1892 — the operator’s exact sequences', () => {
  it('«A(0,0) · B(4,0) · D על AB · AD = 5»: «AD = 5» is refused before it is added, and D stays between A and B', () => {
    const { verdicts, kept } = play([...AB, 'D על AB', 'AD = 5']);
    expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record', 'refused']);
    expect(verdicts[3]).toMatchObject({ key: 'unsatisfiable', detail: 'AD = 5' });
    const d = pointOf(kept, 'D');
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.x).toBeLessThanOrEqual(4);
  });

  it('the one-line form «D על AB כך ש-AD = 5» is refused whole', () => {
    expect(play([...AB, 'D על AB כך ש-AD = 5']).verdicts[2]).toEqual({ kind: 'refused', key: 'unsatisfiable', detail: 'D על AB כך ש-AD = 5' });
  });
});

describe('#1892 — the controls the ruling names still record', () => {
  it('«D על AB כך ש-AD = 3» draws D = (3,0)', () => {
    const { verdicts, kept } = play([...AB, 'D על AB כך ש-AD = 3']);
    expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record']);
    const d = pointOf(kept, 'D');
    expect(d.x).toBeCloseTo(3, 6);
    expect(d.y).toBeCloseTo(0, 6);
  });
  it('«משולש ABC · AB = 4, AC = 3» commits', () => expect(kinds(['משולש ABC', 'AB = 4, AC = 3'])).toEqual(['record', 'record']));
  it('«משולש ABC · D על BC כך ש-BD = DC» commits; on coordinates D is the midpoint', () => {
    expect(kinds(['משולש ABC', 'D על BC כך ש-BD = DC'])).toEqual(['record', 'record']);
    const { kept } = play([...AB, 'C(0,3)', 'משולש ABC', 'D על BC כך ש-BD = DC']);
    const d = pointOf(kept, 'D');
    expect(d.x).toBeCloseTo(2, 6);
    expect(d.y).toBeCloseTo(1.5, 6);
  });
});

describe('#1892 — the class: every spelling of a point on a bare pair is the segment', () => {
  it.each<[string, string[]]>([
    ['D נמצאת על AB', [...AB, 'D נמצאת על AB', 'AD = 5']],
    ['הנקודה D נמצאת על AB', [...AB, 'הנקודה D נמצאת על AB', 'AD = 5']],
    ['נקודה D על AB', [...AB, 'נקודה D על AB', 'AD = 5']],
    ['D on AB', [...AB, 'D on AB', 'AD = 5']],
    ['E על BC', [...AB, 'C(0,3)', 'E על BC', 'BE = 6']],
    ['D ו-E על AB', [...AB, 'D ו-E על AB', 'AD = 5']],
    ['D על AB במרחק 5 מ-A', [...AB, 'D על AB במרחק 5 מ-A']],
    ['D על AB ונתון כי AD = 5', [...AB, 'D על AB ונתון כי AD = 5']],
    ['D on AB such that AD = 5', [...AB, 'D on AB such that AD = 5']],
    ['a circle’s centre «M על AB»', [...AB, 'מעגל שמרכזו M ורדיוסו 1', 'M על AB', 'AM = 5']],
    ['the converse «AB עובר דרך D»', [...AB, 'AB עובר דרך D', 'AD = 5']],
    ['after the line’s equation', [...AB, 'משוואת הישר AB היא y=0', 'D על AB', 'AD = 5']],
    ['after a drawn line «הישר AB»', [...AB, 'הישר AB', 'D על AB', 'AD = 5']],
    ['on free points', ['נקודה A', 'נקודה B', 'D על AB', 'AB = 4', 'AD = 5']],
  ])('%s: the impossible length is refused on its own line', (_label, lines) => {
    const v = kinds(lines);
    expect(v.slice(0, -1).every((k) => k === 'record')).toBe(true);
    expect(v.at(-1)).toBe('refused:unsatisfiable');
  });

  it.each([0, 1, 2, 3, 4, 5])('a ratio lands inside the segment: «D על AB · AD:DB = 1:2» draws D = (4/3, 0) at seed %i', (seed) => {
    const { verdicts, kept } = play([...AB, 'D על AB', 'AD:DB = 1:2'], seed);
    expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    const d = pointOf(kept, 'D', seed);
    expect(d.x).toBeCloseTo(4 / 3, 6);
    expect(d.y).toBeCloseTo(0, 6);
  });

  it('a typed point outside the segment is refused as a reused letter; an end of the pair already follows', () => {
    expect(play([...AB, 'P(6,0)', 'P על AB']).verdicts[3]).toMatchObject({ kind: 'refused', key: 'unsatisfiable', reusedId: 'P' });
    expect(kinds([...AB, 'A על AB'])).toEqual(['record', 'record', 'already-follows']);
  });
});

describe('#1892 — the line and the extension are unchanged', () => {
  it.each<[string, string[], string]>([
    ['«D על הישר AB · AD = 5» records', [...AB, 'D על הישר AB', 'AD = 5'], 'record'],
    ['«הישר AB עובר דרך D · AD = 5» records', [...AB, 'הישר AB עובר דרך D', 'AD = 5'], 'record'],
    ['«משולש ABC · D על הישר AB · AD = 5» records', [...AB, 'C(0,3)', 'משולש ABC', 'D על הישר AB', 'AD = 5'], 'record'],
    ['«D על המשך AB · AD = 5» records', [...AB, 'D על המשך AB', 'AD = 5'], 'record'],
    ['«D על המשך AB · AD = 3» is refused', [...AB, 'D על המשך AB', 'AD = 3'], 'refused:unsatisfiable'],
  ])('%s', (_label, lines, last) => expect(kinds(lines).at(-1)).toBe(last));
});

describe('#1892 — the order of the givens never changes the verdict', () => {
  it('«D על AB» before or after «AB = 4»: «AD = 5» is refused both ways, «AD = 3» records both ways', () => {
    const late = ['נקודה A', 'נקודה B', 'D על AB', 'AB = 4'];
    const early = ['נקודה A', 'נקודה B', 'AB = 4', 'D על AB'];
    expect(kinds([...late, 'AD = 5']).at(-1)).toBe('refused:unsatisfiable');
    expect(kinds([...early, 'AD = 5']).at(-1)).toBe('refused:unsatisfiable');
    expect(kinds([...late, 'AD = 3']).at(-1)).toBe('record');
    expect(kinds([...early, 'AD = 3']).at(-1)).toBe('record');
  });

  it('a later «הישר AB» or «E על המשך AB» never widens an earlier bare «D על AB»', () => {
    expect(kinds([...AB, 'D על AB', 'הישר AB', 'AD = 5']).at(-1)).toBe('refused:unsatisfiable');
    expect(kinds([...AB, 'D על AB', 'E על המשך AB', 'AD = 5']).at(-1)).toBe('refused:unsatisfiable');
  });
});
