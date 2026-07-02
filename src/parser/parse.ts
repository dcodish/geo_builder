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
  | { ok: false; reason: 'ambiguous-angle'; vertex: string };

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
  /** For each circle (by centre letter), the points known to lie on it — lets "arc BC" resolve to
   *  the circle that actually contains both B and C (disambiguates 2+ circles / corrects a wrong one). */
  circleMembers?: { center: string; points: string[] }[];
  /** For each point, the points it's joined to (segment / polygon edge) — lets a single-vertex angle
   *  ("∠C") resolve its two arms, so "∠C קהה/חדה" (obtuse/acute) works without spelling all three. */
  neighbors?: Record<string, string[]>;
  /** Vertex-disjoint PARALLEL edge-pairs in the figure (e.g. a trapezoid's bases `[['A','B'],['D','C']]`),
   *  derived from the resolved positions — lets "height/altitude from a vertex" drop to the opposite
   *  parallel base (the trapezoid case the triangle inference can't reach). */
  parallels?: [[string, string], [string, string]][];
  /** Ids of lines already in the figure (e.g. `bis-DAB`, `perp-…`) — lets a construct detect that it was
   *  ALREADY built (its deterministic scaffolding lines exist) and REUSE rather than mint a duplicate
   *  auto-named copy (the idempotency root-cause fix). */
  lines?: string[];
}

/** The centre of a circle that contains EVERY point in `pts` (preferring `prefer` if it qualifies), else null. */
const circleContaining = (ctx: ParseContext, pts: string[], prefer?: string | null): string | null => {
  const has = (center: string) => {
    const m = ctx.circleMembers?.find((e) => e.center === center);
    return !!m && pts.every((p) => m.points.includes(p));
  };
  if (prefer && has(prefer)) return prefer;
  return ctx.circleMembers?.find((e) => pts.every((p) => e.points.includes(p)))?.center ?? null;
};
const NO_CONTEXT: ParseContext = {};

/**
 * 'stop' = the rule recognised its keyword but could not read the sentence:
 * abort the whole parse (→ not-handled, the fallback boundary) instead of
 * letting a weaker rule half-parse the utterance. A half-parse that silently
 * drops part of a fact is worse than a miss — it draws a wrong figure.
 */
/** A rule recognised the input but needs the student to disambiguate (see `ParseResult` 'ambiguous-angle').
 *  Returned in place of commands; `parse` turns it into the matching `{ ok:false }` clarification result. */
type Clarify = { clarify: 'ambiguous-angle'; vertex: string };
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
  const m =
    s.match(/(?:cent\w*\s+(?:at\s+)?|around\s+|שמרכזו\s*|מרכזו\s*|סביב\s+)([A-Za-z]\d*)\b/i) ??
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
const resolveCenter = (s: string, ctx: ParseContext): string | null =>
  circleCenter(s) ?? (ctx.circles?.length === 1 ? ctx.circles[0] : null);

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
  circleCenter(s) ?? (mentionsCircle(s) && ctx.circles?.length === 1 ? ctx.circles[0] : null);

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
    s.match(/^\s*([A-Za-z]\d*)\s*(?:\bis\b|היא|הוא|=)/i);
  return m ? up(m[1]) : null;
};

/** Remove a "circle X" / "מעגל X" mention so its centre letter isn't read as a figure label. */
const dropCircleRef = (s: string): string => s.replace(/(?:circle|מעגל)\s+[A-Za-z]\d*\b/gi, ' ');

/**
 * English filler words, lowercase only — typed fillers are lowercase, while
 * uppercase pairs like "ON" must stay readable as point labels (O, N).
 */
const FILLER = /\b(?:to|the|and|of|is|are|at|on|in|with|from|that|so|such)\b/g;

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
 */
const SHAPE_LEFTOVER =
  /\b(?:inscrib\w*|circumscrib\w*|circles?|tangents?|diameters?|chords?|arcs?|radius|radii|perpendiculars?|parallels?|bisects?|bisectors?|midpoints?|medians?|heights?|altitudes?|foot|feet|intersections?|extensions?|angles?|segments?|diagonals?|connect|congruent|similar|points?)\b|[=⊥⟂∥∩°≅~∼∽]|חסום|חוסם|מעגל|משיק|קוטר|מיתר|קשת|רדיוס|מאונך|אנך|מקביל|חוצ|אמצע|תיכון|גובה|המשך|חיתוך|זוו?ית|קטע|אלכסון|חבר|נקוד|חופ|דומ/i;

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
 * "the midsegment to BC in triangle ABC" / "קטע האמצעים לצלע BC במשולש ABC" — the segment joining the
 * midpoints of the two sides meeting at the apex (the triangle vertex NOT on the named base). Decomposes
 * to two `midpoint`s + a `segment` (all already supported). The triangle must be named (3 labels) and the
 * base a side of it; the triangle is created first if it isn't already in the figure. Unusual phrasings
 * (a trapezoid midsegment, an un-named triangle) fall through to the LLM net.
 */
const midsegment: Rule = (s, ctx) => {
  if (!/midsegment|mid-?segment|midline|קטע\s+ה?אמצעים/i.test(s)) return null;
  const triM = s.match(/(?:triangle|משולש)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)/i);
  const baseM = s.match(/(?:parallel\s+to|to|מקביל\s*ל-?|לצלע|ל-?)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!triM || !baseM) return null;
  const tri = [up(triM[1]), up(triM[2]), up(triM[3])];
  const base = [up(baseM[1]), up(baseM[2])];
  if (!base.every((x) => tri.includes(x)) || base[0] === base[1]) return null; // base must be a side of the triangle
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
  // The operands of a plain line∩line must be point-pairs the figure already has.
  // If they're introduced here AS constructs this rule can't build (a diameter, a
  // chord, a radius/tangent), don't half-parse "diameter AB and chord DE meet at C"
  // into a bare intersection that drops the diameter & chord — escalate so the
  // operands get created (ADR-024; the LLM has the circle as context).
  if (/\bdiameter\b|\bchord\b|\bradius\b|\btangent\b|קוטר|מיתר|רדיוס|משיק/i.test(s)) return 'stop';
  // A PERPENDICULAR/PARALLEL operand ("the perpendicular to AD") is NOT a line through two labelled
  // points — reading "האנך ל-AD" as "line AD" silently drops the ⟂ and (when AD shares an endpoint with
  // the other line) collapses the crossing onto that point (operator: "המשך DB והאנך לישר AD נפגשים ב-G"
  // built a degenerate G on D). Escalate so the perpendicular is built properly (it needs a through-point;
  // the LLM / the `perpendicular … cuts … at` form supplies it).
  if (/\bperpendicular\b|\bparallel\b|מאונך|אנך|מקביל|[⊥⟂∥]/i.test(s)) return 'stop';
  // Drop filler words so they aren't mistaken for two-letter line labels ("of"!).
  const t = s.replace(/\b(?:is|the|of|between|at|point|הוא|בין|בנקודה|נקודה)\b/gi, ' ');
  const pointFirst = t.match(
    /\b([A-Za-z]\d*)\b.*?(?:intersection|∩|חיתוך|נחתך).*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i,
  );
  // Draw the two segments we reference (idempotent if they're already edges) — the
  // student should see the lines whose crossing is the point, not just the point.
  // When the lines are EXTENDED to meet at a named point ("המשך CA ו-BD נפגשים בנקודה G"), draw each
  // line from its base THROUGH to the meeting point G, so the student sees the lines reaching G — not
  // stubs that stop at the inner points (the operator drew BG/CG by hand otherwise). Without an
  // extension it draws the operand segments as-is: diagonals crossing BETWEEN their endpoints must stay
  // whole (drawing only to the crossing would hide half of each diagonal).
  const extend = /המשך|extension|extended/i.test(s);
  // A plain SEGMENT meet — the student named no extension ("המשך") and no infinite line ("הישר"/"line"/
  // "ray") — must land its crossing WITHIN both segments, not on their continuation (ADR-166, the operator's
  // rule: "two segments meet ON the segments, not the continuation"). When EITHER an extension or an
  // infinite-line word is present the crossing is allowed off the drawn segments, so `onSeg` is dropped.
  const infinite = /\bline\b|הישר|הקו|\bray\b|קרן/i.test(s);
  const onSeg = !extend && !infinite;
  const cross = (id: string, a: string, b: string, c: string, d: string, dir1?: boolean, dir2?: boolean): Command[] => {
    const inter: Command = { type: 'line-line-intersection', id: up(id), a: up(a), b: up(b), c: up(c), d: up(d), ...(dir1 ? { dir1: true } : {}), ...(dir2 ? { dir2: true } : {}), ...(onSeg ? { onSeg: true } : {}) };
    // Extension case: DEFINE G (the intersection) first, THEN draw each line's base → G. Order matters —
    // a segment to G before G exists would create G as a stray free point and conflict with the
    // intersection ("'G' is already defined"). Plain case: draw the operand segments, then the crossing.
    return extend
      ? [inter, { type: 'segment', a: up(a), b: up(id) }, { type: 'segment', a: up(c), b: up(id) }]
      : [{ type: 'segment', a: up(a), b: up(b) }, { type: 'segment', a: up(c), b: up(d) }, inter];
  };
  if (pointFirst) {
    const m = pointFirst;
    return cross(m[1], m[2], m[3], m[4], m[5]);
  }
  const linesFirst = t.match(
    /\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?(?:intersect\w*|∩|חיתוך|נחתך|נחתכ|נפגש|meets?).*?\b([A-Za-z]\d*)\b/i,
  );
  if (linesFirst) {
    const m = linesFirst;
    return cross(m[5], m[1], m[2], m[3], m[4]);
  }
  // cut-form: seg1, the CUT verb, seg2, then the point — "BD חותך את OC בנקודה A" / "BD cuts OC at A".
  // (The verb between the segments is what the lines-first form, which needs it AFTER both, misses.)
  const cutForm = t.match(
    /\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?(?:חות[כך]|נחתכ?\w*|נפגש\w*|פוגש\w*|cuts?|crosses?|intersects?|meets?).*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\b/i,
  );
  if (cutForm) {
    const m = cutForm;
    // A "המשך"/extension operand is DIRECTIONAL — A must be beyond its 2nd point (ADR-054). Detect it
    // per operand by which side of the cut verb the word falls on (seg1 before, seg2 after).
    const kw = s.match(/חות[כך]|נחתכ?\w*|נפגש\w*|פוגש\w*|cuts?|crosses?|intersects?|meets?/i);
    const before = kw ? s.slice(0, kw.index) : s;
    const after = kw ? s.slice((kw.index ?? 0) + kw[0].length) : '';
    const ext = /המשך|extension|extended/i;
    return cross(m[5], m[1], m[2], m[3], m[4], ext.test(before), ext.test(after));
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
  const isExtension = /המשך|extension|extended/i.test(after);
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
const bisectorIntersection: Rule = (s) => {
  if (!BISECTOR_KW.test(s)) return null;
  const meet = INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s);
  // Strip every keyword word so only the point label + the two angle triples remain.
  const kw =
    /bisectors?|angles?|intersection|intersect\w*|meets?|points?|of|the|is|are|and|זוו?ית|הזוו?יות|חוצי|חוצה|חוצ|חיתוך|נחתכים|נקודת|המפגש|מפגש|נפגשים|של|הם|בנקודה/gi;
  const labels = s.replace(kw, ' ').replace(/-/g, ' ').match(/\b[A-Za-z]{1,3}\b/g) ?? [];
  const point = labels.find((l) => l.length === 1);
  const triples = labels.filter((l) => l.length === 3).map((l) => l.toUpperCase());
  if (!meet || !point || triples.length < 2) return null;
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

/** "F on the extension of AD" / "F על המשך AD" — a point on the ray beyond the far end (t > 1). */
const pointOnExtension: Rule = (s, ctx) => {
  if (!/extension|המשך/i.test(s)) return null;
  const m = s.match(/(?:point\s+|נקודה\s+)?([A-Za-z]\d*)\b.*?(?:extension|המשך)\s*(.*)/i);
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
  if ((ctx.points ?? []).includes(id)) return [{ type: 'set-line', points: [seg[0], seg[1], id] }];
  return [{ type: 'point-on-segment', id, a: seg[0], b: seg[1], t: 1.3, extension: true }];
};

/**
 * "angle GAB = 37" / "∠GAB = 37°" / "זווית GAB = 37" (any order) — middle letter is the vertex.
 * Stating the angle also DRAWS its two arms (vertex→ray1, vertex→ray2) so the angle is visible
 * even on a standalone configuration; `segment` is idempotent, so on an existing corner where the
 * arms are already edges these are no-ops (mirrors the ∥/⟂ draw-its-segments convenience, FR-IN-7).
 */
const angle: Rule = (s, ctx) => {
  if (!/(?:angle|∠|זוו?ית)/i.test(s)) return null;
  const stripped = s.replace(/angle|∠|זוו?ית/gi, ' ');
  const valM = stripped.match(new RegExp(num));
  if (!valM) return null; // no degree value → not this rule (an equality/ratio is handled upstream)
  const value = parseFloat(valM[1]);
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
  const one = labelRun(stripped, 1);
  const labelCount = (stripped.match(/[A-Z]\d*/g) ?? []).length;
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
 * The descriptor nouns that can NAME the carrier a point rides on — chord/side/segment/diagonal in
 * both languages. A "line"/"ישר" carrier is deliberately absent: it has distinct infinite-line
 * semantics handled by `collinearConstraint`.
 */
const CARRIER_NOUN = String.raw`chord|side|segment|diagonal|ה?מיתר|ה?צלע|ה?קטע|ה?אלכסון`;

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
  if (!m) return null;
  const id = up(m[1]);
  const a = up(m[2]);
  const b = up(m[3]);
  if (m[4] === undefined) return [{ type: 'point-on-segment', id, a, b }];
  const raw = parseFloat(m[4]);
  const t = m[5] ? raw / 100 : raw; // "%" → fraction; bare number is taken as a fraction
  return [{ type: 'point-on-segment', id, a, b, t }];
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
 * "AB = 2 AD" / "2 AB = 3 CD" / "AB = 2·AD" / "AB = 2AD" / "AB פי 2 מ-AD" — a
 * proportion |AB| = k·|CD|. At least one numeric coefficient must be present
 * (the coefficient-free "AB = CD" is the `equalSegments` case, k = 1). Runs before
 * `distanceConstraint`, which would otherwise half-parse "AB = 2 AD" into "AB = 2".
 */
const COEF = String.raw`\d+(?:\.\d+)?`;
const ratioConstraint: Rule = (s) => {
  const en = s.match(
    new RegExp(String.raw`\b(${COEF})?\s*[*·]?\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b`),
  );
  if (en && (en[1] || en[4])) {
    const m = en[1] ? parseFloat(en[1]) : 1; // |AB| = (n/m)·|CD|
    const n = en[4] ? parseFloat(en[4]) : 1;
    return [{ type: 'set-ratio', a: up(en[2]), b: up(en[3]), c: up(en[5]), d: up(en[6]), k: n / m }];
  }
  // Hebrew "AB פי 2 מ-AD" — |AB| is 2× |AD|.
  const he = s.match(new RegExp(String.raw`([A-Za-z]\d*)\s*([A-Za-z]\d*)\b[^=]*?פי\s*(${COEF})\s*מ-?\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b`));
  if (he) return [{ type: 'set-ratio', a: up(he[1]), b: up(he[2]), c: up(he[4]), d: up(he[5]), k: parseFloat(he[3]) }];
  return null;
};

/**
 * "AE/ED = 2/3" / "AE/ED = 2" — a ratio of two segment LENGTHS set to a fraction:
 * |AE|/|ED| = 2/3 ⇒ |AE| = (2/3)·|ED|. Runs before the numeric/distance rules, which
 * would otherwise half-parse the "ED=2" in the middle and drop the rest (the bug that
 * left a point unplaced). Drives a sliding point on either segment.
 */
// A ratio VALUE: a number or fraction, each part optionally under a √ — "2/3", "√2/2", "1/√3", "√2".
const RATVAL = String.raw`(√)?\s*(${COEF})\s*(?:\/\s*(√)?\s*(${COEF}))?`;
const segmentRatio: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*\/\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${RATVAL}`));
  if (!m) return null;
  const num = m[5] ? Math.sqrt(parseFloat(m[6])) : parseFloat(m[6]); // m5 = √ on numerator
  const den = m[8] !== undefined ? (m[7] ? Math.sqrt(parseFloat(m[8])) : parseFloat(m[8])) : 1; // m7 = √ on denominator
  return [{ type: 'set-ratio', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]), k: num / den }];
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
 * "AB = CD" — two segments equal in length. Also DRAWS both named segments (idempotent),
 * so the equality puts the two compared sides on the canvas (FR-IN-7).
 */
const equalSegments: Rule = (s) => {
  const m = s.match(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/);
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
const normVar = (v: string): string => (/^[Rr]$/.test(v) ? RADIUS_VAR : v);

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
  const seen = new Set<number>();
  // verbose marker: שטח / area, then optional filler + shape word, then the 3–4 vertex labels.
  const reKw = /שטח|\barea\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reKw.exec(s)) !== null) {
    const after = s.slice(m.index + m[0].length).replace(new RegExp(String.raw`^(?:\s+(?:of|the|של|ה))*\s*${AREA_SHAPE}?\s*`, 'i'), '');
    // Read ONLY the leading vertex run (the labels right after the shape word) — never scan ahead, or a later
    // filler word ("area", "of") would be read as labels (the word "area" → A,R,E,A bug).
    const lead = after.match(/^((?:[A-Za-z]\d*\s*){3,4})/);
    const ids = lead ? (labelRun(lead[1], 4) ?? labelRun(lead[1], 3)) : null;
    if (ids) refs.push({ ids, at: m.index });
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

/** Numerator/denominator under optional √, computed from a {@link RATVAL} match starting at group `g`. */
const ratvalAt = (m: RegExpMatchArray, g: number): number => {
  const numr = m[g] ? Math.sqrt(parseFloat(m[g + 1])) : parseFloat(m[g + 1]);
  const den = m[g + 3] !== undefined ? (m[g + 2] ? Math.sqrt(parseFloat(m[g + 3])) : parseFloat(m[g + 3])) : 1;
  return numr / den;
};

/** The ratio coefficient k for "area(P1) = k·area(P2)" from the connective between two area refs. */
function areaRatioK(s: string): number {
  // Hebrew fraction words get no `\b` — JS word boundaries don't fire around non-ASCII letters.
  if (/רבע/.test(s) || /\bquarter\b/i.test(s)) return 1 / 4;
  if (/שליש/.test(s) || /\bthird\b/i.test(s)) return 1 / 3;
  if (/חצי|מחצית/.test(s) || /\bhalf\b/i.test(s)) return 1 / 2;
  const pi = s.match(new RegExp(String.raw`(?:פי|times)\s*(${COEF})`, 'i')); // "גדול פי 2 מ" / "2 times"
  if (pi) return parseFloat(pi[1]);
  const eq = s.match(new RegExp(String.raw`(?:=|הוא|\bis\b)\s*${RATVAL}`, 'i')); // "= 3/4" / "הוא 1.8"
  if (eq) return ratvalAt(eq, 1);
  const coef = s.match(new RegExp(String.raw`=\s*(${COEF})\s*(?:S[A-Z]|שטח|area)`, 'i')); // "= 2 SDEF" / "= 2 area DEF"
  if (coef) return parseFloat(coef[1]);
  return 1; // equal areas
}

/** The value/label on the RHS of a single-area measure: a number, radical, variable, or power. */
function parseAreaExpr(rhs: string): MeasureExpr | null {
  const t = rhs.trim();
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
  const sym = s.match(new RegExp(String.raw`^\s*${SEG}\s*(<=|>=|<|>|≤|≥)\s*${SEG}\s*$`));
  if (sym) {
    [a, b, c, d] = [up(sym[1]), up(sym[2]), up(sym[4]), up(sym[5])];
    leftLarger = sym[3] === '>' || sym[3] === '>=' || sym[3] === '≥';
  } else {
    // word form: "AB גדול מ-CD" / "AB longer than CD" / "AB קטן מ CD" / "AB shorter than CD"
    const big = String.raw`גדול[֐-׿]*|larger|longer|greater|bigger`;
    const small = String.raw`קטן[֐-׿]*|smaller|shorter|less`;
    const w = s.match(
      new RegExp(String.raw`^\s*${SEG}\s+(?:(${big})|(${small}))\s+(?:than\s+|מ-?|מן\s+)?${SEG}\s*$`, 'i'),
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
  if (!/perpendicular|⊥|⟂|מאונך|אנך/i.test(s)) return null; // both ⊥ (U+22A5) and ⟂ (U+27C2); אנך = the noun form ("EF אנך ל AB")
  const t = s.replace(/perpendicular(?:\s*to)?|⊥|⟂|מאונך(?:\s*ל-?)?|אנך(?:\s*ל-?)?/gi, ' ').replace(FILLER, ' ');
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
const collinearConstraint: Rule = (s) => {
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

// ── Phase 5c — circles ──────────────────────────────────────────────────────

// The default concrete radius a circle takes when none is given numerically (incl. a symbolic "radius R").
const RADIUS_DEFAULT = 5;
const RADIUS_WORD = String.raw`(?:radius|רדיוס\S*)`;
/**
 * Read a circle's radius from "radius 5" (numeric) or "radius R"/"radius r" (the reserved
 * radius symbol — ADR-034). A symbol pins the variable R to the concrete default radius via
 * a `set-var`, so a later "AC = 1.6R" resolves to |AC| = 1.6·radius while still labelling "1.6R".
 */
const parseRadius = (s: string): { radius: number; numeric: boolean; symbolic: boolean; varCmd?: SymbolicCommand } => {
  const rNum = s.match(new RegExp(String.raw`${RADIUS_WORD}\s*${num}`, 'i'));
  if (rNum) return { radius: parseFloat(rNum[1]), numeric: true, symbolic: false };
  const rVar = s.match(new RegExp(String.raw`${RADIUS_WORD}\s*[Rr]\b`));
  if (rVar) return { radius: RADIUS_DEFAULT, numeric: false, symbolic: true, varCmd: { type: 'set-var', name: RADIUS_VAR, value: RADIUS_DEFAULT } };
  return { radius: RADIUS_DEFAULT, numeric: false, symbolic: false };
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
  if (/inscrib\w*|חסום|חוסם|through|העובר|דרך|radius|רדיוס|=|\bon\b|על\b/i.test(s)) return null; // creation / other constructs
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
  return [{ type: 'circle', id: circleId(center), center: up(center), radius: r.radius, ...(freeRadius ? { freeRadius: true } : {}), ...(auto ? { autoCenter: true } : {}) }];
};

/**
 * "the radius of circle P is 4" / "רדיוס מעגל P הוא 4" / "radius of P = 4" — set an EXISTING circle's radius
 * to a value, with NO segment drawn and NO point invented (ADR-087). Distinct from circle CREATION
 * ("circle O radius 5"): fires only when the named circle ALREADY EXISTS — otherwise it falls through to
 * `circle`. The circle is named ("circle P" / "מעגל P"), a bare label that is a known circle centre, or
 * the single circle in context. The engine sizes it by flexing the figure (an incircle stays the incircle).
 */
const setRadius: Rule = (s, ctx) => {
  if (!/radius|רדיוס/i.test(s)) return null;
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
 * "OB רדיוס" / "רדיוס OB" / "הוסף רדיוס OB" — declare the segment from a circle's CENTRE to a point ON it
 * (a drawn radius): the rim point goes on the circle and the centre→rim segment is drawn. Distinct from
 * `setRadius` (sets the radius VALUE — needs a number) and `circle` (creates a circle — needs "מעגל"). Fires
 * only for a BARE radius declaration whose two labels include an existing circle's centre, so it never
 * disturbs "D אמצע הרדיוס OB" (a midpoint — claimed earlier) or "radius … = 5" (a value).
 */
const radiusSegment: Rule = (s, ctx) => {
  if (!/\bradius\b|רדיוס/i.test(s)) return null;
  if (parseRadius(s).numeric) return null; // a numeric radius → `setRadius` / `circle`
  if (/אמצע|midpoint|=|⊥|⟂|∥|אנך|מאונך|מקביל|\bon\b|על\b/i.test(s)) return null; // not a bare radius declaration
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
};

/**
 * Is this a *circle* inscribed in a *polygon* (the incircle), rather than a
 * polygon inscribed in a circle? Discriminate by order: the inscribed subject
 * comes first, so a circle word *before* the polygon word ("circle inscribed in
 * triangle ABC" / "מעגל חסום במשולש") is the incircle — distinct from "triangle
 * inscribed in a circle", where the polygon comes first.
 */
const isCircleInPolygon = (s: string): boolean => {
  const circIdx = s.search(/incircle|\bcircle\b|מעגל/i);
  const polyIdx = s.search(/triangle|quad\w*|square|rectangle|rhombus|trapez\w*|polygon|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז/i);
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
    /equilateral|שווה[\s-]?צלעות|isosceles|שווה[\s-]?שוקיים|right[\s-]?angled|right|triangle|משולש|ישר[\s-]?זוו?ית|זוו?ית|square|ריבוע|rectangle|מלבן|rhombus|מעוין|trapez\w*|טרפז|quad\w*|מרובע|inscrib\w*|חסום|בר[\s-]?חסימה|cyclic|concyclic|circle|מעגל|cent\w*|radius|רדיוס\S*|שמרכזו|מרכזו|העובר|דרך/gi,
    ' ',
  );
  if (named) rest = rest.replace(new RegExp(String.raw`\b${named}\b`, 'gi'), ' ');
  if (r.symbolic) rest = rest.replace(/\b[Rr]\b/g, ' '); // the radius symbol is not a vertex (ADR-034)
  // The vertices the student named, or — when the shape word is explicit but UNLABELED ("מרובע חסום
  // במעגל" / "triangle inscribed in a circle") — auto-named A,B,C(,D), avoiding existing points and the
  // named centre. A PARTIAL label run (some letters but not n) stays a defer/escalate (a typo / compound).
  const ids =
    labelRun(rest, n) ??
    (namesVertices(rest) ? null : autoVertexLabels(n, [...(ctx.points ?? []), ...(named ? [named] : [])]));
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
      isTri
        ? { type: 'triangle', ids: [ids[0], ids[1], ids[2]] }
        : { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] },
      ...shapeCmds(ids),
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
    return isTri ? [{ type: 'triangle', ids: [ids[0], ids[1], ids[2]] }, ...shapeCmds(ids)] : [{ type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] }, ...shapeCmds(ids)];
  }
  if (isTri && allExist) {
    return [{ type: 'circumcircle', id: circ, center: up(center), a: ids[0], b: ids[1], c: ids[2] }, ...shapeCmds(ids)];
  }
  if (allExist) {
    return [
      { type: 'circumcircle', id: circ, center: up(center), a: ids[0], b: ids[1], c: ids[2], ...(hidden ? { hidden: true } : {}) },
      { type: 'set-concyclic', points: ids },
      { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] },
      ...shapeCmds(ids), // a trapezoid keeps AB ∥ CD even when inscribed from existing points
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
  const freeAngles = kind === 'quad' || kind === 'trapezoid' || kind === 'triangle';
  ids.forEach((id, i) => {
    // specific angle for a shaped cyclic polygon (square/rect/rhombus/trapezoid) or the general quad's
    // convex-default start; omit for triangle so it spreads evenly via nextTheta.
    cmds.push(
      angles
        ? { type: 'point-on-circle', id, circle: circ, theta: (angles[i] * Math.PI) / 180, ...(freeAngles ? { free: true } : {}) }
        : { type: 'point-on-circle', id, circle: circ },
    );
  });
  // The edges connect the on-circle vertices; the SHAPE is set by the angles.
  cmds.push(
    isTri
      ? { type: 'triangle', ids: [ids[0], ids[1], ids[2]] }
      : { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] },
  );
  cmds.push(...shapeCmds(ids));
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
 * half, and the diameter AB is drawn. The centre point is shown. Optional "radius r".
 */
const semicircle: Rule = (s, ctx) => {
  if (!/semicircle|half[\s-]?circle|חצי[\s-]?מעגל|חצי[\s-]?עיגול/i.test(s)) return null;
  const r = parseRadius(s);
  const stripped = dropCircleRef(s).replace(
    /semicircle|half[\s-]?circle|חצי[\s-]?מעגל|חצי[\s-]?עיגול|diameter|קוטר|שקוטרו|על|\bon\b|radius|רדיוס\S*|circle|מעגל|cent\w*|מרכז\S*/gi,
    ' ',
  );
  const dia = labelRun(stripped, 2);
  const [a, b] = dia ?? ['A', 'B'];
  const leftover = [a, b].reduce((acc, id) => acc.replace(new RegExp(String.raw`\b${id}\b`, 'gi'), ' '), stripped);
  if (SHAPE_LEFTOVER.test(leftover)) return 'stop'; // a compound ("semicircle … with AC=5") → escalate, don't half-parse
  const center = ['O', 'P', 'Q', 'M', 'N', 'S'].find((c) => c !== a && c !== b && !(ctx.points ?? []).includes(c)) ?? 'O';
  const circ = circleId(center);
  const cmds: AnyCommand[] = [{ type: 'circle', id: circ, center: up(center), radius: r.radius, hidden: true }];
  if (r.varCmd) cmds.push(r.varCmd);
  cmds.push(
    { type: 'point-on-circle', id: up(a), circle: circ, theta: Math.PI }, // left end of the diameter
    { type: 'point-on-circle', id: up(b), circle: circ, theta: 0 }, // right end
    { type: 'arc', id: `arc-${up(b)}${up(a)}`, center: up(center), from: up(b), to: up(a) }, // CCW B→A = the upper half
    { type: 'segment', a: up(a), b: up(b) }, // the diameter
  );
  return cmds;
};

/**
 * "quarter circle" / "רבע מעגל" (optionally "quarter circle OAB" naming centre + the two ends).
 * A 90° arc with its two bounding radii drawn; a HIDDEN circle keeps the ends on it. Optional "radius r".
 */
const quarterCircle: Rule = (s) => {
  if (!/quarter[\s-]?circle|רבע[\s-]?מעגל|רבע[\s-]?עיגול/i.test(s)) return null;
  const r = parseRadius(s);
  const stripped = dropCircleRef(s).replace(
    /quarter[\s-]?circle|רבע[\s-]?מעגל|רבע[\s-]?עיגול|radius|רדיוס\S*|circle|מעגל|cent\w*|מרכז\S*/gi,
    ' ',
  );
  const named = labelRun(stripped, 3); // "OAB" ⇒ centre O + ends A,B; else default
  const [center, a, b] = named ?? ['O', 'A', 'B'];
  const circ = circleId(center);
  const cmds: AnyCommand[] = [{ type: 'circle', id: circ, center: up(center), radius: r.radius, hidden: true }];
  if (r.varCmd) cmds.push(r.varCmd);
  cmds.push(
    { type: 'point-on-circle', id: up(a), circle: circ, theta: 0 },
    { type: 'point-on-circle', id: up(b), circle: circ, theta: Math.PI / 2 },
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
  const inscribed = /incircle|inscrib\w*|חסום/i.test(s) && isCircleInPolygon(s);
  // … OR "<polygon> ABCD circumscribes the circle" — the polygon encloses the circle (same figure). Ordered
  // (polygon-labels … circumscribes … circle) so a CIRCLE-first "מעגל חוסם משולש" (a circumcircle) does NOT
  // match here — only the polygon-as-subject reading does.
  const circumscribes =
    /(?:triangle|quad\w*|square|rectangle|rhombus|trapez\w*|parallelogram|polygon|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|מקבילית)\s+[A-Za-z]\d*.*?(?:circumscrib\w*|חוסם).*?(?:circle|מעגל)/i.test(s);
  if (!inscribed && !circumscribes) return null;
  // The polygon kind → vertex count. (Every triangle has an incircle; a quad needs to be TANGENTIAL, which
  // the construction below flexes it to be — sum of opposite sides equal, Pitot.)
  const kind =
    /triangle|משולש/i.test(s) ? 'triangle'
    : /square|ריבוע/i.test(s) ? 'square'
    : /rectangle|מלבן/i.test(s) ? 'rectangle'
    : /rhombus|מעוין/i.test(s) ? 'rhombus'
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
    /incircle|inscrib\w*|חסום|circumscrib\w*|חוסם|triangle|משולש|square|ריבוע|rectangle|מלבן|rhombus|מעוין|trapez\w*|טרפז|parallelogram|מקבילית|quad\w*|מרובע|polygon|circles?|מעגל\w*|cent(?:er|re)\w*|ה?מרכז\w*/gi,
    ' ',
  );
  if (namedC) rest = rest.replace(new RegExp(String.raw`\b${namedC}\b`, 'gi'), ' ');
  if (incLabel) rest = rest.replace(new RegExp(String.raw`\b${incLabel}\b`, 'gi'), ' ');
  const ids =
    labelRun(rest, n) ??
    (namesVertices(rest) ? null : autoVertexLabels(n, [...taken, ...(namedC ? [namedC] : []), ...(incLabel ? [incLabel] : [])]));
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
    const touch: Id[] = []; // three fresh, distinct touch-point labels, each dodging the figure + prior touches
    for (let i = 0; i < 3; i++) touch.push(freeLabel([...ids, O, ...taken, ...touch], ['P', 'Q', 'S', 'T', 'U', 'V']));
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
    const f = freeLabel([...ids, I, ...feet, ...taken], ['F', 'G', 'H', 'K', 'L', 'N', 'P', 'Q', 'S', 'T']);
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
    const members = new Set((ctx.circleMembers?.find((e) => up(e.center) === O)?.points ?? []).map(up));
    const cmds: AnyCommand[] = [];
    for (const tip of [arm1, arm2]) {
      cmds.push({ type: 'segment', a: vertex, b: tip }); // draw the tangent side (idempotent if already an edge)
      if (!members.has(tip)) cmds.push({ type: 'point-on-circle', id: tip, circle: circleId(O) }); // tip is the touch point
      cmds.push({ type: 'set-perpendicular', a: O, b: tip, c: vertex, d: tip, implicit: true }); // radius O–tip ⟂ the side ⇒ tangent at tip (structural, no right-angle mark)
    }
    return cmds;
  }
  // The circle's centre: the named one ("circle O"), else a fresh auto-name — the corner circle is a
  // NEW object, so "AB ו-AD משיקים למעגל" (no name) is built deterministically rather than escalating
  // (the centre is dodged against the figure's labels, like the incircle's incenter).
  const center = circleCenter(s) ?? freeLabel([vertex, arm1, arm2, ...(ctx.points ?? [])], ['O', 'P', 'Q', 'M']);
  // optional named tangency points: "at E and K" / "בנקודות E ו-K"
  const tp = s.match(/(?:\bat\b|בנקוד\w*)\s+([A-Za-z]\d*)\s*(?:and|ו-?|,)\s*([A-Za-z]\d*)/i);
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
const chord: Rule = (s, ctx) => {
  if (!/chord|מיתר/i.test(s)) return null;
  // "E על מיתר AC" is a POINT ON a chord, not a chord DEFINITION — let pointOnSegment handle it (and
  // withChordMembership still puts the endpoints on the circle). Without this guard `chord` grabs the
  // "AC" run and silently drops the named point E.
  if (POINT_ON_CARRIER.test(s)) return null;
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
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const ids = labelRun(dropCircleRef(s).replace(/diameter|קוטר/gi, ' '), 2);
  if (!ids) return null;
  const exists = (p: string) => (ctx.points ?? []).some((q) => up(q) === up(p));
  if (exists(ids[0]) && exists(ids[1]))
    return [{ type: 'set-collinear', a: up(ids[0]), b: up(center), c: up(ids[1]) }];
  return [{ type: 'diameter', id1: ids[0], id2: ids[1], circle: circleId(center) }];
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
  const m = dropCircleRef(s).match(/([A-Za-z]\d*)\b.*?(midpoint|אמצע|\bon\b|על)\s*.*?(?:arc|הקשת|קשת)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  const id = up(m[1]), from = up(m[3]), to = up(m[4]);
  // The arc BC lives on the circle that actually contains BOTH endpoints — prefer it over a named
  // circle that doesn't (a wrong LLM "in circle O" when C is only on circle P), and use it to
  // disambiguate when two circles exist. Fall back to the named / single circle otherwise.
  const center = circleContaining(ctx, [from, to], circleCenter(s)) ?? resolveCenter(s, ctx);
  if (!center) return null;
  return /midpoint|אמצע/i.test(m[2])
    ? [{ type: 'arc-midpoint', id, circle: circleId(center), from, to }]
    : [{ type: 'point-on-circle', id, circle: circleId(center), between: [from, to] }];
};

/** "A is on circle O" / "A על מעגל O" — a single inscribed point. */
const pointOnCircle: Rule = (s, ctx) => {
  if (!/circle|מעגל/i.test(s)) return null;
  // Leading \b on the label so "point A on circle O" reads A, not the "t" of "poin**t**".
  const m = s.match(/\b([A-Za-z]\d*)\b.*?(?:on|על).*?(?:circle|מעגל)/i);
  if (!m) return null;
  // The circle: its named centre ("circle O"), or — for a DEFINITE/unnamed reference ("on the
  // circle" / "על המעגל" / "נמצאת על המעגל") — the figure's single circle, via context.
  const center = resolveCenter(s, ctx);
  if (!center) return null; // 0 or 2+ unnamed circles ⇒ ambiguous → defer/escalate
  return [{ type: 'point-on-circle', id: up(m[1]), circle: circleId(center) }];
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
    .replace(/extension|המשך|intersection|חיתוך|נפגש\w*|מפגש|\bmeets?\b|\bpoint\b|בנקודה|נקודה/gi, ' ')
    .replace(FILLER, ' ');
  const pairM = rest.match(/\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/);
  if (!pairM) return null;
  const a = up(pairM[1]);
  const b = up(pairM[2]);
  const resM = rest.replace(/\b[A-Za-z]\d*\s*[A-Za-z]\d*\b/, ' ').match(/\b([A-Za-z]\d*)\b/); // remove the pair, take the lone letter
  if (!resM) return null;
  const e = up(resM[1]);
  const tanId = `tan-${at}`;
  const abId = `line-${a}${b}`;
  // "המשך AB" / "extension of AB" is DIRECTIONAL — E is beyond the SECOND letter (order a→b→e). Carry that as
  // the crossing's `order` so the figure flexes to put E on AB's extension (not the wrong side); without it
  // the tangent ∩ the infinite line can land beyond a. (ADR-127's order mechanism; folds into the solver.)
  const directional = /extension|המשך/i.test(s);
  return [
    // Draw what we reference, not just the point: the tangent (trimmed to D–E by the
    // renderer) and the line AB drawn all the way to E (E is on AB's extension).
    { type: 'tangent', id: tanId, circle: circleId(center), at, visible: true },
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
  const eM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?|מנקודה|מהנקודה|מ\s*נקודה)\s+([A-Za-z]\d*)/i); // the (external) point
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
    { type: 'point-on-segment', id: E, a: B, b: A, t: 1.3 }, // E beyond A on line BA → outside the circle
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
const twoCirclesMeet: Rule = (s, ctx) => {
  if (!/\bcircles\b|שני\s+מעגל|מעגלים/i.test(s)) return null; // two circles being introduced (plural)
  if (!(INTERSECT_KW.test(s) || /נחתכ|נפגש|מפגש|\bmeets?\b/i.test(s))) return null;
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
  if (!/המשך|extension|extended/i.test(s)) return null; // directional only — a plain chord stays lineMeetsCircle
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
    .replace(/extension|extended|\bline\b|המשך|הישר|הקו|חות[כך]|נחתכ?\w*|פוגש\w*|cuts?|meets?|crosses|intersects?/gi, ' ');
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
    .replace(/\bline\b|הישר|הקו|ישר|חות[כך]|נחתכ?\w*|פוגש\w*|cuts?|meets?|crosses|intersects?|המשך|extension|extended/gi, ' ');
  const pr = labelRun(body, 2);
  if (!pr || pr.includes(C) || pr.includes(D)) return null; // the line's points must differ from the crossings
  const [a, b] = pr;
  const circ = circleId(center);
  const lineId = `sec-${a}${b}`;
  return [
    { type: 'line-through', id: lineId, a, b },
    { type: 'line-circle-intersection', id: C, line: lineId, circle: circ, branch: 0 },
    { type: 'line-circle-intersection', id: D, line: lineId, circle: circ, branch: 1 },
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
  if (!/המשך|extension|extended/i.test(s)) return null;
  if (mentionsCircle(s)) return null; // a circle target → extendOntoCircle / lineMeetsCircle
  if (!/tangent|משיק|\bline\b|הישר|הקו/i.test(s)) return null; // the object D lives on (not a 2nd segment → line∩line)
  if (!INTERSECT_KW.test(s)) return null; // a "meets/cuts" phrasing
  const atM = s.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i);
  if (!atM) return null;
  const D = up(atM[1]);
  if (!(ctx.points ?? []).includes(D)) return null; // only CONSTRAIN an existing point (a new crossing is the intersection construct)
  const segM = s.match(/(?:המשך|extension(?:\s+of)?|extended)\s+([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
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
    .replace(/extension|extended|\bline\b|המשך|הישר|הקו|חות[כך]|נחתכ?\w*|פוגש\w*|cuts?|meets?|crosses|intersects?/gi, ' ');
  const pr = labelRun(body, 2);
  if (!pr || pr.includes(R)) return null;
  const [a, b] = pr;
  // avoid the endpoint already on the target circle (default to `a` — the avoid branch drops all
  // placed roots regardless, so the new crossing is found either way); draw from the off-circle end.
  const onCircle = circleContaining(ctx, [a], center) ? a : circleContaining(ctx, [b], center) ? b : a;
  const other = onCircle === a ? b : a;
  const lineId = `chord-${a}${b}`;
  return [
    { type: 'line-through', id: lineId, a, b },
    { type: 'line-circle-intersection', id: R, line: lineId, circle: circ, avoid: onCircle },
    { type: 'segment', a: other, b: R }, // the drawn secant: off-circle end → new crossing (through the shared point)
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
const tangentMeetsOtherCircle: Rule = (s) => {
  if (!/tangent|משיק/i.test(s)) return null;
  if (!INTERSECT_KW.test(s)) return null; // a meeting EVENT (cuts/meets/חותך/פוגש), not a state
  if (/each\s+other|זה\s+לזה/i.test(s)) return null; // mutual tangency → circlesTangent
  // Two adjacent "circle <C> at <P>" pairs: the tangent's circle + tangency point, then the
  // target circle + the new crossing. The adjacency (no "and"/verb between circle and "at")
  // is what separates this from `circlesTangent`'s "circle O and circle P … at M".
  const pairs = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b\s*(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/gi)];
  if (pairs.length < 2) return null;
  const c1 = up(pairs[0][1]), p1 = up(pairs[0][2]);
  const c2 = up(pairs[1][1]), p2 = up(pairs[1][2]);
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
  const named = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => up(m[1]));
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
    s.match(/^\s*\b([A-Za-z]\d*)(?:\s*([A-Za-z]\d*))?\b\s*(?=perpendicular|⊥|מאונך|אנך|parallel|∥|מקביל)/i);
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
  const eM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?|מנקודה|מהנקודה|מ\s*נקודה)\s+([A-Za-z]\d*)/i);
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
  const members = new Set((ctx.circleMembers?.find((e) => up(e.center) === up(center))?.points ?? []).map(up));
  let T = atM ? up(atM[1]) : null;
  if (!T && pts) {
    const onCircle = pts.filter((p) => members.has(p));
    if (onCircle.length === 1) T = onCircle[0];
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
  if (naming) {
    const fresh = naming.filter((p) => !have.has(p));
    if (fresh.length) cmds.push(...lineMarkers(lineId, fresh));
  }
  // A NAMED external point the tangent emanates FROM — "מנקודה D יוצא משיק … בנקודה B" / "from D a tangent
  // … at B": D lies ON the tangent line (the external apex). Create it as a free marker sliding along the
  // tangent so it appears IMMEDIATELY; a later fact ("the extension of CA meets the tangent at D") then
  // drives that DOF to the crossing (ADR-084). Only when new and distinct from the touch point.
  const fromM = s.match(/(?:from(?:\s+(?:a|the))?(?:\s+point)?|מנקודה|מהנקודה|\bמ-)\s*([A-Za-z]\d*)/i);
  const apex = fromM ? up(fromM[1]) : null;
  if (apex && apex !== T && !have.has(apex) && !cmds.some((c) => c.type === 'point-on-line' && (c as { id: Id }).id === apex)) {
    cmds.push(...lineMarkers(lineId, [apex]));
  }
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

/** "line through P perpendicular to AB" / "ישר דרך P מאונך ל-AB" / "DE אנך ל-AB בנקודה C" — a *drawn* perpendicular line through a point. */
const perpendicularLine: Rule = (s, ctx) => {
  if (!/perpendicular|⊥|מאונך|אנך/i.test(s)) return null;
  const thr = s.match(new RegExp(THROUGH_PT, 'i'));
  if (!thr) return null; // no through-point ⇒ it's the ⟂ constraint or a foot, not a drawn line
  const seg = s
    .replace(new RegExp(THROUGH_PT, 'gi'), ' ') // drop the through-clause so its point isn't read as the segment
    .match(/(?:perpendicular\s*to|⊥|מאונך\s*ל-?|אנך\s*ל-?)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
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
  const cut = s.match(
    new RegExp(String.raw`(?:חות[כך]|נחת\w*|פוגש\w*|פגש|\bcuts?\b|\bcrosses?\b|\bmeets?\b|\bintersects?\b)\s*(?:את\s+)?(?:ה?קו\s+|ה?ישר\s+|ה?משך\s+|extension\s+(?:of\s+)?|extended\s+)?([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?(?:בנקודה|\bat\b|ב-)\s*([A-Za-z]\d*)`, 'i'),
  );
  if (cut) {
    const [c1, c2, e] = [up(cut[1]), up(cut[2]), up(cut[3])];
    const abId = `line-${c1}${c2}`;
    out.push({ type: 'perpendicular-line', id: lineId, through: P, a, b, visible: false }); // scaffolding for the ∩
    out.push({ type: 'line-through', id: abId, a: c1, b: c2 }); // the segment it cuts, as a line
    out.push({ type: 'line-intersection', id: e, line1: lineId, line2: abId }); // E = perpendicular ∩ CD
    out.push({ type: 'segment', a: e, b: P }); // draw the perpendicular segment E–P (e.g. EK)
    return out;
  }

  // No cut: CONSTRUCT a drawn perpendicular through P, with any named endpoints as markers straddling it
  // (ADR-036). The markers REUSE the named points if they already exist — a bare "segment CD" then
  // "CD ⟂ AB at F" REPOSITIONS C,D onto the perpendicular, a clean cross, without redefinition errors.
  out.push({ type: 'perpendicular-line', id: lineId, through: P, a, b, visible: true });
  out.push(...lineMarkers(lineId, lineNameLabels(s, [P, a, b])));
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
  const names = lineNameLabels(s, [P, a, b]);
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
  // the triangle's 3 vertices: the labels between the cue and the cut verb ("…circumscribing [triangle] ABC cuts…").
  const tri = labelRun(s.slice(cue.index! + cue[0].length, cut.index).replace(/triangle|משולש|את|\bof\b|\bthe\b/gi, ' '), 3);
  if (!tri) return null;
  const [a, b, c] = tri;
  // the cut segment: the 2 labels between the cut verb and "at".
  const seg = labelRun(s.slice(cut.index! + cut[0].length, at.index).replace(/את|\bthe\b|\bline\b|הישר|הקו|המשך/gi, ' '), 2);
  if (!seg || seg.includes(D)) return null;
  const [p, q] = seg;
  const shared = [p, q].find((x) => [a, b, c].includes(x)) ?? p; // the endpoint already on the circumcircle
  const other = shared === p ? q : p; // the segment's OTHER endpoint
  const center = freeLabel([a, b, c, p, q, D, ...(ctx.points ?? []), ...(ctx.circles ?? [])], ['O', 'P', 'Q', 'K', 'S', 'T']);
  const circId = circleId(center);
  const lineId = `line-${p}${q}`;
  return [
    { type: 'circumcircle', id: circId, center, a, b, c },
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

  // Classic form "median from A in ABC" / "תיכון מ-A במשולש ABC" — auto-named midpoint.
  const apexM = s.match(/(?:\bfrom\s+|מ-?)([A-Za-z]\d*)\b/i); // "from A" / "מ-A" (keyword required, not any letter)
  // The triangle is named after "in"/"במשולש"; read it there so the apex letter isn't double-counted.
  const triPart = s.split(/\bin\b|במשולש|משולש/i).slice(1).join(' ') || s;
  const tri = labelRun(triPart.replace(/triangle|the/gi, ' '), 3);
  if (!apexM || !tri) return null;
  const apex = up(apexM[1]);
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
  const isPerpFrom = /perpendicular|מאונך|אנך/i.test(s) && !/through|דרך/i.test(s);
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
  const apexM = s.match(/(?:\bfrom\s+(?:the\s+)?(?:point\s+)?|מ-?\s*(?:ה?נקודה\s+)?)([A-Za-z]\d*)\b/i);
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
        if (pts.length === 2) {
          [p, q] = [pts[0], pts[1]];
        } else {
          // More than two other points in the figure: the opposite side is unambiguous only if the apex
          // belongs to exactly ONE triangle. Read it off the adjacency (ctx.neighbors) — two neighbours of the
          // apex that are also joined to each other close a triangle apex–P–Q whose side opposite the apex is
          // PQ. Exactly one such triangle → use it; zero or several → genuinely under-specified, so defer
          // rather than guess a side (ADR-052, no assumptions). Handles "גובה מנקודה D" with extra points around.
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
  const f = namedFoot ?? freeLabel([apex, p, q], ['F', 'G', 'H', 'P']);
  const cmds: Command[] = [];
  if (tri) cmds.push({ type: 'triangle', ids: [tri[0], tri[1], tri[2]] });
  cmds.push({ type: 'foot', id: f, from: apex, a: p, b: q });
  cmds.push({ type: 'segment', a: apex, b: f });
  return cmds;
};

/**
 * "perpendicular bisector of AB" / "אנך אמצעי ל-AB" — the segment's midpoint + a drawn ⟂ line there.
 * A NAMED bisector ("CD אנך אמצעי ל-AB" / "CD perpendicular bisector of AB") puts C, D as markers on
 * the bisector line (straddling the midpoint); the BISECTED segment is the one after the connector
 * ("of / ל / to AB"), never the leading name — so "CD … ל AB" bisects AB, not CD.
 */
const perpBisector: Rule = (s, ctx) => {
  if (!/perpendicular\s+bisector|אנך\s*אמצעי|אמצעי\b/i.test(s)) return null;
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
  const nameM = s.match(/^\s*\b([A-Za-z]\d*)(?:\s*([A-Za-z]\d*))?\b\s*(?=perpendicular\s+bisector|אנך\s*אמצעי|אמצעי)/i);
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
  const tri = labelRun(after, 3);
  if (!tri) return null;
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

// Order matters: the most specific keyword-anchored rules run first; the
// coordinate rule (freePoint) is last because it's the loosest.
//
// EXPORTED for the shadow-matrix guard test only ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md)
// A1 / PAR-11): the test runs EVERY rule against a corpus (not stopping at the first match) to detect a
// later, more-specific rule whose output diverges from the earlier winner's — the first-match-wins
// shadowing class behind ADR-119/077/166. Not part of the runtime API; `parse()` is the only entry point.
export const RULES: Rule[] = [
  compoundSuchThat, // "<place a point> such that <condition>" — split + parse each half, before all else
  setRadius, // "radius of circle P is 4" — set an EXISTING circle's radius; before `circle` (creation) and the shape rules (which 'stop' on רדיוס)
  congruence, // "ABC ≅ DEF" — before the shape rules ("triangle ABC ≅ …" contains "triangle")
  similarity, // "ABC ~ DEF"
  area, // "שטח המשולש ABC = 13" / "SABC/SDEF = 3/4" (ADR-118) — BEFORE the shape rules, which would otherwise build the named shape and drop the area
  semicircle, // "חצי מעגל" / "semicircle" — before `circle` (contains "מעגל") and the shape rules
  quarterCircle, // "רבע מעגל" / "quarter circle" — same
  incircle, // "circle inscribed in triangle ABC" — before inscribedPolygon (both match "inscribed")
  circumcircleMeetsSegment, // "the circle circumscribing ABC cuts CE at D" — before the shape rules (its "משולש ABC" would stop `triangle`)
  inscribedPolygon, // before the shape rules ("triangle ABC inscribed …" contains "triangle")
  // Special-line constructs whose Hebrew names a triangle ("…במשולש ABC") must
  // run before the shape rules, or `triangle` grabs the embedded משולש and stops.
  median,
  altitude, // "height/altitude from A" / "perpendicular from A to BC"
  perpBisector, // "perpendicular bisector of AB"
  midsegment, // "midsegment to BC in triangle ABC" — a triangle construct ("במשולש"); before the shapes AND before segment/midpoint (its "קטע"/"אמצע" keywords)
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
  bisectorPlacesPoint, // "AD bisects ∠BAC" — places D on the opposite side (after the ∩ compounds)
  cornerTangentCircle, // "AB and AD tangent to circle O" — a circle tangent to two sides of a corner; before the tangent/line rules (the משיק keyword makes lineLineIntersection 'stop')
  twoTangentsMeet, // TWO tangents (at two on-circle points) meeting at a point — before tangent∩segment
  tangentLineIntersection, // tangent ∩ a segment
  parallelCircleIntersection, // a parallel line ∩ the circle
  tangentChord, // a CHORD of one circle tangent to the OTHER at its endpoint — before circlesTangent/chord (which drop the tangency or the chord)
  tangentMeetsOtherCircle, // tangent LINE to one circle meets the OTHER circle — before circlesTangent (which would misread it as mutual tangency)
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
  // Collinearity ("E on line AC" / "line CE passes through A" / "A B C collinear") — before the
  // generic line∩line and before pointOnSegment (whose "P on QR" would misread "P on line QR").
  collinearConstraint,
  diameterCutsSegment, // "קוטר … מנקודה F חותך את הצלע AC בנקודה E" — before lineLineIntersection (which stops on "קוטר") and `diameter`
  lineLineIntersection,
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
  diameter,
  chord,
  circumcircle, // "circle through A B C" — before the centre-based `circle`
  nameCenter, // "O מרכז המעגל" — reveal an EXISTING circle's hidden centre; before `circle` (which would CREATE one)
  circle,
  foot, // before `pointOnSegment`
  pointOnExtension, // before `pointOnSegment` ("on … extension" must not read "ex" as labels)
  pointOnCircle, // "A on circle O" — before segment/pointOnSegment
  radiusSegment, // "OB רדיוס" — a drawn radius (rim point on the circle + centre→rim segment); after midpoint/setRadius/circle, before `segment` (so "OB" isn't grabbed as a bare segment)
  dividesInRatio, // "G מחלקת את DC ביחס 1:2" — a point on DC at a fixed t; keyword+`p:q` anchored, BEFORE `segment` (which would grab "הקטע DC" and drop the divider) and the numeric/ratio rules
  segment,
  pointsOnSegments, // "F, G, H on AB, AC, CB" — N points placed PAIRWISE on N segments, before the others
  pointsOnSegment, // "L and K are points on AC" — TWO points on a segment, before the single pointOnSegment
  pointOnSegment,
  measureOrder, // "α < β" — an inequality between two named measures (before setVar/numeric rules)
  lengthOrder, // "DC > AB" — an inequality between two SEGMENT lengths (two-letter sides; after measureOrder)
  setVar, // "x = 4" / "α = 30" — a bare variable binding; before the numeric rules
  segmentRatio, // "AE/ED = 2/3" — before the numeric rules (which would half-parse "ED=2")
  measureSqrt, // "AB = 12√x" / "12√2" — before measureLength so the radical isn't dropped
  measurePower, // "AB = x²" / "3x^2" — before measureLength so the exponent isn't dropped
  measurePi, // "AB = 2π" — before measureLength so π isn't read as a free variable
  measureLength, // "AB = 3x" (symbolic) — before ratio/equal/distance
  ratioConstraint, // "AB = 2 AD" — before equal/distance (it would half-parse "AB = 2")
  equalSegments, // "AB = CD" — before distance (numeric RHS) and freePoint (coord RHS)
  distanceConstraint, // "AB = 6"
  pointByDistances,
  freePoint,
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

/** The circle a command CONSUMES (references but doesn't define), or null. */
const consumedCircleId = (cmd: AnyCommand): Id | null =>
  cmd.type === 'point-on-circle' ||
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
 * A point named as a CHORD endpoint lies ON the circle — in ANY phrasing, not only the standalone
 * `chord` rule. When "chord"/"מיתר" appears together with a relation ("CD and AF are parallel chords",
 * "the chord AB equals the chord CD", "chord AB ⟂ chord CD"), the relational rule wins the first-match
 * race (it runs before `chord` and only understands plain segments), silently dropping the on-circle
 * membership — the endpoints would end up free points joined by segments, NOT points on the circle
 * (operator session sflkyd0r: "CD ו AF מיתרים המקבילים זה לזה" → segments + ∥ only). The fix is one
 * general post-pass, not a per-relation special case: every SEGMENT endpoint in a chord-flavoured
 * utterance is asserted on the resolved circle. Idempotent (the standalone `chord` rule's own
 * membership is deduped); a circle CENTRE is excluded so "radius OE" keeps O off the circle; a chord's
 * MIDPOINT is never a segment endpoint, so "C אמצע מיתר AB" puts A,B — not C — on the circle. Matches
 * the standalone rule's unconditional semantics (a chord's endpoints are on the circle whether they are
 * new or already placed). (ADR-119)
 */
function withChordMembership(commands: AnyCommand[], s: string, ctx: ParseContext): AnyCommand[] {
  if (!/chord|מיתר/i.test(s)) return commands;
  const center = resolveCenter(s, ctx);
  if (!center) return commands; // no circle to anchor the chord on — leave the parse untouched
  const circ = circleId(center);
  const centers = new Set([center, ...(ctx.circles ?? [])].map(up));
  const already = new Set(
    commands.flatMap((c) => (c.type === 'point-on-circle' && c.circle === circ ? [up(c.id)] : [])),
  );
  const endpoints: Id[] = [];
  for (const c of commands) {
    // The chord's endpoints are its carrier's two ends — whether the carrier is a `segment` or the
    // `a,b` of a `point-on-segment` ("E על מיתר AC"). The rider point (the on-segment `id`) is NOT an
    // endpoint, so it stays off the circle, matching the midpoint exclusion below.
    const pair = c.type === 'segment' || c.type === 'point-on-segment' ? [c.a, c.b] : null;
    if (!pair) continue;
    for (const id of pair) {
      const U = up(id);
      if (!centers.has(U) && !already.has(U) && !endpoints.includes(U)) endpoints.push(U);
    }
  }
  if (!endpoints.length) return commands;
  return [...endpoints.map((id): AnyCommand => ({ type: 'point-on-circle', id, circle: circ })), ...commands];
}

/**
 * The single normalization applied to every utterance before the rules run — collapse whitespace, spell
 * out Greek letter words, and rewrite `S_{ABC}`/`S_ABC` area subscripts. Extracted so the shadow-matrix
 * guard (A1) analyses the SAME text the rules actually see, and so future boundary normalizations (PAR-7:
 * maqaf `־`→`-`, strip bidi controls) land in ONE place rather than per-rule. Pure.
 */
export function normalizeUtterance(raw: string): string {
  return normalizeAreaSubscript(normalizeGreek(raw.trim().replace(/\s+/g, ' ')));
}

export function parse(raw: string, ctx: ParseContext = NO_CONTEXT): ParseResult {
  const s = normalizeUtterance(raw);
  if (!s) return { ok: false, reason: 'not-handled' };
  for (const rule of RULES) {
    const res = rule(s, ctx);
    if (res === 'stop') break; // recognised but unreadable — escalate, don't half-parse
    if (!res) continue;
    if (Array.isArray(res)) return { ok: true, commands: withImplicitCircles(withChordMembership(res, s, ctx), ctx) };
    return { ok: false, reason: res.clarify, vertex: res.vertex }; // a clarification request (e.g. ambiguous single-vertex angle)
  }
  return { ok: false, reason: 'not-handled' };
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
export function droppedNewLabels(utterance: string, commands: AnyCommand[], existingPoints: Id[] = []): Id[] {
  const have = new Set(existingPoints.map((p) => p.toUpperCase()));
  const used = new Set(JSON.stringify(commands).match(/[A-Z]\d*/g) ?? []); // every label the commands reference (incl. inside ids like circle-P / tan-B)
  const inputLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])];
  return inputLabels.filter((L) => !have.has(L) && !used.has(L));
}

/**
 * Detect a RELABEL request — "rename E to G" / "relabel E as G" / "replace E with G"
 * / "rename E G", Hebrew "שנה שם E ל-G" / "שנה E ל-G" / "החלף E ב-G" / "החלף את E עם G".
 * This is a store-level operation (rewrite the point's letter across every fact),
 * not a geometry command, so it's handled outside `parse` (the App intercepts it).
 * Returns the uppercased point letters, or null when the utterance isn't a rename.
 * Connectors are optional and varied: to/as/into/with/with-arrow, ל-/ב-/עם.
 */
export function parseRename(raw: string): { from: Id; to: Id } | null {
  const s = raw.trim().replace(/\s+/g, ' ');
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
  const s = raw.trim().replace(/\s+/g, ' ');
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
  const s = raw.trim().replace(/\s+/g, ' ');
  const m =
    s.match(/(?:merge|fold|combine|unify)\s+([A-Za-z]\d*)\b(?:\s+(?:into|with|and|to|->|→))?\s+([A-Za-z]\d*)\b/i) ??
    s.match(/(?:מזג|אחד)\s*(?:את\s*)?([A-Za-z]\d*)\s*(?:ל-?|עם|ו-?|→)?\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  const from = up(m[1]);
  const to = up(m[2]);
  return from === to ? null : { from, to };
}
