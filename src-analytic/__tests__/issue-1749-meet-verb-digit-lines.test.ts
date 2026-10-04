/**
 * #1749 (ADR-AG-235) — the meet VERB reads its operand phrase through the crossing's own reader.
 *
 * Operator, round #1736 play, T1: *"check also that «ישרים 1 ו- 2 נפגשים בנקודה A» works. It did for me but maybe
 * went to LLM before success"*. Measured on c098af9b: the verb frame split «ישרים 1 ו-2» at «ו-» and gave the plural
 * noun to the LEFT half only, so «2» reached the operand resolver bare — `not-handled`, the LLM's — while the noun
 * sentence «A מפגש הישרים 1 ו-2» (#1609) built. One reader (`distributedLines`) now serves both.
 *
 * Every lock CALLS the real submit decision and asserts the geometry: the two lines cross at (-2, 4).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

const DIGIT_LINES = ['נתון הישר 1: 2x-y+8=0', 'משוואת ישר 2 היא x+3y-10=0'];
const NAMED_LINES = ['נתון הישר l1: 2x-y+8=0', 'משוואת ישר l2 היא x+3y-10=0'];

/** Every step through `decideSubmit`, as `App.tsx` dispatches it; the last verdict and A's position. */
function play(steps: readonly string[]) {
  const lines: string[] = [];
  let last = '';
  for (const s of steps) {
    const v = decideSubmit(s, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    last = v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  }
  const d = derive(lines, 0);
  const a = d.figure.points.find((q) => q.id === 'A');
  return { last, faults: d.faults.map((f) => f.code), at: a ? [Number(a.x.toFixed(6)), Number(a.y.toFixed(6))] : null };
}

const BUILT = { last: 'record', faults: [], at: [-2, 4] };

describe('#1749 — the operator’s line, through the real submit decision', () => {
  it.each([
    'ישרים 1 ו- 2 נפגשים בנקודה A',
    'ישרים 1 ו-2 נפגשים בנקודה A',
    // the UI wraps a typed number in bidi isolates
    'ישרים ⁦1⁩ ו-⁦2⁩ נפגשים בנקודה A',
    'ישרים ⁦1⁩ ו- ⁦2⁩ נפגשים בנקודה A',
  ])('«%s» records, A at (-2, 4)', (line) => {
    expect(play([...DIGIT_LINES, line])).toEqual(BUILT);
  });
});

describe('#1749 — the grid: {ישרים, הישרים, הישר X והישר Y} × {1 ו-2, 1 ו- 2, l1 ו-l2} × {נפגשים, נחתכים}', () => {
  const NAMES: Array<[readonly string[], string, string, string]> = [
    [DIGIT_LINES, '1', '2', 'ו-'],
    [DIGIT_LINES, '1', '2', 'ו- '],
    [NAMED_LINES, 'l1', 'l2', 'ו-'],
  ];
  const SUBJECTS = [
    (a: string, b: string, j: string) => `ישרים ${a} ${j}${b}`,
    (a: string, b: string, j: string) => `הישרים ${a} ${j}${b}`,
    (a: string, b: string) => `הישר ${a} והישר ${b}`,
  ];
  for (const verb of ['נפגשים', 'נחתכים']) {
    for (const [prefix, a, b, j] of NAMES) {
      for (const subject of SUBJECTS) {
        const line = `${subject(a, b, j)} ${verb} בנקודה A`;
        it(`«${line}» records, A at (-2, 4)`, () => {
          expect(play([...prefix, line])).toEqual(BUILT);
        });
      }
    }
  }

  it.each(['the lines l1 and l2 meet at A', 'lines l1 and l2 intersect at A'])('English: "%s" records, A at (-2, 4)', (line) => {
    expect(play([...NAMED_LINES, line])).toEqual(BUILT);
  });
});

describe('#1749 — ONE reader: the verb lowers to exactly the noun sentence’s facts', () => {
  const strip = (r: ReturnType<typeof parseLine>) => (r.ok ? r.facts.map(({ src: _src, ...f }) => f) : r);
  it.each([
    ['ישרים 1 ו-2 נפגשים בנקודה A', 'A נקודת החיתוך של הישרים 1 ו-2'],
    ['הישרים 1 ו- 2 נחתכים בנקודה A', 'A מפגש הישרים 1 ו-2'],
    ['הישרים l1 ו-l2 נפגשים בנקודה A', 'A נקודת החיתוך של הישר l1 עם הישר l2'],
    ['the lines l1 and l2 meet at A', 'A is the intersection of lines l1 and l2'],
  ])('«%s» ≡ «%s»', (verb, noun) => {
    const v = parseLine(verb);
    expect(v.ok, JSON.stringify(v)).toBe(true);
    expect(strip(v)).toEqual(strip(parseLine(noun)));
  });

  it('a line not in the figure is still refused naming it, never silently built', () => {
    const r = play([...DIGIT_LINES, 'ישרים 1 ו-3 נפגשים בנקודה A']);
    expect(r.last).toMatch(/^refused:/);
    expect(r.at).toBeNull();
  });
});
