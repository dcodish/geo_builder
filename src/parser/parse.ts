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

/** "square ABCD" / "ריבוע ABCD" */
const square: Rule = (s) => {
  const m = s.match(/(?:square|ריבוע)\s+([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])\b/i);
  if (!m) return null;
  return [{ type: 'square', ids: [up(m[1]), up(m[2]), up(m[3]), up(m[4])] }];
};

/** "angle GAB = 37" / "זווית GAB = 37" — middle letter is the vertex. */
const angle: Rule = (s) => {
  const m = s.match(
    new RegExp(
      String.raw`(?:angle|זווית)\s+([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])\s*(?:=|:|is|equals|שווה|ל-?|של)?\s*${num}\s*(?:°|deg|degrees|מעלות)?`,
      'i',
    ),
  );
  if (!m) return null;
  return [{ type: 'set-angle', vertex: up(m[2]), ray1: up(m[1]), ray2: up(m[3]), value: parseFloat(m[4]) }];
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
const RULES: Rule[] = [square, angle, pointOnSegment, pointByDistances, freePoint];

export function parse(raw: string): ParseResult {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, reason: 'not-handled' };
  for (const rule of RULES) {
    const commands = rule(s);
    if (commands) return { ok: true, commands };
  }
  return { ok: false, reason: 'not-handled' };
}
