/**
 * #1618 — THE SENTENCE FRAME (slice A of #1616): the exam's textbook wrapper is read once, at
 * `parseLine`, and every framed form lowers to the IDENTICAL facts its canonical sentence does.
 *
 * Also closes #1533 (the «נתון:» / «נתון כי» / "Given" prefixes), #1555 (the ∢ glyph), #1612 (the
 * origin) and #1239 (the shape noun after the letters), each of which was one member of this class.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';

/** The facts a line lowers to, without the provenance a rule may stamp on them. */
function factsOf(...lines: string[]): unknown[] {
  return lines.flatMap((l) => {
    const r = parseLine(l);
    if (!r.ok) throw new Error(`${l} → ${r.code}`);
    return r.facts.map((f) => {
      const { src: _src, ...rest } = f as { src?: string };
      return rest;
    });
  });
}

const same = (framed: string, ...canonical: string[]) => expect(factsOf(framed)).toEqual(factsOf(...canonical));

describe('#1618 — the given-prefix and the figure reference come off (#1533)', () => {
  it.each([
    ['נתון: K(1,2)', 'K(1,2)'],
    ['נתון כי K(1,2)', 'K(1,2)'],
    ['ידוע כי K(1,2)', 'K(1,2)'],
    ['עוד נתון: K(1,2)', 'K(1,2)'],
    ['נתון בנוסף: K(1,2)', 'K(1,2)'],
    ['וידוע כי AB = AE', 'AB = AE'],
    ['נתון כי מעגל K משיק לציר ה-x', 'מעגל K משיק לציר ה-x'],
    ['Given point A(2,6)', 'point A(2,6)'],
    ['given that AB = 5', 'AB = 5'],
    ['הנקודה C נמצאת על ציר ה-x (ראה ציור)', 'C על ציר ה-x'],
    ['הנקודה C נמצאת על ציר ה-x, כמתואר בסרטוט שלפניכם', 'C על ציר ה-x'],
    ['C is on the x-axis (see figure)', 'C על ציר ה-x'],
  ])('%s ≡ %s', (framed, canonical) => same(framed, canonical));
});

describe('#1618 — orthography: one spelling per symbol (#1555)', () => {
  it.each([
    ['∢A = ∢C', '∠A = ∠C'],
    ['∢ABC = ∢ADC', '∠ABC = ∠ADC'],
    ['A(2;10)', 'A(2,10)'],
    ['M(9, 10½)', 'M(9, 10.5)'],
    ['MO = 8 ס"מ', 'MO = 8'],
    ['הקודקוד B נמצא על ציר ה-y', 'B על ציר ה-y'],
    ['הקודקוד B מונח על ציר ה-y', 'B על ציר ה-y'],
  ])('%s ≡ %s', (framed, canonical) => same(framed, canonical));
});

describe('#1618 — the origin is the coordinate given P(0,0) (#1612)', () => {
  it.each([
    'O ראשית הצירים',
    'O – ראשית הצירים',
    'O - ראשית הצירים',
    'הנקודה O היא ראשית הצירים',
    'O היא ראשית הצירים',
    '(O היא ראשית הצירים)',
    'נקודה O בראשית הצירים',
    'O ראשית הצירים (כמתואר בציור)',
    'O is the origin',
  ])('%s ≡ O(0,0)', (framed) => same(framed, 'O(0,0)'));

  it('a sentence that USES the origin states the point first', () => {
    same('הצלע AB עוברת דרך ראשית הצירים, O', 'O(0,0)', 'הצלע AB עוברת דרך O');
  });

  it('naming the origin behaves exactly as P(0,0) when P already sits elsewhere', () => {
    const named = derive(['O(1,1)', 'O ראשית הצירים']).faults.map((f) => f.code);
    const coords = derive(['O(1,1)', 'O(0,0)']).faults.map((f) => f.code);
    expect(named).toEqual(coords);
    expect(named.length).toBeGreaterThan(0);
  });

  it('a refusal of a framed line quotes the line AS TYPED, never the canonical rewrite', () => {
    // The honesty invariant: an error names the STUDENT'S statement. Before the fix this quoted "O(0,0)".
    expect(derive(['O(1,1)', 'O ראשית הצירים']).faults.map((f) => f.detail)).toEqual(['O ראשית הצירים']);
  });
});

describe('#1618 — the shape frame: context, parenthetical givens, predicate (#1239)', () => {
  it.each([
    ['במלבן ABCD, הנקודה E נמצאת על הצלע DC', ['מלבן ABCD', 'E על הצלע DC']],
    ['במלבן ABCD', ['מלבן ABCD']],
    ['טרפז ישר זווית ABCD (AB ∥ CD, AB ⊥ AD)', ['טרפז ישר זווית ABCD', 'AB ∥ CD', 'AB ⊥ AD']],
    ['בטרפז ABCD (CD ∥ AB)', ['טרפז ABCD', 'CD ∥ AB']],
    ['בסרטוט שלפניכם טרפז ישר זווית ABCD (AB ∥ DC, ∢D = 90°)', ['טרפז ישר זווית ABCD', 'AB ∥ DC', '∠D = 90°']],
    ['המרובע ABCO הוא טרפז ישר זווית', ['טרפז ישר זווית ABCO']],
    ['ABC הוא משולש ישר זווית (AB ⊥ BC)', ['משולש ישר זווית ABC', 'AB ⊥ BC']],
    ['המשולש AOB הוא ישר זווית', ['משולש ישר זווית AOB']],
    ['משולש ABC הוא שווה שוקיים (CB = AB)', ['משולש שווה שוקיים ABC', 'CB = AB']],
    ['in rectangle ABCD, E is on DC', ['rectangle ABCD', 'E is on DC']],
  ])('%s', (framed, canonical) => same(framed, ...canonical));

  // #1239 — every shape noun after its letters, as the operator asked: "this is true for all shapes".
  it.each([
    ['ABC משולש', 'משולש ABC'],
    ['ABC הוא משולש', 'משולש ABC'],
    ['ABCD מלבן', 'מלבן ABCD'],
    ['ABCD ריבוע', 'ריבוע ABCD'],
    ['ABCD מקבילית', 'מקבילית ABCD'],
    ['ABCD טרפז', 'טרפז ABCD'],
    ['ABCD דלתון', 'דלתון ABCD'],
    ['ABCD מעוין', 'מעוין ABCD'],
    ['ABC triangle', 'משולש ABC'],
    ['ABC is a triangle', 'משולש ABC'],
    ['ABCD is a kite', 'דלתון ABCD'],
  ])('#1239 %s ≡ %s', (framed, canonical) => same(framed, canonical));
});

describe('#1618 — plural subjects and «בהתאמה»', () => {
  it.each([
    ['הנקודות A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה', ['A על ציר ה-x', 'B על ציר ה-y']],
    ['הקודקודים B ו-D נמצאים על ציר ה-x', ['B על ציר ה-x', 'D על ציר ה-x']],
    ['הנקודות A, B ו-C נמצאות על ציר ה-x', ['A על ציר ה-x', 'B על ציר ה-x', 'C על ציר ה-x']],
    ['משוואות הישרים AE ו-CF הן x = 4 ו-x = -4 בהתאמה', ['משוואת הישר AE היא x = 4', 'משוואת הישר CF היא x = -4']],
  ])('%s', (framed, canonical) => same(framed, ...canonical));

  it('a «בהתאמה» whose lists disagree in length is not guessed at', () => {
    expect(parseLine('הנקודות A, B ו-C נמצאות על ציר ה-x ועל ציר ה-y בהתאמה').ok).toBe(false);
  });
});

describe('#1618 — two givens on one line', () => {
  it.each([
    ['AB = 20, AC = 15', ['AB = 20', 'AC = 15']],
    ['B(1,14), MC = CB', ['B(1,14)', 'MC = CB']],
    ['A(6,6), AB = √40', ['A(6,6)', 'AB = √40']],
    ['MO = 8 ס"מ, ∢ACB = 72°', ['MO = 8', '∠ACB = 72°']],
    ['הנקודה D היא אמצע הצלע AB, והנקודה E היא אמצע הצלע BC', ['D אמצע AB', 'E אמצע BC']],
  ])('%s', (framed, canonical) => same(framed, ...canonical));

  it('a line is never half-accepted — one unreadable clause refuses the whole line', () => {
    expect(parseLine('AB = 20, פיל ורוד').ok).toBe(false);
  });

  it('a bare name is never split off its predicate', () => {
    // «A» alone parses as a free point; cutting it off would leave A unconstrained while B and C land.
    const r = parseLine('A, B ו-C נמצאות על ציר ה-x');
    if (r.ok) expect(r.facts.filter((f) => f.t === 'point' && f.id === 'A' && !('x' in f && f.x))).toHaveLength(0);
  });
});

describe('#1618 — sides as subjects', () => {
  it.each([
    // The side is drawn (#1639, ADR-AG-198): the sentence names it.
    ['האלכסון BD נמצא על ציר ה-x', ['B על ציר ה-x', 'D על ציר ה-x', 'הקטע BD']],
    ['הצלע AO נמצאת על ציר ה-x', ['A על ציר ה-x', 'O על ציר ה-x', 'הקטע AO']],
    // «הישרים» relates two LINES, and draws them (#1639).
    ['הישרים AB ו-CD שבציור מקבילים זה לזה', ['הישר AB ∥ הישר CD']],
    ['האלכסון AC מאונך לאלכסון BD', ['AC ⊥ BD']],
    ['הצלע AB של המלבן מקבילה לציר ה-x', ['הצלע AB מקבילה לציר ה-x']],
    ['משוואת שוק הטרפז AD היא y = -2x + 16', ['משוואת השוק AD היא y = -2x + 16']],
    ['הנקודה E(2,7) נמצאת על הצלע AB', ['E(2,7)', 'E על הצלע AB']],
    ['F נקודה שעבורה המרובע FBAD הוא מעוין', ['מעוין FBAD']],
  ])('%s', (framed, canonical) => same(framed, ...canonical));
});

describe('#1618 — a proof target is refused, never parsed (ruling 3 on #1616)', () => {
  it.each(['הוכיחו כי OB ⊥ AC', 'הוכיחו כי המשולשים OAK ו-ABK דומים', 'הראו כי AC ⊥ BD', 'נתון: הוכיחו כי AB = CD', 'prove that OB ⊥ AC', 'show that AB = CD'])(
    '%s → proof-target',
    (line) => {
      const r = parseLine(line);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('proof-target');
    },
  );

  it('«הראו כי …» is refused as a proof target, not taught as the imperative «הראו» ("show me")', () => {
    const v = decideSubmit('הראו כי AC ⊥ BD', ['A(0,0)', 'B(2,0)', 'C(2,2)', 'D(0,2)'], 0);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error.key).toBe('proof-target');
  });

  it('a construction imperative is NOT a proof target — it is a given the construction slice reads', () => {
    const r = parseLine('העבירו משיק למעגל בנקודה C');
    if (!r.ok) expect(r.code).not.toBe('proof-target');
  });
});

describe('#1618 — «טרפז ישר זווית» does not fix which leg is perpendicular (ADR-052)', () => {
  it('a right trapezoid with its right angles at B and C builds', () => {
    expect(derive(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)', 'D(1,3)']).faults).toEqual([]);
  });
  it('and so does one with its right angles at A and D', () => {
    expect(derive(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(3,3)', 'D(0,3)']).faults).toEqual([]);
  });
  it('a trapezoid with no right angle is still refused', () => {
    expect(derive(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(3,3)', 'D(1,3)']).faults.length).toBeGreaterThan(0);
  });
});

/**
 * The 471 questions this slice brings to fully-landing — each as the exam prints it, with its figure
 * checked against the geometry by hand (#1618 PR). Figure, not just acceptance: every listed point is
 * at the coordinates the givens force, and the figure is fully determined.
 *
 * 14/5 and 22/4 are NOT here although the frame reads every wrapper in them: each states a side by its
 * ROLE («היתר AC», «אורך השוק BC של הטרפז») — a claim that BC is a leg, AC the hypotenuse — and a role
 * noun is never silently reduced to «הצלע» (ADR-AG-119's boundary). Lowering the role to a constraint is
 * the construction slice's (#1620).
 */
describe('#1618 — the 471 questions the frame completes build their figure', () => {
  const CORPUS: Array<{ id: string; lines: string[] }> = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'),
  );
  const FIGURES: Record<string, Record<string, [number, number]>> = {
    '8/4': { A: [-2, 6], B: [6, 6], C: [4, 2], D: [-4, 2], E: [1, 4], F: [-3, 4] },
    '10/4': { A: [2.5, 0], B: [0, 5], C: [-2, 4], O: [0, 0] },
    // The printed figure (booklet p. 77): E right of A, D right of E — the position note picks it (#1706, ADR-AG-222).
    '11/4': { A: [-3, 0], B: [0, 4], C: [10, 4], D: [7, 0], E: [2, 0] },
    '12/4': { A: [0, 4], B: [3, -2], C: [7, 0], D: [4, 6], E: [2, 0] },
    '15/5': { A: [-2, -4], B: [2, 4], C: [10, 0], D: [6, -8], E: [0, -5], O: [0, 0] },
  };
  it.each(Object.keys(FIGURES))('%s', (id) => {
    const q = CORPUS.find((c) => c.id === id)!;
    const d = derive(q.lines);
    expect(d.faults).toEqual([]);
    expect(d.figure.carrierDof).toBe(0);
    for (const [p, [x, y]] of Object.entries(FIGURES[id])) {
      const at = d.figure.points.find((pt) => pt.id === p);
      expect(at, p).toBeDefined();
      expect(at!.x).toBeCloseTo(x, 4);
      expect(at!.y).toBeCloseTo(y, 4);
    }
  });
});

/**
 * #1626 — the operator's play of T1: «מרובע ABCO הוא טרפז ישר זוית» worked, the same sentence WITHOUT «הוא»
 * was refused. Hebrew drops the copula; with a subject noun present the predicate reads either way.
 */
describe('#1626 — the shape predicate does not need «הוא»', () => {
  it.each([
    ['מרובע ABCO טרפז ישר זוית', 'טרפז ישר זווית ABCO'],
    ['המרובע ABCO טרפז ישר זוית', 'טרפז ישר זווית ABCO'],
    ['משולש ABC ישר זווית', 'משולש ישר זווית ABC'],
    ['המרובע ABCD מלבן', 'מלבן ABCD'],
    ['המשולש ABC שווה שוקיים', 'משולש שווה שוקיים ABC'],
  ])('%s ≡ %s', (framed, canonical) => same(framed, canonical));

  it('an unknown predicate word still never reads as a shape', () => {
    expect(parseLine('משולש ABC פיל').ok).toBe(false);
  });
  it('without a subject noun an adjective has nothing to complete', () => {
    expect(parseLine('ABC ישר זווית').ok).toBe(false);
  });
});

/**
 * #1628 — the operator's play of T4: «הצלע AB עוברת דרך ראשית הצירים» (no letter) was not recognized. The
 * unnamed origin is the coordinate point (0,0), named O when that letter is free.
 */
describe('#1628 — the origin as an unnamed point', () => {
  it('the reported line builds, through (0,0), and the tool names the point O', () => {
    const d = derive(['ריבוע ABCD', 'הצלע AB עוברת דרך ראשית הצירים']);
    expect(d.faults).toEqual([]);
    expect(d.minted).toEqual([{ index: 1, id: 'O' }]);
    const o = d.figure.points.find((p) => p.id === 'O')!;
    expect([o.x, o.y]).toEqual([0, 0]);
  });
  it('it is the same figure as the named spelling', () => {
    const bare = derive(['ריבוע ABCD', 'הצלע AB עוברת דרך ראשית הצירים']);
    const named = derive(['ריבוע ABCD', 'הצלע AB עוברת דרך ראשית הצירים, O']);
    expect(bare.figure.points.map((p) => [p.id, p.x, p.y])).toEqual(named.figure.points.map((p) => [p.id, p.x, p.y]));
  });
  it('when O already names another point, the origin is never a second O', () => {
    const d = derive(['O(1,1)', 'ריבוע ABCD', 'הצלע AB עוברת דרך ראשית הצירים']);
    expect(d.faults).toEqual([]);
    expect(d.minted.map((m) => m.id)).toEqual(['P₁']);
  });
  it('«ראשית הצירים» alone states nothing', () => {
    expect(parseLine('ראשית הצירים').ok).toBe(false);
  });
});
