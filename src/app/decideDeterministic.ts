/**
 * THE PRE-LLM DECISION, PURE (#1395) — "what would the 2-D tool do with this line, before any model call?"
 *
 * `runSubmit` decided AND acted in one ~820-line pass: it mutated the store before it had parsed (the #186
 * circle auto-bind and the #539 point auto-bind call `nameCentre` / `rename` inside the parse loop), it
 * interleaved UI notes with every branch, and it could reach the paid model. So nothing could ASK it
 * "would you accept this line?" without doing it. #1358's shared imperative register needs exactly that
 * question answered, and `log-triage` had hand-mirrored the whole lane to answer it — a mirror that drifted
 * four times (ADR-346).
 *
 * This module is that lane, as a function of `(facts, seed, view, utterance, locale)`:
 *
 * - it never touches the store, never logs and never calls the model;
 * - the auto-binds are SIMULATED on a copy of the facts with the store's own pure cores
 *   (`nameCentreFacts`, `renameFacts`), and the verdict carries them for the caller to apply;
 * - every branch returns what it would have done — the note (an i18n key + params), the log events in
 *   order, and whether to commit, clear the text, or escalate.
 *
 * The branch ORDER is `runSubmit`'s, moved verbatim with each branch's own issue/ADR comment. `runSubmit`
 * is now a dispatcher over the verdict, and `triage.mjs` calls the same function. The parity lock
 * (`__tests__/decide-parity-1395-*.test.ts`) replays the whole scenario corpus and every fixture through
 * the dispatcher and compares against the pipeline recorded before this extraction.
 *
 * It is split in two only so the dispatcher can paint the spinner between them: `decidePreParse` is the
 * instant part (store operations and the pre-parse format guards), `decideFromParse` the part that parses
 * and dry-runs. `decideDeterministic2D` is both, for a caller that has no spinner.
 */
import {
  buildParseCtx,
  classifyOutOfScope,
  impliedCircleBinding,
  impliedPointBinding,
  looksLikeLatex,
  teachCanonical,
  statedNegation,
  wordRootMagnitude,
  splitGuidance,
  statedLabelTokens,
  lowercaseLabelFold,
  lowercaseMeasureLetters,
  upperCasedLabelCandidate,
  hebrewLabelCandidate,
  parse,
  parseMerge,
  parseNameCenter,
  parseRename,
  parseSwap,
} from '@/parser';
import { independentConstructs } from './independence';
import type { AnyCommand, Construction, Id, Vec } from '@/engine';
import {
  type Fact,
  autoNamedLabels,
  deferralWorthwhile,
  dryRunOutcome,
  nameCentreFacts,
  renameFacts,
  replay,
  trialFacts,
} from '@/store/geoStore';
import { spanShadow } from '@/parser/spanAccounting';
import { honestyGateReport } from './honestyGates';
import { honoursConstruct, roleReadings } from './roleReadings';

/** What the figure looks like to the parser — the DISPLAY view (the ADR-293 never-blank fallback). */
export interface DecideView {
  construction: Construction;
  positions: Map<Id, Vec>;
}

export interface DecideState {
  readonly facts: readonly Fact[];
  readonly seed: number;
  readonly view: DecideView;
}

/** A note for the input line: an i18n key + params, or a raw engine error the display layer humanizes. */
export type DecideNote =
  /** a param may itself be a translated word, carried as `{ t: key }` for the caller to resolve */
  | { readonly key: string; readonly params?: Record<string, unknown> }
  | { readonly explain: string };

/** A log event the caller emits, in order — `kind`, `utterance` and `locale` are the caller's to add. */
export type DecideLog = Readonly<Record<string, unknown>>;

/** An auto-bind the parse loop made (#186 circle / #539 point) — the caller applies it to the store. */
export interface DecideBind {
  readonly op: 'name-centre' | 'rename';
  readonly from: Id;
  readonly to: Id;
}

export type Verdict2D =
  /** a store operation, not geometry: the caller performs it and reports its own result */
  | {
      readonly kind: 'store-op';
      readonly op: 'swap' | 'name-centre' | 'rename' | 'merge';
      readonly from: Id;
      readonly to: Id;
      /** a size-qualified centre naming also locks which circle is the small one (#178) */
      readonly assert?: { readonly outer: Id; readonly inner: Id };
    }
  /**
   * The line is answered with a note and the text STAYS in the box. `category` is what log-triage reads:
   * a `guided` family the tool answers on purpose, a `clarify` question, or a `conflict` with the figure.
   * `preParse` refusals are decided before the spinner is painted.
   */
  | {
      readonly kind: 'refuse';
      readonly category: 'guided' | 'clarify' | 'conflict';
      readonly preParse: boolean;
      readonly binds: readonly DecideBind[];
      readonly logs: readonly DecideLog[];
      readonly note: DecideNote;
    }
  /** committed as ONE batch (one group, one undo entry); `note` is a teaching note on a successful step */
  | {
      readonly kind: 'commit';
      readonly deferred: boolean;
      readonly binds: readonly DecideBind[];
      readonly commands: readonly AnyCommand[];
      readonly logs: readonly DecideLog[];
      readonly note: DecideNote | null;
    }
  /** nothing to add (already drawn, a restatement, or a name the auto-bind already gave): the text clears */
  | {
      readonly kind: 'noop';
      readonly binds: readonly DecideBind[];
      readonly logs: readonly DecideLog[];
      readonly note: DecideNote | null;
    }
  /** the deterministic lane has no answer: the caller would ask the model. `weak` says why */
  | {
      readonly kind: 'escalate';
      readonly binds: readonly DecideBind[];
      readonly logs: readonly DecideLog[];
      readonly weak: 'error' | 'empty' | 'dropped' | null;
      /** why the grammar declined, when it did (`weak === null`) — what log-triage reports as the gap */
      readonly parseReason: string | null;
    };

export interface DecideHooks {
  /**
   * Warm the fold of a trial fact list (the #41 / ADR-290 worker prefold). An optimisation only: it
   * primes a memo, it never changes a result, so a caller without a worker omits it.
   */
  prefold?(trial: Fact[], seed: number): Promise<void>;
}

/** The instant half: store operations and the pre-parse FORMAT guards. `null` = go on and parse. */
export function decidePreParse(utterance: string, view: DecideView): Verdict2D | null {
  // A swap ("swap C and D" / "החלף בין C ל-D") EXCHANGES two existing labels — a store
  // operation, handled before the parser (and before rename, whose taken-target guard would
  // otherwise reject it). Lets the student flip which end of a chord is C vs D (ADR-122).
  const swp = parseSwap(utterance);
  if (swp) return { kind: 'store-op', op: 'swap', from: swp.a, to: swp.b };
  // NAME an auto-assigned circle centre ("מרכז המעגל הוא P" / "the centre of the circle is P") — the
  // student drew an unnamed circle (hidden auto-centre) and now names it. A store-level RENAME of the
  // hidden centre + a reveal, NOT a second circle (issue #112). Before the parser (whose `circle` rule
  // would otherwise mint circle-P) and before rename (parseNameCenter resolves the hidden source letter).
  const nc = parseNameCenter(utterance, buildParseCtx(view.construction, view.positions));
  if (nc) return { kind: 'store-op', op: 'name-centre', from: nc.from, to: nc.to, ...(nc.assert ? { assert: nc.assert } : {}) };
  // A relabel ("rename E to G" / "שנה שם E ל-G") is a store operation, not a
  // geometry command — handle it before the parser so it never enters the figure.
  const ren = parseRename(utterance);
  if (ren) return { kind: 'store-op', op: 'rename', from: ren.from, to: ren.to };
  // A merge ("merge F into E" / "מזג F ל-E") folds two existing points into one — also a
  // store operation, handled before the parser. Distinct from rename (the target survives).
  const mrg = parseMerge(utterance);
  if (mrg) return { kind: 'store-op', op: 'merge', from: mrg.from, to: mrg.to };
  // LaTeX-pasted input ($…$, \triangle, \parallel) — a FORMAT guide (#329, ADR-289 family). Checked
  // PRE-parse because a `$…$` ratio partial-parses to a WRONG figure (so the post-failure register would
  // miss it), and a `$`/`\`-command never appears in real input, so this can never swallow a construction.
  // Points the student at the plain notation / the symbol palette; never a paid LLM call on LaTeX.
  if (looksLikeLatex(utterance)) {
    return { kind: 'refuse', category: 'guided', preParse: true, binds: [], logs: [{ source: 'scope', result: 'scope:latex' }], note: { key: 'input.scope.latex' } };
  }
  // A NEGATED statement (#436, the P1) — refused here, PRE-parse, for the LaTeX reason verbatim: every
  // rule stepped over the negation word, so the negated form lowered to the POSITIVE form's commands
  // («זווית A לא ישרה» → `set-angle A = 90`) and committed the opposite of the given with a green ✓.
  // A wrong figure that agrees with nothing the student said is the worst outcome the tool can produce;
  // an honest refusal is strictly better until the requirement lane can represent an exclusion.
  const negated = statedNegation(utterance);
  if (negated) {
    return { kind: 'refuse', category: 'guided', preParse: true, binds: [], logs: [{ source: 'scope', result: 'scope:negation' }], note: { key: 'input.scope.negation', params: { word: negated } } };
  }
  return null;
}

/** The categories answered with guidance BEFORE the model (ADR-289; #1357 added `unrelated`). */
export const PRE_LLM = new Set(['analytic', 'cross-app', 'ui-command', 'valueless-query', 'orientation', 'bare-point', 'unnamed-sides', 'compound-relation', 'unrelated']);

/** The parse-and-dry-run half. Assumes {@link decidePreParse} returned `null` for this utterance. */
export async function decideFromParse(
  state: DecideState,
  utterance: string,
  locale: 'he' | 'en',
  hooks: DecideHooks = {},
): Promise<Verdict2D> {
  const logs: DecideLog[] = [];
  const binds: DecideBind[] = [];
  /** The facts as the auto-binds leave them — a COPY; the store is never touched here. */
  let facts: Fact[] = [...state.facts];
  const seed = state.seed;
  const refuse = (category: 'guided' | 'clarify' | 'conflict', log: DecideLog, note: DecideNote): Verdict2D => ({
    kind: 'refuse', category, preParse: false, binds, logs: [...logs, log], note,
  });
  /** The parse context a later re-read sees: the display view until a bind changes the figure. */
  let viewNow = (): DecideView => state.view;

  let pctx = buildParseCtx(state.view.construction, state.view.positions);
  let r = parse(utterance, pctx);
  // #186: a circle referenced BY NAME that matches no existing circle, while UNNAMED (auto-centre)
  // circles are on canvas, is naming-by-use of one of THEM — the student cannot know the internal
  // names (hidden centres, FR-RN-8) and refers to a drawn circle by a name of their own («D ו F על
  // מעגל O1» after «שני מעגלים נחתכים», prod session hqxbjh0x). Committing the parser's invented
  // circle would silently build a WRONG figure (a third circle). Bind the fresh name to the
  // resolvable unnamed circle (the #112 `nameCentre` machinery) and re-parse; genuinely ambiguous →
  // ask which circle is meant (never a silent pick, never an LLM guess).
  let boundName = false; // a #186 auto-bind happened — the submission already changed the figure (a naming)
  for (let guard = 0; r.ok && guard < 3; guard++) {
    const bind = impliedCircleBinding(r.commands, pctx);
    if (bind && 'clarify' in bind) {
      return refuse('clarify', { source: 'parser', result: `unknown-circle:${bind.center}` }, { key: 'input.unknownCircle', params: { center: bind.center } });
    }
    if (bind) {
      const res = nameCentreFacts(facts, bind.from, bind.to);
      if (!res.ok) break; // can't bind (e.g. letter taken) — the implicit creation stands, as before
      facts = res.facts;
      binds.push({ op: 'name-centre', from: bind.from, to: bind.to });
      boundName = true;
      logs.push({ source: 'name-center', rename: bind, result: 'auto-bind', intermediate: true });
    } else {
      // #539 — the POINT edition: a fresh set-line label whose stated slot an AUTO-NAMED drawn point
      // structurally occupies is that point under the student's name (the touch «M» typed as «E») —
      // rename it instead of minting a duplicate node beside it.
      const pbind = impliedPointBinding(r.commands, pctx, autoNamedLabels(facts));
      if (!pbind) break;
      const res = renameFacts(facts, pbind.from, pbind.to);
      if (!res.ok) break; // can't bind — the fresh-rider reading stands, as before
      facts = res.facts;
      binds.push({ op: 'rename', from: pbind.from, to: pbind.to });
      boundName = true;
      logs.push({ source: 'rename', rename: pbind, result: 'auto-bind-point', intermediate: true });
    }
    const d = replay(facts, seed);
    viewNow = () => ({ construction: d.construction, positions: d.positions });
    pctx = buildParseCtx(d.construction, d.positions);
    r = parse(utterance, pctx);
  }
  // #770 — a definite SHAPE reference whose named kind is not in the figure («אלכסוני הריבוע» on a
  // trapezoid-only figure): refuse naming the statement, keep the text. Deterministic — the LLM could
  // only bind something the student did not say (ADR-052).
  if (!r.ok && r.reason === 'shape-not-found') {
    return refuse('guided', { source: 'parser', result: `shape-not-found:${r.noun}` }, { key: 'input.shapeNotFound', params: { noun: r.noun } });
  }
  // #835 — a polygon noun outside the supported bare set. The operator's ruling is that the rest are
  // NOT supported and say so BY NAME: escalating would hand the LLM a shape it can only invent, and the
  // student would get a figure they never described. Naming what DOES build turns a refusal into a
  // usable next step.
  if (!r.ok && r.reason === 'polygon-not-supported') {
    return refuse('guided', { source: 'parser', result: `polygon-not-supported:${r.noun}` }, { key: 'input.polygonNotSupported', params: { noun: r.noun, offer: r.offer.join(', ') } });
  }
  // A single-vertex angle ("∠B = 90") the parser flagged as ambiguous (the vertex has ≠2 edges, so WHICH
  // angle is meant is unclear) — ask the student to name all three letters instead of escalating to the LLM
  // (which would only guess). Keep the text so they can edit it into the three-letter form.
  // #554: «המשיקים נחתכים בנקודה E» with more than two tangents drawn — ask WHICH two (name them, as the
  // one-utterance form does) instead of guessing or paying the LLM to guess.
  if (!r.ok && r.reason === 'tangents-ambiguous') {
    return refuse('clarify', { source: 'parser', result: `tangents-ambiguous:${r.points.join(',')}` }, { key: 'input.tangentsAmbiguous', params: { points: r.points.join(', '), a: r.points[0] ?? 'A', b: r.points[1] ?? 'B' } });
  }
  if (!r.ok && r.reason === 'ambiguous-angle') {
    return refuse('clarify', { source: 'parser', result: `ambiguous-angle:${r.vertex}` }, { key: 'input.ambiguousAngle', params: { vertex: r.vertex } });
  }
  // An angle-alias name that is already taken (an existing point, or an alias bound to a different
  // angle) — the student picks another name (#235, ADR-386); never a silent rebind or an LLM guess.
  if (!r.ok && r.reason === 'alias-taken') {
    return refuse('clarify', { source: 'parser', result: `alias-taken:${r.name}` }, { key: 'input.aliasTaken', params: { name: r.name } });
  }
  // #775: a side named by its ROLE («ליתר», «לבסיס») with no unique referent — the figure has no
  // declared right triangle / isosceles to resolve it against, or the role is genuinely ambiguous
  // (two legs). Say what is missing and keep the text; never guess a side, never a paid LLM call
  // that would have to invent one.
  // #957 ([ADR-494](../../docs/06-decisions.md#adr-494)): a side clause on a shape whose sides are not
  // equal by definition. The grammar READ the sentence; what is missing is which side, and inventing it
  // is the ADR-052 cardinal sin — so ask, keep the text, and never spend a paid call on a guess.
  if (!r.ok && r.reason === 'side-unspecified') {
    return refuse('clarify', { source: 'parser', result: `side-unspecified:${r.noun}` }, { key: 'input.sideUnspecified', params: { noun: r.noun, value: r.value, a: 'AB' } });
  }
  if (!r.ok && r.reason === 'role-side-unresolved') {
    return refuse('clarify', { source: 'parser', result: `role-side-unresolved:${r.role}` }, { key: 'input.roleSideUnresolved', params: { role: r.role } });
  }
  // #777: a comparative with no COMPARAND («צלע AD גדולה פי 2» — twice WHAT?). The second operand is
  // simply absent, so the only way to build it is to invent one — a given the student never stated
  // (ADR-052), shown with a green ✓. Escalating is the same error one step removed: the LLM would have
  // to guess precisely the missing thing, and whatever it guesses the tool then teaches back. Ask, and
  // keep the text so they can complete it in place.
  if (!r.ok && r.reason === 'incomplete-comparative') {
    return refuse('clarify', { source: 'parser', result: `incomplete-comparative:${r.subject}` }, { key: 'input.incompleteComparative', params: { subject: r.subject, factor: r.factor } });
  }
  // #967: an angle addressed by its two SIDES whose segments do not MEET («הזווית בין AB ל-CD»). Two
  // disjoint segments have no vertex between them, so there is no angle of the kind this tool constrains
  // (that would be a line-line angle — a constraint kind 2-D does not have). Picking some nearby vertex
  // would assert a given the student never stated; escalating hands the LLM the same invention to make.
  // So it is refused BY NAME, quoting the two segments back (the honesty invariant), and the text stays.
  /**
   * #1266: a CEVIAN sentence the grammar read and rejected on its own letters — «BD גובה לצלע AB»,
   * «AB תיכון לצלע BC». It used to answer `not-handled`, which sent a sentence the tool understands
   * perfectly to the paid model and told the student their words were unreadable. The rule owes an
   * answer about what it matched, and `why` decides which impossibility to name.
   */
  if (!r.ok && r.reason === 'cevian-degenerate') {
    const kind = r.role === 'median' ? 'input.cevianRoleMedian' : 'input.cevianRoleAltitude';
    const key =
      r.why === 'apex-on-side'
        ? 'input.cevianApexOnSide'
        : r.why === 'median-foot-at-end'
          ? 'input.cevianMedianFootAtEnd'
          : 'input.cevianApexIsFoot';
    // `kind` is itself a translated word: carried as a key the caller resolves (`{ t: key }`)
    return refuse('guided', { source: 'parser', result: `cevian-degenerate:${r.why}:${r.apex}${r.foot}/${r.side.join('')}` }, { key, params: { apex: r.apex, foot: r.foot, side: r.side.join(''), kind: { t: kind } } });
  }
  /**
   * #1267: «BD חוצה זווית לצלע BC» — the bisector from B meets AC, and the side the student NAMED
   * is not one it can meet. Both are quoted back; the figure is never quietly drawn to the other one.
   */
  /**
   * #1000 (operator ruling 2026-09-14): a bare copula between two arcs reads as IDENTITY in Hebrew —
   * this arc *is* that arc — which between two differently-named arcs says nothing. The tool declines
   * it and offers the sentence it accepts, with the student’s own labels in it, so the correction is
   * one word rather than a rewrite. Never escalated: the LLM would only be asked to accept a spelling
   * this tool deliberately declines.
   */
  if (!r.ok && r.reason === 'arc-copula') {
    return refuse('guided', { source: 'parser', result: `arc-copula:${r.a}/${r.b}` }, { key: 'input.arcCopula', params: { a: r.a, b: r.b } });
  }
  if (!r.ok && r.reason === 'cevian-wrong-side') {
    return refuse('guided', { source: 'parser', result: `cevian-wrong-side:${r.apex}:${r.stated.join('')}/${r.actual.join('')}` }, { key: 'input.cevianWrongSide', params: { apex: r.apex, stated: r.stated.join(''), actual: r.actual.join('') } });
  }
  // #1285: the same channel — the angle's stated vertex is not the bisector's own first letter.
  if (!r.ok && r.reason === 'bisector-wrong-apex') {
    return refuse('guided', { source: 'parser', result: `bisector-wrong-apex:${r.apex}:${r.stated}` }, { key: 'input.bisectorWrongApex', params: { apex: r.apex, stated: r.stated } });
  }
  /**
   * #1274 (operator ruling, ADR-W-066): «D = חיתוך AB ו-BC» — AB and BC meet at B and nowhere else, so
   * the letter the student asked for would be a second name for a point the figure already has. The
   * crossing is AFFIRMED and the name refused (3-D's ADR-3D-183 wording, now 2-D's too); the text stays
   * in the box and no paid call is made to be told the same thing.
   */
  if (!r.ok && r.reason === 'crossing-already-named') {
    return refuse('guided', { source: 'parser', result: `crossing-already-named:${r.holder}:${r.s1.join('')}/${r.s2.join('')}` }, { key: 'input.crossingAlreadyNamed', params: { holder: r.holder, id: r.id, s1: r.s1.join(''), s2: r.s2.join('') } });
  }
  if (!r.ok && r.reason === 'angle-sides-disjoint') {
    return refuse('guided', { source: 'parser', result: `angle-sides-disjoint:${r.s1}/${r.s2}` }, { key: 'input.angleSidesDisjoint', params: { s1: r.s1, s2: r.s2 } });
  }
  // A BOUND radius symbol («R» after «רדיוס מעגל O הוא R») reused as a POINT label («מיתר AR») — once bound,
  // the letter IS the parametric radius, never a node (operator ruling, #198). Say so deterministically and
  // keep the text so the student renames the point; never a paid LLM call that would mint the node R.
  if (!r.ok && r.reason === 'reserved-symbol') {
    return refuse('guided', { source: 'parser', result: `reserved-symbol:${r.symbol}` }, { key: 'input.reservedSymbol', params: { symbol: r.symbol } });
  }
  // A reference to a centre carrying a CONCENTRIC PAIR with no outer/inner qualifier (ADR-244) — ask
  // WHICH circle is meant instead of picking silently or escalating to the LLM (which would only guess).
  if (!r.ok && r.reason === 'ambiguous-circle') {
    return refuse('clarify', { source: 'parser', result: `ambiguous-circle:${r.center}` }, { key: 'input.ambiguousCircle', params: { center: r.center } });
  }
  // #546 (ADR-443): a circle-construct statement whose ANONYMOUS circle reference could not be bound —
  // ≥2 circles and even the membership tie-break says nothing — WHICH circle is the student's to say
  // (ADR-052). Ask, naming the candidates; never a silent pick and never a paid LLM call that would guess.
  if (!r.ok && r.reason === 'ambiguous-circle-ref') {
    return refuse('clarify', { source: 'parser', result: `ambiguous-circle-ref:${r.centers.join(',')}` }, { key: 'input.ambiguousCircleRef', params: { circles: r.centers.join(', '), first: r.centers[0] ?? 'O' } });
  }
  // #519 (ADR-477): a SHAPE-consuming construct on a figure with 2+ candidate shapes — WHICH shape is
  // the student's to say (ADR-052). The owning rules already declined; before this the decline went to
  // the LLM lane, whose guess parses and commits. Ask, naming the candidates.
  if (!r.ok && r.reason === 'ambiguous-shape') {
    return refuse('clarify', { source: 'parser', result: `ambiguous-shape:${r.noun}:${r.shapes.join(',')}` }, { key: 'input.ambiguousShape', params: { shapes: r.shapes.join(', '), first: r.shapes[0] ?? 'ABCD' } });
  }
  // #889: the SIBLING ask, and a different question — «מרובע ABCD עם אלכסון» names its shape and
  // leaves the CONSTRUCT open. The candidates are constructs that do not exist yet, so the answer is
  // one of them typed back verbatim; `ambiguousShape`'s wording («צורות», «בשרטוט», a hardcoded
  // «אלכסוני») is false for every one of those and produced «אלכסוני גובה מ-A». Its own message.
  if (!r.ok && r.reason === 'ambiguous-construct') {
    return refuse('clarify', { source: 'parser', result: `ambiguous-construct:${r.noun}:${r.options.join(',')}` }, { key: 'input.ambiguousConstruct', params: { noun: r.noun, options: r.options.join(', '), first: r.options[0] ?? '' } });
  }
  // #354: a containment whose CONTAINER was not named, on a figure with 2+ circles — which one contains it
  // is the student's to say (ADR-052), so ask instead of escalating to an LLM that could only guess.
  if (!r.ok && r.reason === 'ambiguous-container') {
    return refuse('clarify', { source: 'parser', result: `ambiguous-container:${r.centers.join(',')}` }, { key: 'input.ambiguousContainer', params: { circles: r.centers.join(', ') } });
  }
  // Every common tangent of the requested kind is already drawn (#197 Am. 3) — a further one does not
  // exist; say so plainly instead of escalating or grinding an impossible solve.
  if (!r.ok && r.reason === 'tangents-exhausted') {
    // Position-accurate refusal (#197 Am. 8): the true tangent count depends on the pair's mutual
    // position — disjoint 4, externally tangent 3, intersecting 2, internally tangent 1, contained 0.
    const msgKey =
      r.hint === 'at-touch' ? 'input.tangentsExhaustedTouch'
      : r.position === 'contained' ? 'input.tangentsExhaustedContained'
      : r.position === 'int-tangent' ? (r.kind === 'internal' ? 'input.tangentsExhaustedNoInternal' : 'input.tangentsExhaustedIntTangent')
      : r.position === 'intersecting' ? (r.kind === 'internal' ? 'input.tangentsExhaustedNoInternal' : 'input.tangentsExhaustedIntersecting')
      : r.position === 'ext-tangent' ? (r.kind === 'external' ? 'input.tangentsExhaustedExternal' : r.kind === 'internal' ? 'input.tangentsExhaustedTouchTaken' : 'input.tangentsExhaustedExtTangent')
      : r.kind === 'external' ? 'input.tangentsExhaustedExternal'
      : r.kind === 'internal' ? 'input.tangentsExhaustedInternal'
      : 'input.tangentsExhaustedAny';
    return refuse('guided', { source: 'parser', result: `tangents-exhausted:${r.kind}` }, { key: msgKey });
  }
  // Analytic / coordinate-geometry terminology (axes, coordinates, slope, line equations) — a DIFFERENT
  // tool. This one builds synthetic constructions; a coordinate-geometry tool is planned separately.
  // Refuse immediately with the pedagogical "wrong tool" message and tag it `scope:analytic` — never spend
  // an LLM call on input that can never build. (Runs only on a failed grammar parse; a coordinate free-point
  // like "A = (3,5)" parses via `freePoint` and never reaches here.)
  if (!r.ok) {
    const oos = classifyOutOfScope(utterance);
    // #43 (ADR-289): the whole GUIDANCE register short-circuits BEFORE the LLM — none of these
    // families can ever build, so an LLM call on them is pure cost (the analytic precedent).
    // #1357: `unrelated` (no construction signal at all) joins the set — junk was classified BEFORE the call
    // and paid for anyway, the category read only afterwards to word the message.
    if (oos && PRE_LLM.has(oos.category)) {
      return refuse('guided', { source: 'scope', result: `scope:${oos.category}` }, { key: oos.messageKey, params: oos.params });
    }
  }
  // #779 — the CONVENTION nudge (operator ruling: lowercase labels are TAUGHT, never silently
  // rewritten). The grammar's captures accept lowercase and upper-case on the way in; a parse that
  // did that must refuse and show the corrected sentence, or the tool teaches the wrong notation —
  // and the silent rewrite is exactly what blinded the dropped-label gates to lowercase input (the
  // P1's mechanism). Runs BEFORE the honesty battery so no lowercase-label utterance reaches any
  // commit path, deterministic or LLM. Mirrors 3-D's `scope:lowercase-labels`.
  if (r.ok) {
    const fold = lowercaseLabelFold(utterance, r.commands);
    if (fold) {
      return refuse('guided', { source: 'scope', result: 'scope:lowercase-labels', commands: r.commands }, { key: 'input.scope.lowercase-labels', params: { corrected: fold.corrected } });
    }
  }
  let weak: 'error' | 'empty' | 'dropped' | null = null;
  if (r.ok) {
    // THE HONESTY-GATE BATTERY. Every gate, its rationale and its ADR now live in one place —
    // `@/app/honestyGates` — because this block used to BE the battery, and a seam that did not
    // contain it therefore had none (#782: the ✎ edit path committed partial parses for as long as
    // the gates have existed). Both commit seams call the same function; adding a gate there reaches
    // both the day it is written (ADR-W-006 — derive, don't duplicate).
    const gates = honestyGateReport(utterance, r.commands, pctx);
    const { dropped, droppedNums, droppedRels, droppedVerbs, droppedCompound, droppedConstruct, unaccounted } = gates;
    if (gates.clean) {
      // #41 (ADR-290): warm the candidate content's FOLD in the geometry WORKER first — the dry-run,
      // the commit, and every later replay of this content then run at TAIL speed on the main thread
      // (the one unbudgeted cold fold, measured ~26 s on the #59 figure, used to block the tab here).
      if (hooks.prefold) await hooks.prefold(trialFacts(facts, r.commands), seed);
      // A deterministic parse can "succeed" yet build NOTHING — apply with an error (kept-prior) or
      // change nothing at all. Dry-run before committing so a silent fail isn't shown as success
      // (operator request); a step that builds something commits immediately.
      let outcome = dryRunOutcome(facts, r.commands, seed);
      /**
       * A ROLE-ASSIGNED LETTER RUN IS RE-READ BEFORE IT IS REFUSED (#1012).
       *
       * «רבע מעגל OAB» means *centre O, ends A and B* — a convention the catalog never taught. So
       * «רבע מעגל ODC» was refused after ~17 s, blaming the student's «O על AC», while «רבע מעגל CDO»
       * built the very same figure in one second.
       *
       * The run is re-read over the other role assignments and the first that BUILDS is adopted, then
       * taught below through the canonical-hint seam that already exists. Ordered by a probe over the
       * figure the student already has, so the reading that works is tried first and costs one dry run
       * rather than three (`roleReadings`).
       *
       * Nothing is spent when there is no such run — the overwhelmingly common case returns `null`
       * before any work — and nothing is spent when no alternative reading is more promising than what
       * the student wrote, which is what keeps an honest refusal close to the cost it has today.
       */
      let adopted: string | null = null;
      if (!outcome.produced) {
        const readings = roleReadings(utterance, r.commands, (s) => replay(facts, s).positions);
        for (const reading of readings ?? []) {
          const alt = parse(reading.utterance, pctx);
          if (!alt.ok || !honestyGateReport(reading.utterance, alt.commands, pctx).clean) continue;
          const tryOutcome = dryRunOutcome(facts, alt.commands, seed);
          if (!tryOutcome.produced) continue;
          /**
           * `produced` means SOMETHING was built, not that the construct's promise holds — measured,
           * «רבע מעגל CAB» produces a "quarter circle" whose two radii are 15 and 10. Answering a
           * refusal with a wrong figure would be strictly worse than the refusal, so an adopted
           * reading has to honour what it claims to be.
           */
          if (!honoursConstruct(alt.commands, replay(trialFacts(facts, alt.commands), seed).positions)) continue;
          r = alt;
          outcome = tryOutcome;
          adopted = reading.utterance;
          break;
        }
      }
      if (outcome.produced) {
        // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
        // SPAN-ACCOUNTING SHADOW (S3.1 of docs/24 — never refuses; the enforcing flip is the
        // operator's, §4.2): log what the total accountant WOULD have flagged on this committed
        // parse, so real traffic accumulates the divergence evidence the flip decision needs.
        const shadow = spanShadow(utterance, r.commands, { existingPoints: pctx.points, radiusSymbols: (pctx.radiusSymbols ?? []).map((x) => x.name), angleAliases: (pctx.angleAliases ?? []).map((x) => x.name) });
        const commitLogs: DecideLog[] = [...logs, { source: 'parser', commands: r.commands, ...(shadow ? { spanShadow: shadow } : {}) }];
        // ADR-428 obligation 2 — TEACH on acceptance. The step committed; if the phrasing was understood
        // but is not the canonical form, show the canonical spelling so the habit the student builds is
        // one we can promise to honour. A note on a SUCCESSFUL step, never a refusal.
        // #786 (ADR-460 Am. 2, operator ruling 2026-08-26): the deterministic clause fallback BUILT a line the
        // student packed with ≥2 INDEPENDENT constructs («משולש ABC, ריבוע WERT» / "triangle ABC and square WERT").
        // The figure IS what they asked for, so it draws — and the same one-at-a-time teaching #763 gives at the
        // escalation seam is given here as an ADVISORY on the successful step, never a refusal. Judged by the
        // same discriminator (`independentConstructs`: every clause parses and builds standalone, no shared
        // label, no back-reference), so a supported connector compound («ריבוע ABCD, נקודה G על AD») — whose
        // later clause CONSTRAINS the earlier — gets no tip. A false "independent" here costs a spurious tip,
        // not a refusal: the safe direction, which is why the check may sit in the deterministic lane at all.
        const packed = independentConstructs(utterance);
        // An ADOPTED reading is its own canonical spelling (#1012): the sentence we actually built is
        // the one to teach, and teaching it is what keeps the adoption from being silent (#778).
        const teach = adopted ?? (packed ? null : teachCanonical(utterance, r.commands, locale));
        let note: DecideNote | null = null;
        if (adopted) note = { key: 'input.canonicalHint', params: { canonical: adopted } };
        else if (packed) {
          commitLogs.push({ source: 'parser', result: 'advisory:independent-clauses', commands: r.commands });
          note = { key: 'input.scope.split-advisory', params: packed.params };
        } else if (teach) note = { key: 'input.canonicalHint', params: { canonical: teach } };
        // #779 Am. (operator ruling 2026-08-25): a lowercase MEASURE letter the parse bound
        // case-preserved («שרדיוסו r») gets a non-blocking note saying WHY lowercase passed here —
        // measure letters keep their case (the exam's R vs r), point labels are uppercase.
        else {
          const lm = lowercaseMeasureLetters(r.commands);
          if (lm.length) note = { key: 'input.measureCaseNote', params: { letter: lm.join(', ') } };
        }
        return { kind: 'commit', deferred: false, binds, commands: r.commands, logs: commitLogs, note };
      }
      // A cleanly-parsed CONSTRAINT that errored only because it can't be satisfied AT THIS POSITION (an
      // under-determined coupled solve before its pinning givens arrive — e.g. "CE⟂AB" before "CD=36,
      // DE=18") is NOT an LLM problem: the LLM would re-emit the same command, or drop it. Commit it so
      // `replay`'s deferral retries it once the later givens pin the figure (ADR-104) — order-independence.
      // A genuine contradiction then surfaces honestly as a failing step instead of "couldn't read that".
      // The gate is the SAME one `classify` applies after replay (issue #207 / ADR-385): a CONCLUDED
      // contradiction — a relation whose residual is invariant or provably one-signed across the free
      // configurations — must take the honest-refusal route below, never park as «waiting for givens».
      if (outcome.reason === 'error' && deferralWorthwhile(facts, r.commands)) {
        return {
          kind: 'commit', deferred: true, binds, commands: r.commands, note: null,
          logs: [...logs, { source: 'parser', result: 'deferred-constraint', detail: outcome.detail, commands: r.commands }],
        };
      }
      // A cleanly-PARSED command the engine CAN'T satisfy against the current figure (and not a deferrable
      // constraint) is a CONTRADICTION with the existing data — not a phrasing problem, so the LLM can't fix
      // it (it would re-emit the same in-grammar command). Show the SPECIFIC reason (humanized: "…contradicts
      // an earlier given", "C is already defined — edit/delete the earlier step") instead of the generic
      // "produced nothing". (ADR-156 follow-up — the "impossible with the current data" message.)
      if (outcome.reason === 'error') {
        // #943 (ADR-487): the refusal names the STATEMENT. On this path the sentence needs no lookup at
        // all — it is the text the student just typed, still in the box, and this is the path the
        // reported case actually takes: a contradicting line is refused BEFORE it becomes a fact, so
        // the fact-list lookup the banner uses has nothing to find here.
        return refuse(
          'conflict',
          { source: 'parser', result: `conflict:${outcome.detail ?? ''}`, commands: r.commands },
          outcome.detail ? { explain: outcome.detail } : { key: 'input.producedNothing' },
        ); // keep the text so the student can edit/delete it
      }
      // A clean RE-ENTRY of things that already exist (re-typing a shape, re-inscribing points already on
      // the circle) parses fine but produces nothing NEW. That's not a failure and must not escalate to the
      // LLM (which would just say "couldn't build"): tell the student it's already drawn. Signal: produced
      // nothing, NOT an error, and the utterance introduces no new label (every label it names already
      // exists). (ADR-156 follow-up — the friendly no-op message.)
      /**
       * A RESTATEMENT IN ANOTHER SPELLING (#999, ADR-542) — «AB ⟂ BC» after «∠ABC = 90».
       *
       * Understood perfectly and adding nothing, so it takes the «כבר קיים» note directly and never
       * escalates: reaching the LLM would spend a call on a sentence the parser read correctly, and the
       * model could only answer "couldn't build". Its own log result, so the class is countable.
       */
      if (outcome.reason === 'implied') {
        return { kind: 'noop', binds, logs: [...logs, { source: 'parser', result: 'implied-restatement', commands: r.commands }], note: { key: 'input.alreadyDrawn' } };
      }
      if (outcome.reason === 'empty') {
        // A #186 auto-bind ALREADY changed the figure (an unnamed circle took the student's name and
        // its centre revealed) — geometrically-idempotent leftovers ("D,F on circle O1" when D,F
        // already ride it) are then a SUCCESS, not "already drawn" and never an LLM escalation.
        if (boundName) {
          return { kind: 'noop', binds, logs: [...logs, { source: 'parser', result: 'bound-circle-name', commands: r.commands }], note: null };
        }
        const existing = new Set((pctx.points ?? []).map((p) => p.toUpperCase()));
        const newLabels = statedLabelTokens(utterance).filter((l) => !existing.has(l)); // case-blind (#779)
        if (newLabels.length === 0) {
          return { kind: 'noop', binds, logs: [...logs, { source: 'parser', result: 'noop-exists', commands: r.commands }], note: { key: 'input.alreadyDrawn' } };
        }
      }
      weak = outcome.reason; // parsed but produced nothing → fall through to the LLM second attempt
      // `intermediate`: this weak grammar attempt ALWAYS escalates to the LLM below, whose outcome is
      // logged as the submission's FINAL result — keep this step in the DEV trace but don't let it
      // become a second analytics `submit` (else the dashboard double-counts the utterance). See sessionLog.
      logs.push({ source: 'parser', result: `weak:${outcome.reason}`, detail: outcome.detail, commands: r.commands, intermediate: true });
    } else {
      weak = 'dropped'; // a typo dropped a stated label/number/relation/verb/compound-structure/object → escalate rather than commit the partial parse
      logs.push({ source: 'parser', result: `weak:dropped:${[...dropped, ...droppedNums, ...droppedRels, ...droppedVerbs, ...droppedCompound, ...droppedConstruct, ...unaccounted.map((x) => `${x.kind}:${x.text}`)].join(',')}`, commands: r.commands, intermediate: true });
    }
  }
  // A magnitude written with the WORD «שורש N» that reached the escalation seam — the #105 `שורש→√`
  // normalization already builds the forms that CAN (e.g. «AB = שורש 27»), so those never get here; the
  // rest (the area copula «שטח … שווה לשורש 27») get the "use the √ symbol" nudge instead of a paid LLM
  // call that would only re-fail (#246, operator ruling 2026-07-21). Only at the seam, so a working שורש
  // form is never brushed off. The FORMAT twin of the pre-parse LaTeX guard above.
  if (wordRootMagnitude(utterance)) {
    return refuse('guided', { source: 'scope', result: 'scope:word-root' }, { key: 'input.scope.word-root' });
  }
  // #108 (operator ruling): a COMPOUND line — a shape noun with a property glued on, or several sentences
  // at once — is TAUGHT, not auto-parsed: quote the pieces back as numbered steps. Checked at the seam (like
  // the two guards above) because a SUPPORTED compound (ADR-264's connector form «דלתון ABCD, AB=AD»)
  // matches the same shape and parses — so this must only ever see input the grammar already declined. An
  // LLM call here would be both cost and the wrong answer: it would silently parse what the ruling forbids.
  const split = splitGuidance(utterance);
  if (split) {
    return refuse('guided', { source: 'scope', result: `scope:${split.category}` }, { key: split.messageKey, params: split.params });
  }
  // #763 (operator ruling 2026-08-19) — the same teaching, for the compounds `splitGuidance` cannot
  // see. Its separator is a hand-listed noun set, so «…ואלכסון AB» sailed past it and the LLM
  // DECOMPOSED the line and built both halves: two tangent circles plus a segment belonging to
  // nothing, one green ✓. `independentConstructs` derives the same judgement from the tool itself —
  // each clause must PARSE and BUILD standalone — instead of from a noun list. Same seam, same
  // reason, and the seam is the safety property: it only ever sees input the grammar already
  // declined, which is what keeps ADR-460's four residual catalog false positives unreachable.
  const independent = independentConstructs(utterance);
  if (independent) {
    return refuse('guided', { source: 'scope', result: `scope:${independent.category}:independent` }, { key: independent.messageKey, params: independent.params });
  }
  // #779 — the FAILED-parse half of the convention nudge, the direct 3-D mirror: if upper-casing the
  // lowercase runs yields a sentence the grammar DOES parse, the input was a supported construction in
  // the wrong case — teach the convention instead of a paid LLM call. Proof-based: the note fires only
  // when the candidate actually parses, so a genuine gap stays a genuine gap and escalates as before.
  if (!r.ok) {
    const lifted = upperCasedLabelCandidate(utterance);
    if (lifted) {
      const v = viewNow();
      const lr = parse(lifted, buildParseCtx(v.construction, v.positions));
      if (lr.ok && lr.commands.length > 0) {
        return refuse('guided', { source: 'scope', result: 'scope:lowercase-labels' }, { key: 'input.scope.lowercase-labels', params: { corrected: lifted } });
      }
    }
  }
  // #968 — HEBREW-LETTER vertex labels («מלבן אבגד»), the same nudge one alphabet over. Israeli textbooks
  // name vertices א-ב-ג-ד, so the student is following their book; our label space is uppercase Latin. In
  // prod this logged not-understood — the LLM failed too — so the session produced nothing. Operator ruling
  // (2026-09-10): REJECT with a notice pointing at uppercase Latin letters, rather than supporting the
  // alphabet (real support would reach labels, RTL direction, export and every `seg-AB` id). Proof-based
  // like #779 above: the note fires only when the transliterated sentence actually parses, so a genuine
  // gap still escalates. Pre-LLM, so the wasted paid call the prod session made cannot happen again.
  if (!r.ok) {
    const latin = hebrewLabelCandidate(utterance);
    if (latin) {
      const v = viewNow();
      const hr = parse(latin, buildParseCtx(v.construction, v.positions));
      if (hr.ok && hr.commands.length > 0) {
        return refuse('guided', { source: 'scope', result: 'scope:hebrew-labels' }, { key: 'input.scope.hebrew-labels', params: { corrected: latin } });
      }
    }
  }
  // out of grammar, OR a deterministic parse that built nothing → the caller asks the model
  return { kind: 'escalate', binds, logs, weak, parseReason: r.ok ? null : r.reason };
}

/** The whole pre-LLM lane in one call — for a caller with no spinner to paint (log-triage, #1358). */
export async function decideDeterministic2D(
  state: DecideState,
  utterance: string,
  locale: 'he' | 'en',
  hooks: DecideHooks = {},
): Promise<Verdict2D> {
  return decidePreParse(utterance, state.view) ?? decideFromParse(state, utterance, locale, hooks);
}
