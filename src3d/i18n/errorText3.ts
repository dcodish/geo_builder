/**
 * The 3-D refusal text — a store error, worded for the student (moved out of App3.tsx by #1455 so a
 * test can drive it: every message must name only what the student wrote, `shell/studentText`).
 */
import { MAX_FIGURE_STATEMENTS } from '../../shell/save';
import type { StoreError3 } from '../store/store3';

/** #492/#425: the student's own statements, quoted and comma-joined, for a refusal that names the
 *  conflict. Quoting keeps a multi-word utterance readable as ONE item in the list. */
const quoteList = (items: string[]): string => items.map((s) => (s === '…' ? s : `«${s}»`)).join(', ');

/** #1455: the engine nouns a `no-such-solid` may carry instead of letters (SolidNoun + the revolutions). */
const SOLID_NOUNS = new Set(['pyramid', 'tetra', 'cube', 'box', 'prism', 'cone', 'cylinder', 'sphere', 'any']);

export function errorText3(t: (k: string, o?: Record<string, unknown>) => string, err: StoreError3): string | null {
  if (!err) return null;
  switch (err.code) {
    case 'bound-unsatisfiable':
      return t('err.boundUnsatisfiable', { id: err.id });
    case 'incircle-needs-triangle': // #442 — only a tangential polygon has an incircle
      return t('err.incircleNeedsTriangle');
    case 'ambiguous-vector-length':
      /**
       * #1156 — the apply-level refusal carries the student's OWN pairs, so the two spellings that
       * work are shown in their letters rather than as `AB`/`CD` placeholders. A bare "which did you
       * mean?" leaves a student who has just been told their true given is false no way forward,
       * which is #778's *non-canonical input is TAUGHT, never silently accepted*.
       *
       * The parser's `c = 1` refusal carries no pairs and keeps the generic wording.
       */
      return 'a1' in err
        ? t('err.ambiguousVectorLengthRatio', {
            a1: err.a1, b1: err.b1, a2: err.a2, b2: err.b2, c: err.c,
          })
        : t('err.ambiguousVectorLength');
    case 'param-roles-conflated':
      return t('err.paramRolesConflated', { letter: err.letter });
    // #836: name the candidates — a bare "which diagonal?" leaves a student who does not know the prime
    // convention no better off. `pairs` is empty only when the figure has no single solid with space
    // diagonals, and the message then asks for letters without inventing candidates.
    // #859: name the pair AND which claim it broke — «אלכסון AB» is not a diagonal at all, while
    // «אלכסון ראשי AC» is a diagonal but not a MAIN one. Two different corrections for the student.
    case 'not-a-diagonal':
      return err.kind === 'space'
        ? t('err.notASpaceDiagonal', { pair: `${err.a}${err.b}` })
        : t('err.notADiagonal', { pair: `${err.a}${err.b}` });
    case 'ambiguous-main-diagonal':
      return err.pairs
        ? t('err.ambiguousMainDiagonal', { pairs: err.pairs })
        : t('err.ambiguousMainDiagonalBare');
    // #866: UNDER-SPECIFIED, not unsupported — the operator's ruling on which voice this gets. When the
    // figure can name the candidate angles it does; otherwise it still asks, rather than showing an
    // empty list (the same two-form shape as the main-diagonal ask above).
    case 'ambiguous-angle-vertex':
      return err.angles
        ? t('err.ambiguousAngleVertex', { vertex: err.vertex, angles: err.angles })
        : t('err.ambiguousAngleVertexBare', { vertex: err.vertex });
    case 'dropped-given':
      return t('err.droppedGiven', { items: err.items });
    // #1666: the tool draws the givens; a claim to prove is named and left out.
    case 'proof-target':
      return t('err.proofTarget', { sentence: err.sentence });
    // #1547: a single coordinate with a symbolic value — named by the student's own component.
    case 'component-symbolic':
      return t('err.componentSymbolic', { component: err.component });
    // #926: the change went through; this names the rows it left without effect (they stay, marked).
    case 'dependents-broken':
      return t('err.dependentsBroken', { cause: err.cause, items: err.items });
    case 'not-understood':
      return t('err.notUnderstood');
    case 'bad-file':
      return t('err.badFile');
    case 'newer-schema':
      return t('err.newerSchema');
    case 'too-large':
      return t('err.tooLarge', { max: MAX_FIGURE_STATEMENTS });
    // #578 (ADR-3D-211): a rename we UNDERSTOOD and declined. Each reason names the letters the
    // student typed, never internal state — a 'target-taken' is the honest answer that renaming onto a
    // live letter would merge two of their vertices, which is a different operation nobody asked for.
    case 'rename-refused':
      return t(`err.rename.${err.reason}`, { from: err.from, to: err.to });
    // #1302 / #1631: a swap we understood and declined — named by the two letters the student typed.
    case 'swap-refused':
      return t(`err.swap.${err.reason}`, { a: err.a, b: err.b });
    case 'already-defined':
      return t('err.alreadyDefined', { id: err.id });
    // #612 (ADR-3D-158): name BOTH shapes — the honesty invariant is that a refusal names the
    // student's own statement and what the figure actually holds, never internal state.
    case 'shape-less-specific':
      return t('err.shapeLessSpecific', { stated: t(`notice.shape.${err.stated}`), actual: t(`notice.shape.${err.actual}`) });
    case 'unknown-point':
      return t('err.unknownPoint', { id: err.id });
    case 'unknown-symbol':
      return t('err.unknownSymbol', { id: err.id });
    // #922: the figure DOES carry the letter — say what is actually true (the sign has nothing to
    // select here), never that the letter is undefined.
    case 'sign-not-selectable':
      return t('err.signNotSelectable', { id: err.id });
    case 'ambiguous-angle':
      return t('err.ambiguousAngle', { id: err.id });
    case 'no-prism-to-make-right':
      return t('err.noPrismToMakeRight');
    case 'ambiguous-prism':
      return t('err.ambiguousPrism');
    case 'unknown-vector':
      return t('err.unknownVector', { id: err.id });
    case 'unknown-plane':
      // #1455: `base` is the engine's sentinel for «הבסיס» — never a name the student gave a plane
      return err.id === 'base' ? t('err.baseNeedsOneSolid') : t('err.unknownPlane', { id: err.id });
    case 'unknown-line':
      return t('err.unknownLine', { id: err.id });
    case 'bad-solid':
      return t('err.badSolid');
    case 'two-params':
      return t('err.twoParams');
    // #492/#425: the refusal quotes the student's own statements — the honesty invariant (name the
    // conflicting STATEMENT, never internal state). The «…With» variant is used only when there are
    // other statements to name, so the message never trails an empty list.
    case 'no-roots':
      return err.others.length > 0
        ? t('err.noRootsWith', { sym: err.sym, stated: err.stated, others: quoteList(err.others) })
        : t('err.noRoots', { sym: err.sym, stated: err.stated });
    case 'givens-contradict':
      return err.others.length > 0
        ? t('err.givensContradict', { stated: err.stated, others: quoteList(err.others) })
        : t('err.givensContradictAlone', { stated: err.stated });
    case 'not-on-plane':
      return t('err.notOnPlane', { id: err.id });
    case 'not-coplanar':
      return t('err.notCoplanar', { id: err.id });
    case 'plane-side-undefined':
      return t('err.planeSideUndefined', { id: err.id });
    case 'wrong-side-of-plane':
      return t('err.wrongSideOfPlane', { id: err.id });
    case 'not-on-line':
      return t('err.notOnLine', { id: err.id });
    case 'point-coincides':
      return t('err.pointCoincides', { id: err.id, with: err.with });
    case 'line-misses-plane':
      return t('err.lineMissesPlane', { id: err.id });
    case 'crossing-off-segment':
      return t('err.crossingOffSegment', { id: err.id });
    case 'segments-do-not-meet':
      return t('err.segmentsDoNotMeet', { id: err.id, s1: err.s1, s2: err.s2 });
    case 'symbolic-new-point':
      return t('err.symbolicNewPoint', { id: err.id });
    case 'power-needs-solid':
      return t('err.powerNeedsSolid', { id: err.id });
    case 'injection-unsatisfiable':
      return t('err.injectionUnsatisfiable');
    case 'sign-unsatisfiable':
      return t('err.signUnsatisfiable', { id: err.id });
    case 'no-such-solid':
      // #1455: an engine solid NOUN («pyramid», «cone») is the student's word in their language
      return t('err.noSuchSolid', { id: SOLID_NOUNS.has(err.id) ? t(`solidNoun.${err.id}`) : err.id });
    // #766: several declared solids answer the sentence — ask for more specific letters, never guess.
    case 'ambiguous-solid':
      return t('err.ambiguousSolid', { id: err.id, count: err.count });
    case 'free-size-claim':
      return t('err.freeSizeClaim', { id: err.id });
    case 'two-unknowns':
      return t('err.twoUnknowns', { id: err.id });
    case 'size-on-solid':
      return t('err.sizeOnSolid');
    case 'bad-name':
      return t('err.badName');
    case 'need-basis':
      return t('err.needBasis');
    case 'no-solution':
      return t('err.noSolution', { id: err.id });
    case 'not-on-segment':
      return t('err.notOnSegment', { id: err.id });
    case 'claim-refuted':
      return t('err.claimRefuted');
    case 'placement-not-fixed':
      return t('err.placementNotFixed');
    case 'vacuous-relation':
      return t('err.vacuousRelation');
    case 'plane-not-determined':
      return t('err.planeNotDetermined', { id: err.id });
    case 'line-not-determined':
      return t('err.lineNotDetermined', { id: err.id });
    case 'point-not-determined':
      return t('err.pointNotDetermined', { id: err.id });
    case 'given-not-drivable':
      // #1590 (ADR-3D-291): the tool's limit, named as the tool's — never «check the computation»
      return err.object.kind === 'point'
        ? t('err.givenNotDrivablePoint', { id: err.object.id })
        : t('err.givenNotDrivableSize', { solid: t(`solidNoun.${err.object.solid}`) });
  }
}
