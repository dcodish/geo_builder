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

// Order matters: the most specific keyword-anchored rules run first; the
// coordinate rule (freePoint) is last because it's the loosest.
const RULES: Rule[] = [
  square,
  parallelogram,
  rectangle,
  rhombus,
  trapezoid,
  quadrilateral,
  rightTriangle, // before `triangle` ("right triangle" contains "triangle")
  triangle,
  bisectorIntersection, // before `lineLineIntersection`/`angle` (shares their keywords)
  lineLineIntersection,
  angle,
  foot, // before `pointOnSegment`
  midpoint,
  pointOnExtension, // before `pointOnSegment` ("on … extension" must not read "ex" as labels)
  segment,
  pointOnSegment,
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
