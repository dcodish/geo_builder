/**
 * #1751 (ADR-AG-241) — THE GRAMMATICAL SUBJECT OF A CROSSING SENTENCE DECIDES WHAT IS DRAWN.
 *
 * Operator, round #1736 play, T3: *"«AC ו- BD נפגשים בנקודה M» should draw AC and BD vs «M מפגש AC ו-BD» which
 * related to the dot itself only and therefore only builds the dot."* Rulings 2026-10-04: the noun form gives the point
 * only, in BOTH builders; the verb form draws its lines whether they are named by letters or by role.
 *
 * Measured at pickup (origin/main 4d6e3fd6, `decideSubmit` after «מרובע ABCD»): every verb spelling recorded M with
 * only the four sides drawn — «AC ו-BD נפגשים בנקודה M», «האלכסונים נפגשים בנקודה M», «AC חותך את BD בנקודה M», "AC
 * and BD meet at M" — while 2-D drew AC and BD. Every lock CALLS the real submit decision and reads the derived figure.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

/** Every step through `decideSubmit`, as `App.tsx` dispatches it: the last verdict, what is drawn beyond the ring, M. */
function play(steps: readonly string[]) {
  const lines: string[] = [];
  let last = '';
  for (const s of steps) {
    const v = decideSubmit(s, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    last = v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  }
  const d = derive(lines, 0);
  const drawn = [
    ...d.figure.segments.map((s) => String(s.id)).filter((id) => !id.startsWith('poly-')),
    ...d.figure.curves.map((c) => String(c.id)),
  ].sort();
  const pt = (id: string) => d.figure.points.find((p) => p.id === id);
  const [a, b, c, dd, m] = ['A', 'B', 'C', 'D', 'M'].map(pt);
  // M on line AC and on line BD (cross products), so it IS the crossing in every spelling
  const onAC = a && c && m ? Math.abs((c.x - a.x) * (m.y - a.y) - (c.y - a.y) * (m.x - a.x)) : NaN;
  const onBD = b && dd && m ? Math.abs((dd.x - b.x) * (m.y - b.y) - (dd.y - b.y) * (m.x - b.x)) : NaN;
  return { last, faults: d.faults.map((f) => f.code), drawn, crossing: onAC < 1e-6 && onBD < 1e-6 };
}

const QUAD = 'מרובע ABCD';
const SEGMENTS = ['seg-AC', 'seg-BD'];
const LINES = ['line-AC', 'line-BD'];

describe('#1751 — the operator’s lines, through the real submit decision', () => {
  it.each([
    'AC ו- BD נפגשים בנקודה M', // his exact line
    'AC ו-BD נפגשים בנקודה M',
    // the UI wraps a typed Latin run in bidi isolates
    '⁦AC⁩ ו- ⁦BD⁩ נפגשים בנקודה ⁦M⁩',
    '⁦AC⁩ ו-⁦BD⁩ נפגשים בנקודה ⁦M⁩',
  ])('«%s» draws AC, BD and M', (line) => {
    expect(play([QUAD, line])).toEqual({ last: 'record', faults: [], drawn: SEGMENTS, crossing: true });
  });

  it.each(['M מפגש AC ו-BD', 'M מפגש AC ו- BD', 'M מפגש ⁦AC⁩ ו-⁦BD⁩'])('«%s» builds M only — AC and BD are not added', (line) => {
    expect(play([QUAD, line])).toEqual({ last: 'record', faults: [], drawn: [], crossing: true });
  });
});

describe('#1751 — the VERB frame draws its lines: letters or role', () => {
  it.each([
    ['AC ו-BD נפגשים בנקודה M', SEGMENTS],
    ['AC ו-BD נחתכים בנקודה M', SEGMENTS],
    ['AC and BD meet at M', SEGMENTS],
    ['AC חותך את BD בנקודה M', SEGMENTS],
    // the noun decides the extent (#1234): «הישר» is the line
    ['הישרים AC ו-BD נפגשים בנקודה M', LINES],
    ['הישר AC והישר BD נפגשים בנקודה M', LINES],
    // by role — the ring's diagonals, resolved with the figure
    ['האלכסונים נפגשים בנקודה M', SEGMENTS],
    ['האלכסונים נחתכים בנקודה M', SEGMENTS],
    ['אלכסוני המרובע נפגשים בנקודה M', SEGMENTS],
    ['אלכסוני המרובע ABCD נפגשים בנקודה M', SEGMENTS],
    ['the diagonals meet at M', SEGMENTS],
  ] as const)('«%s» draws %j and M at the crossing', (line, drawn) => {
    expect(play([QUAD, line])).toEqual({ last: 'record', faults: [], drawn, crossing: true });
  });

  it('a pair already drawn is not drawn twice, and the verb still records', () => {
    expect(play([QUAD, 'AC', 'AC ו-BD נפגשים בנקודה M'])).toEqual({ last: 'record', faults: [], drawn: SEGMENTS, crossing: true });
  });
});

describe('#1751 — the NOUN frame draws the point only: letters or role', () => {
  it.each([
    'M מפגש AC ו-BD',
    'M נקודת החיתוך של AC ו-BD',
    'M נקודת המפגש של AC ו-BD',
    'M היא נקודת החיתוך של AC ו-BD',
    'M נקודת החיתוך של AC עם BD',
    'M is the intersection of AC and BD',
    'M מפגש האלכסונים',
    'M נקודת החיתוך של האלכסונים',
    'M is the intersection of the diagonals',
  ])('«%s» builds M at the crossing, nothing else drawn', (line) => {
    expect(play([QUAD, line])).toEqual({ last: 'record', faults: [], drawn: [], crossing: true });
  });
});

describe('#1751 — what the rule does not reach', () => {
  it('a diagonal named by letters in a side is still refused (#1620), in the verb frame too', () => {
    expect(play([QUAD, 'האלכסונים AB ו-CD נפגשים בנקודה E']).last).toBe('refused:not-a-diagonal');
  });

  it('named lines (l1, l2) are drawn by their own statements: the verb adds nothing', () => {
    const named = ['נתון הישר l1: 2x-y+8=0', 'משוואת ישר l2 היא x+3y-10=0'];
    const verb = play([...named, 'הישרים l1 ו-l2 נפגשים בנקודה A']);
    const noun = play([...named, 'A נקודת החיתוך של הישר l1 עם הישר l2']);
    expect(verb.last).toBe('record');
    expect(verb.drawn).toEqual(noun.drawn);
  });
});
