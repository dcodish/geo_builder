/**
 * #1849 ([ADR-AG-247](../../docs/06c-decisions-analytic.md#adr-ag-247); workspace ruling ADR-W-115) — GIVENS THAT
 * FORCE A DECLARED POLYGON FLAT ARE REFUSED, AND THE REFUSAL SAYS SO.
 *
 * Operator, 2026-10-07: *"refuse on all tools with a message since it contradicts ABC is a triangle and a flat line is
 * not a triangle"*. Analytic already refused «משולש ABC» · «AB = 5» · «BC = 3» · «AC = 8», but with the search's
 * words — «לא נמצאה תצורה שבה מתקיים: "AC = 8"» — which tells the student the tool missed, when the givens themselves
 * are what flatten the triangle. The refusal now names the completing statement, the polygon and the sentence that
 * declared it, and says why.
 *
 * Class: a set of givens that holds only on a COLLAPSED ring of a declared polygon was reported as a failed search
 * (free figure) or as a ring-order problem (pinned figure). Mechanism: the thin-ring arm (#1334, ADR-AG-143) already
 * proves "the givens hold, and the ring is flat" — it now records which ring (`Figure.collapsedRings`), and `derive`
 * reads that evidence over the window the configuration search already walked (`collapsedByGivens`).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { collapsedByGivens, evaluateStats } from '../engine/evaluate';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Type `lines` one by one at `seed`, as the app does; the verdict of the LAST line. */
function typed(lines: readonly string[], seed = 0) {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» at seed ${seed} is context and must record`).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return decideSubmit(lines[lines.length - 1], held, seed);
}

const SEEDS = [0, 1, 2, 3, 4, 5];

/** [the lines, the polygon, its declaring sentence]. The last line is the one that completes the collapse. */
const FAMILY: Array<[string, string[], string, string]> = [
  ['the operator’s 5-3-8', ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'], 'ABC', 'משולש ABC'],
  ['the same lengths, another order', ['משולש ABC', 'AC = 8', 'AB = 5', 'BC = 3'], 'ABC', 'משולש ABC'],
  ['3-5-8, the flat vertex elsewhere', ['משולש ABC', 'AB = 3', 'BC = 5', 'AC = 8'], 'ABC', 'משולש ABC'],
  ['4-4-8', ['משולש ABC', 'AB = 4', 'BC = 4', 'AC = 8'], 'ABC', 'משולש ABC'],
  ['a quadrilateral with B on its diagonal', ['מרובע ABCD', 'AB = 5', 'BC = 3', 'AC = 8'], 'ABCD', 'מרובע ABCD'],
  ['coordinates on one line, the triangle first', ['משולש ABC', 'A(0,0)', 'B(1,1)', 'C(2,2)'], 'ABC', 'משולש ABC'],
  ['coordinates on one line, the triangle last', ['A(0,0)', 'B(1,1)', 'C(2,2)', 'משולש ABC'], 'ABC', 'משולש ABC'],
  ['a pinned quadrilateral with a straight corner', ['מרובע ABCD', 'A(0,0)', 'B(1,0)', 'C(2,0)', 'D(0,3)'], 'ABCD', 'מרובע ABCD'],
  ['an incidence: a vertex on the opposite side', ['משולש ABC', 'B על הקטע AC'], 'ABC', 'משולש ABC'],
  ['an incidence: a vertex on the line through the others', ['משולש ABC', 'C על הישר AB'], 'ABC', 'משולש ABC'],
  ['a vertex as the midpoint of the other two', ['משולש ABC', 'B אמצע AC'], 'ABC', 'משולש ABC'],
  ['the English spelling', ['triangle ABC', 'AB = 5', 'BC = 3', 'AC = 8'], 'ABC', 'triangle ABC'],
];

describe('#1849 — the family is refused as a collapse, at every seed, naming both statements', () => {
  it.each(FAMILY)('%s', (_name, lines, polygon, declared) => {
    const last = lines[lines.length - 1];
    for (const seed of SEEDS) {
      const v = typed(lines, seed);
      expect(v.kind, `seed ${seed}`).toBe('refused');
      if (v.kind !== 'refused') continue;
      expect(v.error, `seed ${seed}`).toMatchObject({ key: 'polygon-collapsed', detail: last, polygon, declared });
    }
  });

  it('the message names the refused sentence, the polygon and its declaration, and says WHY — never the search’s words', () => {
    const v = typed(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    const h = errorText(v.error, he);
    expect(h).toContain('"AC = 8"');
    expect(h).toContain('ABC');
    expect(h).toContain('"משולש ABC"');
    expect(h).toContain('צורה שטוחה אינה משולש');
    expect(h).not.toContain('לא נמצאה תצורה');
    const e = errorText(v.error, en);
    expect(e).toContain('"AC = 8"');
    expect(e).toContain('a flat figure is not the triangle');
    expect(e).not.toContain('No configuration');
  });

  it('a quadrilateral says quadrilateral', () => {
    const v = typed(['מרובע ABCD', 'AB = 5', 'BC = 3', 'AC = 8']);
    expect(v.kind === 'refused' && errorText(v.error, he)).toContain('צורה שטוחה אינה מרובע');
    expect(v.kind === 'refused' && errorText(v.error, en)).toContain('not the quadrilateral');
  });

  it('a loaded list carries the refusal on the line that completed the collapse — never on an earlier, true one', () => {
    expect(derive(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']).faults).toEqual([
      { index: 3, code: 'polygon-collapsed', detail: 'AC = 8', polygon: 'ABC', shape: 'משולש', declared: 'משולש ABC' },
    ]);
    expect(derive(['משולש ABC', 'A(0,0)', 'B(1,1)', 'C(2,2)']).faults).toEqual([
      { index: 3, code: 'polygon-collapsed', detail: 'C(2,2)', polygon: 'ABC', shape: 'משולש', declared: 'משולש ABC' },
    ]);
  });
});

describe('#1849 — controls: what is not a collapse keeps its verdict', () => {
  it('a thin but real triangle builds at every seed (5, 3, 7.9)', () => {
    for (const seed of SEEDS) expect(typed(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9'], seed).kind, `seed ${seed}`).toBe('record');
  });

  it('a stated 3° apex builds', () => {
    for (const seed of SEEDS) expect(typed(['משולש ABC', 'זווית BAC = 3', 'AB = 5', 'AC = 5'], seed).kind, `seed ${seed}`).toBe('record');
  });

  it('a length that cannot hold even flat (5, 3, 8.1) is no collapse: the search’s words stand', () => {
    for (const seed of SEEDS) {
      const v = typed(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8.1'], seed);
      expect(v.kind === 'refused' && v.error.key, `seed ${seed}`).toBe('unsatisfiable');
    }
  });

  it('a ratio a flat figure meets only as 0 = 0 (D on BC, S_ABD = 2·S_ABC) is no collapse: the search’s words stand', () => {
    for (const s of ['S_{ABD} / S_{ABC} = 2', 'היחס בין שטח המשולש ABD לשטח המשולש ABC הוא 2:1']) {
      const v = typed(['משולש ABC', 'נקודה D על BC', s]);
      expect(v.kind === 'refused' && v.error.key, s).toBe('unsatisfiable');
    }
  });

  it('a pinned CROSSED quadrilateral is not flat: it keeps the ring-order message (ADR-AG-129)', () => {
    const v = typed(['מרובע ABCD', 'A(0,0)', 'B(1,0)', 'C(0,1)', 'D(1,1)']);
    expect(v.kind === 'refused' && v.error.key).toBe('ring-contradicts-noun');
  });
});

describe('#1849 — the evidence', () => {
  it('collapsedByGivens names the ring the givens flatten, and nothing when they cannot hold or do not flatten it', () => {
    const at = (lines: string[]) => collapsedByGivens(derive(lines).construction, 0);
    expect(at(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'])).toEqual(['poly-ABC']);
    expect(at(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8.1'])).toEqual([]);
    expect(at(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9'])).toEqual([]);
  });

  it('reading it costs no new solve: the configuration search already evaluated that window (ADR-AG-144)', () => {
    const d = derive(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'], 3);
    const before = evaluateStats.uncached;
    expect(collapsedByGivens(d.construction, 3)).toEqual(['poly-ABC']);
    expect(evaluateStats.uncached - before).toBe(0);
  });
});
