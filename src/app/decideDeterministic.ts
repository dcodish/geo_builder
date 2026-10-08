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
  fractionTeachCandidate,
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
  typedLabels,
} from '@/parser';
import { independentConstructs } from './independence';
import { compoundNotHonoured, droppedClause } from './clauseCoverage';
import { lostPartNote } from './unreadParts';
import { lostRoleNote } from './unreadRoles';
import { applyCommand, type AnyCommand, type Command, type Construction, type Id, type Vec } from '@/engine';
import {
  type Fact,
  autoNamedLabels,
  deferralWorthwhile,
  dryRunOutcome,
  forcedCrossedRing,
  nameCentreFacts,
  renameFacts,
  replay,
  resolveBinds,
  seatSweepWarmup,
  stepAsideFacts,
  trialFacts,
} from '@/store/geoStore';
import { spanShadow } from '@/parser/spanAccounting';
import { findProofTarget } from '../../shell/proofTarget';
import { honestyGateReport } from './honestyGates';
import { honoursConstruct, roleReadings, thalesReadings } from './roleReadings';
import { solveBudget, work, withWorkBudget, withWorkEpoch } from '@/engine/solveBudget';

/**
 * #1584 ([ADR-583](../../docs/06-decisions.md#adr-583)) — a ROLE RE-READING is a re-attempt of a line that
 * already failed, so its dry run runs under a deterministic WORK cap (charged units, #1605 — the whole
 * decision is one work epoch, so the figure's own fold, touched by the first dry run, is never charged to
 * a reading). A reading the cap cuts is not adopted — the line's own refusal stands. Calibrated over the
 * corpus scenarios, the fixtures and the decide-parity shards: above the most expensive reading measured
 * there that BUILT. A test may lower it to exercise the cut.
 */
export const ROLE_READING_WORK_CAP = 1_000_000;
export const roleReadingConfig = { cap: ROLE_READING_WORK_CAP };
/** #1584: the role-reading counters the locks read (operation counts). */
export const roleReadingStats = { readings: 0, cut: 0, maxProduced: 0 };

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

/** An auto-bind the parse loop made (#186 circle / #539 point / #1673 step-aside). #1697 (ADR-588): the caller commits it
 *  as a `name-by-use` fact in the line's own group (`nameByUseCommands`) — never as a store rename no line owns. */
export interface DecideBind {
  /** `step-aside` (#1673, ADR-565): a hidden circle token re-lettered out of the student's way — still unnamed */
  readonly op: 'name-centre' | 'rename' | 'step-aside';
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
      /**
       * #1611 (ADR-591): the canonical sentence the note teaches, to be PRE-FILLED into the input in place of
       * the student's text (ADR-W-030) — set only when that sentence was proved to commit on this figure.
       */
      readonly prefill?: string;
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
  // A PROOF TARGET (#1666, ADR-561 / ADR-W-107) — «הוכיחו כי AB ⊥ AC», "prove that …": what the student must
  // SHOW, never a given. Refused here, PRE-parse, for the negation's reason: the relation rules matched the
  // claim inside the sentence and committed it as a constraint, so the figure was forced to satisfy what
  // was to be proved. The `proof` scope category below only ever ran after a FAILED parse. The rule is
  // shared by all three builders (`shell/proofTarget`); the note quotes the proof sentence.
  const proof = findProofTarget(utterance);
  if (proof) {
    return { kind: 'refuse', category: 'guided', preParse: true, binds: [], logs: [{ source: 'scope', result: 'scope:proof' }], note: { key: 'input.scope.proof-target', params: { sentence: proof.sentence } } };
  }
  const negated = statedNegation(utterance);
  if (negated) {
    return { kind: 'refuse', category: 'guided', preParse: true, binds: [], logs: [{ source: 'scope', result: 'scope:negation' }], note: { key: 'input.scope.negation', params: { word: negated } } };
  }
  return null;
}

/** The categories answered with guidance BEFORE the model (ADR-289; #1357 added `unrelated`). */
export const PRE_LLM = new Set(['analytic', 'coordinate-point', 'cross-app', 'ui-command', 'valueless-query', 'orientation', 'bare-point', 'unnamed-sides', 'compound-relation', 'unrelated']);

/** The parse-and-dry-run half. Assumes {@link decidePreParse} returned `null` for this utterance. */
export async function decideFromParse(
  state: DecideState,
  utterance: string,
  locale: 'he' | 'en',
  hooks: DecideHooks = {},
  /** `teaching`: this run is the PROOF of a taught sentence (#1611) — it never teaches in turn */
  opts: { readonly teaching?: boolean } = {},
): Promise<Verdict2D> {
  const logs: DecideLog[] = [];
  const binds: DecideBind[] = [];
  /** The facts as the auto-binds leave them — a COPY; the store is never touched here. #1697 (ADR-588): the
   *  earlier lines' namings by use applied first (`resolveBinds`), so the simulation starts from the figure. */
  let facts: Fact[] = [...resolveBinds(state.facts as Fact[])];
  const seed = state.seed;
  const refuse = (category: 'guided' | 'clarify' | 'conflict', log: DecideLog, note: DecideNote): Verdict2D => ({
    kind: 'refuse', category, preParse: false, binds, logs: [...logs, log], note,
  });
  /** The parse context a later re-read sees: the display view until a bind changes the figure. */
  let viewNow = (): DecideView => state.view;

  let pctx = buildParseCtx(state.view.construction, state.view.positions);
  // #1673 / #1688 (ADR-565, operator ruling 2026-10-02): a letter the student types is THEIRS. An unnamed circle's
  // hidden token that happens to be that letter is re-lettered first (still hidden), so «BO = 5» draws a free O,
  // «מעגל O» declares a new circle O, and nothing the student never saw answers to their letter.
  const aside = stepAsideFacts(facts, typedLabels(utterance));
  if (aside.moves.length) {
    facts = aside.facts;
    for (const m of aside.moves) binds.push({ op: 'step-aside', from: m.from, to: m.to });
    logs.push({ source: 'step-aside', moves: aside.moves, intermediate: true });
    const d0 = replay(facts, seed);
    viewNow = () => ({ construction: d0.construction, positions: d0.positions });
    pctx = buildParseCtx(d0.construction, d0.positions);
  }
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
      // #1697 (ADR-588): the RESOLVED source (`@ctr-O` for an anonymous centre), so the replayed naming fact
      // names exactly the circle this simulation named, and never reads as a student's letter O
      binds.push({ op: 'name-centre', from: res.source, to: bind.to });
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
  /**
   * #1654–#1657 ([ADR-562](../../docs/06-decisions.md#adr-562)) — a FOREIGN GIVEN (a slope, a quadrant, a
   * plane, a sphere…) the grammar refused before any rule could read part of it. Answered with the
   * family's own pointer (analytic Builder / Space Builder), prefixed by the student's word, so a mixed
   * sentence says which clause could not be kept and that nothing of it was built. Never escalated: the
   * model could only re-absorb the operand into a plane given, which is the defect itself. Logged under
   * the family's existing `scope:<category>` tag, so the dashboard's register is unchanged.
   */
  if (!r.ok && r.reason === 'foreign-given') {
    return refuse('guided', { source: 'scope', result: `scope:${r.category}`, phrase: r.phrase }, { key: 'input.scope.foreign-given', params: { phrase: r.phrase, guide: { t: `input.scope.${r.category}` } } });
  }
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
    // #1445 (ADR-590): with several angles at the vertex the question LISTS them, each in three letters.
    const options = r.options ?? [];
    if (options.length > 1) {
      return refuse('clarify', { source: 'parser', result: `ambiguous-angle:${r.vertex}` }, {
        key: 'input.ambiguousAngleOptions',
        params: { vertex: r.vertex, options: options.map((o) => `∠${o}`).join(', '), example: options[0] },
      });
    }
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
  // #1661 ([ADR-563](../../docs/06-decisions.md#adr-563)): a role noun («המיתר OB», «הרדיוס BC», «השוק AB»)
  // whose claim cannot be stated on this figure. Refused naming the noun and the pair the student typed —
  // never built as a bare segment with the claim dropped, never a paid guess at what the role meant.
  if (!r.ok && r.reason === 'role-claim') {
    return refuse(r.why === 'several-polygons' || r.why === 'leg-apex' ? 'clarify' : 'guided', { source: 'parser', result: `role-claim:${r.why}:${r.a}${r.b}` }, {
      key: `input.roleClaim.${r.why}`,
      params: { noun: r.noun, pair: `${r.a}${r.b}`, a: r.a, b: r.b, other: r.other ?? '', options: (r.options ?? []).join(', ') },
    });
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
  /**
   * #1790 ([ADR-595](../../docs/06-decisions.md#adr-595)): «טרפז ישר זווית חסום במעגל» — the sentence contradicts
   * its own noun. A circle through the four vertices makes the shape a rectangle, and a rectangle is not a
   * trapezoid. Refused naming both nouns and quoting the sentence (the #1554 ruling of 2026-10-01, worded as
   * analytic's `errInscribedContradictsNoun`). Never escalated: the LLM could only draw something else.
   */
  if (!r.ok && r.reason === 'inscribed-contradicts-noun') {
    return refuse(
      'guided',
      { source: 'parser', result: `inscribed-contradicts-noun:${r.shape}:${r.forced}` },
      { key: 'input.inscribedContradictsNoun', params: { detail: utterance.trim(), shape: { t: `input.shapeNoun.${r.shape}` }, forced: { t: `input.shapeNoun.${r.forced}` } } },
    );
  }
  /**
   * #1891 ([ADR-606](../../docs/06-decisions.md#adr-606)): «מעגל חסום במחומש ABCDE» — an incircle of a polygon
   * 2-D does not draw yet. Refused with the W19 known-limit sentence, the polygon's noun filled in, under its
   * own log result so log-triage counts the demand. Never escalated: in prod the model's answer dropped the
   * circle, and other answers draw it through the vertices; no gate can check a model's direction.
   */
  if (!r.ok && r.reason === 'incircle-not-drawn') {
    const shape = r.sides === 5 ? 'input.incircleShape5' : r.sides === 6 ? 'input.incircleShape6' : 'input.incircleShapeMany';
    return refuse('guided', { source: 'parser', result: `incircle-not-drawn:${r.sides}` }, { key: 'input.incircleKnownLimit', params: { shape: { t: shape } } });
  }
  // #1285: the same channel — the angle's stated vertex is not the bisector's own first letter.
  if (!r.ok && r.reason === 'bisector-wrong-apex') {
    return refuse('guided', { source: 'parser', result: `bisector-wrong-apex:${r.apex}:${r.stated}` }, { key: 'input.bisectorWrongApex', params: { apex: r.apex, stated: r.stated } });
  }
  /**
   * #1684 ([ADR-568](../../docs/06-decisions.md#adr-568)): «AE גובה» when A is a vertex of several shapes that
   * give it different opposite sides. Which side is a given the sentence did not state, so it is ASKED,
   * quoting the sentence and the shapes — never one picked silently, never a paid guess.
   */
  if (!r.ok && r.reason === 'ambiguous-cevian') {
    const kind = r.role === 'median' ? 'input.cevianRoleMedian' : 'input.cevianRoleAltitude';
    return refuse('clarify', { source: 'parser', result: `ambiguous-cevian:${r.role}:${r.apex}:${r.shapes.join(',')}` }, {
      key: 'input.ambiguousCevian',
      params: { sentence: utterance.trim(), apex: r.apex, shapes: r.shapes.join(', '), side: r.side, shape: r.shapes[0], kind: { t: kind } },
    });
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
  // #1698 (ADR-566): a trig function of an angle that names no single angle — a sine (two angles), a
  // cosine outside [−1, 1], or a form other than «tan∢ABC = 2». Refused naming the function; never an
  // escalation (the model would guess the very reading the grammar refused).
  if (!r.ok && r.reason === 'trig-given') {
    return refuse('guided', { source: 'parser', result: `trig-given:${r.why}:${r.fn}` }, { key: `input.trigGiven.${r.why}`, params: { fn: r.fn, sentence: r.sentence } });
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
  // Analytic / coordinate-geometry input (axes, coordinates, slope, line equations — and, since #1245, a
  // point PLACED at coordinates, «E=(-1,7)») — a DIFFERENT tool: the live analytic Builder. Refuse
  // immediately with the pointer message and tag it `scope:<category>` — never spend an LLM call on input
  // that can never build here. (Runs only on a failed grammar parse; the coordinate rule is withdrawn, so
  // «A = (3,5)» now fails the parse and lands here — ADR-553.)
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
      // #1798 (ADR-598, operator ruling 2026-10-06): a one-line compound is ALL OR NOTHING. A clause that reads on
      // its own but leaves no trace in the whole-line lowering was dropped by a rule that read only part of the
      // line — every token of it can still be "accounted" («AB מקביל ל-CD ו-D על BC»: D, B, C ride the parallel).
      // The line is refused whole with the one shared message, never committed and never escalated.
      const parsedCmds = r.commands;
      const drop = droppedClause(utterance, parsedCmds, pctx, (clause) => {
        // entailment: after the whole line's own commands, the clause adds nothing (empty / implied)
        const whole = trialFacts(facts, parsedCmds).map((f) => (f.group === '~try' ? { ...f, id: f.id.replace('~try', '~line'), group: '~line' } : f));
        const o = dryRunOutcome(whole, clause, seed);
        return !o.produced && (o.reason === 'empty' || o.reason === 'implied');
      });
      if (drop) {
        return refuse('guided', { source: 'scope', result: 'scope:split-statements:dropped-clause', commands: r.commands }, { key: drop.messageKey, params: drop.params });
      }
      // #1927 (ADR-608, ADR-W-121): a ring declared over points the figure already placed, in an order that crosses
      // in EVERY configuration, is refused naming the line — before any dry run, so it precedes ADR-157's raw
      // redefinition refusal of a shape over existing vertices, and it never escalates (the parse was right).
      const crossedRing = forcedCrossedRing(facts, r.commands, seed);
      if (crossedRing) {
        return refuse(
          'conflict',
          { source: 'parser', result: 'ring-contradicts-noun', detail: crossedRing.join(''), commands: r.commands },
          { key: 'input.ringContradictsNoun', params: { detail: utterance.trim() } },
        );
      }
      // #41 (ADR-290): warm the candidate content's FOLD in the geometry WORKER first — the dry-run,
      // the commit, and every later replay of this content then run at TAIL speed on the main thread
      // (the one unbudgeted cold fold, measured ~26 s on the #59 figure, used to block the tab here).
      if (hooks.prefold) await hooks.prefold(trialFacts(facts, r.commands), seed);
      // #1671 (ADR-584): a step that fails at the current unstated right-angle seat is judged by the dry
      // run's seat sweep, which reads one fold per rotated seat (seconds each, cold). Warm them here, in the
      // worker, like the trial's own fold, so the wait is off the main thread; the sweep itself is bounded by
      // a fixed amount of charged work, so its verdict does not depend on whether they were warm.
      if (hooks.prefold) for (const fc of seatSweepWarmup(facts, r.commands, seed)) await hooks.prefold(fc, seed);
      // A deterministic parse can "succeed" yet build NOTHING — apply with an error (kept-prior) or
      // change nothing at all. Dry-run before committing so a silent fail isn't shown as success
      // (operator request); a step that builds something commits immediately.
      // #1584 (ADR-583): the line's dry run and its role re-readings are ONE work epoch — see ROLE_READING_WORK_CAP.
      const parsed = r;
      const decided = withWorkEpoch(() => {
        /**
         * A SEMICIRCLE THROUGH THREE VERTICES: THE FIGURE PICKS THE DIAMETER (#1771, ADR-589).
         *
         * «חצי מעגל ABC» on a triangle puts all three vertices ON the semicircle (operator ruling,
         * 2026-10-04), and which side is the diameter is the figure's call — the side opposite the angle
         * that is, or can become, the right angle. The readings are probed on the figure the student
         * already has and tried BEST FIRST, before any refusal rather than after it: the probe-best
         * reading is the one that keeps an unseated right angle where it is, so trying the parser's
         * starting side first could build — and move the figure — when the figure itself says otherwise.
         * The first is dry-run like any line; the others under the role-reading cap. Whichever is
         * adopted is taught in its explicit spelling, so the student sees which side became the diameter.
         */
        const thales = thalesReadings(utterance, parsed.commands, (s) => replay(facts, s).positions);
        if (thales) {
          let statedOutcome: ReturnType<typeof dryRunOutcome> | null = null;
          for (const [i, reading] of thales.entries()) {
            const alt = parse(reading.utterance, pctx);
            if (!alt.ok || !honestyGateReport(reading.utterance, alt.commands, pctx).clean) continue;
            const aborts0 = solveBudget.aborts;
            const tryOutcome = i === 0 ? dryRunOutcome(facts, alt.commands, seed) : withWorkBudget(roleReadingConfig.cap, () => dryRunOutcome(facts, alt.commands, seed));
            if (i > 0) {
              roleReadingStats.readings++;
              if (solveBudget.aborts !== aborts0) { roleReadingStats.cut++; continue; } // cut by the cap: not THE outcome of this reading
            }
            if (reading.stated) statedOutcome = tryOutcome;
            if (!tryOutcome.produced) continue;
            if (!honoursConstruct(alt.commands, replay(trialFacts(facts, alt.commands), seed).positions)) continue;
            return { rr: alt, outcome: tryOutcome, adopted: reading.utterance as string | null };
          }
          // No side holds: the line's verdict is its own stated reading's, exactly as without the probe
          // (its rewrite lowers to the same commands, so its dry run IS the line's).
          if (statedOutcome) return { rr: parsed, outcome: statedOutcome, adopted: null };
        }
        let rr = parsed;
        let outcome = dryRunOutcome(facts, rr.commands, seed);
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
          const readings = roleReadings(utterance, parsed.commands, (s) => replay(facts, s).positions);
          for (const reading of readings ?? []) {
            const alt = parse(reading.utterance, pctx);
            if (!alt.ok || !honestyGateReport(reading.utterance, alt.commands, pctx).clean) continue;
            const aborts0 = solveBudget.aborts;
            const done0 = work.done;
            const tryOutcome = withWorkBudget(roleReadingConfig.cap, () => dryRunOutcome(facts, alt.commands, seed));
            roleReadingStats.readings++;
            if (solveBudget.aborts !== aborts0) {
              roleReadingStats.cut++; // cut by the cap: not THE outcome of this reading — the line's own refusal stands
              continue;
            }
            if (!tryOutcome.produced) continue;
            roleReadingStats.maxProduced = Math.max(roleReadingStats.maxProduced, work.done - done0);
            /**
             * `produced` means SOMETHING was built, not that the construct's promise holds — measured,
             * «רבע מעגל CAB» produces a "quarter circle" whose two radii are 15 and 10. Answering a
             * refusal with a wrong figure would be strictly worse than the refusal, so an adopted
             * reading has to honour what it claims to be.
             */
            if (!honoursConstruct(alt.commands, replay(trialFacts(facts, alt.commands), seed).positions)) continue;
            rr = alt;
            outcome = tryOutcome;
            adopted = reading.utterance;
            break;
          }
        }
        return { rr, outcome, adopted };
      });
      r = decided.rr;
      const { outcome, adopted } = decided;
      if (outcome.produced) {
        // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
        // SPAN-ACCOUNTING SHADOW (S3.1 of docs/24 — never refuses; the enforcing flip is the
        // operator's, §4.2): log what the total accountant WOULD have flagged on this committed
        // parse, so real traffic accumulates the divergence evidence the flip decision needs.
        const shadow = spanShadow(utterance, r.commands, { existingPoints: pctx.points, radiusSymbols: (pctx.radiusSymbols ?? []).map((x) => x.name), angleAliases: (pctx.angleAliases ?? []).map((x) => x.name), circleMembers: pctx.circleMembers, polygons: pctx.polygons });
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
        // #1445 (ADR-590, operator ruling 2026-09-27): a lone vertex read as its polygon's interior angle
        // («זווית B» in △ABC with a cevian at B) is SAID ALOUD — «הובן כ-∠ABC» — never a silent pick.
        else if (r.angleReadings?.length) note = readAsNote(r.angleReadings);
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
      if (outcome.reason === 'error' && deferralWorthwhile(facts, r.commands, seed, { seatsExhausted: outcome.seatsExhausted })) {
        return {
          kind: 'commit', deferred: true, binds, commands: r.commands, note: readAsNote(r.angleReadings),
          logs: [...logs, { source: 'parser', result: 'deferred-constraint', detail: outcome.detail, commands: r.commands }],
        };
      }
      // A cleanly-PARSED command the engine CAN'T satisfy against the current figure (and not a deferrable
      // constraint) is a CONTRADICTION with the existing data — not a phrasing problem, so the LLM can't fix
      // it (it would re-emit the same in-grammar command). Show the SPECIFIC reason (humanized: "…contradicts
      // an earlier given", "C is already defined — edit/delete the earlier step") instead of the generic
      // "produced nothing". (ADR-156 follow-up — the "impossible with the current data" message.)
      /**
       * #1720 ([ADR-571](../../docs/06-decisions.md#adr-571)): a line whose operands are not in the figure fails
       * in the topological evaluator, and its message — «unresolved dependencies for: bis-CAB» — named an
       * internal object, never the sentence. Here the refusal quotes the sentence and names the student's
       * own letters it relies on that nothing has defined (`missingOperandLetters`).
       */
      // #1411 (ADR-577): `evaluate` now names an absent operand directly («undefined point: A, B») — same class.
      if (outcome.reason === 'error' && /^(?:unresolved dependencies|undefined point)/.test(outcome.detail ?? '')) {
        const missing = missingOperandLetters(viewNow().construction, r.commands);
        return refuse(
          'guided',
          { source: 'parser', result: `missing-operands:${missing.join(',')}`, detail: outcome.detail, commands: r.commands },
          missing.length
            ? { key: 'input.missingOperands', params: { sentence: utterance.trim(), points: missing.join(', ') } }
            : { key: 'input.unresolvedSentence', params: { sentence: utterance.trim() } },
        );
      }
      /**
       * #1790 ([ADR-595](../../docs/06-decisions.md#adr-595)): a redefinition whose FIRST definition came from this
       * same sentence. The engine's message («… is already defined — edit or delete the earlier step») names an
       * object and points at an earlier step that does not exist — on an empty canvas, there is none. The
       * conflict is between two readings of one sentence, so the refusal quotes the sentence and the student's
       * own letters, never an internal id.
       */
      const redefined = outcome.reason === 'error' ? /^'(.+)' is already defined/.exec(outcome.detail ?? '')?.[1] : undefined;
      if (redefined && !viewNow().construction.objects.some((o) => o.id === redefined)) {
        return refuse(
          'conflict',
          { source: 'parser', result: `self-conflict:${redefined}`, detail: outcome.detail, commands: r.commands },
          { key: 'input.sentenceSelfConflict', params: { sentence: utterance.trim(), id: redefined.replace(/^[a-z]+-(?=[A-Z])/, '') } }, // 'poly-ABCD' → ABCD
        );
      }
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
      // #1888 / #1889 (ADR-603, operator rulings 2026-10-08): a PART of the line the reading never read — a vertex
      // locative («משולש ABC ישר זווית ב-B»), a relative clause («…בנקודה E שהיא אמצע BD»), an incidence on the
      // named point («…E על AB») — refuses the whole line with the one-input-per-line message, listing the parts
      // cut where the reading stops. Never escalated, whatever else fired: *"a line that loses a part gets the
      // existing one-input-per-line message"*, and *"refuse it too"* when the drawing happens to agree. An unread
      // label INSIDE a statement (read labels after it) is a lost operand, not a lost part: the weak path below.
      // #1904 (ADR-604): a cevian ROLE the reading never read («AD גובה לצלע BC שהוא גם תיכון» lowered to the median
      // alone) refuses the whole line, teaching one line per role (operator ruling W22). Only where nothing older
      // fired: a line an older gate already sends to the AI keeps going there (W21 — «…שהוא גם חוצה זווית»).
      const role = gates.unreadRole && gates.onlyReadExtent ? lostRoleNote(utterance, r.commands, gates.unreadRole, pctx) : null;
      if (role) {
        return refuse('guided', { source: 'scope', result: 'scope:split-statements:unread-role', commands: r.commands }, role);
      }
      // W21 holds for the label refusal too: where an older gate already caught the lost role, the line keeps its AI path
      const aiPath = gates.unreadRole !== null && !gates.onlyReadExtent;
      const lost = gates.unread?.cut && !aiPath ? lostPartNote(gates.unread.cut) : null;
      if (lost) {
        return refuse('guided', { source: 'scope', result: 'scope:split-statements:unread-part', commands: r.commands }, lost);
      }
      weak = 'dropped'; // a typo dropped a stated label/number/relation/verb/compound-structure/object → escalate rather than commit the partial parse
      logs.push({ source: 'parser', result: `weak:dropped:${[...dropped, ...droppedNums, ...droppedRels, ...droppedVerbs, ...droppedCompound, ...droppedConstruct, ...unaccounted.map((x) => `${x.kind}:${x.text}`), ...(gates.unread?.items ?? []).map((x) => `unread:${x}`), ...(gates.unreadRole?.items ?? []).map((x) => `unread-role:${x}`)].join(',')}`, commands: r.commands, intermediate: true });
      // #1798 / #553 (ADR-598): the dropped content belongs to a COMPOUND whose every clause reads on its own —
      // «F אמצע DO, O - חיתוך של AC ו-BD». All or nothing: refused whole with the shared message listing the
      // clauses, instead of a paid call that would re-read the compound the ruling says to type line by line.
      const compound = compoundNotHonoured(utterance, pctx);
      if (compound) {
        return refuse('guided', { source: 'scope', result: 'scope:split-statements:dropped-clause', commands: r.commands }, { key: compound.messageKey, params: compound.params });
      }
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
  /**
   * #1611 ([ADR-591](../../docs/06-decisions.md#adr-591), operator ruling 2026-09-30) — a length given written
   * as a WORD fraction and/or wrapped in a wish or a command («אני רוצה ש-BE ו-DF יהיו רבע מהצלע של
   * המקבילית») is not accepted as input: it is TAUGHT. The canonical sentence it meant («BE = 1/4 BC, DF =
   * 1/4 AD») is proposed by `fractionTeachCandidate` and then PROVED here — run through this very decision,
   * on this very figure, and adopted only if it COMMITS (not deferred). A proposal the tool would itself
   * refuse is never shown (#1183: taught remedies are hypotheses); the line then escalates exactly as before.
   * Pre-LLM, so the paid call the prod session made on these lines is saved. One level only: the proof run
   * does not teach.
   */
  if (!opts.teaching) {
    const cand = fractionTeachCandidate(utterance, pctx);
    if (cand) {
      const proof = await decideFromParse({ facts, seed, view: viewNow() }, cand.line, locale, hooks, { teaching: true });
      if (proof.kind === 'commit' && !proof.deferred) {
        return {
          kind: 'refuse', category: 'guided', preParse: false, binds,
          logs: [...logs, { source: 'scope', result: 'scope:teach-fraction', corrected: cand.line }],
          note: { key: 'input.scope.teach-fraction', params: { corrected: cand.line } },
          prefill: cand.line,
        };
      }
    }
  }
  // out of grammar, OR a deterministic parse that built nothing → the caller asks the model
  return { kind: 'escalate', binds, logs, weak, parseReason: r.ok ? null : r.reason };
}

/**
 * #1720 ([ADR-571](../../docs/06-decisions.md#adr-571)) — the point letters a batch RELIES ON that neither the
 * figure nor the batch itself defines: every uppercase point label the commands reference, minus the
 * objects that exist after applying the batch structurally (`applyCommand`, no evaluation — so a shape's
 * own corners and a construct's own point count as defined). Internal ids (`bis-CAB`, `~med-BC`) are
 * never point labels, so they can never reach the student.
 */
export function missingOperandLetters(prev: Construction, commands: readonly AnyCommand[]): string[] {
  let c = prev;
  for (const cmd of commands) {
    try {
      c = applyCommand(c, cmd as Command);
    } catch {
      /* a command the structural pass cannot apply defines nothing */
    }
  }
  const defined = new Set(c.objects.map((o) => o.id));
  const referenced = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      if (/^[A-Z]\d*$/.test(v)) referenced.add(v);
    } else if (Array.isArray(v)) v.forEach(visit);
  };
  for (const cmd of commands) for (const [k, v] of Object.entries(cmd)) if (k !== 'type') visit(v);
  return [...referenced].filter((x) => !defined.has(x)).sort();
}

/**
 * #1445 ([ADR-590](../../docs/06-decisions.md#adr-590), operator ruling 2026-09-27) — the note a committed step
 * carries when a lone vertex was read as its polygon's interior angle: «הובן כ-∠ABC», said aloud, never a
 * silent pick. Null when the parse made no such reading.
 */
function readAsNote(readings: readonly string[] | undefined): DecideNote | null {
  return readings?.length ? { key: 'input.vertexAngleReadAs', params: { angles: readings.map((a) => `∠${a}`).join(', ') } } : null;
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
