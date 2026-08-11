/**
 * The data-panel QUERY lane (ADR-3D-057, issue #274). A query is a QUESTION about the figure — never a
 * fact: it never enters replay, never moves a point. And it is answered ONLY when its value is genuinely
 * knowledge (the student's own «only if stable»): scale-free quantities (angles) whenever the shape is
 * determined; unit-carrying quantities (dot/length/area/volume) only when the scale is pinned — except
 * the scale-invariant value ~0 (a perpendicular dot). Everything else reports WHY, never a sampled number.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { dataView } from '../engine/dataView';
import { serializeFigure3, deserializeFigure3 } from '../store/figureFile3';
import { parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, queries: [], lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const build = (steps: string[]) => {
  reset();
  for (const u of steps) submit(u);
  const st = useGeo3.getState();
  return { c: derive3(st.facts, st.seed).construction, seed: st.seed };
};
const ans = (steps: string[], q: string) => {
  const { c, seed } = build(steps);
  return answerQuery(c, q, seed);
};

// a right triangular prism with the base legs pinned (|u|=3, |v|=4, ∠CAB=90) — scale is pinned
const PRISM = ['מנסרה משולשת ישרה', 'זוית CAB=90', 'AB=u', 'AC=v', "AA'=w", '|u|=3', '|v|=4'];

describe('ADR-3D-057 — the query lane answers only genuine knowledge', () => {
  beforeEach(reset);

  describe('answered', () => {
    it('a perpendicular dot product is 0 (scale-invariant, so answered even before scale is pinned)', () => {
      expect(ans(['קובייה', "AB=u", "AD=v"], 'u·v').answer).toBe('0');
    });
    it('a stated length, with scale pinned', () => {
      expect(ans(PRISM, '|u|').answer).toBe('3');
    });
    it('a derived length forced by the givens', () => {
      // |BC| = 5 (3-4-5 right triangle), scale pinned
      expect(ans(PRISM, '|BC|').answer).toBe('5');
    });
    it('an angle — scale-free, answered whenever the shape is determined', () => {
      expect(ans(PRISM, '∠CAB').answer).toBe('90°');
      expect(ans(PRISM, '∠(u,v)').answer).toBe('90°');
    });
    it('a triangle area, scale pinned', () => {
      expect(ans(PRISM, 'area ABC').answer).toBe('6'); // ½·3·4
      expect(ans(PRISM, 'שטח ABC').answer).toBe('6');
    });
    it('the En «dot» word and point-pair operands', () => {
      expect(ans(PRISM, 'u dot v').answer).toBe('0');
      expect(ans(PRISM, 'AB·AC').answer).toBe('0');
    });
    it('a solid volume, with the box dims pinned', () => {
      expect(ans(["תיבה ABCDA'B'C'D'", '|AB|=2', '|AD|=3', "|AA'|=4"], "volume ABCDA'B'C'D'").answer).toBe('24');
    });
  });

  describe('a bare pair is the VECTOR, not the length (the operator asked for «AE»)', () => {
    // the 2020-ב exam figure — fully determined, with an injected frame
    const EXAM = [
      'פירמידה ABCDS שבסיסה ריבוע',
      'המקצוע AS הוא גובה בפירמידה',
      'אורך המקצוע AS שווה לאורך צלע הריבוע ABCD',
      'SE = 3/4 SD',
      'נסמן: AD = u, AB = v, AS = w',
      'SN = k·SC',
      '|EN| = (√6/4)·|w|',
      'נתון: A(0,0,0), B(0,12,0)',
      'הקודקוד D נמצא על החלק החיובי של ציר ה-x',
      'S נמצא על החלק החיובי של ציר ה-z',
    ];
    it('a bare pair shows the u/v/w decomposition AND the coordinates', () => {
      expect(ans(EXAM, 'EN').answer).toBe('−1/4·u + 1/2·v + 1/4·w  =  (-3, 6, 3)');
    });
    it('a declared vector shows itself + its coordinates', () => {
      expect(ans(EXAM, 'w').answer).toBe('w  =  (0, 0, 12)');
    });
    it('the BARS still mean length — |EN| is a number, EN is the vector', () => {
      const len = ans(EXAM, '|EN|');
      const vec = ans(EXAM, 'EN');
      expect(len.answer).not.toContain('·'); // a scalar, no basis terms
      expect(vec.answer).toContain('u'); // the vector, decomposed
    });
    it('a parameter-dependent vector shows its PARAMETRIC form (#297), never a sampled decomposition', () => {
      // a bare pyramid: E on AS with parameter t and a free apex. The NUMERIC decomposition roams
      // (t varies), so it is never shown as a sample — but AE = t·w is the stable parametric form.
      expect(ans(['פירמידה ABCDS שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS'], 'AE').answer).toBe('t·w');
    });
  });

  describe('a free PARAMETER «t» from «AE=t·AS» — its value, when determined (operator follow-up)', () => {
    it("the operator's figure: t's VALUE is «not determined», but the vector AE shows its parametric form t·w (#297)", () => {
      // measured across seeds: t ranges ~0.19–0.38, so its VALUE is genuinely not a single number — but
      // the VECTOR AE = t·w is stable knowledge (the parametric form), so it is surfaced (query ⇄ panel)
      const fig = ['פירמידה שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS', 'O מפגש אלכסונים בריבוע', 'OE', 'OE אנך ל AS'];
      expect(ans(fig, 't')).toMatchObject({ answer: null, note: 'undetermined' });
      expect(ans(fig, 'AE').answer).toBe('t·w');
    });
    it('a DETERMINED figure: t resolves to its value, and AE decomposes with it', () => {
      const box = ["תיבה ABCDA'B'C'D'", '|AB|=3', '|AD|=4', "|AA'|=5", 'AB=v', 'AD=u', "AA'=w", "AE=t*AC'", "BE⊥AC'"];
      const t = ans(box, 't');
      expect(t.answer, 't resolves once the figure is determined').not.toBeNull();
      expect(Number(t.answer)).toBeGreaterThan(0);
      expect(ans(box, 'AE').answer, 'AE decomposes with the known t').toContain('·');
    });
    it('a parameter is scale-invariant — no size needs pinning for t to answer', () => {
      // t is an affine ratio along AS; it never carries units, so it is answered on stability alone
      const box = ["תיבה ABCDA'B'C'D'", '|AB|=3', '|AD|=4', "|AA'|=5", "AE=t*AC'", "BE⊥AC'"];
      expect(ans(box, 't').answer).not.toBeNull();
    });
  });

  describe('«depends on α» — a reason, not a wall (the bagrut Q2 figure)', () => {
    // the operator's exact figure: t = ⅔cosα, so t / AE / w·v / EO all vary WITH α (the book's answer).
    // The tool never SOLVES the relation (t = ⅔cosα needs CAS) — it only NAMES the dependency.
    const Q2 = [
      'פירמידה שבסיסה ריבוע', 'BD', 'AC', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS',
      'מפגש אלכסונים בריבוע O', 'OE', 'OE אנך ל AS', '∠SAD=α', '∠SAB=α', '60<α<90', '|w|=3', '|u|=2',
    ];
    it('t reports «depends on α», naming the free parameter it is a function of', () => {
      expect(ans(Q2, 't')).toMatchObject({ answer: null, note: 'depends', param: 'α' });
    });
    it('the vector AE shows its parametric form t·w (#297); the dot w·v still depends on α', () => {
      expect(ans(Q2, 'AE').answer).toBe('t·w'); // the parametric form — more informative than «depends on α»
      expect(ans(Q2, 'w·v')).toMatchObject({ note: 'depends', param: 'α' }); // a dot carries no parameter form
    });
    it('a pinned magnitude stays a clean value — |w| = 3', () => {
      expect(ans(Q2, '|w|').answer).toBe('3');
    });
    it('an under-determined figure with NO named parameter stays plain «not determined» (never a false «depends»)', () => {
      const noParam = ['פירמידה ABCDS שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS'];
      expect(ans(noParam, 't')).toMatchObject({ answer: null, note: 'undetermined' });
      expect(ans(noParam, 't').param).toBeUndefined();
    });
  });

  describe('honestly refused — never a sampled number', () => {
    it('a length whose scale is free reports «depends on scale»', () => {
      expect(ans(['פירמידה ABCDS שבסיסה ריבוע'], '|AB|')).toMatchObject({ answer: null, note: 'scale' });
    });
    it('a NON-zero dot with free scale is gauge — refused', () => {
      // a cube's edge · base-diagonal = |AB||AC|cos45 = 1·√2·cos45 = 1 at the frozen gauge — that IS gauge
      expect(ans(["קובייה ABCDA'B'C'D'"], 'AB·AC').note).toBe('scale');
    });
    it('a bounded angle labelled α reports «depends on α» — it IS the free parameter', () => {
      expect(ans(['פירמידה ABCDS שבסיסה ריבוע', '∠SAB=α', '60<α<90'], '∠SAB')).toMatchObject({ answer: null, note: 'depends', param: 'α' });
    });
    it('a query naming points not in the figure', () => {
      expect(ans(PRISM, '|XY|').note).toBe('unavailable');
    });
    it('gibberish is «not recognised»', () => {
      expect(ans(PRISM, 'hello world').note).toBe('notUnderstood');
    });
  });

  describe('a query is a QUESTION, not a fact', () => {
    it('adding a query never touches the fact list or the figure', () => {
      build(PRISM);
      const before = useGeo3.getState().facts.length;
      useGeo3.getState().addQuery('u·v');
      expect(useGeo3.getState().facts.length, 'no fact added').toBe(before);
      expect(useGeo3.getState().queries).toEqual(['u·v']);
    });
    it('duplicates are dropped; blanks ignored', () => {
      reset();
      useGeo3.getState().addQuery('u·v');
      useGeo3.getState().addQuery('u·v');
      useGeo3.getState().addQuery('   ');
      expect(useGeo3.getState().queries).toEqual(['u·v']);
    });
    it('removeQuery drops the right one', () => {
      reset();
      ['a', 'b', 'c'].forEach((q) => useGeo3.getState().addQuery(q));
      useGeo3.getState().removeQuery(1);
      expect(useGeo3.getState().queries).toEqual(['a', 'c']);
    });
  });

  describe('queries persist with the figure file', () => {
    // a figure whose commands are all save-whitelisted (a solid + a named vector)
    const SAVEABLE = ["קובייה ABCDA'B'C'D'", 'AB=u'];
    it('save → load round-trips the query list', () => {
      build(SAVEABLE);
      const facts = useGeo3.getState().facts;
      const json = serializeFigure3(facts, 0, 'q-test', ['u·v', '|u|', '∠CAB']);
      const r = deserializeFigure3(json);
      expect(r.ok && r.queries).toEqual(['u·v', '|u|', '∠CAB']);
    });
    it('an old file with no queries loads with an empty list (never a bad-file)', () => {
      build(SAVEABLE);
      const json = serializeFigure3(useGeo3.getState().facts, 0, 'no-q');
      expect(JSON.parse(json).queries).toBeUndefined(); // omitted when empty
      const r = deserializeFigure3(json);
      expect(r.ok && r.queries).toEqual([]);
    });

    // ADR-3D-057 drift guard: the save whitelist had lost 23 command types, so figures using them
    // (⊥, |u|=3, circles, diagonals…) silently failed to reload. Every command the catalog can produce
    // must round-trip through save→load, so the whitelist can never drift behind the parser again.
    it('every cataloged utterance saves and reloads (no whitelist drift)', () => {
      for (const e of COMMAND_CATALOG_3D) {
        for (const utter of [e.he, e.en]) {
          const r = parse3(utter);
          if (!r.ok) continue;
          const json = serializeFigure3([{ id: 'x', utterance: utter, cmds: r.commands, enabled: true }], 0);
          const loaded = deserializeFigure3(json);
          expect(loaded.ok, `"${utter}" → [${r.commands.map((c) => c.type).join(', ')}] must reload`).toBe(true);
        }
      }
    });
  });
});

// #297 — a bare vector query for a DRIVEN-parameter vector shows the PARAMETRIC form, matching the data
// panel exactly (the query lane and the panel now share `parametricDecomp`). The operator's «AE» used to
// fall through to «depends on α»/«not determined»; it should read `t·w`.
describe('#297 — parametric vector queries (shared with the data panel)', () => {
  beforeEach(reset);
  const DD = ['פירמידה שבסיסה ריבוע', 'אלכסוני הריבוע נחתכים בנקודה O', 'AD=u', 'AB=v', 'AS=w', 'AE=t*AS', 'EO', '∠SAD=∠SAB=α', '60<α<90', 'EO⊥AS'];
  it('AE = t·w and EO = ½u + ½v − t·w (not «depends on α»)', () => {
    expect(ans(DD, 'AE').answer).toBe('t·w');
    expect(ans(DD, 'EO').answer).toBe('1/2·u + 1/2·v − t·w');
  });
});

/**
 * #480 — the algebraic lane's parameter is a symbol like any other. Three symbol kinds live in three
 * fields (`vecDefs.symbol`, the pivot's pin symbols, `c.param`) and each surface used to consult a
 * different subset, so the operator's «m» answered «לא זוהה» while the engine held ±√2.
 */
describe('#480 — the figure parameter is askable, and answers its BRANCH SET', () => {
  beforeEach(reset);

  const OPERATOR = [
    'הישר ℓ: x = (1,2,3) + t(m-2, m, m+2)',
    'המישור π1: x + (m-2)y + (m-1)z - 5 = 0',
    'הישר ℓ מקביל למישור π1', // dir·n = 2m² − 4 ⇒ m = ±√2
  ];

  it("the operator's question: «m» answers ±√2, not a decimal and not «not understood»", () => {
    const r = ans(OPERATOR, 'm');
    expect(r.note, 'it is understood now').toBeUndefined();
    expect(r.answer, 'the solution SET, in the form the exam wants').toBe('±√2');
  });

  it('a SINGLE root answers as a plain value', () => {
    const r = ans(['הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)', 'המישור π: 3x + my + (m+6)z + 4 = 0', 'הישר ℓ ניצב למישור π'], 'm');
    expect(r.answer, 'm = -5, the book answer').toBe('-5');
  });

  it('an UNPINNED parameter is honestly undetermined — never the sampled value', () => {
    const r = ans(['הישר ℓ: x = (1,2,3) + t(m-2, m, m+2)'], 'm');
    expect(r).toMatchObject({ answer: null, note: 'undetermined' });
  });

  it('the letter must be a symbol OF THIS FIGURE — a stray letter is still not understood', () => {
    expect(ans(OPERATOR, 'q')).toMatchObject({ answer: null, note: 'notUnderstood' });
  });

  it('the data panel and the query lane agree — one formatter, no drift', () => {
    const { c, seed } = build(OPERATOR);
    const row = dataView(c, seed).params.find((p) => p.sym === 'm');
    expect(row, 'the panel lists the parameter at all').toBeDefined();
    expect(row!.open).toBe(false);
    expect(row!.text).toBe('m = ±√2');
    expect(row!.text).toBe(`m = ${answerQuery(c, 'm', seed).answer}`);
  });

  it('an unpinned parameter reads OPEN in the panel, like a pin symbol does', () => {
    const { c, seed } = build(['הישר ℓ: x = (1,2,3) + t(m-2, m, m+2)']);
    const row = dataView(c, seed).params.find((p) => p.sym === 'm');
    expect(row).toMatchObject({ text: 'm = ?', open: true });
  });
});

// #517 — the query lane's frame/scale gates must SEE bare coordinate points (they land in `c.points`
// as kind 'coord', never in a pin list; the private enumerations here refused «CB» and «|CB|» on two
// fully pinned points — operator, 2026-08-11). Shared predicates now: vectorFramePinned3/scaleKnown3.
describe('#517 — bare injected points are a frame for the query lane', () => {
  beforeEach(reset);

  it('the vector between two injected points answers in coordinates', () => {
    expect(ans(['C(2,1,0)', 'B(1,1,0)'], 'CB').answer).toBe('(-1, 0, 0)');
  });

  it('its length answers too — two absolute points state the scale', () => {
    expect(ans(['C(2,1,0)', 'B(1,1,0)'], '|CB|').answer).toBe('1');
  });

  it('a DETACHED solid beside the points stays honest: its frozen-gauge |AB| still refuses', () => {
    expect(ans(["קובייה ABCDA'B'C'D'", 'P(0,0,9)', 'Q(0,0,3)'], '|AB|')).toMatchObject({ answer: null, note: 'scale' });
  });
});
