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

import { RADIUS_VAR, type AnyCommand, type Command, type Id, type SymbolicCommand } from '@/engine';

export type ParseResult =
  | { ok: true; commands: AnyCommand[] }
  | { ok: false; reason: 'not-handled' };

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
}
const NO_CONTEXT: ParseContext = {};

/**
 * 'stop' = the rule recognised its keyword but could not read the sentence:
 * abort the whole parse (→ not-handled, the fallback boundary) instead of
 * letting a weaker rule half-parse the utterance. A half-parse that silently
 * drops part of a fact is worse than a miss — it draws a wrong figure.
 */
type Rule = (s: string, ctx: ParseContext) => AnyCommand[] | null | 'stop';

const up = (c: string): Id => c.toUpperCase();
const num = String.raw`(-?\d+(?:\.\d+)?)`;

/** Deterministic circle id from its centre letter — so "circle O" is referenceable by name. */
const circleId = (center: string): Id => `circle-${center.toUpperCase()}`;
/** The centre letter of a circle named in `s` ("circle O" / "מעגל O" / "centered at O" / "שמרכזו O"). */
const circleCenter = (s: string): string | null => {
  const m =
    s.match(/(?:cent\w*\s+(?:at\s+)?|around\s+|שמרכזו\s*|מרכזו\s*|סביב\s+)([A-Za-z]\d*)\b/i) ??
    s.match(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/i);
  return m ? m[1] : null;
};
/**
 * The circle a phrase refers to: its named centre, or — when none is named and the
 * figure has exactly ONE circle — that circle's centre (implicit "the circle"). With
 * 0 or 2+ unnamed circles it stays null (ambiguous → the rule defers/escalates).
 */
const resolveCenter = (s: string, ctx: ParseContext): string | null =>
  circleCenter(s) ?? (ctx.circles?.length === 1 ? ctx.circles[0] : null);

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
  /\b(?:inscrib\w*|circumscrib\w*|circles?|tangents?|diameters?|chords?|arcs?|radius|radii|perpendiculars?|parallels?|bisects?|bisectors?|midpoints?|medians?|heights?|altitudes?|foot|feet|intersections?|extensions?|angles?|segments?|diagonals?|connect|congruent|similar|points?)\b|[=⊥∥∩°≅~∼∽]|חסום|חוסם|מעגל|משיק|קוטר|מיתר|קשת|רדיוס|מאונך|אנך|מקביל|חוצ|אמצע|תיכון|גובה|המשך|חיתוך|זוו?ית|קטע|אלכסון|חבר|נקוד|חופ|דומ/i;

/** True if, after removing the shape keyword, geometry the shape can't express remains. */
const shapeHasLeftover = (s: string, re: RegExp): boolean => SHAPE_LEFTOVER.test(s.replace(re, ' '));

/** A quad-shape rule factory: keyword (either order) + 4 labels → command. */
const quadShape =
  (re: RegExp, make: (ids: [Id, Id, Id, Id]) => Command): Rule =>
  (s) => {
    if (!re.test(s)) return null;
    const ids = labelRun(s.replace(re, ' '), 4);
    if (!ids) return null;
    if (shapeHasLeftover(s, re)) return 'stop'; // don't drop a modifier — escalate
    return [make([ids[0], ids[1], ids[2], ids[3]])];
  };

/** A triangle rule factory: keyword (either order) + 3 labels → command. */
const triShape =
  (re: RegExp, make: (ids: [Id, Id, Id]) => Command): Rule =>
  (s) => {
    if (!re.test(s)) return null;
    const ids = labelRun(s.replace(re, ' '), 3);
    if (!ids) return null;
    if (shapeHasLeftover(s, re)) return 'stop';
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

/** "triangle ABC" / "משולש ABC" — 3 free vertices. */
const triangle = triShape(/triangle|משולש/gi, (ids) => ({ type: 'triangle', ids }));

/** "segment AC" / "diagonal AC" / "קטע AC" / "אלכסון AC" — connect two points. */
const segment: Rule = (s) => {
  if (!/segment|diagonal|connect|קטע|אלכסון|חבר/i.test(s)) return null;
  const ids = labelRun(s.replace(/segment|diagonal|connect|קטע|אלכסון|חבר/gi, ' '), 2);
  return ids ? [{ type: 'segment', a: ids[0], b: ids[1] }] : null;
};

/**
 * Line–line intersection, both phrasing directions:
 *   point-first — "E is the intersection of AC and BD" / "E = AC ∩ BD" / "E חיתוך AC ו-BD"
 *   lines-first — "AC and BD intersect at E" / "האלכסונים AC ו-BD נחתכים בנקודה E"
 * (Hebrew needs both נחתך and נחתכ: the final-form ך differs from the כ that
 * inflected forms like נחתכים carry.) If an intersection keyword is present but
 * neither pattern reads, the parse STOPS — otherwise the `segment` rule would
 * half-parse "the diagonals AC and BD intersect at E" into just "segment AC",
 * silently dropping the intersection point.
 */
const INTERSECT_KW = /intersect|∩|חיתוך|נחתך|נחתכ|נפגש|חות[כך]|\bcuts?\b|\bmeets?\b/i; // incl. "חותך" (cuts) / "cuts"
const lineLineIntersection: Rule = (s) => {
  if (!INTERSECT_KW.test(s)) return null;
  // The operands of a plain line∩line must be point-pairs the figure already has.
  // If they're introduced here AS constructs this rule can't build (a diameter, a
  // chord, a radius/tangent), don't half-parse "diameter AB and chord DE meet at C"
  // into a bare intersection that drops the diameter & chord — escalate so the
  // operands get created (ADR-024; the LLM has the circle as context).
  if (/\bdiameter\b|\bchord\b|\bradius\b|\btangent\b|קוטר|מיתר|רדיוס|משיק/i.test(s)) return 'stop';
  // Drop filler words so they aren't mistaken for two-letter line labels ("of"!).
  const t = s.replace(/\b(?:is|the|of|between|at|point|הוא|בין|בנקודה|נקודה)\b/gi, ' ');
  const pointFirst = t.match(
    /\b([A-Za-z]\d*)\b.*?(?:intersection|∩|חיתוך|נחתך).*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b.*?\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i,
  );
  // Draw the two segments we reference (idempotent if they're already edges) — the
  // student should see the lines whose crossing is the point, not just the point.
  const cross = (id: string, a: string, b: string, c: string, d: string): Command[] => [
    { type: 'segment', a: up(a), b: up(b) },
    { type: 'segment', a: up(c), b: up(d) },
    { type: 'line-line-intersection', id: up(id), a: up(a), b: up(b), c: up(c), d: up(d) },
  ];
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
  return 'stop';
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
const midpoint: Rule = (s) => {
  if (!/midpoint|אמצע/i.test(s)) return null;
  const m = s.match(/([A-Za-z]\d*)\b.*?(?:midpoint|אמצע)\s*(.*)/i);
  if (!m) return null;
  // strip filler ("of"!) and segment/radius words so they aren't read as labels.
  const rest = m[2].replace(FILLER, ' ').replace(/radius|רדיוס\S*|segment|קטע/gi, ' ');
  const seg = labelRun(rest, 2);
  return seg ? [{ type: 'midpoint', id: up(m[1]), a: seg[0], b: seg[1] }] : null;
};

/** "F on the extension of AD" / "F על המשך AD" — a point on the ray beyond the far end (t > 1). */
const pointOnExtension: Rule = (s) => {
  if (!/extension|המשך/i.test(s)) return null;
  const m = s.match(/(?:point\s+|נקודה\s+)?([A-Za-z]\d*)\b.*?(?:extension|המשך)\s*(.*)/i);
  if (!m) return null;
  // strip filler ("of"!) so "of AD" reads AD, not the labels O,F of "of".
  const seg = labelRun(m[2].replace(FILLER, ' '), 2);
  return seg ? [{ type: 'point-on-segment', id: up(m[1]), a: seg[0], b: seg[1], t: 1.3 }] : null;
};

/**
 * "angle GAB = 37" / "∠GAB = 37°" / "זווית GAB = 37" (any order) — middle letter is the vertex.
 * Stating the angle also DRAWS its two arms (vertex→ray1, vertex→ray2) so the angle is visible
 * even on a standalone configuration; `segment` is idempotent, so on an existing corner where the
 * arms are already edges these are no-ops (mirrors the ∥/⟂ draw-its-segments convenience, FR-IN-7).
 */
const angle: Rule = (s) => {
  if (!/(?:angle|∠|זוו?ית)/i.test(s)) return null;
  const stripped = s.replace(/angle|∠|זוו?ית/gi, ' ');
  const ids = labelRun(stripped, 3);
  const valM = stripped.match(new RegExp(num));
  if (!ids || !valM) return null;
  const [r1, v, r2] = ids;
  return [
    { type: 'segment', a: v, b: r1 },
    { type: 'segment', a: v, b: r2 },
    { type: 'set-angle', vertex: v, ray1: r1, ray2: r2, value: parseFloat(valM[1]) },
  ];
};

/**
 * "point G on AD" / "נקודה G על AD" with optional ratio "at 40%" / "ב-40%".
 * The segment labels are word-bounded so "F on the extension of AD" can't read
 * "th" of "the" as a segment — that phrasing escapes to the fallback instead.
 */
const pointOnSegment: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:point\s+|נקודה\s+)?([A-Za-z]\d*)\s+(?:on|על)\s+([A-Za-z]\d*)\s*([A-Za-z]\d*)\b(?:\s+(?:at|ב-?)?\s*${num}\s*(%)?)?`,
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
const segmentRatio: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*\/\s*\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})\s*(?:\/\s*(${COEF}))?`));
  if (!m) return null;
  const num = parseFloat(m[5]);
  const den = m[6] ? parseFloat(m[6]) : 1;
  return [{ type: 'set-ratio', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]), k: num / den }];
};

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

/** "AB = 6" — fix a segment's length. Also DRAWS the named segment (idempotent), FR-IN-7. */
const distanceConstraint: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*${num}\b`));
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
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*π`));
  if (!m) return null;
  const c = m[3] ? parseFloat(m[3]) : 1;
  return [{ type: 'measure-length', a: up(m[1]), b: up(m[2]), expr: { value: c * Math.PI, text: `${c === 1 ? '' : m[3]}π` } }];
};

const measureLength: Rule = (s) => {
  // The variable is one lowercase/Greek letter, not followed by another latin letter
  // (so "AB = CD" stays a ratio and a Greek letter — no regex word boundary — still ends cleanly).
  // An optional trailing "/d" makes the coefficient a fraction ("7k/5" ⇒ coef 7/5); an optional
  // "± c" (c a number or fraction) adds an affine constant ("k + 2", "k − 5/2"). Both are kept
  // verbatim for the label so it reads exactly as typed, not a decimal.
  const m = s.match(
    new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*(${LVAR})(?![a-zA-Z])\s*(?:\/\s*(${COEF}))?\s*(?:([+\-−])\s*(${COEF})(?:\s*\/\s*(${COEF}))?)?`),
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
 */
const SQRT_FN = String.raw`(?:√|\\sqrt|sqrt)\s*[\{(]?\s*(${VAR}|${COEF})\s*[\})]?`;
const measureSqrt: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`\b([A-Za-z]\d*)\s*([A-Za-z]\d*)\b\s*=\s*(${COEF})?\s*[*·]?\s*${SQRT_FN}`, 'i'));
  if (!m) return null;
  const a = up(m[1]);
  const b = up(m[2]);
  const coef = m[3] ? parseFloat(m[3]) : 1;
  const radicand = m[4];
  // Number under the radical ⇒ a concrete length, but keep "12√2" as the display (not 16.97);
  // a letter ⇒ symbolic (pow ½), display derived as "12√x".
  if (/^[0-9.]+$/.test(radicand)) return [{ type: 'measure-length', a, b, expr: { value: coef * Math.sqrt(parseFloat(radicand)), text: `${m[3] && coef !== 1 ? m[3] : ''}√${radicand}` } }];
  return [{ type: 'measure-length', a, b, expr: { coef, var: radicand.toLowerCase(), pow: 0.5 } }];
};

/**
 * "AB = x²" / "AB = 3x²" / "AB = x^2" / "AB = 2x^3" — a length as `coef·varⁿ`. Runs
 * BEFORE `measureLength` (which would read the `x` and silently drop the `²`/`^n`).
 * A numeric base ("AB = 5²") is a concrete length. The exponent is a ²/³ superscript
 * or `^n`.
 */
const measurePower: Rule = (s) => {
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
  if (!/perpendicular|⊥|מאונך/i.test(s)) return null;
  const t = s.replace(/perpendicular(?:\s*to)?|⊥|מאונך(?:\s*ל-?)?/gi, ' ').replace(FILLER, ' ');
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

/** "circle centered at O radius 5" / "circle O radius R" / "מעגל שמרכזו O רדיוסו 5". */
const circle: Rule = (s) => {
  if (!/circle|מעגל/i.test(s)) return null;
  const r = parseRadius(s);
  const thrM = s.match(/(?:through|העובר\s*דרך|דרך)\s+([A-Za-z]\d*)\b/i);
  const centered = /cent(?:er|re)d?|around|מרכז\w*|סביב/i.test(s);
  if (!r.numeric && !r.symbolic && !thrM && !centered) return null; // a bare "circle O" reference, not a definition
  const center = circleCenter(s);
  if (!center) return null;
  if (thrM && !r.numeric && !r.symbolic) return [{ type: 'circle-through', id: circleId(center), center: up(center), through: up(thrM[1]) }];
  return [{ type: 'circle', id: circleId(center), center: up(center), radius: r.radius }, ...(r.varCmd ? [r.varCmd] : [])];
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
  triangle: null,
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
  const named = circleCenter(s); // may be null — "inscribed in a circle" need not name the centre
  const r = parseRadius(s);
  let rest = dropCircleRef(s).replace(
    /right[\s-]?angled|right|triangle|משולש|ישר[\s-]?זוו?ית|זוו?ית|square|ריבוע|rectangle|מלבן|rhombus|מעוין|trapez\w*|טרפז|quad\w*|מרובע|inscrib\w*|חסום|בר[\s-]?חסימה|cyclic|concyclic|circle|מעגל|cent\w*|radius|רדיוס\S*|שמרכזו|מרכזו|העובר|דרך/gi,
    ' ',
  );
  if (named) rest = rest.replace(new RegExp(String.raw`\b${named}\b`, 'gi'), ' ');
  if (r.symbolic) rest = rest.replace(/\b[Rr]\b/g, ' '); // the radius symbol is not a vertex (ADR-034)
  const ids = labelRun(rest, n);
  if (!ids) return null;
  // After the circle, the shape, and the vertices are consumed, nothing
  // geometry-significant should remain — a constraint/extra construct means a
  // compound ("inscribed … with AB = 6") → escalate, don't half-parse.
  const leftover = ids.reduce(
    (a, id) => a.replace(new RegExp(String.raw`\b${id}\b`, 'gi'), ' '),
    rest.replace(new RegExp(String.raw`\b${ids.join('')}\b`, 'i'), ' '),
  );
  if (SHAPE_LEFTOVER.test(leftover)) return 'stop';
  // No centre named ⇒ create one: a fresh label that doesn't clash with the vertices.
  const center = named ?? (['O', 'P', 'Q', 'K', 'S', 'T', 'U'].find((c) => !ids.includes(c)) ?? 'O');
  const circ = circleId(center);
  // Inscribing a triangle whose vertices ALREADY exist means the CIRCUMCIRCLE through
  // them (not a fresh circle they'd be forced onto) — otherwise the new centre lands
  // at the origin and can collide with a vertex ("A and O at the same point").
  if (isTri && ids.every((id) => (ctx.points ?? []).includes(id))) {
    return [{ type: 'circumcircle', id: circ, center: up(center), a: ids[0], b: ids[1], c: ids[2] }];
  }
  // A cyclic (hidden-circle) quad needs CONVEX vertex order for the opposite-angles theorem;
  // the default general-quad spread (golden angle) would interleave the vertices into a
  // CROSSED quad. Use a convex, ordered angle set for ANY general quad — inscribed (drawn
  // circle) or cyclic (hidden) — so ABCD is always a proper convex quadrilateral.
  const angles = kind === 'quad' ? CYCLIC_QUAD_ANGLES : INSCRIBED_ANGLES[kind];
  const cmds: AnyCommand[] = [{ type: 'circle', id: circ, center: up(center), radius: r.radius, ...(hidden ? { hidden: true } : {}) }];
  if (r.varCmd) cmds.push(r.varCmd);
  ids.forEach((id, i) => {
    // specific angle for a shaped cyclic polygon (square/rect/rhombus/trapezoid);
    // omit for triangle/general-quad so they spread evenly.
    cmds.push(
      angles
        ? { type: 'point-on-circle', id, circle: circ, theta: (angles[i] * Math.PI) / 180 }
        : { type: 'point-on-circle', id, circle: circ },
    );
  });
  // The edges connect the on-circle vertices; the SHAPE is set by the angles.
  cmds.push(
    isTri
      ? { type: 'triangle', ids: [ids[0], ids[1], ids[2]] }
      : { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] },
  );
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
 * "circle inscribed in triangle ABC" / "incircle of triangle ABC" /
 * "מעגל חסום במשולש ABC" — the INCIRCLE: centred at the incenter (where two angle
 * bisectors meet), tangent to the sides. Built from existing primitives — two
 * bisectors → their crossing (incenter) → the foot on a side (tangency point) →
 * a circle through it. Distinct from "triangle inscribed in a circle".
 */
const incircle: Rule = (s) => {
  if (!/incircle|inscrib\w*|חסום/i.test(s)) return null;
  if (!isCircleInPolygon(s)) return null; // only "circle in polygon", not "polygon in circle"
  if (!/triangle|משולש/i.test(s)) return null; // v1: incircle of a triangle
  const triPart = s.split(/triangle|משולש/i).slice(1).join(' '); // vertices follow the polygon word
  const ids = labelRun(triPart, 3);
  if (!ids) return null;
  const [A, B, C] = ids;
  const I = circleCenter(s) ?? freeLabel(ids, ['I', 'O', 'P', 'Q']); // the incenter
  const F = freeLabel([...ids, I], ['F', 'G', 'H', 'K']); // tangency point on AB
  const bisA = `bis-${B}${A}${C}`; // ∠BAC (vertex A)
  const bisB = `bis-${A}${B}${C}`; // ∠ABC (vertex B)
  return [
    { type: 'triangle', ids: [A, B, C] }, // ensure the triangle exists
    { type: 'bisector', id: bisA, vertex: A, p: B, q: C },
    { type: 'bisector', id: bisB, vertex: B, p: A, q: C },
    { type: 'line-intersection', id: I, line1: bisA, line2: bisB }, // incenter
    { type: 'foot', id: F, from: I, a: A, b: B }, // inradius foot on side AB
    { type: 'circle-through', id: circleId(I), center: I, through: F },
  ];
};

/** "chord AB in circle O" / "מיתר AB במעגל O" — both endpoints on the circle + the segment. */
const chord: Rule = (s, ctx) => {
  if (!/chord|מיתר/i.test(s)) return null;
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

/** "diameter DE in circle O" / "קוטר DE במעגל O" — a point on the circle + its antipode + the segment. */
const diameter: Rule = (s, ctx) => {
  if (!/diameter|קוטר/i.test(s)) return null;
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const ids = labelRun(dropCircleRef(s).replace(/diameter|קוטר/gi, ' '), 2);
  if (!ids) return null;
  return [{ type: 'diameter', id1: ids[0], id2: ids[1], circle: circleId(center) }];
};

/** "M is the midpoint of arc BC in circle O" / "M אמצע הקשת BC במעגל O". */
const arcMidpoint: Rule = (s, ctx) => {
  if (!/arc|קשת/i.test(s)) return null;
  const center = resolveCenter(s, ctx);
  if (!center) return null;
  const m = dropCircleRef(s).match(/([A-Za-z]\d*)\b.*?(?:midpoint|אמצע).*?(?:arc|הקשת|קשת)\s*([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  return [{ type: 'arc-midpoint', id: up(m[1]), circle: circleId(center), from: up(m[2]), to: up(m[3]) }];
};

/** "A is on circle O" / "A על מעגל O" — a single inscribed point. */
const pointOnCircle: Rule = (s) => {
  if (!/circle|מעגל/i.test(s)) return null;
  const m = s.match(/([A-Za-z]\d*)\b.*?(?:on|על).*?(?:circle|מעגל)\s+([A-Za-z]\d*)\b/i);
  if (!m) return null;
  return [{ type: 'point-on-circle', id: up(m[1]), circle: circleId(m[2]) }];
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
  return [
    // Draw what we reference, not just the point: the tangent (trimmed to D–E by the
    // renderer) and the line AB drawn all the way to E (E is on AB's extension).
    { type: 'tangent', id: tanId, circle: circleId(center), at, visible: true },
    { type: 'line-through', id: abId, a, b }, // scaffolding for the crossing
    { type: 'line-intersection', id: e, line1: tanId, line2: abId },
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
  // ANOTHER secant from an EXISTING external point: line E–A, B = the other intersection. Don't
  // re-place E (no constraint), so the shared external point stays where the first secant put it.
  if (ctx.points?.includes(E)) {
    const lineId = `sec-${E}${A}`;
    return [
      { type: 'point-on-circle', id: A, circle: circ },
      { type: 'line-through', id: lineId, a: E, b: A },
      { type: 'line-circle-intersection', id: B, line: lineId, circle: circ, branch: 0 }, // the intersection ≠ A
      { type: 'segment', a: E, b: A }, // the secant E–B–A
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
 * A and B" — CREATE both circles (overlapping, default radius) and BOTH intersection points A, B (the
 * two branches), plus their common chord. The single-point `circleCircleIntersection` below needs the
 * two circles to already exist and yields one point; this is the "draw two intersecting circles" opener.
 */
const twoCirclesMeet: Rule = (s) => {
  if (!/\bcircles\b|שני\s+מעגל|מעגלים/i.test(s)) return null; // two circles being introduced (plural)
  if (!(INTERSECT_KW.test(s) || /נחתכ|נפגש|מפגש|\bmeets?\b/i.test(s))) return null;
  // the two intersection points — prefer the pair after "at"/"בנקודות" (so named centres "O and P" aren't read as the points)
  const abM =
    s.match(/(?:\bat\b|בנקוד\S*|points?)\s*([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)/i) ??
    s.match(/\b([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)\b/i);
  if (!abM) return null;
  const A = up(abM[1]), B = up(abM[2]);
  const named = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => up(m[1]));
  const c1 = named[0] ?? 'O';
  const c2 = named[1] ?? freeLabel([c1, A, B], ['P', 'Q', 'K', 'S']);
  if (new Set([A, B, c1, c2]).size !== 4) return null;
  const id1 = circleId(c1), id2 = circleId(c2);
  return [
    { type: 'circle', id: id1, center: c1, radius: RADIUS_DEFAULT },
    { type: 'circle', id: id2, center: c2, radius: RADIUS_DEFAULT },
    { type: 'circle-circle-intersection', id: A, circle1: id1, circle2: id2, branch: 0 },
    { type: 'circle-circle-intersection', id: B, circle1: id1, circle2: id2, branch: 1 },
    { type: 'segment', a: A, b: B }, // the common chord
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
const circlesTangent: Rule = (s) => {
  if (!/tangent|משיק/i.test(s)) return null;
  const centers = [...s.matchAll(/(?:circle|מעגל)\s+([A-Za-z]\d*)\b/gi)].map((m) => up(m[1]));
  if (centers.length < 2 || centers[0] === centers[1]) return null; // a single circle ⇒ the tangent-line rule
  const atM = s.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i);
  if (!atM) return null;
  const internal = /\binternal\w*\b|\bfrom\s+inside\b|\binside\b|פנימ|מבפנים/i.test(s);
  return [{ type: 'circles-tangent', circle1: circleId(centers[0]), circle2: circleId(centers[1]), at: up(atM[1]), external: !internal }];
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
  const abM = s.match(/\b([A-Za-z]\d*)\s*(?:\band\b|ו-?|,)\s*([A-Za-z]\d*)\b/i); // the two touch points "A and B"
  if (!abM) return null;
  const E = up(eM[1]), A = up(abM[1]), B = up(abM[2]);
  if (new Set([E, A, B]).size !== 3) return null;
  const circ = circleId(center);
  const mid = `~tanmid-${center}${E}`; // hidden centre of the Thales circle on O-E (scaffolding; "~" → not drawn)
  const aux = `tanaux-${center}${E}`;
  const out: AnyCommand[] = [];
  if (!ctx.points?.includes(E)) out.push({ type: 'free-point', id: E, x: 12, y: 0 }); // the external apex, if new
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
  if (placeApex) out.push({ type: 'free-point', id: apex, x: 12, y: 0 }); // the external apex, if new
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
  const atM = s.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z]\d*)\b/i);
  if (!center || !atM) return null;
  const T = up(atM[1]);
  const lineId = `tan-${T}`;
  const cmds: AnyCommand[] = [{ type: 'tangent', id: lineId, circle: circleId(center), at: T, visible: true }];
  // If the line is *named* by two points ("הישר CD משיק…" / "line CD tangent…"),
  // create them as fixed markers on the tangent at ±offset from the tangency point
  // T (the line's anchor), so they're referenceable (e.g. a later AC, TC).
  const named = dropCircleRef(s)
    .replace(/(?:\bat\b|בנקודה|ב-?)\s*[A-Za-z]\d*\b/gi, ' ')
    .replace(/tangent|משיק\S*|\bline\b|הישר|הקו|למעגל|מעגל/gi, ' ');
  const pts = labelRun(named, 2);
  if (pts && pts[0] !== T && pts[1] !== T && pts[0] !== up(center) && pts[1] !== up(center)) {
    cmds.push(...lineMarkers(lineId, [pts[0], pts[1]]));
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
  const names = lineNameLabels(s, [P, a, b]);
  const have = new Set(ctx.points ?? []);
  const lineId = `perp-${P}-${a}${b}`;
  // CONSTRUCT a perpendicular through the cut-point P, with the named endpoints as markers straddling
  // it (ADR-036). The cut-point P is on the reference AB: create it there if it doesn't exist yet (the
  // foot). The markers REUSE the named points if they already exist — a bare "segment CD" then
  // "CD ⟂ AB at F" REPOSITIONS C,D onto the perpendicular (apply replaces the loose free points), so
  // CD becomes the perpendicular crossing AB at F, centred on it (clean cross), without redefinition errors.
  const out: AnyCommand[] = [];
  if (!have.has(P)) out.push({ type: 'point-on-segment', id: P, a, b }); // the foot on AB, if new
  out.push({ type: 'perpendicular-line', id: lineId, through: P, a, b, visible: true });
  out.push(...lineMarkers(lineId, names));
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
const circumcircle: Rule = (s) => {
  if (!/circle|מעגל/i.test(s)) return null;
  if (!/through|circumscrib|חוסם|דרך/i.test(s)) return null; // the 3-point cue (חוסם circumscribes ≠ חסום inscribed)
  if (circleCenter(s)) return null; // a named centre ⇒ it's a centre-based circle, not a circumcircle
  const rest = s.replace(/circles?|מעגל|circumscrib\w*|through|דרך|חוסם|את|of|the|around|triangle|משולש|מרובע/gi, ' ');
  const ids = labelRun(rest, 3);
  if (!ids) return null;
  const center = freeLabel(ids, ['O', 'P', 'Q', 'K', 'S', 'T']);
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

/**
 * "height from A in ABC" / "altitude from A in ABC" / "גובה מ-A במשולש ABC", and
 * the bare-foot phrasing "perpendicular from A to BC" — the altitude from a vertex:
 * the foot of the perpendicular onto the opposite side, plus the segment to it.
 */
const altitude: Rule = (s) => {
  // An explicitly *named* foot ("G is the foot of the perpendicular from E to AB")
  // is the `foot` rule's job — don't grab it here and auto-name the foot (which
  // collided with an existing point). This rule is for the height/altitude and the
  // bare unnamed "perpendicular from A to BC".
  if (/\bfoot\b|רגל/i.test(s)) return null;
  const isHeight = /\bheight\b|\baltitude\b|גובה/i.test(s);
  const isPerpFrom =
    /perpendicular|מאונך|אנך/i.test(s) && !/through|דרך/i.test(s) && /\bfrom\b|מ-/i.test(s);
  if (!isHeight && !isPerpFrom) return null;
  const apexM = s.match(/(?:\bfrom\s+|מ-?)([A-Za-z]\d*)\b/i);
  if (!apexM) return null;
  const apex = up(apexM[1]);
  const sideM = s.match(/(?:\bto\s+|אל\s*|ל-?)([A-Za-z]\d*)\s*([A-Za-z]\d*)\b/i); // explicit opposite side "to BC"
  let p: string, q: string;
  let tri: Id[] | null = null;
  if (sideM && up(sideM[1]) !== apex) {
    p = up(sideM[1]);
    q = up(sideM[2]);
  } else {
    const triPart = s.split(/\bin\b|במשולש|משולש/i).slice(1).join(' ') || s;
    tri = labelRun(triPart.replace(/triangle|the/gi, ' '), 3);
    if (!tri) return null;
    const others = tri.filter((x) => x !== apex);
    if (others.length !== 2) return null;
    [p, q] = others;
  }
  const f = freeLabel([apex, p, q], ['F', 'G', 'H', 'P']);
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
const bisectorPlacesPoint: Rule = (s) => {
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
    // "AD bisects ∠BAC": the segment's FIRST letter is the angle vertex → place D where the
    // bisector meets the opposite side (a new point).
    const [o1, o2] = tri.filter((t) => t !== vertex);
    if (o2 === undefined) return null;
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
    .replace(/[≅~∼∽]|ל-?|ו-?/g, ' ');
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
const RULES: Rule[] = [
  compoundSuchThat, // "<place a point> such that <condition>" — split + parse each half, before all else
  congruence, // "ABC ≅ DEF" — before the shape rules ("triangle ABC ≅ …" contains "triangle")
  similarity, // "ABC ~ DEF"
  semicircle, // "חצי מעגל" / "semicircle" — before `circle` (contains "מעגל") and the shape rules
  quarterCircle, // "רבע מעגל" / "quarter circle" — same
  incircle, // "circle inscribed in triangle ABC" — before inscribedPolygon (both match "inscribed")
  inscribedPolygon, // before the shape rules ("triangle ABC inscribed …" contains "triangle")
  // Special-line constructs whose Hebrew names a triangle ("…במשולש ABC") must
  // run before the shape rules, or `triangle` grabs the embedded משולש and stops.
  median,
  altitude, // "height/altitude from A" / "perpendicular from A to BC"
  perpBisector, // "perpendicular bisector of AB"
  square,
  parallelogram,
  rectangle,
  rhombus,
  trapezoid,
  quadrilateral,
  rightTriangle, // before `triangle` ("right triangle" contains "triangle")
  triangle,
  bisectorIntersection, // two bisectors meet — before the one-bisector and generic intersections
  bisectorSegmentIntersection, // one bisector ∩ a segment
  bisectorPlacesPoint, // "AD bisects ∠BAC" — places D on the opposite side (after the ∩ compounds)
  tangentLineIntersection, // tangent ∩ a segment
  parallelCircleIntersection, // a parallel line ∩ the circle
  circlesTangent, // two circles tangent to each other — before tangentLine (which would grab the משיק)
  secantFromExternal, // "from external point E a line cuts the circle at A,B" — before the generic intersections
  twoCirclesMeet, // "two circles intersect at A and B" — create both circles + both intersection points
  circleCircleIntersection, // two circles cross — before the generic line∩line intersection
  // A drawn perpendicular/parallel line that "cuts" another at a point must be claimed BEFORE the
  // generic line∩line rule: the "cuts"/"חותך" keyword otherwise makes lineLineIntersection 'stop'
  // (it can't read "ED ⟂ AB cuts it at C") and the whole parse aborts to the LLM — which then
  // models the foot as a second definition of C and over-constrains it. These only fire on a
  // perpendicular/parallel keyword + an explicit through-point, so a plain intersection falls through.
  perpendicularLine, // a *drawn* perpendicular line through a point (before the ⟂ constraint & line∩line)
  parallelLine, // a *drawn* parallel line through a point (before the ∥ constraint & line∩line)
  lineLineIntersection,
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
  diameter,
  chord,
  circumcircle, // "circle through A B C" — before the centre-based `circle`
  circle,
  foot, // before `pointOnSegment`
  pointOnExtension, // before `pointOnSegment` ("on … extension" must not read "ex" as labels)
  pointOnCircle, // "A on circle O" — before segment/pointOnSegment
  segment,
  pointOnSegment,
  measureOrder, // "α < β" — an inequality between two named measures (before setVar/numeric rules)
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
];

export function parse(raw: string, ctx: ParseContext = NO_CONTEXT): ParseResult {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, reason: 'not-handled' };
  for (const rule of RULES) {
    const commands = rule(s, ctx);
    if (commands === 'stop') break; // recognised but unreadable — escalate, don't half-parse
    if (commands) return { ok: true, commands };
  }
  return { ok: false, reason: 'not-handled' };
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
    s.match(/(?:rename|relabel|replace|swap)\s+([A-Za-z]\d*)\b(?:\s+(?:to|as|into|with|by|->|→|=))?\s+([A-Za-z]\d*)\b/i) ??
    s.match(/(?:שנה|החלף)\s*(?:שם\s*)?(?:את\s*)?([A-Za-z]\d*)\s*(?:ל-?|ב-?|עם|→|=)?\s*([A-Za-z]\d*)\b/i);
  if (!m) return null;
  const from = up(m[1]);
  const to = up(m[2]);
  return from === to ? null : { from, to };
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
