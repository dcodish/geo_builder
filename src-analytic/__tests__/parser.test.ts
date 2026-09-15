/**
 * The parser's contract, and the catalog's guard.
 *
 * The guard is the important half: `catalogAnalytic.ts` is simultaneously the reference, the
 * coverage map and the LLM's allowed vocabulary (ADR-AG-005 D8), so an entry that stops parsing
 * must fail the suite rather than quietly become documentation — and the model must never be
 * taught to emit a line the re-parse would refuse.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { parseLine } from '../parser/parseAnalytic';
import { fold } from '../engine/apply';
import { evaluate } from '../engine/evaluate';
import { derive } from '../engine/derive';

describe('catalog — every entry parses, in BOTH languages', () => {
  for (const entry of COMMAND_CATALOG_ANALYTIC) {
    it(`${entry.family} · ${entry.he}`, () => {
      const he = parseLine(entry.he);
      const en = parseLine(entry.en);
      expect(he.ok, `He did not parse: ${entry.he}`).toBe(true);
      expect(en.ok, `En did not parse: ${entry.en}`).toBe(true);
      if (he.ok && en.ok) {
        // The two languages must lower to the SAME fact kinds — a catalog row whose halves mean
        // different things is a drift the panel would advertise as one command.
        expect(he.facts.map((f) => f.t)).toEqual(en.facts.map((f) => f.t));
      }
    });
  }
});

/**
 * The catalog's SECOND half, added by #1014.
 *
 * Parsing was the only thing asserted above, and that is exactly how `נתונה פרבולה שמשוואתה y^2=2ax`
 * shipped on the reference card while producing an empty figure: it parsed perfectly, the undeclared
 * `a` was never registered, and the curve drew nothing and said nothing. A catalog entry is a promise
 * to the student — it is what the commands panel offers and the only vocabulary the LLM may emit — so
 * "it parses" is not enough. Every entry must reach the canvas or name a refusal.
 */
describe('catalog — every entry PRODUCES something, or says why not', () => {
  for (const entry of COMMAND_CATALOG_ANALYTIC) {
    it(`${entry.family} · ${entry.he}`, () => {
      // An entry that declares context is built IN that context — «M אמצע AB» is meaningless
      // without A and B, and failing it for that would be the guard reporting a defect that is not
      // one. The context is part of the entry, so it is declared rather than guessed here.
      const d = derive([...(entry.needs ?? []), entry.he]);
      // A declaration legitimately draws nothing: «a הוא פרמטר חיובי» states a domain, not an
      // object. It is the one category exempt, and it is exempt by its own field rather than by a
      // list of sentences that would drift.
      if (entry.category === 'parameters') {
        expect(d.faults, `a declaration must not fault: ${entry.he}`).toEqual([]);
        return;
      }
      const drawn = d.figure.points.length + d.figure.curves.length;
      expect(
        drawn > 0 || d.faults.length > 0,
        `drew nothing and said nothing: ${entry.he}`,
      ).toBe(true);
      // And for a catalog entry specifically, drawing is the expected outcome — a reference card
      // that offers the student a line which only ever refuses is a different defect.
      expect(d.faults, `a catalog entry must not fault: ${entry.he}`).toEqual([]);
      expect(drawn, `a catalog entry must draw: ${entry.he}`).toBeGreaterThan(0);
    });
  }
});

describe('parser — the corpus phrasings', () => {
  it('reads a point with and without its subject noun', () => {
    for (const s of ['נתונה הנקודה A(2,6)', 'הנקודה A(2,6)', 'נקודה A(2,6)', 'A(2,6)']) {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
      if (r.ok) {
        expect(r.facts).toHaveLength(1);
        expect(r.facts[0].t).toBe('point');
      }
    }
  });

  it('reads several points from one line, the way the exam lists them', () => {
    const r = parseLine('נתונות הנקודות A(0,24), B(18,0)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts.map((f) => (f.t === 'point' ? f.id : ''))).toEqual(['A', 'B']);
  });

  it('reads a parameter inside a coordinate', () => {
    const r = parseLine('A(-9a,0)');
    expect(r.ok).toBe(true);
  });

  it('reads a line named ℓ1 — typed, and in its typeset form', () => {
    for (const s of ['נתון הישר l1: 4y-3x-20=0', 'נתון הישר ℓ1: 4y-3x-20=0']) {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
      if (r.ok && r.facts[0].t === 'curve') expect(r.facts[0].curve.kind).toBe('line');
    }
  });

  it('reads a vertical line and a diagonal one', () => {
    for (const s of ['הישר x=-4', 'הישר y=x']) {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
    }
  });

  it('names circles by their Roman numeral, the corpus s own device', () => {
    const one = parseLine('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9');
    const two = parseLine('נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1');
    expect(one.ok && two.ok).toBe(true);
    if (one.ok && two.ok) {
      expect(one.facts[0].t === 'curve' && one.facts[0].id).toBe('circle-I');
      expect(two.facts[0].t === 'curve' && two.facts[0].id).toBe('circle-II');
    }
  });

  it('gives an unnamed object an id derived from its own equation, so restating it is idempotent', () => {
    const a = parseLine('הישר y=2x+1');
    const b = parseLine('הישר y = 2x + 1');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok && a.facts[0].t === 'curve' && b.facts[0].t === 'curve') {
      expect(a.facts[0].id).toBe(b.facts[0].id);
    }
  });

  it('returns not-handled for input no rule matched — the LLM escalation seam', () => {
    const r = parseLine('משהו שאף כלל לא מכיר');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-handled');
  });

  it('refuses a matched sentence whose equation is malformed, rather than dropping it', () => {
    const r = parseLine('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad-equation');
  });

  it('does not half-read a point line that says more than it can lower', () => {
    const r = parseLine('נתונה הנקודה A(2,6) הנמצאת על האליפסה');
    expect(r.ok).toBe(false); // F2 incidence is a later family — never a silent drop of the rest
  });
});

describe('end to end — a figure builds from typed lines', () => {
  it('draws two circles and a line together', () => {
    const src = [
      'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
      'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1',
      'נתון הישר l1: y=x',
      'A(2,6)',
    ];
    const facts = src.flatMap((s) => {
      const r = parseLine(s);
      if (!r.ok) throw new Error(`${s}: ${r.code}`);
      return r.facts;
    });
    const { construction, errors } = fold(facts);
    expect(errors.every((e) => e === null)).toBe(true);
    const fig = evaluate(construction, 0);
    expect(fig.curves).toHaveLength(3);
    expect(fig.points).toHaveLength(1);
    expect(fig.vacant).toEqual([]);
    const circle = fig.curves.find((c) => c.id === 'circle-I');
    expect(circle?.curve.kind).toBe('circle');
    if (circle?.curve.kind === 'circle') expect(circle.curve.r).toBeCloseTo(3, 9);
  });
});

/**
 * The OWNED refusals — #1039, #1042, #1046 (round #1056).
 *
 * The class these three share: a rule recognised its own sentence, found something wrong with it,
 * and then answered as though it had never seen it. `null` from a rule means `not-handled` — "I did
 * not understand you" — which is false about a sentence the rule clearly matched, and which routes
 * a well-formed statement to the LLM seam instead of answering it. Worse, in two of these cases the
 * rule did not refuse at all: it built a figure that contradicted the student's own words.
 *
 * Each case below asserts the CODE, not merely "not ok": the whole defect was that the wrong code
 * was reported, so a test that accepts any refusal would have passed before the fix.
 */
describe('a rule that matched owes an answer about what it matched', () => {
  const codeOf = (line: string, before: string[] = []): string => {
    const d = derive([...before, line], 0);
    const fault = d.faults.find((f) => f.index === before.length);
    return fault ? fault.code : 'BUILT';
  };

  describe('#1039 — x and y name the plane, not a point’s unknown', () => {
    it('refuses a coordinate written in y, naming the statement', () => {
      expect(codeOf('M(3,y)')).toBe('reserved-coordinate');
    });

    it('refuses it in the x slot too — the defect is the symbol, not the position', () => {
      expect(codeOf('M(x,3)')).toBe('reserved-coordinate');
    });

    it('was a SILENT drop before: the point committed and was vacant at every configuration', () => {
      // The regression this locks. `RESERVED_SYMBOLS` filtered `y` out of the free register, so
      // nothing ever sampled it: the line was accepted, drew nothing, and said nothing.
      const d = derive(['M(3,y)'], 0);
      expect(d.figure.points).toHaveLength(0);
      expect(d.faults).toHaveLength(1); // ← was 0
    });

    it('still accepts an ordinary unknown, which is the supported form the message names', () => {
      expect(codeOf('M(3,t)')).toBe('BUILT');
      expect(codeOf('A(-9a,0)')).toBe('BUILT'); // the catalog's own parameterised point
    });
  });

  describe('#1042 — a shape noun asserts a vertex count', () => {
    it('refuses a triangle with four vertices', () => {
      expect(codeOf('משולש ABCD')).toBe('bad-arity');
      expect(codeOf('triangle ABCD')).toBe('bad-arity');
    });

    it('refuses a quadrilateral with three', () => {
      expect(codeOf('מרובע ABC')).toBe('bad-arity');
    });

    it('refuses a repeated label — two vertices cannot share a name', () => {
      expect(codeOf('משולש ABA')).toBe('repeated-vertex');
      expect(codeOf('הקטע AA')).toBe('repeated-vertex');
    });

    const TRI = ['A(0,0)', 'B(6,0)', 'C(0,6)'];

    it('refuses a construct whose vertex count contradicts the construct itself', () => {
      // A centroid takes three vertices; naming four is not a reason to read the first three.
      expect(codeOf('M מפגש התיכונים במשולש ABCD', [...TRI, 'D(1,1)'])).toBe('bad-arity');
      expect(codeOf('G מפגש האלכסונים במרובע ABC', TRI)).toBe('bad-arity');
    });

    it('refuses a construct whose NOUN contradicts the construct — the silent half', () => {
      // «מפגש התיכונים במרובע ABC» BUILT a centroid before the fix: the noun was skipped by the
      // regex, so the student's own word «מרובע» was ignored rather than answered. This is the
      // case that was not merely mis-coded but wrong on the canvas.
      expect(codeOf('M מפגש התיכונים במרובע ABC', TRI)).toBe('bad-arity');
    });

    it('refuses an area given over too few vertices — the same class, a different rule', () => {
      expect(codeOf('שטח המשולש AB הוא 7')).toBe('bad-arity');
    });

    it('still builds every shape the catalog teaches', () => {
      expect(codeOf('משולש ABC')).toBe('BUILT');
      expect(codeOf('מרובע ABCD')).toBe('BUILT');
      expect(codeOf('M מפגש התיכונים במשולש ABC', TRI)).toBe('BUILT');
      expect(codeOf('M אמצע AB', TRI)).toBe('BUILT');
    });
  });

  describe('#1046 — a clash says WHAT the name already holds', () => {
    const TRI = ['A(0,0)', 'B(6,0)', 'C(0,6)'];

    it('carries the existing construct so the message can name it', () => {
      const d = derive([...TRI, 'M מפגש התיכונים במשולש ABC', 'M(3,c)'], 0);
      const fault = d.faults.find((f) => f.index === 4);
      expect(fault?.code).toBe('name-kind-clash');
      // ← the whole fix: before this the refusal said only "that name belongs to another kind",
      // which blames the student's choice of letter for a collision they cannot see.
      expect(fault?.existing).toBe('derived:centroid');
    });

    it('names the kind in the other direction too', () => {
      const d = derive([...TRI, 'M(3,c)', 'M מפגש התיכונים במשולש ABC'], 0);
      expect(d.faults.find((f) => f.index === 4)?.existing).toBe('point');
    });
  });
});
