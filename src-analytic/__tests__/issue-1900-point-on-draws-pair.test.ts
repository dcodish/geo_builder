/**
 * #1900 (ADR-AG-264, amending ADR-AG-198 decision 1) — A POINT ON A NAMED PAIR DRAWS THE PAIR, AS 2-D DOES.
 *
 * «A(0,0) · B(4,0) · D על AB» placed D and drew no segment AB: the student saw a dot floating with nothing under
 * it. 2-D — the reference for how a plane figure is drawn (ADR-W-118 B1) — commits `segment` + `point-on-segment`
 * and draws seg-AB, a plain segment with no mark and no label of its own.
 *
 * Measured in 2-D at this branch's base (`06fc51dd`, `decideDeterministic2D` → `replay` → `buildScene`): «נקודה A ·
 * נקודה B · D על AB» commits `{segment A B}`, `{point-on-segment D A B}` and the scene holds `seg-AB(AB)`; the same
 * for «D על הקטע AB», «D על הצלע AB», «D נמצאת על AB», «נקודה D על AB», "D on AB" and «D ו-E על AB» (one seg-AB);
 * «משולש ABC · D על AB» draws the three sides only; «ריבוע ABCD · E על AC» draws the four sides and seg-AC; a later
 * «AB», «קטע AB» or «הישר AB» is a `noop` («already drawn»).
 *
 * Every lock drives the real path (`decideSubmit` line by line, then `derive`), never a reproduction.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

type Played = { kinds: string[]; kept: string[] };

/** The student's session: each line submitted in turn; a recorded line joins the list. */
function play(lines: readonly string[], seed = 0): Played {
  const kept: string[] = [];
  const kinds = lines.map((l) => {
    const v = decideSubmit(l, kept, seed);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
  return { kinds, kept };
}

/** What the canvas actually strokes as straight pieces, in order. */
const drawn = (lines: readonly string[], seed = 0): string[] =>
  (derive(lines, seed).figure?.segments ?? []).map((s: { id: string }) => s.id);

const AB = ['A(0,0)', 'B(4,0)'];
const SEEDS = [0, 1, 2, 3];

describe('#1900 — the reported sequence: the rider draws its carrier', () => {
  it.each(SEEDS)('«A(0,0) · B(4,0) · D על AB» draws segment AB as well as D (seed %i)', (seed) => {
    const { kinds, kept } = play([...AB, 'D על AB'], seed);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(drawn(kept, seed)).toEqual(['seg-AB']);
    expect((derive(kept, seed).figure?.points ?? []).map((p: { id: string }) => p.id).sort()).toEqual(['A', 'B', 'D']);
    expect(derive(kept, seed).faults ?? []).toEqual([]);
  });

  it.each(SEEDS)('the same on free points: «נקודה A · נקודה B · D על AB» (seed %i)', (seed) => {
    const { kinds, kept } = play(['נקודה A', 'נקודה B', 'D על AB'], seed);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(drawn(kept, seed)).toEqual(['seg-AB']);
  });
});

describe('#1900 — the class: every spelling of the point-on sentence draws its carrier, exactly once', () => {
  it.each<[string, string[], string[]]>([
    ['D על AB', [...AB, 'D על AB'], ['seg-AB']],
    ['D על הקטע AB', [...AB, 'D על הקטע AB'], ['seg-AB']],
    ['D על הצלע AB', [...AB, 'D על הצלע AB'], ['seg-AB']],
    ['D נמצאת על AB', [...AB, 'D נמצאת על AB'], ['seg-AB']],
    ['הנקודה D נמצאת על AB', [...AB, 'הנקודה D נמצאת על AB'], ['seg-AB']],
    ['נקודה D על AB', [...AB, 'נקודה D על AB'], ['seg-AB']],
    ['D on AB', [...AB, 'D on AB'], ['seg-AB']],
    ['D ו-E על AB — ONE segment for two riders', [...AB, 'D ו-E על AB'], ['seg-AB']],
    ['D ו-E על הקטע AB', [...AB, 'D ו-E על הקטע AB'], ['seg-AB']],
    ['E על BC — the carrier is the pair the sentence names', [...AB, 'C(0,3)', 'E על BC'], ['seg-BC']],
    ['D על AB במרחק 1 מ-A', [...AB, 'D על AB במרחק 1 מ-A'], ['seg-AB', 'seg-AD']],
    ['D על AB כך ש-AD = 3', [...AB, 'D על AB כך ש-AD = 3'], ['seg-AB', 'seg-AD']],
    ['a circle’s centre «M על AB»', [...AB, 'מעגל שמרכזו M ורדיוסו 1', 'M על AB'], ['seg-AB']],
    ['a rider on the segment already drawn adds nothing', [...AB, 'הקטע AB', 'D על AB'], ['seg-AB']],
    ['ריבוע ABCD · E על AC — the diagonal is drawn beside the four sides', ['ריבוע ABCD', 'E על AC'], ['poly-ABCD-0', 'poly-ABCD-1', 'poly-ABCD-2', 'poly-ABCD-3', 'seg-AC']],
    ['ריבוע ABCD · E על הקטע AC', ['ריבוע ABCD', 'E על הקטע AC'], ['poly-ABCD-0', 'poly-ABCD-1', 'poly-ABCD-2', 'poly-ABCD-3', 'seg-AC']],
  ])('%s', (_label, lines, expected) => {
    const { kinds, kept } = play(lines);
    expect(kinds.every((k) => k === 'record')).toBe(true);
    expect(drawn(kept)).toEqual(expected);
  });

  it.each(SEEDS)('a side of a declared shape is absorbed, never drawn twice: «משולש ABC · D על AB» keeps three sides (seed %i)', (seed) => {
    const { kinds, kept } = play(['משולש ABC', 'D על AB'], seed);
    expect(kinds).toEqual(['record', 'record']);
    expect(drawn(kept, seed)).toEqual(['poly-ABC-0', 'poly-ABC-1', 'poly-ABC-2']);
  });

  it.each([
    ['משולש ABC', 'D על הקטע AB'],
    ['משולש ABC', 'D על הצלע AB'],
    ['ריבוע ABCD', 'E על הצלע AB'],
    ['טרפז ABCD', 'E על AD'],
    ['טרפז ABCD', 'E על השוק AD'],
  ])('«%s · %s» draws the ring’s sides only', (ring, rider) => {
    const { kept } = play([ring, rider]);
    expect(drawn(kept).filter((id) => !id.startsWith('poly-'))).toEqual([]);
  });
});

describe('#1900 — the pair is ONE object: the piece typed afterwards is already known', () => {
  it.each(['AB', 'קטע AB', 'הקטע AB', 'הישר AB'])('«D על AB» then «%s» adds nothing and says so', (later) => {
    const { kinds, kept } = play([...AB, 'D על AB', later]);
    expect(kinds).toEqual(['record', 'record', 'record', 'already-known']);
    expect(drawn(kept)).toEqual(['seg-AB']);
  });
});

describe('#1900 — the controls, measured at pickup and unchanged', () => {
  it('«D על הישר AB» keeps the line noun’s extent and draws nothing (#1910 open)', () => {
    const { kinds, kept } = play([...AB, 'D על הישר AB']);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(drawn(kept)).toEqual([]);
  });

  it('«D על המשך AB» draws the pair and the extension, as it already did', () => {
    const { kept } = play([...AB, 'D על המשך AB']);
    expect(drawn(kept)).toEqual(['seg-AB', 'seg-BD']);
  });

  it('a subject that is an end of its own pair states nothing new and draws nothing new', () => {
    expect(play([...AB, 'A על AB']).kinds.at(-1)).toBe('already-follows');
    expect(play([...AB, 'B על AB']).kinds.at(-1)).toBe('already-follows');
    const { kinds, kept } = play([...AB, 'A על הקטע AB']);
    expect(kinds.at(-1)).toBe('record');
    expect(drawn(kept)).toEqual([]);
  });

  it('on an empty canvas the sentence still introduces its pair and now draws it (measured at pickup, as 2-D does)', () => {
    const { kinds, kept } = play(['D על AB']);
    expect(kinds).toEqual(['record']);
    expect(drawn(kept)).toEqual(['seg-AB']);
  });

  it('the converse and the ratio form are unchanged — they already drew the pair', () => {
    expect(drawn(play([...AB, 'AB עובר דרך D']).kept)).toEqual(['seg-AB']);
    expect(drawn(play([...AB, 'D על AB ב-40%']).kept)).toEqual(['seg-AB']);
  });

  it('#1892’s verdicts are untouched: «AD = 5» is refused, «AD = 3» records', () => {
    expect(play([...AB, 'D על AB', 'AD = 5']).kinds.at(-1)).toBe('refused:unsatisfiable');
    expect(play([...AB, 'D על AB', 'AD = 3']).kinds.at(-1)).toBe('record');
  });

  it('a drawn infinite line and the rider’s segment coexist, exactly as the pair’s other sentences already do', () => {
    // «הישר AB · הקטע AB» and «הישר AB · AB עובר דרך D» measured at pickup: both draw seg-AB beside line-AB.
    const curves = (lines: readonly string[]) => (derive(lines, 0).figure?.curves ?? []).map((c: { id: string }) => c.id);
    const { kept } = play([...AB, 'משוואת הישר AB היא y=0', 'D על AB']);
    expect(drawn(kept)).toEqual(['seg-AB']);
    expect(curves(kept)).toEqual(['line-AB']);
    expect(drawn(play([...AB, 'משוואת הישר AB היא y=0', 'הקטע AB']).kept)).toEqual(['seg-AB']);
  });
});
