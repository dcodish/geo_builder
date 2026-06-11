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
 * Point labels are single Latin capitals (geometry convention, including inside
 * Hebrew text). Keywords are bilingual; the same rule matches either language.
 */

import type { Command, Id } from '@/engine';

export type ParseResult =
  | { ok: true; commands: Command[] }
  | { ok: false; reason: 'not-handled' };

/**
 * 'stop' = the rule recognised its keyword but could not read the sentence:
 * abort the whole parse (→ not-handled, the fallback boundary) instead of
 * letting a weaker rule half-parse the utterance. A half-parse that silently
 * drops part of a fact is worse than a miss — it draws a wrong figure.
 */
type Rule = (s: string) => Command[] | null | 'stop';

const up = (c: string): Id => c.toUpperCase();
const num = String.raw`(-?\d+(?:\.\d+)?)`;

/** Deterministic circle id from its centre letter — so "circle O" is referenceable by name. */
const circleId = (center: string): Id => `circle-${center.toUpperCase()}`;
/** The centre letter of a circle named in `s` ("circle O" / "מעגל O" / "centered at O" / "שמרכזו O"). */
const circleCenter = (s: string): string | null => {
  const m =
    s.match(/(?:cent\w*\s+(?:at\s+)?|שמרכזו\s*|מרכזו\s*|סביב\s+)([A-Za-z])\b/i) ??
    s.match(/(?:circle|מעגל)\s+([A-Za-z])\b/i);
  return m ? m[1] : null;
};
/** Remove a "circle X" / "מעגל X" mention so its centre letter isn't read as a figure label. */
const dropCircleRef = (s: string): string => s.replace(/(?:circle|מעגל)\s+[A-Za-z]\b/gi, ' ');

/**
 * English filler words, lowercase only — typed fillers are lowercase, while
 * uppercase pairs like "ON" must stay readable as point labels (O, N).
 */
const FILLER = /\b(?:to|the|and|of|is|are|at|on|in|with|from|that|so|such)\b/g;

/**
 * Find a run of `n` point labels, as a contiguous token ("ABCD") or `n`
 * space-separated single letters ("A B C D"), anywhere in `s`. Returns them
 * uppercased, or null. Strip keywords from `s` first so a Latin keyword's own
 * letters (e.g. "square") aren't mistaken for labels; lowercase filler words
 * are stripped here so "connect A to B" can't read "to" as the labels T,O.
 */
function labelRun(s: string, n: number): Id[] | null {
  const t = s.replace(FILLER, ' ');
  const contiguous = t.match(new RegExp(String.raw`\b[A-Za-z]{${n}}\b`));
  if (contiguous) return contiguous[0].toUpperCase().split('') as Id[];
  const spaced = t.match(new RegExp(Array.from({ length: n }, () => String.raw`\b([A-Za-z])\b`).join(String.raw`\s+`)));
  if (spaced) return spaced.slice(1, n + 1).map(up);
  return null;
}

/** A quad-shape rule factory: keyword (either order) + 4 labels → command. */
const quadShape =
  (re: RegExp, make: (ids: [Id, Id, Id, Id]) => Command): Rule =>
  (s) => {
    if (!re.test(s)) return null;
    const ids = labelRun(s.replace(re, ' '), 4);
    return ids ? [make([ids[0], ids[1], ids[2], ids[3]])] : null;
  };

/** A triangle rule factory: keyword (either order) + 3 labels → command. */
const triShape =
  (re: RegExp, make: (ids: [Id, Id, Id]) => Command): Rule =>
  (s) => {
    if (!re.test(s)) return null;
    const ids = labelRun(s.replace(re, ' '), 3);
    return ids ? [make([ids[0], ids[1], ids[2]])] : null;
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
const INTERSECT_KW = /intersect|∩|חיתוך|נחתך|נחתכ|נפגש|\bmeets?\b/i;
const lineLineIntersection: Rule = (s) => {
  if (!INTERSECT_KW.test(s)) return null;
  // Drop filler words so they aren't mistaken for two-letter line labels ("of"!).
  const t = s.replace(/\b(?:is|the|of|between|at|point|הוא|בין|בנקודה|נקודה)\b/gi, ' ');
  const pointFirst = t.match(
    /\b([A-Za-z])\b.*?(?:intersection|∩|חיתוך|נחתך).*?\b([A-Za-z])\s*([A-Za-z])\b.*?\b([A-Za-z])\s*([A-Za-z])\b/i,
  );
  if (pointFirst) {
    const m = pointFirst;
    return [{ type: 'line-line-intersection', id: up(m[1]), a: up(m[2]), b: up(m[3]), c: up(m[4]), d: up(m[5]) }];
  }
  const linesFirst = t.match(
    /\b([A-Za-z])\s*([A-Za-z])\b.*?\b([A-Za-z])\s*([A-Za-z])\b.*?(?:intersect\w*|∩|חיתוך|נחתך|נחתכ|נפגש|meets?).*?\b([A-Za-z])\b/i,
  );
  if (linesFirst) {
    const m = linesFirst;
    return [{ type: 'line-line-intersection', id: up(m[5]), a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]) }];
  }
  return 'stop';
};

/** "right triangle ABC" / "משולש ישר-זווית ABC" — right angle at the last named vertex. */
const rightTriangle: Rule = (s) => {
  if (!/right[\s-]?(?:angled\s+)?triangle|ישר[\s-]?זווית/i.test(s)) return null;
  const cleaned = s.replace(/right[\s-]?angled|right[\s-]?angle|right|triangle|משולש|ישר[\s-]?זווית|זווית|ישרה/gi, ' ');
  const ids = labelRun(cleaned, 3);
  return ids ? [{ type: 'right-triangle', ids: [ids[0], ids[1], ids[2]] }] : null;
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
    /bisectors?|angles?|intersection|intersect\w*|meets?|points?|of|the|is|are|and|זווית|הזוויות|חוצי|חוצה|חוצ|חיתוך|נחתכים|נקודת|המפגש|מפגש|נפגשים|של|הם|בנקודה/gi;
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
    new RegExp(String.raw`([A-Za-z])\b.*?\bfoot\b.*?from\s+([A-Za-z])\b.*?to\s+([A-Za-z])\s*([A-Za-z])\b`, 'i'),
  );
  const he = s.match(
    new RegExp(String.raw`([A-Za-z])\b.*?רגל.*?(?:מהנקודה\s*|מ-?\s*)([A-Za-z])\b.*?(?:אל\s*|ל-?\s*)([A-Za-z])\s*([A-Za-z])\b`),
  );
  const m = en ?? he;
  return m ? [{ type: 'foot', id: up(m[1]), from: up(m[2]), a: up(m[3]), b: up(m[4]) }] : null;
};

/** "M is the midpoint of AB" / "M אמצע AB". */
const midpoint: Rule = (s) => {
  if (!/midpoint|אמצע/i.test(s)) return null;
  const m = s.match(new RegExp(String.raw`([A-Za-z])\b.*?(?:midpoint|אמצע).*?\b([A-Za-z])\s*([A-Za-z])\b`, 'i'));
  return m ? [{ type: 'midpoint', id: up(m[1]), a: up(m[2]), b: up(m[3]) }] : null;
};

/** "F on the extension of AD" / "F על המשך AD" — a point on the ray beyond the far end (t > 1). */
const pointOnExtension: Rule = (s) => {
  if (!/extension|המשך/i.test(s)) return null;
  const m = s.match(
    new RegExp(String.raw`(?:point\s+|נקודה\s+)?([A-Za-z])\b.*?(?:extension|המשך).*?\b([A-Za-z])\s*([A-Za-z])\b`, 'i'),
  );
  return m ? [{ type: 'point-on-segment', id: up(m[1]), a: up(m[2]), b: up(m[3]), t: 1.3 }] : null;
};

/** "angle GAB = 37" / "זווית GAB = 37" (any order) — middle letter is the vertex. */
const angle: Rule = (s) => {
  if (!/(?:angle|זווית)/i.test(s)) return null;
  const stripped = s.replace(/angle|זווית/gi, ' ');
  const ids = labelRun(stripped, 3);
  const valM = stripped.match(new RegExp(num));
  if (!ids || !valM) return null;
  return [{ type: 'set-angle', vertex: ids[1], ray1: ids[0], ray2: ids[2], value: parseFloat(valM[1]) }];
};

/**
 * "point G on AD" / "נקודה G על AD" with optional ratio "at 40%" / "ב-40%".
 * The segment labels are word-bounded so "F on the extension of AD" can't read
 * "th" of "the" as a segment — that phrasing escapes to the fallback instead.
 */
const pointOnSegment: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:point\s+|נקודה\s+)?([A-Za-z])\s+(?:on|על)\s+([A-Za-z])\s*([A-Za-z])\b(?:\s+(?:at|ב-?)?\s*${num}\s*(%)?)?`,
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
      String.raw`(?:point\s+)?([A-Za-z])\s+(?:is\s+)?${num}\s+from\s+([A-Za-z])\s+and\s+${num}\s+from\s+([A-Za-z])`,
      'i',
    ),
  );
  const he = s.match(
    new RegExp(
      String.raw`(?:נקודה\s+)?([A-Za-z])\s+במרחק\s+${num}\s+מ-?\s*([A-Za-z])\s+ו-?\s*${num}\s+מ-?\s*([A-Za-z])`,
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

/** "AB = CD" — two segments equal in length. */
const equalSegments: Rule = (s) => {
  const m = s.match(/\b([A-Za-z])\s*([A-Za-z])\b\s*=\s*\b([A-Za-z])\s*([A-Za-z])\b/);
  return m ? [{ type: 'set-equal', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]) }] : null;
};

/** "AB = 6" — fix a segment's length. */
const distanceConstraint: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`\b([A-Za-z])\s*([A-Za-z])\b\s*=\s*${num}\b`));
  return m ? [{ type: 'set-distance', a: up(m[1]), b: up(m[2]), value: parseFloat(m[3]) }] : null;
};

/** "AB parallel to CD" / "AB ∥ CD" / "AB מקביל ל-CD". */
const parallelConstraint: Rule = (s) => {
  if (!/parallel|∥|מקביל/i.test(s)) return null;
  // strip the keyword AND filler words (so "to"/"of" aren't read as 2-letter labels)
  const t = s.replace(/parallel(?:\s*to)?|∥|מקביל(?:\s*ל-?)?/gi, ' ').replace(FILLER, ' ');
  const m = t.match(/\b([A-Za-z])\s*([A-Za-z])\b.*?\b([A-Za-z])\s*([A-Za-z])\b/);
  return m ? [{ type: 'set-parallel', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]) }] : null;
};

/** "AB perpendicular to CD" / "AB ⊥ CD" / "AB מאונך ל-CD" — two *named* segments (not the foot phrasing). */
const perpendicularConstraint: Rule = (s) => {
  if (!/perpendicular|⊥|מאונך/i.test(s)) return null;
  const t = s.replace(/perpendicular(?:\s*to)?|⊥|מאונך(?:\s*ל-?)?/gi, ' ').replace(FILLER, ' ');
  if ((t.match(/\b[A-Za-z]\s*[A-Za-z]\b/g) ?? []).length < 2) return null; // "perpendicular from A to BC" is the foot, not this
  const m = t.match(/\b([A-Za-z])\s*([A-Za-z])\b.*?\b([A-Za-z])\s*([A-Za-z])\b/);
  return m ? [{ type: 'set-perpendicular', a: up(m[1]), b: up(m[2]), c: up(m[3]), d: up(m[4]) }] : null;
};

/** "point A at (0,0)" / "נקודה A ב-(0,0)" / "A = (3, 4)" */
const freePoint: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:point\s+|נקודה\s+|place\s+)?([A-Za-z])\s*(?:at|ב-?|=)\s*\(?\s*${num}\s*,\s*${num}\s*\)?`,
      'i',
    ),
  );
  if (!m) return null;
  return [{ type: 'free-point', id: up(m[1]), x: parseFloat(m[2]), y: parseFloat(m[3]) }];
};

// ── Phase 5c — circles ──────────────────────────────────────────────────────

/** "circle centered at O radius 5" / "circle O radius 5" / "מעגל שמרכזו O רדיוסו 5". */
const circle: Rule = (s) => {
  if (!/circle|מעגל/i.test(s)) return null;
  const rM = s.match(new RegExp(String.raw`(?:radius|רדיוס\S*)\s*${num}`, 'i'));
  const thrM = s.match(/(?:through|העובר\s*דרך|דרך)\s+([A-Za-z])\b/i);
  const centered = /cent(?:er|re)d?|מרכז\w*|סביב/i.test(s);
  if (!rM && !thrM && !centered) return null; // a bare "circle O" reference, not a definition
  const center = circleCenter(s);
  if (!center) return null;
  if (thrM && !rM) return [{ type: 'circle-through', id: circleId(center), center: up(center), through: up(thrM[1]) }];
  return [{ type: 'circle', id: circleId(center), center: up(center), radius: rM ? parseFloat(rM[1]) : 5 }];
};

/** "triangle ABC inscribed in circle O radius 5" / "המשולש ABC חסום במעגל שמרכזו O" — circle + on-circle vertices + polygon. */
const inscribedPolygon: Rule = (s) => {
  if (!/inscribed|חסום/i.test(s)) return null;
  const isTri = /triangle|משולש/i.test(s);
  const isQuad = /quad|מרובע/i.test(s);
  if (!isTri && !isQuad) return null;
  const center = circleCenter(s);
  if (!center) return null;
  const rM = s.match(new RegExp(String.raw`(?:radius|רדיוס\S*)\s*${num}`, 'i'));
  const n = isTri ? 3 : 4;
  // strip keywords + the circle reference + the centre letter, then read the n vertex labels
  const rest = dropCircleRef(s)
    .replace(new RegExp(String.raw`\b${center}\b`, 'gi'), ' ')
    .replace(/triangle|משולש|quad\w*|מרובע|inscribed|חסום|circle|מעגל|cent\w*|radius|רדיוס\w*|שמרכזו|מרכזו|העובר|דרך/gi, ' ');
  const ids = labelRun(rest, n);
  if (!ids) return null;
  const circ = circleId(center);
  const cmds: Command[] = [{ type: 'circle', id: circ, center: up(center), radius: rM ? parseFloat(rM[1]) : 5 }];
  for (const id of ids) cmds.push({ type: 'point-on-circle', id, circle: circ });
  cmds.push(isTri ? { type: 'triangle', ids: [ids[0], ids[1], ids[2]] } : { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] });
  return cmds;
};

/** "chord AB in circle O" / "מיתר AB במעגל O" — both endpoints on the circle + the segment. */
const chord: Rule = (s) => {
  if (!/chord|מיתר/i.test(s)) return null;
  const center = circleCenter(s);
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
const diameter: Rule = (s) => {
  if (!/diameter|קוטר/i.test(s)) return null;
  const center = circleCenter(s);
  if (!center) return null;
  const ids = labelRun(dropCircleRef(s).replace(/diameter|קוטר/gi, ' '), 2);
  if (!ids) return null;
  return [{ type: 'diameter', id1: ids[0], id2: ids[1], circle: circleId(center) }];
};

/** "M is the midpoint of arc BC in circle O" / "M אמצע הקשת BC במעגל O". */
const arcMidpoint: Rule = (s) => {
  if (!/arc|קשת/i.test(s)) return null;
  const center = circleCenter(s);
  if (!center) return null;
  const m = dropCircleRef(s).match(/([A-Za-z])\b.*?(?:midpoint|אמצע).*?(?:arc|הקשת|קשת)\s*([A-Za-z])\s*([A-Za-z])\b/i);
  if (!m) return null;
  return [{ type: 'arc-midpoint', id: up(m[1]), circle: circleId(center), from: up(m[2]), to: up(m[3]) }];
};

/** "A is on circle O" / "A על מעגל O" — a single inscribed point. */
const pointOnCircle: Rule = (s) => {
  if (!/circle|מעגל/i.test(s)) return null;
  const m = s.match(/([A-Za-z])\b.*?(?:on|על).*?(?:circle|מעגל)\s+([A-Za-z])\b/i);
  if (!m) return null;
  return [{ type: 'point-on-circle', id: up(m[1]), circle: circleId(m[2]) }];
};

/** "E is the intersection of the tangent to circle O at D and AB" — tangent line ∩ a segment line. */
const tangentLineIntersection: Rule = (s) => {
  if (!/tangent|משיק/i.test(s)) return null;
  const center = circleCenter(s);
  const atM = s.match(/(?:\bat\b|בנקודה|ב-?)\s*([A-Za-z])\b/i);
  const pairM = s.match(/(?:and|with|עם|ו-?)\s*([A-Za-z])\s*([A-Za-z])\b/i);
  if (!center || !atM || !pairM) return null;
  const at = up(atM[1]);
  const resM = dropCircleRef(s).replace(/tangent|משיק|\bat\s+[A-Za-z]\b|בנקודה\s*[A-Za-z]\b/gi, ' ').match(/([A-Za-z])\b/);
  if (!resM) return null;
  const tanId = `tan-${at}`;
  const abId = `line-${up(pairM[1])}${up(pairM[2])}`;
  return [
    { type: 'tangent', id: tanId, circle: circleId(center), at },
    { type: 'line-through', id: abId, a: up(pairM[1]), b: up(pairM[2]) },
    { type: 'line-intersection', id: up(resM[1]), line1: tanId, line2: abId },
  ];
};

/** "F is the intersection of the bisector of angle ADB and AB" — one bisector ∩ a segment line. */
const bisectorSegmentIntersection: Rule = (s) => {
  if (!BISECTOR_KW.test(s)) return null;
  if (!(INTERSECT_KW.test(s) || /מפגש|נפגש/.test(s))) return null;
  const stripped = s
    .replace(/bisectors?|angles?|of|the|is|are|and|with|זווית|הזוויות|חוצי|חוצה|חוצ|intersection|intersect\w*|meets?|עם|חיתוך|נחתך\w*|נקודת|המפגש|של/gi, ' ')
    .replace(/-/g, ' ');
  const labels = stripped.match(/\b[A-Za-z]{1,3}\b/g) ?? [];
  const point = labels.find((l) => l.length === 1);
  const triple = labels.find((l) => l.length === 3);
  const pair = labels.find((l) => l.length === 2);
  if (!point || !triple || !pair) return null; // two triples ⇒ the two-bisector meet handles it
  const t = triple.toUpperCase();
  const pr = pair.toUpperCase();
  return [
    { type: 'bisector', id: `bis-${t}`, vertex: t[1], p: t[0], q: t[2] },
    { type: 'line-through', id: `line-${pr}`, a: pr[0], b: pr[1] },
    { type: 'line-intersection', id: up(point), line1: `bis-${t}`, line2: `line-${pr}` },
  ];
};

/** "G is where the line through F parallel to AB meets circle O" — a parallel line ∩ the circle. */
const parallelCircleIntersection: Rule = (s) => {
  if (!/parallel|מקביל/i.test(s) || !/circle|מעגל/i.test(s)) return null;
  const center = circleCenter(s);
  const throughM = s.match(/(?:through|דרך)\s+([A-Za-z])\b/i);
  const toM = s.match(/(?:parallel\s+to|מקביל\s*ל-?)\s*([A-Za-z])\s*([A-Za-z])\b/i);
  if (!center || !throughM || !toM) return null;
  const resM = dropCircleRef(s).replace(/through\s+[A-Za-z]\b|דרך\s+[A-Za-z]\b/gi, ' ').match(/([A-Za-z])\b/);
  if (!resM) return null;
  const through = up(throughM[1]);
  const a = up(toM[1]);
  const b = up(toM[2]);
  const lineId = `par-${through}-${a}${b}`;
  return [
    { type: 'parallel-line', id: lineId, through, a, b },
    { type: 'line-circle-intersection', id: up(resM[1]), line: lineId, circle: circleId(center), branch: 0 },
  ];
};

// Order matters: the most specific keyword-anchored rules run first; the
// coordinate rule (freePoint) is last because it's the loosest.
const RULES: Rule[] = [
  inscribedPolygon, // before the shape rules ("triangle ABC inscribed …" contains "triangle")
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
  tangentLineIntersection, // tangent ∩ a segment
  parallelCircleIntersection, // a parallel line ∩ the circle
  lineLineIntersection,
  angle,
  parallelConstraint, // ∥ / ⟂ constraints (keyword-anchored) — before the loose "XY = …" rules
  perpendicularConstraint,
  arcMidpoint, // circle constructs (own keywords) before the generic point rules
  diameter,
  chord,
  circle,
  foot, // before `pointOnSegment`
  midpoint,
  pointOnExtension, // before `pointOnSegment` ("on … extension" must not read "ex" as labels)
  pointOnCircle, // "A on circle O" — before segment/pointOnSegment
  segment,
  pointOnSegment,
  equalSegments, // "AB = CD" — before distance (numeric RHS) and freePoint (coord RHS)
  distanceConstraint, // "AB = 6"
  pointByDistances,
  freePoint,
];

export function parse(raw: string): ParseResult {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, reason: 'not-handled' };
  for (const rule of RULES) {
    const commands = rule(s);
    if (commands === 'stop') break; // recognised but unreadable — escalate, don't half-parse
    if (commands) return { ok: true, commands };
  }
  return { ok: false, reason: 'not-handled' };
}
