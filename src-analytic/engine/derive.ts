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
import { collapsedByGivens, completingStatement, drawableAt, hardRingFaults, holdsOn, viewBox, type Figure } from './evaluate';
import { resolveCurve, type Box } from './curves';
import { MINT_PREFIX, parseLine, type ParseFailure } from '../parser/parseAnalytic';
import { resolveToolLetters } from './toolLetters';
import { segmentIdOf } from './cevian';
import { evalExpr } from './expr';
import { isCanonicalCircle } from './conic';
import { EMPTY_CONSTRUCTION, diameterCircleId, factsWithin, namesObject, objectById, type Construction, type Fact } from './types';
import { SOLVE_TOL, resolveChoices } from './solve';
import { NO_STATED_MEASURES, statedMeasures, type StatedMeasures } from './statedMeasures';
import { incidenceWords } from './crossings';
import { shapeRow } from './shapes';

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
  /** For an ambiguous one-letter angle naming several: every candidate, three letters each (#1445). */
  options?: ApplyError['options'];
  /** #1432 am. 1 — the host a contextual reference needed, and the bound a stated value broke. */
  host?: ApplyError['host'];
  domain?: ApplyError['domain'];
  /** For a crossing already named: the two things that cross, as the grammar says them (#1416). */
  operands?: [string, string];
  /**
   * For a polygon the givens flatten (#1849, ADR-AG-247): its name as written (`ABC`), its noun (the registry's
   * Hebrew key, as `ring.noun`), and the sentence that declared it — the second statement the refusal names.
   */
  polygon?: string;
  shape?: string;
  declared?: string;
  /** For a circle through a ring its noun forbids (#1918, ADR-AG-252): the noun the circle would force (registry key). */
  forced?: string;
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
  /**
   * WHICH LINE STATED EACH CONSTRAINT (#1629, ADR-AG-188) — positionally over `construction.constraints`,
   * the fold's own attribution (`constraintFact`) carried to the line. The submit gate reads the new
   * line's constraints from it to ask whether they hold in every configuration of the current figure.
   */
  constraintLine: number[];
  /**
   * WHAT THE STUDENT STATED ABOUT A MEASURE (#1714, ADR-AG-225) — lengths, angles, right angles, areas, arcs and
   * equalities, read off the constraints a SENTENCE added (a noun's definition only through its resolved choice),
   * for the canvas to write on the figure. The answer side stays in the panel (ADR-AG-016).
   */
  stated: StatedMeasures;
}

/**
 * `seedNames` (#1631, ADR-AG-192): the session's letter → seed-name map, carried on the construction so
 * every evaluation of THIS figure — the drawn one, the gates, the pool — starts its free vertices from
 * the same places. Empty for a figure no letter change touched, which is then byte-for-byte the old fold.
 */
export function derive(lines: readonly string[], seed = 0, seedNames: Readonly<Record<string, string>> = {}): Derivation {
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
  const fresh = resolveToolLetters(parsed, owner);
  const { facts: resolved, minted } = resolveMints(fresh.facts, owner);
  minted.unshift(...fresh.minted);
  // The canonical circle's centre, named O by the tool (#1270) — inserted with its owning line, so the
  // fold and every per-line rollup below see it as part of the circle's sentence.
  const centred = nameCanonicalCentres(resolved, owner);
  owner.splice(0, owner.length, ...centred.owner);
  facts.push(...centred.facts);

  // The LINE is the fold's unit of application (#1242, ADR-AG-133): every fact of a faulted line carries
  // the line's error, so the line is reported ONCE — the same error repeated per fact is one refusal.
  const { construction: folded, errors, effects, constraintFact, selectorFact, notices: factNotices } = fold(facts, owner);
  const construction: Construction = Object.keys(seedNames).length > 0 ? { ...folded, seedNames: { ...seedNames } } : folded;
  // A tool letter whose point the fold did not create — the cevian ran to a point the figure already named the same
  // way (ADR-AG-211), or its line was refused — named nothing, and the row must not claim it did (#1263's rule).
  const present = new Set(construction.objects.map((o) => o.id));
  minted.splice(0, minted.length, ...minted.filter((m) => present.has(m.id)));
  // Said on the circle's row only when the name was actually GIVEN — a default that yielded to a letter
  // already in the figure named nothing, and the list must not claim it did (#1263's rule).
  for (const i of centred.offered) if (effects[i] === 'created') minted.push({ index: owner[i], id: CENTRE_LETTER });
  /**
   * THE OTHER STATEMENT a circle-through-a-forbidding-noun refusal names (#1918, ADR-AG-252): the refused line is the
   * inscription → the sentence that declared the noun; the refused line is the noun → the sentence that inscribed the
   * ring. Read off the parsed facts (the student's own lines), first such line wins.
   */
  const inscribedAgainst = (e: ApplyError, at: number): Partial<LineFault> => {
    if (e.code !== 'inscribed-contradicts-declared' || !e.ring) return {};
    const rings = facts.map((f, j) => ({ f, j })).filter((x): x is { f: Extract<Fact, { t: 'polygon' }>; j: number } => x.f.t === 'polygon' && x.f.id === e.ring);
    const refusedIsInscription = rings.some(({ f, j }) => owner[j] === at && f.cyclic);
    const other = rings.find(({ f, j }) => owner[j] !== at && (refusedIsInscription ? !!f.noun && !!shapeRow(f.noun)?.notCyclic : !!f.cyclic));
    return { shape: e.shape, forced: e.forced, ...(other ? { declared: lines[owner[other.j]] } : {}) };
  };
  const reported = new Set<string>();
  errors.forEach((e, i) => {
    if (!e) return;
    const key = JSON.stringify([owner[i], e.code, e.detail, e.existing ?? null, e.expected ?? null, e.holder ?? null, e.example ?? null, e.host ?? null, e.options ?? null]);
    if (reported.has(key)) return;
    reported.add(key);
    faults.push({ index: owner[i], code: e.code, detail: e.detail, existing: e.existing, expected: e.expected, holder: e.holder, example: e.example, host: e.host, domain: e.domain, ...(e.options ? { options: e.options } : {}), ...inscribedAgainst(e, owner[i]) });
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
   * operator found: «אלכסוני המרובע נפגשים בנקודה O» had no `O` when the diagonals crossed only when
   * extended, and drawing that figure while another has the point is a poor choice rather than an
   * honest one.
   */
  // THE DISPLAYED figure asks for the spread preference (#1174): among the configurations that may
  // be drawn, open on one that is not a sliver. Every honesty gate calls `drawableAt` without it.
  let figure = drawableAt(construction, seed, true);

  /**
   * …and WHICH line: the one whose removal lets the figure solve (#1492 ruling 3, ADR-AG-231), when one does. The
   * snapshot below names the constraints unmet in the configuration the solve REACHED, which is a fact about the basin:
   * the needle «AB = AC» · «∠ABC = 90» blamed either sentence depending on the seed. The drop-one probe asks the
   * student's question instead and names the statement that completed the contradiction, whatever basin was reached.
   * When no single line's removal admits a figure, the snapshot's blame stands — it still names an unmet statement.
   */
  const pinnedBy = new Map<string, number>();
  facts.forEach((f, i) => {
    if (f.t === 'point' && !errors[i]) pinnedBy.set(f.id, owner[i]); // the LAST line to place it
  });
  const completing =
    figure.unsatisfied.length > 0
      ? completingStatement(
          construction,
          construction.constraints.map((_, at) => (constraintFact[at] === undefined ? -1 : owner[constraintFact[at]])),
          seed,
          pinnedBy,
        )
      : null;
  /**
   * ONE BLAME MECHANISM FOR THE WHOLE ADMISSION VERDICT (#1699, ADR-AG-240). The probe's answer is a statement whose
   * removal ADMITS a figure — every given holds, every selector holds, the ring is the noun's (`admittedFigure`). So when
   * it names one, every other admission failure of the drawn figure (a selector, a hard ring fault) is the same
   * contradiction read off the compromise configuration, not a second culprit: the selector and ring arms below stay
   * silent and the completing statement is blamed alone. Measured on corpus 7/4 derived whole: «S_BDC / S_ODC = 0.8»
   * completes the contradiction, and the triangle's `distinct` («במשולש OBC …», line 0), «B ברביע הראשון» and
   * «E על הקטע OC» — selectors the compromise broke — were refused beside it. When no single removal admits a figure
   * (two independent contradictions, or a search miss), `completing` is null and every arm reports as before.
   */
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
   *
   * **…and the freedom predicate was the wrong one for a selector (#1635, ADR-AG-197).** A figure with
   * freedom left has other configurations — and `drawableAt` has already TRIED them: it returns a figure whose
   * selectors fail only when no seed of its window (twenty-five, each with every live `choice` option since
   * #1642) had them hold, the selector-steered solve (#1463's deflation and chord reflection) having been asked
   * at each. That is the bounded search ADR-098 reports on. Measured: «המעגל משיק לציר ה-x» · «המעגל חותך את
   * ציר ה-x בנקודות B ו-C» drew B and C on one point at 24/24 seeds with `faults: []`, because the free centre
   * kept DOF at 2 — a figure drawn green for givens that cannot hold. So a selector that fails across the whole
   * search is refused on its line WHATEVER the freedom; the search, not the DOF, is the evidence.
   *
   * Where a GIVEN already fails in the figure drawn, the search ran over contradictory configurations and
   * says nothing separate about the selector: the unsatisfied given carries the refusal (below, on the line
   * that completed the contradiction), and a triangle's `distinct` failing because its givens collapse it is
   * not a second, earlier culprit. Measured over the corpus: three already-refused figures («AB = AC» ·
   * «∠ABC = 90» on «משולש ABC») would otherwise blame «משולש ABC» too.
   */
  if (completing === null && !figure.selectorsOk && (reportedDof(construction, figure.carrierDof) === 0 || figure.unsatisfied.length === 0)) {
    const blamed = new Set<number>();
    // Only the sentences whose selector FAILED (#1268): a triangle's `distinct` did not make a crossing's
    // ordinal impossible. Without the per-selector verdict, every selector line, as before.
    const failing = new Set((figure.selectorsFailing ?? []).map((s) => JSON.stringify(s)));
    facts.forEach((f, i) => {
      if (f.t === 'selector' && (failing.size === 0 || failing.has(JSON.stringify(f.sel)))) blamed.add(owner[i]);
    });
    // A selector M1 BUILT from a contextual sentence («B נמצאת מחוץ למעגל», #1619 B1) has no `selector`
    // fact of its own — it is blamed on the line the fold recorded as adding it.
    construction.selectors.forEach((s, at) => {
      const fact = selectorFact[at];
      if (fact === undefined || facts[fact]?.t === 'selector') return;
      if (failing.size === 0 || failing.has(JSON.stringify(s))) blamed.add(owner[fact]);
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
  /** Which line declared each polygon — the sentence a collapse refusal names beside the completing one (#1145). */
  const declaredPolygonOn = new Map<string, number>();
  facts.forEach((f, i) => {
    if (f.t === 'polygon' && !declaredPolygonOn.has(f.id)) declaredPolygonOn.set(f.id, owner[i]);
  });
  /** The refusal for a declared polygon the givens flatten, on line `index` (#1849, ADR-AG-247). */
  const collapseFault = (index: number, ringId: string): LineFault | null => {
    const o = objectById(construction, ringId);
    const at = declaredPolygonOn.get(ringId);
    if (!o || o.kind !== 'polygon' || at === undefined) return null;
    return { index, code: 'polygon-collapsed', detail: lines[index], polygon: o.vertices.join(''), ...(o.noun ? { shape: o.noun } : {}), declared: lines[at] };
  };
  /**
   * THE GIVENS FORCE A DECLARED POLYGON FLAT (#1849, ADR-AG-247 — operator ruling 2026-10-07, ADR-W-115: refuse,
   * in every builder, naming the statements). The drop-one probe names the statement that COMPLETED the
   * contradiction; when the contradiction is that the givens hold only on a collapsed ring of a declared polygon —
   * the thin-ring arm's evidence, read over the window the configuration search already walked — the refusal says
   * so. «לא נמצאה תצורה» would tell the student the search missed, when the givens themselves are what flatten it.
   * A given that cannot hold even flat («AC = 8.1» on 5 and 3) leaves no such evidence and keeps the search's words.
   */
  const flattened = completing !== null ? collapsedByGivens(construction, seed) : [];
  const flatFault = completing !== null && flattened.length > 0 ? collapseFault(completing, flattened[0]) : null;
  if (flatFault) faults.push(flatFault);
  else if (completing !== null && !faults.some((f) => f.index === completing && f.code === 'unsatisfiable')) {
    faults.push({ index: completing, code: 'unsatisfiable', detail: lines[completing] });
  }
  for (const k of completing === null ? figure.unsatisfied : []) {
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
        (c) => c.t === 'choice' && c.options.some((o) => o === k || (o.t === 'all' && o.of.includes(k))),
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
  // A creation a sentence about «המעגל» may make (ADR-AG-196) names its objects on that line too.
  facts.forEach((top, i) => {
    for (const f of factsWithin(top)) {
      if (namesObject(f) && !lineOf.has(f.id)) lineOf.set(f.id, owner[i]);
      /*
       * «אלכסוני המרובע נפגשים בנקודה O» names O through the ring M1 resolves (#1937, ADR-AG-255): a `meet-of` is not a
       * naming fact, so its point had no line, the vacancy pass below skipped it, and a point that could not exist was
       * recorded green and never drawn. The point is the sentence's, whichever spelling minted it.
       */
      if (f.t === 'meet-of' && !lineOf.has(f.id)) lineOf.set(f.id, owner[i]);
      // «BD קוטר» names the circle it creates without an id of its own (#1324) — the one formula M1 mints it by.
      if (f.t === 'diameter-of') {
        const id = diameterCircleId(f.a, f.b);
        if (!lineOf.has(id)) lineOf.set(id, owner[i]);
      }
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
   * **THE PAIR'S OWN FREEDOM, NEVER THE FIGURE'S** (#1938, ADR-AG-254). The ruling's two branches are
   * *"P and B must be on the same location"* versus *"one of them has a degree of freedom"* — a question
   * about the PAIR. This arm borrowed the vacancy pass's whole-figure predicate (`reportedDof === 0`) as
   * an approximation of it, and the approximation leaked exactly where #1929's ring arm leaked: «נקודה Q»
   * typed first — any unrelated free point, line or circle — left the figure 1–2 DOF, the check never
   * fired, and a second name was minted onto an existing point, green, with two labels on one dot. So the
   * predicate is `Figure.separationDof(crossing, holder) === 0`: the freedom of the SEPARATION of those two
   * points along the constraints, where a freedom elsewhere cancels out. On a determined figure it is 0 for
   * every pair, so every figure this already refused is refused identically.
   *
   * The second branch keeps its silence, and keeps it for the right reason: a crossing whose carriers can
   * still move off the holder has `separationDof > 0`, another configuration may separate them, and #1273
   * is what will prefer it. Unmeasured (`undefined` — a point this configuration cannot place) is read as
   * free: a false refusal is the worse defect. This is why the arm sits here rather than in the parser —
   * whether a coincidence is FORCED is a question about the figure.
   *
   * Scoped to a point a sentence CROSSED into being — two incidences and a declaration. A midpoint or
   * a foot landing on an existing point is the same family and is deliberately left for the wider
   * ruling; refusing them here would reach past what was measured.
   */
  {
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
        if (!(Math.hypot(q.x - pt.x, q.y - pt.y) < near)) return false;
        // …and FORCED there, not merely coincident in this configuration (#1938): asked of the pair, so an
        // unrelated free point cannot silence it and a crossing free to move off `q` is still not accused.
        // Asked only of a pair already found near, so a figure with no coincidence ranks nothing.
        return figure.separationDof?.(pt.id, q.id) === 0;
      });
      if (!holder) continue;
      // The refusal names the two operands (#1416) — read off the crossing's own incidences, never assumed lines.
      const said = construction.constraints.filter((k) => incidenceIds(k).includes(pt.id)).map((k) => incidenceWords(construction, k));
      const operands: [string, string] | undefined = said.length === 2 && said[0] && said[1] ? [said[0], said[1]] : undefined;
      faults.push({ index, code: 'crossing-already-named', detail: lines[index], holder: holder.id, ...(operands ? { operands } : {}) });
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
   * choose: the RING has no freedom left (`RingFault.ringDof === 0`, #1929, ADR-AG-249). The student
   * pinned the coordinates, and those coordinates are what make the ring collapsed or crossed.
   *
   * **The ring's own freedom, never the figure's** (#1929). This arm used to wait for the whole figure to
   * reach `reportedDof = 0`, on the premise that "a figure that still has freedom never arrives here
   * carrying a ring fault". That holds only when the freedom belongs to the ring: «נקודה Q» typed first —
   * or a free circle, a free line, an unrelated triangle — left the figure 1–2 DOF and the same pinned
   * bow-tie recorded green. `evaluate`'s `freedomOf` measures the ring's vertices alone, rank-aware, so a
   * freedom elsewhere cancels out and a vertex pinned by two lines, a midpoint or a parameter counts as what
   * it is. A ring that can still move (`ringDof > 0`) is the configuration search's business, as before.
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
   *
   * **A TRAPEZOID WITH BOTH PAIRS OF SIDES PARALLEL is deliberately NOT a member** (#1627, ADR-AG-189
   * Amendment 1 — operator ruling 2026-10-01: givens that force a trapezoid into a rectangle or a
   * parallelogram are *"drawn with warning"*, the 2-D sibling's ADR-165). Unlike crossed and collapsed,
   * that ring is a real, valid quadrilateral the givens describe; the configuration search still prefers
   * a true trapezoid wherever one exists (`drawableAt`'s `whole()`), and when none does the figure is
   * drawn and `app/shapeWarnings.ts` names the trapezoid and the line that forced it.
   */
  /**
   * …and a ring the givens place CROSSED in every configuration (#1927, ADR-AG-250): its vertices can move (a shape's
   * points, `ringDof > 0`), but in every valid candidate `drawableAt`'s walk evaluated it crossed and nowhere was it
   * simple (`Figure.forcedCrossed`), AND its shape is fixed up to an affine map (`shapeDof === 0`), which PROVES the
   * crossing in every configuration rather than in the ones sampled. «ריבוע ABCD · מרובע ACBD» is that: the square's
   * points in a crossing order. «A(k,0) · B(4,0) · C(1,3) · D(3,3) · טרפז ABCD» is not — crossed at every sampled k,
   * simple for k > 4 — and is never refused on samples. Crossed only — a flat ring with freedom is ADR-AG-247's
   * `collapsedByGivens`. One ring at a time, never the figure.
   */
  const forcedCrossed = new Set(figure.forcedCrossed ?? []);
  const pinnedRingFaults = hardRingFaults(figure).filter(
    (rf) => rf.ringDof === 0 || (rf.violation === 'crossed' && forcedCrossed.has(rf.id) && rf.shapeDof === 0),
  );
  if (completing === null && pinnedRingFaults.length > 0) {
    const alreadyFaulted = new Set(faults.map((f) => f.index));
    for (const rf of pinnedRingFaults) {
      const declared = declaredPolygonOn.get(rf.id);
      if (declared === undefined) continue; // no line owns it — nothing honest to say about it
      /**
       * A PINNED RING THAT IS FLAT is #1849's collapse (ADR-AG-247): refused on the line that COMPLETED it — the last
       * of the declaration and the lines that place its vertices — naming the polygon, like the metric-forced member
       * above. «משולש ABC» · «A(0,0)» · «B(1,1)» · «C(2,2)» refuses «C(2,2)»; in the other order, «משולש ABC». A
       * CROSSED pinned ring is not flat: it keeps ADR-AG-129's message, on the declaring line.
       */
      if (rf.violation === 'degenerate') {
        const o = objectById(construction, rf.id);
        const vertexLines = o && o.kind === 'polygon' ? o.vertices.map((v) => pinnedBy.get(v) ?? lineOf.get(v) ?? -1) : [];
        const index = Math.max(declared, ...vertexLines);
        if (alreadyFaulted.has(index) || alreadyFaulted.has(declared)) continue;
        const fault = collapseFault(index, rf.id);
        if (!fault) continue;
        alreadyFaulted.add(index);
        faults.push(fault);
        continue;
      }
      if (alreadyFaulted.has(declared)) continue;
      alreadyFaulted.add(declared);
      faults.push({ index: declared, code: 'ring-contradicts-noun', detail: lines[declared] });
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

  const constraintLine = construction.constraints.map((_, at) => (constraintFact[at] === undefined ? -1 : owner[constraintFact[at]]));
  // #1714: a constraint the parser built as a noun's or a correspondence's DEFINITION is not a stated measure; every
  // other one is a statement (the fold's own attribution, never a list of statement kinds).
  const stated = statedMeasures(
    construction,
    (at) => {
      const f = constraintFact[at] === undefined ? undefined : facts[constraintFact[at]];
      return f === undefined ? undefined : f.t === 'constraint' && f.definition ? 'definition' : 'statement';
    },
    // WHICH option the drawn figure took (#1719): the first that holds on it, read off the figure — `drawableAt` may
    // have drawn another seed's configuration, so the seed alone does not say. None holding (a faulted figure): the seed's.
    (k) => {
      const held = k.options.find((o) => holdsOn(construction, o, figure));
      return resolveChoices([held ?? k], figure.choiceSeed ?? seed);
    },
  );
  return { construction, figure, box: viewBox(figure), seed, faults, outcomes, minted, notices, constraintLine, stated };
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
  // A segment to a minted point was keyed before the point had its name, and a segment id is its two ends SORTED —
  // so it is keyed again from its (now named) ends, or «AP₁» typed later would name a second segment.
  return { facts: out.map((f) => (f.t === 'segment' && f.id.includes(MINT_PREFIX) ? { ...f, id: segmentIdOf(f.a, f.b) } : f)), minted };
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
  /*
   * A sentence about «המעגל» (ADR-AG-196) CREATES its circle only when no circle precedes it — otherwise it is
   * a statement about that one. Read that way here, so «משוואת המעגל היא x²+y²=25» as the first circle is the
   * canonical circle, and a bound sentence adds no second circle to rule 2's count.
   */
  const isCircleFactShallow = (f: Fact): boolean =>
    f.t === 'circle-at' || f.t === 'circle-thru' || f.t === 'diameter-of' || (f.t === 'curve' && f.curve.kind === 'circle');
  /** Will this `the-circle` CREATE, given what precedes it? A static reading of M1's `theCircle`. */
  const willCreate = (f: Extract<Fact, { t: 'the-circle' }>, before: readonly Fact[]): boolean => {
    if (!f.match) return !before.some(isCircleFactShallow);
    if ('eq' in f.match) {
      const made = f.create.find((g) => g.t === 'curve');
      return !made || !before.some((g) => g.t === 'curve' && g.id === made.id);
    }
    return true;
  };
  const predicted: Fact[] = [];
  const creates = new Set<number>();
  facts.forEach((f, i) => {
    if (f.t === 'the-circle' && willCreate(f, predicted)) {
      creates.add(i);
      predicted.push(...f.create);
    } else predicted.push(f);
  });
  const canonicalIds = new Set(predicted.filter(canonical).map((f) => (f as { id: string }).id));
  if (canonicalIds.size === 0) return { facts: [...facts], owner: [...owner], offered: [] };

  /**
   * Rule 2 for the CONTEXTUAL naming «P מרכז המעגל» (#1598, #1619 B1): the sentence names the centre of the
   * one circle, so when the list states exactly one circle and it is this canonical one, the student's letter
   * is the name and no O is offered beside it. With an equation («P מרכז המעגל x^2+y^2=16») it is the circle
   * of that equation. Any other circle in the list makes «המעגל» ambiguous — M1 refuses that sentence, and the
   * default stands.
   */
  const isCircleFact = (f: Fact): boolean => {
    if (f.t === 'circle-at' || f.t === 'circle-thru' || f.t === 'diameter-of') return true;
    if (f.t !== 'curve') return false;
    if (f.curve.kind) return f.curve.kind === 'circle';
    const r = resolveCurve(f.curve, {});
    return r.ok && r.curve.kind === 'circle';
  };
  const circleFacts = new Set(predicted.filter(isCircleFact).map((f) => ('id' in f ? f.id : JSON.stringify(f))));
  const atOrigin = (f: Fact): boolean => {
    if (f.t === 'point') {
      const x = evalExpr(f.x, {});
      const y = evalExpr(f.y, {});
      return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12;
    }
    if (f.t === 'centre-of') return f.eq !== undefined ? isCanonicalCircle(f.eq) : circleFacts.size === 1 && canonicalIds.size === 1;
    // Rule 2: a centre the student named, of a circle centred on the origin, occupies the origin.
    return f.t === 'derived' && !f.auto && f.rule.t === 'circle-centre' && canonicalIds.has(f.rule.curve);
  };
  const definesLetter = (f: Fact): boolean => (f.t === 'point' || f.t === 'derived') && f.id === CENTRE_LETTER;
  if (predicted.some((f) => atOrigin(f) || definesLetter(f))) return { facts: [...facts], owner: [...owner], offered: [] };

  const out: Fact[] = [];
  const outOwner: number[] = [];
  const offered: number[] = [];
  facts.forEach((f, i) => {
    /*
     * The equation of THE circle (ADR-AG-196) CREATES its canonical circle only when no circle precedes it
     * (otherwise it is a statement about that one): the offer rides inside the creation, so a sentence that
     * binds offers nothing.
     */
    if (f.t === 'the-circle' && creates.has(i)) {
      const made = f.create.find((g) => g.t === 'curve' && g.stated && canonicalIds.has(g.id));
      if (made && made.t === 'curve') {
        offered.push(out.length);
        out.push({ ...f, create: [...f.create, { t: 'derived', id: CENTRE_LETTER, rule: { t: 'circle-centre', curve: made.id }, src: f.src, auto: true }] });
        outOwner.push(owner[i]);
        return;
      }
    }
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
  constraintLine: [],
  stated: NO_STATED_MEASURES,
};
