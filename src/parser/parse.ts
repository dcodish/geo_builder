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

type Rule = (s: string) => Command[] | null;

const up = (c: string): Id => c.toUpperCase();
const num = String.raw`(-?\d+(?:\.\d+)?)`;

/**
 * Find a run of `n` point labels, as a contiguous token ("ABCD") or `n`
 * space-separated single letters ("A B C D"), anywhere in `s`. Returns them
 * uppercased, or null. Strip keywords from `s` first so a Latin keyword's own
 * letters (e.g. "square") aren't mistaken for labels.
 */
function labelRun(s: string, n: number): Id[] | null {
  const contiguous = s.match(new RegExp(String.raw`\b[A-Za-z]{${n}}\b`));
  if (contiguous) return contiguous[0].toUpperCase().split('') as Id[];
  const spaced = s.match(new RegExp(Array.from({ length: n }, () => String.raw`\b([A-Za-z])\b`).join(String.raw`\s+`)));
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

/** "square ABCD" / "ריבוע ABCD" — keyword and labels in either order. */
const square = quadShape(/square|ריבוע/gi, (ids) => ({ type: 'square', ids }));

/** "parallelogram ABCD" / "מקבילית ABCD" — A,B,C free, D derived. */
const parallelogram = quadShape(/parallelogram|מקבילית/gi, (ids) => ({ type: 'parallelogram', ids }));

/** "quadrilateral ABCD" / "מרובע ABCD" — a general quad (4 free vertices). */
const quadrilateral = quadShape(/quadrilateral|quad|מרובע/gi, (ids) => ({ type: 'quadrilateral', ids }));

/** "segment AC" / "diagonal AC" / "קטע AC" / "אלכסון AC" — connect two points. */
const segment: Rule = (s) => {
  if (!/segment|diagonal|connect|קטע|אלכסון|חבר/i.test(s)) return null;
  const ids = labelRun(s.replace(/segment|diagonal|connect|קטע|אלכסון|חבר/gi, ' '), 2);
  return ids ? [{ type: 'segment', a: ids[0], b: ids[1] }] : null;
};

/** "E is the intersection of AC and BD" / "E = AC ∩ BD" / "E חיתוך AC ו-BD". */
const lineLineIntersection: Rule = (s) => {
  if (!/intersection|∩|חיתוך|נחתך/i.test(s)) return null;
  // Drop filler words so they aren't mistaken for two-letter line labels ("of"!).
  const t = s.replace(/\b(?:is|the|of|between|הוא|בין)\b/gi, ' ');
  const m = t.match(
    /\b([A-Za-z])\b.*?(?:intersection|∩|חיתוך|נחתך).*?\b([A-Za-z])\s*([A-Za-z])\b.*?\b([A-Za-z])\s*([A-Za-z])\b/i,
  );
  if (!m) return null;
  return [{ type: 'line-line-intersection', id: up(m[1]), a: up(m[2]), b: up(m[3]), c: up(m[4]), d: up(m[5]) }];
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

/** "point G on AD" / "נקודה G על AD" with optional ratio "at 40%" / "ב-40%". */
const pointOnSegment: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:point\s+|נקודה\s+)?([A-Za-z])\s+(?:on|על)\s+([A-Za-z])\s*([A-Za-z])(?:\s+(?:at|ב-?)?\s*${num}\s*(%)?)?`,
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
  quadrilateral,
  lineLineIntersection,
  angle,
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
    if (commands) return { ok: true, commands };
  }
  return { ok: false, reason: 'not-handled' };
}
