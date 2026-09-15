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

/**
 * The shape noun is OPTIONAL for an equation — 02c R6, ruled 2026-09-04, built by #1037.
 *
 * `y^2=54x` is the requirement's own example and it was `not-handled`: a ruled requirement nobody
 * implemented, not a missing capability. Everything it needs already existed — `conic.ts` fits six
 * coefficients and names the family — and the parser simply never asked.
 *
 * The cases that MUST NOT be swallowed carry the weight here. A branch matching anything with an
 * `=` would eat the metric givens and the component form, which is the `[IVX]` Roman-numeral defect
 * (ADR-AG-006) on a new letter. They are asserted directly because that is the failure mode.
 */
describe('#1037 — a bare equation builds, and eats nothing', () => {
  const outcome = (line: string, before: string[] = []): string => {
    const lines = [...before, line];
    const d = derive(lines, 0);
    const fault = d.faults.find((f) => f.index === before.length);
    if (fault) return fault.code;
    const curve = d.figure.curves[d.figure.curves.length - 1];
    return curve ? `built:${curve.curve.kind}` : 'built:nothing';
  };

  it('builds each family, with the kind coming from the FIT and no noun given', () => {
    expect(outcome('x-y+2=0')).toBe('built:line');
    expect(outcome('y=2x+1')).toBe('built:line');
    expect(outcome('x=15')).toBe('built:line'); // a vertical line: no y at all
    expect(outcome('4x+3y=0')).toBe('built:line');
    expect(outcome('(x-3)^2+(y-4)^2=9')).toBe('built:circle');
    expect(outcome('y^2=54x')).toBe('built:parabola');
    expect(outcome('x^2/9+y^2/16=1')).toBe('built:ellipse');
  });

  it('does NOT swallow a metric given or the component form — the failure mode', () => {
    /**
     * The invariant is that the bare-equation branch never reads these as CURVES. `AB = 4√5` parses
     * as an equation whose symbols are `A` and `B`, which are not the plane's, so the branch declines.
     *
     * **What "declining" leads to has changed, and that is the point of asserting the kind rather
     * than the code.** When #1037 shipped, nothing else could read a metric given either, so they all
     * answered `not-handled` — and this test said so, noting it was #1050's work. #1050 landed in
     * round #1061, so `AB = 4√5` is now a LENGTH constraint: on `A(0,0) B(4,3)` it is `unsatisfiable`,
     * because that distance is 5 and not 4√5. The bare-equation branch is still not the rule that
     * claimed it, which is what this case exists to prove.
     */
    const pts = ['A(0,0)', 'B(4,3)', 'C(1,1)'];
    for (const line of ['AB = 4√5', 'AB=10', 'AB+BC=10', 'AB = AC']) {
      expect(outcome(line, pts), line).not.toMatch(/^built:/);
    }
    // `x_A = 5` still parses as nothing at all — the component form (#1040) remains unbuilt.
    expect(outcome('x_A = 5', pts)).toBe('not-handled');
  });

  it('does not swallow a parameter pin either', () => {
    expect(outcome('a = 5')).toBe('not-handled');
    expect(outcome('k=3')).toBe('not-handled');
  });

  it('still refuses a bare hyperbola or rotated conic BY NAME, not by silence', () => {
    for (const line of ['xy=1', 'x^2-y^2=1', 'x^2+2xy+y^2=1']) {
      expect(outcome(line), line).toBe('out-of-scope');
    }
  });

  it('leaves every named form exactly as it was', () => {
    expect(outcome('נתון הישר l1: 4y-3x-20=0')).toBe('built:line');
    expect(outcome('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9')).toBe('built:circle');
    expect(outcome('נתונה פרבולה שמשוואתה y^2=54x')).toBe('built:parabola');
    expect(outcome('נתונה אליפסה שמשוואתה x^2/9+y^2/16=1')).toBe('built:ellipse');
  });

  it('reads the noun form and the bare form as ONE curve, not two', () => {
    // An anonymous curve's identity is its EQUATION, so both spellings mint `curve-<hash>` and the
    // second is absorbed. Without the shared namespace this change would have introduced a
    // duplicate: `line-anon…` beside `curve-anon…`, two rows for one line.
    const d = derive(['הישר x-y+2=0', 'x-y+2=0'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(1);
  });

  it('an unclaimed family does not CONTRADICT a claimed one', () => {
    // The restatement names no family because R6 says it need not; comparing `undefined` against
    // `'line'` would report the student's own restatement as a conflicting claim.
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', '(x-3)^2+(y-4)^2=9'], 0);
    expect(d.faults).toEqual([]);
  });

  it('a genuinely different equation under a NAMED id is still a conflict', () => {
    const d = derive(['הישר l1: y=x', 'הישר l1: y=2x'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['conflicting-restatement']);
  });
});

/**
 * #1072 — the NOUN is optional after «משוואת», and the NAME survives.
 *
 * 02c R6 ruled the shape noun optional for an equation. ADR-AG-019 built the half where the noun AND
 * the name are both dropped (a fully bare `y^2=54x`); the commoner half — the student keeps the name
 * they gave the object and drops only the noun — was never built, and the operator hit it immediately.
 *
 * The id is what these cases are really about: the noun-less form must mint EXACTLY the id the
 * noun-carrying form does, or the two phrasings become two objects for one line. That is ADR-AG-023's
 * duplication, and a name is an identity.
 */
describe('#1072 — «משוואת AB היא y=2x» is the same object as «משוואת הישר AB היא y=2x»', () => {
  const idOf = (line: string): string => {
    const r = parseLine(line);
    if (!r.ok) return `REFUSED(${r.code})`;
    const f = r.facts[0];
    return 'id' in f ? f.id : f.t;
  };

  it('accepts the noun-less form for every name shape', () => {
    expect(idOf('משוואת AB היא y=2x')).toBe('line-AB');
    expect(idOf('משוואת l1 היא y=2x')).toBe('line-l1');
    expect(idOf('משוואת I היא x^2+y^2=9')).toBe('circle-I');
  });

  it('accepts the colon form with the noun dropped', () => {
    expect(idOf('AB: y=2x')).toBe('line-AB');
    expect(idOf('l1: y=2x')).toBe('line-l1');
  });

  it('mints the SAME id as the noun-carrying form — the duplication guard', () => {
    expect(idOf('משוואת AB היא y=2x')).toBe(idOf('משוואת הישר AB היא y=2x'));
    expect(idOf('l1: y=2x')).toBe(idOf('נתון הישר l1: y=2x'));
    expect(idOf('משוואת I היא x^2+y^2=9')).toBe(idOf('משוואת מעגל I היא x^2+y^2=9'));
  });

  it('so stating a line BOTH ways leaves one object, not two', () => {
    for (const pair of [
      ['משוואת הישר AB היא y=2x', 'משוואת AB היא y=2x'],
      ['נתון הישר l1: y=2x', 'l1: y=2x'],
      ['משוואת מעגל I היא x^2+y^2=9', 'משוואת I היא x^2+y^2=9'],
    ]) {
      const d = derive(pair, 0);
      expect(d.faults, pair[1]).toEqual([]);
      expect(d.figure.curves, pair[1]).toHaveLength(1);
    }
  });

  it('swallows nothing that belongs to another rule', () => {
    // A two-point name is also a LENGTH (#1050) and a relation operand (#1052). The new branches
    // require «משוואת» or a colon, so neither of those sentences can reach them.
    const r1 = parseLine('AB = 10');
    expect(r1.ok && r1.facts[0].t).toBe('constraint');
    const r2 = parseLine('AB = AC');
    expect(r2.ok && r2.facts[0].t).toBe('constraint');
    const r3 = parseLine('x-y+2=0');
    expect(r3.ok && r3.facts[0].t).toBe('curve');
    const r4 = parseLine('משולש ABC');
    expect(r4.ok && r4.facts[0].t).toBe('polygon');
  });

  it('a two-point name still constrains its points — #1066 rides along', () => {
    const d = derive(['משוואת AB היא y=2x'], 0);
    expect(d.faults).toEqual([]);
    for (const id of ['A', 'B']) {
      const p = d.figure.points.find((q) => q.id === id)!;
      expect(Math.abs(p.y - 2 * p.x), id).toBeLessThan(1e-6);
    }
  });
});

/**
 * #1068 — maths has no words.
 *
 * A REGRESSION from ADR-AG-019 (#1037, round #1056), found by the operator two rounds later. The
 * bare-equation branch accepted a line when the parsed equation's symbols included `x` or `y`. That
 * discriminator is right about every input it was measured against — and it was measured against the
 * corpus of GIVENS, where every line is maths.
 *
 * `expr.ts` multiplies by juxtaposition, so every letter of an English sentence becomes a symbol.
 * «my answer = x» has symbols [a,e,m,n,r,s,w,x,y], contains `x`, passed, and **drew a line**.
 *
 * The lesson is sharper than "measure it": a discriminator measured only against the inputs it was
 * designed for has not been measured.
 */
describe('#1068 — English prose containing = is not an equation', () => {
  const kindOf = (line: string): string => {
    const r = parseLine(line);
    return r.ok ? `ok:${r.facts[0].t}` : r.code;
  };

  it('declines prose rather than drawing it', () => {
    /**
     * **Three of this case's original five lines have since become legitimate sentences**, and that is
     * the right outcome rather than a regression. «P is on the line y=x» was prose only because
     * nothing could read it; #1069 built the point-on-object rule, so it now says what it means.
     *
     * What #1068 protects is narrower and still holds: the BARE-EQUATION branch must never turn an
     * English sentence into a curve. The lines below have no rule that claims them, and they must stay
     * unclaimed — `not-handled` reaches the LLM seam, which is what that seam is for.
     */
    for (const line of ['my answer = x', 'the answer is y = 2x', 'x and y are equal']) {
      expect(kindOf(line), line).toBe('not-handled');
    }
    // And the three that flipped are now a POINT ON A LINE, not a curve minted out of prose.
    for (const line of ['P is on the line y=x', 'the point P is on the line y=x', 'P lies on y=x']) {
      expect(kindOf(line), line).toBe('ok:curve'); // the line object, followed by the incidence
    }
  });

  it('still builds every bare equation — including spaced ones and juxtaposed parameters', () => {
    for (const line of [
      'x-y+2=0',
      'y^2=54x',
      '(x-3)^2+(y-4)^2=9',
      'x^2/9+y^2/16=1',
      'x=15',
      '4x+3y=0',
      'y=-2x+8',
      'x - y + 2 = 0',
      'x^2+y^2-2ax-2x=0',
    ]) {
      expect(kindOf(line), line).toBe('ok:curve');
    }
  });

  it('the word test is SPACE-DELIMITED, so juxtaposed parameters stay legal', () => {
    // `2abc` is three parameters multiplied, not a word — it is not space-delimited. A test on any
    // 3-letter run would have refused it, which is why the boundary matters.
    expect(kindOf('x^2+y^2-2abc=0')).toBe('ok:curve');
  });

  it('`sqrt` cannot be mistaken for a word — normalizeMath runs first', () => {
    // It becomes `√` before the guard ever sees it. This is the one legitimate multi-letter token in
    // the grammar, and the reason the guard is applied to the NORMALIZED text.
    expect(kindOf('y=sqrt 4x')).toBe('ok:curve');
  });
});
