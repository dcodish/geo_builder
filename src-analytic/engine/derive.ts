/**
 * Lines → figure, in one place.
 *
 * The composition `parse → fold → evaluate` is the product's whole derivation, and it is written
 * once so that the app, the tests and (later) the save/load path all take the same route. A line
 * that fails is reported with its own index and its own words — never dropped, and never blamed on
 * a different line (the honesty invariant: an error message names the conflicting STATEMENT).
 */
import { fold, existingKindOf, type ApplyError, type ApplyNotice } from './apply';
import { reportedDof } from './carriers';
import { drawableAt, viewBox, type Figure } from './evaluate';
import type { Box } from './curves';
import { MINT_PREFIX, parseLine, type ParseFailure } from '../parser/parseAnalytic';
import { evalExpr } from './expr';
import { isCanonicalCircle } from './conic';
import { EMPTY_CONSTRUCTION, diameterCircleId, namesObject, objectById, type Construction, type Fact } from './types';
import { SOLVE_TOL } from './solve';

/** What went wrong with one line — a parse refusal or an apply refusal, with the line's own text. */
/** The point ids an incidence constraint is ABOUT — how a crossing is recognised (#1254). */
function incidenceIds(k: { t: string; id?: string }): string[] {
  return k.t === 'on-line-2pt' || k.t === 'on-curve' || k.t === 'on-line' ? [k.id ?? ''] : [];
}

export interface LineFault {
  index: number;
  code: ParseFailure['code'] | ApplyError['code'] | 'kind-mismatch';
  detail: string;
  /** For a name clash: what the name already holds, as a token the locale renders (#1046). */
  existing?: ApplyError['existing'];
  /** For an unknown reference: what KIND was expected, so the message uses the right noun (#1179). */
  expected?: ApplyError['expected'];
  /** For a second naming: WHO already holds the position, so the refusal shows it (#1153). */
  holder?: ApplyError['holder'];
  /** For an ambiguous one-letter angle: the three-letter name to write instead (#1407). */
  example?: ApplyError['example'];
  /** #1432 am. 1 — the host a contextual reference needed, and the bound a stated value broke. */
  host?: ApplyError['host'];
  domain?: ApplyError['domain'];
}

/**
 * What one LINE did — the per-line rollup of `applyFact`'s per-fact effect (#1045).
 *
 * A line can lower to several facts («AD תיכון לצלע BC» is four), so the rollup is deliberately
 * generous: the line COUNTS as contributing if any one of its facts created or narrowed something.
 * Only a line whose every fact was already known is `known`, which is the only case where dropping
 * the row is honest.
 */
export type LineOutcome = 'created' | 'known' | 'narrowed' | 'faulted';

export interface Derivation {
  construction: Construction;
  figure: Figure;
  box: Box;
  /**
   * WHICH CONFIGURATION THIS IS (#1176).
   *
   * A derivation is always OF a seed — the figure, the panel and every gate describe one
   * configuration — and not carrying it is what let the locus lane diverge from the canvas: `ask`
   * had no way to know which configuration it was answering about, so it traced at a hardcoded pair
   * and drew a curve belonging to a different value of the figure's free parameter.
   *
   * Carried rather than re-derived, so a consumer cannot disagree with its own figure by construction.
   */
  seed: number;
  /** One entry per failing line. An empty array means every line landed. */
  faults: LineFault[];
  /** One entry per input line, positionally — what that line actually did. */
  outcomes: LineOutcome[];
  /**
   * THE NAMES THE TOOL GAVE (#1281, the #1263 ruling) — one entry per point a line stated only by its
   * coordinates, with the line that stated it. The fact list shows it on that row, so the list never implies
   * the student wrote a name the tool chose.
   */
  minted: Array<{ index: number; id: string }>;
  /**
   * WHAT A LINE THAT LANDED SHOULD TELL THE STUDENT (#1350, ADR-AG-183) — one entry per line whose
   * statement was accepted with a notice (`applyFact`'s `ApplyNotice`), never on a faulted line. The
   * submit path reads the new line's entry and carries it into the commit that records the line.
   */
  notices: Array<ApplyNotice & { index: number }>;
}

export function derive(lines: readonly string[], seed = 0): Derivation {
  const facts: Fact[] = [];
  const faults: LineFault[] = [];
  /** Which line produced each fact, so an apply refusal can be blamed on the right one. */
  const owner: number[] = [];

  const parsed: Fact[] = [];
  lines.forEach((line, index) => {
    const r = parseLine(line);
    if (!r.ok) {
      faults.push({ index, code: r.code, detail: r.detail });
      return;
    }
    for (const f of r.facts) {
      parsed.push(f);
      owner.push(index);
    }
  });
  const { facts: resolved, minted } = resolveMints(parsed, owner);
  // The canonical circle's centre, named O by the tool (#1270) — inserted with its owning line, so the
  // fold and every per-line rollup below see it as part of the circle's sentence.
  const centred = nameCanonicalCentres(resolved, owner);
  owner.splice(0, owner.length, ...centred.owner);
  facts.push(...centred.facts);

  // The LINE is the fold's unit of application (#1242, ADR-AG-133): every fact of a faulted line carries
  // the line's error, so the line is reported ONCE — the same error repeated per fact is one refusal.
  const { construction, errors, effects, constraintFact, notices: factNotices } = fold(facts, owner);
  // Said on the circle's row only when the name was actually GIVEN — a default that yielded to a letter
  // already in the figure named nothing, and the list must not claim it did (#1263's rule).
  for (const i of centred.offered) if (effects[i] === 'created') minted.push({ index: owner[i], id: CENTRE_LETTER });
  const reported = new Set<string>();
  errors.forEach((e, i) => {
    if (!e) return;
    const key = JSON.stringify([owner[i], e.code, e.detail, e.existing ?? null, e.expected ?? null, e.holder ?? null, e.example ?? null, e.host ?? null]);
    if (reported.has(key)) return;
    reported.add(key);
    faults.push({ index: owner[i], code: e.code, detail: e.detail, existing: e.existing, expected: e.expected, holder: e.holder, example: e.example, host: e.host, domain: e.domain });
  });

  /**
   * A selector chooses among configurations, so a configuration that fails one is not a
   * contradiction — it is the wrong draw. Advance the seed until one holds, exactly as the sibling's
   * `firstSatisfyingSeed` does ([ADR-098](../../docs/06-decisions.md#adr-098)), and give up after a
   * bounded search rather than spinning: if «החלק החיובי» can never hold, that IS worth reporting.
   */
  /**
   * The figure SHOWN is the one the gates judge (#1083).
   *
   * This loop and `isKnowledge` used to advance the seed by different rules, so the panel could
   * report on a configuration the canvas never drew. One sampler now answers both — and it also
   * prefers a configuration in which every object the student NAMED exists, which is the half the
   * operator found: «אלכסוני המרובע נפגשים בנקודה O» has no `O` when the diagonals cross only when
   * extended, and drawing that figure while another has the point is a poor choice rather than an
   * honest one.
   */
  // THE DISPLAYED figure asks for the spread preference (#1174): among the configurations that may
  // be drawn, open on one that is not a sliver. Every honesty gate calls `drawableAt` without it.
  let figure = drawableAt(construction, seed, true);

  /**
   * A selector that can NEVER hold is reported — the docblock above has always said so, and nothing
   * did it (#1069).
   *
   * «D על הצלע BC» with «BD = 18» on a 10-unit side is impossible: `D` lands beyond `C`, the
   * betweenness selector is false, and the figure was drawn anyway with `D` outside the side the
   * student named. That is a figure contradicting its own givens, which is the one thing this product
   * may not do.
   *
   * The predicate is #1058's: **a figure with no freedom left has no other configuration to try**, so
   * a failing selector there is a permanent fact rather than an unlucky seed. When the figure still
   * has freedom, 24 exhausted seeds are evidence and not proof — reporting then could refuse a
   * satisfiable figure, which is the opposite defect. That half is
   * [#1071](https://github.com/dcodish/geo_builder/issues/1071)'s measurement question and is
   * deliberately left alone here.
   */
  if (!figure.selectorsOk && reportedDof(construction, figure.carrierDof) === 0) {
    const blamed = new Set<number>();
    // Only the sentences whose selector FAILED (#1268): a triangle's `distinct` did not make a crossing's
    // ordinal impossible. Without the per-selector verdict, every selector line, as before.
    const failing = new Set((figure.selectorsFailing ?? []).map((s) => JSON.stringify(s)));
    facts.forEach((f, i) => {
      if (f.t === 'selector' && (failing.size === 0 || failing.has(JSON.stringify(f.sel)))) blamed.add(owner[i]);
    });
    for (const index of blamed) {
      faults.push({ index, code: 'unsatisfiable', detail: lines[index] });
    }
  }

  /**
   * THE RING-FAULT ARM IS FURTHER DOWN, after the vacancy loop — see
   * [#1170](https://github.com/dcodish/geo_builder/issues/1170) and ADR-AG-129.
   *
   * It cannot run here. Its one hard requirement is that a line already carrying a truer message
   * does not get a second one, and the messages it must not double — `does-not-exist` above all —
   * are pushed below this point.
   */

  /**
   * A constraint the solve could not meet is a FAULT, blamed on the line that stated it — the
   * figure is never shown as though it satisfied a given it does not
   * ([02c](../../docs/02c-requirements-analytic.md) honesty invariants).
   */
  for (const k of figure.unsatisfied) {
    /**
     * Which constraint IS this, in the construction (#1079)?
     *
     * By identity, because `evaluate` reports the very objects it measured. A CHOICE is the one
     * exception: what it measures is the OPTION the seed selected, which is not itself in the
     * list, so the choice holding it is what carries the blame — and that is right, because the
     * line the student wrote is the one that opened the choice.
     */
    let at = construction.constraints.indexOf(k);
    if (at < 0) {
      at = construction.constraints.findIndex(
        (c) => c.t === 'choice' && c.options.includes(k),
      );
    }
    const fact = at >= 0 ? constraintFact[at] : undefined;
    const line = fact === undefined ? undefined : owner[fact];
    if (line === undefined) continue;
    // ONE fault per line (#1287): a crossing lowers to two incidence constraints, and when the solve
    // misses both, the student's sentence was being blamed twice with the same words.
    if (faults.some((f) => f.index === line && f.code === 'unsatisfiable')) continue;
    faults.push({ index: line, code: 'unsatisfiable', detail: lines[line] });
  }

  /**
   * The third place a line can fail (#896): it parsed, it applied, and only at EVALUATION did the
   * conic classifier find it outside the product's scope — a rotated conic, a translated one, a
   * hyperbola. `src-analytic/CLAUDE.md` states the contract ("refuses each by name"), and until
   * this ran the refusal was computed and discarded: the line committed, drew nothing and said
   * nothing, which is a stated given vanishing.
   *
   * A `vacant` reason is deliberately NOT a fault. An empty circle at this parameter value is the
   * documented "not at this value", and reporting it as a refusal would be the opposite defect.
   */
  // First writer wins: if two lines name the same object, the one that introduced it owns the
  // refusal — the same rule `owner` already encodes for apply errors. Which facts NAME an object is
  // `namesObject`, one positive list rather than a second copy of the exclusions (#1049).
  const lineOf = new Map<string, number>();
  facts.forEach((f, i) => {
    if (namesObject(f) && !lineOf.has(f.id)) lineOf.set(f.id, owner[i]);
    // «BD קוטר» names the circle it creates without an id of its own (#1324) — the one formula M1 mints it by.
    if (f.t === 'diameter-of') {
      const id = diameterCircleId(f.a, f.b);
      if (!lineOf.has(id)) lineOf.set(id, owner[i]);
    }
  });
  /**
   * VACANCY NEEDS A PREDICATE (#1058).
   *
   * [ADR-AG-008](../../docs/06c-decisions-analytic.md#adr-ag-008) rules that a degenerate
   * configuration is vacant and **never a fault**: an empty circle at this parameter value is "not at
   * this value", and reporting it as a refusal would be the opposite defect. That is right — and it is
   * a statement about a figure that still has FREEDOM LEFT. "Not at this value" presupposes there are
   * other values.
   *
   * A fully determined figure has none. «מפגש האלכסונים» on a concave quadrilateral is absent at every
   * seed, because there is only one configuration and the diagonals do not cross in it. Staying silent
   * there tells the student nothing about a point they named, and «הציגו תצורה אחרת» can never help.
   *
   * So the distinction keeps its rule and gains its predicate: **silent while the figure can still
   * move, reported once it cannot.** The class is wider than the diagonals — three collinear points
   * have no circumcentre, for ever, and behaved the same way.
   */
  const freedom = reportedDof(construction, figure.carrierDof);

  /**
   * A NAMED CROSSING THAT IS A POINT THE FIGURE ALREADY HAS (#1254, the operator’s T18 ruling).
   *
   * *"if P and B must be on the same location … it should be refused. The only case where P and B can
   * fall [together] is if one of them has a degree of freedom … even if they do fall on the same point
   * by chance … the system should not show them on top of each other."*
   *
   * [#1175](https://github.com/dcodish/geo_builder/issues/1175) answered the STRUCTURAL member — two
   * lines named by two points each that share a written letter meet at that letter, whatever the
   * configuration — and pre-declared the positional one an escalation rather than an expansion. This
   * is that escalation, ruled: «P נקודת החיתוך של הישר AB עם הישר CD» on his own figure put P exactly on
   * B, with `faults: []`, and the sheet used that very figure as its CONTROL.
   *
   * **The freedom predicate is the vacancy pass’s, for the same reason** (right above): silent while
   * the figure can still move — another configuration may separate them, and #1273 is what will prefer
   * it — reported once it cannot. That is the ruling’s own two branches, and it is why this sits here
   * rather than in the parser: whether a coincidence is FORCED is a question about the figure.
   *
   * Scoped to a point a sentence CROSSED into being — two incidences and a declaration. A midpoint or
   * a foot landing on an existing point is the same family and is deliberately left for the wider
   * ruling; refusing them here would reach past what was measured.
   */
  if (freedom === 0) {
    const xs = figure.points.map((q) => q.x);
    const ys = figure.points.map((q) => q.y);
    const span = Math.max(1e-9, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    // Relative to the figure (ADR-AG-021), with a floor tied to the SOLVE's own tolerance rather than
    // an arbitrary small number: a figure whose points all sit at the origin has no span, and the
    // solver leaves its crossing ~1e-9 away from the point it coincides with. #1276 is the same lesson
    // — an absolute threshold below the residual the solver actually leaves behind decides nothing.
    const near = Math.max(span * 1e-6, SOLVE_TOL * 10);
    // Counted off the CONSTRAINTS, not the objects: a crossing is `declare`d and does not carry the
    // `point` kind, which is what made a first version of this check find nothing at all.
    const incidences = new Map<string, number>();
    for (const k of construction.constraints)
      for (const id of incidenceIds(k)) incidences.set(id, (incidences.get(id) ?? 0) + 1);
    const crossed = new Set([...incidences].filter(([, n]) => n >= 2).map(([id]) => id));
    // A CROSSING is `declare`d, which `namesObject` does not cover — so `lineOf`, built for naming
    // facts, has no entry for it. The owning line is read here rather than by widening that map, whose
    // shape the vacancy pass below depends on.
    const declaredOn = new Map<string, number>();
    facts.forEach((f, i) => {
      const t = (f as { t: string }).t;
      const id = (f as { id?: string }).id;
      if (t === 'declare' && id && !declaredOn.has(id)) declaredOn.set(id, owner[i]);
    });
    const ownerLine = (id: string) => declaredOn.get(id) ?? lineOf.get(id);
    for (const pt of figure.points) {
      if (!crossed.has(pt.id)) continue;
      const index = ownerLine(pt.id);
      if (index === undefined) continue;
      const holder = figure.points.find((q) => {
        if (q.id === pt.id) return false;
        const qi = ownerLine(q.id);
        if (qi !== undefined && qi > index) return false; // only a point that was ALREADY there
        return Math.hypot(q.x - pt.x, q.y - pt.y) < near;
      });
      if (holder) faults.push({ index, code: 'crossing-already-named', detail: lines[index], holder: holder.id });
    }
  }
  for (const v of figure.vacant) {
    const index = lineOf.get(v.id);
    if (index === undefined) continue; // no line owns it — nothing honest to say about it
    /**
     * THE NOUN SAID ONE FAMILY AND THE EQUATION IS ANOTHER (02c R7, #1514 pre-play) — refused naming
     * both: `existing` is what the equation describes (the same `curve:<kind>` token a name clash
     * renders), `expected` the noun the student wrote. Never drawn: a circle labelled «פרבולה I» on
     * the canvas is a stated given silently contradicted.
     */
    if (v.reason === 'kind-mismatch' && v.actual) {
      const o = objectById(construction, v.id);
      const claimed = o && o.kind === 'curve' ? o.curve.kind : undefined;
      faults.push({ index, code: 'kind-mismatch', detail: lines[index], existing: `curve:${v.actual}`, ...(claimed ? { expected: claimed } : {}) });
      continue;
    }
    if (v.reason !== 'vacant') {
      faults.push({ index, code: 'out-of-scope', detail: lines[index] });
      continue;
    }
    if (freedom > 0) continue; // another configuration may yet have it
    const o = objectById(construction, v.id);
    faults.push({
      index,
      code: 'does-not-exist',
      detail: lines[index],
      existing: o ? existingKindOf(o) : undefined,
    });
  }

  /**
   * A SHAPE NOUN PROMISES A RING, AND THESE PINNED POINTS ARE NOT THAT RING (#1170, ADR-AG-129).
   *
   * **Operator ruling, 2026-09-17: refuse the line.** He hit it by accident playing round #1169 —
   * typed `D(1,0)` instead of the sheet’s `D(0,4)`, which put `D` on segment `AB`, and reported
   * *"a quad should have been rejected for this case"* without knowing he was looking at a known
   * gap. He was offered draw-with-a-notice and chose the refusal.
   *
   * `ringFaultsOf` has SEEN this since #1158/#1166; `drawableAt` uses it to choose a configuration,
   * which is what fixed both of those. What was missing is the case where there is nothing to
   * choose: every figure this fires on has **`reportedDof = 0`**, because with the preference in the
   * search a figure that still has freedom never arrives here carrying a ring fault. The student
   * pinned the coordinates, and those coordinates are what make the ring collapsed or crossed.
   *
   * That is also why the message is about the RING and not about a failed search:
   * «לא נמצאה תצורה שבה מתקיים» would be false on a determined figure — there was only ever one
   * configuration, and it is the one they described.
   *
   * **Both members, on the ruling’s own reach.** He ruled on a degenerate pinned ring; a crossed one
   * (four pinned points in a bow-tie order) is the same sentence — *a shape noun promises a ring, and
   * these points are not that ring* — and splitting them would leave that half silent for no reason
   * either of us has given.
   *
   * **One message per line, and the truer one wins.** «P מפגש האנכים האמצעיים במשולש ABC» on three
   * collinear points declares the triangle AND asks for its circumcentre, so one line carries both a
   * ring fault and ADR-AG-008’s `does-not-exist`. `does-not-exist` names what the student actually
   * asked for and is the better answer; a second, differently-worded refusal on the same line is
   * noise rather than honesty. This is why the arm runs here, below every other fault: it can see
   * what has already been said.
   */
  if (figure.ringFaults.length > 0 && reportedDof(construction, figure.carrierDof) === 0) {
    /** Which line declared each polygon — the line the refusal belongs on (#1145). */
    const declaredPolygonOn = new Map<string, number>();
    facts.forEach((f, i) => {
      if (f.t === 'polygon' && !declaredPolygonOn.has(f.id)) declaredPolygonOn.set(f.id, owner[i]);
    });
    const alreadyFaulted = new Set(faults.map((f) => f.index));
    for (const rf of figure.ringFaults) {
      const index = declaredPolygonOn.get(rf.id);
      if (index === undefined) continue; // no line owns it — nothing honest to say about it
      if (alreadyFaulted.has(index)) continue;
      alreadyFaulted.add(index);
      faults.push({ index, code: 'ring-contradicts-noun', detail: lines[index] });
    }
  }
  /**
   * Roll the per-FACT effects up to per-LINE outcomes (#1045).
   *
   * A faulted line is faulted whatever else it did. Otherwise the line counts as contributing if
   * any of its facts created or narrowed something, so a multi-fact line («AD תיכון לצלע BC») is
   * never called "already known" on the strength of one of its four facts being a repeat.
   */
  const outcomes: LineOutcome[] = lines.map(() => "known");
  facts.forEach((_, i) => {
    const line = owner[i];
    const e = effects[i];
    if (e === "created" || outcomes[line] === "created") outcomes[line] = "created";
    else if (e === "narrowed") outcomes[line] = "narrowed";
  });
  lines.forEach((_, i) => {
    if (!facts.some((_f, j) => owner[j] === i)) outcomes[i] = "faulted";
  });
  for (const f of faults) outcomes[f.index] = "faulted";

  // One notice per line, and none on a line that faulted — a refusal already says everything (#1350).
  const notices: Derivation['notices'] = [];
  factNotices.forEach((n, i) => {
    const index = owner[i];
    if (!n || outcomes[index] === 'faulted' || notices.some((m) => m.index === index)) return;
    notices.push({ ...n, index });
  });

  return { construction, figure, box: viewBox(figure), seed, faults, outcomes, minted, notices };
}

/** `n` in subscript digits — `P₁`, `P₁₂`. */
const subscript = (n: number): string => String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x2080 + Number(d)));

/**
 * NAMING A POINT THE STUDENT GAVE ONLY BY ITS COORDINATES (#1281; operator ruling #1263, 2026-09-20: *mint a
 * reserved letter, and say so*; build ruling 2026-09-27, #1281).
 *
 * The parser marks such a point with a placeholder (`MINT_PREFIX` + its coordinates' text). Resolved HERE, over
 * the whole list and in order, because only the list knows what is taken: the SAME coordinates are one point;
 * a point the student already stated at exactly those coordinates keeps THEIR letter (the #1270 rule — a
 * student's letter wins); otherwise the next free reserved name, P₁, P₂, … — subscripted, so it is a letter a
 * student does not reach for first, and `NAME` reads it back. Earlier names never move when a line is added, so
 * the figure stays stable. Pure over the list, like everything `derive` does.
 */
function resolveMints(facts: Fact[], owner: readonly number[]): { facts: Fact[]; minted: Array<{ index: number; id: string }> } {
  const text = JSON.stringify(facts);
  if (!text.includes(MINT_PREFIX)) return { facts, minted: [] };
  const used = new Set<string>(text.match(/"[A-Z][0-9₀-₉]?"/g)?.map((q) => q.slice(1, -1)) ?? []);
  const numeric = (f: Fact): [number, number] | null => {
    if (f.t !== 'point') return null;
    const x = evalExpr(f.x, {});
    const y = evalExpr(f.y, {});
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  };
  const names = new Map<string, string>();
  const minted: Array<{ index: number; id: string }> = [];
  let n = 0;
  facts.forEach((f, i) => {
    if (f.t !== 'point' || !f.id.startsWith(MINT_PREFIX) || names.has(f.id)) return;
    const at = numeric(f);
    const own = at
      ? facts.slice(0, i).find((g) => {
          if (g.t !== 'point' || g.id.startsWith(MINT_PREFIX)) return false;
          const q = numeric(g);
          return q !== null && Math.abs(q[0] - at[0]) < 1e-12 && Math.abs(q[1] - at[1]) < 1e-12;
        })
      : undefined;
    if (own && own.t === 'point') {
      names.set(f.id, own.id);
      return;
    }
    let name: string;
    // The ORIGIN is O when that letter is free (#1628) — the exam's own name for it, and the same default
    // that yields as the canonical circle's centre (ADR-AG-184): a point the student already called O keeps
    // the letter, and the origin then falls back to P₁… like any other coordinate point.
    if (at && at[0] === 0 && at[1] === 0 && !used.has(CENTRE_LETTER)) name = CENTRE_LETTER;
    else do name = `P${subscript(++n)}`;
    while (used.has(name));
    used.add(name);
    names.set(f.id, name);
    minted.push({ index: owner[i], id: name });
  });
  // A placeholder is a whole id or the SUFFIX of one (#1432 am. 1 — `circle-at-@mint:2,3`, `r_@mint:2,3` for a
  // circle centred on a coordinate point), so it is replaced up to the closing quote, never only as a whole string.
  const out = JSON.parse(text.replace(/@mint:[^"]*/g, (q) => JSON.stringify(names.get(q) ?? q).slice(1, -1))) as Fact[];
  return { facts: out, minted };
}

/**
 * THE CANONICAL CIRCLE'S CENTRE IS CALLED O (#1270, ADR-AG-184 — amending ADR-AG-115).
 *
 * Operator, 2026-09-20: *"for canonical circles only, the center is O automatically unless user mentioned a
 * letter. user can change this later anyway"*. So a stated circle whose equation is centred on the origin
 * (`isCanonicalCircle` — a property of the equation, at every parameter value) gets its centre as a REAL
 * point `O`, on the route a student-named centre already takes (#1059's `circle-centre` derivation). A
 * real point, not a printed letter: #1167's defect was a letter with nothing behind it.
 *
 * It is a DEFAULT, and it yields (M4) — decided here, over the whole list, for the reason `resolveMints` is:
 * only the list knows what is taken, in both directions of entry order.
 *
 *  1. a point the student stated AT the origin (`A(0,0)`, before or after the circle) — that point's letter
 *     names the centre (ADR-AG-115's rule, which the panel applies by position);
 *  2. the student named a canonical circle's centre themselves («נתון מעגל K שמשוואתו …», «K מרכז המעגל 1»)
 *     — their letter;
 *  3. the circle is not canonical — coordinates alone, unchanged («canonical only»);
 *  4. the student DEFINED a point O anywhere (`O(5,5)`, «O אמצע AB») — no second O and no invented
 *     `O₁`: the centre keeps its coordinates alone. An O merely DECLARED by an earlier sentence
 *     («משולש AOB») is caught at the fold, where the offered fact finds the letter held and yields.
 *
 * A LATER sentence that only REFERS to O («משולש AOB», «הקטע OA») binds to this centre — that is the
 * ruling's *"user can change this later"* made real: there is something to refer to.
 *
 * Returns the facts with the offered centre inserted right after its circle, the owner array to match, and
 * which fact indices were offered (so `derive` can say so on the row only when the name was given).
 */
const CENTRE_LETTER = 'O';

function nameCanonicalCentres(
  facts: readonly Fact[],
  owner: readonly number[],
): { facts: Fact[]; owner: number[]; offered: number[] } {
  const canonical = (f: Fact): boolean =>
    f.t === 'curve' && f.curve.kind !== 'ellipse' && f.curve.kind !== 'parabola' && f.curve.kind !== 'line' && isCanonicalCircle(f.curve.eq);
  const canonicalIds = new Set(facts.filter(canonical).map((f) => (f as { id: string }).id));
  if (canonicalIds.size === 0) return { facts: [...facts], owner: [...owner], offered: [] };

  const atOrigin = (f: Fact): boolean => {
    if (f.t === 'point') {
      const x = evalExpr(f.x, {});
      const y = evalExpr(f.y, {});
      return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12;
    }
    // Rule 2: a centre the student named, of a circle centred on the origin, occupies the origin.
    return f.t === 'derived' && !f.auto && f.rule.t === 'circle-centre' && canonicalIds.has(f.rule.curve);
  };
  const definesLetter = (f: Fact): boolean => (f.t === 'point' || f.t === 'derived') && f.id === CENTRE_LETTER;
  if (facts.some((f) => atOrigin(f) || definesLetter(f))) return { facts: [...facts], owner: [...owner], offered: [] };

  const out: Fact[] = [];
  const outOwner: number[] = [];
  const offered: number[] = [];
  facts.forEach((f, i) => {
    out.push(f);
    outOwner.push(owner[i]);
    if (f.t !== 'curve' || !f.stated || !canonicalIds.has(f.id)) return;
    offered.push(out.length);
    out.push({ t: 'derived', id: CENTRE_LETTER, rule: { t: 'circle-centre', curve: f.id }, src: f.src, auto: true });
    outOwner.push(owner[i]);
  });
  return { facts: out, owner: outOwner, offered };
}

export const EMPTY_DERIVATION: Derivation = {
  construction: EMPTY_CONSTRUCTION,
  figure: { env: {}, points: [], curves: [], segments: [], construction: [], vacant: [], unsatisfied: [], selectorsOk: true, ringFaults: [], carrierDof: 0, provenance: {}, usedSymbols: [] },
  box: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  seed: 0,
  faults: [],
  outcomes: [],
  minted: [],
  notices: [],
};
