/**
 * Grammar parser (Phase 4) — the `utterance → command[]` boundary.
 *
 * A deterministic, offline Hebrew/English grammar that maps simple geometry
 * phrasings to engine commands. It runs *first*; anything it can't read returns
 * `{ ok: false, reason: 'not-handled' }`, which is exactly where the Phase-7
 * Claude fallback will escalate (ADR-002). The engine never knows which path
 * produced the commands.
 *
 * Scope tracks the engine's current vocabulary (square, point-on-segment,
 * point-by-distances, free point, angle). Higher-level phrasings ("triangle
 * ABC", circles, …) map to constructs that arrive in Phase 5 and are
 * deliberately *not handled* yet — the grammar widens alongside the engine.
 *
 * Point labels are Latin capitals (geometry convention, including inside Hebrew
 * text), each optionally carrying a digit subscript — a point token is `[A-Za-z]\d*`,
 * so `O1`/`O2` are distinct ids (the canonical id stays ASCII "O1"; the renderer
 * draws the digit as a subscript). "ABCD" still reads as four points (letters carry
 * no digits). Keywords are bilingual; the same rule matches either language.
 */

import { RADIUS_VAR, type AnyCommand, type Command, type Id, type MeasureExpr, type SymbolicCommand } from '@/engine';

export type ParseResult =
  | { ok: true; commands: AnyCommand[] }
  | { ok: false; reason: 'not-handled' }
  // A rule recognised an angle named by a SINGLE vertex ("∠B = 90") but the figure has ≠2 edges there, so
  // WHICH angle is meant is ambiguous (or its arms don't exist yet). Surfaced as a clarification — "name all
  // three letters" — NOT escalated to the LLM (which would only guess). `vertex` is the named vertex.
  | { ok: false; reason: 'ambiguous-angle'; vertex: string }
  // The utterance references a circle at a centre that carries a CONCENTRIC PAIR (ADR-244) with no
  // outer/inner qualifier and no disambiguating stated membership — WHICH circle is meant is the
  // student's to say ("המעגל החיצוני"/"the inner circle"), never a silent pick or an LLM guess.
  | { ok: false; reason: 'ambiguous-circle'; center: string };

/**
 * Figure context the parser may consult to resolve implicit references — chiefly
 * "the circle" / a tangent/chord that doesn't name its circle, resolved to the one
 * circle already present. Empty by default (a context-free parse).
 */
export interface ParseContext {
  /** Centre letters of circles already in the figure (e.g. ['O']). */
  circles?: string[];
  /** Point ids already in the figure — so inscribing an EXISTING triangle becomes its circumcircle. */
  points?: string[];
  /** For each circle (one entry per circle OBJECT), the points known to lie on it — lets "arc BC" resolve
   *  to the circle that actually contains both B and C (disambiguates 2+ circles / corrects a wrong one).
   *  `id` distinguishes a CONCENTRIC pair's two circles (ADR-244); optional so hand-built contexts stay valid. */
  circleMembers?: { id?: string; center: string; points: string[] }[];
  /** CONCENTRIC pairs in the figure (ADR-244): the shared centre letter + the bound outer/inner circle
   *  ids — lets "המעגל החיצוני/הפנימי" / "the outer/inner circle" resolve to the right circle, and makes
   *  an UNQUALIFIED reference to that centre a clarification request instead of a silent guess. */
  concentric?: { center: string; outer: string; inner: string }[];
  /** For each point, the points it's joined to (segment / polygon edge) — lets a single-vertex angle
   *  ("∠C") resolve its two arms, so "∠C קהה/חדה" (obtuse/acute) works without spelling all three. */
  neighbors?: Record<string, string[]>;
  /** For each FREE on-segment point, the endpoints of the side it rides (`E → ['A','C']`) — lets a base-less
   *  midsegment ("EG קטע אמצעים" with E already on AC) resolve which side E sits on ([ADR-199](docs/06-decisions.md#adr-199)). */
  onSegment?: Record<string, [string, string]>;
  /** For each existing MIDPOINT, the segment endpoints it bisects (`E → ['A','D']`) — lets a base-less
   *  named midsegment ("EF קטע אמצעים במשולש DCA" with E already the midpoint of AD) anchor on that side
   *  and reuse E, instead of escalating and re-minting a fresh M/N pair ([ADR-199](docs/06-decisions.md#adr-199) Am.). */
  midpointOf?: Record<string, [string, string]>;
  /** Vertex-disjoint PARALLEL edge-pairs in the figure (e.g. a trapezoid's bases `[['A','B'],['D','C']]`),
   *  derived from the resolved positions — lets "height/altitude from a vertex" drop to the opposite
   *  parallel base (the trapezoid case the triangle inference can't reach). */
  parallels?: [[string, string], [string, string]][];
  /** Ids of lines already in the figure (e.g. `bis-DAB`, `perp-…`) — lets a construct detect that it was
   *  ALREADY built (its deterministic scaffolding lines exist) and REUSE rather than mint a duplicate
   *  auto-named copy (the idempotency root-cause fix). */
  lines?: string[];
  /** Vertex lists of polygons already in the figure — lets a DEFINITE unnamed shape reference
   *  ("במרובע חסום מעגל" typed after מרובע ABCD exists) bind to THE existing polygon instead of minting
   *  a fresh auto-named one (the ADR-029 implicit-reference pattern, polygon edition). */
  polygons?: string[][];
  /** Centre letters that were AUTO-assigned to an unnamed circle (hidden until named) — «מרכז המעגל
   *  הוא P» renames one of these to P and reveals it, instead of creating a second circle (issue #112). */
  autoCenters?: string[];
  /** Radius symbols already bound in the figure (issue #54) — "מעגל שרדיוסו R" / "רדיוס מעגל P הוא r"
   *  stamp the letter on the circle; relations between the letters ("R = 1.5r", "R > r") resolve each
   *  to its circle here. Keyed by the letter, CASE-SENSITIVE (bagrut convention: R vs r are different
   *  radii). */
  radiusSymbols?: { name: string; circle: string; center: string }[];
  /** Recorded SIZE roles between circles (`set-radius-order`, concentric or not — issue #102): lets
   *  «המעגל הגדול/הקטן» resolve consistently once assigned. */
  radiusOrder?: { outer: string; inner: string }[];
  /** Each circle's CURRENT drawn size — the M4 soft default a first «המעגל הגדול» assignment reads
   *  (what the student is looking at); the emitted `set-radius-order` then locks the roles. */
  circleSizes?: { id: string; center: string; r: number }[];
}

/** The centre of a circle that contains EVERY point in `pts` (preferring `prefer` if it qualifies), else null. */
const circleContaining = (ctx: ParseContext, pts: string[], prefer?: string | null): string | null => {
  const has = (center: string) => membersOfCenter(ctx, center).size > 0 && pts.every((p) => membersOfCenter(ctx, center).has(p.toUpperCase()));
  if (prefer && has(prefer)) return prefer;
  return ctx.circleMembers?.find((e) => pts.every((p) => e.points.includes(p)))?.center ?? null;
};
/** ALL points known on any circle at this CENTRE — the union across a concentric pair's two entries
 *  (ADR-244: `circleMembers` is per circle id, so a per-centre "already a member?" guard must union). */
const membersOfCenter = (ctx: ParseContext, center: string): Set<string> => {
  const out = new Set<string>();
  for (const e of ctx.circleMembers ?? [])
    if (e.center.toUpperCase() === center.toUpperCase()) for (const p of e.points) out.add(p.toUpperCase());
  return out;
};
const NO_CONTEXT: ParseContext = {};

/** The label of a "דרך [ה]נקודה X" / "through [the] point X" / bare "דרך X" carrier clause, or null.
 *  Shared by the tangent rules: a tangent drawn THROUGH a point names that point as a carrier — and when
 *  the point is a known circle MEMBER, it IS the touch (issue #100; the ADR-233 membership-over-position
 *  principle). The bare "דרך X" form is read only where a tangent keyword already gates the rule. */
const throughPointLabel = (s: string): string | null => {
  const m =
    s.match(/(?:דרך\s+ה?נקודה|through\s+(?:the\s+)?point)\s+([A-Za-z]\d*)/i) ??
    s.match(/(?:דרך|\bthrough\b)\s+([A-Za-z]\d*)(?![A-Za-z])/i);
  return m ? up(m[1]) : null;
};

/** Orient a tangent rule's (touch, cut) label pair by CIRCLE MEMBERSHIP — the touch is the label the
 *  figure already knows is ON the circle, wherever it sits in the sentence; the positional read ("the
 *  label after the tangent keyword's בנקודה/at") is only the tiebreak when membership says nothing.
 *  The ADR-233 proxy-vs-semantic lesson, intersection edition (issue #36): in "דרך הנקודה C העבירו
 *  משיק … שחותך … בנקודה E" the touch C is named BEFORE the keyword and the only post-keyword label is
 *  the CUT point — a positional bind swaps the roles and re-creates the on-circle C as a crossing.
 *  When NEITHER label is a known member, an explicit through-carrier ("דרך הנקודה X"/"through point X")
 *  names the touch — a tangent drawn through an on-circle X touches at X. */
const orientTouchCut = (s: string, ctx: ParseContext, center: string, touch: string, cut: string): [string, string] => {
  const members = membersOfCenter(ctx, center);
  if (members.has(touch)) return [touch, cut];
  if (members.has(cut)) return [cut, touch];
  const thr = throughPointLabel(s);
  if (thr && thr === cut) return [cut, touch];
  return [touch, cut];
};

/**
 * 'stop' = the rule recognised its keyword but could not read the sentence:
 * abort the whole parse (→ not-handled, the fallback boundary) instead of
 * letting a weaker rule half-parse the utterance. A half-parse that silently
 * drops part of a fact is worse than a miss — it draws a wrong figure.
 */
/** A rule (or post-pass) recognised the input but needs the student to disambiguate (see `ParseResult`
 *  'ambiguous-angle' / 'ambiguous-circle'). Returned in place of commands; `parse` turns it into the
 *  matching `{ ok:false }` clarification result. */
type Clarify = { clarify: 'ambiguous-angle'; vertex: string } | { clarify: 'ambiguous-circle'; center: string };
type Rule = (s: string, ctx: ParseContext) => AnyCommand[] | null | 'stop' | Clarify;

const up = (c: string): Id => c.toUpperCase();
/** A captured token is a real vertex label only if it's already UPPERCASE (the parser's convention).
 *  Lets a NAMED-segment rule (altitude/midsegment) tell a student label ("CD") from a lowercase connector
 *  word the regex would otherwise read as two single-letter labels ("to" → T,O, "in" → I,N). */
const isUpperLabel = (c: string | undefined): boolean => !!c && c === c.toUpperCase() && /[A-Z]/.test(c);
const num = String.raw`(-?\d+(?:\.\d+)?)`;

/** Deterministic circle id from its centre letter — so "circle O" is referenceable by name. */
const circleId = (center: string): Id => `circle-${center.toUpperCase()}`;
/**
 * The centre letter named in `s`, regardless of word order — "circle O" / "מעגל O" / "centered at O" /
 * "שמרכזו O" / "מרכז המעגל O", AND the order-INDEPENDENT phrasings the original positional regexes
 * missed: "O מרכז המעגל" (letter first), "O הוא מרכז המעגל", "מרכז המעגל הוא נקודה O", "O is the centre
 * of the circle", "the centre of the circle is O" ([ADR] — keyword-order-independence, the grammar's
 * stated property). The orderless patterns are GATED on BOTH a centre word and a circle word being
 * present, so a "centre of segment BC" style phrase (no circle) can never have a letter mistaken for a
 * circle centre.
 */
const circleCenter = (s: string): string | null => {
  // An optional "בנקודה"/"at point" may sit between the centre word and its label — "מעגל שמרכזו בנקודה O"
  // (the 2025-exam wording; issue #100 ride-along). Without it the stated centre was silently DROPPED and
  // an auto-named sibling minted (P) — luck-dependent honesty (§6).
  const m =
    s.match(/(?:cent\w*\s+(?:at\s+)?(?:point\s+)?|around\s+|שמרכזו\s+(?:ב?נקודה\s+)?|שמרכזו|מרכזו\s+(?:ב?נקודה\s+)?|מרכזו|סביב\s+)([A-Za-z]\d*)\b/i) ??
    s.match(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/i) ??
    orderlessCenter(s);
  return m ? m[1] : null;
};
/** Order-independent "X is the centre of the circle" / "מרכז המעגל [הוא] X" — see `circleCenter`. */
const orderlessCenter = (s: string): RegExpMatchArray | null => {
  if (!/cent(?:er|re)|מרכז/i.test(s) || !/circle|מעגל/i.test(s)) return null; // both a centre word AND a circle word
  return (
    // Hebrew, letter BEFORE: "O [הוא/היא/הינו] מרכז ה?מעגל" (optionally "נקודה O …")
    s.match(/(?:^|\s)(?:ה?נקוד[הת]\s+)?([A-Za-z]\d*)\s+(?:הוא\s+|היא\s+|הינו\s+)?מרכז\s+ה?מעגל/i) ??
    // Hebrew, letter AFTER with a copula/noun the "מעגל X" branch skips: "מרכז ה?מעגל [הוא/היא] [נקודה] O"
    s.match(/מרכז\s+ה?מעגל\s+(?:הוא\s+|היא\s+)?(?:ה?נקוד[הת]\s+)?([A-Za-z]\d*)\b/i) ??
    // English, letter BEFORE: "O is the centre …" (circle word guaranteed present by the gate above)
    s.match(/(?:^|\s)([A-Za-z]\d*)\s+(?:is\s+)?(?:the\s+)?cent(?:er|re)\b/i) ??
    // English, letter AFTER: "the centre of the circle is O"
    s.match(/cent(?:er|re)\b[\s\S]*?\bcircle\b[\s\S]*?\bis\s+([A-Za-z]\d*)\b/i)
  );
};
/**
 * The incentre letter a student NAMES as the SUBJECT of an incircle phrasing — "M מרכז המעגל החסום
 * במשולש BDC" / "M is the centre of the circle inscribed in triangle ABC" / "incentre M of …". This
 * label sits BEFORE the centre word (or right after "incentre"), so `circleCenter` ("circle M" /
 * "centred at M") never catches it — it would be DROPPED, escalate to the LLM, and build a duplicate
 * incircle ([ADR-125](docs/06-decisions.md#adr-125)). Returns the label, or null.
 */
const incenterLabel = (s: string): string | null => {
  const m =
    // leading subject: "M מרכז…" / "M is the [in]centre…"
    s.match(/^\s*([A-Za-z]\d*)\s+(?:is\s+|הוא\s+|הינו\s+)?(?:the\s+)?(?:in)?cent(?:er|re)\b/i) ??
    s.match(/^\s*([A-Za-z]\d*)\s+מרכז/i) ??
    // trailing: "incentre M" / "incenter is M"
    s.match(/incent(?:er|re)\s+(?:is\s+)?([A-Za-z]\d*)\b/i);
  return m ? m[1] : null;
};
/**
 * The circle a phrase refers to: its named centre, or — when none is named and the
 * figure has exactly ONE circle — that circle's centre (implicit "the circle"). With
 * 0 or 2+ unnamed circles it stays null (ambiguous → the rule defers/escalates).
 */
/**
 * #82/#81/#83 ([ADR-291](docs/06-decisions.md#adr-291)): "המעגל החוסם את [המשולש|המרובע] ABC[D]" /
 * "the circle circumscribing …" as a circle REFERENCE — resolved to the EXISTING circle through the
 * named points (M1: resolution before creation; the ADR-119 circle-reference chokepoint, so EVERY
 * circle-consuming rule gains the phrasing at once). Null when no such circle exists yet — the
 * creation rules (`circumcircle`/`circumcircleMeetsSegment`) keep owning that case.
 */
const CIRCUM_REF_SRC = String.raw`(?:ה?מעגל\s+ה?חוסם\s+(?:את\s+)?(?:ה?משולש\s+|ה?מרובע\s+)?|(?:the\s+)?circle\s+circumscribing\s+(?:the\s+)?(?:triangle\s+|quad(?:rilateral)?\s+)?)((?:[A-Za-z]\d*\s*){3,4})`;
const circumscribingRef = (s: string, ctx: ParseContext): string | null => {
  const m = s.match(new RegExp(CIRCUM_REF_SRC, 'i'));
  if (!m) return null;
  const run = (m[1].match(/[A-Za-z]\d*/g) ?? []).map(up);
  if (run.length < 3) return null;
  return circleContaining(ctx, run);
};

const resolveCenter = (s: string, ctx: ParseContext): string | null =>
  circleCenter(s) ?? circumscribingRef(s, ctx) ?? (ctx.circles?.length === 1 ? ctx.circles[0] : null);

/** True when the utterance explicitly refers to a circle — named ("circle O") or definite ("the circle" / "המעגל"). */
const mentionsCircle = (s: string): boolean => /circle|מעגל/i.test(s);

/**
 * The circle a rule that is NOT gated on a circle-specific keyword (a generic "X cuts Y") should act on:
 * the named centre, or — when the utterance explicitly says "the circle" / "המעגל" and the figure holds
 * exactly ONE circle — that circle. Unlike `resolveCenter`, it does NOT grab the single circle for an
 * utterance that never mentions a circle, so a plain line∩line / point-on-extension is not misread as a
 * circle intersection. (Operator principle: with one circle in the diagram you needn't name it.)
 */
const resolveMentionedCircle = (s: string, ctx: ParseContext): string | null =>
  circleCenter(s) ?? circumscribingRef(s, ctx) ?? (mentionsCircle(s) && ctx.circles?.length === 1 ? ctx.circles[0] : null);

/** The crossing point named AFTER the circle word ("… circle [O] at R" / "… [ה]מעגל [O] בנקודה R"),
 *  with the circle's NAME optional so "the circle" / "המעגל" anchors too (operator: one circle → no name). */
const crossingAfterCircle = (s: string): string | null => {
  const ci = s.search(/(?:circle|מעגל)(?:\s+[A-Za-z]\d*)?/i);
  if (ci < 0) return null;
  const m = s.slice(ci).match(/(?:\bat\b|בנקודה|ב-)\s*([A-Za-z]\d*)\b/i);
  return m ? up(m[1]) : null;
};

/** The new point named BEFORE the construction in a definitional/noun phrasing —
 *  "[ה]נקודה E היא …" / "point E is …" / a leading "E is …"/"E = …". Lets the
 *  noun form ("E is the intersection/מפגש of AB with the circle") name its result
 *  point, mirroring `crossingAfterCircle` for the verb form ("… circle at E"). */
const leadingNamedPoint = (s: string): string | null => {
  const m =
    s.match(/(?:^|\s)(?:ה?נקוד[הת]|point)\s+([A-Za-z]\d*)\b/i) ??
    s.match(/^\s*([A-Za-z]\d*)\s*(?:\bis\b|היא|הוא|=)/i) ??
    // #71 (log-triage): the appositive NOUN form, no copula — "E נקודת החיתוך של המעגל עם AD"
    s.match(/^\s*([A-Za-z]\d*)\s+נקודת\s+ה?(?:חיתוך|מפגש)/) ??
    s.match(/^\s*([A-Za-z]\d*)\s+(?:is\s+)?the\s+(?:intersection|meeting)\s+point\b/i);
  return m ? up(m[1]) : null;
};

/** Remove a "circle X" / "מעגל X" mention so its centre letter isn't read as a figure label. */
const dropCircleRef = (s: string): string =>
  s
    .replace(new RegExp(CIRCUM_REF_SRC, 'gi'), ' ') // the ADR-291 circumscribing REFERENCE, labels and all
    .replace(/(?:circle|מעגל)\s+[A-Za-z]\d*\b/gi, ' ');

/**
 * English filler words, lowercase only — typed fillers are lowercase, while
 * uppercase pairs like "ON" must stay readable as point labels (O, N).
 */
// Lowercase-only (no /i): the ARTICLES "a"/"an" are filler exactly like "the", but an UPPERCASE "A" is a
// point label and must survive — "through point A a tangent is drawn" read the article as a second label
// A, producing a degenerate pair (issue #100 En mirror).
const FILLER = /\b(?:a|an|to|the|and|of|is|are|at|on|in|with|from|that|so|such)\b/g;

/**
 * Find a run of `n` point labels, as a contiguous token ("ABCD", "O1O2") or `n`
 * space-separated tokens ("A B C D", "O1 O2"), anywhere in `s`. A point token is a
 * letter + optional digit subscript (`[A-Za-z]\d*`), so "ABCD" stays four points
 * (letters carry no digits) while "O1O2"/"O1 O2" read as two. Returns them
 * uppercased, or null. Strip keywords from `s` first so a Latin keyword's own
 * letters (e.g. "square") aren't mistaken for labels; lowercase filler words
 * are stripped here so "connect A to B" can't read "to" as the labels T,O.
 */
const PT = String.raw`[A-Za-z]\d*`; // a point token: a letter + an optional digit subscript (O, O1, A12)
function labelRun(s: string, n: number): Id[] | null {
  const t = s.replace(FILLER, ' ');
  // A single word of exactly n tokens ("ABCD", "O1O2") — split it back into tokens.
  const contiguous = t.match(new RegExp(String.raw`\b(?:${PT}){${n}}\b`));
  if (contiguous) {
    const toks = contiguous[0].match(new RegExp(PT, 'g'));
    if (toks && toks.length === n) return toks.map(up);
  }
  const spaced = t.match(new RegExp(Array.from({ length: n }, () => String.raw`\b(${PT})\b`).join(String.raw`\s+`)));
  if (spaced) return spaced.slice(1, n + 1).map(up);
  return null;
}

/** First label from `prefer` (else any A–Z) not already in `used` — for an auto-named auxiliary point. */
function freeLabel(used: string[], prefer: string[] = []): Id {
  const taken = new Set(used.map((u) => u.toUpperCase()));
  const pool = [...prefer, ...'MNPQRSTUVWXYZKLGHIJ'.split('')];
  return (pool.find((c) => !taken.has(c.toUpperCase())) ?? 'M').toUpperCase();
}

/**
 * An ANONYMOUS constructed point ([ADR-297](docs/06-decisions.md#adr-297) / issue #32): a point a
 * decomposition NEEDS to build a figure (an incircle touch point, a tangency foot) but which the STUDENT
 * did not name. `@`-prefixed so it can never occupy a student letter — the namespace-hijack class where an
 * auto-minted `F`/`G`/`H` stole a letter the student then reached for (`G על המשך CA` bound to the invisible
 * incircle foot). It renders as a clickable DOT the student promotes to a real letter when the book labels
 * it (students copy from books where these touch points are often unlabeled). Deterministic from its
 * defining parts (like `seg-AB`), so re-issuing the command is idempotent. Excluded from the parse context
 * ({@link buildParseCtx}) and from detection ({@link isScaffoldId}) until promoted. */
const anonId = (...parts: string[]): Id => `@${parts.join('-')}`;

/** The first `n` vertex labels — A, B, C, D, … in order, skipping any already in `used` — for a polygon
 *  the student drew WITHOUT naming its vertices ("מרובע חסום במעגל" / "square"). The convention is to name
 *  vertices alphabetically; this just supplies that default so a bare shape is deterministic, not an LLM
 *  escalation. The labels are shown on the canvas, so later references ("AB", "∠ABC") work as usual. */
function autoVertexLabels(n: number, used: string[] = []): Id[] {
  const taken = new Set(used.map((u) => u.toUpperCase()));
  const out: Id[] = [];
  for (let c = 0; out.length < n && c < 26; c++) {
    const ch = String.fromCharCode(65 + c); // 'A' + c
    if (!taken.has(ch)) out.push(ch);
  }
  return out;
}

/** The vertices of THE existing polygon an unnamed DEFINITE shape reference binds to — exactly one
 *  n-gon in the figure (zero → auto-name a fresh shape as before; two+ → ambiguous, also fall back).
 *  "במרובע חסום מעגל" after "ABCD מרובע" means THAT quad, not a brand-new EFGH (the ADR-029
 *  implicit-reference pattern, polygon edition). */
const existingPolygon = (ctx: ParseContext, n: number): Id[] | null => {
  const matches = (ctx.polygons ?? []).filter((v) => v.length === n);
  return matches.length === 1 ? matches[0].map(up) : null;
};

/** Did the student write an explicit vertex label? Vertex labels are UPPERCASE Latin (the parser's
 *  convention), so an uppercase letter means "named" while lowercase prose remnants ("inscribed in a
 *  circle" → "in a") and Hebrew do not — this is what tells a deliberately-unlabeled shape (auto-name it)
 *  from a PARTIAL/typo'd label run (escalate). Used only to decide auto-naming, never to read the labels. */
const namesVertices = (s: string): boolean => /[A-Z]/.test(s);

/**
 * Vertex labels for an n-vertex shape rule: the run the student wrote, or — when they named NONE and
 * nothing else geometry-significant remains — auto-named vertices (A,B,C,…). Returns null when SOME but
 * not a clean run of n labels is present (a typo / compound) OR a leftover survives (a circle/constraint
 * belongs to another rule), so the caller defers/escalates exactly as before. `bare` is the utterance with
 * the shape's own keyword(s) already stripped; `hasLeftover` is the rule's SHAPE_LEFTOVER verdict.
 */
function shapeLabels(bare: string, n: number, ctx: ParseContext, hasLeftover: boolean): Id[] | null {
  const ids = labelRun(bare, n);
  if (ids) return ids;
  if (hasLeftover || namesVertices(bare)) return null; // defer (leftover) / escalate (partial labels)
  return autoVertexLabels(n, ctx.points ?? []);
}

/**
 * Geometry-significant words/operators a *shape* rule does not itself consume —
 * a circle, a special line, a constraint, an inscription, an angle. If any of
 * these survives after a shape's keyword + labels are removed, the utterance
 * carries meaning the shape rule would silently drop (e.g. "square ABCD inscribed
 * in a circle"). Rather than half-parse, the rule aborts and the input escalates
 * to the LLM (ADR-002/023). Latin terms are word-bounded so they don't match
 * inside "rectangle"/"triangle"; the shape's own keyword is removed before the
 * test, so e.g. "triangle"/"angle" there is fine.
 *
 * SIDE references, the EVERY/EACH quantifier, and the POLYGON nouns joined the vocabulary with issue #27
 * (ADR-282): «על כל צלע של ריבוע יש חצי מעגל» left `כל צלע של ריבוע` unconsumed and the semicircle rule
 * DEFAULTED its diameter to A,B — one semicircle, quantifier and side reference silently dropped, all
 * rows ✓. Every user of this guard strips its OWN vocabulary first, so a polygon noun/side word that
 * survives always means a compound the rule cannot express — escalate, never half-parse. (The compound
 * shape phrases שווה־צלעות / שווה־שוקיים are stripped as UNITS by their owners before the test.)
 */
const SHAPE_LEFTOVER =
  /\b(?:inscrib\w*|circumscrib\w*|circles?|tangents?|diameters?|chords?|arcs?|radius|radii|perpendiculars?|parallels?|bisects?|bisectors?|midpoints?|medians?|heights?|altitudes?|foot|feet|intersections?|extensions?|angles?|segments?|diagonals?|connect|congruent|similar|points?|sides?|every|each|triangles?|squares?|rectangles?|rhombus(?:es)?|trapezoids?|kites?|parallelograms?|quadrilaterals?)\b|[=⊥⟂∥∩°≅~∼∽]|חסום|חוסם|מעגל|משיק|קוטר|מיתר|קשת|רדיוס|מאונ[כך]|אנ[כך]|מקביל|חוצ|אמצע|תיכון|גובה|המש(?:ך|כי(?:ם|הם|הן)?)|חיתוך|זוו?ית|קטע|אלכסון|חבר|נקוד|חופ|דומ|צלע|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|דלתון|עפיפון|מקבילית|(?<![א-ת])[ובשלמכ]?כל(?![א-ת])/i;

/** True if, after removing the shape keyword, geometry the shape can't express remains. */
const shapeHasLeftover = (s: string, re: RegExp): boolean => SHAPE_LEFTOVER.test(s.replace(re, ' '));

/** A quad-shape rule factory: keyword (either order) + 4 labels → command. */
const quadShape =
  (re: RegExp, make: (ids: [Id, Id, Id, Id]) => Command): Rule =>
  (s, ctx) => {
    if (!re.test(s)) return null;
    const leftover = shapeHasLeftover(s, re);
    const ids = shapeLabels(s.replace(re, ' '), 4, ctx, leftover); // explicit run, or auto-named A,B,C,D for a bare shape
    if (!ids) return null;
    if (leftover) return 'stop'; // labels + a modifier left over → don't drop it, escalate
    return [make([ids[0], ids[1], ids[2], ids[3]])];
  };

/** A triangle rule factory: keyword (either order) + 3 labels → command. */
const triShape =
  (re: RegExp, make: (ids: [Id, Id, Id]) => Command): Rule =>
  (s, ctx) => {
    // "the circle CIRCUMSCRIBING triangle ABC …" names a circumcircle, not a free triangle — defer so the
    // "משולש ABC" inside it doesn't make this rule `stop` (the circumcircle rules sit after the polygons).
    // BEFORE `re.test` so the early return doesn't leave the `g`-flagged `re`'s lastIndex advanced.
    if (/circle|מעגל/i.test(s) && /circumscrib|חוסם|\bthrough\b|דרך/i.test(s)) return null;
    if (!re.test(s)) return null;
    const leftover = shapeHasLeftover(s, re);
    const ids = shapeLabels(s.replace(re, ' '), 3, ctx, leftover); // explicit run, or auto-named A,B,C for a bare shape
    if (!ids) return null;
    if (leftover) return 'stop';
    return [make([ids[0], ids[1], ids[2]])];
  };

/** "square ABCD" / "ריבוע ABCD" — keyword and labels in either order. */
const square = quadShape(/square|ריבוע/gi, (ids) => ({ type: 'square', ids }));

/** "parallelogram ABCD" / "מקבילית ABCD" — A,B,C free, D derived. */
const parallelogram = quadShape(/parallelogram|מקבילית/gi, (ids) => ({ type: 'parallelogram', ids }));

/** "rectangle ABCD" / "מלבן ABCD". */
const rectangle = quadShape(/rectangle|מלבן/gi, (ids) => ({ type: 'rectangle', ids }));

/** "rhombus ABCD" / "מעוין ABCD". */
const rhombus = quadShape(/rhombus|מעוין/gi, (ids) => ({ type: 'rhombus', ids }));

/** "trapezoid ABCD" / "trapezium ABCD" / "טרפז ABCD". */
const trapezoid = quadShape(/trapezoid|trapezium|טרפז/gi, (ids) => ({ type: 'trapezoid', ids }));

/** "quadrilateral ABCD" / "מרובע ABCD" — a general quad (4 free vertices). */
const quadrilateral = quadShape(/quadrilateral|quad|מרובע/gi, (ids) => ({ type: 'quadrilateral', ids }));

/** "triangle ABC" / "משולש ABC" / "△ABC" — 3 free vertices. (`△`/`▲` is the toolbar triangle glyph,
 *  the construction counterpart of `∠` for angles, so `△ABC` builds a triangle like `∠ABC` states an angle.) */
const triangle = triShape(/triangle|משולש|[△▲]/gi, (ids) => ({ type: 'triangle', ids }));

/**
 * A named-shape MACRO ([ADR-110](docs/06-decisions.md#adr-110)): a keyword (He/En) + n labels decomposed into a sequence of
 * already-supported canonical commands — e.g. a kite = a general quad + two equal-adjacent-side
 * constraints. The figure is built from declared relationships on existing primitives (the constraint
 * solver does the work), so no new engine construct is needed. Mirrors `quadShape`/`triShape` (label run +
 * SHAPE_LEFTOVER escalation) but `trigger` (what fires the rule) and `strip` (every keyword word to remove
 * before reading labels) are separate, because a shape like "isosceles triangle" fires on "isosceles" yet
 * must strip "triangle" too.
 */
const shapeMacro =
  (trigger: RegExp, strip: RegExp, n: number, make: (ids: Id[]) => AnyCommand[], defer?: (s: string) => boolean): Rule =>
  (s, ctx) => {
    if (defer?.(s)) return null; // a downstream rule owns this phrasing (e.g. a triangle through/around a circle)
    if (!trigger.test(s)) return null;
    const bare = s.replace(strip, ' ');
    const ids = labelRun(bare, n);
    if (!ids) {
      // No label run. Auto-name a bare named shape ("דלתון" → A,B,C,D) when the student named NO labels and
      // nothing geometry-significant remains; a partial run / leftover defers or escalates exactly as before.
      if (namesVertices(bare) || SHAPE_LEFTOVER.test(bare)) return null;
      return make(autoVertexLabels(n, ctx.points ?? []));
    }
    // After keyword + labels are consumed, nothing geometry-significant should remain — a constraint/extra
    // construct ("kite ABCD with AB = 6") means a compound → escalate, don't half-parse (mirrors inscribedPolygon).
    const leftover = ids.reduce(
      (a, id) => a.replace(new RegExp(String.raw`\b${id}\b`, 'gi'), ' '),
      bare.replace(new RegExp(String.raw`\b${ids.join('')}\b`, 'i'), ' '),
    );
    if (SHAPE_LEFTOVER.test(leftover)) return 'stop';
    return make(ids);
  };

/** "kite ABCD" / "דלתון ABCD" (also "עפיפון") → a `shape-variant` whose equal-pair AXIS is a cyclable choice
 *  ([ADR-138](docs/06-decisions.md#adr-138)): variant 0 = axis AC (|AB|=|AD|, |CB|=|CD|), variant 1 = axis BD.
 *  `replay` expands it to a free quad + the selected pair; an explicit `AB=BC` pins the other axis. */
const kite = shapeMacro(/kite|דלתון|עפיפון/i, /kite|דלתון|עפיפון/gi, 4, (ids) => [
  { type: 'shape-variant', shape: 'kite', ids: [ids[0], ids[1], ids[2], ids[3]], variant: 0 },
]);

/** A triangle phrasing that names a circle it is THROUGH / circumscribes belongs to the circumcircle/incircle
 *  rules downstream — defer (matches the `triShape` guard) so "isosceles triangle ABC … חוסם במעגל" isn't
 *  half-claimed by the macro. (Inscribed/"חסום" is NOT here — that escalates as a genuine compound.) */
const triThroughCircle = (s: string): boolean =>
  /circle|מעגל/i.test(s) && /circumscrib\w*|חוסם|\bthrough\b|דרך/i.test(s);

/** "isosceles triangle ABC" / "משולש שווה שוקיים ABC" → a `shape-variant` whose APEX is a cyclable choice
 *  ([ADR-138](docs/06-decisions.md#adr-138), subsuming the ADR-114 soft default): variant 0 = apex A
 *  (|AB|=|AC|), variant 1 = apex B, variant 2 = apex C. "Isosceles" only asserts SOME two sides equal; which
 *  pair is the student's to state ([ADR-052](docs/06-decisions.md#adr-052)). `replay` expands to a triangle +
 *  the selected pair; an explicit equality among the sides ("AB=BC") PINS the matching apex (so it doesn't
 *  stack into an equilateral). With no explicit pair it draws apex A. (`equilateral` below is unambiguous.) */
const isoscelesTriangle = shapeMacro(
  /isosceles|שווה[\s-]?שוקיים/i,
  /isosceles|triangle|שווה[\s-]?שוקיים|משולש/gi,
  3,
  (ids) => [{ type: 'shape-variant', shape: 'isosceles', ids: [ids[0], ids[1], ids[2]], variant: 0 }],
  triThroughCircle,
);

/** "equilateral triangle ABC" / "משולש שווה צלעות ABC" → a triangle + all three sides equal. */
const equilateral = shapeMacro(
  /equilateral|שווה[\s-]?צלעות/i,
  /equilateral|triangle|שווה[\s-]?צלעות|משולש/gi,
  3,
  (ids) => [
    { type: 'triangle', ids: [ids[0], ids[1], ids[2]] },
    { type: 'set-equal', a: ids[0], b: ids[1], c: ids[1], d: ids[2] }, // |AB| = |BC|
    { type: 'set-equal', a: ids[1], b: ids[2], c: ids[2], d: ids[0] }, // |BC| = |CA|
  ],
  triThroughCircle,
);

/** "isosceles trapezoid ABCD" / "טרפז שווה שוקיים ABCD" → a trapezoid (AB∥DC) + equal legs |AD|=|BC|.
 *  Fires only when BOTH the isosceles and the trapezoid keyword are present (either order). */
const isoscelesTrapezoid = shapeMacro(
  /(?:isosceles|שווה[\s-]?שוקיים)[\s\S]*(?:trapezoid|trapezium|טרפז)|(?:trapezoid|trapezium|טרפז)[\s\S]*(?:isosceles|שווה[\s-]?שוקיים)/i,
  /isosceles|שווה[\s-]?שוקיים|trapezoid|trapezium|טרפז/gi,
  4,
  (ids) => [
    { type: 'trapezoid', ids: [ids[0], ids[1], ids[2], ids[3]] },
    { type: 'set-equal', a: ids[0], b: ids[3], c: ids[1], d: ids[2] }, // |AD| = |BC| (the two legs; AB ∥ DC)
  ],
);

/** "right trapezoid ABCD" / "טרפז ישר זווית ABCD" → a trapezoid (AB∥DC) + one leg ⟂ the bases (AD ⟂ AB),
 *  yielding the two right angles at A and D. Fires only when BOTH the right-angle and trapezoid keywords are
 *  present (either order). MUST precede `rightTriangle` in the rule list — that rule's guard matches a bare
 *  "ישר זווית"/"right", so "טרפז ישר זווית ABCD" would otherwise be mis-claimed as a 3-vertex right triangle. */
const rightTrapezoid = shapeMacro(
  /(?:right[\s-]?(?:angled?\s*)?|ישר[\s-]?זוו?ית)[\s\S]*(?:trapezoid|trapezium|טרפז)|(?:trapezoid|trapezium|טרפז)[\s\S]*(?:right[\s-]?(?:angled?\s*)?|ישר[\s-]?זוו?ית)/i,
  /right[\s-]?angled|right[\s-]?angle|right|ישר[\s-]?זוו?ית|זוו?ית|ישרה|trapezoid|trapezium|טרפז/gi,
  4,
  (ids) => [
    { type: 'trapezoid', ids: [ids[0], ids[1], ids[2], ids[3]] },
    { type: 'set-perpendicular', a: ids[0], b: ids[3], c: ids[0], d: ids[1] }, // AD ⟂ AB ⇒ right angles at A and D
  ],
);

/**
 * The base-less midsegment ("EG קטע אמצעים", no parallel base) — [ADR-199](docs/06-decisions.md#adr-199).
 * Requires the named endpoint pair and figure context: exactly one endpoint (`E`) already sits on a triangle
 * side — either riding it FREE (`ctx.onSegment`) or as its existing MIDPOINT (`ctx.midpointOf`, ADR-199 Am.,
 * e.g. "E אמצע AD" then "EF קטע אמצעים במשולש DCA") — and the other (`G`) is fresh. Emits a `midsegment`
 * `shape-variant` `[P,Q,R,E,G]` (E's side PQ, third vertex R = the unique common neighbour of P,Q); its two
 * variants place G on PR or QR. Reusing the existing E instead of escalating (which re-mints a stray M/N pair
 * and drops the student's own labels). If neither endpoint is on a resolvable side, or both are (a determined
 * midsegment, not a variant), returns null so the utterance falls through to the plain-segment rule.
 */
function midsegmentBaseless(s: string, ctx: ParseContext): AnyCommand[] | null {
  const nm =
    s.match(/^\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*(?:is\s+|הוא\s+)?(?:the\s+|ה)?(?:midsegment|mid-?segment|midline|קטע\s+ה?אמצעים)/i) ??
    s.match(/(?:midsegment|mid-?segment|midline|קטע\s+ה?אמצעים)\s+\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!nm || !isUpperLabel(nm[1]) || !isUpperLabel(nm[2])) return null;
  const pair = [up(nm[1]), up(nm[2])];
  if (pair[0] === pair[1]) return null;
  const onSeg = ctx.onSegment ?? {};
  const midOf = ctx.midpointOf ?? {};
  const nb = ctx.neighbors ?? {};
  // The anchor E sits on a side either as a FREE rider (onSegment) or as that side's existing midpoint
  // (midpointOf). Try each endpoint as E (the other as the fresh G). G must be genuinely fresh — neither
  // riding a side nor an existing midpoint (else the midsegment is determined, not a variant) — nor one of
  // E's own side endpoints.
  const anchor = (lbl: Id): [Id, Id] | undefined => onSeg[lbl] ?? midOf[lbl];
  const tryOrder = (eLbl: Id, gLbl: Id): AnyCommand[] | null => {
    const side = anchor(eLbl);
    if (!side || anchor(gLbl)) return null;
    const [p, q] = side;
    if (gLbl === p || gLbl === q) return null;
    const shared = (nb[p] ?? []).filter((x) => (nb[q] ?? []).includes(x) && x !== p && x !== q);
    if (shared.length !== 1 || shared[0] === gLbl) return null; // unique third vertex R, and G is fresh
    return [{ type: 'shape-variant', shape: 'midsegment', ids: [p, q, shared[0], eLbl, gLbl], variant: 0 }];
  };
  const anchored = tryOrder(pair[0], pair[1]) ?? tryOrder(pair[1], pair[0]);
  if (anchored) return anchored;
  // #71 (log-triage): BOTH letters fresh + an explicitly NAMED triangle — "EF קטע אמצעים במשולש
  // DCB". E rides the FIRST named side (the student's own vertex order signals the base — a
  // discrete labeling read, not an invented magnitude) and F cycles between the other two sides
  // via the shape-variant channel, so "show another configuration" explores the unstated side.
  const triM = s.match(/(?:במשולש|בתוך\s+משולש|in\s+(?:the\s+)?triangle)\s*\b([A-Za-z])([A-Za-z])([A-Za-z])\b/i);
  if (triM && [1, 2, 3].every((i) => isUpperLabel(triM[i]))) {
    const tri = [up(triM[1]), up(triM[2]), up(triM[3])];
    const have = new Set(ctx.points ?? []);
    if (
      new Set(tri).size === 3 &&
      !have.has(pair[0]) &&
      !have.has(pair[1]) &&
      !tri.includes(pair[0]) &&
      !tri.includes(pair[1])
    )
      return [
        { type: 'triangle', ids: [tri[0], tri[1], tri[2]] },
        // E must EXIST as a rider on its side before the variant's set-equal pins it to the midpoint
        { type: 'point-on-segment', id: pair[0], a: tri[0], b: tri[1] },
        { type: 'shape-variant', shape: 'midsegment', ids: [tri[0], tri[1], tri[2], pair[0], pair[1]], variant: 0 },
      ];
  }
  return null;
}

/**
 * A trapezoid's midsegment (median) — the segment joining the midpoints of the two LEGS (the non-parallel
 * sides), parallel to and midway between the two bases. Resolved from the FIGURE like the trapezoid altitude
 * ([ADR-169](docs/06-decisions.md#adr-169)): the two bases are the figure's unique vertex-disjoint parallel
 * edge-pair (`ctx.parallels`) — exactly ONE such pair means a trapezoid (a triangle has none; a
 * parallelogram has two ⇒ which base? ambiguous ⇒ defer, ADR-052), and each leg joins a base-1 endpoint to
 * the base-2 endpoint it is adjacent to in the figure (`ctx.neighbors`). Decomposes to two `midpoint`s (one
 * per leg) + a `segment` — all already supported, so the constraint solver keeps it parallel to the bases
 * and no new engine construct is needed ([ADR-222](docs/06-decisions.md#adr-222)). Honours named endpoints
 * ("EF קטע אמצעים בטרפז", like the triangle rule). The trapezoid already exists in the figure, so no shape is
 * re-emitted. Returns null (defer to the triangle paths / LLM) when the figure is not a resolvable trapezoid.
 */
function trapezoidMidsegment(s: string, ctx: ParseContext): AnyCommand[] | null {
  let verts: Id[];
  let legs: [Id, Id][];
  let build: AnyCommand | null = null;
  // (1) An EXPLICITLY NAMED trapezoid — "…בטרפז ABCD" / "…of trapezoid ABCD" (4 labels). By the shape
  //     convention the bases are AB ∥ DC, so the legs are the other two sides BC and DA; derive them from
  //     the vertex order (no context needed) and build the trapezoid if it isn't drawn yet. This makes the
  //     self-contained form work (and lets the help catalog carry it).
  const nameM = s.match(/(?:trapezoid|טרפז)\s*([A-Za-z]\d*)\s+([A-Za-z]\d*)\s+([A-Za-z]\d*)\s+([A-Za-z]\d*)/i)
    ?? s.match(/(?:trapezoid|טרפז)\s*\b([A-Za-z])([A-Za-z])([A-Za-z])([A-Za-z])\b/i);
  if (nameM && [1, 2, 3, 4].every((i) => isUpperLabel(nameM[i]))) {
    const [w, x, y, z] = [up(nameM[1]), up(nameM[2]), up(nameM[3]), up(nameM[4])];
    if (new Set([w, x, y, z]).size !== 4) return null;
    verts = [w, x, y, z];
    legs = [[x, y], [z, w]]; // sides XY and ZW — the legs (bases WX ∥ YZ)
    if (!verts.every((v) => (ctx.points ?? []).includes(v))) build = { type: 'trapezoid', ids: [w, x, y, z] };
  } else {
    // (2) INCREMENTAL — the trapezoid is already drawn; resolve its bases from the figure's unique
    //     vertex-disjoint parallel edge-pair, and its legs from the adjacency (ADR-169's `ctx.parallels`).
    const pairs = ctx.parallels ?? [];
    if (pairs.length !== 1) return null; // 0 = triangle, 2 = parallelogram (which base?) — defer, don't guess
    const base1 = pairs[0][0].map(up) as [Id, Id];
    const base2 = pairs[0][1].map(up) as [Id, Id];
    const nb = ctx.neighbors ?? {};
    // Legs: pair each base-1 endpoint with the base-2 endpoint it is joined to in the figure (an edge, not
    // the diagonal). A clean quadrilateral gives exactly one partner per endpoint; anything else ⇒ defer.
    legs = [];
    for (const a of base1) {
      const partner = base2.find((b) => (nb[a] ?? []).includes(b));
      if (!partner) return null;
      legs.push([a, partner]);
    }
    verts = [...base1, ...base2];
  }
  // Named endpoints — "EF קטע אמצעים …" (name-first) or "קטע האמצעים EF …" (keyword-first). Honour the
  // student's labels (the altitude "CD→CF" bug class): UPPERCASE, distinct, and not the trapezoid's vertices.
  const nmM =
    s.match(/^\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*(?:is\s+|הוא\s+)?(?:the\s+|ה)?(?:midsegment|mid-?segment|midline|קטע\s+ה?אמצעים)/i) ??
    s.match(/(?:midsegment|mid-?segment|midline|קטע\s+ה?אמצעים)\s+\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  const named =
    nmM && isUpperLabel(nmM[1]) && isUpperLabel(nmM[2]) && up(nmM[1]) !== up(nmM[2]) && !verts.includes(up(nmM[1])) && !verts.includes(up(nmM[2]))
      ? [up(nmM[1]), up(nmM[2])]
      : null;
  const m1 = named ? named[0] : freeLabel([...verts, ...(ctx.points ?? [])], ['M', 'N', 'P', 'Q']);
  const m2 = named ? named[1] : freeLabel([...verts, m1, ...(ctx.points ?? [])], ['N', 'P', 'Q', 'S']);
  return [
    ...(build ? [build] : []),
    { type: 'midpoint', id: m1, a: legs[0][0], b: legs[0][1] },
    { type: 'midpoint', id: m2, a: legs[1][0], b: legs[1][1] },
    { type: 'segment', a: m1, b: m2 },
  ];
}

/**
 * "the midsegment to BC in triangle ABC" / "קטע האמצעים לצלע BC במשולש ABC" — the segment joining the
 * midpoints of the two sides meeting at the apex (the triangle vertex NOT on the named base). Decomposes
 * to two `midpoint`s + a `segment` (all already supported). The base a side of the triangle; the triangle
 * is either named in THIS utterance (3 labels) or — the app's primary INCREMENTAL flow, where the student
 * drew the triangle in an earlier step and now just says "GE קטע אמצעים מקביל ל AB" — resolved from the
 * FIGURE: the apex is the unique vertex adjacent to BOTH base endpoints (`ctx.neighbors`), the same context
 * inference altitude/single-vertex-angle use. Without a resolvable triangle (a trapezoid midsegment, no
 * base named) it falls through to the LLM net.
 *
 * A THIRD form has NO base at all — "EG קטע אמצעים" where the student already placed one endpoint (`E`) on a
 * triangle side. Then which side the OTHER endpoint (`G`) rides is genuinely unstated (ADR-052): E is the
 * midpoint of its side, and G is the midpoint of one of the two OTHER sides. That choice is a cyclable
 * `shape-variant` ([ADR-199](docs/06-decisions.md#adr-199)) so "show another configuration" flips G between them.
 */
const midsegment: Rule = (s, ctx) => {
  if (!/midsegment|mid-?segment|midline|קטע\s+ה?אמצעים/i.test(s)) return null;
  const triM = s.match(/(?:triangle|משולש)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)/i);
  // A TRAPEZOID's median (leg-midpoints) — resolved from the figure's unique parallel base-pair ([ADR-222]).
  // Only when no triangle is explicitly named (a named triangle ⇒ the triangle midsegment below); returns
  // null for a triangle (no parallel pair) or a parallelogram (two), so it never steals those cases.
  if (!triM) {
    const trap = trapezoidMidsegment(s, ctx);
    if (trap) return trap;
  }
  const baseM = s.match(/(?:parallel\s+to|to|מקביל\s*ל-?|לצלע|ל-?)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!baseM) return midsegmentBaseless(s, ctx);
  const base = [up(baseM[1]), up(baseM[2])];
  if (base[0] === base[1]) return null;
  // The triangle is either NAMED here ("…in triangle ABC") or RESOLVED from the figure (incremental flow).
  let tri: Id[];
  if (triM) {
    tri = [up(triM[1]), up(triM[2]), up(triM[3])];
    if (!base.every((x) => tri.includes(x))) return null; // base must be a side of the named triangle
  } else {
    // Apex = the unique vertex joined to BOTH base endpoints in the current figure (the triangle the
    // student already drew). Ambiguous (0 or ≥2 common vertices) ⇒ fall through rather than guess.
    const nb = ctx.neighbors ?? {};
    const shared = (nb[base[0]] ?? []).filter((x) => (nb[base[1]] ?? []).includes(x) && x !== base[0] && x !== base[1]);
    if (shared.length !== 1) return null;
    tri = [shared[0], base[0], base[1]];
  }
  const apex = tri.find((v) => !base.includes(v));
  if (!apex) return null;
  // A NAMED midsegment — "MN קטע אמצעים …" (name-first) or "קטע האמצעים MN …" / "the midsegment MN …"
  // (keyword-first) — names its two endpoints (the midpoints of the apex's two sides). Honour the labels
  // the student gave instead of auto-naming them (the altitude "CD→CF" bug class). The named pair must
  // NOT be the triangle's own vertices, and the keyword-first labels must sit immediately after the
  // keyword (whitespace only) so the unnamed "…to BC in triangle ABC" is never read as a name.
  const nmM =
    s.match(/^\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*(?:is\s+|הוא\s+)?(?:the\s+|ה)?(?:midsegment|mid-?segment|midline|קטע\s+ה?אמצעים)/i) ??
    s.match(/(?:midsegment|mid-?segment|midline|קטע\s+ה?אמצעים)\s+\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  // The named pair must be UPPERCASE labels (not a lowercase connector like "to BC" → T,O) and NOT the
  // triangle's own vertices (that's the triangle/base, not the endpoints).
  const namedM = nmM && isUpperLabel(nmM[1]) && isUpperLabel(nmM[2]) ? nmM : null;
  let m1: Id, m2: Id;
  if (namedM && up(namedM[1]) !== up(namedM[2]) && !tri.includes(up(namedM[1])) && !tri.includes(up(namedM[2]))) {
    [m1, m2] = [up(namedM[1]), up(namedM[2])];
  } else {
    m1 = freeLabel([...tri, ...(ctx.points ?? [])], ['M', 'N', 'P', 'Q']);
    m2 = freeLabel([...tri, m1, ...(ctx.points ?? [])], ['N', 'P', 'Q', 'S']);
  }
  const have = new Set(ctx.points ?? []);
  const out: AnyCommand[] = [];
  if (!tri.every((v) => have.has(v))) out.push({ type: 'triangle', ids: [tri[0], tri[1], tri[2]] });
  out.push({ type: 'midpoint', id: m1, a: apex, b: base[0] });
  out.push({ type: 'midpoint', id: m2, a: apex, b: base[1] });
  out.push({ type: 'segment', a: m1, b: m2 });
  return out;
};

/**
 * The DIAGONALS of a quad/polygon — plural `אלכסונים` / construct `אלכסוני הריבוע` / `diagonals`.
 * Two forms: (A) two explicitly named diagonals joined by ו/and — `AC ו-BD אלכסוני הריבוע` → the
 * two segments; (B) bare/quad — `אלכסונים` or `אלכסוני ABCD` → every non-adjacent vertex pair of the
 * named quad (or the figure's single polygon). Singular `אלכסון AC` is a lone segment — left to `segment`.
 */
const diagonals: Rule = (s, ctx) => {
  if (!/אלכסונים|אלכסוני|\bdiagonals?\b/i.test(s)) return null;
  // (A) named diagonals: two label-pairs joined by ו/and/comma
  const named = s.match(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*(?:ו-?|,|and)\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (named && named.slice(1, 5).every(isUpperLabel)) {
    return [
      { type: 'segment', a: up(named[1]), b: up(named[2]) },
      { type: 'segment', a: up(named[3]), b: up(named[4]) },
    ];
  }
  // (B) the diagonals of a polygon — a named 4+ run, else the figure's single polygon
  let poly =
    labelRun(s.replace(/אלכסונ\S*|diagonals?|\bof\b|\bthe\b|ה?ריבוע|ה?מרובע|ה?מלבן|ה?מעוין|square|rectangle|quad\w*|polygon/gi, ' '), 4) ??
    ((ctx.polygons ?? []).length === 1 ? (ctx.polygons![0].map(up) as Id[]) : null);
  if (!poly || poly.length < 4) return null;
  const out: AnyCommand[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // wrap-adjacent, not a diagonal
      out.push({ type: 'segment', a: poly[i], b: poly[j] });
    }
  return out.length ? out : null;
};

/** "segment AC" / "diagonal AC" / "קטע AC" / "אלכסון AC" — connect two points. */
const segment: Rule = (s) => {
  if (!/segment|diagonal|connect|קטע|אלכסון|חבר/i.test(s)) return null;
  if (POINT_ON_CARRIER.test(s)) return null; // "E on segment AC" is a point ON the carrier — pointOnSegment owns it
  const ids = labelRun(s.replace(/segment|diagonal|connect|קטע|אלכסון|חבר/gi, ' '), 2);
  return ids ? [{ type: 'segment', a: ids[0], b: ids[1] }] : null;
};

/**
 * A bare two-label token — "AB", "ED", "O1O2" — or a "line"-prefixed pair — "line AB" / "ישר AB" /
 * "הישר AB" / "הקו AB" — is the student's shorthand for *draw the segment* through those two points
 * (the app draws segments, not infinite lines). The single biggest source of needless LLM escalation
 * (debug-log analysis 2026-06-18). Anchored to the WHOLE input (just the two labels, nothing else), so
 * it never shadows a keyword form: "AB = 6" (distance), "AB ⟂ CD" (perpendicular), "line ABE" (ordered
 * line, ≥3 labels), "line CE passes through A" (collinear) all still reach their own rules first. Runs
 * LATE (just before `freePoint`) as a catch-all, so anything with structure is claimed ahead of it.
 */
const bareSegment: Rule = (s) => {
  const m = s.trim().match(/^(?:line\s+|ישר\s+|הישר\s+|הקו\s+)?([A-Za-z]\d*)\s*([A-Za-z]\d*)$/);
  if (!m) return null;
  const a = up(m[1]), b = up(m[2]);
  if (a === b) return null; // "AA" is not a segment
  return [{ type: 'segment', a, b }];
};

/**
 * Line–line intersection, both phrasing directions:
 *   point-first — "E is the intersection of AC and BD" / "E = AC ∩ BD" / "E חיתוך AC ו-BD"
 *   lines-first — "AC and BD intersect at E" / "האלכסונים AC ו-BD נחתכים בנקודה E"
 *   cut-form    — "BD cuts OC at A" / "המשך BD חותך את המשך OC בנקודה A" (the verb sits BETWEEN the two
 *                 segments: seg1 CUTS seg2 at P). "extension"/"המשך" is irrelevant — two infinite lines
 *                 meet at one point whether or not it lies beyond the drawn segments.
 * (Hebrew needs both נחתך and נחתכ: the final-form ך differs from the כ that
 * inflected forms like נחתכים carry.) If an intersection keyword is present but
 * none of the patterns reads, the parse STOPS — otherwise the `segment` rule would
 * half-parse "the diagonals AC and BD intersect at E" into just "segment AC",
 * silently dropping the intersection point.
 */
const INTERSECT_KW = /intersect|∩|חיתוך|נחתך|נחתכ|נפגש|פוגש|פגש|חות[כך]|\bcuts?\b|\bmeets?\b/i; // incl. "חותך" (cuts), active "פוגש"/"פגש" (meets), "cuts"
const lineLineIntersection: Rule = (s) => {
  if (!INTERSECT_KW.test(s)) return null;
  // A DIAMETER or TANGENT operand is a construct this rule can't build (an antipode / a touch-point
  // geometry) — don't half-parse "diameter AB and chord DE meet at C" into a bare intersection that
  // drops it: escalate so the operand gets created (ADR-024; the LLM has the circle as context, and
  // the tangent/diameter compounds run earlier). A CHORD or RADIUS operand, by contrast, is just a
  // segment reference whose circle membership the `withCarrierMembership` post-pass restores (ADR-119)
  // — "המיתר CK חותך את הרדיוס AO בנקודה E" is a plain segment meet + memberships (issue #17), so those
  // nouns no longer abort the parse.
  if (/\bdiameter\b|\btangent\b|קוטר|משיק/i.test(s)) return 'stop';
  // A PERPENDICULAR/PARALLEL operand ("the perpendicular to AD") is NOT a line through two labelled
  // points — reading "האנך ל-AD" as "line AD" silently drops the ⟂ and (when AD shares an endpoint with
  // the other line) collapses the crossing onto that point (operator: "המשך DB והאנך לישר AD נפגשים ב-G"
  // built a degenerate G on D). Escalate so the perpendicular is built properly (it needs a through-point;
  // the LLM / the `perpendicular … cuts … at` form supplies it).
  if (/\bperpendicular\b|\bparallel\b|מאונ[כך]|אנ[כך]|מקביל|[⊥⟂∥]/i.test(s)) return 'stop';
  // Drop filler words so they aren't mistaken for two-letter line labels ("of"!).
  const t = s.replace(/\b(?:is|the|of|between|at|point|הוא|בין|בנקודה|נקודה)\b/gi, ' ');
  const pointFirst = t.match(
    /\b([A-Za-z]\d*)\b.*?(?:intersection|∩|חיתוך|נחתך).*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i,
  );
  // PER-OPERAND reference semantics (issue #22, the ADR-077 principle generalized): each pair operand is,
  // independently, a bare SEGMENT reference (crossing must land WITHIN it), a "המשך"/extension (directional
  // — the crossing lies BEYOND the 2nd letter, ADR-054), or a "הישר"/infinite line (unconstrained). The old
  // code computed extension/line words UTTERANCE-GLOBALLY, so "המשך FO חותך את AC בנקודה E" stripped the
  // on-segment default from the BARE operand AC too — E landed past C, silently green.
  const EXT_RE = /המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i;
  const LINE_RE = /\bline\b|הישר|הקו|\bray\b|קרן/i;
  const semOf = (span: string): 'bare' | 'ext' | 'line' =>
    EXT_RE.test(span) ? 'ext' : LINE_RE.test(span) ? 'line' : 'bare';
  // The text immediately BEFORE each operand pair (where its reference words live), located by walking the
  // matched pair texts in order. Falls back to whole-string spans when a pair can't be re-located.
  const operandSpans = (str: string, p1: [string, string], p2: [string, string], from = 0): [string, string] => {
    const find = (l: [string, string], start: number) => {
      const re = new RegExp(`\\b${l[0]}\\s*${l[1]}\\b`, 'g');
      re.lastIndex = start;
      const m = re.exec(str);
      return m ? { start: m.index, end: m.index + m[0].length } : null;
    };
    const f1 = find(p1, from);
    const f2 = f1 ? find(p2, f1.end) : null;
    if (!f1 || !f2) return [str, str];
    return [str.slice(from, f1.start), str.slice(f1.end, f2.start)];
  };
  // Draw the two operands (idempotent if they're already edges) — the student should see the lines whose
  // crossing is the point, not just the point. A bare/infinite-line operand draws WHOLE (a diagonal crossing
  // between its endpoints must not be cut at the crossing); an extension operand draws base → the meeting
  // point, so the student sees the line reaching it (the operator drew BG/CG by hand otherwise). Order
  // matters: a segment to the point before it exists would create it as a stray free point and conflict
  // with the intersection ("'G' is already defined") — so extension segments come AFTER the intersection.
  const cross = (id: string, a: string, b: string, c: string, d: string, sem1: 'bare' | 'ext' | 'line' = 'bare', sem2: 'bare' | 'ext' | 'line' = 'bare'): Command[] => {
    // Both bare = the joint ADR-166 `onSeg` (sampled requirement + apex reflection — whether two whole
    // segments cross at all is discrete). A single bare operand = per-operand `onSeg1`/`onSeg2`, driven
    // continuously by a collinear-order in the engine (issue #22).
    const bothBare = sem1 === 'bare' && sem2 === 'bare';
    const inter: Command = {
      type: 'line-line-intersection', id: up(id), a: up(a), b: up(b), c: up(c), d: up(d),
      ...(sem1 === 'ext' ? { dir1: true } : {}), ...(sem2 === 'ext' ? { dir2: true } : {}),
      ...(bothBare ? { onSeg: true } : {}),
      ...(!bothBare && sem1 === 'bare' ? { onSeg1: true } : {}),
      ...(!bothBare && sem2 === 'bare' ? { onSeg2: true } : {}),
    };
    const pre: Command[] = [];
    const post: Command[] = [];
    if (sem1 === 'ext') post.push({ type: 'segment', a: up(a), b: up(id) });
    else pre.push({ type: 'segment', a: up(a), b: up(b) });
    if (sem2 === 'ext') post.push({ type: 'segment', a: up(c), b: up(id) });
    else pre.push({ type: 'segment', a: up(c), b: up(d) });
    return [...pre, inter, ...post];
  };
  // In the CONJUNCTION forms ("המשך BE ו-AD נפגשים ב-F", "the extensions of AC and BD meet at E") a
  // reference word before the FIRST operand governs the whole conjoined pair (Hebrew construct state:
  // "המשך X ו-Y" = the extensions of X and of Y) — so it DISTRIBUTES to an unmarked second operand.
  // The CUT form keeps strict per-side attribution: its operands play different roles (subject cuts
  // object), so "המשך FO חותך את AC" extends only FO and AC stays the bare segment (issue #22).
  const distribute = (s1: 'bare' | 'ext' | 'line', s2: 'bare' | 'ext' | 'line') =>
    s2 === 'bare' ? s1 : s2;
  if (pointFirst) {
    const m = pointFirst;
    const kw = t.match(/intersection|∩|חיתוך|נחתך/i);
    const from = kw ? (kw.index ?? 0) + kw[0].length : 0;
    const [s1, s2] = operandSpans(t, [m[2], m[3]], [m[4], m[5]], from);
    const sem1 = semOf(s1);
    return cross(m[1], m[2], m[3], m[4], m[5], sem1, distribute(sem1, semOf(s2)));
  }
  const linesFirst = t.match(
    /\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?(?:intersect\w*|∩|חיתוך|נחתך|נחתכ|נפגש|meets?).*?\b([A-Za-z]\d*)\b/i,
  );
  if (linesFirst) {
    const m = linesFirst;
    const [s1, s2] = operandSpans(t, [m[1], m[2]], [m[3], m[4]]);
    const sem1 = semOf(s1);
    return cross(m[5], m[1], m[2], m[3], m[4], sem1, distribute(sem1, semOf(s2)));
  }
  // cut-form: seg1, the CUT verb, seg2, then the point — "BD חותך את OC בנקודה A" / "BD cuts OC at A".
  // (The verb between the segments is what the lines-first form, which needs it AFTER both, misses.)
  const cutForm = t.match(
    /\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?(?:חות[כך]|נחתכ?\w*|נפגש\w*|פוגש\w*|cuts?|crosses?|intersects?|meets?).*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\b/i,
  );
  if (cutForm) {
    const m = cutForm;
    // Reference words attribute per operand by which side of the cut verb they fall on (seg1 before,
    // seg2 after — ADR-054's split, now carrying bare/extension/line, not just the direction).
    const kw = s.match(/חות[כך]|נחתכ?\w*|נפגש\w*|פוגש\w*|cuts?|crosses?|intersects?|meets?/i);
    const before = kw ? s.slice(0, kw.index) : s;
    const after = kw ? s.slice((kw.index ?? 0) + kw[0].length) : '';
    return cross(m[5], m[1], m[2], m[3], m[4], semOf(before), semOf(after));
  }
  return 'stop';
};

/**
 * "the diameter of the circle from F cuts AC at E" /
 * "קוטר המעגל היוצא מנקודה F חותך את AC בנקודה E" — the diameter through an ON-CIRCLE point F
 * (the line F–O through the centre) meeting a side XY at a new point E. E is the crossing of line
 * F–O with line XY; and — because in a figure a bare "AC" (like "the side AC") is the SEGMENT/edge —
 * E is constrained to lie BETWEEN X and Y by DEFAULT (`set-line [X,E,Y]`, a soft order constraint):
 * when the current drawing would put the crossing on the segment's extension, the figure FLEXES a
 * free DOF (the triangle reshapes, F moving with it) to bring E onto the side, rather than silently
 * dropping E off it (ADR-077). Two opt-outs carried by the operand wording: "המשך AC" / "the
 * EXTENSION of AC" puts E BEYOND the segment (order [X,Y,E] via dir2), and "הישר AC" / "the LINE AC"
 * (the infinite line) leaves E free anywhere along it. Draws the diameter chord F–E. Must run BEFORE
 * `lineLineIntersection` (which `stop`s on "קוטר") and `diameter` (which would misread the extra
 * labels as the diameter's two endpoints).
 */
const diameterCutsSegment: Rule = (s, ctx) => {
  if (!/diameter|קוטר/i.test(s)) return null;
  if (!INTERSECT_KW.test(s)) return null; // a "diameter … cuts …", not a bare "diameter AB"
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  // F = the on-circle point the diameter goes FROM ("from F" / "מנקודה F" / "היוצא מ-F")
  const fromM = s.match(/(?:from(?:\s+(?:the\s+)?point)?|מ-?נקודה|מהנקודה|היוצא\s+מ-?)\s*([A-Za-z]\d*)/i);
  if (!fromM) return null;
  const F = up(fromM[1]);
  // Everything AFTER the cut verb names the target side XY and the result point E.
  const kw = s.match(INTERSECT_KW);
  const after = kw ? s.slice((kw.index ?? 0) + kw[0].length) : '';
  const seg = labelRun(after.replace(/את|\bthe\b|\bside\b|הצלע|הקטע|\bline\b|הישר|הקו|בנקודה|\bat\b/gi, ' '), 2);
  const atM = after.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i);
  if (!seg || !atM) return null;
  const [X, Y] = seg;
  const E = up(atM[1]);
  if (new Set([F, X, Y, E, up(center)]).size < 5) return null; // F, X, Y, E, O all distinct
  // A bare "AC" (like "the side AC") is the SEGMENT between X and Y — keep E ON it by default (operator
  // principle, 2026-06-21). Two opt-outs: "המשך AC" / "the EXTENSION of AC" puts E BEYOND the segment
  // (order [X,Y,E] via dir2), and "הישר AC" / "the LINE AC" leaves E free anywhere on the infinite line.
  const isExtension = /המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i.test(after);
  const isLine = /\bline\b|הישר|הקו/i.test(after);
  const out: AnyCommand[] = [
    { type: 'line-line-intersection', id: E, a: F, b: up(center), c: X, d: Y, dir1: true, ...(isExtension ? { dir2: true } : {}) },
  ];
  if (!isExtension && !isLine) out.push({ type: 'set-line', points: [X, E, Y] }); // default: E between X and Y (on the segment)
  out.push({ type: 'segment', a: F, b: E }); // draw the diameter chord
  return out;
};

/** "right triangle ABC" / "משולש ישר-זווית ABC" — right angle at the last named vertex. */
const rightTriangle: Rule = (s) => {
  if (!/right[\s-]?(?:angled\s+)?triangle|ישר[\s-]?זוו?ית/i.test(s)) return null;
  const cleaned = s.replace(/right[\s-]?angled|right[\s-]?angle|right|triangle|משולש|ישר[\s-]?זוו?ית|זוו?ית|ישרה/gi, ' ');
  const ids = labelRun(cleaned, 3);
  if (!ids) return null;
  if (SHAPE_LEFTOVER.test(cleaned)) return 'stop'; // a modifier remains — escalate, don't half-parse
  return [{ type: 'right-triangle', ids: [ids[0], ids[1], ids[2]] }];
};

const BISECTOR_KW = /bisector|חוצ/i; // English "bisector"; Hebrew חוצה / חוצי

/**
 * "E is the intersection of the bisectors of angle BAC and angle BCA" /
 * "E חיתוך חוצי הזוויות BAC ו-BCA" — the meet of two angle bisectors. Builds two
 * bisector lines (each vertex is the triple's middle letter) and the point where
 * they cross. The bisector lines are scaffolding — only the point is named/drawn.
 */
const bisectorIntersection: Rule = (s, ctx) => {
  if (!BISECTOR_KW.test(s)) return null;
  const meet = INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s);
  if (!meet) return null;
  // #71 (log-triage): the VERTEX form — "חוצה זוית C וחוצה זוית B נפגשים בנקודה O" / "the
  // bisectors of angle C and angle B meet at O". Each single-letter vertex resolves its angle
  // from the figure (the ADR-164/261 single-vertex pattern): exactly 2 edges → the one possible
  // angle; anything else → the ambiguous-angle clarification ("name all three letters").
  const vform =
    s.match(
      /^חוצ[הת]\s+זוו?ית\s+([A-Za-z])\s+ו-?חוצ[הת]\s+זוו?ית\s+([A-Za-z])\s+נפגש(?:ים|ות)\s+בנקודה\s+([A-Za-z]\d*)\s*\.?\s*$/,
    ) ??
    s.match(
      /^the\s+bisectors?\s+of\s+angles?\s+([A-Za-z])\s+and\s+(?:of\s+)?(?:angle\s+)?([A-Za-z])\s+meet\s+at\s+(?:point\s+)?([A-Za-z]\d*)\s*\.?\s*$/i,
    );
  if (vform) {
    const triples: string[] = [];
    for (const raw of [vform[1], vform[2]]) {
      const v = up(raw);
      const nb = (ctx.neighbors ?? {})[v] ?? [];
      if (nb.length !== 2) return { clarify: 'ambiguous-angle', vertex: v };
      triples.push(`${nb[0]}${v}${nb[1]}`);
    }
    const [t1, t2] = triples;
    return [
      { type: 'bisector', id: `bis-${t1}`, vertex: t1[1], p: t1[0], q: t1[2] },
      { type: 'bisector', id: `bis-${t2}`, vertex: t2[1], p: t2[0], q: t2[2] },
      { type: 'line-intersection', id: up(vform[3]), line1: `bis-${t1}`, line2: `bis-${t2}` },
    ];
  }
  // Strip every keyword word so only the point label + the two angle triples remain.
  const kw =
    /bisectors?|angles?|intersection|intersect\w*|meets?|points?|of|the|is|are|and|זוו?ית|הזוו?יות|חוצי|חוצה|חוצ|חיתוך|נחתכים|נקודת|המפגש|מפגש|נפגשים|של|הם|בנקודה/gi;
  const labels = s.replace(kw, ' ').replace(/-/g, ' ').match(/\b[A-Za-z]{1,3}\b/g) ?? [];
  const point = labels.find((l) => l.length === 1);
  const triples = labels.filter((l) => l.length === 3).map((l) => l.toUpperCase());
  if (!point || triples.length < 2) return null;
  const [t1, t2] = triples;
  return [
    { type: 'bisector', id: `bis-${t1}`, vertex: t1[1], p: t1[0], q: t1[2] },
    { type: 'bisector', id: `bis-${t2}`, vertex: t2[1], p: t2[0], q: t2[2] },
    { type: 'line-intersection', id: up(point), line1: `bis-${t1}`, line2: `bis-${t2}` },
  ];
};

/** "F is the foot of the perpendicular from C to AD" / "F רגל האנך מ-C ל-AD". */
const foot: Rule = (s) => {
  if (!/\bfoot\b|רגל/i.test(s)) return null;
  const en = s.match(
    new RegExp(String.raw`([A-Za-z]\d*)\b.*?\bfoot\b.*?from\s+([A-Za-z]\d*)\b.*?to\s+([A-Za-z]\d*)\s*([A-Za-z]\d*)\b`, 'i'),
  );
  const he = s.match(
    new RegExp(String.raw`([A-Za-z]\d*)\b.*?רגל.*?(?:מהנקודה\s*|מ-?\s*)([A-Za-z]\d*)\b.*?(?:אל\s*|ל-?\s*)([A-Za-z]\d*)\s*([A-Za-z]\d*)\b`),
  );
  const m = en ?? he;
  return m ? [{ type: 'foot', id: up(m[1]), from: up(m[2]), a: up(m[3]), b: up(m[4]) }] : null;
};

/** "M is the midpoint of AB" / "M אמצע AB" / "C is the midpoint of OB". */
const midpoint: Rule = (s, ctx) => {
  if (!/midpoint|אמצע/i.test(s)) return null;
  // Leading \b so "point M is the midpoint …" reads M, not the "t" of "poin**t**".
  const m = s.match(/\b([A-Za-z]\d*)\b.*?(?:midpoint|אמצע)\s*(.*)/i);
  if (!m) return null;
  // strip filler ("of"!) and segment/radius words so they aren't read as labels.
  const rest = m[2].replace(FILLER, ' ').replace(/radius|רדיוס\S*|segment|קטע/gi, ' ');
  const seg = labelRun(rest, 2);
  if (!seg) return null;
  // "B is the midpoint of segment AC" implies the segment AC. If an endpoint is NEW, draw the segment first
  // (idempotent; it also CREATES the endpoints, which `midpoint` needs — else "unresolved dependencies"
  // when A,C don't exist yet, ADR-091). When both already exist, emit just the midpoint (no extra segment).
  const have = new Set(ctx.points ?? []);
  const out: AnyCommand[] = [];
  if (!have.has(seg[0]) || !have.has(seg[1])) out.push({ type: 'segment', a: seg[0], b: seg[1] });
  out.push({ type: 'midpoint', id: up(m[1]), a: seg[0], b: seg[1] });
  return out;
};

/** "F on the extension of AD" / "F על המש(?:ך|כי(?:ם|הם|הן)?) AD" — a point on the ray beyond the far end (t > 1). */
const pointOnExtension: Rule = (s, ctx) => {
  if (!/extension|המש(?:ך|כי(?:ם|הם|הן)?)/i.test(s)) return null;
  const m = s.match(/(?:point\s+|נקודה\s+)?([A-Za-z]\d*)\b.*?(?:extension|המש(?:ך|כי(?:ם|הם|הן)?))\s*(.*)/i);
  if (!m) return null;
  // strip filler ("of"!) so "of AD" reads AD, not the labels O,F of "of".
  const seg = labelRun(m[2].replace(FILLER, ' '), 2);
  if (!seg) return null;
  const id = up(m[1]);
  // "C on the extension of DA" beyond A → order D→A→C. If C ALREADY EXISTS (e.g. an inscribed vertex still
  // on the circle), creating it afresh as an off-object on-segment point would keep it pinned to its prior
  // carrier and the apply path picks the WRONG (near) intersection, losing the order. Emit an ORDERED
  // collinearity instead: the existing point is DRIVEN, on whatever carrier it already has, to sit beyond
  // the far end IN ORDER (seg[0]→seg[1]→id) — so an on-circle C becomes the FAR secant point, not the near
  // one, and C stays on the circle (ADR-086). A genuinely NEW point is still created on the extension.
  // Either branch DRAWS the stated continuation (ADR-250, honesty §6): the base a–b plus the leg b→id,
  // so "D on the extension of BC" shows B—C—D (the new-point branch's leg is added by the
  // `withCarrierSegments` post-pass; the set-line branch names existing points, so draw both here).
  if ((ctx.points ?? []).includes(id))
    return [
      { type: 'segment', a: seg[0], b: seg[1] },
      { type: 'segment', a: seg[1], b: id },
      { type: 'set-line', points: [seg[0], seg[1], id] },
    ];
  return [{ type: 'point-on-segment', id, a: seg[0], b: seg[1], t: 1.3, extension: true }];
};

/**
 * "angle GAB = 37" / "∠GAB = 37°" / "זווית GAB = 37" (any order) — middle letter is the vertex.
 * Stating the angle also DRAWS its two arms (vertex→ray1, vertex→ray2) so the angle is visible
 * even on a standalone configuration; `segment` is idempotent, so on an existing corner where the
 * arms are already edges these are no-ops (mirrors the ∥/⟂ draw-its-segments convenience, FR-IN-7).
 */
/**
 * #106: a CENTRAL angle — the angle at a circle's CENTRE subtending two on-circle points (or an arc).
 *  - "זוית מרכזית COD" / "central angle COD" — O (the MIDDLE letter) is the centre, arms OC, OD.
 *  - "זוית מרכזית נשענת על קשת CD" / "…נשענת על CD" / "central angle subtending arc CD" — the SUBTENDS verb
 *    (`נשענת`/`subtend`/`rests on`) or the `קשת`/`arc` noun signals the two endpoints (the `קשת` word is
 *    optional after the verb); the centre is resolved from the circle they ride (ADR-029 implicit circle).
 * A VALUE ("= 80" / "היא 80" / "is 80") makes it an angle GIVEN (`set-angle` — drives a free-DOF figure via
 * the ADR-116 arc↔central-angle identity, checks a determined one); valueless is a highlightable stated-angle
 * MARK (`mark-angle`, FR-RN-7 style — no value asserted). Either way the two radii are drawn, so the centre
 * becomes a used point and shows (FR-RN-8). Runs before every generic angle rule (its `מרכזית`/`central`
 * keyword is specific). The arc-subtended form defers when the circle can't be resolved (→ LLM), never guesses.
 */
const centralAngle: Rule = (s, ctx) => {
  if (!/מרכזית|central\s+angle/i.test(s)) return null;
  const valM = s.match(new RegExp(String.raw`(?:=|היא|הוא|is)\s*${num}\s*°?`, 'i'));
  const value = valM ? parseFloat(valM[1]) : undefined;
  const body = s.replace(new RegExp(String.raw`(?:=|היא|הוא|is)\s*${num}\s*°?`, 'i'), ' ');
  let centre: string | null;
  let a: string;
  let b: string;
  // The arc-subtended form: the `קשת`/`arc`/glyph noun OR the SUBTENDS verb (`נשענת`/`subtend`/`rests on`)
  // signals that the two named points are the ARC ENDPOINTS (the `קשת` word after the verb is optional —
  // "…נשענת על CB"). With a signal present the endpoints are the trailing letter PAIR (a central-angle
  // utterance names exactly those two labels). The centre is then resolved from the circle they ride.
  const arcSignal = /קשת|\barc\b|⌢|⏜|נשע|subtend|rest\w*\s+on/i.test(body);
  const arcM = arcSignal ? body.match(/([A-Z]\d*)\s*([A-Z]\d*)\s*$/) : null;
  if (arcM) {
    a = up(arcM[1]);
    b = up(arcM[2]);
    centre = circleContaining(ctx, [a, b]);
    if (!centre) return null; // can't resolve the circle → defer honestly (never guess a centre)
  } else {
    // three-letter form "COD": the MIDDLE letter is the centre
    const cleaned = body.replace(/מרכזית|central|angle|∠|זוו?ית|נשענת|subtend\w*|על|the/gi, ' ');
    const ids = labelRun(cleaned, 3);
    if (!ids) return null;
    [a, centre, b] = ids;
  }
  const arms: Command[] = [
    { type: 'segment', a: centre, b: a },
    { type: 'segment', a: centre, b: b },
  ];
  return value !== undefined
    ? [...arms, { type: 'set-angle', vertex: centre, ray1: a, ray2: b, value }]
    : [...arms, { type: 'mark-angle', vertex: centre, ray1: a, ray2: b }];
};

const angle: Rule = (s, ctx) => {
  if (!/(?:angle|∠|זוו?ית)/i.test(s)) return null;
  // The right-angle WORD form (#45 / ADR-299): "זוית B ישרה" / "זוית ABC ישרה" / "angle ABC is a right
  // angle" ≡ "= 90". Detected on the raw utterance; the "right angle" phrase is NOT a second angle
  // reference (the multi-angle guard below counts on a copy with the phrase removed).
  const rightWord = /ישרה|right[\s-]?angle/i.test(s);
  // TWO+ angle REFERENCES in one line ("זווית ABC = 40, זווית DEF = 60") is a multi-angle GIVENS list —
  // the `multiStatement` splitter owns it. If it reaches here unsplit, bail rather than silently claim
  // only the first triple (PAR-2, defence in depth); the whole then escalates instead of half-parsing.
  // Count REFERENCES, not raw keyword tokens: the word immediately followed by the glyph ("זווית ∠ABC",
  // a student typing the word then pressing the ∠ toolbar button) is ONE angle — counting it as two
  // regressed that form to an LLM escalation (review 2026-07-03, P2).
  if (((s.replace(/right[\s-]?angle/gi, ' ').match(/(?:angle|זוו?ית)(?:\s*∠)?|∠/gi) ?? []).length) > 1) return null;
  const stripped = s.replace(/angle|∠|זוו?ית|ישרה|right/gi, ' ');
  const valM = stripped.match(new RegExp(num));
  if (!valM && !rightWord) return null; // no degree value AND not a right-angle word → not this rule
  const value = valM ? parseFloat(valM[1]) : 90;
  const ids = labelRun(stripped, 3);
  if (ids) {
    const [r1, v, r2] = ids;
    return [
      { type: 'segment', a: v, b: r1 },
      { type: 'segment', a: v, b: r2 },
      { type: 'set-angle', vertex: v, ray1: r1, ray2: r2, value },
    ];
  }
  // SINGLE-vertex form — "∠B = 90" / "זווית B = 90". Only well-defined when the named vertex has EXACTLY two
  // edges in the figure (one possible angle): resolve its arms from `ctx.neighbors`. With a different number
  // of edges (more = several angles to choose between; fewer = no arms to use) the intended angle is
  // ambiguous, so ASK the student to name all three letters rather than guessing or escalating to the LLM.
  // Gated to a CLEAN single-label utterance (exactly one label besides the value) so compounds fall through.
  const one = labelRun(stripped, 1); // labelRun already uppercases a lone lowercase label (`d` → `D`)
  const upperCount = (stripped.match(/[A-Z]\d*/g) ?? []).length;
  // A LOWERCASE vertex (#45 / ADR-299): "נתון זווית d=90" — a student typed a lowercase point label.
  // `labelRun` resolves it, but the compound-guard count was UPPERCASE-only and so read zero labels and
  // bailed. Count a LONE lowercase Latin letter too — but only when there is NO uppercase label (so a
  // lowercase FILLER word's letters, e.g. "is a", are never counted: those cases always have uppercase
  // vertices and take the count-3 path). So a bare lowercase vertex reads as exactly one label.
  const lowerLoners = upperCount === 0 ? (stripped.match(/(?<![A-Za-z])[a-z](?![A-Za-z])/g) ?? []).length : 0;
  const labelCount = upperCount + lowerLoners;
  if (!one || labelCount !== 1) return null;
  const v = one[0];
  const nb = (ctx.neighbors ?? {})[v] ?? [];
  if (nb.length === 2) {
    return [
      { type: 'segment', a: v, b: nb[0] },
      { type: 'segment', a: v, b: nb[1] },
      { type: 'set-angle', vertex: v, ray1: nb[0], ray2: nb[1], value },
    ];
  }
  return { clarify: 'ambiguous-angle', vertex: v };
};

/**
 * "∠ABC קהה" / "זווית C חדה" / "angle ABC is obtuse" — an angle's ACUTENESS: obtuse (>90°, "קהה") or acute
 * (<90°, "חדה"). Names the angle by its three letters (vertex = middle) OR by a SINGLE vertex ("∠C"), whose
 * two arms are resolved from the figure (the points C is joined to). Emits a one-sided angle constraint that
 * reshapes the figure so the angle falls on the requested side (ADR-108). Draws the arms (idempotent).
 */
const angleAcuteness: Rule = (s, ctx) => {
  const obtuse = /קהה|obtuse/i.test(s);
  const acute = /חדה|acute/i.test(s);
  if (obtuse === acute) return null; // need exactly one of obtuse/acute (and not both)
  const stripped = s.replace(/angle|∠|∢|זוו?ית|הזוו?ית|קהה|obtuse|חדה|acute|is|the|של|את/gi, ' ');
  const tri = labelRun(stripped, 3);
  if (tri) {
    return [
      { type: 'segment', a: tri[1], b: tri[0] },
      { type: 'segment', a: tri[1], b: tri[2] },
      { type: 'set-angle-acuteness', vertex: tri[1], ray1: tri[0], ray2: tri[2], obtuse },
    ];
  }
  const one = labelRun(stripped, 1);
  if (one) {
    const nb = (ctx.neighbors ?? {})[one[0]] ?? [];
    if (nb.length === 2) return [{ type: 'set-angle-acuteness', vertex: one[0], ray1: nb[0], ray2: nb[1], obtuse }];
  }
  return null;
};

/**
 * "∠ABC = ∠DEF" / "angle ABC = angle DEF" / "זווית ABC = זווית DEF" — an angle EQUALITY between two
 * named angles (the middle letter is the vertex), with an optional coefficient on the right ("∠ABC =
 * 2∠DEF"). Emits the engine's angle-ratio constraint ∠1 = k·∠2 (k defaults to 1) — the same relation
 * `similarity` uses — so on an under-determined figure it drives a free DOF until the angles match, and
 * on a determined one it's a check (the givens verifier flags it if it can't hold). Both arms of each
 * angle are drawn (idempotent) so the stated angles are visible. A single angle with a numeric or
 * symbolic VALUE is handled by `angle` / `measureAngle`; this fires only when BOTH sides are angles.
 */
const angleEquality: Rule = (s) => {
  if (!/(?:angle|∠|∢|זוו?ית)/i.test(s)) return null;
  const parts = s.split('=');
  if (parts.length !== 2) return null; // a single '=' (a chain "∠1=∠2=∠3" is handled by chainedEquality)
  const strip = (p: string) => p.replace(/angle|∠|∢|זוו?ית/gi, ' ');
  const left = labelRun(strip(parts[0]), 3);
  const right = labelRun(strip(parts[1]), 3); // null for a numeric/symbolic RHS ("= 37°", "= 2α") → defer to angle/measureAngle
  if (!left || !right) return null;
  const coefM = parts[1].match(new RegExp(String.raw`(${COEF})\s*[*·]?\s*(?:angle|∠|∢|זוו?ית)`, 'i')); // "= 2∠DEF"
  const k = coefM ? parseFloat(coefM[1]) : 1;
  const [a1, v1, b1] = left;
  const [a2, v2, b2] = right;
  return [
    { type: 'segment', a: v1, b: a1 },
    { type: 'segment', a: v1, b: b1 },
    { type: 'segment', a: v2, b: a2 },
    { type: 'segment', a: v2, b: b2 },
    { type: 'set-angle-ratio', v1, a1, b1, v2, a2, b2, k },
  ];
};

/**
 * "⌢DE = 2⌢CE" / "arc DE = 2 arc CE" / "קשת DE = 2 קשת CE" — an ARC-measure equality/ratio on a circle
 * ([ADR-116](docs/06-decisions.md#adr-116)). An arc's measure equals its CENTRAL angle, so arc XY on the
 * circle centred at O ≡ ∠XOY; the relation becomes the engine's angle-ratio on the two central angles (the
 * same `set-angle-ratio` as `angleEquality`, ADR-100). On an under-determined figure it drives a free
 * on-circle DOF until the arcs hold; on a determined one the givens verifier checks it. The circle is
 * resolved implicitly (ADR-029): the named circle, or THE one circle in the figure. No radii are drawn — the
 * arc lives on the circle boundary, not as central radii (matches the textbook figure). The arc endpoints are
 * assumed on that circle (true in the corpus). Runs before `angleEquality` (its own `arc`/`קשת` keyword).
 */
const arcEquality: Rule = (s, ctx) => {
  if (!/arc|קשת|⌢/i.test(s)) return null;
  if (/midpoint|אמצע/i.test(s)) return null; // "midpoint of arc …" → arcMidpoint, not a measure relation
  const parts = s.split('=');
  if (parts.length !== 2) return null; // a single '=' relation
  const center = resolveCenter(s, ctx);
  if (!center) return null; // need the circle's centre to form the central angle
  const O = up(center);
  const strip = (p: string) => dropCircleRef(p).replace(/arcs?|הקשת|קשת|⌢|⏜|\bin\b|\bof\b|ב-?/gi, ' ');
  const left = labelRun(strip(parts[0]), 2);
  const right = labelRun(strip(parts[1]), 2);
  if (!left || !right) return null;
  const coefM = parts[1].match(new RegExp(String.raw`(${COEF})\s*[*·]?\s*(?:arcs?|קשת|⌢)`, 'i')); // "= 2 arc CE"
  const k = coefM ? parseFloat(coefM[1]) : 1;
  return [{ type: 'set-angle-ratio', v1: O, a1: left[0], b1: left[1], v2: O, a2: right[0], b2: right[1], k }];
};

/**
 * The descriptor nouns that can NAME the carrier a point rides on — chord/side/segment/diagonal, and
 * (PAR-5) a circle's diameter/radius, in both languages. A point ON a diameter/radius is a point on the
 * chord/centre→rim SEGMENT (the diameter IS segment AB; the radius IS segment OB), so the point-on rules
 * own them once the noun is recognised. A "line"/"ישר" carrier is deliberately absent: it has distinct
 * infinite-line semantics handled by `collinearConstraint`.
 */
const CARRIER_NOUN = String.raw`chords?|sides?|segments?|diagonals?|diameters?|radius|ה?מיתר(?:ים)?|ה?צלע(?:ות)?|ה?קטע(?:ים)?|ה?אלכסו(?:ן|נים)|ה?קוטר(?:ים)?|ה?רדיוס`;

/**
 * An OPTIONAL carrier noun between "on"/"על" and the two endpoint labels — "E on chord AC" /
 * "E על מיתר AC" / "E על הצלע AC". Without it a Hebrew noun like מיתר wedged between "על" and "AC"
 * makes the point-on rules miss.
 */
const SEG_NOUN = String.raw`(?:(?:the\s+)?(?:${CARRIER_NOUN})\s+)?`;

/**
 * True when the utterance is "<point> on <carrier> AB" — a point ON a named carrier, which must be
 * claimed by the point-on rules, NOT by the carrier-DEFINING rules (`segment`/`chord`). Those strip
 * their own keyword and grab the bare "AB" run, silently dropping the named rider point.
 */
const POINT_ON_CARRIER = new RegExp(
  String.raw`[A-Za-z]\d*\s+(?:(?:נקודה|נמצא[הת])\s+)?(?:on|על)\s+(?:the\s+)?(?:${CARRIER_NOUN})\s`,
  'i',
);

/**
 * "point G on AD" / "נקודה G על AD" with optional ratio "at 40%" / "ב-40%".
 * The segment labels are word-bounded so "F on the extension of AD" can't read
 * "th" of "the" as a segment — that phrasing escapes to the fallback instead.
 */
const pointOnSegment: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:point\s+|נקודה\s+)?([A-Za-z]\d*)\s+(?:(?:נקודה|נמצא[הת])\s+)?(?:on|על)\s+${SEG_NOUN}([A-Za-z]\d*)\s*([A-Za-z]\d*)\b(?:\s+(?:at|ב-?)?\s*${num}\s*(%)?)?`,
      'i',
    ),
  );
  if (m) {
    const id = up(m[1]), a = up(m[2]), b = up(m[3]);
    if (m[4] === undefined) return [{ type: 'point-on-segment', id, a, b }];
    const raw = parseFloat(m[4]);
    const t = m[5] ? raw / 100 : raw; // "%" → fraction; bare number is taken as a fraction
    return [{ type: 'point-on-segment', id, a, b, t }];
  }
  // "E בין A ל-B" / "E בין A ו-B" / "E between A and B" — the BETWEEN phrasing for a free point on segment
  // AB (issue #95: it is exactly "E על AB"). `בין`/`between` are load-bearing elsewhere (ratio `היחס בין`,
  // angle `הזווית בין`, swap `החלף בין`, area-ratio) — but those lead with a Hebrew word, so anchoring the
  // SUBJECT to a Latin label at the START already excludes them; a keyword bow-out guards the rest.
  const bw = s.match(
    new RegExp(String.raw`^\s*(?:point\s+|נקודה\s+)?([A-Za-z]\d*)\s+(?:is\s+)?(?:בין|between)\s+([A-Za-z]\d*)\s+(?:and|ל-?|ו-?)\s*([A-Za-z]\d*)\b`, 'i'),
  );
  if (bw && !/יחס|ratio|זוו?ית|\bangle\b|החלף|\bswap\b|שטח|\barea\b/i.test(s))
    return [{ type: 'point-on-segment', id: up(bw[1]), a: up(bw[2]), b: up(bw[3]) }];
  return null;
};

/**
 * TWO points on one segment in a single utterance — "L and K are points on AC" / "L ו-K נקודות על AC"
 * / "L ו-K על AC". Each is a free point on the segment (no stated ratio); the engine seeds them at
 * DISTINCT spots so they don't collide ("would be at the same point"). Runs before the single
 * `pointOnSegment` (which would grab just one label and drop the other) — but defers circle phrasings
 * ("A and B on circle O") to the circle rules.
 */
const pointsOnSegment: Rule = (s) => {
  if (/circle|מעגל/i.test(s)) return null; // "A and B on circle O" is two points on a CIRCLE — not here
  // NB: `\w` is ASCII-only in JS, so the Hebrew "points" word uses an explicit Hebrew-letter class
  // (else "נקודות" only partly matches and the rule misses).
  const m = s.match(
    new RegExp(
      String.raw`\b([A-Za-z]\d*)\s*(?:,|and|ו-?)\s*([A-Za-z]\d*)\b\s*(?:are\s+)?(?:points?|נקוד[א-ת]*)?\s*(?:on|על)\s+${SEG_NOUN}([A-Za-z]\d*)\s*([A-Za-z]\d*)\b`,
      'i',
    ),
  );
  if (!m) return null;
  const [p1, p2, a, b] = [up(m[1]), up(m[2]), up(m[3]), up(m[4])];
  if (new Set([p1, p2, a, b]).size !== 4) return null; // four distinct labels (two points, two endpoints)
  return [
    { type: 'point-on-segment', id: p1, a, b },
    { type: 'point-on-segment', id: p2, a, b },
  ];
};

/**
 * A LIST of points placed PAIRWISE on a LIST of segments in one utterance —
 * "points F, G, H are on the sides AB, AC, CB" / "נקודות F, G, H נמצאות על הצלעות/הישרים AB, AC, CB"
 * → F on AB, G on AC, H on CB. The N point labels before "on"/"על" map one-to-one to the N
 * two-letter segments after it, so the right side carries exactly 2·N point labels (chunked into
 * pairs). Each point is free on its side; a triangle's "side"/"line" AB is the segment through A,B,
 * so both "הצלעות" (sides) and "הישרים" (lines) read as point-on-segment. Runs before
 * `pointsOnSegment` (TWO points on ONE segment) and the singular `pointOnSegment`; defers circle
 * phrasings. Labels are taken UPPERCASE-only so lowercase words ("points", "on", "sides", "lines")
 * aren't read as labels (the geometry convention; mirrors `tangentFromExternal`). Without this the
 * figure-defining "mark F,G,H on the three sides" step must escalate to the LLM, which is unreliable
 * for it (it built nothing on the "הישרים" wording — operator session svjp9x5e).
 */
const pointsOnSegments: Rule = (s) => {
  if (/circle|מעגל/i.test(s)) return null; // points on a CIRCLE → the circle rules
  const m = s.match(/^(.*?)(?:\bon\b|על)\s+(.*)$/i);
  if (!m) return null;
  const pts = (m[1].match(/[A-Z]\d*/g) ?? []).map(up); // point labels before "on"
  const segLabels = (m[2].match(/[A-Z]\d*/g) ?? []).map(up); // segment endpoint labels after it
  if (pts.length < 2 || segLabels.length !== 2 * pts.length) return null; // N points ↔ N two-letter segments
  if (new Set(pts).size !== pts.length) return null; // the points are distinct
  const out: AnyCommand[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = segLabels[2 * i];
    const b = segLabels[2 * i + 1];
    if (a === b) return null; // a segment's two endpoints must differ
    out.push({ type: 'point-on-segment', id: pts[i], a, b });
  }
  return out;
};

/** "C is 5 from A and 5 from B" / "C במרחק 5 מ-A ו-5 מ-B" */
const pointByDistances: Rule = (s) => {
  const en = s.match(
    new RegExp(
      String.raw`(?:point\s+)?([A-Za-z]\d*)\s+(?:is\s+)?${num}\s+from\s+([A-Za-z]\d*)\s+and\s+${num}\s+from\s+([A-Za-z]\d*)`,
      'i',
    ),
  );
  const he = s.match(
    new RegExp(
      String.raw`(?:נקודה\s+)?([A-Za-z]\d*)\s+במרחק\s+${num}\s+מ-?\s*([A-Za-z]\d*)\s+ו-?\s*${num}\s+מ-?\s*([A-Za-z]\d*)`,
    ),
  );
  const m = en ?? he;
  if (!m) return null;
  return [
    {
      type: 'point-by-distances',
      id: up(m[1]),
      from1: up(m[3]),
      dist1: parseFloat(m[2]),
      from2: up(m[5]),
      dist2: parseFloat(m[4]),
    },
  ];
};

/**
 * "AB = 2 AD" / "2 AB = 3 CD" / "AB = 2·AD" / "AB = 2AD" / "AB = CD/2" / "AB = √2·OD" /
 * "AB = (√2/2)CD" / "AB פי 2 מ-AD" — a proportion |AB| = k·|CD|. At least one coefficient must be
 * present — a LEADING one (`= 2·CD`) or a TRAILING divisor (`= CD/2`, so |AB| = |CD|/2); the
 * coefficient-free "AB = CD" is the `equalSegments` case, k = 1. The trailing `/d` form is what the
 * LLM emits for a stated segment ratio ("DF:FC = 1:2" → "DF = FC/2"); without it, `equalSegments`
 * grabs "DF = FC" and SILENTLY DROPS the divisor (the ADR-024/026 half-parse class). Runs before
 * `distanceConstraint`, which would otherwise half-parse "AB = 2 AD" into "AB = 2".
 *
 * The coefficient atom is the shared radical-aware {@link NUMEXPR} (ADR-298 / issues #52/#114): a number or
 * fraction, each part optionally under √, optionally parenthesised INCLUDING the `√(3)` / `√(2/3)` form the
 * √() toolbar button emits — the SAME value vocabulary the length/area/radius rules use, so the textbook
 * `AB=√2*OD` and `AC=√(3)CO` both parse. No theft: the rule still requires TWO labels on each side of `=`, so
 * "AB = √2R" (the reserved radius symbol) stays with `measureSqrt` and "AB = √2" stays a concrete length.
 */
const COEF = String.raw`\d+(?:\.\d+)?`;
const ratioConstraint: Rule = (s) => {
  const en = s.match(
    new RegExp(
      String.raw`(?<![A-Za-z\d])(?:${NUMEXPR('m')}\s*[*·]?\s*)?(?<la>[A-Za-z]\d*)\s*(?<lb>[A-Za-z]\d*)\b\s*=\s*(?:${NUMEXPR('n')}\s*[*·]?\s*)?(?<lc>[A-Za-z]\d*)\s*(?<ld>[A-Za-z]\d*)\b\s*(?:\/\s*${NUMEXPR('q')})?`,
    ),
  );
  const g = en?.groups ?? {};
  const mV = numexprVal(g, 'm'), nV = numexprVal(g, 'n'), qV = numexprVal(g, 'q');
  if (en && (mV || nV || qV)) {
    const m = mV?.value ?? 1; // |m·AB| = |n·CD / d| ⇒ |AB| = (n/(m·d))·|CD|
    const n = nV?.value ?? 1;
    const d = qV?.value ?? 1; // trailing divisor ("CD/2", "CD/√2")
    return [{ type: 'set-ratio', a: up(g.la!), b: up(g.lb!), c: up(g.lc!), d: up(g.ld!), k: n / (m * d) }];
  }
  // Hebrew "AB פי 2 מ-AD" / "AB פי √2 מ-OD" / "AC פי √(3) מ-CO" — |AB| is k× |AD|. The RHS "מ" may be glued
  // to a segment-noun ("מהקטע CO" / "מהצלע CD" / "מאורך CO") — the verbose relational form (issue #105) — so
  // skip an optional noun after מ; the LHS noun prefix ("אורך AC" / "הצלע BC") is absorbed by the `[^=]*?`.
  const he = s.match(
    new RegExp(
      String.raw`(?<ha>[A-Za-z]\d*)\s*(?<hb>[A-Za-z]\d*)\b[^=]*?פי\s*${NUMEXPR('k')}\s*מ-?\s*(?:(?:ה?קטע|ה?צלע|אורך|ה?ישר)\s+)?(?<hc>[A-Za-z]\d*)\s*(?<hd>[A-Za-z]\d*)\b`,
    ),
  );
  if (he) {
    const hg = he.groups ?? {};
    const k = numexprVal(hg, 'k');
    if (k !== null) return [{ type: 'set-ratio', a: up(hg.ha!), b: up(hg.hb!), c: up(hg.hc!), d: up(hg.hd!), k: k.value }];
  }
  return null;
};

/**
 * "AE/ED = 2/3" / "AE/ED = 2" — a ratio of two segment LENGTHS set to a fraction:
 * |AE|/|ED| = 2/3 ⇒ |AE| = (2/3)·|ED|. Runs before the numeric/distance rules, which
 * would otherwise half-parse the "ED=2" in the middle and drop the rest (the bug that
 * left a point unplaced). Drives a sliding point on either segment.
 */
const segmentRatio: Rule = (s) => {
  // RHS value uses the shared NUMEXPR atom (ADR-298) so "√(2)", "√(2/3)" (the √() toolbar form) and quotient
  // radicals parse, not only the RATVAL "√2/2" shapes (issue #114).
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*\/\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${NUMEXPR('v')}`));
  if (!m) return null;
  const v = numexprVal(m.groups!, 'v');
  if (!v) return null;
  return [{ type: 'set-ratio', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]), k: v.value }];
};

/**
 * The shared CONCRETE-VALUE atom ([ADR-298](docs/06-decisions.md#adr-298) / issue #77). A stated numeric
 * value is a TERM optionally divided by a second term, where a TERM is `[coef ·] √? number` — so it spans
 * "35", "12√2", "35/√32", "√32/5", "5√2/3", "35/2". This is the RCOEF/RATVAL coefficient vocabulary
 * (ADR-285) one seam over, exposed to the stated-VALUE positions (length / area / perimeter / radius) that
 * each carried their own partial regex and so couldn't represent a QUOTIENT value. `numexprVal` returns
 * `{ value, text }` where `text` is the VERBATIM typed form (whitespace-stripped) — kept for the on-figure
 * label (a radical fraction must render as `35/√32`, never a decimal) and for the `droppedGivenNumbers`
 * honesty gate (which accounts the stated numbers from `expr.text`; a √ breaks its digit/digit span, so the
 * verbatim text is load-bearing). Group prefix `p` keeps two NUMEXPRs distinct in one regex.
 *
 * Numerator-term groups: `<p>c` coefficient, `<p>s` √-flag, `<p>n` number. Denominator: `<p>dc`, `<p>ds`,
 * `<p>dn`. The whole match is captured as `<p>all` (the verbatim text). A caller requiring a QUOTIENT (the
 * NEW forms only, leaving bare `35` / `12√2` to their existing owners) tests `groups.<p>dn !== undefined`.
 */
// A TERM is `[coef ·] √ radicand` (a radical, coefficient optional) OR a plain `number`, each optionally
// wrapped in parentheses. The radicand is EITHER a PARENTHESISED value `(n)` / `(n/d)` — the EXPLICIT
// grouping the √ toolbar button produces (#77 Am. / ADR-298), which disambiguates `√(2/3)` (root of the
// fraction) from `√2/3` (`(√2)/3`) — OR a BARE number (`√32`), whose radicand is JUST that number so the
// textbook convention holds and any following `/d` divides the whole term. The coefficient is tied to the √
// (a bare number carries none — "35" is one number, never "3 × 5", the digit-stealing trap). Groups (prefix
// `t`): `<t>c` coef, `<t>s` √-flag, `<t>prn`/`<t>prd` parenthesised radicand num/den, `<t>brn` bare
// radicand, `<t>pn` the plain-number alt.
const NUMTERM = (t: string) =>
  String.raw`\(?\s*(?:(?:(?<${t}c>${COEF})\s*[*·]?\s*)?(?<${t}s>√)\s*(?:\(\s*(?<${t}prn>${COEF})(?:\s*\/\s*(?<${t}prd>${COEF}))?\s*\)|(?<${t}brn>${COEF}))|(?<${t}pn>${COEF}))\s*\)?`;
const termMatched = (g: Record<string, string | undefined>, t: string): boolean =>
  g[`${t}pn`] !== undefined || g[`${t}brn`] !== undefined || g[`${t}prn`] !== undefined;
const numTermVal = (g: Record<string, string | undefined>, t: string): number | null => {
  if (g[`${t}s`] !== undefined) {
    const rn = g[`${t}prn`] ?? g[`${t}brn`];
    if (rn === undefined) return null;
    const radicand = g[`${t}prd`] !== undefined ? parseFloat(rn) / parseFloat(g[`${t}prd`]!) : parseFloat(rn);
    return (g[`${t}c`] !== undefined ? parseFloat(g[`${t}c`]!) : 1) * Math.sqrt(radicand);
  }
  if (g[`${t}pn`] !== undefined) return parseFloat(g[`${t}pn`]!);
  return null;
};
const NUMEXPR = (p: string) => String.raw`(?<${p}all>${NUMTERM(`${p}A`)}(?:\s*\/\s*${NUMTERM(`${p}B`)})?)`;
const hasDivisor = (g: Record<string, string | undefined>, p: string): boolean => termMatched(g, `${p}B`);
/** Is this a value form OWNED by the shared atom rather than the existing bare-number / `coef√` rules — a
 *  QUOTIENT (`35/√32`) OR a PARENTHESISED radicand (`√(2/3)`, `5√(2/3)` — which `measureSqrt` can't parse)?
 *  Bare `35` and `12√2` return false and stay with `distanceConstraint`/`measureSqrt`. */
const isNewValueForm = (g: Record<string, string | undefined>, p: string): boolean =>
  hasDivisor(g, p) || g[`${p}Aprn`] !== undefined || g[`${p}Bprn`] !== undefined;
const numexprVal = (g: Record<string, string | undefined>, p: string): { value: number; text: string } | null => {
  const numer = numTermVal(g, `${p}A`);
  if (numer === null) return null;
  const denom = hasDivisor(g, p) ? numTermVal(g, `${p}B`) : 1;
  if (denom === null || denom === 0) return null;
  return { value: numer / denom, text: (g[`${p}all`] ?? '').replace(/\s+/g, '') };
};

/**
 * "DF:FC = 1:2" — a bare ratio between two named segments, colon-form, with NO `ratio`/`divides`
 * keyword (`dividesInRatio` owns the keyworded phrasings). |DF|:|FC| = p:q ⇒ |DF| = (p/q)·|FC|,
 * emitted as a `set-ratio` CONSTRAINT (like `segmentRatio`, the `/`-form sibling) that drives the
 * shared/free point so the proportion holds — it references existing endpoints, it does not create
 * them. Anchored on the full `seg:seg = p:q` shape (both sides an `x:y`), so it never claims a lone
 * segment, an equality, or a `p:q` that lacks two named LHS segments. Without this the utterance fell
 * through every rule and escalated to the LLM, which returned "DF = FC/2" — then silently mis-read as
 * a plain equality (the divisor dropped). Now deterministic and offline. (`RATPQ` defined just below.)
 */
const segmentRatioColon: Rule = (s) => {
  const m = s.match(
    new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*:\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${RATPQ}`),
  );
  if (!m) return null;
  const p = parseFloat(m[5]), q = parseFloat(m[6]);
  if (p <= 0 || q <= 0) return null;
  return [{ type: 'set-ratio', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]), k: p / q }];
};

/**
 * A point DIVIDING a segment in a stated ratio — "G divides DC in ratio 1:2" / "G מחלק[ת] את DC ביחס 1:2"
 * / "the ratio DG:GC is 1:2" / "היחס בין DG ל-GC הוא 1:2". G lands on DC at t = p/(p+q) from the first
 * endpoint (DG:GC = p:q), lowered to a `point-on-segment` with a fixed `t` (a determined parametric point).
 * Keyword-anchored on `divides`/`מחלק` or `ratio`/`יחס` PLUS a literal `p:q`, so it never claims a plain
 * segment, a `XY = …` equality, or a `AB/CD = …` segment-ratio (those carry no `:`-ratio + divide/ratio word).
 */
const RATPQ = String.raw`(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)`;
const dividesInRatio: Rule = (s) => {
  // (a) divider-first: "G divides DC in ratio p:q" / "G מחלקת את DC ביחס p:q".
  const div = s.match(
    new RegExp(
      String.raw`([A-Za-z]\d*)\s+(?:divides?|מחלק[הת]?)\s+(?:את\s+)?(?:ה?קטע\s+|ה?צלע\s+)?([A-Za-z]\d*)\s*([A-Za-z]\d*)\b[\s\S]*?(?:ratio|ביחס|יחס)\D*?${RATPQ}`,
      'i',
    ),
  );
  if (div) {
    const p = parseFloat(div[4]), q = parseFloat(div[5]);
    if (p + q > 0) return [{ type: 'point-on-segment', id: up(div[1]), a: up(div[2]), b: up(div[3]), t: p / (p + q) }];
  }
  // (b) sub-segments named: "the ratio between DG and GC is p:q" — DG,GC share the divider G; the host
  // segment runs from DG's free end (D) to GC's free end (C). Single-letter labels (the bagrut convention).
  const two = s.match(
    new RegExp(String.raw`(?:ratio|יחס)[\s\S]*?\b([A-Za-z])([A-Za-z])\b\s*(?::|\/|ל-?|to|and|ו-?|,)\s*\b([A-Za-z])([A-Za-z])\b[\s\S]*?${RATPQ}`, 'i'),
  );
  if (two) {
    const [a1, b1, a2, b2] = [up(two[1]), up(two[2]), up(two[3]), up(two[4])];
    const shared = [a1, b1].find((x) => x === a2 || x === b2);
    if (shared) {
      const start = a1 === shared ? b1 : a1; // DG's free end (D)
      const end = a2 === shared ? b2 : a2; // GC's free end (C)
      const p = parseFloat(two[5]), q = parseFloat(two[6]);
      if (p + q > 0 && start !== end) return [{ type: 'point-on-segment', id: shared, a: start, b: end, t: p / (p + q) }];
    }
  }
  return null;
};

/**
 * A ratio LHS — "XY/ZW =" — so the measure-VALUE rules (a single segment "XY = …") don't grab a
 * FRAGMENT of a ratio (the "AE=√2" inside "EB/AE=√2/2" — a silent wrong parse, the ADR-024/026 class).
 * When this matches, only `segmentRatio` (which runs first) may handle it; an RHS it can't read then
 * escalates honestly rather than half-parsing.
 */
const SEG_RATIO_LHS = new RegExp(String.raw`\b[A-Za-z]\d*\s*[A-Za-z]\d*\b\s*\/\s*\b[A-Za-z]\d*\s*[A-Za-z]\d*\b\s*=`);

/**
 * A DIVIDED RHS — "= CD/2" — is a ratio (|AB| = |CD|/2), not an equality. Guards `equalSegments`
 * from matching the "AB = CD" prefix and dropping the "/2" (the ADR-024/026 silent-half-parse class);
 * `ratioConstraint` owns this form. Same discipline as `SEG_RATIO_LHS` on `distanceConstraint`.
 */
const SEG_DIV_RHS = new RegExp(String.raw`=\s*[A-Za-z]\d*\s*[A-Za-z]\d*\s*\/\s*${COEF}`);

/**
 * An optional CARRIER NOUN before a label pair — "מיתר AB" / "the chord AB" / "קוטר CD". The relation
 * rules tolerate it so a noun-repeated given ("מיתר AB = מיתר CD", "chord AB > chord CD") parses as the
 * relation on the two segments; the `withCarrierMembership` post-pass then restores the on-circle
 * membership (and a diameter's through-centre collinearity) the noun asserts. Without this, the
 * chord/diameter rules' relation-tail bail (PAR-1) ORPHANED these forms — nothing claimed them and a
 * previously-parsing textbook phrasing regressed to an LLM escalation (review 2026-07-03, P4).
 */
const CARRIER_PRE = String.raw`(?:(?:the\s+)?(?:chord|diameter|radius)\s+|ה?(?:מיתר|קוטר|רדיוס)\s+)?`;

/**
 * "AB = CD" — two segments equal in length. Also DRAWS both named segments (idempotent),
 * so the equality puts the two compared sides on the canvas (FR-IN-7). Each side may carry a
 * carrier noun ("מיתר AB = מיתר CD") — see {@link CARRIER_PRE}.
 */
const equalSegments: Rule = (s) => {
  if (SEG_DIV_RHS.test(s)) return null; // "= CD/2" is a ratio, not an equality — let ratioConstraint own it
  const m = s.match(new RegExp(String.raw`${CARRIER_PRE}\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${CARRIER_PRE}\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b`, 'i'));
  if (!m) return null;
  const [a, b, c, d] = [up(m[1]), up(m[2]), up(m[3]), up(m[4])];
  return [
    { type: 'segment', a, b },
    { type: 'segment', a: c, b: d },
    { type: 'set-equal', a, b, c, d },
  ];
};

/**
 * "AB = 6" — fix a segment's length. Also DRAWS the named segment (idempotent), FR-IN-7.
 * The number is ANCHORED to the end of the input (`\s*$`), so a trailing radical / power / unit
 * ("AB = 12√x", "AB = 5∛x", "AB = 6 cm") can't be silently dropped to a bare "= 6" — that
 * numeric-prefix half-parse is the ADR-024/026 class. An unreadable RHS falls through to escalation
 * instead of a wrong partial parse. (R6a.)
 */
const distanceConstraint: Rule = (s) => {
  if (SEG_RATIO_LHS.test(s)) return null;
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${num}\s*$`));
  if (!m) return null;
  const [a, b] = [up(m[1]), up(m[2])];
  return [
    { type: 'segment', a, b },
    { type: 'set-distance', a, b, value: parseFloat(m[3]) },
  ];
};

// ── Symbolic measures (ADR-031): a named unknown shared across statements. ──
// A variable is a single LOWERCASE letter — latin for lengths (x, y), Greek for
// angles (α, β); points stay uppercase, so the two never collide.
const VAR = String.raw`[a-zα-ω]`;
// A length's RHS variable also admits the reserved radius symbol R/r ("AC = 1.6R") — ADR-034.
// (Only as a size: the `(?![a-zA-Z])` guard keeps "AB = RS"/"AB = AR" reading R as a vertex.)
const LVAR = String.raw`[a-zα-ωR]`;
// R and r are DISTINCT variables (issue #54 — the bagrut convention names two circles' radii R vs r);
// the old fold `r → R` merged them into one reserved symbol, which is wrong the moment a second circle
// binds its own letter. An UNBOUND R/r still both denote "the" circle's radius via the symbol table's
// legacy fallback (buildSymTab), so single-circle figures behave as before.
const normVar = (v: string): string => v;

/**
 * "AB = 3x" / "AB = x" / "AB = 1.5y" — a segment's length as `coef·var` (a symbolic
 * size, not a number). Runs before the numeric/ratio rules; a numeric RHS ("AB = 5")
 * has no variable and falls through to `distanceConstraint`. The relation only bites
 * once a second segment shares the variable (lowered to a ratio in the store).
 */
/**
 * "AB = π" / "AB = 2π" — a length using the constant π (≈ 3.14159), not a variable. Runs
 * before `measureLength`, which would otherwise read π (a Greek letter) as a free variable.
 * The base is concrete, so it lowers to a numeric `set-distance`. Only the π glyph (the
 * toolbar button) is accepted — the word "pi" is left out as it collides with a segment "PI".
 */
const measurePi: Rule = (s) => {
  if (SEG_RATIO_LHS.test(s)) return null; // a ratio's RHS, not a length — let segmentRatio own it
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*π`));
  if (!m) return null;
  const c = m[3] ? parseFloat(m[3]) : 1;
  return [{ type: 'measure-length', a: up(m[1]), b: up(m[2]), expr: { value: c * Math.PI, text: `${c === 1 ? '' : m[3]}π` } }];
};

// ── AREA measures & relations ([ADR-118](docs/06-decisions.md#adr-118)) ────────────────────────────────
// Hebrew shape nouns / English shape words that may sit between the area marker and the vertex letters.
const AREA_SHAPE = String.raw`(?:ה?(?:משולש|מרובע|דלתון|עפיפון|מלבן|מקבילית|טרפז|מעוין|ריבוע)|triangle|quadrilateral|rectangle|parallelogram|trapez\w*|rhombus|kite|square)`;

/** Every "area of a polygon" reference in `s`, in order. Forms: compact `SABC`; verbose `שטח [ה<shape>] ABC`
 *  / `area [of] [the] [<shape>] ABC`. Returns each polygon's vertex ids with the marker's string position. */
function areaReferences(s: string): { ids: Id[]; at: number }[] {
  const refs: { ids: Id[]; at: number }[] = [];
  const seen = new Set<number>(); // string positions of verbose-polygon FIRST vertices — the compact S-scan must skip them (PAR-6)
  // verbose marker: שטח / area, then optional filler + shape word, then the 3–4 vertex labels.
  const reKw = /שטח|\barea\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reKw.exec(s)) !== null) {
    const kwEnd = m.index + m[0].length;
    const raw = s.slice(kwEnd);
    const after = raw.replace(new RegExp(String.raw`^(?:\s+(?:of|the|של|ה))*\s*${AREA_SHAPE}?\s*`, 'i'), '');
    const labelStart = kwEnd + (raw.length - after.length); // where the vertex run begins in `s`
    // Read ONLY the leading vertex run (the labels right after the shape word) — never scan ahead, or a later
    // filler word ("area", "of") would be read as labels (the word "area" → A,R,E,A bug).
    const lead = after.match(/^((?:[A-Za-z]\d*\s*){3,4})/);
    const ids = lead ? (labelRun(lead[1], 4) ?? labelRun(lead[1], 3)) : null;
    if (ids) {
      refs.push({ ids, at: m.index });
      // A verbose polygon whose FIRST vertex is "S" (e.g. "שטח מרובע SABC") would be re-read by the compact
      // S-scan below as marker-S + polygon "ABC" — a phantom second ref that turns a lone area into a bogus
      // area-RATIO. Record the first vertex's position so the compact scan skips it (the dead `seen` set, now
      // populated — PAR-6). Only matters when the polygon actually starts with S; otherwise the compact scan
      // finds no S there anyway.
      if (up(ids[0]) === 'S') seen.add(labelStart);
    }
  }
  // compact S-notation: S immediately followed by 3–4 uppercase vertex labels (SABC / SABCD).
  // `(?<![A-Za-z])` (not `\b`) so a COEFFICIENT glued to the marker is allowed — "4SNCE" (the ratio
  // `SACD = 4SNCE`) must still find SNCE, where `\b` failed because digit↔S is not a word boundary.
  const reS = /(?<![A-Za-z])S((?:[A-Z]\d*){3,4})\b/g;
  while ((m = reS.exec(s)) !== null) {
    const ids = labelRun(m[1], 4) ?? labelRun(m[1], 3);
    if (ids && !seen.has(m.index)) refs.push({ ids, at: m.index });
  }
  return refs.sort((a, b) => a.at - b.at);
}

/**
 * The ratio coefficient k for "measure(P1) = k·measure(P2)" from the connective between two refs — shared by
 * area (ADR-118) and perimeter (ADR-228). `kwAlt` is the measure keyword alternation (e.g. `S[A-Z]|שטח|area`)
 * used only by the "= 2 <kw>DEF" coefficient form; every other connective (fraction word, "פי N", "= r") is
 * keyword-agnostic.
 */
function measureRatioK(s: string, kwAlt: string): number {
  // Hebrew fraction words get no `\b` — JS word boundaries don't fire around non-ASCII letters.
  if (/רבע/.test(s) || /\bquarter\b/i.test(s)) return 1 / 4;
  if (/שליש/.test(s) || /\bthird\b/i.test(s)) return 1 / 3;
  if (/חצי|מחצית/.test(s) || /\bhalf\b/i.test(s)) return 1 / 2;
  // "גדול פי 2 מ" / "2 times" / "פי √(3)" and "= 3/4" / "הוא 1.8" — the shared NUMEXPR atom (ADR-298) so a
  // radical factor / the √() toolbar form parses here too (issue #114, the segment-ratio sibling).
  const pi = s.match(new RegExp(String.raw`(?:פי|times)\s*${NUMEXPR('pi')}`, 'i'));
  if (pi) { const v = numexprVal(pi.groups!, 'pi'); if (v) return v.value; }
  const eq = s.match(new RegExp(String.raw`(?:=|הוא|\bis\b)\s*${NUMEXPR('eq')}`, 'i'));
  if (eq) { const v = numexprVal(eq.groups!, 'eq'); if (v) return v.value; }
  const coef = s.match(new RegExp(String.raw`=\s*(${COEF})\s*(?:${kwAlt})`, 'i')); // "= 2 SDEF" / "= 2 area DEF"
  if (coef) return parseFloat(coef[1]);
  return 1; // equal measures
}
const areaRatioK = (s: string): number => measureRatioK(s, String.raw`S[A-Z]|שטח|area`);

/** The value/label on the RHS of a single-area measure: a number, radical, variable, or power. */
function parseAreaExpr(rhs: string): MeasureExpr | null {
  const t = rhs.trim();
  // A QUOTIENT value — "35/√32", "√3/2", "25√3/2", "35/2" (#77, the shared NUMEXPR atom). Checked FIRST
  // (before the √/number branches, which would half-read the numerator and drop the divisor) but only when
  // a divisor is present, so a plain "25√3" / "13" still flows to its existing branch below.
  const q = t.match(new RegExp(String.raw`^${NUMEXPR('a')}$`));
  if (q && isNewValueForm(q.groups!, 'a')) { const v = numexprVal(q.groups!, 'a'); if (v) return v; }
  let m = t.match(new RegExp(String.raw`^(${COEF})?\s*√\s*(${COEF})$`)); // 25√3 / √3
  if (m) {
    const c = m[1] ? parseFloat(m[1]) : 1;
    return { value: c * Math.sqrt(parseFloat(m[2])), text: `${m[1] && c !== 1 ? m[1] : ''}√${m[2]}` };
  }
  m = t.match(/^(\d+(?:\.\d+)?)?\s*([A-Za-z])\s*(?:²|\^\s*2)$/); // p² / 2p²
  if (m) return { coef: m[1] ? parseFloat(m[1]) : 1, var: m[2], pow: 2 };
  m = t.match(new RegExp(String.raw`^(${COEF})$`)); // 13 / 1.8
  if (m) return { value: parseFloat(m[1]) };
  m = t.match(/^(\d+(?:\.\d+)?)?\s*([A-Za-z])$/); // S / 2S  (a label/variable)
  if (m) return { coef: m[1] ? parseFloat(m[1]) : 1, var: m[2] };
  return null;
}

/**
 * Area givens (ADR-118): an absolute area (`SABC = 13`, `שטח המשולש ABC הוא 25√3`), an area RATIO
 * (`SABC/SDEF = 3/4`, `שטח ABF גדול פי 2 משטח BFE`, `שטח ADE רבע משטח ABC`, `היחס בין שטח X ובין שטח Y הוא r`),
 * or an area LABEL (`SABC = S`, `נסמן את שטח ABCD ב-S`). An area's measure is the polygon's shoelace area; a
 * lone absolute area drives the figure's SCALE, a ratio drives a SHAPE DOF (ADR-052/ADR-101). Two area refs →
 * `set-area-ratio`; one ref + value/variable → `measure-area` (lowered like a length, so a shared variable
 * makes two areas a ratio). Runs before the length/distance rules (its LHS is a polygon, not a 2-pt segment).
 */
const area: Rule = (s) => {
  if (!/שטח|\barea\b/i.test(s) && !/\bS[A-Z]/.test(s)) return null;
  const refs = areaReferences(s);
  if (refs.length === 0) return null;
  if (refs.length >= 2) {
    // area(first) = k·area(second). For an explicit "SABC/SDEF = r" the ratio is area1/area2 = r ⇒ k = r.
    return [{ type: 'set-area-ratio', ids1: refs[0].ids, ids2: refs[1].ids, k: areaRatioK(s) }];
  }
  // A single area + a value/label. The RHS follows '=', 'הוא'/'is', 'ב-'/'by' (the נסמן/denote label form).
  // Hebrew connectives get no `\b` — JS word boundaries don't fire around non-ASCII letters.
  const rhs = s.match(/(?:=|הוא|שווה|\bis\b|\bequals?\b)\s*(.+)$/i) ?? s.match(/(?:ב-?|\bby\b)\s*([A-Za-z])\s*$/i);
  if (!rhs) return null;
  const expr = parseAreaExpr(rhs[1]);
  if (!expr) return null;
  return [{ type: 'measure-area', ids: refs[0].ids, expr }];
};

// ── PERIMETER measures & relations ([ADR-228](docs/06-decisions.md#adr-227)) ────────────────────────────
/** Every "perimeter of a polygon" reference in `s`, in order — verbose only ("היקף [ה<shape>] ABC" /
 *  "perimeter [of] [the] [<shape>] ABC"). No compact single-letter marker (a bare "P" collides with point
 *  labels), unlike area's `SABC`. Mirrors the verbose half of {@link areaReferences}. */
function perimeterReferences(s: string): { ids: Id[]; at: number }[] {
  const refs: { ids: Id[]; at: number }[] = [];
  const reKw = /היקף|perimeter/gi;
  let m: RegExpExecArray | null;
  while ((m = reKw.exec(s)) !== null) {
    const kwEnd = m.index + m[0].length;
    const raw = s.slice(kwEnd);
    const after = raw.replace(new RegExp(String.raw`^(?:\s+(?:of|the|של|ה))*\s*${AREA_SHAPE}?\s*`, 'i'), '');
    const lead = after.match(/^((?:[A-Za-z]\d*\s*){3,4})/);
    const ids = lead ? (labelRun(lead[1], 4) ?? labelRun(lead[1], 3)) : null;
    if (ids) refs.push({ ids, at: m.index });
  }
  return refs.sort((a, b) => a.at - b.at);
}

/**
 * Perimeter givens (ADR-228) — the polygon sibling of {@link area}: an absolute perimeter (`היקף ABC = 20`,
 * `perimeter of the rectangle ABCD is 20`) or a perimeter RATIO (`היקף ABC = 2 היקף DEF`, `…גדול פי 2…`,
 * `…רבע…`). `היקף` is one Hebrew word for a polygon's perimeter AND a circle's circumference; a CIRCLE's
 * `היקף` sizes its radius (the `circle` rule owns it), so this rule bows out whenever the utterance names a
 * circle. A lone absolute perimeter drives the figure's SCALE, a ratio drives a SHAPE DOF (ADR-052/ADR-101).
 * Emits `set-perimeter`/`set-perimeter-ratio` directly (a symbolic-variable perimeter label escalates to the
 * LLM — a noted follow-up). Runs before the shape rules, which would otherwise build the polygon and drop it.
 */
const perimeter: Rule = (s) => {
  if (!/היקף|perimeter/i.test(s)) return null;
  const refs = perimeterReferences(s);
  if (/circle|מעגל/i.test(s)) {
    // `היקף` next to a CIRCLE splits by what the keyword actually references (the semantic fact, not
    // word presence — ADR-231/17-design-rules §2.2): a circumference form ("היקף מעגל O1 הוא 6π") has
    // no 3–4-vertex polygon run after the keyword → the `circle` rule owns it (bow out). A POLYGON's
    // perimeter stated alongside a circle ("היקף המשולש ABC החסום במעגל O הוא 20") is a COMPOUND
    // (declare-inscribed + measure) this grammar doesn't split — escalate rather than fall through to
    // a shape rule that would DROP the stated 20 (the "no stated magnitude ever vanishes" invariant).
    if (refs.length === 0) return null;
    return 'stop';
  }
  if (refs.length === 0) return null;
  if (refs.length >= 2) {
    return [{ type: 'set-perimeter-ratio', ids1: refs[0].ids, ids2: refs[1].ids, k: measureRatioK(s, String.raw`היקף|perimeter`) }];
  }
  const rhs = s.match(/(?:=|הוא|שווה|\bis\b|\bequals?\b)\s*(.+)$/i);
  if (!rhs) return null;
  const expr = parseAreaExpr(rhs[1]); // number / radical (a variable-label perimeter is out of scope → null → escalate)
  if (!expr || !('value' in expr)) return null;
  return [{ type: 'set-perimeter', ids: refs[0].ids, value: expr.value }];
};

const measureLength: Rule = (s) => {
  if (SEG_RATIO_LHS.test(s)) return null;
  // The variable is one lowercase/Greek letter, not followed by another latin letter
  // (so "AB = CD" stays a ratio and a Greek letter — no regex word boundary — still ends cleanly).
  // An optional trailing "/d" makes the coefficient a fraction ("7k/5" ⇒ coef 7/5); an optional
  // "± c" (c a number or fraction) adds an affine constant ("k + 2", "k − 5/2"). Both are kept
  // verbatim for the label so it reads exactly as typed, not a decimal.
  // The RHS is ANCHORED to end-of-input (`\s*$`) so a trailing exponent/text can't be dropped:
  // "AB = 3x²" must NOT half-parse to "3x" (measurePower runs first and owns it); a leftover suffix
  // falls through to escalation instead of a wrong partial parse (the ADR-024/026 class). (R6a.)
  const m = s.match(
    new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*(${LVAR})(?![a-zA-Z])\s*(?:\/\s*(${COEF}))?\s*(?:([+\-−])\s*(${COEF})(?:\s*\/\s*(${COEF}))?)?\s*$`),
  );
  if (!m) return null;
  const num = m[3] ? parseFloat(m[3]) : 1;
  const den = m[5] ? parseFloat(m[5]) : 1;
  const sign = m[6] === '+' ? 1 : -1; // '-' or '−' (minus sign)
  const cNum = m[7] ? parseFloat(m[7]) : 0;
  const cDen = m[8] ? parseFloat(m[8]) : 1;
  const konst = m[6] ? (sign * cNum) / cDen : 0;
  // Faithful label: "7k/5", "k+2", "k-5/2", etc. — built from the parts the student typed.
  let text: string | undefined;
  if (m[5] || m[6]) {
    text = `${m[3] ?? ''}${m[4]}${m[5] ? `/${m[5]}` : ''}${m[6] ? ` ${m[6] === '+' ? '+' : '−'} ${m[7]}${m[8] ? `/${m[8]}` : ''}` : ''}`;
  }
  return [
    {
      type: 'measure-length',
      a: up(m[1]),
      b: up(m[2]),
      expr: { coef: num / den, var: normVar(m[4]), ...(konst ? { const: konst } : {}), ...(text ? { text } : {}) },
    },
  ];
};

/**
 * "AD = 12√x" / "AD = √x" / "AD = 12\sqrt{x}" / "AD = 2*sqrt(y)" — a length as
 * `coef·√(radicand)`. Runs BEFORE the numeric/ratio rules so the radical is never
 * dropped (the bug: "AD = 12√x" half-parsed to set-distance 12). The radicand is a
 * single variable letter (symbolic, resolves when the var gets a value) or a number
 * (a concrete length, e.g. 12√2). Accepts the √ glyph, LaTeX \sqrt{…}, or sqrt(…).
 * An optional trailing variable MULTIPLIES the radical ("AB = √2R" = (√2)·R, "2√3R"),
 * the radius-times-radical idiom — the RHS is ANCHORED to end-of-input so the trailing
 * factor can NEVER be silently dropped (the ADR-024/026 class: "√2R" used to parse as a
 * bare "√2", discarding R).
 */
const SQRT_FN = String.raw`(?:√|\\sqrt|sqrt)\s*[\{(]?\s*(${VAR}|${COEF})\s*[\})]?`;
/**
 * "BC = 35/√32" / "BC = √32/5" / "BC = 5√2/3" / "BC = 35/2" — a segment's length given as a QUOTIENT value
 * ([ADR-298](docs/06-decisions.md#adr-298) / issue #77), the {@link NUMEXPR} shared atom in the length RHS.
 * Emits a `measure-length` with the computed value AND the verbatim radical-fraction text (mirroring
 * `measureSqrt`'s `12√2`), so the figure shows `35/√32`, not `6.19`. Fires ONLY when a DIVISOR is present —
 * bare `35` stays with `distanceConstraint`, `12√2` with `measureSqrt`, `√2R` with the radius idiom; the
 * `$` anchor + the `SEG_RATIO_LHS` guard keep `AB = CD/2` (a segment ratio) and `AB = 3x²` out.
 */
const measureFraction: Rule = (s) => {
  if (SEG_RATIO_LHS.test(s)) return null;
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${NUMEXPR('v')}\s*$`));
  if (!m || !isNewValueForm(m.groups!, 'v')) return null; // bare `35` / `12√2` → their owners; a quotient or a √(…) group is ours
  const val = numexprVal(m.groups!, 'v');
  if (!val) return null;
  return [{ type: 'measure-length', a: up(m[1]), b: up(m[2]), expr: val }];
};

const measureSqrt: Rule = (s) => {
  if (SEG_RATIO_LHS.test(s)) return null; // don't grab the "AE=√2" fragment inside "EB/AE=√2/2"
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*${SQRT_FN}\s*[*·]?\s*(${LVAR})?(?![a-zA-Z])\s*$`, 'i'));
  if (!m) return null;
  const a = up(m[1]);
  const b = up(m[2]);
  const coef = m[3] ? parseFloat(m[3]) : 1;
  const radicand = m[4];
  const tail = m[5]; // optional variable multiplying the radical, e.g. the radius R in "√2R"
  const radNumeric = /^[0-9.]+$/.test(radicand);
  // A trailing variable scales the radical: "√2R" = (√2)·R, "2√3R" = (2√3)·R — a numeric
  // coefficient (the resolved radical) times a (usually radius) variable. Only meaningful with a
  // numeric radicand; "√x y" (two symbols multiplied) is ambiguous, so escalate rather than guess.
  if (tail) {
    if (!radNumeric) return null;
    const c = coef * Math.sqrt(parseFloat(radicand));
    const display = /^[Rr]$/.test(tail) ? 'R' : tail;
    return [{ type: 'measure-length', a, b, expr: { coef: c, var: normVar(tail), text: `${m[3] ?? ''}√${radicand}${display}` } }];
  }
  // Number under the radical ⇒ a concrete length, but keep "12√2" as the display (not 16.97);
  // a letter ⇒ symbolic (pow ½), display derived as "12√x".
  if (radNumeric) return [{ type: 'measure-length', a, b, expr: { value: coef * Math.sqrt(parseFloat(radicand)), text: `${m[3] && coef !== 1 ? m[3] : ''}√${radicand}` } }];
  return [{ type: 'measure-length', a, b, expr: { coef, var: radicand.toLowerCase(), pow: 0.5 } }];
};

/**
 * "AB = x²" / "AB = 3x²" / "AB = x^2" / "AB = 2x^3" — a length as `coef·varⁿ`. Runs
 * BEFORE `measureLength` (which would read the `x` and silently drop the `²`/`^n`).
 * A numeric base ("AB = 5²") is a concrete length. The exponent is a ²/³ superscript
 * or `^n`.
 */
const measurePower: Rule = (s) => {
  if (SEG_RATIO_LHS.test(s)) return null;
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*(${VAR}|${COEF})\s*(?:([²³])|\^\s*(\d+))`, 'i'));
  if (!m) return null;
  const a = up(m[1]);
  const b = up(m[2]);
  const coef = m[3] ? parseFloat(m[3]) : 1;
  const base = m[4];
  const pow = m[5] ? (m[5] === '²' ? 2 : 3) : parseInt(m[6], 10);
  const sup = pow === 2 ? '²' : pow === 3 ? '³' : `^${pow}`;
  if (/^[0-9.]+$/.test(base)) return [{ type: 'measure-length', a, b, expr: { value: coef * Math.pow(parseFloat(base), pow), text: `${m[3] && coef !== 1 ? m[3] : ''}${base}${sup}` } }];
  return [{ type: 'measure-length', a, b, expr: { coef, var: base.toLowerCase(), pow } }];
};

/**
 * "angle ABC = 2α" / "זווית ABC = α" — an angle as `coef·var`. Runs before `angle`,
 * which would otherwise read the coefficient as the angle's degree value. A numeric
 * angle ("angle ABC = 37") has no variable here and falls through to `angle`.
 */
const measureAngle: Rule = (s) => {
  if (!/angle|∠|זוו?ית/i.test(s)) return null;
  const stripped = s.replace(/angle|∠|זוו?ית/gi, ' ');
  const ids = labelRun(stripped, 3);
  if (!ids) return null;
  const m = stripped.match(new RegExp(String.raw`=\s*(${COEF})?\s*[*·]?\s*(${VAR})(?![a-zA-Z])`));
  if (!m) return null; // numeric or unreadable → let `angle` take the numeric case
  return [{ type: 'measure-angle', vertex: ids[1], ray1: ids[0], ray2: ids[2], expr: { coef: m[1] ? parseFloat(m[1]) : 1, var: m[2] } }];
};

/**
 * "AB = AC = 3x" / "AB = AC = 5" / "AB = CD = EF" — a chained equality. Split into the
 * adjacent pairwise clauses (AB = AC, AC = 3x) and parse each, so the whole chain takes
 * effect (the bug: a substring rule grabbed just one clause — "AC = 3x" — and the AB = AC
 * equality was silently dropped). Fires only on ≥2 '=' and bails (→ null) unless every
 * clause parses, so non-chain inputs fall through untouched.
 */
const chainedEquality: Rule = (s, ctx) => {
  const parts = s.split('=').map((p) => p.trim());
  if (parts.length < 3 || parts.some((p) => p === '')) return null;
  const out: AnyCommand[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const clause = parse(`${parts[i]} = ${parts[i + 1]}`, ctx);
    if (!clause.ok) return null;
    out.push(...clause.commands);
  }
  return out;
};

/** "x = 4" / "α = 30" — bind a variable to a number; resolves every measure that uses it. */
const setVar: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`^\s*(${VAR})\s*=\s*${num}\s*$`));
  return m ? [{ type: 'set-var', name: m[1], value: parseFloat(m[2]) }] : null;
};

/**
 * "α < β" / "x > y" / "α ≤ β" — an ORDERING between two named measures (ADR-039). The two
 * single-letter variables are resolved to their measures by the symbol table during lowering; this
 * actively reshapes the figure so the relation holds visibly (e.g. ∠BAP comes out smaller than ∠ABP).
 * Both sides must be a *bare* variable (no coefficient) — `2α < β` and numeric comparisons fall through.
 */
const measureOrder: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`^\s*(${VAR})\s*(<=|>=|<|>|≤|≥)\s*(${VAR})\s*$`));
  if (!m) return null;
  const op = m[2] === '≤' ? '<=' : m[2] === '≥' ? '>=' : (m[2] as '<' | '>' | '<=' | '>=');
  return [{ type: 'measure-order', left: m[1], op, right: m[3] }];
};

/**
 * "AB > CD" / "DC < AB" / "|AB| ≥ |CD|" — an ORDERING between two SEGMENT lengths (ADR-039), and the
 * word forms "AB גדול מ CD" / "AB longer than CD" (and קטן / shorter / smaller). The two two-letter
 * sides distinguish this from `measureOrder` (single-letter named measures). The SHORTER segment is
 * recorded first in `set-length-order`; the solver reshapes the figure so the relation holds visibly
 * (e.g. a trapezoid whose default drew AB longer than DC flips so |DC| > |AB|). Like ∥/⟂ it also DRAWS
 * both segments (idempotent), so "DC > AB" needs no separate segment request.
 */
const lengthOrder: Rule = (s) => {
  let a: string, b: string, c: string, d: string, leftLarger: boolean;
  const SEG = String.raw`\|?([A-Za-z]\d*)\s*([A-Za-z]\d*)\|?`;
  // Each side may carry a carrier noun ("מיתר AB > מיתר CD") — membership is restored by the post-pass.
  const sym = s.match(new RegExp(String.raw`^\s*${CARRIER_PRE}${SEG}\s*(<=|>=|<|>|≤|≥)\s*${CARRIER_PRE}${SEG}\s*$`, 'i'));
  if (sym) {
    [a, b, c, d] = [up(sym[1]), up(sym[2]), up(sym[4]), up(sym[5])];
    leftLarger = sym[3] === '>' || sym[3] === '>=' || sym[3] === '≥';
  } else {
    // word form: "AB גדול מ-CD" / "AB longer than CD" / "AB קטן מ CD" / "AB shorter than CD"
    const big = String.raw`גדול[֐-׿]*|larger|longer|greater|bigger`;
    const small = String.raw`קטן[֐-׿]*|smaller|shorter|less`;
    const w = s.match(
      new RegExp(String.raw`^\s*${CARRIER_PRE}${SEG}\s+(?:(${big})|(${small}))\s+(?:than\s+|מ-?|מן\s+)?${CARRIER_PRE}${SEG}\s*$`, 'i'),
    );
    if (!w) return null;
    [a, b, c, d] = [up(w[1]), up(w[2]), up(w[5]), up(w[6])];
    leftLarger = !!w[3];
  }
  const [sa, sb] = leftLarger ? [c, d] : [a, b]; // shorter segment
  const [la, lb] = leftLarger ? [a, b] : [c, d]; // longer segment
  return [
    { type: 'segment', a: sa, b: sb },
    { type: 'segment', a: la, b: lb },
    { type: 'set-length-order', a: sa, b: sb, c: la, d: lb },
  ];
};

/**
 * "AB parallel to CD" / "AB ∥ CD" / "AB מקביל ל-CD". Naming two segments in a ∥
 * relation also DRAWS them (segment is idempotent — a no-op if already on the
 * figure), so "AB ∥ CD" puts both lines on the canvas without a separate request.
 */
const parallelConstraint: Rule = (s) => {
  if (!/parallel|∥|מקביל/i.test(s)) return null;
  // strip the keyword AND filler words (so "to"/"of" aren't read as 2-letter labels)
  const t = s.replace(/parallel(?:\s*to)?|∥|מקביל(?:\s*ל-?)?/gi, ' ').replace(FILLER, ' ');
  const m = t.match(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/);
  if (!m) return null;
  const [a, b, c, d] = [up(m[1]), up(m[2]), up(m[3]), up(m[4])];
  return [
    { type: 'segment', a, b },
    { type: 'segment', a: c, b: d },
    { type: 'set-parallel', a, b, c, d },
  ];
};

/**
 * "AB perpendicular to CD" / "AB ⊥ CD" / "AB מאונך ל-CD" — two *named* segments
 * (not the foot phrasing). Like ∥, it also DRAWS both segments (idempotent).
 */
const perpendicularConstraint: Rule = (s) => {
  if (!/perpendicular|⊥|⟂|מאונ[כך]|אנ[כך]/i.test(s)) return null; // both ⊥ (U+22A5) and ⟂ (U+27C2); אנך = the noun form ("EF אנך ל AB")
  const t = s.replace(/perpendicular(?:\s*to)?|⊥|⟂|מאונ[כך](?:\s*ל-?)?|אנ[כך](?:\s*ל-?)?/gi, ' ').replace(FILLER, ' ');
  if ((t.match(/\b[A-Za-z]\d*\s*[A-Za-z]\d*\b/g) ?? []).length < 2) return null; // "perpendicular from A to BC" is the foot, not this
  const m = t.match(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/);
  if (!m) return null;
  const [a, b, c, d] = [up(m[1]), up(m[2]), up(m[3]), up(m[4])];
  return [
    { type: 'segment', a, b },
    { type: 'segment', a: c, b: d },
    { type: 'set-perpendicular', a, b, c, d },
  ];
};

/**
 * Collinearity — three points on one line (ADR-050). Three phrasings:
 *   - "line CE passes through A" / "ישר CE עובר בנקודה A"  → drive a point of the named line onto A
 *   - "E on line AC"            / "E על הישר AC"           → slide the named point E onto line AC
 *   - "A, B, C collinear"       / "A B C על ישר אחד"       → make the three line up (drive a free one)
 * The first two NAME a line by two points, so they also DRAW that segment (idempotent), like ∥/⟂
 * (FR-IN-7). The point listed FIRST in the emitted `set-collinear` is the one the solver prefers to
 * move, so "E on line AC" slides E (an on-circle/on-segment point) onto the line rather than A or C.
 */
/**
 * "AB עובר דרך מרכזי המעגלים" / "AB passes through the centres [of the circles]" (ADR-228 Am.4) — the line
 * through the two endpoints passes through the circle centres. Fires ONLY when A and B lie on DISTINCT
 * circles (so "the centres" resolves unambiguously to their two centres); a line through a single centre or
 * through free points is left to other rules. The emitted `set-line` is ORDERED **[A, centreOfA, centreOfB,
 * B]**: each endpoint sits at the FAR intersection of the centre line with its OWN circle (beyond its
 * centre), so A and B come out distinct — NOT collapsed onto the tangency point E, which lies on the centre
 * line AND on both circles (the degenerate reading). This is the "find a different option when points would
 * coincide" principle (ADR-123) realised structurally by the order. Draws the segment AB too (FR-IN-7).
 */
const lineThroughCenters: Rule = (s, ctx) => {
  if (!/(?:עובר[ת]?|passes|goes)/i.test(s)) return null;
  const m = s.match(/^\s*(?:(?:the\s+)?(?:line|ה?ישר|ה?קו)\s+)?([A-Z]\d*)\s*([A-Z]\d*)\b/);
  if (!m) return null;
  const A = up(m[1]), B = up(m[2]);
  if (A === B) return null;
  const circleOf = (p: string): string | undefined => ctx.circleMembers?.find((e) => e.points.map(up).includes(p))?.center;
  const cA = circleOf(A), cB = circleOf(B);
  if (!cA || !cB || up(cA) === up(cB)) return null; // A and B must lie on DISTINCT circles
  // The utterance must say it goes through the CENTRES — either the word "centre(s)"/"מרכז" ("…מרכזי
  // המעגלים") OR by NAMING both centre labels after "through" ("AB עובר דרך O1 ו O2"). Either way the
  // membership fixes the order, so both phrasings collapse to the same ordered set-line.
  const afterThrough = s.replace(/^.*?(?:עובר[ת]?|passes|goes)(?:\s+through)?/i, '');
  const namesBothCentres = new RegExp(`\\b${up(cA)}\\b`).test(afterThrough.toUpperCase()) && new RegExp(`\\b${up(cB)}\\b`).test(afterThrough.toUpperCase());
  if (!/מרכז|cent(?:er|re)/i.test(s) && !namesBothCentres) return null;
  return [
    { type: 'segment', a: A, b: B },
    { type: 'set-line', points: [A, up(cA), up(cB), B] }, // ordered ⇒ A, B at the far ends (not the touch point)
  ];
};

/**
 * A DASH-separated ordered collinear list — "A-O1-O2-B" / "ישר A-O1-O2-B" (ADR-228 Am.4). The dashes make
 * the order explicit (the most direct way to say "these points are collinear, in this order"), so it lowers
 * to `set-line` and draws the spanning segment (first→last). 3+ labels, each distinct. A 2-label "A-B" is
 * left alone (that's a segment, handled elsewhere).
 */
const dashCollinear: Rule = (s) => {
  const m = s.match(/^\s*(?:(?:the\s+)?(?:line|ה?ישר|ה?קו)\s+)?([A-Z]\d*(?:\s*-\s*[A-Z]\d*){2,})\s*$/);
  if (!m) return null;
  const pts = m[1].match(/[A-Z]\d*/g)?.map(up) ?? [];
  if (pts.length < 3 || new Set(pts).size !== pts.length) return null; // 3+ DISTINCT labels
  return [
    { type: 'segment', a: pts[0], b: pts[pts.length - 1] },
    { type: 'set-line', points: pts },
  ];
};

const collinearConstraint: Rule = (s) => {
  // A NEW point named into a collinearity ("G on line BD" where G doesn't exist yet) must be CREATED —
  // a free point the `set-collinear` then drives onto the line (2 DOF − 1 constraint = a slider,
  // ADR-052). Emitting the constraint alone referenced a point nothing defines: headless replay crashed
  // in `constraintIsPending` (residual over a missing position) and the app path escalated a perfectly
  // readable utterance (T1 wiring finding, ADR-236). `ifAbsent` makes it existence-agnostic — the parse
  // context may not know the point (unit/harness callers), and apply skips it when the id exists.
  const ensure = (P: Id): AnyCommand[] => [{ type: 'free-point', id: P, x: 3, y: 2, free: true, ifAbsent: true }];
  // "line ABE" / "ישר ABE" / "line ABEF" — three or more points collinear AND IN ORDER (B between A and
  // E). Uppercase labels only (so a lowercase word like "through" isn't read as labels), the whole tail
  // after the keyword. Emits one `set-line` (collinearity + order). Two labels ("line AB") fall through.
  const lineN = s.match(/^\s*(?:the\s+)?(?:line|ה?ישר|ה?קו)\s+((?:[A-Z]\d*\s*){3,})$/);
  if (lineN) {
    const pts = lineN[1].match(/[A-Z]\d*/g)?.map(up) ?? [];
    if (pts.length >= 3) return [{ type: 'set-line', points: pts }];
  }
  // "line QR passes through P" / "(ה)ישר QR עובר [דרך/בנקודה] P" — drive a point OF the line (Q/R) onto P.
  const through = s.match(
    /(?:line|ה?ישר|ה?קו)\s+([A-Za-z]\d*)\s*([A-Za-z]\d*)\s+(?:עובר[ת]?|passes(?:\s+through)?|goes\s+through|through)\s*(?:דרך|בנקודה|נקודה|ב-?|the\s+point|point|at|in)?\s*([A-Za-z]\d*)\b/i,
  );
  if (through) {
    const [Q, R, P] = [up(through[1]), up(through[2]), up(through[3])];
    return [
      ...ensure(P),
      { type: 'segment', a: Q, b: R },
      { type: 'set-collinear', a: Q, b: R, c: P },
    ];
  }
  // "P on line QR" / "P על (ה)ישר QR" — slide P onto the line through Q and R (P listed first → driven).
  const onLine = s.match(
    /([A-Za-z]\d*)\s+(?:is\s+|lies\s+)?(?:on|על|נמצאת?\s+על)\s+(?:the\s+)?(?:line|ה?ישר|ה?קו)\s+(?:through\s+|דרך\s+)?([A-Za-z]\d*)\s*(?:and\s+|ו-?\s*)?([A-Za-z]\d*)\b/i,
  );
  if (onLine) {
    const [P, Q, R] = [up(onLine[1]), up(onLine[2]), up(onLine[3])];
    return [
      ...ensure(P),
      { type: 'segment', a: Q, b: R },
      { type: 'set-collinear', a: P, b: Q, c: R },
    ];
  }
  // "A, B, C collinear" / "A B C על ישר אחד / על אותו ישר / קו אחד".
  if (/\bcollinear\b|same\s+line|on\s+one\s+line|על\s+(?:אות[הו]\s+)?(?:ישר|קו)(?:\s+אחד|\s+אחת)?|אות[הו]\s+(?:ישר|קו)/i.test(s)) {
    const ids = labelRun(s.replace(/collinear|are|lie\s+on|על|אות[הו]|ה?ישר|ה?קו|אחד|אחת|same|one|line|,/gi, ' '), 3);
    if (ids) return [{ type: 'set-collinear', a: ids[0], b: ids[1], c: ids[2] }];
  }
  return null;
};

/** "point A at (0,0)" / "נקודה A ב-(0,0)" / "A = (3, 4)" */
const freePoint: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:point\s+|נקודה\s+|place\s+)?([A-Za-z]\d*)\s*(?:at|ב-?|=)\s*\(?\s*${num}\s*,\s*${num}\s*\)?`,
      'i',
    ),
  );
  if (!m) return null;
  return [{ type: 'free-point', id: up(m[1]), x: parseFloat(m[2]), y: parseFloat(m[3]) }];
};

/**
 * "נקודה A" / "הוסף נקודה A" / "point A" / "add point A" — a BARE free point (2 DOF, ADR-052), NO
 * coordinates: placed in general position and positioned by the NEXT statement (issue #104). This was a
 * core primitive of the original model that the rebuild never re-exposed. Anchored end-to-end (`$`) so a
 * trailing relation ("נקודה A על AB", "point A on the circle") is claimed by the relational rules first,
 * and the נקודה/point keyword is REQUIRED so a lone letter ("C") stays escalation. Idempotent via
 * `ifAbsent` — re-declaring is a no-op, and naming an existing point is a no-op statement (M1), never a
 * redefinition. `free: true` hands the DOFs to the sampler, so "show another configuration" moves it and a
 * later constraint (`AB=5`, `∠…`) recruits it. Runs after the coordinate `freePoint` (which owns the
 * `נקודה A ב-(0,0)` form) so an explicit placement is never swallowed as a bare point.
 */
const bareFreePoint: Rule = (s) => {
  const m = s.match(/^\s*(?:הוסף\s+|add\s+)?(?:ה?נקודה|point)\s+([A-Za-z]\d*)\s*$/i);
  if (!m) return null;
  return [{ type: 'free-point', id: up(m[1]), x: 3, y: 2, free: true, ifAbsent: true }];
};

// ── Phase 5c — circles ──────────────────────────────────────────────────────

// The default concrete radius a circle takes when none is given numerically (incl. a symbolic "radius R").
const RADIUS_DEFAULT = 5;
const RADIUS_WORD = String.raw`(?:radius|רדיוס\S*)`;
/**
 * Read a circle's radius from "radius 5" (numeric) or "radius R"/"radius r" (the reserved
 * radius symbol — ADR-034). A symbol pins the variable R to the concrete default radius via
 * a `set-var`, so a later "AC = 1.6R" resolves to |AC| = 1.6·radius while still labelling "1.6R".
 */
const parseRadius = (s: string): { radius: number; numeric: boolean; symbolic: boolean; sym?: string; varCmd?: SymbolicCommand } => {
  // A QUOTIENT radius — "רדיוס 35/√32", "שרדיוסו √32/5" (#77, the shared NUMEXPR atom). Checked BEFORE the
  // bare-number form, which would otherwise read "רדיוס 35" and silently drop the "/√32".
  const rFrac = s.match(new RegExp(String.raw`${RADIUS_WORD}\s*(?:=|:|הוא|שווה|\bis\b)?\s*${NUMEXPR('r')}`, 'i'));
  if (rFrac && isNewValueForm(rFrac.groups!, 'r')) {
    const v = numexprVal(rFrac.groups!, 'r');
    if (v && v.value > 0) return { radius: v.value, numeric: true, symbolic: false };
  }
  const rNum = s.match(new RegExp(String.raw`${RADIUS_WORD}\s*${num}`, 'i'));
  if (rNum) return { radius: parseFloat(rNum[1]), numeric: true, symbolic: false };
  // A SYMBOLIC radius — any single letter, not only the reserved R/r (issue #54: "שרדיוסו T" names the
  // radius T). The letter (case kept — R vs r are different radii) is returned so the binding post-pass
  // can attach it to the circle the utterance creates/references; the radius stays a free DOF.
  const rVar = s.match(new RegExp(String.raw`${RADIUS_WORD}\s*(?:is\s+|הוא\s+)?(?:=\s*)?([A-Za-z])(?![A-Za-z\d])`));
  if (rVar) return { radius: RADIUS_DEFAULT, numeric: false, symbolic: true, sym: rVar[1], varCmd: { type: 'set-var', name: RADIUS_VAR, value: RADIUS_DEFAULT } };
  const sized = circleSizeRadius(s);
  if (sized !== null) return { radius: sized, numeric: true, symbolic: false };
  return { radius: RADIUS_DEFAULT, numeric: false, symbolic: false };
};

// He circumference forms, LONGEST first so the possessive suffix ("שהיקפו" = "whose circumference is") is
// consumed whole — matching just "היקף" would leave a dangling "ו" before the value. A circle's perimeter
// is its circumference.
const CIRCUMFERENCE_WORD = String.raw`(?:שהיקפו|היקפו|היקף|circumference|perimeter)`;
const AREA_WORD = String.raw`(?:ששטחו|שטחו|שטח|area)`;
/**
 * A circle SIZED by its circumference or area rather than its radius (ADR-228): "circumference 6π" /
 * "שהיקפו 6π" → r = C/2π; "area 9π" / "ששטחו 9π" → r = √(A/π). Both reduce to a NUMERIC radius (a circle's
 * size IS its radius), so they flow through the same fixed-radius path as "radius 5". The stated value may
 * carry a π factor ("6π") or be a plain number, and may follow a copula ("= 6π", "הוא 6π", "is 6π") or sit
 * glued right after the possessive ("שהיקפו 6π"). Returns the derived radius, or null when absent. Only ever
 * called from the `circle` rule (circle context guaranteed; a POLYGON area/perimeter is claimed earlier).
 */
const circleSizeRadius = (s: string): number | null => {
  const readVal = (after: string): number | null => {
    // copula-anchored first — skips a digit-bearing circle label ("circle O2 is 6π") the glued form would
    // misread; else the number glued right after the possessive suffix ("שהיקפו 6π").
    // The π factor is written as the glyph π OR the word "pi" (the toolbar inserts π; a student types "6pi").
    // GREEK_WORDS deliberately omits "pi" (it collides with a segment "PI"), but right after a circumference/
    // area keyword + number the context is unambiguous, so accept it here (ADR-228 Am.).
    const cop = after.match(new RegExp(String.raw`(?:=|הוא|שווה|\bis\b|\bequals?\b|:)\s*(${COEF})\s*[*·]?\s*(π|pi)?`, 'i'));
    const glued = after.match(new RegExp(String.raw`^\s*(${COEF})\s*[*·]?\s*(π|pi)?`, 'i'));
    // COPULA-LESS with the circle named between keyword and value — "היקף מעגל O1 6π" (the operator typed it
    // twice; it fell to the LLM). The keyword is behind us, so "circle-word? + ONE label + number" is safe.
    const named = after.match(new RegExp(String.raw`^\s*(?:circle|מעגל)?\s*[A-Z]\d*\s+(${COEF})\s*[*·]?\s*(π|pi)?`, 'i'));
    const m = cop ?? glued ?? named;
    if (!m) return null;
    return parseFloat(m[1]) * (m[2] ? Math.PI : 1);
  };
  // A circle SIZED by its DIAMETER — "diameter 10" / "מעגל קוטר 10" / "מעגל בקוטר 10" (r = d/2). The value
  // must follow the diameter word directly (optionally via a copula), with NO endpoint label between them —
  // that keeps this DISTINCT from the diameter-CHORD "קוטר AB" (labelled, no size), which the diameter rule
  // owns. A circle's size IS its radius, so this reduces to the same numeric-radius path as circumference/area.
  const dm = s.match(
    new RegExp(String.raw`(?:diameter|בקוטר|שקוטרו|קוטרו|קוטר)\s*(?:של|=|:|הוא|שווה|\bis\b|equals?)?\s*(${COEF})\s*[*·]?\s*(π|pi)?`, 'i'),
  );
  if (dm) {
    const v = parseFloat(dm[1]) * (dm[2] ? Math.PI : 1);
    if (v > 0) return v / 2;
  }
  const cm = s.match(new RegExp(CIRCUMFERENCE_WORD, 'i'));
  if (cm) {
    const v = readVal(s.slice(cm.index! + cm[0].length));
    if (v !== null && v > 0) return v / (2 * Math.PI);
  }
  const am = s.match(new RegExp(AREA_WORD, 'i'));
  if (am) {
    const v = readVal(s.slice(am.index! + am[0].length));
    if (v !== null && v > 0) return Math.sqrt(v / Math.PI);
  }
  return null;
};

/**
 * "O is the centre of the circle" / "O מרכז המעגל" / "מרכז המעגל הוא נקודה O" — NAME an EXISTING circle's
 * auto-hidden centre, revealing it (FR-RN-8: a named centre always shows). The student didn't draw a new
 * circle, they put a name on the one already there (so they can reference it, e.g. "OB radius"). Distinct
 * from `circle` (CREATION): fires only when the named centre ALREADY belongs to a circle in the figure —
 * then it emits `name-center` (the engine flips that circle's `autoCenter` off, leaving the radius alone).
 * With NO such circle it bows out so `circle` creates one (the opener "O מרכז המעגל" with no circle yet);
 * a different existing centre label would be a rename (a store op) and also defers. Not an incircle /
 * through / radius / inscribe phrasing (those rules own those). [ADR-148 #2, finally addressed.]
 */
const nameCenter: Rule = (s, ctx) => {
  if (!/cent(?:er|re)|מרכז/i.test(s) || !mentionsCircle(s)) return null;
  if (isCircleInPolygon(s)) return null; // incircle ("circle inscribed in …")
  if (/inscrib\w*|חסום|חוסם|through|העובר|דרך|radius|רדיוס|=|\bon\b|על(?=\s|$)/i.test(s)) return null; // creation / other constructs
  const x = circleCenter(s);
  if (!x) return null;
  const X = up(x);
  // Must be JUST "the centre is X" — nothing geometric remains after stripping the centre/circle words, the
  // label, copulas, and the descriptor noun. Otherwise it's a richer phrasing for another rule.
  const leftover = s
    .replace(/cent(?:er|re)|ה?מרכז/gi, ' ')
    .replace(/circles?|ה?מעגל\w*/gi, ' ') // strip the definite article too, else "המעגל" leaves a dangling "ה"
    .replace(new RegExp(String.raw`\b${X}\b`, 'gi'), ' ')
    .replace(/\bpoint\b|הוא|היא|הינו|ה?נקוד[הת]|של/gi, ' ')
    .replace(FILLER, ' ')
    .trim();
  if (leftover) return null;
  const circles = (ctx.circles ?? []).map(up);
  if (circles.includes(X)) return [{ type: 'name-center', center: X }]; // reveal the existing circle's centre
  return null; // no circle yet → `circle` creates circle-X; a different existing centre → rename, defer
};

/**
 * TWO CONCENTRIC CIRCLES — "שני מעגלים בעלי מרכז משותף O" / "two concentric circles centered at O" /
 * "two circles with a common center O" ([ADR-244](../../docs/06-decisions.md#adr-244), the bagrut Q6
 * family). Creates the PAIR: `circle-<C>` bound OUTER and `circle-<C>-2` bound INNER via
 * `set-radius-order`. Binding the roles at CREATION is pure gauge — two unnamed same-centre circles are
 * interchangeable until first referenced — so it asserts nothing the student didn't say, and it makes
 * every later qualifier reference ("המעגל החיצוני/הפנימי", "the outer/inner circle") deterministic.
 * Both radii stay free DOFs seeded apart (ADR-052 — the sizes and their ratio are the student's to
 * state, e.g. "OA=4"); the verifier + sampler keep inner strictly inside outer in every shown config.
 * Scope: a PAIR — max 2 circles per centre (operator decision, 2026-07-06); `ifAbsent` makes an
 * existing single circle at that centre the pair's outer (its stated size kept) and a re-statement
 * idempotent. Without this rule the En phrasing HALF-PARSED to one circle (the plain `circle` rule
 * dropped "two") and the He phrasing dead-ended at the LLM, whose canonical grammar had no way to say
 * it — the second circle command it improvised collapsed into a RESIZE of the first (identity = centre
 * letter, the root cause).
 */
const concentricCircles: Rule = (s, ctx) => {
  if (!/circles?|מעגל/i.test(s)) return null;
  const he = /שני\s+ה?מעגלים|2\s+מעגלים/.test(s) && /מרכז\s+משותף|אותו\s+ה?מרכז/.test(s);
  const heConcentric = /מעגלים\s+קונצנטריים/.test(s);
  const en =
    /\bconcentric\s+circles\b/i.test(s) ||
    (/\btwo\s+circles\b/i.test(s) && /common\s+cent(?:er|re)|same\s+cent(?:er|re)/i.test(s));
  if (!he && !heConcentric && !en) return null;
  // The centre letter: right after "משותף"/"קונצנטריים", or via the shared centre reader ("centered at O",
  // "common center O" — `cent\w*` covers it). Unnamed → auto-assigned and hidden until used (FR-RN-8).
  const m = s.match(/(?:משותף|קונצנטריים)\s+([A-Za-z]\d*)(?![A-Za-z])/);
  const named = m ? m[1] : circleCenter(s);
  const center = named ?? freeLabel(ctx.points ?? [], ['O', 'P', 'Q', 'K']);
  const outer = circleId(center);
  const inner = `${outer}-2`;
  const auto = named ? {} : { autoCenter: true as const };
  return [
    // Distinct free-radius seeds so the pair never draws coincident (the same reason twoCirclesMeet seeds apart).
    { type: 'circle', id: outer, center: up(center), radius: RADIUS_DEFAULT, freeRadius: true, ifAbsent: true, ...auto },
    { type: 'circle', id: inner, center: up(center), radius: RADIUS_DEFAULT * 0.55, freeRadius: true, ifAbsent: true, ...auto },
    { type: 'set-radius-order', outer, inner },
  ];
};

/** "circle centered at O radius 5" / "circle O radius R" / "מעגל שמרכזו O רדיוסו 5". */
const circle: Rule = (s, ctx) => {
  if (!/circle|מעגל/i.test(s)) return null;
  // A "circle inscribed in a polygon" (incircle) names a centre too ("O מרכז המעגל החסום בטרפז"); now that
  // `circleCenter` is order-independent it would resolve O here and create a PLAIN circle, stealing the
  // incircle utterance. Defer the incircle phrasing to the `incircle` rule.
  if (isCircleInPolygon(s)) return null;
  const r = parseRadius(s);
  const thrM = s.match(/(?:through|העובר\s*דרך|דרך)\s+([A-Za-z]\d*)\b/i);
  const centered = /cent(?:er|re)d?|around|מרכז\w*|סביב/i.test(s);
  const named = circleCenter(s); // the centre the student named ("circle O" / "centered at O"), or null
  // `centered` alone is NOT a circle definition unless a centre is actually NAMED ("מעגל שמרכזו O"):
  // a REFERENCE to an existing circle's centre — "מרכז המעגל" / "the centre of the circle", no letter —
  // must not auto-create a phantom circle (operator: "ישר AD עובר דרך מרכז המעגל" built a stray circle P).
  const isDef = r.numeric || r.symbolic || !!thrM || (centered && !!named);
  if (!isDef) {
    // No radius/centre/through given. A STANDALONE "circle" / "מעגל" / "circle O" is a circle request →
    // draw a default one. But "A on circle O" (another label remains) or "draw a circle somewhere"
    // (words remain) is not standalone → defer to the right rule / escalate. Strip the circle word, the
    // named centre, and filler; if anything meaningful is left, it's not a standalone circle.
    const leftover = s
      .replace(/circles?|מעגל\w*/gi, ' ')
      .replace(named ? new RegExp(String.raw`\b${named}\b`, 'gi') : /,^/, ' ')
      .replace(FILLER, ' ')
      .trim();
    if (leftover) return null;
  }
  // An UNNAMED centre is auto-assigned and HIDDEN unless used (FR-RN-8); a named centre is shown.
  const center = named ?? freeLabel(ctx.points ?? [], ['O', 'P', 'Q', 'K']);
  const auto = !named;
  if (thrM && !r.numeric && !r.symbolic) return [{ type: 'circle-through', id: circleId(center), center: up(center), through: up(thrM[1]), ...(auto ? { autoCenter: true } : {}) }];
  // No NUMERIC size was stated ⇒ the radius is a free DOF seeded at the default, not a fixed value
  // (ADR-052, the no-assumptions principle): the student gave a circle, not a size. A SYMBOLIC radius
  // "R" is an UNKNOWN magnitude too — also free — that R then DENOTES; R is left UNVALUED (no set-var)
  // so a later "AB = √2R" couples to the free-radius DOF via the radius-circle machinery (ADR-071)
  // instead of freezing it to the default. Only a NUMERIC radius ("radius 5") is fixed.
  const freeRadius = !r.numeric;
  // A size ADJECTIVE at creation («מעגל קטן…» / "a small circle") shapes the STARTING radius only —
  // small draws smaller (the twoCirclesMeet 0.72 seed split), so the default view matches the words and
  // a later definite «המעגל הקטן» assignment (issue #102) reads the intended circle. Sizes stay free
  // DOFs (ADR-052); a numeric radius wins.
  const adj = !r.numeric ? (/מעגל\s+קטן|\bsmall(?:er)?\s+circle/i.test(s) ? 0.72 : 1) : 1;
  return [{ type: 'circle', id: circleId(center), center: up(center), radius: r.radius * adj, ...(freeRadius ? { freeRadius: true } : {}), ...(auto ? { autoCenter: true } : {}) }];
};

/**
 * A SIZE statement (set a circle's radius / circumference / area) owns only its size vocabulary. When a
 * CONSTRUCTION-significant word survives after that vocabulary, the labels, and the value are stripped,
 * the utterance is a construction statement that merely CARRIES a size clause — "משולש ADO חסום במעגל
 * שרדיוסו 5" is an inscription, and claiming it as a size statement resizes a BYSTANDER circle (the
 * vertex letter O resolved as a known centre) while silently dropping the stated inscription (issue #53's
 * numeric sibling; the ADR-024 leftover-guard discipline, never a keyword bow-out). The size rules defer,
 * so the construction rules — and the honesty gates behind them — own the utterance.
 */
const sizeStatementLeftover = (s: string): boolean =>
  SHAPE_LEFTOVER.test(
    s
      .replace(/radius|radii|רדיוס\S*|circles?|מעגל\w*|circumference|perimeter|area|שהיקפו|היקפו|היקף|ששטחו|שטחו|שטח|נתון|הוא|=/gi, ' ')
      .replace(/[A-Z]\d*/g, ' ')
      .replace(/\d+(?:\.\d+)?|π/g, ' ')
      .replace(FILLER, ' '),
  );

/**
 * "the radius of circle P is 4" / "רדיוס מעגל P הוא 4" / "radius of P = 4" — set an EXISTING circle's radius
 * to a value, with NO segment drawn and NO point invented (ADR-087). Distinct from circle CREATION
 * ("circle O radius 5"): fires only when the named circle ALREADY EXISTS — otherwise it falls through to
 * `circle`. The circle is named ("circle P" / "מעגל P"), a bare label that is a known circle centre, or
 * the single circle in context. The engine sizes it by flexing the figure (an incircle stays the incircle).
 */
const setRadius: Rule = (s, ctx) => {
  if (!/radius|רדיוס/i.test(s)) return null;
  if (sizeStatementLeftover(s)) return null; // a construction carrying a size clause — not a size statement
  const valM = s.replace(/[A-Z]\d*/g, ' ').match(new RegExp(num)); // value with circle labels (e.g. P1) stripped first
  if (!valM) return null; // a magnitude must be given
  let center = circleCenter(s);
  if (!center) {
    const labels = (s.match(/[A-Z]\d*/g) ?? []).map(up);
    center = (ctx.circles ?? []).find((c) => labels.includes(up(c))) ?? (ctx.circles?.length === 1 ? ctx.circles[0] : null);
  }
  if (!center || !(ctx.circles ?? []).some((c) => up(c) === up(center))) return null; // EXISTING circle only (creation → `circle`)
  return [{ type: 'set-radius', circle: circleId(center), value: parseFloat(valM[1]) }];
};

/**
 * "רדיוס מעגל O הוא R" / "radius of circle P is r" — NAME an EXISTING circle's radius with a letter
 * (issue #54; the operator's requested after-the-fact binding form). Pure data (`radius-symbol` stamps
 * the circle object): the radius stays a free DOF; the letter becomes referenceable in relations
 * ("R = 1.5r", "R > r") and measures ("AB = √2R" couples to THIS circle). Distinct from `setRadius`
 * (numeric value, which runs first) — here the RHS is a bare single letter. The circle is named, or
 * the single circle in context. Only the radius-of-circle reference may precede the copula — anything
 * else is a compound (defer).
 */
const radiusSymbolStatement: Rule = (s, ctx) => {
  if (!/radius|רדיוס/i.test(s)) return null;
  if (sizeStatementLeftover(s)) return null; // a construction carrying a size clause — not a naming statement
  const m = s.match(/(?:הוא|היא|=|\bis\b)\s*([A-Za-z])\s*\.?\s*$/);
  if (!m || m.index === undefined) return null;
  const head = s.slice(0, m.index);
  const center = circleCenter(head) ?? (ctx.circles?.length === 1 ? ctx.circles[0] : null);
  if (!center) return null;
  if (!(ctx.circles ?? []).some((c) => up(c) === up(center))) return null; // EXISTING circle only
  const leftover = head
    .replace(/radius|רדיוס\S*|circles?|ה?מעגל\w*|של/gi, ' ')
    .replace(new RegExp(String.raw`\b${center}\b`, 'gi'), ' ')
    .replace(FILLER, ' ')
    .trim();
  if (leftover) return null;
  return [{ type: 'radius-symbol', circle: circleId(center), name: m[1] }];
};

/**
 * A RELATION between two bound radius symbols (issue #54): "R > r" (order — the ADR-244 requirement,
 * independent-circles edition), "R = 1.5r" (ratio, product form; k may carry the ADR-298 √ arithmetic),
 * "R/r = 2√7/5" (ratio, quotient form). Both letters must already be BOUND radius symbols in the
 * figure (case-sensitive — the bagrut's R vs r), else the rule defers: a comparison of unbound letters
 * is not a radius statement. Runs before `measureOrder` (which would silently no-op unbound
 * lowercase-only pairs) — though its uppercase-R forms never matched there anyway.
 */
const radiusRelation: Rule = (s, ctx) => {
  const syms = new Map((ctx.radiusSymbols ?? []).map((r) => [r.name, r]));
  if (syms.size === 0) return null;
  const order = s.match(/^\s*([A-Za-z])\s*(>=|<=|>|<|≥|≤)\s*([A-Za-z])\s*$/);
  if (order) {
    const a = syms.get(order[1]);
    const b = syms.get(order[3]);
    if (!a || !b || a.circle === b.circle) return null;
    const bigLeft = order[2] === '>' || order[2] === '≥' || order[2] === '>=';
    return [{ type: 'set-radius-order', outer: (bigLeft ? a : b).circle, inner: (bigLeft ? b : a).circle }];
  }
  // Both forms state the SAME relation — radius(lhs) = k · radius(rhs): "R = k·r" directly, "R/r = k"
  // by multiplying through.
  const bind = (lhs: string | undefined, rhs: string | undefined, g: Record<string, string | undefined>): AnyCommand[] | null => {
    const a = lhs ? syms.get(lhs) : undefined;
    const b = rhs ? syms.get(rhs) : undefined;
    const v = numexprVal(g, 'k');
    if (!a || !b || a.circle === b.circle || !v || v.value <= 0) return null;
    return [{ type: 'set-radius-ratio', c1: a.circle, c2: b.circle, k: v.value }];
  };
  const prod = s.match(new RegExp(String.raw`^\s*(?<lhs>[A-Za-z])\s*=\s*${NUMEXPR('k')}\s*[·*]?\s*(?<rhs>[A-Za-z])\s*$`));
  if (prod) return bind(prod.groups!.lhs, prod.groups!.rhs, prod.groups!);
  const quot = s.match(new RegExp(String.raw`^\s*(?<lhs>[A-Za-z])\s*\/\s*(?<rhs>[A-Za-z])\s*=\s*${NUMEXPR('k')}\s*$`));
  if (quot) return bind(quot.groups!.lhs, quot.groups!.rhs, quot.groups!);
  return null;
};

/**
 * A circumference or area given on an EXISTING circle (ADR-228 Am.): "היקף מעגל O1 הוא 6π" / "the area of
 * circle O is 9π" SETS that circle's radius (r = C/2π or √(A/π)) via `set-radius` — flexing the circle in
 * place. Mirrors `setRadius` (which does the same for a numeric "radius = 4"), and reuses the same
 * `circleSizeRadius` the `circle` CREATION rule uses. Fires ONLY when the circle already exists: without it,
 * `circle` would re-emit a `circle` command for the same id, which `addObj` ignores (keeps the first
 * definition) — silently dropping the stated size, exactly the operator's "it won't let me set the
 * circumference" bug. A NEW circle sized this way still flows through `circle`. Runs before `circle`.
 */
const circleSizeExisting: Rule = (s, ctx) => {
  const r = circleSizeRadius(s);
  if (r === null) return null; // no circumference/area value present
  if (sizeStatementLeftover(s)) return null; // a construction carrying a size clause — not a size statement
  // Resolve the target circle: "מעגל X", else a bare label that is a KNOWN circle — so "שטח O2 הוא 81π"
  // (the area of circle O2, no "מעגל" word) also sets its radius, not just "שטח מעגל O2 …" (mirrors how
  // `setRadius` resolves a bare circle label). A polygon area ("שטח ABC", 3–4 vertices) is claimed earlier
  // by the `area` rule and never reaches here; a label that is NOT a known circle bows out.
  let center = circleCenter(s);
  if (!center) {
    // UPPERCASE labels only — a point/circle label is always uppercase, so this can't grab a stray letter
    // from a lowercase keyword ("perimeter of …" → the "o" of "of" must NOT resolve circle O).
    const labels = (s.match(/[A-Z]\d*/g) ?? []).map(up);
    center = (ctx.circles ?? []).map(up).find((c) => labels.includes(c)) ?? null;
  }
  if (!center) return null;
  if (!(ctx.circles ?? []).some((c) => up(c) === up(center))) return null; // not existing → `circle` creates it
  return [{ type: 'set-radius', circle: circleId(center), value: r }];
};

/**
 * "OB רדיוס" / "רדיוס OB" / "הוסף רדיוס OB" — declare the segment from a circle's CENTRE to a point ON it
 * (a drawn radius): the rim point goes on the circle and the centre→rim segment is drawn. Distinct from
 * `setRadius` (sets the radius VALUE — needs a number) and `circle` (creates a circle — needs "מעגל"). Fires
 * only for a BARE radius declaration whose two labels include an existing circle's centre, so it never
 * disturbs "D אמצע הרדיוס OB" (a midpoint — claimed earlier) or "radius … = 5" (a value).
 */
const radiusSegment: Rule = (s, ctx) => {
  if (!/\bradius\b|רדיוס/i.test(s)) return null;
  if (parseRadius(s).numeric) return null; // a numeric radius → `setRadius` / `circle`
  if (/אמצע|midpoint|=|⊥|⟂|∥|אנ[כך]|מאונ[כך]|מקביל|\bon\b|על(?=\s|$)/i.test(s)) return null; // not a bare radius declaration (a point ON the radius → pointOnSegment)
  const circles = (ctx.circles ?? []).map(up);
  if (!circles.length) return null; // a radius needs a circle to belong to
  const body = dropCircleRef(s).replace(/\bradius\b|רדיוס|\badd\b|הוסף|\bdraw\b|צייר|\bin\b|circle|מעגל/gi, ' ');
  const ids = labelRun(body, 2);
  if (!ids) return null;
  const [x, y] = [up(ids[0]), up(ids[1])];
  const centre = circles.includes(x) ? x : circles.includes(y) ? y : null;
  if (!centre || x === y) return null;
  const rim = centre === x ? y : x;
  return [
    { type: 'point-on-circle', id: rim, circle: circleId(centre) },
    { type: 'segment', a: centre, b: rim },
  ];
};

/**
 * Vertex angles (degrees, around the centre) for each *cyclic* polygon, in
 * vertex order A,B,C,D. A polygon is built by placing its vertices on the circle
 * at these angles; the shape comes from the angles (the edges just connect them).
 * `null` = no constraint, spread the vertices evenly (any triangle / general quad
 * is cyclic). A cyclic rhombus is a square; a general trapezoid isn't cyclic, but
 * an isosceles one is (symmetric about a diameter) — so "inscribed trapezoid"
 * builds the isosceles one.
 */
/** A generic CONVEX cyclic quad: four vertices in cyclic order at irregular angles (so it
 *  reads as a general cyclic quadrilateral, not a square). Convex order is what makes the
 *  opposite-angles-sum-to-180° theorem hold — a golden-angle spread interleaves them (crossed). */
const CYCLIC_QUAD_ANGLES = [30, 105, 195, 295];

const INSCRIBED_ANGLES: Record<string, number[] | null> = {
  // A SCALENE default spread (uneven gaps) so a general inscribed triangle is scalene, not equilateral —
  // and an EXPLICIT theta the sampler can perturb. Without a theta the vertices have nothing to vary, so the
  // triangle's shape was frozen across every "configuration" (an ADR-052 violation that also made the
  // relations layer report incidental angles as forced). The vertices are `free` (see `freeAngles`).
  triangle: [70, 175, 300],
  quad: null,
  'right-triangle': [180, 0, 90], // Thales: A,B antipodal (hypotenuse = diameter), C the right angle
  square: [45, 135, 225, 315],
  rhombus: [45, 135, 225, 315], // a cyclic rhombus is a square
  rectangle: [40, 140, 220, 320], // diagonals are diameters
  trapezoid: [215, 325, 60, 120], // isosceles: AB ∥ CD, symmetric about the vertical axis
  // A cyclic kite is a RIGHT kite (axis = a diameter): A/C on the vertical axis, B/D mirrored across it
  // (|AB|=|AD|, |CB|=|CD| at the start); the vertices stay FREE and the kite `shape-variant` carries the
  // equal pairs as constraints, so later givens flex it without losing the kite (ADR-236).
  kite: [90, 340, 270, 200],
};

/** The polygon words an inscription statement can name, one alternation per language — shared by the
 *  container-marker and order tests below so the list can't drift between them (a missing word here
 *  mis-routed "מעגל חסום בדלתון" to the CONVERSE — the kite inscribed in a circle). */
const POLY_WORDS_EN = String.raw`triangle|quad\w*|square|rectangle|rhombus|trapez\w*|parallelogram|kite|polygon`;
const POLY_WORDS_HE = 'משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|מקבילית|דלתון|מצולע';

/**
 * Is this a *circle* inscribed in a *polygon* (the incircle), rather than a
 * polygon inscribed in a circle? The CONTAINER is the noun carrying the "in"
 * preposition — Hebrew's ב prefix ("מעגל חסום במשולש", "במרובע ABCD חסום מעגל")
 * or English "in [a/the] …" — wherever it sits in the sentence. Word ORDER is
 * only a proxy for this: Hebrew passives invert freely (the bagrut-standard
 * "במרובע ABCD חסום מעגל" puts the container FIRST), and the old order test
 * flipped the roles on every inverted phrasing, silently building the CONVERSE
 * figure. Order remains the fallback when neither noun carries a marker
 * ("incircle of ABC") or both do.
 */
const isCircleInPolygon = (s: string): boolean => {
  // Hebrew: the ב prefix binds directly (במשולש, בטרפז — stacked prefixes like שבמרובע still contain it);
  // "בתוך ה…" (inside the …) is the spelled-out form. English: "in/inside [a/an/the] <noun>".
  const polyContainer = new RegExp(
    String.raw`(?:ב|בתוך\s+ה?)(?:${POLY_WORDS_HE})|\bin(?:side)?\s+(?:an?\s+|the\s+)?(?:${POLY_WORDS_EN})`,
    'i',
  ).test(s);
  const circContainer = /(?:ב|בתוך\s+ה?)מעגל|\bin(?:side)?\s+(?:an?\s+|the\s+)?circle/i.test(s);
  if (polyContainer !== circContainer) return polyContainer;
  const circIdx = s.search(/incircle|\bcircle\b|מעגל/i);
  const polyIdx = s.search(new RegExp(`${POLY_WORDS_EN}|${POLY_WORDS_HE}`, 'i'));
  return circIdx >= 0 && polyIdx >= 0 && circIdx < polyIdx;
};

/** "triangle ABC inscribed in circle O" / "טרפז ABCD חסום במעגל" — circle + on-circle vertices + edges. */
const inscribedPolygon: Rule = (s, ctx) => {
  if (!/inscrib\w*|חסום|בר[\s-]?חסימה|\bcyclic\b|concyclic/i.test(s)) return null; // inscribed / inscribable / cyclic / בר-חסימה
  if (isCircleInPolygon(s)) return null; // that's the incircle — handled by `incircle`, not here
  // "cyclic" / "בר חסימה" / "inscribable" = the vertices are CONCYCLIC (opposite angles sum to
  // 180°), but the circumscribing circle is NOT drawn — only the polygon. (vs "inscribed"/"חסום",
  // which draws the circle.)
  const hidden = /בר[\s-]?חסימה|\bcyclic\b|concyclic|inscribable/i.test(s);
  // A right triangle inscribed in a circle IS constructible (Thales — the
  // hypotenuse is a diameter, the right angle is on the circle): handle it.
  let kind =
    /right[\s-]?(?:angled\s+)?triangle|ישר[\s-]?זוו?ית/i.test(s) ? 'right-triangle'
    : /triangle|משולש/i.test(s) ? 'triangle'
    : /square|ריבוע/i.test(s) ? 'square'
    : /rectangle|מלבן/i.test(s) ? 'rectangle'
    : /rhombus|מעוין/i.test(s) ? 'rhombus'
    : /kite|דלתון|עפיפון/i.test(s) ? 'kite'
    : /trapez|טרפז/i.test(s) ? 'trapezoid'
    : /quad|מרובע/i.test(s) ? 'quad'
    : null;
  if (!kind) {
    // No explicit shape word ("ABCD חסום במעגל" / "ABCD בר חסימה") — infer from a bare label
    // run: 4 letters ⇒ quadrilateral, 3 ⇒ triangle. Keeps the inscribed-vs-cyclic distinction
    // deterministic (drawn vs hidden circle) instead of falling through to the LLM.
    const bare = dropCircleRef(s).replace(
      /inscrib\w*|חסום|בר[\s-]?חסימה|cyclic|concyclic|circle|מעגל|cent\w*|radius|רדיוס\S*|שמרכזו|מרכזו|העובר|דרך|\bin\b|\ba\b|\bthe\b/gi,
      ' ',
    );
    kind = labelRun(bare, 4) ? 'quad' : labelRun(bare, 3) ? 'triangle' : null;
  }
  if (!kind) return null;
  const isTri = kind === 'triangle' || kind === 'right-triangle';
  const n = isTri ? 3 : 4;
  // A NAMED triangle SHAPE on the inscribe — "equilateral/isosceles triangle inscribed in a circle"
  // ([ADR-117](docs/06-decisions.md#adr-117)). The inscribe places the vertices on the circle; the shape adds
  // the same equal-side relations the standalone macros (ADR-110) emit, so the constraint solver flexes the
  // inscribed triangle into shape. Was silently DROPPED: "שווה צלעות"/"equilateral" is not a SHAPE_LEFTOVER
  // token, so it parsed as a GENERIC inscribed triangle (no equal sides) rather than escalating.
  const triShape: 'equilateral' | 'isosceles' | null = isTri
    ? /equilateral|שווה[\s-]?צלעות/i.test(s)
      ? 'equilateral'
      : /isosceles|שווה[\s-]?שוקיים/i.test(s)
        ? 'isosceles'
        : null
    : null;
  const named = circleCenter(s); // may be null — "inscribed in a circle" need not name the centre
  const r = parseRadius(s);
  let rest = dropCircleRef(s).replace(
    /equilateral|שווה[\s-]?צלעות|isosceles|שווה[\s-]?שוקיים|right[\s-]?angled|right|triangle|משולש|ישר[\s-]?זוו?ית|זוו?ית|square|ריבוע|rectangle|מלבן|rhombus|מעוין|kite|דלתון|עפיפון|trapez\w*|טרפז|quad\w*|מרובע|inscrib\w*|חסום|בר[\s-]?חסימה|cyclic|concyclic|circle|מעגל|cent\w*|radius|רדיוס\S*|שמרכזו|מרכזו|העובר|דרך/gi,
    ' ',
  );
  if (named) rest = rest.replace(new RegExp(String.raw`\b${named}\b`, 'gi'), ' ');
  if (r.symbolic) rest = rest.replace(new RegExp(String.raw`\b[Rr]\b${r.sym && !/^[Rr]$/.test(r.sym) ? String.raw`|\b${r.sym}\b` : ''}`, 'g'), ' '); // the radius symbol is not a vertex (ADR-034; #54 — any bound letter)
  // The vertices the student named, or — when the shape word is explicit but UNLABELED ("מרובע חסום
  // במעגל" / "triangle inscribed in a circle") — auto-named A,B,C(,D), avoiding existing points and the
  // named centre. A PARTIAL label run (some letters but not n) stays a defer/escalate (a typo / compound).
  const ids =
    labelRun(rest, n) ??
    (namesVertices(rest)
      ? null
      : (existingPolygon(ctx, n) ?? autoVertexLabels(n, [...(ctx.points ?? []), ...(named ? [named] : [])])));
  if (!ids) return null;
  // After the circle, the shape, and the vertices are consumed, nothing
  // geometry-significant should remain — a constraint/extra construct means a
  // compound ("inscribed … with AB = 6") → escalate, don't half-parse.
  const leftover = ids.reduce(
    (a, id) => a.replace(new RegExp(String.raw`\b${id}\b`, 'gi'), ' '),
    rest.replace(new RegExp(String.raw`\b${ids.join('')}\b`, 'i'), ' '),
  );
  if (SHAPE_LEFTOVER.test(leftover)) return 'stop';
  // The equal-side relations for a named inscribed triangle shape (ADR-117), appended to whichever branch
  // builds the figure. Equilateral = both adjacent pairs equal; isosceles = a SOFT default |AB|=|AC| that
  // yields to an explicit pair (ADR-114), matching the standalone macros. Empty for a plain/quad inscribe.
  const shapeCmds = (v: Id[]): AnyCommand[] =>
    triShape === 'equilateral'
      ? [
          { type: 'set-equal', a: v[0], b: v[1], c: v[1], d: v[2] }, // |AB| = |BC|
          { type: 'set-equal', a: v[1], b: v[2], c: v[2], d: v[0] }, // |BC| = |CA|
        ]
      : triShape === 'isosceles'
        ? [{ type: 'set-equal', a: v[0], b: v[1], c: v[0], d: v[2], soft: true }] // default |AB| = |AC|
        : kind === 'trapezoid'
          ? // A trapezoid is DEFINED by AB ∥ CD. Encode it as a persistent constraint (not just the fixed
            // starting angles), so the property survives when a LATER given flexes the free on-circle vertices
            // (without it, a constraint like "BE=BC" slides a vertex off its angle and the trapezoid is lost —
            // the engine "forgets it's a trapezoid"). Cyclic + AB∥CD ⇒ isosceles automatically.
            [{ type: 'set-parallel', a: v[0], b: v[1], c: v[2], d: v[3] }]
          : [];
  // The base polygon + its named-shape relations, per branch. A KITE inscribes as its `shape-variant`
  // (which expands to the quadrilateral + the variant's equal ADJACENT pairs, axis cyclable/pinnable —
  // ADR-138), the same macro the standalone "kite ABCD" emits. Before this the kite word was silently
  // DROPPED — "kite ABCD inscribed in circle O" drew a GENERIC inscribed quad (the ADR-117 class, quad
  // edition: "kite"/"דלתון" is not a SHAPE_LEFTOVER token, so it neither constrained nor escalated).
  const basePlusShape = (v: Id[]): AnyCommand[] =>
    kind === 'kite'
      ? [{ type: 'shape-variant', shape: 'kite', ids: [v[0], v[1], v[2], v[3]], variant: 0 }]
      : [
          isTri
            ? { type: 'triangle', ids: [v[0], v[1], v[2]] }
            : { type: 'quadrilateral', ids: [v[0], v[1], v[2], v[3]] },
          ...shapeCmds(v),
        ];
  // No centre named ⇒ create one: a fresh label that doesn't clash with the vertices OR with any
  // point already in the figure (a second inscribed circle must not reuse the first's centre 'O').
  const center = named ?? freeLabel([...ids, ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['O', 'P', 'Q', 'K', 'S', 'T', 'U']);
  const circ = circleId(center);
  // Inscribing in an EXISTING named circle ("מרובע EBAD חסום במעגל O" where O is already drawn): do NOT
  // re-create the circle — that re-emits `circumcircle`/`circle` for circle-O and redefines its centre
  // ("'O' is already defined"). The intent is "these vertices lie on THIS circle": assert membership per
  // vertex (idempotent for a point already on it — an intersection / line∩circle — and converting a free
  // one to slide on it) and draw the polygon. Works whether the vertices pre-exist or are fresh.
  if (named != null && (ctx.circles ?? []).some((c) => up(c) === up(named))) {
    return [
      ...ids.map((id): AnyCommand => ({ type: 'point-on-circle', id, circle: circ })),
      ...basePlusShape(ids),
    ];
  }
  // Inscribing a polygon whose vertices ALREADY exist can't re-place them on a fresh circle
  // (that would detach them from their own definitions — A from segment CD, etc.). A triangle's
  // three existing points have a unique CIRCUMCIRCLE through them. A quad's four are generally NOT
  // concyclic, so a `concyclic` constraint drives a free DOF among them until they share one circle
  // (ADR-041); the circle is drawn ("inscribed"/חסום) or hidden ("cyclic"/בר-חסימה).
  const allExist = ids.every((id) => (ctx.points ?? []).includes(id));
  // IDEMPOTENT re-inscribe: if these points are ALREADY all on an existing circle, REUSE it — re-issuing the
  // inscribe must not mint a duplicate circumcircle with a fresh auto-centre (O→P→Q stacking on the same
  // circumcentre — the "O and P on the same point" bug). Only the shape is re-asserted (deterministic ids →
  // no duplicate). Skipped when the student named a DIFFERENT circle than the one they're on. [ADR-156]
  const onCircle = circleContaining(ctx, ids, named);
  if (allExist && onCircle && (!named || up(named) === up(onCircle))) {
    return basePlusShape(ids);
  }
  if (isTri && allExist) {
    return [{ type: 'circumcircle', id: circ, center: up(center), a: ids[0], b: ids[1], c: ids[2] }, ...shapeCmds(ids)];
  }
  if (allExist) {
    return [
      { type: 'circumcircle', id: circ, center: up(center), a: ids[0], b: ids[1], c: ids[2], ...(hidden ? { hidden: true } : {}) },
      { type: 'set-concyclic', points: ids },
      ...basePlusShape(ids), // a trapezoid keeps AB ∥ CD (a kite its equal pairs) even from existing points
    ];
  }
  // A cyclic (hidden-circle) quad needs CONVEX vertex order for the opposite-angles theorem;
  // the default general-quad spread (golden angle) would interleave the vertices into a
  // CROSSED quad. Use a convex, ordered angle set for ANY general quad — inscribed (drawn
  // circle) or cyclic (hidden) — so ABCD is always a proper convex quadrilateral.
  const angles = kind === 'quad' ? CYCLIC_QUAD_ANGLES : INSCRIBED_ANGLES[kind];
  // No NUMERIC radius ⇒ the circle's size is a free DOF (ADR-052) — playable/sampleable, not frozen at the
  // default. A SYMBOLIC "radius R" is also free, with R left UNVALUED so an "AB = √2R" couples to the
  // radius DOF (ADR-071); only a NUMERIC radius is fixed. (Matches the bare-`circle` rule.)
  const freeRadius = !r.numeric;
  const cmds: AnyCommand[] = [{ type: 'circle', id: circ, center: up(center), radius: r.radius, ...(freeRadius ? { freeRadius: true } : {}), ...(hidden ? { hidden: true } : {}), ...(named ? {} : { autoCenter: true }) }];
  // A GENERAL quad's vertex angles are UNSTATED (ADR-052) — the convex spread is only a STARTING
  // position, so the vertices stay FREE (samplable + drivable to a convex constraint-satisfying figure).
  // A RIGID cyclic shape (square/rect/rhombus) has angles INTRINSIC to the shape → fixed. A TRAPEZOID is
  // NOT rigid (its base ratio / height are unstated DOFs, ADR-052) and its only fixed property — AB ∥ CD —
  // is now carried by a `set-parallel` constraint (shapeCmds), so its vertices are FREE too: they keep the
  // isosceles starting angles but can flex to satisfy later givens while the parallel constraint persists.
  // A general TRIANGLE is also free (any triangle is cyclic — its 3 vertex angles are unstated DOFs, ADR-052);
  // a RIGHT-triangle inscribed stays fixed (its angles are pinned by Thales, kind 'right-triangle').
  const freeAngles = kind === 'quad' || kind === 'trapezoid' || kind === 'kite' || kind === 'triangle';
  ids.forEach((id, i) => {
    // specific angle for a shaped cyclic polygon (square/rect/rhombus/trapezoid) or the general quad's
    // convex-default start; omit for triangle so it spreads evenly via nextTheta.
    cmds.push(
      angles
        ? { type: 'point-on-circle', id, circle: circ, theta: (angles[i] * Math.PI) / 180, ...(freeAngles ? { free: true } : {}) }
        : { type: 'point-on-circle', id, circle: circ },
    );
  });
  // The edges connect the on-circle vertices; the SHAPE is set by the angles (+ the named-shape relations).
  cmds.push(...basePlusShape(ids));
  return cmds;
};

/** The engine command that CREATES a container polygon of a given word (when its vertices aren't yet drawn). */
const CONTAINER_CREATE: Record<string, (ids: Id[]) => Command> = {
  triangle: (ids) => ({ type: 'triangle', ids: [ids[0], ids[1], ids[2]] }),
  quad: (ids) => ({ type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] }),
  square: (ids) => ({ type: 'square', ids: [ids[0], ids[1], ids[2], ids[3]] }),
  rectangle: (ids) => ({ type: 'rectangle', ids: [ids[0], ids[1], ids[2], ids[3]] }),
  rhombus: (ids) => ({ type: 'rhombus', ids: [ids[0], ids[1], ids[2], ids[3]] }),
  parallelogram: (ids) => ({ type: 'parallelogram', ids: [ids[0], ids[1], ids[2], ids[3]] }),
  trapezoid: (ids) => ({ type: 'trapezoid', ids: [ids[0], ids[1], ids[2], ids[3]] }),
};

/** A polygon word → the generic container role: triangle (3 sides) vs quad (4 sides), plus the creation key. */
const containerRole = (word: string): { kind: 'triangle' | 'quad'; create: string } | null => {
  if (/triangle|משולש/i.test(word)) return { kind: 'triangle', create: 'triangle' };
  if (/square|ריבוע/i.test(word)) return { kind: 'quad', create: 'square' };
  if (/rectangle|מלבן/i.test(word)) return { kind: 'quad', create: 'rectangle' };
  if (/rhombus|מעוין/i.test(word)) return { kind: 'quad', create: 'rhombus' };
  if (/parallelogram|מקבילית/i.test(word)) return { kind: 'quad', create: 'parallelogram' };
  if (/trapez|טרפז/i.test(word)) return { kind: 'quad', create: 'trapezoid' };
  if (/quad|מרובע|kite|דלתון|עפיפון/i.test(word)) return { kind: 'quad', create: 'quad' };
  return null;
};

/** The inscribed SHAPE the utterance names (the 4 constrained quads that make an inscription determinate).
 *  Detected on `s` with the CONTAINER noun already stripped, so "rhombus inscribed in a square" reads the
 *  rhombus as the inner shape. A generic/unsupported inner (bare quad, triangle) → null. */
const innerShapeKind = (s: string): 'rhombus' | 'rectangle' | 'square' | 'parallelogram' | null =>
  /square|ריבוע/i.test(s) ? 'square'
  : /rectangle|מלבן/i.test(s) ? 'rectangle'
  : /rhombus|מעוין/i.test(s) ? 'rhombus'
  : /parallelogram|מקבילית/i.test(s) ? 'parallelogram'
  : null;

/**
 * "מעוין BDEF חסום במשולש ABC" / "rectangle inscribed in triangle ABC" — a POLYGON INSCRIBED IN A POLYGON
 * ([ADR-262](docs/06-decisions.md#adr-262)). Emits (optionally the container's own creation) + an `inscribe`
 * command; `replay` expands the inscribe to on-segment riders + the shape's constraints (see engine/inscribe.ts).
 * Runs BEFORE `incircle`/`inscribedPolygon` (both match "inscribed"/"חסום") and the base shape rules. The inner
 * shape and its container are told apart by the ב/"in" preposition, never word order (the ADR-245 principle).
 */
const inscribedInPolygon: Rule = (s, ctx) => {
  if (!/inscrib\w*|חסום/i.test(s)) return null;
  if (/circle|מעגל|incircle/i.test(s)) return null; // a circle is involved → the circle-inscription rules own it
  // The CONTAINER is the polygon carrying ב / "in [a/the]".
  const contRe = new RegExp(
    String.raw`(?:ב|בתוך\s+ה?)(${POLY_WORDS_HE})|\bin(?:side)?\s+(?:an?\s+|the\s+)?(${POLY_WORDS_HE}|${POLY_WORDS_EN})`,
    'i',
  );
  const cm = contRe.exec(s);
  if (!cm || cm.index === undefined) return null;
  const contWord = cm[1] ?? cm[2];
  const role = containerRole(contWord);
  if (!role) return null;
  // Container labels: the run of `contN` labels following the marker (works for both "…in triangle ABC" and
  // the inverted "במשולש ABC חסום …").
  const contN = role.kind === 'triangle' ? 3 : 4;
  const afterCont = s.slice(cm.index + cm[0].length);
  const contIds = labelRun(afterCont, contN) ?? existingPolygon(ctx, contN) ?? autoVertexLabels(contN, ctx.points ?? []);
  // The inner shape: read from the utterance with the container noun + its labels removed, so a same-family
  // container (rhombus in a rhombus) doesn't confuse the inner-shape detection.
  let inner = s.replace(cm[0], ' ');
  for (const id of contIds) inner = inner.replace(new RegExp(String.raw`\b${id}\b`, 'g'), ' ');
  const shape = innerShapeKind(inner);
  if (!shape) return 'stop'; // a polygon inscription we can't make determinate — escalate, never a plain-shape misparse
  // Inner shape labels (always a quad, n=4): the run after the shape word, or auto-named avoiding existing +
  // the container's labels (so an auto-named shape doesn't accidentally coincide with a container vertex).
  const taken = [...(ctx.points ?? []), ...contIds];
  const shapeWordRe = /square|ריבוע|rectangle|מלבן|rhombus|מעוין|parallelogram|מקבילית/i;
  const wm = shapeWordRe.exec(inner);
  const afterShape = wm ? inner.slice(wm.index + wm[0].length) : inner;
  const ids = labelRun(afterShape, 4) ?? autoVertexLabels(4, taken);

  const cmds: AnyCommand[] = [];
  const allExist = contIds.every((c) => (ctx.points ?? []).includes(c));
  if (!allExist) cmds.push(CONTAINER_CREATE[role.create](contIds)); // create the container unless it's already drawn (M1 reuse)
  cmds.push({ type: 'inscribe', shape, ids, container: contIds, containerKind: role.kind, variant: 0 });
  return cmds;
};

/** Polygon name → vertex count. "regular triangle/quadrilateral" route to equilateral/square. */
const POLY_NAME_N: Record<string, number> = {
  triangle: 3, quadrilateral: 4,
  pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10, hendecagon: 11, dodecagon: 12,
};
/** Hebrew polygon names (n ≥ 5). מחומש=5 משושה=6 משובע=7 משומן=8 מתושע=9 מעושר=10. */
const HE_POLY_NAME_N: Record<string, number> = {
  מחומש: 5, משושה: 6, משובע: 7, משומן: 8, מתושע: 9, מעושר: 10,
};
const POLY_STRIP =
  /regular|polygon|מצולע|משוכלל|equilateral|triangle|משולש|quadrilateral|מרובע|square|ריבוע|pentagon|hexagon|heptagon|octagon|nonagon|decagon|hendecagon|dodecagon|מחומש|משושה|משובע|משומן|מתושע|מעושר|\d+\s*-?\s*gon|\bgon\b/gi;

/**
 * "regular pentagon ABCDE" / "מחומש משוכלל ABCDE" / "regular polygon ABCDE" / "regular 7-gon ABCDEFG"
 * ([ADR-111](docs/06-decisions.md#adr-111)) — a REGULAR n-gon: n vertices EQUALLY spaced on an (undrawn) circle whose radius is a
 * free, samplable DOF (ADR-052). Reuses the inscribed-polygon machinery; the corners are pinned (theta set,
 * not `free`) because a regular polygon is rigid up to similarity. Only fires when regularity is explicit
 * ("regular"/"משוכלל"/an n-gon form) so a bare "pentagon" (possibly irregular) is left to the LLM net.
 * n=3 → equilateral, n=4 → square (the canonical shapes); n ≥ 5 → the generic `polygon` command.
 */
const regularPolygon: Rule = (s, ctx) => {
  if (!/\bregular\b|משוכלל/i.test(s) && !/\b\d+\s*-?\s*gon\b/i.test(s)) return null;
  let n: number | null = null;
  for (const [name, k] of Object.entries(POLY_NAME_N)) if (new RegExp(String.raw`\b${name}\b`, 'i').test(s)) { n = k; break; }
  if (n === null) for (const [name, k] of Object.entries(HE_POLY_NAME_N)) if (s.includes(name)) { n = k; break; }
  if (n === null) { const g = s.match(/\b(\d+)\s*-?\s*gon\b/i); if (g) n = parseInt(g[1], 10); }
  const r = parseRadius(s);
  const named = circleCenter(s);
  let rest = dropCircleRef(s).replace(POLY_STRIP, ' ');
  if (r.symbolic) rest = rest.replace(/\b[Rr]\b/g, ' ');
  if (named) rest = rest.replace(new RegExp(String.raw`\b${named}\b`, 'gi'), ' ');
  // Generic "regular polygon ABCDE": no name/number, so read n from the label run (largest wins).
  if (n === null) for (let k = 12; k >= 3; k--) if (labelRun(rest, k)) { n = k; break; }
  if (n === null || n < 3) return null;
  // The named vertices, or — when the n-gon is named/numbered but UNLABELED ("regular pentagon",
  // "מחומש משוכלל") — auto-named A,B,C,… (n is known from the name, so we can). A partial run / a leftover
  // still escalates. (A generic "regular polygon" with no labels already returned null above: n is unknown.)
  const ids =
    labelRun(rest, n) ??
    (!namesVertices(rest) && !SHAPE_LEFTOVER.test(rest)
      ? autoVertexLabels(n, [...(ctx.points ?? []), ...(named ? [named] : [])])
      : null);
  if (!ids) return null;
  const leftover = ids.reduce(
    (a, id) => a.replace(new RegExp(String.raw`\b${id}\b`, 'gi'), ' '),
    rest.replace(new RegExp(String.raw`\b${ids.join('')}\b`, 'i'), ' '),
  );
  if (SHAPE_LEFTOVER.test(leftover)) return 'stop';
  // Routing: a regular triangle is equilateral; a regular quadrilateral is a square.
  if (n === 3) return [
    { type: 'triangle', ids: [ids[0], ids[1], ids[2]] },
    { type: 'set-equal', a: ids[0], b: ids[1], c: ids[1], d: ids[2] },
    { type: 'set-equal', a: ids[1], b: ids[2], c: ids[2], d: ids[0] },
  ];
  if (n === 4) return [{ type: 'square', ids: [ids[0], ids[1], ids[2], ids[3]] }];
  // n ≥ 5: vertices on a HIDDEN circle at equal spacing; free radius unless a numeric one is given.
  const center = named ?? freeLabel([...ids, ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['O', 'P', 'Q', 'K', 'S', 'T', 'U']);
  const circ = circleId(center);
  const cmds: AnyCommand[] = [
    { type: 'circle', id: circ, center: up(center), radius: r.radius, ...(r.numeric ? {} : { freeRadius: true }), hidden: true, ...(named ? {} : { autoCenter: true }) },
  ];
  ids.forEach((id, i) => {
    const deg = 90 + (360 * i) / n; // start at the top, equal 360/n spacing; theta PINNED (rigid corners)
    cmds.push({ type: 'point-on-circle', id, circle: circ, theta: (deg * Math.PI) / 180 });
  });
  cmds.push({ type: 'polygon', ids });
  return cmds;
};

/**
 * "semicircle with diameter AB" / "חצי מעגל שקוטרו AB" / "half circle on AB" (or bare
 * "semicircle"/"חצי מעגל"). A 180° arc on a diameter: a HIDDEN circle keeps the two ends
 * antipodal (so the figure is a clean half-circle, not a full one), the arc draws the upper
 * half, and the diameter AB is drawn. Optional "radius r".
 *
 * M1 + free-radius migration (issue #28, ADR-284): a semicircle ON EXISTING endpoints — «ריבוע» then
 * «על צלע CD יש חצי מעגל» — is a STATEMENT about C,D (M1, ADR-231), never a re-creation with pinned θ:
 * each existing endpoint gets idempotent circle MEMBERSHIP and the through-centre collinearity makes it
 * a diameter (the `diameter` rule's ADR-137 lowering), so the free centre+radius are DRIVEN to the side
 * (centre = the side's midpoint, r = half the side). The pinned θ stayed only for NEW endpoints, where
 * it is pure gauge. And an unstated radius is a FREE DOF (ADR-051/052 — `freeRadius` unless a number
 * was stated), the unnamed auto-picked centre carries `autoCenter` (FR-RN-8), same as `circle`.
 */
const semicircle: Rule = (s, ctx) => {
  if (!/semicircle|half[\s-]?circle|חצי[\s-]?מעגל|חצי[\s-]?עיגול/i.test(s)) return null;
  const r = parseRadius(s);
  const namedC = circleCenter(s); // "חצי מעגל P שקוטרו CD" names the hidden circle's centre P
  // A SIDE reference is this rule's own vocabulary — «על צלע CD יש חצי מעגל» states the side IS the
  // diameter, so צלע/side is consumed here before the leftover test (the ADR-280 discipline: each rule
  // strips its OWN words; the quantified «על כל צלע של ריבוע…» still stops on the surviving כל/ריבוע).
  const stripped = dropCircleRef(s).replace(
    /semicircle|half[\s-]?circle|חצי[\s-]?מעגל|חצי[\s-]?עיגול|diameter|קוטר|שקוטרו|צלע\S*|\bsides?\b|(?<![א-ת])יש(?![א-ת])|על|\bon\b|radius|רדיוס\S*|circle|מעגל|cent\w*|מרכז\S*/gi,
    ' ',
  );
  const restNoC = namedC ? stripped.replace(new RegExp(String.raw`\b${namedC}\b`, 'gi'), ' ') : stripped;
  const dia = labelRun(restNoC, 2);
  const [a, b] = dia ?? ['A', 'B'];
  const leftover = [a, b].reduce((acc, id) => acc.replace(new RegExp(String.raw`\b${id}\b`, 'gi'), ' '), restNoC);
  if (SHAPE_LEFTOVER.test(leftover)) return 'stop'; // a compound ("semicircle … with AC=5") → escalate, don't half-parse
  const center =
    (namedC && up(namedC) !== up(a) && up(namedC) !== up(b) ? up(namedC) : null) ??
    (['O', 'P', 'Q', 'M', 'N', 'S'].find((c) => c !== a && c !== b && !(ctx.points ?? []).includes(c)) ?? 'O');
  const circ = circleId(center);
  const exists = (p: string) => (ctx.points ?? []).some((q) => up(q) === up(p));
  // BOTH endpoints EXIST and no numeric radius contradicts: the semicircle is CLOSED-FORM — centre =
  // the midpoint of the stated diameter, radius through an endpoint. Zero solve, so the prior figure
  // cannot move (the stability principle by construction); the other endpoint's membership lands as a
  // passing check (|centre·b| ≡ |centre·a| at the midpoint), recorded for the verifier + implicit-
  // circle resolution («CD קוטר» next resolves to this circle once members are satisfied).
  if (exists(a) && exists(b) && !r.numeric && !exists(center)) {
    const cmds: AnyCommand[] = [
      { type: 'midpoint', id: up(center), a: up(a), b: up(b) },
      { type: 'circle-through', id: circ, center: up(center), through: up(a), hidden: true, ...(namedC ? {} : { autoCenter: true }) },
    ];
    if (r.varCmd) cmds.push(r.varCmd);
    cmds.push(
      { type: 'point-on-circle', id: up(b), circle: circ }, // the tautological membership — a recorded, passing check
      { type: 'arc', id: `arc-${up(b)}${up(a)}`, center: up(center), from: up(b), to: up(a) }, // CCW B→A = the upper half
      { type: 'segment', a: up(a), b: up(b) }, // the diameter
    );
    return cmds;
  }
  const cmds: AnyCommand[] = [
    { type: 'circle', id: circ, center: up(center), radius: r.radius, ...(r.numeric ? {} : { freeRadius: true }), hidden: true, ...(namedC ? {} : { autoCenter: true }) },
  ];
  if (r.varCmd) cmds.push(r.varCmd);
  const members = membersOfCenter(ctx, center);
  const anyExisting = exists(a) || exists(b);
  // Endpoints: an EXISTING one is asserted a MEMBER (idempotent, M1); a NEW one is created with pinned θ (gauge).
  for (const [p, theta] of [[a, Math.PI], [b, 0]] as const) {
    if (exists(p)) {
      if (!members.has(up(p))) cmds.push({ type: 'point-on-circle', id: up(p), circle: circ });
    } else {
      cmds.push({ type: 'point-on-circle', id: up(p), circle: circ, theta });
    }
  }
  // The diameter property: NEW antipodal θs carry it by construction; with any EXISTING endpoint the
  // through-centre collinearity DRIVES the free centre/radius to the stated side (the ADR-137 lowering).
  if (anyExisting) cmds.push({ type: 'set-collinear', a: up(a), b: up(center), c: up(b) });
  cmds.push(
    { type: 'arc', id: `arc-${up(b)}${up(a)}`, center: up(center), from: up(b), to: up(a) }, // CCW B→A = the upper half
    { type: 'segment', a: up(a), b: up(b) }, // the diameter
  );
  return cmds;
};

/**
 * "quarter circle" / "רבע מעגל" (optionally "quarter circle OAB" naming centre + the two ends).
 * A 90° arc with its two bounding radii drawn; a HIDDEN circle keeps the ends on it. Optional "radius r".
 * Same M1 + free-radius migration as `semicircle` (issue #28, ADR-284): EXISTING ends/centre are
 * statements — membership + a 90° central angle DRIVE the free circle; pinned θ only for NEW ends.
 */
const quarterCircle: Rule = (s, ctx) => {
  if (!/quarter[\s-]?circle|רבע[\s-]?מעגל|רבע[\s-]?עיגול/i.test(s)) return null;
  const r = parseRadius(s);
  const stripped = dropCircleRef(s).replace(
    /quarter[\s-]?circle|רבע[\s-]?מעגל|רבע[\s-]?עיגול|radius|רדיוס\S*|circle|מעגל|cent\w*|מרכז\S*/gi,
    ' ',
  );
  const named = labelRun(stripped, 3); // "OAB" ⇒ centre O + ends A,B; else default
  const [center, a, b] = named ?? ['O', 'A', 'B'];
  const circ = circleId(center);
  const cmds: AnyCommand[] = [
    { type: 'circle', id: circ, center: up(center), radius: r.radius, ...(r.numeric ? {} : { freeRadius: true }), hidden: true, ...(named ? {} : { autoCenter: true }) },
  ];
  if (r.varCmd) cmds.push(r.varCmd);
  const exists = (p: string) => (ctx.points ?? []).some((q) => up(q) === up(p));
  const members = membersOfCenter(ctx, center);
  const anyExisting = exists(a) || exists(b);
  for (const [p, theta] of [[a, 0], [b, Math.PI / 2]] as const) {
    if (exists(p)) {
      if (!members.has(up(p))) cmds.push({ type: 'point-on-circle', id: up(p), circle: circ });
    } else {
      cmds.push({ type: 'point-on-circle', id: up(p), circle: circ, theta });
    }
  }
  // NEW ends carry the quarter (90° apart) by their pinned θs; an EXISTING end makes it a CONSTRAINT
  // on the driven circle — the central angle at the centre is 90°.
  if (anyExisting) cmds.push({ type: 'set-angle', vertex: up(center), ray1: up(a), ray2: up(b), value: 90 });
  cmds.push(
    { type: 'arc', id: `arc-${up(a)}${up(b)}`, center: up(center), from: up(a), to: up(b) }, // CCW 0°→90°
    { type: 'segment', a: up(center), b: up(a) }, // a bounding radius
    { type: 'segment', a: up(center), b: up(b) }, // the other bounding radius
  );
  return cmds;
};

/**
 * "circle inscribed in triangle ABC" / "incircle of triangle ABC" / "מעגל חסום במשולש ABC", OR the
 * triangle-first phrasing "triangle DEF circumscribes the circle" / "משולש DEF חוסם את המעגל" — the
 * INCIRCLE: centred at the incenter (where two angle bisectors meet), tangent to the sides. Built from
 * existing primitives — two bisectors → their crossing (incenter) → the foot on a side (tangency point)
 * → a circle through it. Distinct from "triangle inscribed in a circle".
 */
const incircle: Rule = (s, ctx) => {
  // The INCIRCLE of a polygon (triangle / quad / trapezoid / rhombus / square / rectangle / parallelogram):
  // EITHER "circle inscribed in <polygon>" (circle-in-polygon) …
  // An incircle statement is about a CIRCLE inscribed in a polygon — so a circle noun must be present. Without
  // one ("מעוין חסום במשולש") it is a polygon-in-polygon inscription (ADR-262, owned by `inscribedInPolygon`),
  // not an incircle — this is a semantic guard (what the statement is), not a keyword bow-out.
  const inscribed = /incircle|inscrib\w*|חסום/i.test(s) && /incircle|circle|מעגל/i.test(s) && isCircleInPolygon(s);
  // … OR "<polygon> ABCD circumscribes the circle" — the polygon encloses the circle (same figure). Ordered
  // (polygon-labels … circumscribes … circle) so a CIRCLE-first "מעגל חוסם משולש" (a circumcircle) does NOT
  // match here — only the polygon-as-subject reading does.
  const circumscribes =
    new RegExp(String.raw`(?:${POLY_WORDS_EN}|${POLY_WORDS_HE})\s+[A-Za-z]\d*.*?(?:circumscrib\w*|חוסם).*?(?:circle|מעגל)`, 'i').test(s);
  if (!inscribed && !circumscribes) return null;
  // The polygon kind → vertex count. (Every triangle has an incircle; a quad needs to be TANGENTIAL, which
  // the construction below flexes it to be — sum of opposite sides equal, Pitot.)
  const kind =
    /triangle|משולש/i.test(s) ? 'triangle'
    : /square|ריבוע/i.test(s) ? 'square'
    : /rectangle|מלבן/i.test(s) ? 'rectangle'
    : /rhombus|מעוין/i.test(s) ? 'rhombus'
    : /kite|דלתון|עפיפון/i.test(s) ? 'kite'
    : /trapez|טרפז/i.test(s) ? 'trapezoid'
    : /parallelogram|מקבילית/i.test(s) ? 'parallelogram'
    : /quad\w*|מרובע/i.test(s) ? 'quad'
    : null;
  if (!kind) return null;
  const n = kind === 'triangle' ? 3 : 4;
  const taken = ctx.points ?? []; // auto-named points must dodge labels already in the figure
  // The vertices: named in the utterance, or auto-named A,B,C(,D) — "O מרכז המעגל החסום בטרפז" names none.
  const namedC = circleCenter(s);
  const incLabel = incenterLabel(s);
  let rest = dropCircleRef(s).replace(
    /incircle|inscrib\w*|חסום|circumscrib\w*|חוסם|triangle|משולש|square|ריבוע|rectangle|מלבן|rhombus|מעוין|kite|דלתון|עפיפון|trapez\w*|טרפז|parallelogram|מקבילית|quad\w*|מרובע|polygon|circles?|מעגל\w*|cent(?:er|re)\w*|ה?מרכז\w*/gi,
    ' ',
  );
  if (namedC) rest = rest.replace(new RegExp(String.raw`\b${namedC}\b`, 'gi'), ' ');
  if (incLabel) rest = rest.replace(new RegExp(String.raw`\b${incLabel}\b`, 'gi'), ' ');
  const ids =
    labelRun(rest, n) ??
    (namesVertices(rest)
      ? null
      : (existingPolygon(ctx, n) ??
        autoVertexLabels(n, [...taken, ...(namedC ? [namedC] : []), ...(incLabel ? [incLabel] : [])])));
  if (!ids) return null;
  const [A, B, C] = ids;
  // EXISTING circle as the incircle — "משולש DEF חוסם את המעגל O" where circle O is ALREADY in the figure
  // (here O is also the circumcircle of an earlier triangle). The triangle's three sides are tangent to the
  // existing O, NOT a fresh incircle whose centre/radius are DERIVED from the triangle. Re-deriving it
  // (incenter = bisector∩bisector + circle-through the foot) RE-RADIUSES the existing circle and kicks its
  // members off it ([ADR-115](docs/06-decisions.md#adr-115); verifier caught it amber). Build the DUAL instead:
  // three FREE touch points on the existing circle, the tangent line at each, and the named vertices as the
  // pairwise tangent intersections — so DEF circumscribes O DETERMINISTICALLY (no coupled solve; three feet
  // forced onto the circle over-constrains the per-constraint driver). Mirrors `cornerTangentCircle`'s
  // existing-circle branch and the pole-of-chord two-tangent rule.
  const namedCenter = circleCenter(s);
  if (n === 3 && namedCenter && (ctx.circles ?? []).some((c) => up(c) === up(namedCenter))) {
    const O = up(namedCenter);
    const circ = circleId(O);
    // The three tangency touch points are SCAFFOLDING the student didn't name (#32) — anonymous promotable
    // dots (`@t-O0…`), deterministic per (circle, index), so they never occupy a student letter.
    const touch: Id[] = [anonId('t', O, '0'), anonId('t', O, '1'), anonId('t', O, '2')];
    const verts: [Id, Id, Id] = [A, B, C]; // the student's named vertices = pairwise tangent intersections
    return [
      ...touch.map((t, i): AnyCommand => ({ type: 'point-on-circle', id: t, circle: circ, free: true, theta: 0.4 + (i * 2 * Math.PI) / 3 })),
      ...touch.map((t): AnyCommand => ({ type: 'tangent', id: `tan-${t}`, circle: circ, at: t })), // scaffolding lines
      ...verts.map((v, i): AnyCommand => ({ type: 'line-intersection', id: v, line1: `tan-${touch[i]}`, line2: `tan-${touch[(i + 1) % 3]}` })),
      { type: 'triangle', ids: [A, B, C] }, // the drawn sides DE, EF, FD (each tangent to O)
    ];
  }
  // The incentre: the student's named one — "circle M" (circleCenter) OR the subject form "M [is the] centre
  // of the inscribed circle" (incenterLabel) — else an auto label. A named incentre dodges the polygon's vertices.
  const namedInc = (() => {
    if (namedC && !ids.includes(up(namedC))) return up(namedC);
    if (incLabel && !ids.includes(up(incLabel))) return up(incLabel);
    return null;
  })();
  const I = namedInc ?? freeLabel([...ids, ...taken], ['O', 'P', 'Q', 'I']); // a circle centre defaults to O

  // The polygon's defining command (carries its constraints: trapezoid AB∥CD, rhombus equal sides, …), so the
  // shape stays the named shape while the tangential flex below adjusts it to admit an incircle.
  const v = ids;
  const shapeCmd: AnyCommand =
    kind === 'triangle' ? { type: 'triangle', ids: [v[0], v[1], v[2]] }
    : kind === 'square' ? { type: 'square', ids: [v[0], v[1], v[2], v[3]] }
    : kind === 'rectangle' ? { type: 'rectangle', ids: [v[0], v[1], v[2], v[3]] }
    : kind === 'rhombus' ? { type: 'rhombus', ids: [v[0], v[1], v[2], v[3]] }
    // A kite is its ADR-138 shape-variant macro (expands to the quadrilateral + the equal ADJACENT pairs,
    // axis cyclable/pinnable) — the same lowering the standalone/inscribed kite uses. Every kite is
    // tangential (AB=AD, CB=CD ⇒ Pitot), so the tangency force below is always satisfiable.
    : kind === 'kite' ? { type: 'shape-variant', shape: 'kite', ids: [v[0], v[1], v[2], v[3]], variant: 0 }
    : kind === 'trapezoid' ? { type: 'trapezoid', ids: [v[0], v[1], v[2], v[3]] }
    : kind === 'parallelogram' ? { type: 'parallelogram', ids: [v[0], v[1], v[2], v[3]] }
    : { type: 'quadrilateral', ids: [v[0], v[1], v[2], v[3]] };

  // Generic incircle construction. The incentre is where the angle bisectors meet — it exists for ANY triangle,
  // and for a quad ONLY when the quad is TANGENTIAL (Pitot). We take the bisectors at two ADJACENT vertices (v0,
  // v1): their meet I is equidistant from the three edges incident to v0/v1 (the prev-v0 edge, v0–v1, v1–v2), so
  // the feet on those land on the incircle automatically. Every OTHER edge gets its foot FORCED onto the circle —
  // a constraint that flexes the polygon's free DOFs until that side is tangent too (the quad becomes tangential).
  // If the shape is rigidly pinned and not tangential, this is a genuine over-constraint and surfaces as such
  // (operator's principle: flex when we can, raise an issue when we can't). For a triangle no edge is forced
  // (all three are auto), so its behaviour is unchanged.
  const nb = (i: number): [Id, Id] => [v[(i - 1 + n) % n], v[(i + 1) % n]];
  const [a0p, a0q] = nb(0);
  const [b1p, b1q] = nb(1);
  const bis0 = `bis-${a0p}${v[0]}${a0q}`; // bisector of the interior angle at v0
  const bis1 = `bis-${b1p}${v[1]}${b1q}`; // bisector of the interior angle at v1
  // IDEMPOTENT re-entry: these bisector ids are DETERMINISTIC, so if both already exist the incircle of THIS
  // polygon was already built — re-asserting it must not mint a duplicate incentre + circle (a fresh auto-named
  // O→P). Just re-assert the shape. [ADR-156]
  const lines = new Set(ctx.lines ?? []);
  if (lines.has(bis0) && lines.has(bis1)) return [shapeCmd];
  const cmds: AnyCommand[] = [
    shapeCmd,
    { type: 'bisector', id: bis0, vertex: v[0], p: a0p, q: a0q },
    { type: 'bisector', id: bis1, vertex: v[1], p: b1p, q: b1q },
    { type: 'line-intersection', id: I, line1: bis0, line2: bis1 }, // the incentre
  ];
  const feet: Id[] = [];
  for (let e = 0; e < n; e++) {
    // The tangency foot on edge e is SCAFFOLDING the student didn't name (#32): an anonymous promotable
    // point (`@f-AB`), deterministic per side, so it never occupies a student letter and shows as a
    // clickable dot instead of hijacking F/G/H. The student promotes it to a letter if the book labels it.
    const f = anonId('f', `${v[e]}${v[(e + 1) % n]}`);
    feet.push(f);
    cmds.push({ type: 'foot', id: f, from: I, a: v[e], b: v[(e + 1) % n] }); // touch point on edge e
    if (e === 0) {
      cmds.push({ type: 'circle-through', id: circleId(I), center: I, through: f, ...(namedInc ? {} : { autoCenter: true }) }); // edge v0–v1 sets the inradius
    } else if (e !== 1 && e !== n - 1) {
      cmds.push({ type: 'point-on-circle', id: f, circle: circleId(I) }); // a non-auto edge → force tangency (flex to tangential)
    }
  }
  return cmds;
};

/**
 * "AB ו-AD משיקים למעגל O [בנקודות E ו-K]" / "AB and AD are tangent to circle O [at E and K]" —
 * a circle tangent to TWO segments that meet at a shared vertex (a corner of a polygon). The two
 * sides are GIVEN and the circle is constrained tangent to both — the inverse of "tangent FROM a
 * point" (where the circle is given). The centre lies on the angle bisector at the shared vertex
 * (the locus equidistant from both sides) with ONE free DOF — how far along, i.e. how big the
 * inscribed-corner circle is ([ADR-052](docs/06-decisions.md#adr-052): no stated size, so it's a
 * free DOF "show another configuration" grows/shrinks). Built entirely from primitives, like the
 * incircle: a bisector, a FREE point on it (the centre), a circle through the foot on one side
 * (radius = distance to that side ⇒ tangent); tangency to the other side is automatic (equidistant).
 * The two tangency points are the feet of the ⟂ from the centre onto each side. v1 needs the sides
 * to share a vertex (a corner); two parallel/opposite sides (no shared vertex) fall through.
 */
const cornerTangentCircle: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  // two segments joined by "and"/"ו", both tangent to a circle: capture the 4 side labels
  const m = s.match(/([A-Za-z]\d*)\s*([A-Za-z]\d*)\s*(?:and|ו-?|,)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\s+(?:are\s+)?(?:tangent|משיק)/i);
  if (!m) return null;
  const seg1 = [up(m[1]), up(m[2])];
  const seg2 = [up(m[3]), up(m[4])];
  const shared = seg1.filter((x) => seg2.includes(x));
  if (shared.length !== 1) return null; // need exactly one common vertex (the corner's two arms)
  const vertex = shared[0];
  const arm1 = seg1.find((x) => x !== vertex)!;
  const arm2 = seg2.find((x) => x !== vertex)!;
  // EXISTING circle declared tangent to two sides — "AB ו-AD משיקים למעגל O" where circle O is ALREADY in the
  // figure (e.g. the circumcircle of an inscribed triangle in the two-tangents-from-A kite). This is a tangency
  // CONSTRAINT on the existing circle, NOT the construction of a fresh corner circle: re-creating it (a free
  // centre on the bisector + circle-through the foot) RE-RADIUSES the existing circle and kicks its inscribed
  // points off it ([ADR-115](docs/06-decisions.md#adr-115); the verifier caught it amber). Each arm is tangent
  // at its TIP — the non-shared endpoint, the touch point (the shared vertex is the external apex, off the
  // circle). Put the tip on the circle if it isn't already, then constrain radius O–tip ⟂ that arm (the ADR-082
  // dual, per arm). The circle is resolved like ADR-029's implicit reference — the NAMED circle if it exists,
  // else THE one circle when the figure has exactly one (so "AB ו-AD משיקים למעגל" with NO name and a single
  // circle present still constrains it instead of spawning a spurious corner circle that hijacks labels like E
  // — the exact misfire in the operator's bagrut-Q4 session). Mirrors `tangentLine`/ADR-099.
  const namedCenter = circleCenter(s);
  const existingCenter =
    namedCenter && (ctx.circles ?? []).some((c) => up(c) === up(namedCenter))
      ? up(namedCenter)
      : !namedCenter && (ctx.circles ?? []).length === 1
        ? up(ctx.circles![0])
        : null;
  if (existingCenter) {
    const O = existingCenter;
    const members = membersOfCenter(ctx, O);
    // Named tangency points ("בנקודות D ו C" / "at D and C") pair with the two arms IN ORDER. WITHOUT names
    // the tangent point IS the arm's own tip (tangent AT the endpoint — the ADR-115 kite case). The DISTINCTION
    // matters: a named tangent point D on side (vertex, arm) means the LINE through vertex–arm TOUCHES O at D,
    // so it is D that lies on O with the radius ⟂ the side — the arm ENDPOINT stays where it is (e.g. A on
    // another circle), NOT forced onto O. (ADR-228 Am.5 — the operator's bagrut-Q11: AB tangent to O2 at D,
    // with A on O1; the old code forced A onto O2 → contradiction.)
    const tpM = s.match(/(?:\bat\b|בנקוד(?:ות|ה|ים)?)\s+([A-Za-z]\d*)\s*(?:and|ו-?|,)\s*([A-Za-z]\d*)/i); // בנקוד\w* fails — \w excludes Hebrew, so the suffix must be spelled out
    const tips = tpM ? [up(tpM[1]), up(tpM[2])] : [arm1, arm2];
    const cmds: AnyCommand[] = [];
    for (const [arm, T] of [[arm1, tips[0]], [arm2, tips[1]]] as const) {
      cmds.push({ type: 'segment', a: vertex, b: arm }); // draw the tangent side (idempotent if already an edge)
      if (!members.has(T)) cmds.push({ type: 'point-on-circle', id: T, circle: circleId(O) }); // the TANGENT POINT lies on the circle
      cmds.push({ type: 'set-perpendicular', a: O, b: T, c: vertex, d: arm, implicit: true }); // radius O–T ⟂ the side ⇒ tangent at T (structural, no mark)
      if (T !== arm && T !== vertex) cmds.push({ type: 'set-collinear', a: T, b: vertex, c: arm }); // T lies ON the side (line vertex–arm), the arm endpoint untouched
    }
    return cmds;
  }
  // The circle's centre: the named one ("circle O"), else a fresh auto-name — the corner circle is a
  // NEW object, so "AB ו-AD משיקים למעגל" (no name) is built deterministically rather than escalating
  // (the centre is dodged against the figure's labels, like the incircle's incenter).
  const center = circleCenter(s) ?? freeLabel([vertex, arm1, arm2, ...(ctx.points ?? [])], ['O', 'P', 'Q', 'M']);
  // optional named tangency points: "at E and K" / "בנקודות E ו-K"
  const tp = s.match(/(?:\bat\b|בנקוד(?:ות|ה|ים)?)\s+([A-Za-z]\d*)\s*(?:and|ו-?|,)\s*([A-Za-z]\d*)/i); // בנקוד\w* fails — \w excludes Hebrew, so the suffix must be spelled out
  const taken = [vertex, arm1, arm2, center, ...(ctx.points ?? [])];
  const E = tp ? up(tp[1]) : freeLabel(taken, ['E', 'F', 'G']); // tangency on side 1 (also the circle's through-point)
  const K = tp ? up(tp[2]) : freeLabel([...taken, E], ['K', 'M', 'N']); // tangency on side 2
  const bisId = `bis-${arm1}${vertex}${arm2}`;
  return [
    { type: 'bisector', id: bisId, vertex, p: arm1, q: arm2 },
    { type: 'point-on-line', id: center, line: bisId, offset: 2 }, // the centre — a FREE DOF sliding along the bisector (seed kept small so resample stays within the sides)
    { type: 'foot', id: E, from: center, a: vertex, b: arm1 }, // tangency point on side 1
    { type: 'foot', id: K, from: center, a: vertex, b: arm2 }, // tangency point on side 2
    { type: 'circle-through', id: circleId(center), center, through: E }, // r = dist(centre, side) ⇒ tangent to both
  ];
};

/** "chord AB in circle O" / "מיתר AB במעגל O" — both endpoints on the circle + the segment. */
/**
 * A RELATION riding a carrier-noun utterance — symbols (`=`, `<`, `>`) OR the word forms ("שווה",
 * "equals", "גדול/קטן", "longer/shorter"). The carrier rules (`chord`/`diameter`) bail on it so the
 * relation rule claims the utterance whole (membership is restored by `withCarrierMembership`), or —
 * for a form no deterministic rule reads (word-equality, operator-declared out of grammar) — the
 * utterance escalates honestly instead of HALF-parsing to a bare chord that silently drops the
 * relation and the second segment (review 2026-07-03, P3). "שווה שוקיים/צלעות" (isosceles/equilateral
 * shape words) are excluded — they're a shape modifier, not a relation. A comparative INSIDE a
 * concentric-pair circle qualifier ("במעגל הגדול/הקטן" / "the larger/smaller circle", ADR-244) is a
 * REFERENCE, not a relation on the carrier — excluded by adjacency to the circle noun.
 */
const CARRIER_RELATION_TAIL =
  /[=<>]|שווה(?!\s*(?:שוקיים|צלעות))|equals?\b|(?<!מעגל(?:ים)?\s+ה)(?:גדול|קטן)|ארו[כך]|קצר|(?:longer|shorter|larger|smaller|greater)(?!\s+circles?\b)/i;

const chord: Rule = (s, ctx) => {
  if (!/chord|מיתר/i.test(s)) return null;
  // "E על מיתר AC" is a POINT ON a chord, not a chord DEFINITION — let pointOnSegment handle it (and
  // withChordMembership still puts the endpoints on the circle). Without this guard `chord` grabs the
  // "AC" run and silently drops the named point E.
  if (POINT_ON_CARRIER.test(s)) return null;
  // A RELATION tail ("chord AB = 6" / "chord AB = CD" / "מיתר AB שווה למיתר CD") is a MEASURE on the
  // chord, not a bare chord declaration — bail so the measure/equality rule claims the length;
  // `withCarrierMembership` then re-asserts the endpoints on the circle from the segments that rule
  // draws (PAR-1). Without this the relation was silently dropped. (⟂/∥ chords need no guard here —
  // those constraint rules already run before `chord`.)
  if (CARRIER_RELATION_TAIL.test(s)) return null;
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const ids = labelRun(dropCircleRef(s).replace(/chord|מיתר/gi, ' '), 2);
  if (!ids) return null;
  const circ = circleId(center);
  return [
    { type: 'point-on-circle', id: ids[0], circle: circ },
    { type: 'point-on-circle', id: ids[1], circle: circ },
    { type: 'segment', a: ids[0], b: ids[1] },
  ];
};

/**
 * A circle DEFINED BY its diameter AB (Thales circle) — "circle with diameter AB" / "AB is the diameter of
 * circle O" / "מעגל שקוטרו AB" / "AB קוטר של מעגל [O]" / "מעגל שבו AB קוטר" (ADR-090). The circle's centre is
 * the MIDPOINT of AB and its radius is |AB|/2, so A and B are the diameter's endpoints (on the circle). This
 * is the INVERSE of `diameter` (which adds a diameter to an EXISTING circle): here the circle is created from
 * AB. Fires only when the circle does NOT already exist (a named-and-existing circle → `diameter` adds to it).
 * Built from primitives: midpoint = centre, then circle-through that centre and A (radius |centre·A|; B is on
 * it by the midpoint relation). Works whether A,B are new (created by `midpoint`) or pre-existing.
 */
const circleOnDiameter: Rule = (s, ctx) => {
  if (!/diameter|קוטר/i.test(s)) return null;
  const named = circleCenter(s);
  const circles = ctx.circles ?? [];
  if (named && circles.some((c) => up(c) === up(named))) return null; // the named circle EXISTS → `diameter` adds to it
  // The diameter's two endpoints. Strip keywords AND the centre/radius CLAUSE ("שמרכזו O", "ורדיוסו R",
  // "centered at O", "radius R") + the named centre label, so only the endpoints remain for labelRun (not O/R).
  let body = dropCircleRef(s).replace(
    /diameter|קוטר\S*|circles?|מעגל|\bwith\b|\bof\b|\bthe\b|\ba\b|\bis\b|\bas\b|של|שבו|שקוטר\S*|שמרכז\S*|מרכז\S*|ורדיוס\S*|רדיוס\S*|cent(?:er|re)\w*|\bradius\b|\band\b|בו|הוא|היא/gi,
    ' ',
  );
  if (named) body = body.replace(new RegExp(String.raw`\b${named}\b`, 'g'), ' '); // drop the centre label
  const ids = labelRun(body, 2);
  if (!ids) return null;
  // Fire to DEFINE a circle from AB in three situations (the INVERSE of `diameter`, which adds a diameter to
  // an EXISTING circle): (1) an explicit DEFINE phrasing — "of/with/whose diameter", or a centre/radius spec
  // ("שמרכזו O ורדיוסו R" / "centered … radius"), which you give when defining a circle; (2) a GIVEN diameter
  // — both endpoints already exist AND there is no existing circle this phrase attaches to, so "AB קוטר" with
  // A,B placed means "make a circle with diameter AB"; OR (3) a circle is explicitly mentioned/named and none
  // exists yet — "AB קוטר במעגל" / "קוטר במעגל AB" / "AB קוטר במעגל O" as an opening statement means "make a
  // circle whose diameter is AB" even when A,B are NEW (the common bagrut opener). An EXISTING circle (named
  // and present, or the single unnamed one) → `diameter` adds the diameter to it.
  const DEFINE = /של\s*ה?מעגל|שקוטר|מעגל\s+שבו|שמרכז|רדיוסו|circle\s+with\b|with\s+(?:a\s+|the\s+)?diameter|diameter\s+of|is\s+(?:a\s+|the\s+)?diameter|cent(?:er|re)d|radius/i;
  const endpointsExist = ids.every((p) => (ctx.points ?? []).some((q) => up(q) === up(p)));
  const referencedCircleMissing = named ? true : circles.length === 0; // (a named-and-existing circle already returned above)
  // DEFINE-from-new signal (vs the ADD phrasing "diameter DE in circle O"): the diameter LABELS come
  // BEFORE the keyword ("AB קוטר") — the student says "AB is a/the diameter" — OR the circle is referred
  // to WITHOUT a name ("קוטר במעגל AB" / "AB קוטר במעגל"). The ADD phrasing is keyword-first AND names the
  // circle ("diameter DE in circle O"), so it's neither → stays with `diameter`.
  const kwIdx = s.search(/diameter|קוטר/i);
  const labelsBeforeKeyword = kwIdx > 0 && /[A-Za-z]/.test(s.slice(0, kwIdx));
  const unnamedCircle = /circle|מעגל/i.test(s) && !named;
  const givenDiameter = referencedCircleMissing && (endpointsExist || labelsBeforeKeyword || unnamedCircle);
  if (!DEFINE.test(s) && !givenDiameter) return null;
  if (!/circle|מעגל/i.test(s) && !givenDiameter) return null; // need a circle word, unless it's a clear given diameter ("AB קוטר")
  const centre = named ?? freeLabel([...ids, ...(ctx.points ?? []), ...circles], ['O', 'P', 'M', 'Q', 'K']);
  const auto = !named;
  return [
    { type: 'segment', a: ids[0], b: ids[1] }, // the diameter AB (idempotent; creates A,B if they're new — `midpoint` needs them)
    { type: 'midpoint', id: up(centre), a: ids[0], b: ids[1] }, // the centre is the midpoint of the diameter
    { type: 'circle-through', id: circleId(centre), center: up(centre), through: ids[0], ...(auto ? { autoCenter: true } : {}) }, // radius |centre·A|; B is on it
  ];
};

/**
 * "זווית היקפית נשענת על הקוטר" / "inscribed angle on the diameter" — THALES. Requires an EXISTING circle
 * (operator's choice): an inscribed angle subtending a diameter is a right angle. Builds, on that circle, a
 * diameter A–B (A on the circle, B its antipode) + an apex C on the circle + the two chords A–C, B–C, and
 * marks ∠ACB = 90°. The right angle holds automatically by Thales for any C, so `set-angle 90` is a check
 * (it draws the right-angle square — the teaching point), not a drive. Vertices are auto-named, dodging the
 * figure. No points named ⇒ a fresh diameter; the definite "the diameter" reusing an existing one is a later
 * refinement. [ADR — inscribed-angle-on-diameter / Thales.]
 */
const inscribedAngleOnDiameter: Rule = (s, ctx) => {
  if (!/(?:זוו?ית\s+היקפית|inscribed\s+angle)/i.test(s)) return null;
  if (!/diameter|קוטר/i.test(s)) return null;
  const center = resolveCenter(s, ctx); // an EXISTING circle (named, or the single one) — required
  if (!center) return null;
  const taken = ctx.points ?? [];
  const A = freeLabel(taken, ['A', 'B', 'C', 'D']);
  const B = freeLabel([...taken, A], ['B', 'C', 'D', 'E']);
  const C = freeLabel([...taken, A, B], ['C', 'D', 'E', 'F']);
  return [
    { type: 'diameter', id1: A, id2: B, circle: circleId(center) }, // A on circle, B = antipode (the diameter)
    { type: 'point-on-circle', id: C, circle: circleId(center) }, // the inscribed apex
    { type: 'segment', a: A, b: C },
    { type: 'segment', a: B, b: C },
    { type: 'set-angle', vertex: C, ray1: A, ray2: B, value: 90 }, // Thales — draws the right-angle mark (a check)
  ];
};

/** "diameter DE in circle O" / "קוטר DE במעגל O" — a point on the circle + its antipode + the segment.
 *  But when BOTH endpoints ALREADY EXIST (they're points on the circle), "AB is a diameter" is a CONSTRAINT
 *  on the existing chord, never a re-creation of A,B (which conflicts — "'B' is already defined", the
 *  operator's `AB קוטר במעגל P` failure). It's the same "declaration against an existing circle/points is a
 *  constraint" pattern as ADR-080 (existing vertex on a circle), ADR-092 (a given diameter), ADR-099
 *  (inscribe in an existing circle), ADR-115 (tangency to an existing circle). "AB is a diameter" ⟺ the
 *  centre lies on AB; since the centre is equidistant from A and B (both on the circle), collinearity of
 *  A·centre·B forces the centre to their MIDPOINT ⇒ AB passes through the centre ⇒ a diameter. So emit
 *  `set-collinear [A, centre, B]`: the engine flexes the figure to satisfy it — numerically driving the
 *  free DOFs when the centre is derived (a circumcircle's circumcentre, no dependency cycle), or converting
 *  a free on-circle endpoint to the other's antipode when the centre is independent. [ADR-137] */
const diameter: Rule = (s, ctx) => {
  if (!/diameter|קוטר/i.test(s)) return null;
  // "E על הקוטר AB" is a POINT ON the diameter (a point on segment AB), not a diameter DEFINITION — defer
  // to pointOnSegment (which runs later), else this rule grabs the "AB" run and drops the rider E. The
  // `withCarrierMembership` post-pass still asserts A,B on the circle + collinear-through-centre (PAR-5).
  if (POINT_ON_CARRIER.test(s)) return null;
  // A RELATION tail ("diameter AB = 10", word forms too) is a MEASURE on the diameter — bail so the measure
  // rule claims the length; `withCarrierMembership` then re-asserts A,B on the circle AND collinear-through-
  // centre so it stays a DIAMETER (PAR-1/PAR-4). Without this the "= 10" was silently dropped.
  if (CARRIER_RELATION_TAIL.test(s)) return null;
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const ids = labelRun(dropCircleRef(s).replace(/diameter|קוטר/gi, ' '), 2);
  if (!ids) return null;
  const exists = (p: string) => (ctx.points ?? []).some((q) => up(q) === up(p));
  if (exists(ids[0]) && exists(ids[1])) {
    // "XY is a diameter" entails BOTH endpoints ON the circle AND the through-centre collinearity.
    // Existence is not membership (the ADR-233 proxy-vs-semantic lesson): an existing endpoint NOT yet
    // on the circle (e.g. a free point some ⊥/segment given created) must be put ON it, or the
    // constraint form silently under-asserts — the bare collinearity let "AC קוטר" verify green with
    // A,C floating off the circle (ADR-241). Membership is idempotent for endpoints already on it
    // (the ADR-099 lowering), so assert it for any endpoint not known to be a member.
    const members = membersOfCenter(ctx, center);
    return [
      ...ids
        .filter((p) => !members.has(up(p)))
        .map((p) => ({ type: 'point-on-circle' as const, id: up(p), circle: circleId(center) })),
      { type: 'set-collinear' as const, a: up(ids[0]), b: up(center), c: up(ids[1]) },
    ];
  }
  return [{ type: 'diameter', id1: ids[0], id2: ids[1], circle: circleId(center) }];
};

/**
 * "קוטר מנקודה F" / "הקוטר היוצא מנקודה F" / "קוטר מ-F" / "diameter from F" — the diameter drawn FROM an
 * on-circle point, with NO cut clause and NO named far endpoint (issue #21). The engine's `diameter`
 * command needs both endpoints, so the far end (the antipode) is AUTO-NAMED as a fresh label (the
 * ADR-263 auto-foot precedent — every existing letter excluded). An EXISTING F not yet known on the
 * circle gets its membership asserted (M1 — the statement makes it a given; idempotent for a member);
 * a NEW F is created on-circle by the `diameter` command itself. No theft either way: the compound
 * "קוטר מנקודה F חותך את AC בנקודה E" carries a cut verb and stays owned by `diameterCutsSegment`
 * (this rule defers on INTERSECT_KW), and a named far endpoint ("FD קוטר") stays with `diameter`
 * (this rule requires exactly ONE label).
 */
const diameterFromPoint: Rule = (s, ctx) => {
  if (!/diameter|קוטר/i.test(s)) return null;
  if (INTERSECT_KW.test(s)) return null; // a cut compound → diameterCutsSegment
  if (POINT_ON_CARRIER.test(s)) return null; // "E על הקוטר…" is a point ON the diameter
  const fromM = s.match(/(?:from(?:\s+(?:the\s+)?point)?|מ-?נקודה|מהנקודה|היוצא\s+מ-?|מ-)\s*([A-Za-z]\d*)/i);
  if (!fromM) return null; // no from-marker → the two-label `diameter` rule
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const F = up(fromM[1]);
  if (up(center) === F) return null; // "from the centre" is not an on-circle point
  // Exactly ONE label besides the circle name — a second label is a named far endpoint (→ `diameter`).
  const rest = dropCircleRef(s).replace(/diameter|קוטר|היוצא|מ-?נקודה|מהנקודה|\bfrom\b|\bpoint\b|\bthe\b/gi, ' ');
  const labels = [...rest.matchAll(/\b[A-Za-z]\d*\b/g)].map((mm) => up(mm[0]));
  if (labels.some((l) => l !== F)) return null;
  const far = freeLabel([F, up(center), ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['D', 'E', 'G', 'H', 'K', 'L']);
  const members = membersOfCenter(ctx, center);
  const exists = (ctx.points ?? []).some((q) => up(q) === F);
  return [
    ...(exists && !members.has(F) ? [{ type: 'point-on-circle' as const, id: F, circle: circleId(center) }] : []),
    { type: 'diameter' as const, id1: F, id2: far, circle: circleId(center) },
  ];
};

/**
 * Arc constructs on a circle:
 *   - "M is the midpoint of arc BC" / "M אמצע הקשת BC" → the FIXED arc midpoint (`arc-midpoint`).
 *   - "F is ON arc BC" / "F על קשת BC" → a FREE point on the arc (`point-on-circle` with `between`,
 *     ADR-042): F starts at the arc midpoint but is a real DOF the student/constraints can move.
 * The connector word (midpoint/אמצע vs on/על) selects which.
 */
const arcMidpoint: Rule = (s, ctx) => {
  if (!/arc|קשת/i.test(s)) return null;
  // An optional arc-magnitude qualifier may sit between the arc keyword and the labels — Hebrew
  // FOLLOWS the noun ("הקשת הקטנה AB"), English PRECEDES it ("minor arc AB") — issue #90. Tolerate it
  // (skip over it) so the labels are still captured, and read whether it selects the MAJOR (far) arc;
  // without it, the labels demanded a position immediately after the keyword and the whole utterance
  // fell through to the generic `midpoint` rule → D on the CHORD, a silent wrong figure.
  const m = dropCircleRef(s).match(
    /([A-Za-z]\d*)\b.*?(midpoint|אמצע|\bon\b|על)\s*.*?(?:(minor|major)\s+)?(?:arc|הקשת|קשת)\s*(?:(ה?(?:קטנה|גדולה))\s+)?([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i,
  );
  if (!m) return null;
  const id = up(m[1]), from = up(m[5]), to = up(m[6]);
  const major = /major/i.test(m[3] ?? '') || /גדולה/.test(m[4] ?? '');
  // The arc BC lives on the circle that actually contains BOTH endpoints — prefer it over a named
  // circle that doesn't (a wrong LLM "in circle O" when C is only on circle P), and use it to
  // disambiguate when two circles exist. Fall back to the named / single circle otherwise.
  const center = circleContaining(ctx, [from, to], circleCenter(s)) ?? resolveCenter(s, ctx);
  if (!center) return null;
  // arc-midpoint: minor = branch 0 (the u1+u2 bisector), major = branch 1 (the antipodal midpoint — the
  // engine already flips on odd branch). point-on-arc (a FREE point): `major` picks the far/reflex arc.
  return /midpoint|אמצע/i.test(m[2])
    ? [{ type: 'arc-midpoint', id, circle: circleId(center), from, to, ...(major ? { branch: 1 } : {}) }]
    : [{ type: 'point-on-circle', id, circle: circleId(center), between: [from, to], ...(major ? { major: true } : {}) }];
};

/** "A is on circle O" / "A על מעגל O" — inscribed point(s). The subject may be a LIST — "A ו C נמצאות
 *  על המעגל" / "points A, C are on the circle" — and EVERY listed label gets the membership (the
 *  ADR-076 uppercase-label-list convention, so "points"/"נמצאות" are never read as labels). The old
 *  first-label-wins read silently DROPPED the co-subjects: the operator's saved figure stated
 *  "A ו C נמצאות על המעגל" yet only A landed on the circle — C floated free, and the exported
 *  `.geo.json` carried the partial lowering to every machine (ADR-240; the app-level droppedNewLabels
 *  net flagged it, but the LLM round-trip re-entered this same single-subject grammar). A point named
 *  on a CARRIER ("D על המיתר AB") is a point on that segment, not on the circle — defer to the
 *  segment rules (`withCarrierMembership` restores the carrier's own membership). */
const pointOnCircle: Rule = (s, ctx) => {
  if (!/circle|מעגל/i.test(s)) return null;
  if (POINT_ON_CARRIER.test(s)) return null; // "D על המיתר AB במעגל O" — on the chord, NOT on the circle
  // The subject run: everything before the on-word that precedes the circle word. Requires at least one
  // \b-delimited label (so "point A on circle O" reads A, not the "t" of "poin**t**", and a glued pair
  // "AB על המעגל" stays with the chord/segment readings instead of being split into A,B).
  const m = s.match(/^(.*?\b[A-Za-z]\d*\b.*?)(?:\bon\b|על)(?=.*?(?:circle|מעגל))/i);
  if (!m) return null;
  // The circle: its named centre ("circle O"), or — for a DEFINITE/unnamed reference ("on the
  // circle" / "על המעגל" / "נמצאת על המעגל") — the figure's single circle, via context.
  const center = resolveCenter(s, ctx);
  if (!center) return null; // 0 or 2+ unnamed circles ⇒ ambiguous → defer/escalate
  const ids = (m[1].match(/[A-Z]\d*/g) ?? []).map(up);
  // A distinct uppercase run is the subject list; anything else falls back to the legacy
  // first-single-label read (e.g. a lowercase label) so looser phrasings keep parsing as before.
  const subjects =
    ids.length > 0 && new Set(ids).size === ids.length ? ids : [up(m[1].match(/\b([A-Za-z]\d*)\b/)![1])];
  return subjects.map((id) => ({ type: 'point-on-circle' as const, id, circle: circleId(center) }));
};

/** "M מחוץ למעגל [O]" / "הנקודה M נמצאת בתוך המעגל" / "M is outside circle O" / "point M lies inside
 *  the circle" — a point's SIDE of a circle ([ADR-254](../../../docs/06-decisions.md#adr-254)). A NEW id
 *  becomes a free point seeded on the stated side; an existing id gets the side as a statement (M1). The
 *  subject may be a list ("M ו-N מחוץ למעגל", the ADR-076/240 convention). Deliberately a TIGHT full
 *  match (anchored `$`): a compound like "מנקודה E מחוץ למעגל יוצאים שני משיקים…" has more after the
 *  circle ref and belongs to the secant/tangent rules (which also run earlier). */
const pointVsCircle: Rule = (s, ctx) => {
  if (!/circle|מעגל/i.test(s)) return null;
  const m = s.match(
    // the noun may also FOLLOW the label — "M נקודה מחוץ למעגל" (#71, log-triage)
    /^\s*(?:ה?נקודות\s+|ה?נקודה\s+|points?\s+)?((?:[A-Za-z]\d*)(?:(?:\s*,\s*|\s+ו-?\s*|\s+and\s+)[A-Za-z]\d*)*)\s+(?:נקודה\s+|נקודות\s+|(?:is\s+|are\s+)?(?:a\s+)?points?\s+)?(?:נמצא(?:ת|ות|ים)?\s+|is\s+|are\s+|lies?\s+)?(מחוץ\s*ל|בתוך\s+|outside\s+|inside\s+)(?:of\s+|the\s+)?(?:ה?מעגל|circle)\s*([A-Za-z]\d*)?\s*\.?\s*$/i,
  );
  if (!m) return null;
  const side = /מחוץ|outside/i.test(m[2]) ? ('outside' as const) : ('inside' as const);
  const center = resolveCenter(s, ctx);
  if (!center) return null; // no named circle and 0 or 2+ in the figure ⇒ ambiguous → defer/escalate
  // UPPERCASE labels only (the ADR-076 list convention) — a lowercase run like "and" is a connective.
  const subjects = (m[1].match(/[A-Z]\d*/g) ?? []).map(up);
  if (subjects.length === 0 || new Set(subjects).size !== subjects.length) return null;
  return subjects.map((id) => ({ type: 'point-circle-side' as const, id, circle: circleId(center), side }));
};

/**
 * TWO tangents to the circle, at two points ON it, meeting at a third point — "the tangent at A and the
 * tangent at C meet at D" / "המשיק [מ/ב]נקודה A והמשיק [מ/ב]נקודה C נפגשים בנקודה D" (the pole of chord
 * AC). A,C are on the circle (an inscribed triangle's vertices); each tangent is ⟂ the radius there, and
 * D is their crossing. Built from the `tangent` line spec + a `line-intersection`. Before
 * `tangentLineIntersection` (tangent ∩ a SEGMENT) and the single-tangent rules.
 */
const twoTangentsMeet: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (!(INTERSECT_KW.test(s) || /נפגש|מפגש/.test(s))) return null;
  // the two tangency points: a label after each "tangent at/from"/"משיק [מ/ב]נקוד[ה]" (typo מנקדה allowed)
  const pts = [...s.matchAll(/(?:tangent|משיק)[^A-Za-z]{0,14}?(?:\bat\b|\bfrom\b|בנקודה|מנקודה|מנקדה)\s*([A-Za-z]\d*)/gi)].map((m) => up(m[1]));
  if (pts.length < 2) return null; // need TWO tangents (one tangent ∩ a segment is tangentLineIntersection)
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  // the meeting point: "meet at D" / "נפגשים בנקודה D" / "חותך … D"
  const meetM = s.match(/(?:נפגש\w*|מפגש|פוגש\w*|\bmeets?\b|\bintersects?\b|חות[כך])[^A-Za-z]{0,14}?(?:בנקודה|\bat\b|ב-)\s*([A-Za-z]\d*)/i);
  if (!meetM) return null;
  const [A, C] = [pts[0], pts[1]];
  const D = up(meetM[1]);
  if (new Set([A, C, D]).size !== 3) return null;
  // Semantic impossibility guard (the #36 sibling audit): two tangents at distinct points meet strictly
  // OUTSIDE the circle — a known circle MEMBER captured as the meet label means the positional read
  // mis-bound the roles. Defer (→ escalation) rather than build a wrong figure.
  if (membersOfCenter(ctx, center).has(D)) return null;
  const circ = circleId(center);
  return [
    { type: 'tangent', id: `tan-${A}`, circle: circ, at: A, visible: true },
    { type: 'tangent', id: `tan-${C}`, circle: circ, at: C, visible: true },
    { type: 'line-intersection', id: D, line1: `tan-${A}`, line2: `tan-${C}` },
  ];
};

/**
 * The tangent at D and a line AB meet at E — both phrasings, He/En, with the circle
 * named or implicit (the figure's one circle): "E is the intersection of the tangent
 * to circle O at D and AB", "the tangent at D and the extension of AB meet at E",
 * "המשיק בנקודה D והמשך AB נפגשים בנקודה E".
 */
const tangentLineIntersection: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (!(INTERSECT_KW.test(s) || /נפגש|מפגש/.test(s))) return null; // must be an intersection (not a bare tangent)
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  // tangency point: the label after the tangent's "at"/"בנקודה" (the circle name may sit between).
  const atM = s.match(/(?:tangent|משיק).*?(?:\bat\b|בנקודה|ב-)\s*([A-Za-z]\d*)\b/i);
  if (!atM) return null;
  const at = up(atM[1]);
  // Strip the circle ref, the tangent + its "at D", and the connecting words (incl.
  // "extension"/"המשך", so "the extension of AB" reads AB) → the line is the 2-letter
  // pair, the result point the remaining lone letter.
  const rest = dropCircleRef(s)
    .replace(/tangent|משיק/gi, ' ')
    .replace(new RegExp(String.raw`(?:\bat\b|בנקודה|ב-?)\s*${at}\b`, 'i'), ' ')
    .replace(/extension|המש(?:ך|כי(?:ם|הם|הן)?)|intersection|חיתוך|נפגש\w*|מפגש|\bmeets?\b|\bcuts?\b|crosses|\bthrough\b|\bpoint\b|בנקודה|נקודה/gi, ' ')
    .replace(FILLER, ' ');
  // Labels are UPPERCASE (the repo convention, `isUpperLabel`) — a leftover lowercase word or the
  // article "a" must not be read as a point pair ("through point C **a** tangent…" → pair C,A).
  const pairM = rest.match(/\b([A-Z]\d*)\s*([A-Z]\d*)\b/);
  if (!pairM) return null;
  const a = up(pairM[1]);
  const b = up(pairM[2]);
  const resM = rest.replace(/\b[A-Z]\d*\s*[A-Z]\d*\b/, ' ').match(/\b([A-Z]\d*)\b/); // remove the pair, take the lone letter
  if (!resM) return null;
  // Bind touch vs crossing SEMANTICALLY (circle membership; positional only as the both-new tiebreak) —
  // the post-keyword read alone swaps the roles in the "דרך הנקודה C העבירו משיק … בנקודה E" phrasing (#36).
  const [touch, e] = orientTouchCut(s, ctx, center, at, up(resM[1]));
  const tanId = `tan-${touch}`;
  const abId = `line-${a}${b}`;
  // "המשך AB" / "extension of AB" is DIRECTIONAL — E is beyond the SECOND letter (order a→b→e). Carry that as
  // the crossing's `order` so the figure flexes to put E on AB's extension (not the wrong side); without it
  // the tangent ∩ the infinite line can land beyond a. (ADR-127's order mechanism; folds into the solver.)
  const directional = /extension|המש(?:ך|כי(?:ם|הם|הן)?)/i.test(s);
  // NOTE (issue #22 sibling audit): a BARE pair here deliberately does NOT get the within-segment
  // default — when A,B are a chord of the tangent's own circle (the corpus case), the tangent meets
  // line AB strictly OUTSIDE the segment (a tangent∩secant crossing lies outside the circle), so a
  // "within" default would be infeasible by construction. Single pair operand → no cross-operand
  // contamination, so this rule was never in the #22 defect class; unconstrained stays correct.
  return [
    // Draw what we reference, not just the point: the tangent (trimmed to D–E by the
    // renderer) and the line AB drawn all the way to E (E is on AB's extension).
    { type: 'tangent', id: tanId, circle: circleId(center), at: touch, visible: true },
    { type: 'line-through', id: abId, a, b }, // scaffolding for the crossing
    { type: 'line-intersection', id: e, line1: tanId, line2: abId, ...(directional ? { order: [a, b, e] } : {}) },
    { type: 'segment', a: e, b: a },
    { type: 'segment', a: e, b: b },
  ];
};

/** "F is the intersection of the bisector of angle ADB and AB" — one bisector ∩ a segment line. */
const bisectorSegmentIntersection: Rule = (s) => {
  if (!BISECTOR_KW.test(s)) return null;
  if (!(INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s))) return null;
  const stripped = s
    .replace(/bisectors?|angles?|of|the|is|are|and|with|זוו?ית|הזוו?יות|חוצי|חוצה|חוצ|intersection|intersect\w*|meets?|עם|חיתוך|נחתך\w*|נקודת|המפגש|של/gi, ' ')
    .replace(/-/g, ' ');
  const labels = stripped.match(/\b[A-Za-z]{1,3}\b/g) ?? [];
  const point = labels.find((l) => l.length === 1);
  const triple = labels.find((l) => l.length === 3);
  const pair = labels.find((l) => l.length === 2);
  if (!point || !triple || !pair) return null; // two triples ⇒ the two-bisector meet handles it
  const t = triple.toUpperCase();
  const pr = pair.toUpperCase();
  return [
    { type: 'bisector', id: `bis-${t}`, vertex: t[1], p: t[0], q: t[2], visible: true }, // draw the bisector
    { type: 'segment', a: pr[0], b: pr[1] }, // draw the segment it meets
    { type: 'line-through', id: `line-${pr}`, a: pr[0], b: pr[1] }, // scaffolding for the crossing
    { type: 'line-intersection', id: up(point), line1: `bis-${t}`, line2: `line-${pr}` },
  ];
};

/**
 * A SECANT from a point outside the circle, cutting it at two points.
 *
 * FIRST secant (the external point E is NEW): "from a point E outside the circle, a line cuts the
 * circle at A and B" / "מנקודה E מחוץ למעגל … חותך … בנקודות A ו-B". A,B are two on-circle points (a
 * chord); E is placed OUTSIDE on the extension of the chord (beyond A) so it is auto-external for any
 * circle, no coordinates needed.
 *
 * SECOND secant FROM THE SAME E (E already exists): "from E another line cuts the circle at C and D".
 * Reuses the existing external E without moving it: C is a new on-circle point, the line E–C is drawn,
 * and D is the OTHER intersection of that line with the circle (`line-circle` branch 0 — branch 1
 * would coincide with C). No constraint is added, so E stays put. Lets several secants share one
 * external point.
 *
 * Runs before the generic intersection rules (which would 'stop' on the "cuts/חותך" keyword).
 */
const secantFromExternal: Rule = (s, ctx) => {
  if (!/חות[כך]|\bcuts?\b|\bsecant\b|\bmeets?\b|crosses|נחת/i.test(s)) return null; // a secant cut
  const eM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?\s+|(?:מנקודה|מהנקודה|מ\s*נקודה)\s+|מ-\s*)([A-Za-z]\d*)(?![A-Za-z])/i); // the (external) point — spelled out "מנקודה B" OR the abbreviated "מ-B" (#96); `(?![A-Za-z])` keeps it a single label (not "מ-AB")
  if (!eM) return null;
  // "the circle" is usually unnamed; guard against `circleCenter` reading an English article
  // ("the circle **a** line" → "a"): a real centre label is uppercase, an article is lowercase.
  const named = circleCenter(s);
  const center = named && /^[A-Z]/.test(named) ? named : ctx.circles?.length === 1 ? ctx.circles[0] : null;
  if (!center) return null;
  const abM = s.match(/\b([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)\b/i); // the two intersections "A and B" / "A ו-B"
  if (!abM) return null;
  const E = up(eM[1]), A = up(abM[1]), B = up(abM[2]);
  if (new Set([E, A, B]).size !== 3) return null; // need three distinct labels
  const circ = circleId(center);
  // A secant from an EXISTING point E: line E–A, B = the OTHER crossing. Don't re-place E (no
  // constraint), so a shared point stays put. B is chosen as the crossing AWAY from a known point
  // (`avoid`), which is stable under resampling — a fixed branch index intermittently flips onto the
  // wrong root as the line turns and then B collapses onto the known point ("would be at the same point").
  if (ctx.points?.includes(E)) {
    const lineId = `sec-${E}${A}`;
    // If A already EXISTS it is a direction point, NOT a new on-circle crossing — never re-place it on
    // the circle (that wrongly pins it to two circles at once). Then B is the crossing away from E
    // (E on the circle → the second crossing; E external → the far exit). If A is new, it's the
    // near on-circle end and B is the crossing away from A.
    const aExists = ctx.points?.includes(A);
    return [
      ...(aExists ? [] : [{ type: 'point-on-circle', id: A, circle: circ } as const]),
      { type: 'line-through', id: lineId, a: E, b: A },
      { type: 'line-circle-intersection', id: B, line: lineId, circle: circ, avoid: aExists ? E : A },
      { type: 'segment', a: E, b: A }, // the drawn secant E–A
    ];
  }
  // FIRST secant: a NEW external point — require the "outside" cue so a bare "from X cuts … at A,B"
  // (X not yet placed) doesn't misfire. A,B a chord; E outside on the extension.
  if (!/מחוץ|outside|external/i.test(s)) return null;
  return [
    { type: 'point-on-circle', id: A, circle: circ },
    { type: 'point-on-circle', id: B, circle: circ },
    { type: 'segment', a: A, b: B }, // the chord
    { type: 'point-on-segment', id: E, a: B, b: A, t: 1.3, extension: true }, // E beyond A on line BA → outside the circle (extension: it lives past the endpoint, t>1, not on the chord — ADR-194)
    { type: 'segment', a: E, b: A }, // the external part of the secant (E–A–B collinear)
  ];
};

/** "G is where the line through F parallel to AB meets circle O" — a parallel line ∩ the circle. */
const parallelCircleIntersection: Rule = (s, ctx) => {
  if (!/parallel|מקביל/i.test(s) || !/circle|מעגל/i.test(s)) return null;
  const center = resolveCenter(s, ctx);
  const throughM = s.match(/(?:through|דרך)\s+([A-Za-z]\d*)\b/i);
  const toM = s.match(/(?:parallel\s+to|מקביל\s*ל-?)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!center || !throughM || !toM) return null;
  const resM = dropCircleRef(s)
    .replace(/through\s+[A-Za-z]\d*\b|דרך\s+[A-Za-z]\d*\b/gi, ' ')
    .replace(/\bpoint\b|נקודה/gi, ' ')
    .replace(FILLER, ' ')
    .match(/\b([A-Za-z]\d*)\b/);
  if (!resM) return null;
  const through = up(throughM[1]);
  const a = up(toM[1]);
  const b = up(toM[2]);
  const lineId = `par-${through}-${a}${b}`;
  return [
    { type: 'parallel-line', id: lineId, through, a, b, visible: true }, // draw the parallel line
    { type: 'segment', a, b }, // draw the segment it's parallel to
    { type: 'line-circle-intersection', id: up(resM[1]), line: lineId, circle: circleId(center), branch: 0 },
  ];
};

/** "G is the intersection of circle O and circle P" / "G חיתוך מעגל O ומעגל P" — where two circles cross. */
/**
 * "two circles intersect at A and B" / "שני מעגלים נחתכים בנקודות A ו-B" / "circles O and P meet at
 * A and B" — CREATE both circles (overlapping) and BOTH intersection points A, B (the two branches).
 * The two circles get DISTINCT default radii so they read as two different circles (not a symmetric
 * lens). No chord AB is drawn — the student asked for two intersecting circles, not their common chord.
 * The single-point `circleCircleIntersection` below needs the two circles to already exist and yields
 * one point; this is the "draw two intersecting circles" opener.
 */
/**
 * The two EXISTING circles a DEFINITE-PLURAL reference names — «(שני) המעגלים» / «the (two) circles» with
 * NO circle letters — when the figure holds exactly TWO circles (issue #111, the ADR-029 implicit-reference
 * pattern, plural edition). Returns their ids, or null (named, or ≠2 circles). Lets «A נקודת החיתוך של
 * המעגלים» / «חיתוך בין המעגלים» bind the two circles already drawn instead of inventing a third.
 */
const definiteTwoCircles = (s: string, ctx: ParseContext): [Id, Id] | null => {
  const circs = (ctx.circles ?? []).filter((c) => !c.startsWith('~'));
  if (circs.length !== 2) return null;
  if (/(?:circle|מעגל)\s+[A-Za-z]\d*/i.test(s)) return null; // a NAMED circle → circleCircleIntersection owns it
  if (!/ה?מעגלים|\bcircles\b/i.test(s)) return null; // must be the definite plural «המעגלים» / «the circles»
  return [circleId(circs[0]), circleId(circs[1])];
};

const twoCirclesMeet: Rule = (s, ctx) => {
  if (!/\bcircles\b|שני\s+מעגל|מעגלים/i.test(s)) return null; // two circles being introduced (plural)
  if (!(INTERSECT_KW.test(s) || /נחתכ|נפגש|מפגש|\bmeets?\b/i.test(s))) return null;
  // A definite reference to the TWO circles ALREADY in the figure — «A חיתוך בין המעגלים» / «A נקודת
  // החיתוך של המעגלים» — binds THOSE circles (issue #111), never invents new ones. Emit only the
  // crossing point(s) the student named: one → branch 0; two → the other crossing (avoid the first).
  const existing = definiteTwoCircles(s, ctx);
  if (existing) {
    const [id1, id2] = existing;
    const labels = [...new Set((dropCircleRef(s).match(/\b[A-Z]\d*\b/g) ?? []).map(up))];
    if (labels.length === 0) return null; // no crossing named — leave to another rule / escalate
    const out: AnyCommand[] = [{ type: 'circle-circle-intersection', id: labels[0], circle1: id1, circle2: id2, branch: 0 }];
    if (labels[1]) out.push({ type: 'circle-circle-intersection', id: labels[1], circle1: id1, circle2: id2, branch: 1, avoid: labels[0] });
    return out;
  }
  const named = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => up(m[1]));
  const c1 = named[0] ?? 'O';
  const c2 = named[1] ?? freeLabel([c1, ...(ctx.points ?? [])], ['P', 'Q', 'K', 'S']);
  // The two intersection points: the pair after "at"/"בנקודות", or a bare "X and Y" that ISN'T the
  // named centres — else AUTO-name them A,B (the student drew "two intersecting circles" without naming the
  // crossings; ADR-132). Avoid the centres and any existing points.
  const atM = s.match(/(?:\bat\b|בנקוד\S*|points?)\s*([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)/i);
  const bareM = s.match(/\b([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)\b/i);
  const pair: [Id, Id] | null = atM
    ? [up(atM[1]), up(atM[2])]
    : bareM && !named.includes(up(bareM[1])) && !named.includes(up(bareM[2]))
      ? [up(bareM[1]), up(bareM[2])]
      : null;
  const [A, B] = pair ?? autoVertexLabels(2, [c1, c2, ...(ctx.points ?? [])]);
  if (new Set([A, B, c1, c2]).size !== 4) return null;
  const id1 = circleId(c1), id2 = circleId(c2);
  // A centre the student didn't name (defaulted O/P) is auto → hidden unless used; a named one shows.
  const auto1 = !named.includes(c1);
  const auto2 = !named.includes(c2);
  return [
    // No radius is stated, so each circle's size is a free DOF (ADR-051) seeded at a distinct value (so it
    // doesn't render as a symmetric lens) — the solver sizes them to the problem's givens, the sampler varies them.
    { type: 'circle', id: id1, center: c1, radius: RADIUS_DEFAULT, freeRadius: true, ...(auto1 ? { autoCenter: true } : {}) },
    { type: 'circle', id: id2, center: c2, radius: RADIUS_DEFAULT * 0.72, freeRadius: true, ...(auto2 ? { autoCenter: true } : {}) },
    { type: 'circle-circle-intersection', id: A, circle1: id1, circle2: id2, branch: 0 },
    // B is "the OTHER crossing" — geometric (avoid A), so it doesn't swap with A as the circles flex (R8).
    { type: 'circle-circle-intersection', id: B, circle1: id1, circle2: id2, branch: 1, avoid: A },
  ];
};

const circleCircleIntersection: Rule = (s) => {
  if (!/circle|מעגל/i.test(s)) return null;
  if (!(INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s))) return null;
  // A tangent-LINE compound that names two circles ("דרך E עובר משיק למעגל O שחותך את מעגל P בנקודה K")
  // is owned by the tangent rules — the same defer its siblings carry (lineMeetsCircle bows out on משיק,
  // lineLineIntersection 'stop's on it). Without it this rule claimed the compound as a bare
  // circle∩circle of the through-point, silently dropping the tangent AND the crossing (play-test
  // session yla2d4xo — the gates caught it, but a not-handled escalates honestly instead).
  if (/tangent|משיק/i.test(s)) return null;
  const centers = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => m[1]);
  if (centers.length < 2) return null;
  const resM = dropCircleRef(s).match(/\b([A-Za-z]\d*)\b/);
  if (!resM) return null;
  return [{ type: 'circle-circle-intersection', id: up(resM[1]), circle1: circleId(centers[0]), circle2: circleId(centers[1]), branch: 0 }];
};

/**
 * "[the extension of] AC cuts/meets circle P at E" / "המשך AC חותך את מעגל P בנקודה E" /
 * "AC extended meets circle P at E" — a line through two EXISTING points, extended, crossing a
 * circle at a NEW point. One endpoint is already on the target circle (the two circles share it),
 * so the line meets the circle there and at the new point; the new point is the crossing that
 * AVOIDS the on-circle endpoint (deterministic — the `avoid` branch drops every already-placed
 * root, so it can never collapse onto the shared point). Built from `line-through` +
 * `line-circle-intersection`, and the secant chord is drawn from the off-circle end through to it.
 *
 * Distinct from: the EXTERNAL-point secant ("from E a line cuts …", which introduces the line's
 * far end — guarded out by "from"/"מנקודה"); the tangent compound (guarded out by "tangent"/"משיק");
 * and line∩line (this REQUIRES a named circle). Runs after the circle-circle rules, before the
 * generic collinearity / line∩line (whose `INTERSECT_KW` guard would otherwise grab "חותך").
 */
/**
 * "המשך AC חותך מעגל P בנקודה D" / "AC extended meets circle P at D" / "the extension of AC cuts
 * circle P at D" — a DIRECTIONAL extension onto a circle ([ADR-054](docs/06-decisions.md#adr-054)).
 * Unlike {@link lineMeetsCircle} (an order-agnostic chord that AVOIDS a shared on-circle endpoint),
 * `המשך` is directional: the new point D is BEYOND the 2nd named point (order A→C→D for "המשך AC"),
 * and a FREE-radius circle adapts (the joint solver grows it) so the extension actually reaches it —
 * with default radii a line often has no extension crossing at all ("adapt the figure", ADR-052).
 *
 * Triggered by an extension word (המשך / extension / extended) + a NAMED circle; runs BEFORE
 * `lineMeetsCircle` so a non-extension "line AC meets circle P" keeps the order-agnostic chord rule,
 * and after the tangent/external-secant compounds (guarded out by "tangent"/"משיק"/"from"/"מנקודה").
 */
const extendOntoCircle: Rule = (s, ctx) => {
  if (!/המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i.test(s)) return null; // directional only — a plain chord stays lineMeetsCircle
  if (!INTERSECT_KW.test(s)) return null;
  if (/tangent|משיק/i.test(s)) return null; // tangent compound → tangentMeetsOtherCircle / tangentLine
  if (/\bfrom\b|מנקודה|מהנקודה/i.test(s)) return null; // "from <point>" → the external-point secant
  const center = resolveMentionedCircle(s, ctx); // a named circle, or "the circle" when there's exactly one
  if (!center) return null; // must REFER to a circle (else pointOnExtension on a segment / line∩line)
  // the new crossing: the label after the "at"/"בנקודה" that FOLLOWS the circle mention
  const R = crossingAfterCircle(s);
  if (!R) return null;
  // the line's two points (document order: a then b; D lands beyond b — the 2nd letter)
  const body = dropCircleRef(s)
    .replace(/(?:\bat\b|בנקודה|ב-)\s*[A-Za-z]\d*\b/gi, ' ')
    .replace(/extension|extended|\bline\b|המש(?:ך|כי(?:ם|הם|הן)?)|הישר|הקו|חות[כך]|נחתכ?\w*|פוגש\w*|cuts?|meets?|crosses|intersects?/gi, ' ');
  const pr = labelRun(body, 2);
  if (!pr || pr.includes(R)) return null;
  const [a, b] = pr;
  return [{ type: 'extend-onto-circle', id: R, a, b, circle: circleId(center) }];
};

/**
 * A NAMED line (two existing points) cutting the circle at TWO points — "AO חותך את המעגל בנקודות C ו-D"
 * / "the line AO cuts the circle at C and D". A secant whose line is given by its two points (e.g. an
 * external point A and the centre O), crossing the circle at both roots. Distinct from `lineMeetsCircle`
 * (ONE new crossing, the other endpoint already on the circle) and `secantFromExternal` ("from a point …").
 */
const lineCutsCircleTwice: Rule = (s, ctx) => {
  if (!INTERSECT_KW.test(s)) return null;
  if (/tangent|משיק/i.test(s)) return null;
  if (/\bfrom\b|מנקודה|מהנקודה/i.test(s)) return null; // "from <point>" → secantFromExternal
  // TWO crossing labels: "at C and D" / "בנקודות C ו-D"
  const twoM = s.match(/(?:\bat\b|בנקודות?|ב-)\s*([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)\b/i);
  if (!twoM) return null;
  const center = resolveCenter(s, ctx); // a named circle, or the figure's single circle
  if (!center) return null;
  const [C, D] = [up(twoM[1]), up(twoM[2])];
  // the line's two points: strip the circle ref + the two-crossing clause + connectives → the 2-label run
  const body = dropCircleRef(s)
    .replace(/(?:\bat\b|בנקודות?|ב-)\s*[A-Za-z]\d*\s*(?:\band\b|ו-?|,)\s*[A-Za-z]\d*\b/gi, ' ')
    .replace(/\bline\b|הישר|הקו|ישר|חות[כך]|נחתכ?\w*|פוגש\w*|cuts?|meets?|crosses|intersects?|המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/gi, ' ');
  const pr = labelRun(body, 2);
  if (!pr || pr.includes(C) || pr.includes(D)) return null; // the line's points must differ from the crossings
  const [a, b] = pr;
  const circ = circleId(center);
  const lineId = `sec-${a}${b}`;
  // A BARE pair means the SEGMENT (the #30 class, sibling sweep): BOTH stated crossings must land
  // within a–b; `הישר`/`line` (the catalog's own example) keeps the infinite-line semantics. A pair
  // endpoint that IS the circle's CENTRE also reads as the line: the centre is inside the circle, so a
  // segment ending there can contain at most ONE crossing — a stated TWO-crossing cut through the
  // centre ("AO חותך את המעגל בנקודות C ו-D", the 2026-06-20 operator figure) necessarily means the
  // secant LINE, never an unsatisfiable segment.
  const infinite =
    /\bline\b|\bray\b|הישר|הקו|קרן|המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i.test(s) || a === up(center) || b === up(center);
  const within = (id: Id) => (infinite ? {} : { order: [a, id, b] as Id[] });
  return [
    { type: 'line-through', id: lineId, a, b },
    { type: 'line-circle-intersection', id: C, line: lineId, circle: circ, branch: 0, ...within(C) },
    { type: 'line-circle-intersection', id: D, line: lineId, circle: circ, branch: 1, ...within(D) },
    { type: 'segment', a, b: C },
    { type: 'segment', a, b: D }, // the visible secant: external end → each crossing (collinear, spans the line)
  ];
};

/**
 * "the extension of CA meets THE TANGENT (or a drawn line) at D" / "המשך CA נפגש עם המשיק בנקודה D",
 * where D ALREADY exists (e.g. the marker the tangent placed for its external apex — ADR-084). The object
 * D "meets" is the very line D already lies on, so it needs no id: this only has to put D on the EXTENSION
 * of CA (order C→A→D, ADR-054), and that drives D's existing on-line DOF to the crossing. Scoped tight so
 * it can't mis-grab a plain line∩line cut-form: requires the extension word, a tangent/line OBJECT (not a
 * second segment), a "meets/at D" with D EXISTING, and a circle must NOT be mentioned (that's
 * extendOntoCircle / lineMeetsCircle). A NEW crossing point is left to the intersection constructs.
 */
const extensionMeetsExistingPoint: Rule = (s, ctx) => {
  if (!/המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i.test(s)) return null;
  if (mentionsCircle(s)) return null; // a circle target → extendOntoCircle / lineMeetsCircle
  if (!/tangent|משיק|\bline\b|הישר|הקו/i.test(s)) return null; // the object D lives on (not a 2nd segment → line∩line)
  if (!INTERSECT_KW.test(s)) return null; // a "meets/cuts" phrasing
  const atM = s.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i);
  if (!atM) return null;
  const D = up(atM[1]);
  if (!(ctx.points ?? []).includes(D)) return null; // only CONSTRAIN an existing point (a new crossing is the intersection construct)
  const segM = s.match(/(?:המש(?:ך|כי(?:ם|הם|הן)?)|extension(?:\s+of)?|extended)\s+([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!segM) return null;
  const [X, Y] = [up(segM[1]), up(segM[2])];
  if (X === D || Y === D) return null;
  return [{ type: 'set-line', points: [X, Y, D] }]; // D on the extension of XY, in order X→Y→D
};

const lineMeetsCircle: Rule = (s, ctx) => {
  // verb form ("AB cuts/meets the circle") OR noun/definitional form ("E is the מפגש/meeting/intersection of AB with the circle")
  if (!INTERSECT_KW.test(s) && !/מפגש|\bmeeting\b/i.test(s)) return null;
  if (/tangent|משיק/i.test(s)) return null; // tangent line → tangentMeetsOtherCircle / tangentLine
  if (/\bfrom\b|מנקודה|מהנקודה/i.test(s)) return null; // "from <point>" → the external-point secant
  const center = resolveMentionedCircle(s, ctx); // a named circle, or "the circle" when there's exactly one
  if (!center) return null; // must REFER to a circle (else it's line∩line, a constraint, etc.)
  const circ = circleId(center);
  // the new crossing: the label after the "at"/"בנקודה" that follows the circle (verb form),
  // else the point named ahead of the construction (noun form: "[נקודה] E היא …")
  const R = crossingAfterCircle(s) ?? leadingNamedPoint(s);
  if (!R) return null;
  // the line's two points: strip the circle ref + the new-point clause (both a trailing "at E"
  // and a leading "[נקודה] E היא") + connective words → the 2-label run
  const body = dropCircleRef(s)
    .replace(/(?:\bat\b|בנקודה|ב-)\s*[A-Za-z]\d*\b/gi, ' ')
    .replace(/(?:^|\s)(?:ה?נקוד[הת]|point)\s+[A-Za-z]\d*\b/gi, ' ')
    .replace(new RegExp(String.raw`^\s*${R}\s*(?:\bis\b|היא|הוא|=)`, 'i'), ' ')
    // #71: the appositive noun form — strip the leading "E נקודת החיתוך" / "E is the intersection point"
    .replace(new RegExp(String.raw`^\s*${R}\s+נקודת\s+ה?(?:חיתוך|מפגש)(?:\s+של)?`, 'i'), ' ')
    .replace(new RegExp(String.raw`^\s*${R}\s+(?:is\s+)?the\s+(?:intersection|meeting)\s+point(?:\s+of)?`, 'i'), ' ')
    .replace(/extension|extended|\bline\b|המש(?:ך|כי(?:ם|הם|הן)?)|הישר|הקו|חות[כך]|נחתכ?\w*|פוגש\w*|cuts?|meets?|crosses|intersects?/gi, ' ');
  const pr = labelRun(body, 2);
  if (!pr || pr.includes(R)) return null;
  const [a, b] = pr;
  // avoid the endpoint already on the target circle (default to `a` — the avoid branch drops all
  // placed roots regardless, so the new crossing is found either way); draw from the off-circle end.
  const onCircle = circleContaining(ctx, [a], center) ? a : circleContaining(ctx, [b], center) ? b : a;
  const other = onCircle === a ? b : a;
  const lineId = `chord-${a}${b}`;
  // A BARE pair means the SEGMENT (ADR-077 / ADR-268, the line∩circle member — issue #30): the stated
  // crossing must land WITHIN a–b. Two ways to keep it there:
  //   • `order` (ADR-127, a driving `collinear-order`) — the general bare-pair case, where the figure may
  //     have to FLEX free DOFs to bring the crossing onto the segment.
  //   • `onSegment` (ADR-313/#119, a stable SELECTION, no constraint) — when one endpoint is INSIDE the
  //     circle (the extreme case: the CENTRE), so exactly ONE root is within the segment. A pick suffices
  //     (no driving needed) and adds no constraint, so it can't contend with a sibling crossing on the same
  //     line (the tangent-secant `AO חותך C` + `המשך AO חותך D`, where a driving `order` over-constrained).
  // Opt-outs keep their own semantics: `הישר`/`line` = the infinite line (the B13 corpus phrasing), `המשך` =
  // the extension (owned by extendOntoCircle). A segment ending at the centre whose OTHER endpoint is ON the
  // circle is a RADIUS — its only crossing beyond that endpoint is the antipode (beyond the centre), so it
  // reads as the infinite line (no within crossing).
  const wordInfinite = /\bline\b|\bray\b|הישר|הקו|קרן|המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i.test(s);
  const aCentre = a === up(center), bCentre = b === up(center);
  const centreRadius = (aCentre && !!circleContaining(ctx, [b], center)) || (bCentre && !!circleContaining(ctx, [a], center));
  const centreSelect = (aCentre || bCentre) && !centreRadius; // centre endpoint, other not on the circle → within selection
  const infinite = wordInfinite || centreRadius;
  return [
    { type: 'line-through', id: lineId, a, b },
    {
      type: 'line-circle-intersection', id: R, line: lineId, circle: circ, avoid: onCircle,
      ...(centreSelect ? { onSegment: [a, b] as [Id, Id] } : infinite ? {} : { order: [a, R, b] as Id[] }),
    },
    // BOTH halves of the stated line are drawn (ADR-250, honesty §6): "AD חותך את המעגל ב-E" must show
    // A—E—D whole, not just D–E — the on-circle half was silently missing and the student re-typed it
    // (session m68n76e7). Split at the crossing, so no overlapping collinear strokes.
    { type: 'segment', a: onCircle, b: R },
    { type: 'segment', a: other, b: R },
  ];
};

/**
 * "the tangent to circle O at A meets circle P at D" /
 * "המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D" — a tangent LINE to one circle (at a
 * point A on it) that crosses the OTHER circle at a new point D. The two circles already
 * intersect, so A lies on circle P too; the tangent at A meets P at A and at D, and D is
 * the crossing AWAY from A (`avoid`). Built from existing primitives: the tangent line
 * (scaffolding — the drawn chord A–D is an explicit segment) + a line∩circle pinned to the
 * other crossing.
 *
 * Distinct from `circlesTangent` (two circles tangent to EACH OTHER, a state): here a
 * MEETING keyword plus TWO adjacent "circle <C> at <P>" pairs name a crossing event, not a
 * mutual-tangency point. Must run BEFORE `circlesTangent`, which would otherwise read the
 * משיק + two circle names + the first "at" as mutual tangency (the misparse this fixes).
 */
const tangentMeetsOtherCircle: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (!INTERSECT_KW.test(s)) return null; // a meeting EVENT (cuts/meets/חותך/פוגש), not a state
  if (/each\s+other|זה\s+לזה/i.test(s)) return null; // mutual tangency → circlesTangent
  // Two adjacent "circle <C> at <P>" pairs: the tangent's circle + tangency point, then the
  // target circle + the new crossing. The adjacency (no "and"/verb between circle and "at")
  // is what separates this from `circlesTangent`'s "circle O and circle P … at M".
  const pairs = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b\s*(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/gi)];
  let c1: string, p1: string, c2: string, p2: string;
  if (pairs.length >= 2) {
    [c1, p1, c2, p2] = [up(pairs[0][1]), up(pairs[0][2]), up(pairs[1][1]), up(pairs[1][2])];
  } else if (pairs.length === 1) {
    // ONE pair + a THROUGH-point touch — «דרך A עובר משיק למעגל O שחותך את מעגל P בנקודה K» (the
    // operator's one-sentence form, play-test session yla2d4xo): the tangent's touch is named by the
    // through-clause, not an at-clause. Membership-gated (ADR-233): the through-point must be a known
    // member of the tangent's own circle — the one named with the tangent preposition («משיק למעגל O» /
    // "tangent to circle O"), which the single pair must not be.
    const thr = throughPointLabel(s);
    const tanCircM = s.match(/(?:משיק\s+למעגל|tangent\s+to\s+(?:the\s+)?circle)\s+([A-Za-z]\d*)\b/i);
    if (!thr || !tanCircM) return null;
    [c1, p1, c2, p2] = [up(tanCircM[1]), thr, up(pairs[0][1]), up(pairs[0][2])];
    if (!membersOfCenter(ctx, c1).has(p1)) return null; // an off-circle through-point is an external apex — other rules own it
  } else return null;
  if (c1 === c2) return null; // two DIFFERENT circles
  if (new Set([c1, p1, c2, p2]).size !== 4) return null; // four distinct labels
  const lineId = `tan-${p1}`;
  return [
    { type: 'tangent', id: lineId, circle: circleId(c1), at: p1, visible: false }, // scaffolding for the ∩ (the drawn line is the chord)
    { type: 'line-circle-intersection', id: p2, line: lineId, circle: circleId(c2), avoid: p1 },
    { type: 'segment', a: p1, b: p2 }, // draw the chord p1–p2 (tangent to circle c1 at p1, a chord of c2)
  ];
};

/**
 * "המשיק חותך את מעגל P בנקודה K" / "the tangent cuts circle P at K" — a DEFINITE back-reference to
 * the tangent line already drawn in the figure, intersected with a circle in a SEPARATE statement
 * (issue #100; the ADR-029 implicit-reference pattern, tangent-line edition). The textbook two-clause
 * form: "דרך הנקודה A העבירו משיק למעגל הקטן. המשיק חותך את המעגל הגדול בנקודה K." Deliberately TIGHT:
 * the subject must be exactly the bare definite tangent noun followed by the cut verb — a subject that
 * declares its own tangency ("המשיק למעגל O בנקודה A חותך…") carries a circle ref before the verb and
 * belongs to `tangentMeetsOtherCircle` (which runs first); a two-tangent meet ("המשיק בנקודה A והמשיק
 * בנקודה B נפגשים") doesn't match the anchor. Resolves to THE tangent line when the figure has exactly
 * one — 0 or 2+ is genuinely ambiguous → defer (escalate), never guess. The crossing avoids the touch
 * point when the touch is a member of the target circle (the intersecting-circles case: the tangent
 * meets the other circle at the shared point AND at K — K is the crossing away from it).
 */
const theTangentMeetsCircle: Rule = (s, ctx) => {
  // The subject may NAME its touch — "המשיק בנקודה A חותך…" / "the tangent at A cuts…" (the operator's
  // retry phrasing) — which SELECTS the tangent line tan-A (and disambiguates when several exist).
  // No `\b` after the Hebrew verb — Hebrew letters are not `\w`, so \b never matches there (the recorded ℓ trap).
  const subj = s.match(
    /^\s*(?:המשיק|the\s+tangent)\s+(?:(?:בנקודה|at)\s*([A-Za-z]\d*)\s+)?(?:חות(?:ך|כת)|פוגש\w*|נפגש\w*|cuts?|meets?|crosses|intersects?)(?![A-Za-z])/i,
  );
  if (!subj) return null;
  const tans = (ctx.lines ?? []).filter((l) => l.startsWith('tan-'));
  const named = subj[1] ? `tan-${up(subj[1])}` : null;
  if (named && !tans.includes(named)) return null; // names a tangent the figure doesn't have — escalate
  if (!named && tans.length !== 1) return null; // no tangent to refer to, or ambiguous which — escalate, never guess
  const tanId = named ?? tans[0];
  const touch = up(tanId.slice('tan-'.length));
  const center = resolveMentionedCircle(s, ctx);
  if (!center) return null; // must name/refer to a circle (else it's a line∩line statement)
  const K = crossingAfterCircle(s);
  if (!K || K === touch || K === up(center)) return null;
  if ((ctx.points ?? []).includes(K)) return null; // an EXISTING crossing target is an M1 statement — escalate rather than silently no-op
  const avoid = membersOfCenter(ctx, center).has(touch);
  return [
    { type: 'line-circle-intersection', id: K, line: tanId, circle: circleId(center), ...(avoid ? { avoid: touch } : { branch: 0 }) },
    { type: 'segment', a: touch, b: K }, // draw the chord the tangent cuts (touch → K), like lineMeetsCircle's drawn halves
  ];
};

/**
 * "circle O and circle P are tangent to each other at M" /
 * "מעגל O ומעגל P משיקים זה לזה בנקודה M" — two circles touching at one point. TWO
 * circles named + a tangent keyword (a single-circle "tangent to circle X" is the
 * tangent-LINE rule). Must run BEFORE tangentLine, which would otherwise grab the
 * משיק and draw a stray tangent line.
 *
 * Internal vs external is explicit and bilingual: **internal** on "internally" /
 * "from inside" / "פנימית" / "מבפנים" (one circle inside the other, |OP| = |r1−r2|);
 * otherwise **external** — the default and what "externally" / "from outside" /
 * "חיצונית" / "מבחוץ" also say (side by side, |OP| = r1+r2).
 */
const circlesTangent: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  // A "chord" word means a CHORD of one circle tangent to the OTHER (`tangentChord`, which runs first) —
  // never mutual tangency. Guarding here stops a chord whose far endpoint / labels don't all match
  // `tangentChord`'s shape from FALLING THROUGH to a wrong mutual-tangency that drops the chord (and
  // contradicts "the circles intersect") — escalate instead. (Operator session vk346px4.)
  if (/chord|מיתר/i.test(s)) return null;
  // Mutual tangency is a STATE ("tangent to each other at M" / "משיקים זה לזה"), never a crossing EVENT.
  // A cuts/meets keyword (חותך/פוגש/cuts/meets) means a tangent LINE meeting the other circle —
  // `tangentMeetsOtherCircle` (which runs first) owns that. Guarding here stops a near-miss of that rule
  // (e.g. a typo'd "שנקודה" for "בנקודה" that breaks its precise pair-match) from FALLING THROUGH to a
  // wrong mutual-tangency that silently repositions the circles and draws no line — escalate instead.
  if (INTERSECT_KW.test(s)) return null;
  // Either two NAMED circles ("circle O and circle P …") or a plural "two circles"/"שני מעגלים …" with no
  // names — the latter ("שני מעגלים משיקים מבחוץ") used to fall through to the LLM, which pinned default
  // radii (5/3) and broke ADR-052. Handle it deterministically with FREE radii instead.
  let named = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => up(m[1]));
  if (named.length < 2) {
    // PLURAL-list form: "circles O1 and O2" / "שני מעגלים O1 ו O2" — the two names follow the PLURAL noun
    // ("מעגלים"/"circles"), which the per-circle "מעגל X" regex above misses (the "ים"/"s" plural suffix
    // breaks the `מעגל\s+` adjacency, so the operator's stated O1/O2 were dropped and O/P invented — ADR-228 Am.).
    const pl = s.match(/(?:circles|מעגלים|מעגלי)\s+([A-Za-z]\d*)\s*(?:ו-?|\band\b|,)\s*([A-Za-z]\d*)/i);
    if (pl) named = [up(pl[1]), up(pl[2])];
  }
  const plural = /\bcircles\b|מעגלים|שני\s+מעגל|שתי\s+מעגל/i.test(s);
  if (named.length < 2 && !plural) return null; // a single circle ⇒ the tangent-line rule
  if (named.length >= 2 && named[0] === named[1]) return null;
  const c1 = named[0] ?? 'O';
  const c2 = named[1] ?? freeLabel([c1, ...(ctx.points ?? [])], ['P', 'Q', 'K', 'S']);
  if (c1 === c2) return null;
  const internal = /\binternal\w*\b|\bfrom\s+inside\b|\binside\b|פנימ|מבפנים/i.test(s);
  // Touch point: a named "at M"/"בנקודה M", else AUTO-name it (the student drew "two tangent circles"
  // without naming the touch) — avoiding the centres and existing points.
  const atM = s.match(/(?:\bat\b|בנקודה|מנקודה|בנקוד\S*)\s*([A-Za-z]\d*)\b/i);
  const at = atM ? up(atM[1]) : freeLabel([c1, c2, ...(ctx.points ?? [])], ['M', 'T', 'N', 'K']);
  const id1 = circleId(c1), id2 = circleId(c2);
  const have = new Set((ctx.circles ?? []).map((x) => x.toUpperCase()));
  const cmds: AnyCommand[] = [];
  // Each circle is a FREE-radius circle (ADR-052: unstated radius is a DOF), distinct seeds so it doesn't
  // read as a symmetric pair. `ifAbsent` preserves a previously STATED "circle O radius 5" (its radius
  // stays a given); a named centre shows, an unnamed default centre is auto (hidden until used).
  if (!have.has(c1)) cmds.push({ type: 'circle', id: id1, center: c1, radius: RADIUS_DEFAULT, freeRadius: true, ifAbsent: true, ...(!named.includes(c1) ? { autoCenter: true } : {}) });
  if (!have.has(c2)) cmds.push({ type: 'circle', id: id2, center: c2, radius: RADIUS_DEFAULT * 0.72, freeRadius: true, ifAbsent: true, ...(!named.includes(c2) ? { autoCenter: true } : {}) });
  cmds.push({ type: 'circles-tangent', circle1: id1, circle2: id2, at, external: !internal });
  return cmds;
};

/**
 * "AB משיק משותף לשני המעגלים" / "AB is a common tangent to the two circles" — a COMMON tangent
 * of TWO circles (ADR-239). The "common"/"משותף" word is the unique trigger; without this rule the
 * plural "מעגלים" + משיק fell through to `circlesTangent`, which re-read the utterance as MUTUAL
 * tangency of two NEW circles (inventing O,P and dropping the tangent line — the sq9lt4fj session
 * escalated to the LLM instead). Two variants:
 *
 *  - **Two touch points** ("AB משיק משותף…"): A rides circle 1, B rides circle 2, radius ⟂ tangent
 *    at each touch, segment AB drawn. Letter↔circle pairing follows the stated/figure order — an
 *    unstated default; a later explicit membership statement lowers per M1 and `swap` exists.
 *  - **At the shared touch point** ("המשיק המשותף בנקודה M…", M existing — the operator's "tangent
 *    at intersection"): membership of M on BOTH circles + centres collinear with M (⟺ common
 *    tangency at M; all idempotent when the circles are already tangent there) + a DRAWN tangent
 *    line at M, any fresh naming letters as ±offset markers (ADR-036/233).
 *
 * "External"/"internal" ("חיצוני"/"פנימי") select a CONFIGURATION of the same assertion (same
 * tangency constraints, different solution branch) — the solver lands on one and "show another
 * configuration" explores; a side-of-line bias is a filed follow-up, not a dropped magnitude.
 * Runs BEFORE `tangentChord`/`tangentMeetsOtherCircle`/`circlesTangent` (none checks "משותף").
 */
const commonTangent: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (!/common|משותף|משותפ/i.test(s)) return null;
  // The two circles: named per-circle ("למעגלים O1 ו O2" / "circles O and P"), else THE two circles
  // when the figure has exactly two ("לשני המעגלים" — the definite form of the operator's session).
  let named = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => up(m[1]));
  if (named.length < 2) {
    const pl = s.match(/(?:circles|מעגלים|מעגלי)\s+([A-Za-z]\d*)\s*(?:ו-?|\band\b|,)\s*([A-Za-z]\d*)/i);
    if (pl) named = [up(pl[1]), up(pl[2])];
  }
  const centres = named.length >= 2 ? named.slice(0, 2) : (ctx.circles ?? []).length === 2 ? [ctx.circles![0], ctx.circles![1]].map(up) : null;
  if (!centres || centres[0] === centres[1]) return null; // no two distinct circles to be common to → LLM
  const have = new Set(ctx.points ?? []);
  const atM = s.match(/(?:\bat\b|בנקודה)\s*([A-Za-z]\d*)\b/i);
  const at = atM ? up(atM[1]) : null;
  // The 1–2 labels NAMING the tangent ("AB משיק משותף…"), excluding the touch and the centres.
  const naming = labelRun(
    dropCircleRef(s)
      .replace(/(?:\bat\b|בנקודה)\s*[A-Za-z]\d*\b/gi, ' ')
      .replace(/tangent|משיק\S*|\bcommon\b|משותף|משותפת|\bline\b|הישר|הקו|למעגלים|מעגלים|לשני|המעגלים/gi, ' '),
    2,
  )?.filter((p) => p !== at && p !== centres[0] && p !== centres[1]);
  const [c1, c2] = centres;
  const id1 = circleId(c1), id2 = circleId(c2);
  // NAMED circles that don't exist yet are created (free radius per ADR-052, `ifAbsent` keeps a stated one).
  const haveCircles = new Set((ctx.circles ?? []).map((x) => x.toUpperCase()));
  const mk: AnyCommand[] = [];
  if (!haveCircles.has(c1)) mk.push({ type: 'circle', id: id1, center: c1, radius: RADIUS_DEFAULT, freeRadius: true, ifAbsent: true });
  if (!haveCircles.has(c2)) mk.push({ type: 'circle', id: id2, center: c2, radius: RADIUS_DEFAULT * 0.72, freeRadius: true, ifAbsent: true });
  if (at) {
    // Variant 2 — the common tangent AT the shared touch point M ("tangent at the intersection").
    const cmds: AnyCommand[] = [...mk];
    if (have.has(at)) {
      // M exists (typically the stated touch of "…משיקים בנקודה M"): assert its membership on BOTH
      // circles + centres collinear with it (⟺ common tangency at M) — all idempotent when the pair
      // is already tangent there, constraints that flex the figure when not.
      cmds.push(
        { type: 'point-on-circle', id: at, circle: id1 },
        { type: 'point-on-circle', id: at, circle: id2 },
        { type: 'set-line', points: [c1, at, c2] },
      );
    } else {
      // M is new: "a common tangent at ONE point M" says the circles are TANGENT at M — the
      // circles-tangent device owns that state (free radii, gap-driving coincide).
      cmds.push({ type: 'circles-tangent', circle1: id1, circle2: id2, at, external: true });
    }
    cmds.push({ type: 'tangent', id: `tan-${at}`, circle: id1, at, visible: true });
    const fresh = (naming ?? []).filter((p) => !have.has(p));
    if (fresh.length) cmds.push(...lineMarkers(`tan-${at}`, fresh));
    return cmds;
  }
  if (!naming || naming.length < 2) return null; // no touch labels and no touch point → LLM
  const [A, B] = naming;
  // Variant 1 — a common tangent touching circle 1 at A and circle 2 at B. The student stated only
  // "AB touches both", never WHICH touch rides WHICH circle — the pairing is a soft default (`softPair`,
  // stated/figure order) that the store SWAPS when a later explicit membership names the opposite
  // assignment (M4: defaults yield to statements; ADR-239).
  return [
    ...mk,
    { type: 'point-on-circle', id: A, circle: id1, softPair: true },
    { type: 'point-on-circle', id: B, circle: id2, softPair: true },
    { type: 'set-perpendicular', a: c1, b: A, c: A, d: B, implicit: true }, // radius c1→A ⟂ the tangent
    { type: 'set-perpendicular', a: c2, b: B, c: A, d: B, implicit: true }, // radius c2→B ⟂ the tangent
    { type: 'segment', a: A, b: B },
  ];
};

/**
 * "the chord AD in circle P is tangent to circle O at A" /
 * "המיתר AD במעגל P משיק למעגל O בנקודה A" — a CHORD of one (host) circle that is TANGENT to
 * ANOTHER circle at one of its endpoints. Distinct from `circlesTangent` (the two circles tangent
 * to EACH OTHER — a state) and from `tangentMeetsOtherCircle` (a tangent LINE that CUTS the other
 * circle): here a "chord" word names a chord of the HOST circle (named BEFORE the tangent keyword),
 * and "tangent to circle Y at Z" makes that chord touch the OTHER circle Y at its endpoint Z. The
 * touch point Z lies on both circles (a shared intersection), so the tangency is radius(Y-centre →
 * Z) ⟂ the chord. Both endpoints are placed on the host circle; the far endpoint is the new DOF the
 * ⟂ drives so the chord touches Y at Z.
 *
 * Without this the two "circle X" mentions + the tangent keyword fall through to `circlesTangent`,
 * which reads them as mutual tangency — silently dropping the chord's far endpoint and the chord
 * itself, and asserting a tangency that contradicts "the circles intersect" (operator session
 * vk346px4). Must run BEFORE `circlesTangent` (and `chord`, which would drop the tangency).
 */
const tangentChord: Rule = (s) => {
  if (!/chord|מיתר/i.test(s)) return null;
  if (!/tangent|משיק/i.test(s)) return null;
  if (INTERSECT_KW.test(s)) return null; // a CUTTING event ("חותך"/"meets") → tangentMeetsOtherCircle owns it
  // Split at the tangent keyword: the chord + its host circle precede it; the tangency circle + point follow.
  const ti = s.search(/tangent|משיק/i);
  const before = s.slice(0, ti);
  const after = s.slice(ti);
  const host = circleCenter(before); // the chord's host circle ("…במעגל P משיק…")
  const target = circleCenter(after); // the circle it is tangent to ("…משיק למעגל O…")
  if (!host || !target || up(host) === up(target)) return null; // two DIFFERENT named circles
  const ends = labelRun(dropCircleRef(before).replace(/chord|מיתר/gi, ' '), 2); // the chord's endpoints
  if (!ends) return null;
  const zM = after.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i); // the touch point ("…at A" / "…בנקודה A")
  const Z = zM ? up(zM[1]) : null;
  if (!Z || !ends.includes(Z)) return null; // the touch point must be one of the chord's own endpoints
  const hostCirc = circleId(host);
  return [
    { type: 'point-on-circle', id: ends[0], circle: hostCirc }, // both endpoints lie on the HOST circle (a chord)
    { type: 'point-on-circle', id: ends[1], circle: hostCirc },
    { type: 'point-on-circle', id: Z, circle: circleId(target) }, // the touch point lies on the TARGET circle (idempotent at a shared intersection)
    { type: 'set-perpendicular', a: up(target), b: Z, c: ends[0], d: ends[1], implicit: true }, // radius(target→Z) ⟂ the chord ⇒ tangent at Z
    { type: 'segment', a: ends[0], b: ends[1] }, // draw the chord
  ];
};

/** "tangent to circle O at A" / "משיק למעגל O בנקודה A" — a *drawn* tangent line (⟂ the radius at A). */
const LINE_MARK = 5; // offset of a drawn line's named endpoint markers from the line's anchor

/**
 * When a drawn line is NAMED by extra point labels (beyond the points that define it), create
 * them as on-line markers so they're referenceable later (ADR-036). One label → a single marker
 * at +offset from the line's anchor; two → a straddling pair at ±offset (a tangent's "CD" around
 * the tangency point, the line's anchor). Used by the tangent, perpendicular- and parallel-line rules.
 */
function lineMarkers(lineId: Id, labels: Id[]): AnyCommand[] {
  if (labels.length === 1) return [{ type: 'point-on-line', id: labels[0], line: lineId, offset: LINE_MARK }];
  if (labels.length >= 2)
    return [
      { type: 'point-on-line', id: labels[0], line: lineId, offset: LINE_MARK },
      { type: 'point-on-line', id: labels[1], line: lineId, offset: -LINE_MARK },
    ];
  return [];
}

/**
 * The point labels NAMING a drawn line — the 1–2 labels right after the line word ("line PQ …" /
 * "הישר PQ …"), OR leading the utterance immediately before the relation keyword ("DE ⟂ AB …" /
 * "DE אנך ל-AB …"), excluding the points that already define the line. Both forms are anchored (on
 * the line word, or on the relation keyword) so they can't misfire on an English keyword; returns
 * [] when the line isn't named by points.
 */
function lineNameLabels(s: string, exclude: Id[]): Id[] {
  const m =
    s.match(/(?:\bline\b|\bray\b|הישר|ישר|הקו|\bקו\b|קרן)\s+\b([A-Za-z]\d*)(?:\s*([A-Za-z]\d*))?\b/i) ??
    s.match(/^\s*\b([A-Za-z]\d*)(?:\s*([A-Za-z]\d*))?\b\s*(?=perpendicular|⊥|מאונ[כך]|אנ[כך]|parallel|∥|מקביל)/i);
  if (!m) return [];
  const ex = new Set(exclude.map((e) => e.toUpperCase()));
  const out: Id[] = [];
  for (const tok of [m[1], m[2]]) {
    if (!tok) continue;
    const u = up(tok);
    if (!ex.has(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * "from a point E outside circle O, the two tangents touch the circle at A and B" /
 * "מנקודה E מחוץ למעגל יוצאים שני משיקים הנוגעים במעגל בנקודות A ו-B" — the TWO tangents from an
 * external point. The touch points A,B lie on the circle AND on the circle with diameter OE (Thales:
 * a tangent ⟂ its radius, so ∠OAE = 90°), so A,B = circle O ∩ (circle on diameter OE). Built from
 * existing primitives: the midpoint M of OE, a HIDDEN auxiliary circle through O centred at M, the two
 * circle∩circle touch points, and the two tangent segments EA, EB. Runs before the single `tangentLine`
 * (tangent AT a point already on the circle). A NEW external E is placed outside (it can also pre-exist).
 */
const tangentsFromExternal: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (!/\btwo\b|tangents|שני|שתי|משיקים/i.test(s)) return null; // TWO tangents from a point, not a single tangent-at-a-point
  const eM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?\s+|(?:מנקודה|מהנקודה|מ\s*נקודה)\s+|מ-\s*)([A-Za-z]\d*)(?![A-Za-z])/i); // "מנקודה E" OR abbreviated "מ-E" (#96)
  if (!eM) return null;
  const named = circleCenter(s);
  const center = named && /^[A-Z]/.test(named) ? named : ctx.circles?.length === 1 ? ctx.circles[0] : null;
  if (!center) return null;
  const E = up(eM[1]);
  const circ = circleId(center);
  // The two touch points: named explicitly ("…at A and B" / "…בנקודות A ו-B"), else AUTO-named — the
  // student needn't name them. "מנקודה A יוצאים שני משיקים למעגל O" / "two tangents from A to circle O"
  // just wants the two tangent lines drawn ([ADR-126]); previously a missing touch-point pair bailed the
  // rule to the LLM (which built nothing).
  const abM = s.match(/\b([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)\b/i); // a named pair "A and B", if any
  let A: Id, B: Id;
  if (abM && new Set([E, up(abM[1]), up(abM[2])]).size === 3 && ![up(abM[1]), up(abM[2])].includes(up(center))) {
    A = up(abM[1]);
    B = up(abM[2]);
  } else {
    const taken0 = [E, up(center), ...(ctx.points ?? [])];
    A = freeLabel(taken0, ['T', 'S', 'U', 'V', 'W', 'G', 'H']);
    B = freeLabel([...taken0, A], ['S', 'U', 'V', 'W', 'G', 'H', 'T']);
  }
  const out: AnyCommand[] = [];
  // The external apex, if new. Seeded CLOSE to the default circle (~1.2× its radius, like a textbook
  // tangent sketch) rather than far out: a far apex puts directional follow-ups like "המשך BD חותך את
  // המשך OC" in the wrong basin (the extensions then cross on the far side), and a close apex also gives
  // wider, more textbook-like tangents. The touch points stay free DOFs the solver/sampler can still move.
  if (!ctx.points?.includes(E)) out.push({ type: 'free-point', id: E, x: 6, y: 0, free: true }); // a FREE DOF (ADR-052)

  // If EITHER touch point ALREADY EXISTS (e.g. A is a diameter endpoint already on the circle), the Thales
  // circle∩circle construction can't be used — it would RE-CREATE that point ("'A' is already defined",
  // ADR-094). Fall back to the tangency-CONSTRAINT form (the two-tangent generalisation of ADR-081/093):
  // each touch P is on the circle with EP ⟂ OP, the figure flexing so both are real tangents from E.
  if ([A, B].some((p) => ctx.points?.includes(p))) {
    for (const P of [A, B]) {
      out.push(
        { type: 'point-on-circle', id: P, circle: circ }, // idempotent if P already on the circle (ADR-093); creates it (free θ) if new
        { type: 'set-perpendicular', a: up(center), b: P, c: E, d: P, implicit: true }, // EP ⟂ OP — tangent at P (structural, no right-angle mark)
        { type: 'segment', a: E, b: P },
      );
    }
    return out;
  }

  // Both touch points NEW → the deterministic Thales construction (the two touch points lie on the circle
  // with diameter OE; ∠OPE = 90°), taking both branches for the two distinct tangents.
  const mid = `~tanmid-${center}${E}`; // hidden centre of the Thales circle on O-E (scaffolding; "~" → not drawn)
  const aux = `tanaux-${center}${E}`;
  out.push(
    { type: 'midpoint', id: mid, a: center, b: E },
    { type: 'circle-through', id: aux, center: mid, through: center, hidden: true }, // circle on diameter OE (hidden)
    { type: 'circle-circle-intersection', id: A, circle1: circ, circle2: aux, branch: 0 }, // touch point 1
    { type: 'circle-circle-intersection', id: B, circle1: circ, circle2: aux, branch: 1 }, // touch point 2
    { type: 'segment', a: E, b: A }, // tangent 1
    { type: 'segment', a: E, b: B }, // tangent 2
  );
  return out;
};

/**
 * A SINGLE tangent from an external point: "ED משיק למעגל" / "מנקודה E יוצא משיק למעגל" /
 * "tangent from E to circle O" / "from E a tangent touches the circle at D". One of the two tangent
 * lines from the existing external point E, touching at a point on the circle (named or auto). Same
 * Thales-circle construction as the two-tangent rule, taking one branch. Runs after the two-tangent
 * rule and before the single `tangentLine` (tangent AT a point already on the circle, via "at/בנקודה").
 */
const tangentFromExternal: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (/\btwo\b|שני|שתי|משיקים/i.test(s)) return null; // plural → the two-tangent rule
  const named = circleCenter(s);
  const center = named && /^[A-Z]/.test(named) ? named : ctx.circles?.length === 1 ? ctx.circles[0] : null;
  if (!center) return null;
  const have = new Set(ctx.points ?? []);
  const members = membersOfCenter(ctx, center); // labels already ON this circle
  const labels = (s.match(/[A-Z]\d*/g) ?? []).filter((l) => l !== center); // uppercase tokens = point labels
  const atM = s.match(/(?:\bat\b|בנקודה)\s*([A-Za-z]\d*)/i); // "at D" / "בנקודה D" → the touch point (NOT the apex)
  const atPoint = atM ? up(atM[1]) : null;
  // "tangent AT an EXISTING point" — e.g. "KB tangent at K", K already placed — is NOT a tangent FROM an
  // external apex: its touch point is GIVEN, which this Thales construction can't honour (it computes its
  // own touch and would invent a new point, ignoring K). Defer to `tangentLine`, which reads the named
  // segment KB as tangent at its endpoint K (put K on the circle + radius O–K ⟂ KB).
  if (atPoint && have.has(atPoint)) return null;
  // The apex is the EXISTING external point — explicit "from E" / "מנקודה E" wins; else the single
  // existing point that isn't introduced as the touch ("at …"). If none exists, defer (it's a
  // tangent AT a point on the circle, or needs the LLM).
  const fromM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?|מנקודה|\bמ-)\s*([A-Za-z]\d*)/i);
  const fromName = fromM ? up(fromM[1]) : null;
  let apex: Id | null = null;
  let placeApex = false;
  if (fromName) {
    apex = fromName; // explicit "from E" — the apex; place it externally if it doesn't exist yet
    placeApex = !have.has(fromName);
  } else {
    const existing = labels.filter((l) => have.has(l) && l !== atPoint); // a named pair "ED" — the existing one is the apex
    if (existing.length === 1) apex = existing[0];
  }
  if (!apex) return null;
  // The external apex must lie OFF the circle. A named point already ON the circle is the tangency point,
  // not the source of an external tangent: "BA משיק למעגל" with A on the circle is the tangent AT A (B a
  // point along it), NOT a tangent FROM A to a second touch — a Thales aux-circle on an on-circle apex is
  // internally tangent and collapses the computed touch onto the apex. Assign the apex role by circle
  // MEMBERSHIP (the semantic fact), never by which label happens to pre-exist (a proxy). Defer to
  // `tangentLine`, which reads the on-circle endpoint as the tangency point (design-rules §2.2; ADR-233 —
  // the unclosed on-circle-endpoint + NEW-off-circle-endpoint member of the ADR-081/082 family).
  if (members.has(apex)) return null;
  const newLabel = labels.find((l) => l !== apex && !have.has(l));
  const touch = newLabel ?? (atPoint && !have.has(atPoint) ? atPoint : freeLabel([...have, ...labels, center], ['T', 'S', 'D', 'F']));
  const circ = circleId(center);
  const mid = `~tanmid-${center}${apex}`; // hidden centre of the Thales circle on O-apex (scaffolding; "~" → not drawn)
  const aux = `tanaux-${center}${apex}`;
  const out: AnyCommand[] = [];
  if (placeApex) out.push({ type: 'free-point', id: apex, x: 12, y: 0, free: true }); // the external apex, if new — a FREE DOF (ADR-052): its distance from O is unstated, so a later given (∠ADB = α, |AG| = …) can flex it
  out.push(
    { type: 'midpoint', id: mid, a: center, b: apex }, // centre of the Thales circle on O-apex
    { type: 'circle-through', id: aux, center: mid, through: center, hidden: true },
    { type: 'circle-circle-intersection', id: touch, circle1: circ, circle2: aux, branch: 0 }, // the touch point
    { type: 'segment', a: apex, b: touch }, // the tangent
  );
  return out;
};

const tangentLine: Rule = (s, ctx) => {
  if (!/tangent|משיק/i.test(s)) return null;
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const atM = s.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i);
  const have = new Set(ctx.points ?? []);
  // The 1–2 point labels NAMING the line ("הישר CD משיק…" / "AB משיק…"), excluding the
  // tangency point (the "at X" clause) and the centre.
  const named = dropCircleRef(s)
    .replace(/(?:\bat\b|בנקודה|ב-?)\s*[A-Za-z]\d*\b/gi, ' ')
    .replace(/tangent|משיק\S*|\bline\b|הישר|הקו|למעגל|מעגל/gi, ' ');
  // NOTE: a degenerate pair ("BB") is deliberately NOT filtered here — it flows to the existing-segment
  // branch whose set-perpendicular the ADR-202 apply gate rejects with a clear message (the ONE chokepoint
  // for zero-length operands, whatever their source). The article-as-label misread ("through point A a
  // tangent…" → pair A,A) is fixed at ITS root instead: "a"/"an" joined FILLER (lowercase-only).
  const pts = labelRun(named, 2);

  // The touch point T. Usually named explicitly ("… at K" / "בנקודה K"). But a student commonly OMITS it
  // when it is geometrically forced — "KB משיק למעגל" / "KB tangent to the circle" where K is ALREADY on
  // the circle: the only possible tangency point is that on-circle endpoint, so naming it is redundant.
  // When there is no "at" clause, INFER T from the named segment's endpoint that already lies on THIS
  // circle (exactly one — both endpoints on the circle would make the segment a chord, not a tangent, so
  // don't infer). Without this the natural phrasing falls through every tangent rule (tangentFromExternal
  // bails because both endpoints already exist, so there is no unique external apex) and escalates to the
  // LLM, which returns "not-understood" / "built-nothing" — the engine builds it perfectly once it has the
  // command (ADR-082; the explicit-"at K" path is ADR-081).
  const members = membersOfCenter(ctx, center);
  let T = atM ? up(atM[1]) : null;
  if (!T && pts) {
    const onCircle = pts.filter((p) => members.has(p));
    if (onCircle.length === 1) T = onCircle[0];
  }
  // Third source (issue #100): a tangent drawn THROUGH a point that is ON the circle touches there —
  // "דרך הנקודה A העבירו משיק למעגל" / "through point A a tangent is drawn to the circle" (the textbook
  // form when A is a circle∩circle intersection). Membership-gated (ADR-233: role by membership, never
  // by phrasing luck) — a through-point OFF the circle is an external apex and belongs to
  // `tangentFromExternal`, which runs earlier and reads the from/מנקודה forms.
  if (!T) {
    const thr = throughPointLabel(s);
    if (thr && members.has(thr)) T = thr;
  }
  if (!T) return null;
  const lineId = `tan-${T}`;
  const naming = pts && pts[0] !== T && pts[1] !== T && pts[0] !== up(center) && pts[1] !== up(center) ? pts : null;

  // An EXISTING line declared tangent ("AB משיק … בנקודה F", with A, B and the touch point F
  // all already placed): this is a tangency CONSTRAINT on the existing segment — NOT a freshly
  // drawn tangent. Adapt the circle so its radius O–T is ⟂ to the existing line (T is already on
  // the circle, here via the inscribed-quad's concyclic given). We must NEVER re-create A, B as
  // markers on a new tangent line: A is an ancestor of the circle (O = circumcentre of points on
  // A's sides), so a `point-on-line A → tan-F → circle-O → … → A` edge closes a dependency cycle
  // and the step fails with "unresolved dependencies" instead of flexing the figure (ADR-075).
  // Scope: assumes T is already on the circle (true for the marked-touch-point case); a tangency
  // point not yet on the circle is a follow-up.
  if (naming && have.has(naming[0]) && have.has(naming[1]) && have.has(T)) {
    return [{ type: 'set-perpendicular', a: up(center), b: T, c: naming[0], d: naming[1], implicit: true }];
  }

  // An EXISTING segment tangent at its OWN ENDPOINT — "KB משיק … בנקודה K", where the named line's two
  // labels INCLUDE the touch point T as an endpoint (vs ADR-075's separate touch F on line CD). The segment
  // IS the tangent, touching at its end: put T ON the circle and constrain the radius O–T ⟂ the segment, so
  // the figure flexes to make KB tangent at K (verified: |OK| = radius, OK ⟂ KB). Without this the greedy
  // `tangentFromExternal` misread "KB at K" as a tangent FROM B to an invented point, ignoring K (ADR-081).
  if (pts && have.has(pts[0]) && have.has(pts[1]) && (pts[0] === T || pts[1] === T)) {
    return [
      { type: 'point-on-circle', id: T, circle: circleId(center) }, // the touch point lies on the circle
      { type: 'set-perpendicular', a: up(center), b: T, c: pts[0], d: pts[1], implicit: true }, // radius O–T ⟂ the tangent segment (structural, no right-angle mark)
    ];
  }

  // Otherwise a DRAWN tangent line. If it is *named* by point labels ("הישר CD משיק…" /
  // "line CD tangent…"), add the NEW ones as ±offset markers along the tangent (ADR-036) so
  // they're referenceable later — but skip any pre-existing label, so we never redefine (and
  // cycle through) an existing point.
  const cmds: AnyCommand[] = [{ type: 'tangent', id: lineId, circle: circleId(center), at: T, visible: true }];
  // Every point the student NAMED that lies on this tangent line becomes a marker — so nothing they typed
  // is dropped, and each is referenceable later. Three sources, unified: the touch's segment-mate ("BA" → B,
  // the external end of the tangent AT A), the two definers of a named tangent line ("line CD tangent at A"
  // → C, D), and an explicit external apex ("מנקודה D יוצא משיק … בנקודה B" / "from D …" → D, which a later
  // fact like "the extension of CA meets the tangent at D" drives to the crossing, ADR-084). Fresh labels
  // become ±offset sliders along the tangent (ADR-036 — a free DOF, ADR-052); a pre-existing label is left
  // as-is (never redefined, so no dependency cycle). Before ADR-233 the off-circle endpoint of "BA משיק
  // למעגל" was silently dropped when the other endpoint was the touch (design-rules §6 honesty).
  const fromM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?|מנקודה|מהנקודה|\bמ-)\s*([A-Za-z]\d*)/i);
  const onLine: Id[] = [];
  for (const p of [...(pts ?? []), ...(fromM ? [up(fromM[1])] : [])]) {
    if (p !== T && p !== up(center) && !onLine.includes(p)) onLine.push(p); // not the touch, not the centre
  }
  const fresh = onLine.filter((p) => !have.has(p));
  if (fresh.length) cmds.push(...lineMarkers(lineId, fresh));
  return cmds;
};

/** "bisector of angle ABC" / "חוצה זווית ABC" — a *drawn* angle bisector (not "AD bisects …", which places a point). */
const bisectorLine: Rule = (s) => {
  if (!/bisector|חוצ/i.test(s)) return null;
  if (INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s)) return null;
  if (/\b[A-Za-z]\d*\s*[A-Za-z]\d*\b\s*(?:bisects?|חוצ)/i.test(s)) return null; // "AD bisects ∠.." = placing a point (deferred)
  const ids = labelRun(s.replace(/bisector|angle|זוו?ית|הזוו?ית|חוצה|חוצי|חוצ|את/gi, ' '), 3);
  if (!ids) return null;
  return [{ type: 'bisector', id: `bis-${ids.join('')}`, vertex: ids[1], p: ids[0], q: ids[2], visible: true }];
};

// The point a drawn line passes through: "through P" / "at P" / "דרך P" / "בנקודה P" (at point P).
// "at"/"בנקודה" lets "DE ⟂ AB at C" / "DE אנך ל-AB בנקודה C" name the foot as the through-point.
const THROUGH_PT = String.raw`(?:through|\bat\b|דרך|בנקודה)\s+([A-Za-z]\d*)\b`;

/**
 * "… cuts/meets <the line/the extension of> CD at E" — the cut-clause a drawn ⊥/∥ line compound ends
 * with. Shared by {@link perpendicularLine} and {@link parallelLine}. The filler group must swallow
 * EVERY article/line/extension word in BOTH languages: before it accepted only the Hebrew fillers, so
 * "cuts line BD at G" / "cuts the extension of BD at G" failed to bind — and the rule then fell through
 * to the ADR-036 line-NAMING fallback, which read "line BD" as the perpendicular's own name and grabbed
 * the EXISTING point D as an on-line marker (a silently wrong figure; T1 wiring finding, ADR-236).
 */
const CUT_VERB = String.raw`(?:חות[כך]|נחת\w*|פוגש\w*|פגש|\bcuts?\b|\bcrosses?\b|\bmeets?\b|\bintersects?\b)`;
const CUT_FILLER = String.raw`(?:את\s+|the\s+|line\s+|ray\s+|segment\s+|extension\s+(?:of\s+)?|extended\s+|chord\s+|radius\s+|side\s+|diagonal\s+|ה?קו\s+|ה?ישר\s+|ה?משך\s+|ה?קטע\s+|ה?מיתר\s+|ה?רדיוס\s+|ה?צלע\s+|ה?אלכסון\s+)*`;
const LINE_CUT = new RegExp(String.raw`${CUT_VERB}\s*${CUT_FILLER}([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?(?:בנקודה|\bat\b|ב-)\s*([A-Za-z]\d*)`, 'i');
/** Reference semantics of a LINE_CUT target (the issue-#22 class, per operand): a bare pair (or "הקטע"/
 *  "segment") means the SEGMENT — the crossing lands WITHIN it (order [c1,e,c2], ADR-077); "המשך"/
 *  extension is DIRECTIONAL — beyond the 2nd letter (order [c1,c2,e], ADR-054); "הישר"/line/ray is the
 *  infinite line — unconstrained. Classified on the matched cut span (`cut[0]`), where the target's own
 *  reference words live (never the whole utterance — that's the utterance-global defect this fixes). */
const cutTargetOrder = (cutText: string, c1: Id, c2: Id, e: Id): Id[] | undefined =>
  /המש(?:ך|כי(?:ם|הם|הן)?)|extension|extended/i.test(cutText) ? [c1, c2, e]
  : /\bline\b|הישר|הקו|\bray\b|קרן/i.test(cutText) ? undefined
  : [c1, e, c2];
/** A cut verb aimed at a NAMED segment (two labels) — if this is present but {@link LINE_CUT} didn't
 *  bind, the utterance is a cut compound we can't fully read → escalate, never half-parse. A cut verb
 *  with a PRONOUN target ("וחותך אותו בנקודה E" — cuts IT, i.e. the reference segment) is NOT this:
 *  that's the reposition/foot form the plain construct handles (its through-point IS the cut). */
const LINE_CUT_TARGET = new RegExp(String.raw`${CUT_VERB}\s*${CUT_FILLER}[A-Za-z]\d*\s*[A-Za-z]\d*\b`, 'i');

/** "line through P perpendicular to AB" / "ישר דרך P מאונך ל-AB" / "DE אנך ל-AB בנקודה C" — a *drawn* perpendicular line through a point. */
const perpendicularLine: Rule = (s, ctx) => {
  if (!/perpendicular|⊥|מאונ[כך]|אנ[כך]/i.test(s)) return null;
  const thr = s.match(new RegExp(THROUGH_PT, 'i'));
  if (!thr) return null; // no through-point ⇒ it's the ⟂ constraint or a foot, not a drawn line
  const seg = s
    .replace(new RegExp(THROUGH_PT, 'gi'), ' ') // drop the through-clause so its point isn't read as the segment
    .match(/(?:perpendicular\s*to|⊥|מאונ[כך]\s*ל-?|אנ[כך]\s*ל-?)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!seg) return null;
  const [P, a, b] = [up(thr[1]), up(seg[1]), up(seg[2])];
  const have = new Set(ctx.points ?? []);
  const lineId = `perp-${P}-${a}${b}`;
  const out: AnyCommand[] = [];
  if (!have.has(P)) out.push({ type: 'point-on-segment', id: P, a, b }); // the through/foot point on AB, if new

  // "… חותך את CD בנקודה E" / "… cuts CD at E" — the perpendicular MEETS another segment at a NEW point.
  // Without this the rule dropped the cut and drew only a bare line (operator: "it just drew a line").
  // Build the perpendicular as SCAFFOLDING (not a long drawn line), cross it with CD to place E, and draw
  // the perpendicular SEGMENT P–E (e.g. EK) — that's the figure the student wants, not an infinite line.
  // The cut verb anchors the match, so the SECOND "בנקודה"/"at" (the result point) is read, not P's.
  const cut = s.match(LINE_CUT);
  if (cut) {
    const [c1, c2, e] = [up(cut[1]), up(cut[2]), up(cut[3])];
    const abId = `line-${c1}${c2}`;
    const ord = cutTargetOrder(cut[0], c1, c2, e); // bare = within, המשך = beyond, הישר = free (issue #22)
    out.push({ type: 'perpendicular-line', id: lineId, through: P, a, b, visible: false }); // scaffolding for the ∩
    out.push({ type: 'line-through', id: abId, a: c1, b: c2 }); // the segment it cuts, as a line
    out.push({ type: 'line-intersection', id: e, line1: lineId, line2: abId, ...(ord ? { order: ord } : {}) }); // E = perpendicular ∩ CD
    out.push({ type: 'segment', a: e, b: P }); // draw the perpendicular segment E–P (e.g. EK)
    return out;
  }
  // A cut verb aimed at a NAMED segment is present but the clause didn't bind (an exotic phrasing / a
  // multi-cut compound): escalate rather than half-parse. The old fallback drew a bare line and let the
  // ADR-036 naming read the CUT line's letters as this line's own name — grabbing an existing point onto
  // the perpendicular (the "cuts line BD at G placed D" mis-parse). A pronoun cut ("וחותך אותו בנקודה E")
  // falls through — that's the reposition/foot form, whose through-point IS the cut.
  if (LINE_CUT_TARGET.test(s)) return null;

  // No cut: CONSTRUCT a drawn perpendicular through P, with any named endpoints as markers straddling it
  // (ADR-036). The markers REUSE the named points if they already exist — a bare "segment CD" then
  // "CD ⟂ AB at F" REPOSITIONS C,D onto the perpendicular, a clean cross, without redefinition errors.
  // The line-NAME is read only from the text BEFORE any intersect word, so a cut-clause's letters
  // ("…and line BD") can never be mistaken for this line's own name (ADR-236).
  const nameScope = INTERSECT_KW.test(s) ? s.slice(0, s.search(INTERSECT_KW)) : s;
  out.push({ type: 'perpendicular-line', id: lineId, through: P, a, b, visible: true });
  out.push(...lineMarkers(lineId, lineNameLabels(nameScope, [P, a, b])));
  return out;
};

/** "line through P parallel to AB" / "ישר דרך P מקביל ל-AB" / "DE מקביל ל-AB בנקודה C" — a *drawn* parallel line through a point. */
const parallelLine: Rule = (s, ctx) => {
  if (!/parallel|∥|מקביל/i.test(s)) return null;
  const thr = s.match(new RegExp(THROUGH_PT, 'i'));
  if (!thr) return null; // no through-point ⇒ it's the ∥ constraint, not a drawn line
  const seg = s
    .replace(new RegExp(THROUGH_PT, 'gi'), ' ')
    .match(/(?:parallel\s*to|∥|מקביל\s*ל-?)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!seg) return null;
  const [P, a, b] = [up(thr[1]), up(seg[1]), up(seg[2])];
  const lineIdCut = `par-${P}-${a}${b}`;
  // "the line through P parallel to AB cuts CD at E" — the parallel MEETS another segment at a new
  // point (the ⊥ rule's cut compound, mirrored — same LINE_CUT clause, same scaffolding shape).
  const cut = s.match(LINE_CUT);
  if (cut) {
    const [c1, c2, e] = [up(cut[1]), up(cut[2]), up(cut[3])];
    const abId = `line-${c1}${c2}`;
    const ord = cutTargetOrder(cut[0], c1, c2, e); // bare = within, המשך = beyond, הישר = free (issue #22)
    return [
      { type: 'parallel-line', id: lineIdCut, through: P, a, b, visible: false }, // scaffolding for the ∩
      { type: 'line-through', id: abId, a: c1, b: c2 },
      { type: 'line-intersection', id: e, line1: lineIdCut, line2: abId, ...(ord ? { order: ord } : {}) },
      { type: 'segment', a: e, b: P },
    ];
  }
  // A cut verb aimed at a named segment we couldn't bind → escalate, don't half-parse (see
  // perpendicularLine — the same ADR-036 name-grab hazard, the same pronoun-cut exemption).
  if (LINE_CUT_TARGET.test(s)) return null;
  const nameScope = INTERSECT_KW.test(s) ? s.slice(0, s.search(INTERSECT_KW)) : s;
  const names = lineNameLabels(nameScope, [P, a, b]);
  const have = new Set(ctx.points ?? []);
  // If the NAMED line already exists, constrain it ∥ AB (parallels don't meet AB, so no cut-point).
  if (names.length === 2 && names.every((n) => have.has(n))) {
    const [n1, n2] = names;
    return [
      { type: 'segment', a: n1, b: n2 },
      { type: 'set-parallel', a: n1, b: n2, c: a, d: b },
    ];
  }
  const lineId = `par-${P}-${a}${b}`;
  // Otherwise CONSTRUCT: a drawn parallel through P; a NAME marks its far end(s) on it (ADR-036).
  return [
    { type: 'parallel-line', id: lineId, through: P, a, b, visible: true },
    ...lineMarkers(lineId, names),
  ];
};

/**
 * "circle through A B C" / "circumscribed circle of ABC" / "מעגל חוסם את ABC" /
 * "מעגל דרך A B C" — the circle determined by three points (centre = circumcentre).
 * Distinct from circle-through (centre + ONE point): this reads exactly 3 labels.
 */
/**
 * "the circle circumscribing triangle ABC cuts CE at D" / "המעגל החוסם את משולש ABC חותך את CE בנקודה D"
 * — the CIRCUMCIRCLE of a triangle (through its 3 vertices), intersected with a segment at a new point.
 * Builds the circumcircle + the crossing of line CE with it. The cut segment normally shares a vertex
 * with the triangle (C is on the circumcircle), so D is the OTHER crossing (avoid the shared vertex).
 * Runs before `triangle`/`circumcircle` so the compound isn't half-parsed into just the circle.
 */
const circumcircleMeetsSegment: Rule = (s, ctx) => {
  if (!/circle|מעגל/i.test(s)) return null;
  const cue = s.match(/circumscrib\w*|חוסם|\bthrough\b|דרך/i); // circumcircle cue (חוסם ≠ inscribed חסום)
  const cut = s.match(/חות[כך]|נחתכ?\w*|נפגש\w*|פוגש\w*|cuts?|crosses?|intersects?|meets?/i);
  const at = s.match(/(?:\bat\b|בנקודה|ב-)\s*([A-Za-z]\d*)\b/i);
  if (!cue || !cut || !at || cut.index! < cue.index!) return null;
  const D = up(at[1]);
  // the shape's vertices: the labels between the cue and the cut verb ("…circumscribing [triangle] ABC
  // cuts…"). #81: a 4-label QUAD run is accepted too — circumcircle of three + the 4th concyclic
  // (mirroring `circumcircle`'s four-branch). When the circle already EXISTS, the ADR-291 reference
  // resolution lets `lineMeetsCircle` claim the utterance first — this rule owns only CREATION.
  const between = s.slice(cue.index! + cue[0].length, cut.index).replace(/triangle|משולש|מרובע|quad\w*|את|\bof\b|\bthe\b/gi, ' ');
  const tri = labelRun(between, 4) ?? labelRun(between, 3);
  if (!tri) return null;
  const [a, b, c] = tri;
  // the cut segment: the 2 labels between the cut verb and "at".
  const seg = labelRun(s.slice(cut.index! + cut[0].length, at.index).replace(/את|\bthe\b|\bline\b|הישר|הקו|המש(?:ך|כי(?:ם|הם|הן)?)/gi, ' '), 2);
  if (!seg || seg.includes(D)) return null;
  const [p, q] = seg;
  const shared = [p, q].find((x) => [a, b, c].includes(x)) ?? p; // the endpoint already on the circumcircle
  const other = shared === p ? q : p; // the segment's OTHER endpoint
  const lineId = `line-${p}${q}`;
  // #81 (ADR-291, M1 resolution-before-creation): when a circle through the named vertices ALREADY
  // exists (e.g. the hidden concyclic circle from "בר חסימה"), reference it — never mint a coincident
  // duplicate. This rule runs before lineMeetsCircle, so the guard must live here, not on rule order.
  const existing = circleContaining(ctx, tri);
  if (existing) {
    // The circumscribing circle here is SCAFFOLDING — its only role is locating D; it is NOT materialised
    // ([ADR-291](docs/06-decisions.md#adr-291) Am. / issue #86, operator ruling). So the resolution path
    // references the existing (auto-hidden) circle WITHOUT a `show-circle` — revealing stays correct only
    // for the EXPLICIT "the circle circumscribes CEFO" statement (`circumcircle`, the #83 case) where
    // materialising the circle IS the point.
    return [
      { type: 'line-through', id: lineId, a: p, b: q },
      { type: 'line-circle-intersection', id: D, line: lineId, circle: circleId(existing), avoid: shared, order: [shared, D, other] },
    ];
  }
  const center = freeLabel([a, b, c, p, q, D, ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['O', 'P', 'Q', 'K', 'S', 'T']);
  const circId = circleId(center);
  return [
    // Created HIDDEN (issue #86): the cut sentence uses the circle only to place D — the same scaffolding
    // semantics as `בר חסימה`. An explicit later "the circle circumscribing CEFO" (the `circumcircle` rule)
    // reveals it via `show-circle`; the cut sentence alone never draws it.
    { type: 'circumcircle', id: circId, center, a, b, c, hidden: true },
    ...(tri.length === 4 ? [{ type: 'set-concyclic', points: tri } as AnyCommand] : []),
    { type: 'line-through', id: lineId, a: p, b: q },
    // D = the OTHER crossing (avoid the shared vertex), constrained to lie ON segment CE (order C→D→E),
    // not on the line's extension — the circle "cuts CE" at an interior point (segment-reference principle,
    // ADR-127). The order is carried on the intersection itself so D stays on the side across configs.
    { type: 'line-circle-intersection', id: D, line: lineId, circle: circId, avoid: shared, order: [shared, D, other] },
  ];
};

const circumcircle: Rule = (s, ctx) => {
  if (!/circle|מעגל/i.test(s)) return null;
  if (!/through|circumscrib|חוסם|דרך/i.test(s)) return null; // the 3-point cue (חוסם circumscribes ≠ חסום inscribed)
  if (circleCenter(s)) return null; // a named centre ⇒ it's a centre-based circle, not a circumcircle
  const rest = s.replace(/circles?|מעגל|circumscrib\w*|through|דרך|חוסם|את|of|the|around|triangle|משולש|מרובע/gi, ' ');
  // #83 ([ADR-291](docs/06-decisions.md#adr-291), M1): a circumscription stated about points that ALREADY
  // ride a circle RESOLVES it — reveal the existing (auto-hidden) circle, never mint a coincident
  // duplicate + duplicate constraint (the ADR-099/ADR-115 family, circumscribes-edition). This also
  // removes the guess-the-hidden-name problem: the circle becomes visible and referenceable.
  const stated = labelRun(rest, 4) ?? labelRun(rest, 3);
  if (stated) {
    const existing = circleContaining(ctx, stated);
    if (existing) return [{ type: 'show-circle', id: circleId(existing) }];
  }
  // "circle through A B C D" — FOUR existing points: a unique circle can't pass through four arbitrary
  // points, so draw the circumcircle of three and make the fourth concyclic by driving a free DOF
  // (ADR-041). Only when all four already exist (else it's a fresh on-circle placement, not this rule).
  const four = labelRun(rest, 4);
  if (four && four.every((id) => (ctx.points ?? []).includes(id))) {
    const center = freeLabel([...four, ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['O', 'P', 'Q', 'K', 'S', 'T']);
    return [
      { type: 'circumcircle', id: circleId(center), center, a: four[0], b: four[1], c: four[2] },
      { type: 'set-concyclic', points: four },
    ];
  }
  const ids = labelRun(rest, 3);
  if (!ids) return null;
  // Avoid clashing with an existing centre (a second circle gets a fresh label, not a reused 'O').
  const center = freeLabel([...ids, ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['O', 'P', 'Q', 'K', 'S', 'T']);
  return [{ type: 'circumcircle', id: circleId(center), center, a: ids[0], b: ids[1], c: ids[2] }];
};

/**
 * "median from A in ABC" / "תיכון מ-A במשולש ABC" — the median from a vertex to the
 * midpoint of the opposite side. Emits the triangle (idempotent if it exists),
 * the opposite-side midpoint, and the segment to it.
 */
const median: Rule = (s, ctx) => {
  if (!/\bmedian\b|תיכון/i.test(s)) return null;

  // An explicitly named opposite side: "to side BC" / "to BC" / "לצלע BC" / "אל BC" / "ל-BC".
  const sideM = s.match(/(?:\bto\s+(?:side\s+)?|לצלע\s*|אל\s*|ל-?)([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  const side = sideM ? ([up(sideM[1]), up(sideM[2])] as [Id, Id]) : null;

  // Named form "AD תיכון" / "median AD": the median segment is named apex-first,
  // foot second, so D is the student's chosen name for the opposite-side midpoint.
  // Strip the keyword and any explicit-side phrase so only the median pair remains.
  let body = s.replace(/\bmedian\b|תיכון/gi, ' ');
  if (sideM) body = body.replace(sideM[0], ' ');
  const seg = labelRun(body, 2);
  if (seg && seg[0] !== seg[1]) {
    const apex = seg[0];
    const foot = seg[1];
    let opp = side;
    if (!opp) {
      // No side stated: derive the opposite side from a triangle named in the
      // utterance ("AD median in ABC"), else from the figure when it's a single
      // triangle (apex + exactly two other points). Otherwise escalate, never guess.
      const triPart = s.split(/\bin\b|במשולש|משולש/i).slice(1).join(' ');
      const tri = triPart ? labelRun(triPart.replace(/triangle|the/gi, ' '), 3) : null;
      if (tri && tri.includes(apex)) {
        opp = tri.filter((x) => x !== apex) as [Id, Id];
      } else {
        const pts = (ctx.points ?? []).filter((x) => x !== apex);
        if (pts.length !== 2) return null;
        opp = [pts[0], pts[1]];
      }
    }
    if (opp[0] === apex || opp[1] === apex) return null;
    return [
      { type: 'midpoint', id: foot, a: opp[0], b: opp[1] },
      { type: 'segment', a: apex, b: foot },
    ];
  }

  // Classic form "median from A in ABC" / "תיכון מ-A במשולש ABC" / "מהנקודה C הורידו תיכון לצלע AB"
  // — auto-named midpoint. The "from"/"מ" apex tolerates a point/vertex descriptor noun.
  const apexM = s.match(/(?:\bfrom\s+(?:the\s+)?(?:point\s+|vertex\s+)?|מ-?\s*(?:ה?נקודה\s+|ה?קודקוד\s+)?)([A-Za-z]\d*)\b/i);
  if (!apexM) {
    // #71 (log-triage): the VERTEX-LESS side form — "הוסף תיכון לצלע AB" / "add the median to
    // side AB". The apex is the unique third vertex of a figure triangle carrying side AB
    // (several candidate triangles or none → defer, never guess — ADR-052).
    if (!side) return null;
    const tris = (ctx.polygons ?? [])
      .map((p) => p.map(up))
      .filter((p) => p.length === 3 && p.includes(side[0]) && p.includes(side[1]));
    const apexes = [...new Set(tris.map((t) => t.find((x) => x !== side[0] && x !== side[1])!))];
    if (apexes.length !== 1) return null;
    const foot = freeLabel([apexes[0], ...side, ...(ctx.points ?? [])], ['M', 'N', 'P', 'Q']);
    return [
      { type: 'midpoint', id: foot, a: side[0], b: side[1] },
      { type: 'segment', a: apexes[0], b: foot },
    ];
  }
  const apex = up(apexM[1]);
  // An explicit opposite side ("...to side AB") with a from-apex fully determines the median —
  // the foot is that side's midpoint (no triangle to name/re-emit; the figure already has the points).
  if (side && side[0] !== apex && side[1] !== apex) {
    const foot = freeLabel([apex, ...side], ['M', 'N', 'P', 'Q']);
    return [
      { type: 'midpoint', id: foot, a: side[0], b: side[1] },
      { type: 'segment', a: apex, b: foot },
    ];
  }
  // The triangle is named after "in"/"במשולש"; read it there so the apex letter isn't double-counted.
  const triPart = s.split(/\bin\b|במשולש|משולש/i).slice(1).join(' ') || s;
  const tri = labelRun(triPart.replace(/triangle|the/gi, ' '), 3);
  if (!tri) return null;
  const others = tri.filter((x) => x !== apex);
  if (others.length !== 2) return null;
  const mid = freeLabel(tri, ['M', 'N', 'P', 'Q']);
  return [
    { type: 'triangle', ids: [tri[0], tri[1], tri[2]] },
    { type: 'midpoint', id: mid, a: others[0], b: others[1] },
    { type: 'segment', a: apex, b: mid },
  ];
};

/** The unique base OPPOSITE `apex` that a trapezoid height drops onto: among the figure's vertex-disjoint
 *  parallel edge-pairs (`ctx.parallels`), the partner edge of a pair whose OTHER edge carries the apex.
 *  Exactly one such base ⇒ return it (the trapezoid height); zero (a leg-only apex / a triangle, whose
 *  parallels are empty) or several (a parallelogram's two parallel pairs) ⇒ null, so the caller defers
 *  rather than guess a side (ADR-052 / ADR-169). */
const oppositeParallelBase = (apex: Id, parallels?: [[string, string], [string, string]][]): [Id, Id] | null => {
  const cands: [Id, Id][] = [];
  for (const [e1, e2] of parallels ?? []) {
    const in1 = e1.map(up).includes(apex), in2 = e2.map(up).includes(apex);
    if (in1 === in2) continue; // apex on both (degenerate) or neither (a leg apex) — not this pair's base
    const other = (in1 ? e2 : e1).map(up) as [Id, Id];
    if (!cands.some((c) => (c[0] === other[0] && c[1] === other[1]) || (c[0] === other[1] && c[1] === other[0]))) cands.push(other);
  }
  return cands.length === 1 ? cands[0] : null;
};

/** Real EDGES of a polygon the apex belongs to that do NOT touch the apex — the legitimate bases a height
 *  from `apex` can drop onto. A DIAGONAL is never a polygon edge, so this can never return one: the fix for
 *  the neighbour-triangle fallback that used to triangulate a quad ACROSS a drawn diagonal (e.g. "גובה מ A"
 *  in a parallelogram whose diagonal BD is drawn dropped A onto BD — a diagonal, not a side; ADR-262+). A
 *  triangle yields exactly one such edge; a parallelogram / general quad yields several genuine heights.
 *  Deduped across every polygon the apex belongs to; the named foot (if any) is excluded as a base vertex. */
const oppositePolygonEdges = (apex: Id, polygons?: string[][], exclude?: Id | null): [Id, Id][] => {
  const out: [Id, Id][] = [];
  const seen = new Set<string>();
  for (const poly of polygons ?? []) {
    const verts = poly.map(up);
    if (!verts.includes(apex)) continue;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      if (a === apex || b === apex) continue; // an edge touching the apex is adjacent, not opposite
      if (a === exclude || b === exclude) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
};

/**
 * "height from A in ABC" / "altitude from A in ABC" / "גובה מ-A במשולש ABC", and
 * the bare-foot phrasing "perpendicular from A to BC" — the altitude from a vertex:
 * the foot of the perpendicular onto the opposite side, plus the segment to it.
 * In a trapezoid the target is the opposite PARALLEL base (ADR-169), resolved via `ctx.parallels`.
 */
const altitude: Rule = (s, ctx) => {
  // An explicitly *named* foot ("G is the foot of the perpendicular from E to AB")
  // is the `foot` rule's job — don't grab it here and auto-name the foot (which
  // collided with an existing point). This rule is for the height/altitude and the
  // bare unnamed "perpendicular from A to BC".
  if (/\bfoot\b|רגל/i.test(s)) return null;
  const isHeight = /\bheight\b|\baltitude\b|גובה/i.test(s);
  // A "perpendicular FROM a point" (the altitude/foot), not the ⟂ CONSTRAINT or a through-line. The
  // from-apex is the real discriminator (computed below as `apexM`); the ⟂ constraint ("AB אנך ל CD")
  // has no "from"/"מ" apex, so `apexM` is null there and the rule bows out.
  const isPerpFrom = /perpendicular|מאונ[כך]|אנ[כך]/i.test(s) && !/through|דרך/i.test(s);
  if (!isHeight && !isPerpFrom) return null;
  // A NAMED altitude segment — "CD גובה …" (name-first) or "הגובה CD …" / "the altitude CD …"
  // (keyword-first) — names BOTH the apex (the vertex) and the FOOT (where it lands on the opposite
  // side). The student named the segment, so honour the foot they gave instead of auto-naming it (the
  // "asked for CD, got CF" bug). ONLY for the height/altitude keyword: "EF אנך ל AB" is the ⟂
  // CONSTRAINT (perpendicularConstraint, which runs later) — the perpendicular form never reads a
  // name, or it would steal the constraint and fabricate a spurious foot.
  let apex: Id;
  let namedFoot: Id | null = null;
  // The classic UNNAMED form gives the apex via "from D" / "from point D" / "מD" / "מ-D" / "מנקודה D"
  // (the descriptor noun נקודה/point tolerated) and auto-names the foot. Detect it first so the
  // keyword-first named branch never misreads "גובה מ-A ל BC" — there the apex is given, not a name.
  const apexM = s.match(/(?:\bfrom\s+(?:the\s+)?(?:point\s+|vertex\s+)?|מ-?\s*(?:ה?נקודה\s+|ה?קודקוד\s+)?)([A-Za-z]\d*)\b/i);
  // The named segment, in either word order. The keyword-first form requires the two labels to sit
  // IMMEDIATELY after the keyword (whitespace only) so "גובה מ-A ל BC" / "altitude from A to BC" — where
  // a connector word/letter intervenes — can never be read as a name (and the !apexM guard backs that up).
  // The pair must be UPPERCASE (the parser's vertex-label convention): without this, a lowercase connector
  // like "to"/"in" sitting after the keyword is misread as two single-letter labels (T,O / I,N).
  const nm =
    isHeight && !apexM
      ? (s.match(/^\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*(?:is\s+|הוא\s+)?(?:the\s+|ה)?(?:height|altitude|גובה)/i) ?? // name-first "CD גובה …"
        s.match(/(?:height|altitude|גובה)\s+\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i)) // keyword-first "הגובה CD …"
      : null;
  const named = nm && isUpperLabel(nm[1]) && isUpperLabel(nm[2]) ? nm : null;
  if (named) {
    apex = up(named[1]);
    namedFoot = up(named[2]);
  } else {
    if (!apexM) return null;
    apex = up(apexM[1]);
  }
  // Opposite side: "to BC" / "to side BC" / "ל BC" / "ל-BC" / "לצלע BC" / "לקטע BC" (descriptor noun tolerated).
  const sideM = s.match(/(?:\bto\s+(?:the\s+)?(?:side\s+)?|אל\s*(?:ה?צלע\s+)?|ל-?\s*(?:ה?צלע\s+|ה?קטע\s+)?)([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i); // explicit opposite side "to BC"
  let p: string, q: string;
  let tri: Id[] | null = null;
  if (sideM && up(sideM[1]) !== apex) {
    p = up(sideM[1]);
    q = up(sideM[2]);
  } else {
    // A trapezoid height: the apex sits on one parallel base and drops perpendicular to the OPPOSITE base
    // (ADR-169). The triangle inference below can't reach it — the apex's two neighbours are a diagonal, not
    // an edge — so try the unique opposite parallel base first (empty for a triangle, so it never interferes).
    const base = oppositeParallelBase(apex, ctx.parallels);
    if (base) {
      [p, q] = base; // tri stays null — the trapezoid already exists; don't re-emit a shape
    } else {
      // Opposite side from a triangle NAMED in the utterance — after "in"/"במשולש"/"משולש", or anywhere in
      // the string (the compound "triangle ABC with a height from A", which has no "in"). The apex must be
      // one of its vertices (else `others` ≠ 2). If no usable triangle is stated, fall back to the FIGURE
      // CONTEXT — the two points that, with the apex, are the only ones — so the bare "CD גובה" on an
      // already-drawn triangle parses deterministically instead of escalating to the LLM (which strips the
      // named foot → the "CF" bug). Mirrors the `median` rule's context fallback.
      const triPart = s.split(/\bin\b|במשולש|משולש/i).slice(1).join(' ') || s;
      tri = labelRun(triPart.replace(/triangle|the/gi, ' '), 3);
      const others = tri?.filter((x) => x !== apex) ?? [];
      if (tri && others.length === 2) {
        [p, q] = others as [Id, Id];
      } else {
        tri = null; // no triangle stated — derive the side from context, and don't re-emit a triangle
        const pts = (ctx.points ?? []).filter((x) => x !== apex && x !== namedFoot);
        // A height drops to a real polygon SIDE, never a diagonal. Prefer an EDGE of a polygon the apex
        // belongs to that doesn't touch the apex. A triangle has exactly one such edge (unambiguous); a
        // parallelogram / general quad has several genuine heights — the height is ambiguous but real, so
        // DRAW ONE deterministically rather than refuse (the operator's steer, superseding ADR-169's
        // parallelogram-defers). This also excludes any drawn diagonal by construction (it is not an edge).
        const edges = oppositePolygonEdges(apex, ctx.polygons, namedFoot);
        if (edges.length >= 1) {
          [p, q] = edges[0];
        } else if (pts.length === 2) {
          [p, q] = [pts[0], pts[1]];
        } else {
          // No polygon around the apex and more than two other points: last-ditch neighbour adjacency for a
          // triangle drawn as LOOSE segments (no polygon object ⇒ no polygon diagonal, so a join between two
          // of the apex's neighbours is a genuine edge). Exactly one such triangle → use it; zero or several
          // → genuinely under-specified, so defer rather than guess a side (ADR-052, no assumptions).
          const nb = ctx.neighbors ?? {};
          const adj = (nb[apex] ?? []).filter((x) => x !== namedFoot);
          const sides: [Id, Id][] = [];
          for (let i = 0; i < adj.length; i++)
            for (let j = i + 1; j < adj.length; j++) if ((nb[adj[i]] ?? []).includes(adj[j])) sides.push([up(adj[i]), up(adj[j])]);
          if (sides.length !== 1) return null;
          [p, q] = sides[0];
        }
      }
    }
  }
  // Auto-name the foot avoiding EVERY existing figure point, not just the apex/base — otherwise a second
  // altitude re-picks 'F' and silently REDEFINES the first altitude's foot (a §6-honesty collision).
  const f = namedFoot ?? freeLabel([apex, p, q, ...(ctx.points ?? [])], ['F', 'G', 'H', 'P']);
  const cmds: Command[] = [];
  if (tri) cmds.push({ type: 'triangle', ids: [tri[0], tri[1], tri[2]] });
  cmds.push({ type: 'foot', id: f, from: apex, a: p, b: q });
  cmds.push({ type: 'segment', a: apex, b: f });
  return cmds;
};

/**
 * #71 (log-triage): a PLURAL special-line declaration — "AD BE ו-CF הם גבהים במשולש [ABC]" /
 * "AD BE and CF are heights/medians in triangle ABC" distributes into the singular statements
 * (the ADR-076 list convention) and parses each through the OWNING rule — all-or-nothing (the
 * ADR-264 honesty bar: a partial distribution never commits).
 */
const pluralSpecialLines: Rule = (s, ctx) => {
  // NO /i — under it the pair atom [A-Z] would also swallow lowercase connectives ("and" reads
  // as the pairs "an"+"d"); En keywords carry explicit case alternatives instead.
  const m = s.match(
    /^((?:[A-Z]\d*){2}(?:(?:\s*,\s*|\s+ו-?\s*|\s+[aA]nd\s+|\s+)(?:[A-Z]\d*){2})+)\s+(?:הם\s+|[aA]re\s+)?(גבהים|[hH]eights|[aA]ltitudes|תיכונים|[mM]edians)(?:\s+(?:במשולש|[iI]n\s+(?:the\s+)?triangle)(\s+(?:[A-Z]\d*){3})?)?\s*\.?\s*$/,
  );
  if (!m) return null;
  const labels = m[1].match(/[A-Z]\d*/g) ?? [];
  if (labels.length < 4 || labels.length % 2 !== 0) return null;
  const kind = /גבהים|heights|altitudes/i.test(m[2]) ? 'גובה' : 'תיכון';
  const tail = m[3] ? ` במשולש${m[3]}` : '';
  const out: AnyCommand[] = [];
  for (let i = 0; i < labels.length; i += 2) {
    const single = `${up(labels[i])}${up(labels[i + 1])} ${kind}${tail}`;
    const r = kind === 'גובה' ? altitude(single, ctx) : median(single, ctx);
    if (!r || !Array.isArray(r)) return null; // all-or-nothing — never a partial figure
    out.push(...r);
  }
  return out;
};

/**
 * "perpendicular bisector of AB" / "אנך אמצעי ל-AB" — the segment's midpoint + a drawn ⟂ line there.
 * A NAMED bisector ("CD אנך אמצעי ל-AB" / "CD perpendicular bisector of AB") puts C, D as markers on
 * the bisector line (straddling the midpoint); the BISECTED segment is the one after the connector
 * ("of / ל / to AB"), never the leading name — so "CD … ל AB" bisects AB, not CD.
 */
const perpBisector: Rule = (s, ctx) => {
  // The Hebrew stem admits the definite article and the plural on BOTH words ("האנך האמצעי",
  // "האנכים האמצעיים" — plural swaps final ך→כ, the PAR-3 inflection class). The singular-only gate
  // let the plural fall through to the PAR-3-widened `perpendicularConstraint` (its אנ[כך] matches the
  // אנכ inside "אנכים"), which silently asserted a WRONG `AB ⟂ CD` the student never stated (review
  // 2026-07-03, P8). The old dead `אמצעי\b` alternative (JS \b never fires between Hebrew letters) is
  // dropped.
  const PERP_BIS = /perpendicular\s+bisectors?|ה?אנ(?:ך|כים)\s*ה?אמצעי(?:ים)?/i;
  if (!PERP_BIS.test(s)) return null;
  // PLURAL form — "האנכים האמצעיים של AB ו-CD": one ⊥-bisector per named segment. Collect every label
  // pair after the connector; emitting only the first would half-parse (drop CD).
  if (/bisectors|אנכים/i.test(s)) {
    const tail = s.match(/(?:\bof\b|\bto\b|ל-?|של)\s*(.+)$/i)?.[1] ?? '';
    const pairs = [...tail.matchAll(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/g)].map((m) => [up(m[1]), up(m[2])] as [Id, Id]);
    if (pairs.length < 2) return null; // a plural naming <2 segments is unclear — escalate, don't guess
    const taken: Id[] = [...pairs.flat(), ...(ctx.points ?? [])];
    return pairs.flatMap(([pa, pb]) => {
      const mid = freeLabel(taken, ['M', 'N', 'P', 'Q', 'K', 'L']);
      taken.push(mid);
      return [
        { type: 'midpoint', id: mid, a: pa, b: pb },
        { type: 'perpendicular-line', id: `perp-${mid}-${pa}${pb}`, through: mid, a: pa, b: pb, visible: true },
      ] as Command[];
    });
  }
  // The bisected segment follows the connector ("of AB" / "ל-AB" / "to AB").
  const segM = s.match(/(?:\bof\b|\bto\b|ל-?)\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  let a: Id, b: Id;
  if (segM) {
    [a, b] = [up(segM[1]), up(segM[2])];
  } else {
    // No connector — fall back to the two labels near the keyword (the un-named plain form).
    const ids = labelRun(s.replace(/perpendicular|bisector|of|the|אנך|אמצעי|אמצע|של|ל-?/gi, ' '), 2);
    if (!ids) return null;
    [a, b] = ids;
  }
  // An optional leading NAME for the bisector line ("CD אנך אמצעי …"), excluding the bisected segment.
  const nameM = s.match(/^\s*\b([A-Za-z]\d*)(?:\s*([A-Za-z]\d*))?\b\s*(?=perpendicular\s+bisector|ה?אנך\s*ה?אמצעי)/i);
  const names: Id[] = [];
  for (const tok of [nameM?.[1], nameM?.[2]]) {
    if (!tok) continue;
    const u = up(tok);
    if (u !== a && u !== b && !names.includes(u)) names.push(u);
  }
  // If the named segment ALREADY exists ("segment CD" drawn, then "CD is the ⊥-bisector of AB"),
  // this is a CONSTRAINT, not a construction: make each endpoint equidistant from A and B, so the
  // existing line CD becomes the perpendicular bisector (don't re-create C/D — that would redefine them).
  const have = new Set(ctx.points ?? []);
  if (names.length === 2 && names.every((n) => have.has(n))) {
    const [c, d] = names;
    return [
      { type: 'segment', a: c, b: d }, // idempotent — keep the segment drawn
      { type: 'set-equal', a: c, b: a, c, d: b }, // |CA| = |CB| → C on the ⊥-bisector of AB
      { type: 'set-equal', a: d, b: a, c: d, d: b }, // |DA| = |DB| → D on it too ⇒ line CD is the ⊥-bisector
    ];
  }
  // Otherwise CONSTRUCT: the midpoint of AB + the drawn ⟂ line there; a leading name → markers on it.
  const mid = freeLabel([a, b, ...names], ['M', 'N', 'P', 'Q']);
  const lineId = `perp-${mid}-${a}${b}`;
  return [
    { type: 'midpoint', id: mid, a, b },
    { type: 'perpendicular-line', id: lineId, through: mid, a, b, visible: true },
    ...lineMarkers(lineId, names),
  ];
};

/**
 * "AD bisects angle BAC" / "AD חוצה את הזווית BAC" — the angle bisector from the
 * vertex, with the named point D *placed* where it meets the opposite side. The
 * bisector and opposite-side lines are scaffolding; only D and the segment show.
 */
const bisectorPlacesPoint: Rule = (s, ctx) => {
  if (!/bisects?|חוצ/i.test(s)) return null;
  if (INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s)) return null; // intersection rules own that phrasing
  const seg = s.match(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*(?:bisects?|חוצ\w*)/i);
  if (!seg) return null;
  const apex = up(seg[1]);
  const D = up(seg[2]);
  const after = s.slice(s.search(/bisects?|חוצ/i)).replace(/bisects?|חוצ\w*|angles?|the|את|הזוו?ית|זוו?ית|של/gi, ' ');
  let tri = labelRun(after, 3);
  if (!tri) {
    // No explicit angle triple ("CD חוצה זוית" / "CD bisects the angle"): resolve the angle from the
    // figure. Gated to an explicit "angle"/"זוית" utterance so a SEGMENT bisection ("AB חוצה את הקטע CD")
    // never mis-fires as an angle bisector. The bisecting ray runs FROM the segment's first letter, so
    // THAT is the angle vertex; its two arms come from the figure (the same ADR-164 single-vertex
    // resolution as `angle`). Well-defined only when the vertex has EXACTLY two edges (one possible angle)
    // — e.g. a triangle's corner. A different edge count leaves the intended angle ambiguous, so ASK for
    // the three letters rather than guessing or dropping it to the LLM (which drew a bare line with no
    // equal-angle constraint — the reported bug).
    if (!/angle|זוו?ית/i.test(s)) return null;
    const nb = (ctx.neighbors ?? {})[apex] ?? [];
    if (nb.length === 2) tri = [nb[0], apex, nb[1]];
    else if ((ctx.points ?? []).includes(apex)) return { clarify: 'ambiguous-angle', vertex: apex };
    else return null;
  }
  const vertex = tri[1];
  if (vertex === apex) {
    // "AD bisects ∠BAC": the segment's FIRST letter is the angle vertex.
    const [o1, o2] = tri.filter((t) => t !== vertex);
    if (o2 === undefined) return null;
    // If the bisector-foot point D ALREADY EXISTS (e.g. "G on DF" was placed first, then "EG bisects ∠DEF"),
    // DON'T re-create it — that's a redefinition conflict ("'G' is already defined"). It's a CONSTRAINT:
    // EG bisects ∠DEF ⇔ ∠(o1, vertex, D) = ∠(D, vertex, o2), which drives the existing point (on its
    // segment DOF) onto the bisector. (ADR-107.)
    if ((ctx.points ?? []).includes(D)) {
      return [
        { type: 'set-angle-ratio', v1: vertex, a1: o1, b1: D, v2: vertex, a2: D, b2: o2, k: 1 },
        { type: 'segment', a: apex, b: D },
      ];
    }
    // …else place D where the bisector meets the opposite side (a new point).
    const bisId = `bis-${tri.join('')}`;
    const lineId = `line-${o1}${o2}`;
    return [
      { type: 'bisector', id: bisId, vertex, p: tri[0], q: tri[2] },
      { type: 'line-through', id: lineId, a: o1, b: o2 },
      { type: 'line-intersection', id: D, line1: bisId, line2: lineId },
      { type: 'segment', a: apex, b: D },
    ];
  }
  if (vertex === D) {
    // "AC bisects ∠ECD": the angle's vertex (C) is the segment's SECOND letter, and the bisecting
    // ray runs from the vertex through the EXISTING point `apex` (A). All points exist ⇒ this is a
    // CONSTRAINT: the two half-angles are equal, ∠(ray1,vertex,apex) = ∠(apex,vertex,ray2).
    return [{ type: 'set-angle-ratio', v1: vertex, a1: tri[0], b1: apex, v2: vertex, a2: apex, b2: tri[2], k: 1 }];
  }
  return null;
};

/**
 * The two triangles named in a relation utterance — handles "ABC ≅ DEF" (labels either
 * side of the symbol) and the Hebrew "המשולשים ABC ו-DEF חופפים" (both before the verb).
 * Strips the shape/relation words, then takes the first two runs of three labels.
 */
const twoTriangles = (s: string): [[Id, Id, Id], [Id, Id, Id]] | null => {
  const t = s
    .replace(/triangles?|משולשים?|המשולש\w*|congruent|similar|חופפים?|חופף|דומ\w*|are|is|the|of|to|and|של/gi, ' ')
    .replace(/[≅~∼∽△▲]|ל-?|ו-?/g, ' ');
  const triples = [...t.matchAll(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/g)];
  if (triples.length < 2) return null;
  const grab = (i: number) => [up(triples[i][1]), up(triples[i][2]), up(triples[i][3])] as [Id, Id, Id];
  return [grab(0), grab(1)];
};

/** Emit a `triangle` for any of the two whose vertices aren't all already in the figure. */
const ensureTriangles = (t1: [Id, Id, Id], t2: [Id, Id, Id], ctx: ParseContext): AnyCommand[] => {
  const has = (t: [Id, Id, Id]) => t.every((id) => ctx.points?.includes(id));
  const out: AnyCommand[] = [];
  if (!has(t1)) out.push({ type: 'triangle', ids: t1 });
  if (!has(t2)) out.push({ type: 'triangle', ids: t2 });
  return out;
};

/**
 * "ABC ≅ DEF" / "triangle ABC congruent to triangle DEF" / "המשולשים ABC ו-DEF חופפים" —
 * congruent triangles. Reshapes the SECOND triangle to match the first (SSS: corresponding
 * sides equal), driving its free vertices (ADR-030/031 coupled solve). Builds either
 * triangle first if it isn't already on the canvas.
 */
const congruence: Rule = (s, ctx) => {
  if (!/≅|congruen|חופ/i.test(s)) return null;
  const tt = twoTriangles(s);
  if (!tt) return 'stop'; // relation named but two triangles not readable — escalate
  const [[A, B, C], [D, E, F]] = tt;
  return [
    ...ensureTriangles([A, B, C], [D, E, F], ctx),
    { type: 'set-equal', a: D, b: E, c: A, d: B }, // |DE| = |AB|
    { type: 'set-equal', a: E, b: F, c: B, d: C }, // |EF| = |BC|
    { type: 'set-equal', a: F, b: D, c: C, d: A }, // |FD| = |CA|
  ];
};

/**
 * "ABC ~ DEF" / "triangle ABC similar to triangle DEF" / "המשולשים ABC ו-DEF דומים" —
 * similar triangles. Reshapes the SECOND to have the same angles as the first (AA), free
 * to scale. Two angle equalities suffice.
 */
const similarity: Rule = (s, ctx) => {
  if (!/[~∼∽]|similar|דומ/i.test(s)) return null;
  const tt = twoTriangles(s);
  if (!tt) return 'stop';
  const [[A, B, C], [D, E, F]] = tt;
  return [
    ...ensureTriangles([A, B, C], [D, E, F], ctx),
    { type: 'set-angle-ratio', v1: D, a1: E, b1: F, v2: A, a2: B, b2: C, k: 1 }, // ∠D = ∠A
    { type: 'set-angle-ratio', v1: E, a1: D, b1: F, v2: B, a2: A, b2: C, k: 1 }, // ∠E = ∠B
  ];
};

/**
 * "<place a point> such that <condition>" — a compound (e.g. "point F on the extension of AD such
 * that CF ⟂ DF"). Each half parses cleanly on its own, but together a single rule half-parses (it
 * reads "AD ⟂ CF" and never creates F). Split on "such that" / "כך ש" and parse each side, in order
 * (the point first, so the condition can reference it). Runs FIRST. Falls through if either half
 * doesn't parse, so a stray "where"/"such that" never blocks the normal rules.
 */
const SUCH_THAT = /\bsuch that\b|\bso that\b|\bsuch_that\b|כך\s*ש(?=\s|[A-Za-z]\d*)/i;
const compoundSuchThat: Rule = (s, ctx) => {
  const parts = s.split(SUCH_THAT);
  if (parts.length < 2) return null;
  const left = parts[0].trim();
  const right = parts.slice(1).join(' ').trim();
  if (!left || !right) return null;
  const lr = parse(left, ctx);
  const rr = parse(right, ctx);
  if (!lr.ok || !rr.ok) return null; // either half unreadable → let the other rules / LLM handle it
  return [...lr.commands, ...rr.commands];
};

/**
 * Multiple independent GIVENS in one line — "AB = 4, BC = 6" / "זווית ABC = 40, זווית DEF = 60" /
 * "AB ⟂ CD and EF ∥ GH". A single relation rule half-parses these and silently DROPS the earlier given:
 * `distanceConstraint` anchors its value to `$` so it claims only the trailing clause; `angle` grabs only
 * the first triple (PAR-2). Fix: split on a top-level separator (`,` `;` `וגם` `and`) and parse each piece,
 * ALL-OR-NOTHING. To stay safe on CONSTRUCTION utterances that also carry commas ("circle through A, B, C",
 * "F, G, H on AB, AC, CB"), split ONLY when EVERY piece both (a) carries a relation OPERATOR — not a bare
 * shape word, so "משולש שווה שוקיים" (isosceles) isn't mistaken for an equality — and (b) parses on its own;
 * otherwise fall through untouched. Runs right after `compoundSuchThat` (whose halves recurse back through
 * here for any commas inside them). Each piece's parse already applied the post-passes; re-applying them on
 * the combined result is idempotent (the `withCarrierMembership` CONSTRUCT-guard + `withImplicitCircles`
 * seeing the prepended circle as already-defined).
 */
// Separators: `,` `;` `וגם` `and`, and the bare Hebrew conjunction ו ("AB = 4 ו-BC = 6" / "… ו BC …" /
// "… וBC …") — the most common joiner in student Hebrew; without it the $-anchored `distanceConstraint`
// claimed only the trailing given and the earlier one was SILENTLY dropped (review 2026-07-03, P6). The
// bare-ו form requires a following hyphen, whitespace, or Latin capital, so a ו PREFIXED to a Hebrew word
// ("ורדיוסו") is not a separator; the every-piece-has-a-relation + all-or-nothing gates below keep any
// mid-phrase split ("AE ו BF נפגשים") from firing — a non-relation piece falls through untouched.
const STATEMENT_SEP = /\s*[,;]\s*|\s+(?:וגם|\band\b)\s+|\s+ו(?:-|\s+|(?=[A-Z]))\s*/gi;
const HAS_RELATION = /[=<>≤≥]|⟂|⊥|∥|≅|[~∼∽]|מקביל|מאונ[כך]|אנ[כך]|חופ|דומ|\bcongruen|\bsimilar|\bparallel|\bperpendicular/i;
const multiStatement: Rule = (s, ctx) => {
  const parts = s.split(STATEMENT_SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null; // no top-level separator → a single statement
  if (!parts.every((p) => HAS_RELATION.test(p))) return null; // every piece must be a relation given (not a construction)
  const parsed = parts.map((p) => parse(p, ctx));
  if (!parsed.every((r) => r.ok)) return null; // ALL-OR-NOTHING — any unreadable piece → don't split (let LLM handle)
  return parsed.flatMap((r) => (r.ok ? r.commands : []));
};

// Order matters: the most specific keyword-anchored rules run first; the
// coordinate rule (freePoint) is last because it's the loosest.
//
// EXPORTED for the shadow-matrix guard test only ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md)
// A1 / PAR-11): the test runs EVERY rule against a corpus (not stopping at the first match) to detect a
// later, more-specific rule whose output diverges from the earlier winner's — the first-match-wins
// shadowing class behind ADR-119/077/166. Not part of the runtime API; `parse()` is the only entry point.
export const RULES: Rule[] = [
  compoundSuchThat, // "<place a point> such that <condition>" — split + parse each half, before all else
  multiStatement, // "AB = 4, BC = 6" — split comma/and-joined GIVENS, parse each all-or-nothing (PAR-2)
  setRadius, // "radius of circle P is 4" — set an EXISTING circle's radius; before `circle` (creation) and the shape rules (which 'stop' on רדיוס)
  radiusSymbolStatement, // "רדיוס מעגל O הוא R" — NAME an existing circle's radius with a letter (#54); after setRadius (numeric wins), before the shape rules
  radiusRelation, // "R > r" / "R = 1.5r" / "R/r = 2√7/5" between BOUND radius symbols (#54); before measureOrder (unbound-pair no-op) and the value rules
  congruence, // "ABC ≅ DEF" — before the shape rules ("triangle ABC ≅ …" contains "triangle")
  similarity, // "ABC ~ DEF"
  area, // "שטח המשולש ABC = 13" / "SABC/SDEF = 3/4" (ADR-118) — BEFORE the shape rules, which would otherwise build the named shape and drop the area
  perimeter, // "היקף ABC = 20" / "perimeter of ABCD is 20" (ADR-228) — BEFORE the shape rules, same reason (a circle's circumference → the `circle` rule)
  semicircle, // "חצי מעגל" / "semicircle" — before `circle` (contains "מעגל") and the shape rules
  quarterCircle, // "רבע מעגל" / "quarter circle" — same
  concentricCircles, // "שני מעגלים בעלי מרכז משותף O" — the CONCENTRIC PAIR (ADR-244); before `circle` (which would half-parse it to ONE circle) and the two-circle rules
  inscribedInPolygon, // "מעוין BDEF חסום במשולש ABC" — a polygon inscribed in a polygon (ADR-262); before incircle/inscribedPolygon (all match "inscribed") AND the base shape rules
  incircle, // "circle inscribed in triangle ABC" — before inscribedPolygon (both match "inscribed")
  circumcircleMeetsSegment, // "the circle circumscribing ABC cuts CE at D" — before the shape rules (its "משולש ABC" would stop `triangle`)
  inscribedPolygon, // before the shape rules ("triangle ABC inscribed …" contains "triangle")
  // Special-line constructs whose Hebrew names a triangle ("…במשולש ABC") must
  // run before the shape rules, or `triangle` grabs the embedded משולש and stops.
  median,
  pluralSpecialLines, // #71: "AD BE ו-CF הם גבהים במשולש" distributes into the singulars, all-or-nothing
  altitude, // "height/altitude from A" / "perpendicular from A to BC"
  perpBisector, // "perpendicular bisector of AB"
  midsegment, // "midsegment to BC in triangle ABC" — a triangle construct ("במשולש"); before the shapes AND before segment/midpoint (its "קטע"/"אמצע" keywords)
  bisectorPlacesPoint, // "AD bisects ∠BAC" / "CD חוצה זוית [במשולש ABC]" — places D on the opposite side. Before the shapes (its "במשולש ABC" form would otherwise make `triangle` 'stop'); safe before the bisector-∩ compounds because it DEFERS on intersect keywords.
  regularPolygon, // "regular pentagon ABCDE" / "מחומש משוכלל" — before square (it also routes "regular triangle/quadrilateral")
  square,
  parallelogram,
  rectangle,
  rhombus,
  kite, // "kite ABCD" / "דלתון ABCD" — a special quad (decomposes to quad + equal adjacent sides)
  rightTrapezoid, // before `trapezoid` AND before `rightTriangle` (whose guard also matches a bare "ישר זווית")
  isoscelesTrapezoid, // before `trapezoid` ("isosceles trapezoid" contains "trapezoid"/"טרפז")
  trapezoid,
  quadrilateral,
  equilateral, // before `triangle` ("equilateral triangle" contains "triangle"/"משולש")
  isoscelesTriangle, // before `triangle`; after `isoscelesTrapezoid` (both match "isosceles")
  rightTriangle, // before `triangle` ("right triangle" contains "triangle")
  triangle,
  bisectorIntersection, // two bisectors meet — before the one-bisector and generic intersections
  bisectorSegmentIntersection, // one bisector ∩ a segment
  cornerTangentCircle, // "AB and AD tangent to circle O" — a circle tangent to two sides of a corner; before the tangent/line rules (the משיק keyword makes lineLineIntersection 'stop')
  twoTangentsMeet, // TWO tangents (at two on-circle points) meeting at a point — before tangent∩segment
  tangentLineIntersection, // tangent ∩ a segment
  parallelCircleIntersection, // a parallel line ∩ the circle
  commonTangent, // a COMMON tangent of two circles ("משיק משותף") — before circlesTangent (which would misread it as mutual tangency of new circles)
  tangentChord, // a CHORD of one circle tangent to the OTHER at its endpoint — before circlesTangent/chord (which drop the tangency or the chord)
  tangentMeetsOtherCircle, // tangent LINE to one circle meets the OTHER circle — before circlesTangent (which would misread it as mutual tangency)
  theTangentMeetsCircle, // "המשיק חותך את מעגל P בנקודה K" — definite back-reference to THE drawn tangent (#100); after tangentMeetsOtherCircle (whose self-declaring subject also starts "המשיק"), before lineLineIntersection (which 'stop's on משיק)
  circlesTangent, // two circles tangent to each other — before tangentLine (which would grab the משיק)
  secantFromExternal, // "from external point E a line cuts the circle at A,B" — before the generic intersections
  twoCirclesMeet, // "two circles intersect at A and B" — create both circles + both intersection points
  circleCircleIntersection, // two circles cross — before the generic line∩line intersection
  extendOntoCircle, // "המשך AC חותך מעגל P בנקודה D" — DIRECTIONAL extension onto a circle (D beyond the 2nd letter), before the order-agnostic lineMeetsCircle
  lineCutsCircleTwice, // "AO cuts the circle at C and D" — a named line crossing the circle at BOTH roots; before lineMeetsCircle (one crossing)
  lineMeetsCircle, // "line AC meets circle P at E" — an order-agnostic chord/line meeting a circle, before collinearity & line∩line
  extensionMeetsExistingPoint, // "המשך CA נפגש עם המשיק בנקודה D" — drive an EXISTING D (a tangent's apex marker) onto the extension of CA; before line∩line ("חותך"/"נפגש" would otherwise 'stop' it)
  // A drawn perpendicular/parallel line that "cuts" another at a point must be claimed BEFORE the
  // generic line∩line rule: the "cuts"/"חותך" keyword otherwise makes lineLineIntersection 'stop'
  // (it can't read "ED ⟂ AB cuts it at C") and the whole parse aborts to the LLM — which then
  // models the foot as a second definition of C and over-constrains it. These only fire on a
  // perpendicular/parallel keyword + an explicit through-point, so a plain intersection falls through.
  perpendicularLine, // a *drawn* perpendicular line through a point (before the ⟂ constraint & line∩line)
  parallelLine, // a *drawn* parallel line through a point (before the ∥ constraint & line∩line)
  dashCollinear, // "A-O1-O2-B" — a dash-separated ordered collinear list (before segment/collinear rules)
  lineThroughCenters, // "AB עובר דרך מרכזי המעגלים" / "…דרך O1 ו O2" — the line through two on-circle points crosses both centres
  // Collinearity ("E on line AC" / "line CE passes through A" / "A B C collinear") — before the
  // generic line∩line and before pointOnSegment (whose "P on QR" would misread "P on line QR").
  collinearConstraint,
  diameterCutsSegment, // "קוטר … מנקודה F חותך את הצלע AC בנקודה E" — before lineLineIntersection (which stops on "קוטר") and `diameter`
  lineLineIntersection,
  centralAngle, // #106: "זוית מרכזית COD" / "…נשענת על קשת CD" — before every generic angle rule
  angleAcuteness, // "∠ABC קהה/חדה" (obtuse/acute) — before the value-based angle rules
  arcEquality, // "⌢DE = 2⌢CE" / "קשת DE = 2 קשת CE" (arc-measure ratio → central-angle ratio) — own keyword, before angleEquality
  angleEquality, // "∠ABC = ∠DEF" (two angles equal) — before measureAngle/angle, which expect a value RHS
  measureAngle, // "∠ABC = 2α" (symbolic) — before `angle`, which reads the coef as the degree value
  angle,
  tangentsFromExternal, // TWO tangents from an external point — before the single tangentLine
  tangentFromExternal, // ONE tangent from an external point — before tangentLine (tangent AT a point)
  tangentLine, // a *drawn* tangent (after the tangent∩line compound)
  bisectorLine, // a *drawn* bisector (after the bisector compounds)
  parallelConstraint, // ∥ / ⟂ constraints (keyword-anchored) — before the loose "XY = …" rules
  perpendicularConstraint,
  chainedEquality, // "AB = AC = 3x" — split a chain before any rule grabs a single clause
  arcMidpoint, // circle constructs (own keywords) before the generic point rules
  midpoint, // "C אמצע מיתר AB" — a NAMED midpoint, before `chord` grabs "מיתר AB" and drops C (after arcMidpoint)
  circleOnDiameter, // "circle with diameter AB" / "AB קוטר של מעגל" — a circle DEFINED by its diameter (centre = midpoint AB); before `diameter` (add-to-existing) and `circle`
  inscribedAngleOnDiameter, // "זווית היקפית נשענת על הקוטר" (Thales) — before `diameter` (owns "קוטר") and the angle rules
  diameterFromPoint, // "קוטר מנקודה F" — ONE on-circle label, no cut clause: auto-named antipode (issue #21); before `diameter`
  diameter,
  chord,
  circumcircle, // "circle through A B C" — before the centre-based `circle`
  nameCenter, // "O מרכז המעגל" — reveal an EXISTING circle's hidden centre; before `circle` (which would CREATE one)
  circleSizeExisting, // "היקף מעגל O1 הוא 6π" on an EXISTING circle → set-radius; before `circle` (which would re-create + drop the size)
  circle,
  foot, // before `pointOnSegment`
  pointOnExtension, // before `pointOnSegment` ("on … extension" must not read "ex" as labels)
  pointOnCircle, // "A on circle O" / the LIST "A ו C על המעגל" (every subject gets the membership) — before segment/pointOnSegment
  pointVsCircle, // "M מחוץ למעגל / בתוך המעגל" — a point's SIDE of a circle (ADR-254); tight full-match, after the external-point compounds
  radiusSegment, // "OB רדיוס" — a drawn radius (rim point on the circle + centre→rim segment); after midpoint/setRadius/circle, before `segment` (so "OB" isn't grabbed as a bare segment)
  dividesInRatio, // "G מחלקת את DC ביחס 1:2" — a point on DC at a fixed t; keyword+`p:q` anchored, BEFORE `segment` (which would grab "הקטע DC" and drop the divider) and the numeric/ratio rules
  diagonals, // "אלכסונים" / "AC ו-BD אלכסוני הריבוע" — the quad's diagonals; before `segment` (which owns the singular "אלכסון AC")
  ratioConstraint, // "AB = 2 AD" / "אורך AC גדול פי √3 מהקטע CO" — BEFORE `segment` (its "מהקטע"/"קטע" would else half-parse the relational ratio into a bare segment, dropping the factor — the dividesInRatio class, #105) and before equal/distance
  segment,
  pointsOnSegments, // "F, G, H on AB, AC, CB" — N points placed PAIRWISE on N segments, before the others
  pointsOnSegment, // "L and K are points on AC" — TWO points on a segment, before the single pointOnSegment
  pointOnSegment,
  measureOrder, // "α < β" — an inequality between two named measures (before setVar/numeric rules)
  lengthOrder, // "DC > AB" — an inequality between two SEGMENT lengths (two-letter sides; after measureOrder)
  setVar, // "x = 4" / "α = 30" — a bare variable binding; before the numeric rules
  segmentRatio, // "AE/ED = 2/3" — before the numeric rules (which would half-parse "ED=2")
  segmentRatioColon, // "DF:FC = 1:2" — bare colon-form segment ratio (no keyword); before equal/distance
  measureFraction, // "BC = 35/√32" / "√32/5" / "5√2/3" / "35/2" — a QUOTIENT length value (#77); before measureSqrt/distance
  measureSqrt, // "AB = 12√x" / "12√2" — before measureLength so the radical isn't dropped
  measurePower, // "AB = x²" / "3x^2" — before measureLength so the exponent isn't dropped
  measurePi, // "AB = 2π" — before measureLength so π isn't read as a free variable
  measureLength, // "AB = 3x" (symbolic) — before ratio/equal/distance
  equalSegments, // "AB = CD" — before distance (numeric RHS) and freePoint (coord RHS)
  distanceConstraint, // "AB = 6"
  pointByDistances,
  freePoint,
  bareFreePoint, // "נקודה A" / "point A" — a bare 2-DOF free point (no coords), after freePoint owns the coord form (#104)
  bareSegment, // LAST catch-all: a bare "AB" / "line AB" → draw the segment (after every keyword/structured rule)
];

/**
 * Spelled-out Greek letter names → their symbols, so "alpha"/"2alpha" read the same as "α"/"2α".
 * Without this the single-Greek-letter variable regex missed "alpha", and "2alpha" then half-parsed
 * to the NUMBER 2 (a wrong angle of 2°, silently dropping the variable — the ADR-024/026 class).
 * Lowercase-only and word-bounded, so an UPPERCASE point pair ("MU", "XI") is never mistaken for a
 * letter; "pi" is omitted on purpose (it collides with a segment "PI" — see {@link measurePi}).
 */
const GREEK_WORDS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ',
  tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
};
// Bounded by "not a letter" on each side rather than `\b`, so a DIGIT prefix counts ("2alpha" → "2α",
// where `\b` would fail because digit↔letter is not a word boundary) while a letter neighbour (a longer
// word) does not match.
const GREEK_RE = new RegExp(String.raw`(?<![A-Za-zα-ω])(${Object.keys(GREEK_WORDS).sort((a, b) => b.length - a.length).join('|')})(?![A-Za-zα-ω])`, 'g');
const normalizeGreek = (s: string): string => s.replace(GREEK_RE, (m) => GREEK_WORDS[m]);

/**
 * Area subscript notation → the glued compact form. Students (and textbooks) write an area as the
 * subscripted `S_{ABC}` (the toolbar `S_{}` button inserts exactly this) or `S_ABC`; the area rule reads
 * the glued `SABC` (ADR-118). Rewrite `S_{ABC}` / `S_ABC` → `SABC` up front so all three are equivalent.
 * Scoped to `S_` followed by 3–4 uppercase vertex labels, so it can't touch anything else (ADR-121).
 */
const normalizeAreaSubscript = (s: string): string =>
  s
    // `(?<![A-Za-z])` (not `\b`) so a coefficient glued to the marker is handled — "4S_{NCE}" (in the
    // ratio `S_{ACD}=4S_{NCE}`) must normalise too, where `\b` failed because digit↔S is no boundary.
    .replace(/(?<![A-Za-z])S_\{((?:[A-Z]\d*){3,4})\}/g, 'S$1') // S_{ABC} → SABC
    .replace(/(?<![A-Za-z])S_((?:[A-Z]\d*){3,4})\b/g, 'S$1'); // S_ABC → SABC

/**
 * Point-label subscript notation → the glued form (ADR-228). Students write a subscripted label the LaTeX
 * way — `O_1` / `O_{1}` — but a point token is a letter + glued digits (`[A-Za-z]\d*`, so `O1`), and the
 * underscore silently truncates it to just `O` (the `_1` dropped, e.g. "circle O_1" rendered as "O"). A
 * common paste/typing habit, so fix it at the boundary: rewrite `X_1` / `X_{1}` → `X1` for every label.
 * Scoped to a letter + `_` + DIGITS, so it can't touch the area marker's `S_{ABC}` (uppercase LETTERS).
 */
const normalizePointSubscript = (s: string): string => s.replace(/([A-Za-z])_\{?(\d+)\}?/g, '$1$2');

/** The circle a command CONSUMES (references but doesn't define), or null. */
const consumedCircleId = (cmd: AnyCommand): Id | null =>
  cmd.type === 'point-on-circle' ||
  cmd.type === 'point-circle-side' ||
  cmd.type === 'tangent' ||
  cmd.type === 'arc-midpoint' ||
  cmd.type === 'line-circle-intersection' ||
  cmd.type === 'diameter' ||
  cmd.type === 'extend-onto-circle'
    ? cmd.circle
    : null;

/** The circle a command DEFINES (creates), or null. */
const definedCircleId = (cmd: AnyCommand): Id | null =>
  cmd.type === 'circle' || cmd.type === 'circle-through' || cmd.type === 'circumcircle' ? cmd.id : null;

/**
 * Materialise an IMPLICIT circle. A decomposition — typically the LLM fallback reordering a whole problem
 * — treats the circle as *given* ("CD is a chord IN the circle", "KB tangent to circle O at K", "A on
 * circle O") and emits the consuming step WITHOUT one that creates the circle (the problem says "the
 * circle"; the implicit object is never stated). When such a step references a `circle-<centre>` that is
 * neither in the figure (`ctx.circles`) nor defined by the same utterance, PREPEND a free circle (free
 * centre + free radius, ADR-052 — the radius is unstated, so don't freeze it) so the build doesn't collapse
 * with an undefined centre. This lives in the PARSER (interpreting natural input), so the engine stays
 * strict: a referenced-but-removed circle still cascades honestly (explicit removal is not silently rescued).
 */
function withImplicitCircles(commands: AnyCommand[], ctx: ParseContext): AnyCommand[] {
  const have = new Set((ctx.circles ?? []).map((c) => c.toUpperCase()));
  const definedHere = new Set(commands.map(definedCircleId).filter((x): x is Id => x !== null));
  const prefix: AnyCommand[] = [];
  const created = new Set<string>();
  for (const cmd of commands) {
    const cid = consumedCircleId(cmd);
    if (!cid || !cid.startsWith('circle-') || definedHere.has(cid) || created.has(cid)) continue;
    const center = cid.slice('circle-'.length).toUpperCase();
    if (!center || have.has(center)) continue;
    prefix.push({ type: 'circle', id: cid, center, radius: RADIUS_DEFAULT, freeRadius: true, ifAbsent: true });
    created.add(cid);
  }
  return prefix.length ? [...prefix, ...commands] : commands;
}

/**
 * The concentric-pair QUALIFIER named in the utterance ([ADR-244](../../docs/06-decisions.md#adr-244)):
 * the Hebrew adjective FOLLOWS the circle noun ("המעגל החיצוני/הפנימי/הגדול/הקטן"), the English
 * adjective PRECEDES it ("the outer/inner/larger/smaller circle"). ADJACENCY to the circle word is
 * required — a bare "חיצוני" also appears in "נקודה חיצונית" (an external POINT) and must never read
 * as a circle qualifier.
 */
const circleQualifier = (s: string): 'outer' | 'inner' | null => {
  const he = s.match(/מעגל(?:ים)?\s+ה?(חיצוני|פנימי|גדול|קטן)/);
  if (he) return he[1] === 'חיצוני' || he[1] === 'גדול' ? 'outer' : 'inner';
  const en = s.match(/\b(outer|external|inner|internal|larg(?:er|est)?|small(?:er|est)?|big(?:ger|gest)?)\s+circles?\b/i);
  if (en) return /^(inner|internal|small)/i.test(en[1]) ? 'inner' : 'outer';
  return null;
};

/**
 * CONCENTRIC-pair reference resolution post-pass ([ADR-244](../../docs/06-decisions.md#adr-244)) — the
 * chokepoint, in the ADR-119 pattern, so EVERY circle-consuming rule gains outer/inner resolution at
 * once instead of each rule learning the qualifier. Rules mint `circle-<centre>` — the OUTER of a pair,
 * by the creation binding — so only a rewrite is ever needed: an INNER qualifier in the utterance
 * redirects the refs to the pair's inner id; an OUTER qualifier confirms them. With NO qualifier,
 * STATED membership disambiguates (a command whose named points are already members of exactly one of
 * the pair — "קשת BC" with B,C on the inner circle); otherwise the reference is genuinely ambiguous →
 * a clarification, never a silent pick and never an LLM guess. A `circle` CREATION with `ifAbsent`
 * (the macro's own output / an implicit-circle prepend) is not a reference; a bare re-creation of a
 * paired centre ("מעגל O רדיוס 4" — a RESIZE of which circle?) is ambiguous like any other reference.
 */
function withConcentricResolution(
  commands: AnyCommand[],
  s: string,
  ctx: ParseContext,
): AnyCommand[] | { clarify: 'ambiguous-circle'; center: string } {
  const pairs = ctx.concentric ?? [];
  if (!pairs.length) return commands;
  const pairByOuter = new Map(pairs.map((p) => [p.outer, p]));
  const CIRCLE_REF_KEYS = ['circle', 'circle1', 'circle2'];
  const isPairRef = (cmd: AnyCommand, key: string): boolean => {
    const v = (cmd as unknown as Record<string, unknown>)[key];
    return typeof v === 'string' && pairByOuter.has(v);
  };
  const refs = commands.flatMap((cmd) => {
    if (cmd.type === 'circle' && cmd.ifAbsent) return []; // ensure-exists, not a reference
    const keys = CIRCLE_REF_KEYS.filter((k) => isPairRef(cmd, k));
    // A non-ifAbsent (re)creation of a paired centre is a resize REFERENCE — route it through the same
    // qualifier/ambiguity gate via its `id`.
    if (!keys.length && (cmd.type === 'circle' || cmd.type === 'circle-through') && pairByOuter.has(cmd.id)) keys.push('id');
    return keys.map((key) => ({ cmd, key }));
  });
  if (!refs.length) return commands;
  const qual = circleQualifier(s);
  const membersOf = (cid: string) =>
    new Set((ctx.circleMembers ?? []).filter((e) => e.id === cid).flatMap((e) => e.points.map((p) => p.toUpperCase())));
  const targets = new Map<AnyCommand, Map<string, string>>();
  for (const { cmd, key } of refs) {
    const pair = pairByOuter.get((cmd as unknown as Record<string, string>)[key])!;
    let target: string | null = qual ? (qual === 'outer' ? pair.outer : pair.inner) : null;
    if (!target) {
      // No qualifier — stated membership picks: every point the command names that is ALREADY a member
      // of one of the pair must side with the SAME circle.
      const labels = Object.entries(cmd).flatMap(([k, v]) =>
        k === 'type' || CIRCLE_REF_KEYS.includes(k)
          ? []
          : typeof v === 'string' && /^[A-Z]\d*$/.test(v)
            ? [v]
            : Array.isArray(v)
              ? v.filter((x): x is string => typeof x === 'string' && /^[A-Z]\d*$/.test(x))
              : [],
      );
      const o = membersOf(pair.outer);
      const i = membersOf(pair.inner);
      const known = labels.filter((l) => o.has(l) || i.has(l));
      if (known.length && known.every((l) => o.has(l) && !i.has(l))) target = pair.outer;
      else if (known.length && known.every((l) => i.has(l) && !o.has(l))) target = pair.inner;
    }
    if (!target) return { clarify: 'ambiguous-circle', center: pair.center };
    const forCmd = targets.get(cmd) ?? new Map<string, string>();
    forCmd.set(key, target);
    targets.set(cmd, forCmd);
  }
  return commands.map((cmd) => {
    const forCmd = targets.get(cmd);
    if (!forCmd) return cmd;
    const patched: Record<string, unknown> = { ...(cmd as unknown as Record<string, unknown>) };
    for (const [key, target] of forCmd) patched[key] = target;
    return patched as unknown as AnyCommand;
  });
}

/**
 * CARRIER membership post-pass (`withCarrierMembership`, generalises ADR-119's chord version to diameters,
 * PAR-4). A point named as a CHORD endpoint lies ON the circle — in ANY phrasing, not only the standalone
 * `chord` rule. When "chord"/"מיתר" appears together with a relation ("CD and AF are parallel chords",
 * "the chord AB equals the chord CD", "chord AB ⟂ chord CD"), the relational rule wins the first-match
 * race (it runs before `chord` and only understands plain segments), silently dropping the on-circle
 * membership — the endpoints would end up free points joined by segments, NOT points on the circle
 * (operator session sflkyd0r: "CD ו AF מיתרים המקבילים זה לזה" → segments + ∥ only). The fix is one
 * general post-pass, not a per-relation special case: every SEGMENT endpoint in a chord-flavoured
 * utterance is asserted on the resolved circle. A DIAMETER-flavoured utterance additionally gets the
 * diameter's endpoints collinear-through-centre (so "diameter AB = 10" is a real diameter, not a chord),
 * while asserting only the diameter itself when it isn't also a chord (so a diameter ⟂ a NON-chord segment
 * doesn't force that segment onto the circle). Idempotent (the standalone `chord`/`diameter` rules' own
 * membership is deduped); a circle CENTRE is excluded so "radius OE" keeps O off the circle; a chord's
 * MIDPOINT is never a segment endpoint, so "C אמצע מיתר AB" puts A,B — not C — on the circle. Matches
 * the standalone rule's unconditional semantics (a chord's endpoints are on the circle whether they are
 * new or already placed). (ADR-119)
 */
function withCarrierMembership(commands: AnyCommand[], s: string, ctx: ParseContext): AnyCommand[] {
  const isChord = /chord|מיתר/i.test(s);
  const isDiameter = /diameter|קוטר/i.test(s);
  const isRadius = /\bradius\b|רדיוס/i.test(s);
  if (!isChord && !isDiameter && !isRadius) return commands;
  // If a CIRCLE-CONSTRUCT rule already handled the utterance (the standalone `chord`/`diameter`, or
  // `circleOnDiameter`/`pointOnCircle`/arc/…), it modelled membership itself — don't double-add. Only a
  // winner that never touched the circle (parallel/⟂/distance/equal/ratio/pointOnSegment/segments-meet —
  // bare segments + line geometry) can have DROPPED the membership and needs it restored here.
  const CIRCLE_CONSTRUCT: ReadonlySet<string> = new Set([
    'point-on-circle', 'circle', 'circle-through', 'circumcircle', 'diameter', 'arc-midpoint',
    'line-circle-intersection', 'circle-circle-intersection', 'tangent',
  ]);
  if (commands.some((c) => CIRCLE_CONSTRUCT.has(c.type))) return commands;
  const center = resolveCenter(s, ctx);
  if (!center) return commands; // no circle to anchor on — leave the parse untouched
  const circ = circleId(center);
  // A LINE construct (a collinearity / a line∩line meet) modelled the circle geometry itself ONLY when it
  // ANCHORS to the circle — references its centre (`diameterCutsSegment`'s F–O line, the `diameter` rule's
  // A·O·B collinearity). A meet of two chords ("chords AC and BD meet at E") emits the same command KINDS
  // but never touches the circle — bailing on the kind alone dropped all four memberships (review
  // 2026-07-03, P5). So bail per-command on the centre reference, not per-kind — and only for a
  // DIAMETER-flavoured utterance: a RADIUS operand legitimately touches the centre ("המיתר CK חותך את
  // הרדיוס AO בנקודה E", issue #17 — its intersection command references O, yet the chord/rim
  // memberships are exactly what this pass must restore; the pair logic below is already centre-safe).
  const LINE_CONSTRUCT: ReadonlySet<string> = new Set(['set-collinear', 'set-line', 'line-line-intersection', 'line-intersection']);
  const refsCentre = (c: AnyCommand): boolean =>
    Object.entries(c).some(([k, v]) => k !== 'type' && (v === up(center) || (Array.isArray(v) && v.includes(up(center)))));
  if (isDiameter && commands.some((c) => LINE_CONSTRUCT.has(c.type) && refsCentre(c))) return commands;
  const centers = new Set([center, ...(ctx.circles ?? [])].map(up));
  const already = new Set(
    commands.flatMap((c) => (c.type === 'point-on-circle' && c.circle === circ ? [up(c.id)] : [])),
  );
  // Ordered endpoint PAIRS drawn by the winning rule — a `segment` or a `point-on-segment` carrier (the
  // on-segment RIDER `id` is NOT an endpoint, so "C אמצע מיתר AB" puts A,B — not C — on the circle). A pair
  // touching the circle's CENTRE is a radius, not a chord — excluded (so "radius OE" keeps O off). A
  // segment touching a point the rule CREATED as an intersection is SCAFFOLDING it drew (an extension leg
  // to the new crossing, e.g. K→P in "המשך הקטע KO חותך את המיתר CB בנקודה P"), never a stated chord —
  // excluded, so the crossing itself is not forced onto the circle (issue #17).
  const newMeets = new Set(
    commands.flatMap((c) =>
      c.type === 'line-line-intersection' || c.type === 'line-intersection' || c.type === 'line-circle-intersection'
        ? [up(c.id)]
        : [],
    ),
  );
  const pairs: Id[][] = []; // chord/diameter: an endpoint pair NOT touching the centre
  const rims: Id[] = []; // radius: the non-centre end of a centre→rim carrier ("D on radius OB" → B)
  for (const c of commands) {
    if (c.type !== 'segment' && c.type !== 'point-on-segment') continue;
    const ab = [up(c.a), up(c.b)];
    if (ab.some((id) => newMeets.has(id))) continue; // scaffolding to a new crossing, not a stated carrier
    const centreEnds = ab.filter((id) => centers.has(id));
    if (centreEnds.length === 0) pairs.push(ab);
    else if (isRadius && centreEnds.length === 1) rims.push(ab.find((id) => !centers.has(id))!);
  }
  if (!pairs.length && !rims.length) return commands;
  // WHICH pair is the diameter? Never "the first segment the winner drew" — that is utterance order, so
  // "המיתר CD מאונך לקוטר AB" (chord named first) forced the CHORD through the centre and left the real
  // diameter a chord: a silently WRONG figure that even verifies green (review 2026-07-03, P1). Resolve
  // it from the TEXT instead: the pair adjacent to the diameter noun ("לקוטר AB" / "diameter AB", or the
  // labels-first "AB קוטר"); a lone pair is unambiguous; otherwise DON'T GUESS (skip the diameter
  // semantics — ADR-052's no-unstated-assumption rule).
  const diameterPair = (): Id[] | null => {
    if (!isDiameter) return null;
    const afterNoun = s.match(/(?:diameter|קוטר)[^A-Za-z]{0,4}([A-Za-z]\d*)\s*([A-Za-z]\d*)/i);
    const beforeNoun = s.match(/([A-Za-z]\d*)\s*([A-Za-z]\d*)[^A-Za-z]{0,6}(?:diameter|קוטר)/i);
    for (const m of [afterNoun, beforeNoun]) {
      if (!m) continue;
      const want = [up(m[1]), up(m[2])].sort().join('|');
      const hit = pairs.find((p) => [...p].sort().join('|') === want);
      if (hit) return hit;
    }
    return pairs.length === 1 ? pairs[0] : null;
  };
  const diaPair = diameterPair();
  // A CHORD utterance puts EVERY named segment on the circle (both "parallel chords", and a diameter is
  // itself a chord); a diameter-ONLY utterance ("diameter AB = 10") asserts just the resolved diameter
  // pair — so an unrelated segment (a diameter ⟂ a NON-chord) isn't wrongly forced onto the circle. A
  // pure radius utterance contributes no chord/diameter pair — only its rim point below.
  const memberPairs = isChord ? pairs : diaPair ? [diaPair] : [];
  const endpoints: Id[] = [];
  for (const [a, b] of memberPairs) for (const id of [a, b]) if (!centers.has(id) && !already.has(id) && !endpoints.includes(id)) endpoints.push(id);
  // A RADIUS carrier's rim point ("D on radius OB" → B) lies on the circle too.
  for (const id of rims) if (!already.has(id) && !endpoints.includes(id)) endpoints.push(id);
  const extra: AnyCommand[] = endpoints.map((id) => ({ type: 'point-on-circle', id, circle: circ }));
  // A DIAMETER passes through the centre — add the collinearity so the RESOLVED pair is a DIAMETER, not
  // just a chord. (A winner that modelled the diameter itself — the `diameter` rule's kinds, or a
  // centre-anchored collinearity — already bailed above, so no double-add here.)
  if (diaPair) extra.push({ type: 'set-collinear', a: diaPair[0], b: up(center), c: diaPair[1] });
  if (!extra.length) return commands;
  return [...extra, ...commands];
}

/**
 * ON-CIRCLE membership post-pass ([ADR-119](docs/06-decisions.md#adr-119) family / issue #97): a point the
 * student explicitly states is ON THE CIRCLE — "D על המעגל כך ש-CD מקביל ל-EA" / "D on the circle such that
 * …" — whose membership a relation rule (parallel/⟂/distance/…) DROPPED when it claimed the rest of the
 * clause. Without it D floats free (a green row, a silently-wrong figure — the §6 honesty class). Assert
 * `point-on-circle` for every label the utterance says is `על המעגל` / `on the circle`, when a circle
 * resolves; idempotent (a point a circle-construct already placed is skipped). PREPENDED so the point is
 * created ON the circle before the relation drives its remaining DOF.
 */
function withOnCircleMembership(commands: AnyCommand[], s: string, ctx: ParseContext): AnyCommand[] {
  if (!/על\s+ה?מעגל|on\s+the\s+circle/i.test(s)) return commands;
  const center = resolveMentionedCircle(s, ctx);
  if (!center) return commands; // no single/named circle to anchor on
  const circ = circleId(center);
  const already = new Set(commands.flatMap((c) => (c.type === 'point-on-circle' && c.circle === circ ? [up(c.id)] : [])));
  const add: AnyCommand[] = [];
  // The label must be a STANDALONE token immediately before "on the circle" (`(?<![A-Za-z])` so the last
  // letter of a word — "are ON the circle" → not "e" — is never captured, PAR-2/ADR-240 regression).
  for (const m of s.matchAll(/(?<![A-Za-z])([A-Za-z]\d*)\s*(?:על\s+ה?מעגל|on\s+the\s+circle)/gi)) {
    const id = up(m[1]);
    if (id === up(center) || already.has(id)) continue; // the centre isn't ON its circle; don't double-add
    add.push({ type: 'point-on-circle', id, circle: circ });
    already.add(id);
  }
  return add.length ? [...add, ...commands] : commands;
}

/**
 * CARRIER auto-draw post-pass (ADR-250): a stated on-segment point implies its carrier SEGMENT is part
 * of the figure — "G on AD" draws AD; "D on the continuation of BC" draws BC AND the extension leg C→D.
 * Honesty (design-rules §6): everything the student stated must be visible. Enforced here at the parse
 * seam so EVERY rule that places a point on a segment is covered at once — the per-rule convention
 * (midpoint/angle draw their implied segments) kept being forgotten: `pointOnExtension` drew NOTHING and
 * the student had to re-type each edge by hand (session m68n76e7). `segment` is idempotent (and creates
 * missing endpoints), so a carrier that already exists costs nothing. Ordering: the base segment goes
 * BEFORE its rider (the rider needs the endpoints), the extension leg AFTER it (the leg references the
 * new point).
 */
function withCarrierSegments(commands: AnyCommand[]): AnyCommand[] {
  const key = (a: Id, b: Id): string => [up(a), up(b)].sort().join('|');
  const have = new Set<string>();
  for (const c of commands) if (c.type === 'segment') have.add(key(c.a, c.b));
  const out: AnyCommand[] = [];
  for (const c of commands) {
    if (c.type === 'point-on-segment') {
      if (!have.has(key(c.a, c.b))) {
        have.add(key(c.a, c.b));
        out.push({ type: 'segment', a: c.a, b: c.b });
      }
      out.push(c);
      // the stated continuation leg (a→b→id): "D על המשך BC" shows B—C—D, not a floating D
      if (c.extension && !have.has(key(c.b, c.id))) {
        have.add(key(c.b, c.id));
        out.push({ type: 'segment', a: c.b, b: c.id });
      }
      continue;
    }
    out.push(c);
  }
  return out;
}

/**
 * Numeric values the utterance STATES but the parsed commands don't account for — the NUMERIC sibling of
 * {@link droppedNewLabels} (ADR-089 → ADR-250). A first-match rule can claim an utterance and consume only
 * part of it, silently dropping a stated magnitude: session m68n76e7's
 * "שטח AEB גדול פי 2.25 משוטח משולש CED" (typo משוטח for משטח) was claimed by the TRIANGLE rule and
 * committed as a bare △AEB — the 2.25 area ratio vanished with the row showing ✓. Design-rules §6 forbids
 * exactly this ("no stated magnitude is ever silently dropped"); the caller escalates to the LLM (whose
 * job is typo/freeform input) instead of committing the partial parse.
 *
 * "Accounted" is deliberately GENEROUS — a false account only suppresses a warning (the droppedNewLabels
 * S-mask rationale), while a false drop would break a working input. A stated number is accounted when it
 * appears among the commands' numeric payloads (including digits inside symbolic-string fields), as a
 * string-array length (regular N-gon → `ids.length`), or via the standard lowerings: a fraction a/b → its
 * value, a percent n% → n/100, a π-size nπ → n/2 (circumference → radius) or √n (area → radius).
 * Label-glued digits (`O1`, `A2`) are subscripts, not numbers — blanked before extraction.
 */
export function droppedGivenNumbers(utterance: string, commands: AnyCommand[]): number[] {
  const q = (n: number): number => Math.round(n * 1e6) / 1e6;
  const acc = new Set<number>();
  const walk = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) acc.add(q(v));
    else if (typeof v === 'string') {
      for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) acc.add(q(parseFloat(m)));
    } else if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'string')) acc.add(v.length);
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  for (const c of commands) walk(c);
  const ok = (cands: number[]): boolean => cands.some((v) => Number.isFinite(v) && acc.has(q(v)));
  // stated numbers: blank labels FIRST (a subscript digit — O1, A2 — is part of a label, not a number)
  const raw = normalizeUtterance(utterance);
  const s = raw.replace(/[A-Za-z]\d*/g, ' ');
  // A DIAMETER given lowers to radius = d/2 (ADR-259). Checked on the UN-blanked text: blanking wipes the
  // English keyword "diameter" (each Latin letter → space), so the number's radius half would look dropped.
  const hasDiameter = /diameter|קוטר/i.test(raw);
  const dropped: number[] = [];
  const seen = new Set<string>();
  // a stated FRACTION lowers to one value (ratio 3/4 → r=0.75) — consume it whole. RADICAL-aware (#77): a
  // quotient term may sit under a √ ("35/√32", "√32/5", "5√2/3"); the √ breaks a plain digit/digit span, so
  // each side is captured whole and evaluated (`[coef ·] √ n` or a plain number) — the value the parser
  // lowered to (a length's expr.value, a fraction radius) is what must be accounted, not the raw digits.
  // A radical's radicand may be a BARE number (`√32`) or a PARENTHESISED value (`√(2/3)`, `√(2)` — the ADR-298
  // Am. explicit grouping the √ button produces); `evalTerm` computes both, and the standalone pass below
  // accounts a radical that isn't part of a top-level fraction (`√(2/3)`, whose only division is inside the root).
  const RAD = String.raw`√\s*(?:\(\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*\)|\d+(?:\.\d+)?)`;
  // a TERM tolerates an OUTER paren pair `(5√2)` (the ADR-298 Am. explicit grouping) around the `[coef]√rad`
  // or plain number.
  const TERM = String.raw`\(?\s*(?:(?:\d+(?:\.\d+)?\s*[*·]?\s*)?${RAD}|\d+(?:\.\d+)?)\s*\)?`;
  const evalTerm = (raw: string): number => {
    const t = raw.trim().replace(/^\(([\s\S]*)\)$/, '$1'); // strip an outer paren pair, keep an inner √(…)
    const r = t.match(/^(?:(\d+(?:\.\d+)?)\s*[*·]?\s*)?√\s*(?:\(\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*\)|(\d+(?:\.\d+)?))$/);
    if (!r) return parseFloat(t);
    const rn = r[2] ?? r[4];
    const radicand = r[3] !== undefined ? parseFloat(rn!) / parseFloat(r[3]) : parseFloat(rn!);
    return (r[1] ? parseFloat(r[1]) : 1) * Math.sqrt(radicand);
  };
  // One pass over each VALUE expression `TERM [ / TERM ]` (longest match wins, so `35/√(32)` and `√(2/3)` are
  // each consumed WHOLE — never re-read as an inner `2/3`). Only a match that actually carries a √ or a top-
  // level `/` is accounted here; a lone plain number falls through to the digit loop below, which owns the
  // π / percent / diameter lowerings.
  const spans: [number, number][] = [];
  for (const m of s.matchAll(new RegExp(String.raw`(${TERM})(?:\s*\/\s*(${TERM}))?`, 'g'))) {
    if (!/√|\//.test(m[0])) continue; // a bare number → the single-number loop (with its π/%/diameter candidates)
    const i = m.index!;
    if (spans.some(([x, y]) => i >= x && i < y)) continue;
    spans.push([i, i + m[0].length]);
    const numV = evalTerm(m[1]);
    const denV = m[2] !== undefined ? evalTerm(m[2]) : 1;
    const val = denV !== 0 ? numV / denV : numV;
    if (!ok([val, numV, denV]) && !seen.has(m[0])) {
      seen.add(m[0]);
      dropped.push(val);
    }
  }
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    const i = m.index!;
    if (spans.some(([x, y]) => i >= x && i < y)) continue;
    const n = parseFloat(m[0]);
    const rest = s.slice(i + m[0].length);
    const cands = [n];
    if (/^\s*π/.test(rest)) cands.push(n / 2, Math.sqrt(n)); // nπ — circumference/area sizes lower to a radius
    if (/^\s*%/.test(rest)) cands.push(n / 100); // n% — lowers to a fraction
    if (hasDiameter) cands.push(n / 2); // "diameter 10" / "קוטר 10" → radius d/2 (ADR-259)
    if (!ok(cands) && !seen.has(m[0])) {
      seen.add(m[0]);
      dropped.push(n);
    }
  }
  // WORD magnitudes (issue #2, ADR-250's named follow-up): a stated fraction written as a WORD with no
  // digit ("רבע", "חצי", "half") never reaches the digit extraction above, so a rule that claimed the
  // utterance without lowering the word committed a silently-wrong relation ("AB שווה לחצי BC" as plain
  // equality). Scanned on the UN-blanked text (blanking wipes English words), only when the utterance
  // states a RELATION (a bare word is a construct/noun context) — and the shape nouns "חצי מעגל" /
  // "רבע מעגל" (semicircle / quarter-circle) are exempt via a lookahead. Accounted generously as the
  // value OR its inverse (rules lower "רבע מ-X" as k=4 on the mirrored side).
  const REL_MARKER = /[=<>≥≤]|שווה|גדול|קטן|\bפי\b|equals?|larger|greater|smaller|less|twice/i;
  if (REL_MARKER.test(raw)) {
    const WORD_MAGNITUDES: [RegExp, number][] = [
      [/(?<![א-ת])(?:[ולבמכ]-?)?מחצית(?![א-ת])/, 0.5],
      [/(?<![א-ת])(?:[ולבמכ]-?)?חצי(?!\s*(?:ה?מעגל|ה?עיגול))(?![א-ת])/, 0.5],
      [/(?<![א-ת])(?:[ולבמכ]-?)?רבע(?!\s*(?:ה?מעגל|ה?עיגול))(?![א-ת])/, 0.25],
      [/(?<![א-ת])(?:[ולבמכ]-?)?שליש(?![א-ת])/, 1 / 3],
      [/\bhalf\b(?!\s*(?:a\s+|of\s+a\s+)?circle)/i, 0.5],
      [/\bquarter\b(?!\s*(?:of\s+a\s+)?circle)/i, 0.25],
    ];
    for (const [re, v] of WORD_MAGNITUDES) {
      const m = raw.match(re);
      if (m && !ok([v, 1 / v]) && !seen.has(m[0])) {
        seen.add(m[0]);
        dropped.push(q(v));
      }
    }
  }
  return dropped;
}

/**
 * The single normalization applied to every utterance before the rules run — ORTHOGRAPHY first (PAR-7),
 * then collapse whitespace, spell out Greek letter words, and rewrite `S_{ABC}`/`S_ABC` area subscripts.
 * Extracted so the shadow-matrix guard (A1) analyses the SAME text the rules actually see. Pure.
 *
 * Orthography (PAR-7): Word/PDF paste the Hebrew MAQAF `־` (U+05BE) where the grammar's suffix groups
 * (`ל-?`/`ב-?`/`מ-?`) expect an ASCII hyphen, and copy invisible BIDI/zero-width control chars into mixed
 * He/Latin text — both silently break `\s*`/optional-`-` adjacency, so e.g. "נקודה E על AC ב־40%" dropped
 * the ratio. Fixing it here, at the boundary, kills the whole class in one place instead of per-rule.
 */
/** Uppercase Cyrillic letters that are visual twins of Latin uppercase (#45 / ADR-299) — mapped to Latin so
 *  a label pasted with a homoglyph is read as the letter it looks like. Only the unambiguous look-alikes. */
const CYRILLIC_TO_LATIN: Record<string, string> = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' };

export function normalizeUtterance(raw: string): string {
  // maqaf U+05BE → ASCII hyphen (so the ל-?/ב-?/מ-? suffix groups match); then strip invisible format
  // chars: ALM, ZWSP/ZWNJ/ZWJ/LRM/RLM, LRE…RLO, isolates LRI…PDI, BOM.
  // עיגול (disk) ≡ מעגל (circle): the everyday Hebrew synonym students use interchangeably. Normalising it
  // to the canonical circle word HERE — at the one boundary every rule reads — means the whole circle
  // vocabulary (creation, sizing, chord, tangent, inscribe…) accepts it without touching each rule.
  const orth = raw
    .replace(/־/g, '-')
    .replace(/[؜​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/עיגול/g, 'מעגל')
    // Angle/degree GLYPH variants (#45 / ADR-299): the ∡ MEASURED-ANGLE (U+2221) and ∢ SPHERICAL-ANGLE
    // (U+2222) glyphs are the same student intent as ∠ (U+2220); the SUPERSCRIPT ZERO ⁰ (U+2070), typed for
    // degrees ("90⁰"), is the ° sign. Normalising here means every angle rule reads the canonical glyphs.
    .replace(/[∡∢]/g, '∠')
    .replace(/⁰/g, '°')
    // Uppercase CYRILLIC homoglyphs → Latin (#45): a label pasted with a Cyrillic look-alike (А/В/С/… are
    // NOT [A-Za-z]) silently fails every label rule. Map the visual twins to their Latin letter at the one
    // boundary every rule reads, so "מעגל עם קוטר АВ" reads AB.
    .replace(/[АВСЕНКМОРТХ]/g, (ch) => CYRILLIC_TO_LATIN[ch])
    // The Hebrew word "שורש N" (square root) ≡ the √ glyph (issue #105) — normalise it HERE so every
    // length/ratio/radius value path inherits it. Only before a number or "(" (so "שורש של" etc. is untouched).
    .replace(/שורש\s*(?=[\d(])/g, '√')
    // Verbose length frame "אורך/הצלע/הקטע <seg> הוא/היא/שווה <value>" → "<seg> = <value>" (issue #105), so
    // the existing length rules handle the wordy phrasing. Requires a VALUE (√/digit/"(") after the copula,
    // so the ratio form "הצלע BC גדולה פי 2 …" (no copula, a comparative) is left to `ratioConstraint`.
    .replace(/(?:אורך|הצלע|הקטע)\s+([A-Za-z]\d*\s*[A-Za-z]\d*)\s+(?:הוא|היא|שווה(?:\s*ל-?)?)\s+(?=[√\d(])/g, '$1 = ');
  return normalizeAreaSubscript(normalizePointSubscript(normalizeGreek(normalizeInscriptionSlip(orth.trim().replace(/\s+/g, ' ')))));
}

/**
 * The חוסם/חסום slip (issues #31/#38, ADR-283): an ACTIVE circumscribes verb directly governing a
 * ב-marked container noun — «משולש ABC חוסם במעגל» — is self-contradictory as written (the verb says
 * the polygon contains the circle, the ב says the circle contains the polygon). Per [ADR-245] the
 * CONTAINER MARKER is authoritative, and grammatically "circumscribes" takes a direct object
 * (חוסם **את** המעגל) — the ב-form only ever occurs as the one-letter slip for the passive חסום.
 * Rewriting active→passive HERE, at the one boundary every rule reads, means the incircle rule,
 * the inscribe tail-gate, the clause split, and every future consumer resolve the direction the
 * same way — the marker wins, never the verb letter. Direct-object (חוסם את המעגל) and bare
 * (חוסם מעגל) circumscribes statements carry no conflicting marker and are untouched; the En
 * twin "circumscribed in a circle" gets the same treatment.
 */
const CONTAINER_NOUNS_HE = 'מעגל|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|דלתון|עפיפון|מקבילית';
const HOSEM_TO_PASSIVE: Record<string, string> = { 'חוסם': 'חסום', 'חוסמת': 'חסומה', 'חוסמים': 'חסומים', 'חוסמות': 'חסומות' };
const normalizeInscriptionSlip = (s: string): string =>
  s
    .replace(
      new RegExp(String.raw`(חוסם|חוסמת|חוסמים|חוסמות)(?=\s+ב-?ה?(?:${CONTAINER_NOUNS_HE}))`, 'g'),
      (m) => HOSEM_TO_PASSIVE[m] ?? m,
    )
    .replace(/circumscrib\w+(?=\s+in\s+(?:a\s+|the\s+|another\s+)?(?:circle|triangle|square|rectangle|rhombus|kite|trapezoid|parallelogram|quadrilateral))/gi, 'inscribed');

export function parse(raw: string, ctx: ParseContext = NO_CONTEXT): ParseResult {
  const s = normalizeUtterance(raw);
  if (!s) return { ok: false, reason: 'not-handled' };
  // «המעגל הגדול/הקטן» between two INDEPENDENT circles (issue #102, operator ruling): the size
  // qualifier both REFERS and ASSERTS — resolve the reference to a concrete circle (recorded roles
  // first, else assign by the drawn sizes) and, on a first ASSIGNING use, append the R>r-like
  // `set-radius-order` requirement so sampling can never swap which circle is the big one. A
  // ctx-aware REWRITE at the one parse boundary (the ADR-119/244 chokepoint), so every
  // circle-consuming rule gains the reference at once. Concentric pairs keep their ADR-244 path.
  const q = resolveSizeQualifier(s, ctx);
  if (q) {
    const r = parseResolved(q.s, ctx);
    if (r.ok && q.assert) return { ok: true, commands: [...r.commands, { type: 'set-radius-order', outer: q.assert.outer, inner: q.assert.inner }] };
    return r;
  }
  return parseResolved(s, ctx);
}

/** The size-qualifier resolution (issue #102): rewrite each «[ל/ב/…]המעגל הגדול/הקטן» / "the big/small
 *  circle" to the concrete `מעגל <centre>` it denotes. Roles come from a recorded `set-radius-order`
 *  (consistent forever after); an unrecorded first use ASSIGNS them from the currently-drawn sizes (the
 *  M4 soft default — what the student is looking at) and returns `assert` so the caller appends the
 *  locking `set-radius-order`. Exactly TWO visible circles (a concentric pair keeps ADR-244; 0/1/3+ —
 *  existing behavior / escalate). The INDEFINITE creation adjective («מעגל גדול שרדיוסו R» — no ה on
 *  the adjective) is deliberately not matched: that is a creation, whose adjective shapes the seed. */
function resolveSizeQualifier(s: string, ctx: ParseContext): { s: string; assert?: { outer: Id; inner: Id } } | null {
  if ((ctx.concentric ?? []).length > 0) return null; // ADR-244 owns concentric qualifiers
  const HE = String.raw`([לבמשו]?)(ה?)מעגל\s+ה(גדול|קטן)`;
  const EN = String.raw`\bthe\s+(big(?:ger|gest)?|larg(?:er|est)?|small(?:er|est)?|little)\s+circle\b`;
  if (!new RegExp(HE).test(s) && !new RegExp(EN, 'i').test(s)) return null;
  const sizes = ctx.circleSizes ?? [];
  if (sizes.length !== 2) return null;
  const rec = (ctx.radiusOrder ?? []).find((o) => sizes.some((x) => x.id === o.outer) && sizes.some((x) => x.id === o.inner));
  let outerId: string, innerId: string;
  let assert: { outer: Id; inner: Id } | undefined;
  if (rec) {
    outerId = rec.outer;
    innerId = rec.inner;
  } else {
    const [a, b] = sizes;
    const big = a.r >= b.r ? a : b;
    const small = big === a ? b : a;
    outerId = big.id;
    innerId = small.id;
    assert = { outer: big.id, inner: small.id };
  }
  const centreOf = (id: string) => sizes.find((x) => x.id === id)!.center;
  let out = s.replace(new RegExp(HE, 'g'), (_m, pre: string, _ha: string, adj: string) => `${pre}מעגל ${centreOf(adj === 'גדול' ? outerId : innerId)}`);
  out = out.replace(new RegExp(EN, 'gi'), (_m, adj: string) => `circle ${centreOf(/^(small|little)/i.test(adj) ? innerId : outerId)}`);
  return { s: out, ...(assert ? { assert } : {}) };
}

/** The parse body AFTER normalization + size-qualifier resolution (the pre-#102 `parse`). */
function parseResolved(s: string, ctx: ParseContext): ParseResult {
  const whole = runRules(s, ctx);
  // ADR-264 Am. 1 / issue #33: a winning parse (or a rule's clarification) that silently DROPPED something
  // the student stated — a shape NOUN left unmaterialized, a circle predicate, a radius symbol, a REGION
  // subject, or a symbol-form RELATION (`ED=EC`) — means a LAX rule claimed a clause out of a compound and
  // dropped the rest. "משולש שווה שוקיים שבו AB=AC" committed as just segments + set-equal (no triangle!);
  // an unpunctuated run-on given-list ("AB קוטר במעגל D אמצע הרדיוס OB … DE מקביל ל BC ED=EC …") let a
  // permissive circle compound grab the whole string and lower it to garbage (במעגל D swallowed the next
  // clause's D; מקביל bound the wrong operands; ED=EC vanished). One guard here covers the whole lax family
  // at once (never per-rule; §3 chokepoint discipline): never commit the drop — try the clause split (the
  // deterministic rescue when there ARE separators: "משולש שווה שוקיים" parses bare + the given pins it),
  // else escalate the WHOLE line honestly. `droppedGivenRelations` is the App-level commit gate too, so a
  // legitimate single-rule parse (the relation lands in a `set-*` or introduces a label) is never blocked.
  if (
    (whole.ok &&
      (droppedShapeNoun(s, whole.commands, ctx) ||
        droppedCirclePredicate(s, whole.commands) ||
        droppedRadiusSymbol(s, whole.commands).length > 0 ||
        droppedGivenRelations(s, whole.commands).length > 0 ||
        droppedRegionSubject(s, whole.commands))) ||
    (!whole.ok && whole.reason !== 'not-handled' && droppedShapeNoun(s, [], ctx))
  ) {
    return splitStatements(s, ctx) ?? regionSideFallback(s, ctx) ?? { ok: false, reason: 'not-handled' };
  }
  // A clarification (ambiguous-angle / ambiguous-circle) is a rule's genuine question — propagate it,
  // never second-guess it with a split. Only a flat not-handled falls through to the clause fallback.
  if (whole.ok || whole.reason !== 'not-handled') return whole;
  return splitStatements(s, ctx) ?? regionSideFallback(s, ctx) ?? whole;
}

/**
 * Trailing POLYGON-REGION clause fallback (issue #99 — the ADR-254 circle-side family, polygon edition):
 * "הנקודה E נמצאת על מעגל O בתוך המשולש KAO" / "E is on circle O inside triangle KAO" — a point-defining
 * (or point-referencing) statement carrying a REGION disambiguator that selects which part of its carrier
 * the point occupies. No rule owns the compound, so the whole line used to escalate → not-understood and
 * the statement VANISHED. A LAST-RESORT fallback (runs only after runRules + splitStatements both fail, so
 * inscriptions — which parse fully — are untouched): strip the trailing region clause, parse the HEAD
 * normally, and attach a `point-polygon-side` requirement to the point the head introduces. A bare head
 * ("הנקודה E בתוך המשולש KAO") attaches to that point directly — a NEW id becomes a free point seeded on
 * the stated side (apply), an EXISTING id is an M1 statement. Region vertices must already be known points
 * (a region reference, never a construction); an ambiguous subject (0 or 2+ introduced points) defers.
 */
const REGION_TAIL = new RegExp(
  String.raw`[,\s]+(?:ש?נמצאת\s+|ש?נמצא\s+|is\s+|lies\s+|and\s+)*(בתוך|מחוץ\s*ל-?|inside(?:\s+of)?|outside(?:\s+of)?)\s*(?:the\s+)?(?:ה?(?:משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|דלתון|מקבילית)|triangle|quadrilateral|square|rectangle|rhombus|trapezoid|kite|parallelogram)\s+((?:[A-Z]\d*\s*){3,4})\s*\.?\s*$`,
);
/**
 * A REGION-clause utterance whose SUBJECT the winning parse dropped (issue #99) — the region lane of
 * the dropped-given honesty family (labels ADR-089, numbers ADR-250, relations ADR-264, radius #53):
 * a bare "M בתוך המשולש ABC" is claimed by the `triangle` rule ("משולש ABC" matches; a lone label is
 * not SHAPE_LEFTOVER), silently dropping M and the stated region. When the trailing region clause is
 * present, no command carries a region, and a head label went unreferenced — rescue via
 * {@link regionSideFallback}, never commit the subject-less half-parse.
 */
function droppedRegionSubject(s: string, commands: AnyCommand[]): boolean {
  const m = s.match(REGION_TAIL);
  if (!m) return false;
  if (commands.some((c) => c.type === 'point-polygon-side')) return false;
  const used = new Set(JSON.stringify(commands).match(/[A-Z]\d*/g) ?? []);
  return (s.slice(0, m.index).match(/[A-Z]\d*/g) ?? []).some((l) => !used.has(l));
}

function regionSideFallback(s: string, ctx: ParseContext): ParseResult | null {
  const m = s.match(REGION_TAIL);
  if (!m) return null;
  const side: 'inside' | 'outside' = /בתוך|inside/i.test(m[1]) ? 'inside' : 'outside';
  const poly = (m[2].match(/[A-Z]\d*/g) ?? []).map(up);
  if (poly.length < 3) return null;
  const have = new Set((ctx.points ?? []).map(up));
  // The region is normally a REFERENCE to drawn vertices. An all-NEW TRIANGLE is the one implicit
  // creation allowed ("E inside triangle KAO" states the triangle exists — the withImplicitCircles
  // pattern, triangle edition); a partially-known vertex set is ambiguous (a typo'd reference?) and a
  // non-triangle noun stays reference-only — both escalate.
  const allKnown = poly.every((p) => have.has(p));
  const allNew = poly.every((p) => !have.has(p));
  const isTriangle = poly.length === 3 && /משולש|triangle/i.test(m[0]);
  if (!allKnown && !(allNew && isTriangle)) return null;
  const prefix: AnyCommand[] = allKnown ? [] : [{ type: 'triangle', ids: [poly[0], poly[1], poly[2]] }];
  const head = s.slice(0, m.index).trim();
  if (!head) return null;
  // (a) a BARE point-reference head — "הנקודה E" / "נקודה E" / "point E" / "E" — merely NAMES the region's
  // subject. Checked FIRST: since #104 a bare "נקודה E" parses to a standalone free-point on its own, but
  // here it is just the subject label, so point-polygon-side creates E (a free point seeded on the side) —
  // an extra free-point command would double-declare it. A genuine full-statement head (more than a bare
  // label after stripping the נקודה/point word) falls through to (b).
  const one = head
    .replace(/ה?נקודה|ה?נקודות|points?/gi, ' ')
    .trim()
    .match(/^([A-Z]\d*)$/);
  if (one) {
    const id = up(one[1]);
    if (poly.includes(id)) return null;
    return { ok: true, commands: [...prefix, { type: 'point-polygon-side', id, poly, side }] };
  }
  // (b) the head is a full statement of its own ("הנקודה E נמצאת על מעגל O") — parse it and attach the
  // region to the ONE point it introduces; 0 or 2+ introduced points is ambiguous → defer to the LLM.
  const r = runRules(head, ctx);
  if (r.ok) {
    const introduced = [
      ...new Set(
        r.commands
          .map((c) => (c as { id?: unknown }).id)
          .filter((x): x is string => typeof x === 'string' && /^[A-Z]\d*$/.test(x) && !have.has(up(x))),
      ),
    ];
    if (introduced.length === 1 && !poly.includes(up(introduced[0]))) {
      return { ok: true, commands: [...prefix, ...r.commands, { type: 'point-polygon-side', id: up(introduced[0]), poly, side }] };
    }
    return null;
  }
  return null;
}

/**
 * A stated POLYGON noun the parsed commands never materialize (ADR-264 Am. 1) — the shape-declaration
 * sibling of `droppedGivenRelations`. True when the utterance names a polygon kind and (a) no command
 * creates a polygon (every polygon creator — triangle/quad/…/shape-variant/inscribe — carries a ≥3-id
 * `ids` run), and (b) the noun is not a REFERENCE: a noun followed (or preceded, "ABC משולש") by a
 * label run whose letters the commands or the figure already know is naming an existing/derivable
 * triangle ("קטע האמצעים PQ לצלע BC במשולש ABC" — P,Q ride A,B,C), and a bare noun with polygons
 * already in the figure is a definite reference ("גובה מ A במשולש"). CIRCLE nouns are deliberately
 * excluded: a circle word in a relation utterance is a carrier/membership marker owned by the
 * `withCarrierMembership`/`withImplicitCircles` post-passes (ADR-119), not a dropped construction.
 */
const POLY_NOUN =
  /משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|דלתון|מקבילית|מחומש|משושה|triangle|quadrilateral|square|rectangle|rhombus|trapezoid|kite|parallelogram|pentagon|hexagon/gi;
function droppedShapeNoun(s: string, commands: AnyCommand[], ctx: ParseContext): boolean {
  if (commands.some((c) => Array.isArray((c as { ids?: unknown }).ids) && ((c as { ids: unknown[] }).ids.length >= 3))) return false;
  const known = new Set([
    ...(ctx.points ?? []).map((p) => p.toUpperCase()),
    ...(JSON.stringify(commands).match(/[A-Z]\d*/g) ?? []),
  ]);
  for (const m of s.matchAll(POLY_NOUN)) {
    const after = s.slice(m.index! + m[0].length);
    const before = s.slice(0, m.index!);
    const run =
      after.match(/^(?:ים|ות)?\s+ה?((?:[A-Z]\d*\s*){3,})/)?.[1] ?? before.match(/((?:[A-Z]\d*\s*){3,})\s*$/)?.[1];
    if (!run) {
      if ((ctx.polygons?.length ?? 0) > 0) continue; // a bare noun with a polygon on the figure = definite reference
      return true; // a bare shape DECLARATION nothing materialized
    }
    const letters = run.match(/[A-Z]\d*/g) ?? [];
    if (!letters.every((l) => known.has(l))) return true; // names a vertex nothing accounts for
  }
  return false;
}

/**
 * A TRAILING inscribe predicate — "… חוסם במעגל" / "… חסום במעגל O" / "… inscribed in a circle" — the
 * circle sibling of `droppedShapeNoun` (ADR-264 Am. 2). The lax relation rules (equality/distance/angle,
 * all matching their clause mid-string) claim a compound like "AB=AC חוסם במעגל" and the inscribe clause
 * vanishes; and the `circumcircle` rule itself has no leftover guard, so the WHOLE line
 * "משולש שווה שוקיים ABC שבו AB=AC חוסם במעגל" used to commit as a bare circumcircle, silently dropping
 * the shape AND the stated pair. The predicate is detected by verb+circle ADJACENCY at the END of the
 * piece (a mid-string circle word stays owned by its rules / the ADR-119 carrier post-passes — this is
 * deliberately narrower than a word test, §2.4). Inflections: masc/fem/plural, optional ש/ה prefix.
 * The predicate may CARRY its circle's qualifier + size clause ("במעגל אחר, שרדיוסו r" / "in another
 * circle whose radius is r" — issue #53): the end-anchor must not be defeated by a trailing modifier of
 * the predicate's own circle, or the gate goes blind exactly when a rule branch drops the whole clause.
 */
const CIRCLE_PRED_TAIL =
  /(?:^|\s+)((?:[שה])?(?:חסום|חסומה|חסומים|חסומות|חוסם|חוסמת|חוסמים|חוסמות)\s+במעגל(?:\s+אחר)?(?:\s+[A-Z]\d*)?(?:,?\s*(?:ש|ו)?רדיוסו\s+\S+)?|(?:is\s+|are\s+)?inscribed\s+in\s+(?:a\s+|the\s+|another\s+)?circle(?:\s+[A-Z]\d*)?(?:,?\s+(?:whose\s+radius\s+is|with\s+radius|of\s+radius)\s+\S+)?)\s*$/i;
function droppedCirclePredicate(s: string, commands: AnyCommand[]): boolean {
  if (!CIRCLE_PRED_TAIL.test(s)) return false;
  // Accounted when ANY command touches a circle (creates one, places a point on one, asserts
  // concyclicity…) — the ADR-156 idempotent re-inscribe (which returns only the polygon because the
  // vertices are ALREADY on the circle) is re-derived identically by the clause split, so a trip there
  // is harmless (same commands, deterministic ids).
  return !commands.some(
    (c) => /circle|concyclic/i.test(c.type) || 'circle' in (c as object) || 'center' in (c as object),
  );
}

/**
 * A stated RADIUS SYMBOL — "שרדיוסו r" / "ורדיוסו R" / "whose radius is r" / "radius = T" — that the
 * parsed commands leave with NOTHING to denote (issue #53): the MEASURE-SYMBOL lane of the dropped-given
 * honesty family (labels ADR-089, numbers ADR-250, relations ADR-264). A single-letter measure name is
 * invisible to all three older gates (lowercase `r` is no point label, no digit, no relation operator),
 * so a rule branch that consumed the construction but dropped its trailing size clause committed
 * silently — the ADR-156 idempotent re-inscribe returned a BARE `triangle` for
 * "משולש ADO חסום במעגל שרדיוסו r", every row ✓ (the docs/17 §6 honesty class).
 *
 * Detected by radius-word + single-letter ADJACENCY (the `parseRadius` symbolic shape, any letter — #54's
 * named radii included), never by word presence alone: "רדיוס OB" (a radius SEGMENT, two glued labels) and
 * "radius of P" (multi-letter word follows) don't fire. "Accounted" is deliberately GENEROUS (the family
 * doctrine): ANY circle-touching command — the symbol then denotes that circle's radius (the ADR-071
 * machinery; per-circle BINDING quality is issue #54's feature). The gate guarantees only that the circle
 * the clause describes exists in the parse — it fires exactly on the silent-wrong-figure case.
 */
/** Every radius SYMBOL the utterance states ("שרדיוסו r", "radius = T") in order of appearance — the
 *  `parseRadius` symbolic shape, shared by the honesty gate below and the binding post-pass (#54). */
function statedRadiusSymbols(s: string): string[] {
  const syms: string[] = [];
  for (const m of s.matchAll(new RegExp(String.raw`${RADIUS_WORD}\s*(?:is\s+|הוא\s+)?(?:=\s*)?([A-Za-z])(?![A-Za-z\d])`, 'g'))) {
    syms.push(m[1]);
  }
  return syms;
}

export function droppedRadiusSymbol(utterance: string, commands: AnyCommand[]): string[] {
  const syms = statedRadiusSymbols(normalizeUtterance(utterance));
  if (syms.length === 0) return [];
  const accounted = commands.some(
    (c) => /circle|concyclic/i.test(c.type) || 'circle' in (c as object) || 'center' in (c as object),
  );
  return accounted ? [] : [...new Set(syms)];
}

/**
 * Radius-symbol BINDING post-pass (issue #54 — the ADR-119 chokepoint pattern, so EVERY circle rule
 * gains the "שרדיוסו r" binding at once instead of each rule learning the clause): a stated symbolic
 * radius attaches a `radius-symbol` command to the circle its clause describes. Pairing is by ORDER —
 * n stated symbols ↔ n circles the utterance CREATES (each creation clause carries its own שרדיוסו);
 * a single symbol may instead bind the single circle the commands reference. Unpairable counts leave
 * the commands untouched (the #53 honesty gate stays the net). Idempotent against the figure's
 * existing bindings; a rule that already emitted an explicit `radius-symbol` is left alone.
 */
function withRadiusSymbolBinding(commands: AnyCommand[], s: string, ctx: ParseContext): AnyCommand[] {
  const syms = statedRadiusSymbols(s);
  if (syms.length === 0) return commands;
  if (commands.some((c) => c.type === 'radius-symbol')) return commands;
  const created = commands.map(definedCircleId).filter((x): x is Id => x !== null);
  const referenced = [...new Set(commands.map(consumedCircleId).filter((x): x is Id => x !== null))];
  let targets: Id[] | null = null;
  if (created.length === syms.length) targets = created;
  else if (syms.length === 1 && created.length >= 1) targets = [created[0]];
  else if (syms.length === 1 && referenced.length === 1) targets = referenced;
  if (!targets) return commands;
  const bound = new Map((ctx.radiusSymbols ?? []).map((r) => [r.name, r.circle]));
  const out = [...commands];
  for (let i = 0; i < syms.length; i++) {
    if (bound.get(syms[i]) === targets[i]) continue; // already bound to this circle — idempotent
    out.push({ type: 'radius-symbol', circle: targets[i], name: syms[i] });
  }
  return out;
}

/** The first-match-wins pass over `RULES` for ONE statement — the body `parse` always ran; extracted so
 *  the clause fallback (ADR-264) can parse each piece without re-entering the fallback itself. */
function runRules(s: string, ctx: ParseContext): ParseResult {
  for (const rule of RULES) {
    const res = rule(s, ctx);
    if (res === 'stop') break; // recognised but unreadable — escalate, don't half-parse
    if (!res) continue;
    if (Array.isArray(res)) {
      // Concentric resolution runs LAST (ADR-244): the other post-passes mint the pair's OUTER id
      // (`circleId(centre)`), and this one redirects/confirms per qualifier or asks to clarify.
      const resolved = withConcentricResolution(withImplicitCircles(withOnCircleMembership(withCarrierMembership(withCarrierSegments(res), s, ctx), s, ctx), ctx), s, ctx);
      if (Array.isArray(resolved)) return { ok: true, commands: withRadiusSymbolBinding(resolved, s, ctx) };
      return { ok: false, reason: 'ambiguous-circle', center: resolved.center };
    }
    // A clarification request (ambiguous single-vertex angle / ambiguous concentric-pair reference).
    if (res.clarify === 'ambiguous-angle') return { ok: false, reason: 'ambiguous-angle', vertex: res.vertex };
    return { ok: false, reason: 'ambiguous-circle', center: res.center };
  }
  return { ok: false, reason: 'not-handled' };
}

/**
 * LAST-RESORT clause fallback (ADR-264): a compound utterance mixing a CONSTRUCTION with its property
 * givens — "דלתון ABCD, AB=AD", "משולש ABC הוא שווה שוקיים, כלומר AC=BC", "ABCD דלתון - AB=AD ו BC=DC" —
 * the textbook's appositive form for DEFINING a named shape by its equal pair. `multiStatement` (an early
 * rule) deliberately requires EVERY piece to carry a relation operator, so the shape piece falls through,
 * the shape rule 'stop's on the leftover clause, and the whole line escalated to the LLM — whose
 * decomposition could silently DROP the stated pair: its labels all already appear on the shape, so the
 * new-label (ADR-089) and number (ADR-250) honesty gates never fire (`droppedGivenRelations` is the gate
 * twin of this fix). Splits on the `multiStatement` separators PLUS the apposition connectives
 * (כלומר/שבו/כאשר, a spaced dash, En "that is"/"i.e."/"where"/"in which"/"meaning"/"namely"), and parses
 * each piece ALL-OR-NOTHING with the context AUGMENTED by what earlier pieces introduced (points,
 * polygons, circle centres, segment neighbors) — so "מרובע ABCD, מעגל חסום במרובע" binds to THE quad and
 * "משולש ABC, זווית B = 90" resolves the single-vertex angle. Clause semantics = the same statements
 * typed on separate lines (the LLM-decomposition contract, now deterministic). Safety: it runs only after
 * every whole-utterance rule failed (never shadows a rule that owns a comma/connective compound), any
 * unreadable piece → null (the LLM keeps the case exactly as today), and a bare-label piece ("F, G, H on
 * AB, AC, CB" list fragments) rejects the split outright.
 */
const APPOSITION_SEP = new RegExp(
  String.raw`\s*[,;]\s*|\s+(?:וגם|\band\b)\s+|\s+ו(?:-|\s+|(?=[A-Z]))\s*|\s+(?:כלומר|שבו|כאשר|that\s+is|i\.e\.|in\s+which|meaning|namely|where)\s+|\s+[-–—]\s+`,
  'gi',
);
/** A piece that is only labels (with an optional point-word) — a LIST fragment, never a statement. */
const BARE_LABEL_PIECE = /^(?:ה?נקודות\s+|ה?נקודה\s+|points?\s+)?[A-Z]\d*(?:\s+[A-Z]\d*)*$/;
function splitStatements(s: string, ctx: ParseContext): ParseResult | null {
  const parts = s.split(APPOSITION_SEP).map((p) => p.trim()).filter(Boolean);
  // A single part is splittable only when it carries a detachable inscribe tail (ADR-264 Am. 2) —
  // e.g. the whole-line "AB=AC חוסם במעגל" a lax rule would otherwise claim minus the inscribe.
  if (parts.length < 2 && !CIRCLE_PRED_TAIL.test(s)) return null;
  if (parts.some((p) => BARE_LABEL_PIECE.test(p))) return null; // a label-list construction — not clauses
  let cur = ctx;
  const all: AnyCommand[] = [];
  // ONE clause, all-or-nothing: a clean rule win commits; a piece a lax rule half-claims (dropped shape
  // noun — ADR-264 Am. 1 — or a dropped trailing inscribe predicate — Am. 2) gets ONE rescue: detach the
  // inscribe tail, parse the head as its own clause, and give the subject-less predicate its subject —
  // THE unique polygon the clause context knows (the ADR-245 definite-reference pattern, verb edition:
  // "AB=AC חוסם במעגל" after "משולש שווה שוקיים ABC" ⇒ pair + "ABC חוסם במעגל" ⇒ the circumcircle).
  // Ambiguity (zero or several polygons) → null → the whole line escalates honestly, never a guess.
  const parseClause = (p: string, c0: ParseContext): AnyCommand[] | null => {
    const r = runRules(p, c0);
    if (
      r.ok &&
      !droppedShapeNoun(p, r.commands, c0) &&
      !droppedCirclePredicate(p, r.commands) &&
      droppedRadiusSymbol(p, r.commands).length === 0
    )
      return r.commands;
    const m = p.match(CIRCLE_PRED_TAIL);
    if (!m) return null;
    const head = p.slice(0, m.index).trim();
    const out: AnyCommand[] = [];
    let c1 = c0;
    if (head) {
      if (BARE_LABEL_PIECE.test(head)) return null; // a label list is no statement — nothing to inscribe
      const rh = runRules(head, c1);
      if (!rh.ok || droppedShapeNoun(head, rh.commands, c1) || droppedCirclePredicate(head, rh.commands)) return null;
      out.push(...rh.commands);
      c1 = augmentParseCtx(c1, rh.commands);
    }
    // Unique BY CONTENT — the head clause re-declaring the figure's own polygon (augmentParseCtx appends
    // it again) is still ONE subject; two genuinely different polygons stay an honest refusal.
    const polys = [...new Map((c1.polygons ?? []).map((v) => [v.join(''), v])).values()];
    if (polys.length !== 1) return null; // no unique subject for the bare predicate — defer to the LLM
    const rp = runRules(`${polys[0].join('')} ${m[1]}`, c1);
    if (!rp.ok) return null;
    // The rebuilt predicate must not drop a RADIUS SYMBOL its clause carries — the ADR-156 idempotent
    // re-inscribe returns a bare polygon HERE too (issue #53), and the rescue must not become the leak it
    // plugs. The bare no-op re-inscribe itself stays a legitimate lowering (ADR-156: "already drawn");
    // a dropped NUMERIC size keeps its existing lane (droppedGivenNumbers at the commit boundary).
    if (droppedRadiusSymbol(m[1], rp.commands).length > 0) return null;
    out.push(...rp.commands);
    return out;
  };
  for (const p of parts) {
    const cmds = parseClause(p, cur);
    // ALL-OR-NOTHING — any unreadable piece → whole line escalates (never half-parse).
    if (!cmds) return null;
    all.push(...cmds);
    cur = augmentParseCtx(cur, cmds);
  }
  return { ok: true, commands: all };
}

/** Thread what earlier clauses INTRODUCED into the next clause's context (the clause-fallback sibling of
 *  `buildParseCtx`, which reads a replayed figure the batch doesn't have yet): every label the commands
 *  reference joins `points`; a ≥3-vertex ids run joins `polygons` + ring `neighbors`; a segment joins
 *  `neighbors`; a `center` field joins `circles`. Copy-on-write — the caller's context is never mutated. */
function augmentParseCtx(ctx: ParseContext, cmds: AnyCommand[]): ParseContext {
  const points = new Set(ctx.points ?? []);
  for (const l of JSON.stringify(cmds).match(/[A-Z]\d*/g) ?? []) points.add(l);
  const polygons = [...(ctx.polygons ?? [])];
  const circles = new Set(ctx.circles ?? []);
  const neighbors: Record<string, string[]> = { ...(ctx.neighbors ?? {}) };
  const link = (a: string, b: string) => {
    neighbors[a] = [...(neighbors[a] ?? [])];
    if (!neighbors[a].includes(b)) neighbors[a].push(b);
    neighbors[b] = [...(neighbors[b] ?? [])];
    if (!neighbors[b].includes(a)) neighbors[b].push(a);
  };
  for (const c of cmds as Array<Record<string, unknown>>) {
    const ids = c.ids;
    if (Array.isArray(ids) && ids.length >= 3 && ids.every((x) => typeof x === 'string')) {
      polygons.push(ids as string[]);
      for (let i = 0; i < ids.length; i++) link(ids[i] as string, ids[(i + 1) % ids.length] as string);
    }
    if (c.type === 'segment' && typeof c.a === 'string' && typeof c.b === 'string') link(c.a, c.b);
    if (typeof c.center === 'string') circles.add(c.center);
  }
  return { ...ctx, points: [...points], polygons, circles: [...circles], neighbors };
}

/**
 * Uppercase point labels that the utterance NAMES but the parsed commands neither reference nor already
 * have in the figure — a sign the deterministic parse silently DROPPED part of the input (ADR-089).
 * Almost always a TYPO in a keyword (e.g. "מנוקדה" for "מנקודה") that made a rule match partially: the
 * label it introduced ("from D …") fell out, so a wrong/partial figure would be committed. The caller
 * (App.submit) treats a non-empty result as a weak parse and ESCALATES to the LLM (whose job is exactly
 * freeform/typo input) instead of committing. A label that ALREADY EXISTS but a command doesn't re-name
 * is NOT dropped (it's context, e.g. a tangent at an existing point) — only genuinely NEW labels count.
 */
export function droppedNewLabels(utterance: string, commands: AnyCommand[], existingPoints: Id[] = [], measureSymbols: string[] = []): Id[] {
  const have = new Set(existingPoints.map((p) => p.toUpperCase()));
  // BOUND measure symbols (issue #54): an uppercase radius letter ("R" in "R > r" / "R = 1.5r") is a
  // MEASURE name, not a point label — its lowered command references circles, never the letter, so
  // without the mask a correctly-parsed radius relation read as a dropped point and escalated for
  // nothing (the operator's play-test: `weak:dropped:R` → LLM → not-understood). The caller passes the
  // figure's bound symbol names (ctx.radiusSymbols) — semantic, never a guess from utterance shape.
  for (const m of measureSymbols) have.add(m.toUpperCase());
  const used = new Set(JSON.stringify(commands).match(/[A-Z]\d*/g) ?? []); // every label the commands reference (incl. inside ids like circle-P / tan-B)
  // Extract labels from the SAME text the rules parsed (subscripts glued, maqaf/bidi fixed — PAR-7 /
  // ADR-228: the raw "O_1" reads as label "O" while the commands carry "O1", a guaranteed false drop),
  // then blank the ADR-118 AREA MARKER: the `S` of the (normalized) glued `SABC` is notation, not a
  // point label. Without the mask, a cleanly-parsed numeric area given ("S_{ABC} = 13") or S-form ratio
  // ("S_{ACD} = 4 S_{NCE}") — whose lowered command stores no letter label — read as a dropped point
  // "S" and escalated to the LLM for nothing (ADR-236). A bare label S ("S_{ABC} = S") is stored in the
  // measure command, so it lands in `used` and never tripped this. The residual risk (an S-led 4-letter
  // POINT run like "STUV" masking a genuinely dropped S) only ever suppresses a warning, never corrupts.
  const s = normalizeUtterance(utterance).replace(/(?<![A-Za-z])S(?=(?:[A-Z]\d*){3,4}(?![A-Za-z\d]))/g, ' ');
  const inputLabels = [...new Set(s.match(/[A-Z]\d*/g) ?? [])];
  return inputLabels.filter((L) => !have.has(L) && !used.has(L));
}

/**
 * Symbol-form RELATION givens (`AB=CD`, `AB⊥CD`, `AB∥CD` — exactly two labels each side) that the parsed
 * commands do NOT carry — the third honesty gate, sibling of `droppedNewLabels` (ADR-089) and
 * `droppedGivenNumbers` (ADR-250). The hole it closes (ADR-264): a stated equality between points that
 * all ALREADY appear on the shape ("משולש ABC … כלומר AC=BC" where the LLM decomposition dropped the
 * clause) trips NEITHER older gate — no new label, no number — so a figure missing the student's given
 * committed silently as success. A relation is ACCOUNTED when (a) some single `set-*` constraint command
 * references every label of the relation, or (b) one of the relation's labels is INTRODUCED by a
 * point-definition command (`id` field) — the "K על המשך AB כך ש AB=BK" class, where the relation is
 * baked into the point's definition (t = 2) and no separate constraint command exists. A bare shape
 * command deliberately does NOT account (a kite enforces its default pair, but the student's *stated*
 * pair must land as an explicit constraint — the ADR-234 pin). Conservative on purpose: word-form
 * relations (מקביל/מאונך) belong to rule-owned compounds whose lowering is already leftover-guarded.
 */
/**
 * #82 ([ADR-292](docs/06-decisions.md#adr-292)) — the VERB honesty gate, the fourth sibling of
 * droppedNewLabels (ADR-089) / droppedGivenNumbers (ADR-250) / droppedGivenRelations (ADR-264):
 * a statement VERB present in the utterance whose meaning is entirely ABSENT from the winning
 * parse's lowering means a rule claimed a compound and silently dropped a given (the P1 class —
 * "הישר ℓ משיק … למעגל החוסם את המשולש ABC" lowered to a bare circumcircle, the tangent gone,
 * green row). Never commit such a parse — escalate (grammar path) or refuse (LLM path).
 * The satisfied-sets are deliberately GENEROUS (any command family that can carry the verb's
 * meaning, incl. the ADR-115 tangency-as-⟂ lowering) so a legitimate alternative lowering never
 * false-blocks; the gate aims at the verb being entirely unrepresented.
 */
const VERB_GATES: { verb: string; present: RegExp; satisfied: RegExp }[] = [
  { verb: 'משיק/tangent', present: /משיק|tangent/i, satisfied: /tangent|circles-tangent|set-perpendicular|"tan-/ }, // "tan- : a REFERENCE to a drawn tangent line ("המשיק חותך…" → line:"tan-A") carries the verb's meaning (#100/#54 play-test)
  { verb: 'חוצה/bisect', present: /חוצ[הי]|bisect/i, satisfied: /bisector|midpoint|set-angle-ratio|set-equal|arc-midpoint|set-line/ },
  { verb: 'מקביל/parallel', present: /מקביל|parallel/i, satisfied: /parallel/ },
  { verb: 'מאונך/perpendicular', present: /מאונ[כך]|perpendicular/i, satisfied: /perpendicular|foot|right-triangle|altitude/ },
];
export function droppedGivenVerbs(utterance: string, commands: AnyCommand[]): string[] {
  const s = normalizeUtterance(utterance);
  const json = JSON.stringify(commands);
  return VERB_GATES.filter((g) => g.present.test(s) && !g.satisfied.test(json)).map((g) => g.verb);
}

export function droppedGivenRelations(utterance: string, commands: AnyCommand[]): string[] {
  const s = normalizeUtterance(utterance);
  const rel = /(?<![A-Za-z\d])([A-Z]\d*)([A-Z]\d*)\s*(=|⊥|⟂|∥)\s*([A-Z]\d*)([A-Z]\d*)(?![A-Za-z\d])/g;
  const perCommand = commands.map((c) => ({
    isConstraint: typeof (c as { type?: unknown }).type === 'string' && (c as { type: string }).type.startsWith('set-'),
    labels: new Set(JSON.stringify(c).match(/[A-Z]\d*/g) ?? []),
  }));
  const introduced = new Set(
    commands
      .map((c) => (c as { id?: unknown }).id)
      .filter((x): x is string => typeof x === 'string' && /^[A-Z]\d*$/.test(x)),
  );
  const dropped: string[] = [];
  for (const m of s.matchAll(rel)) {
    const labels = [...new Set([m[1], m[2], m[4], m[5]])];
    const accounted =
      labels.some((l) => introduced.has(l)) ||
      perCommand.some((c) => c.isConstraint && labels.every((l) => c.labels.has(l)));
    if (!accounted) dropped.push(m[0].replace(/\s+/g, ' ').trim());
  }
  return [...new Set(dropped)];
}

/**
 * Detect a RELABEL request — "rename E to G" / "relabel E as G" / "replace E with G"
 * / "rename E G", Hebrew "שנה שם E ל-G" / "שנה E ל-G" / "החלף E ב-G" / "החלף את E עם G".
 * This is a store-level operation (rewrite the point's letter across every fact),
 * not a geometry command, so it's handled outside `parse` (the App intercepts it).
 * Returns the uppercased point letters, or null when the utterance isn't a rename.
 * Connectors are optional and varied: to/as/into/with/with-arrow, ל-/ב-/עם.
 */
/**
 * NAME an auto-assigned circle centre after the fact (issue #112): a student drew an unnamed circle (the
 * system hid an auto-picked centre O) and now says «מרכז המעגל הוא P» / "the centre of the circle is P" /
 * "P is the centre of the circle" to name it P. This is a store-level RENAME of the hidden centre O→P
 * (rewrite it across every fact) PLUS a REVEAL — NOT a second circle. The App intercepts it before the
 * parser (like {@link parseRename}). Fires only when the naming letter is FRESH and exactly ONE circle in
 * the figure has an auto-named centre (the one they just drew); the reveal-with-the-same-existing-letter
 * case stays with the `nameCenter` parser rule (`name-center`), and a circle whose centre is already
 * NAMED is left to a plain rename. A rename of a NAMED centre to a fresh letter is also accepted (the
 * student re-letters the centre) — its source is the sole named centre.
 */
export function parseNameCenter(raw: string, ctx: ParseContext = NO_CONTEXT): { from: Id; to: Id } | null {
  const s = normalizeUtterance(raw); // orthography boundary (PAR-7) — runs before parse()
  if (!/cent(?:er|re)|מרכז/i.test(s) || !mentionsCircle(s)) return null;
  // Not a creation / other construct carrying a centre word (a circle WITH a radius/through/inscribe/on…).
  if (/inscrib\w*|חסום|חוסם|through|העובר|דרך|radius|רדיוס|\bon\b|על(?=\s|$)|משיק|tangent/i.test(s)) return null;
  const x = circleCenter(s);
  if (!x) return null;
  const X = up(x);
  if ((ctx.points ?? []).map(up).includes(X)) return null; // the naming letter must be FRESH (a taken letter would merge)
  // Just "the centre [of the circle] is X" — nothing geometric remains after the centre/circle words,
  // the label, copulas, and filler (the nameCenter-rule leftover check).
  const leftover = s
    .replace(/cent(?:er|re)|ה?מרכז/gi, ' ')
    .replace(/circles?|ה?מעגל\w*/gi, ' ')
    .replace(new RegExp(String.raw`\b${X}\b`, 'gi'), ' ')
    .replace(/\bpoint\b|הוא|היא|הינו|ה?נקוד[הת]|של/gi, ' ')
    .replace(FILLER, ' ')
    .trim();
  if (leftover) return null;
  const autos = (ctx.autoCenters ?? []).map(up);
  const named = (ctx.circles ?? []).map(up).filter((c) => !autos.includes(c));
  // The centre to rename: the sole AUTO-named centre (the reported case), else — if none is auto — the sole
  // already-NAMED centre being re-lettered. Ambiguous (0 or ≥2 candidates) → defer to the parser.
  const from = autos.length === 1 ? autos[0] : autos.length === 0 && named.length === 1 ? named[0] : null;
  if (!from || from === X) return null;
  return { from, to: X };
}

export function parseRename(raw: string): { from: Id; to: Id } | null {
  // Same orthography boundary as parse() (PAR-7): a pasted maqaf ("שנה שם E ל־G") or an invisible bidi
  // control must not break the ל-?/ב-? connector groups — these entry points run BEFORE parse(), so they
  // need the normalization themselves (review 2026-07-03, P7).
  const s = normalizeUtterance(raw);
  const m =
    s.match(/(?:rename|relabel|replace)\s+([A-Za-z]\d*)\b(?:\s+(?:to|as|into|with|by|->|→|=))?\s+([A-Za-z]\d*)\b/i) ??
    s.match(/(?:שנה|החלף)\s*(?:שם\s*)?(?:את\s*)?([A-Za-z]\d*)\s*(?:ל-?|ב-?|עם|→|=)?\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  const from = up(m[1]);
  const to = up(m[2]);
  return from === to ? null : { from, to };
}

/**
 * Detect a SWAP request — EXCHANGE two existing labels (A ↔ B), which {@link parseRename} can't express
 * (rename refuses a taken target, to avoid an accidental merge). "swap C and D" / "swap C with/for D" /
 * "swap C ↔ D"; Hebrew "החלף בין C ל-D" / "החלף בין C ו-D" / "החלף בין C לבין D" (the word בין /
 * "between" is what marks it a swap, so the plain "החלף E ב-G" replace-rename above is untouched). A
 * store operation, intercepted by the App BEFORE the parser (and before parseRename). (ADR-122.)
 */
export function parseSwap(raw: string): { a: Id; b: Id } | null {
  const s = normalizeUtterance(raw); // orthography boundary (PAR-7) — see parseRename

  const m =
    s.match(/\bswap\s+([A-Za-z]\d*)\s*(?:and|with|for|↔|<->|→)\s*([A-Za-z]\d*)\b/i) ??
    s.match(/(?:החלף|החליפי)\s+בין\s+([A-Za-z]\d*)\s*(?:לבין|ל-?|ו-?|↔|→)\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  const a = up(m[1]);
  const b = up(m[2]);
  return a === b ? null : { a, b };
}

/**
 * Detect a MERGE request — "merge F into E" / "merge F with E" / "merge F and E" / "fold F into E"
 * / "combine F and E", Hebrew "מזג F ל-E" / "מזג F עם E" / "מזג F ו-E" / "אחד F ל-E".
 * Distinct from a rename: a merge FOLDS two *existing* points into one (E survives), so the
 * keywords (merge/fold/combine/unify, מזג/אחד) never overlap with the relabel keywords. Like
 * rename it is a store operation, handled outside `parse` (the App intercepts it before parsing).
 */
export function parseMerge(raw: string): { from: Id; to: Id } | null {
  const s = normalizeUtterance(raw); // orthography boundary (PAR-7) — see parseRename

  const m =
    s.match(/(?:merge|fold|combine|unify)\s+([A-Za-z]\d*)\b(?:\s+(?:into|with|and|to|->|→))?\s+([A-Za-z]\d*)\b/i) ??
    s.match(/(?:מזג|אחד)\s*(?:את\s*)?([A-Za-z]\d*)\s*(?:ל-?|עם|ו-?|→)?\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  const from = up(m[1]);
  const to = up(m[2]);
  return from === to ? null : { from, to };
}
