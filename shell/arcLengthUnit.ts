/**
 * AN ARC'S VALUE WITH A LENGTH UNIT, ONCE ([ADR-789](../docs/06-decisions.md#adr-789), #2032) — «קשת AB = 4 ס"מ».
 *
 * The operator, 2026-11-02 ([ADR-W-175](../docs/06w-decisions-workspace.md#adr-w-175)): *"An arc is in degrees, unless
 * specifically says something about the length of an arc. So if no units are given an arc is degrees."* A stated length
 * unit says exactly that, so the line is the arc's length, the reading of «אורך הקשת AB הוא 4». Each builder strips a unit
 * at its own boundary because a unit is noise on any other value, which is how this line read as 4°. So this reads the
 * line BEFORE that strip. 2-D rewrites it to the length sentence; analytic refuses it until its reader lands (#2710).
 *
 * The unit words are the session's list (delegated, recorded with `judgments.mjs chose`). Metre, centimetre and millimetre
 * words, «יחידות» and "units". Not the one-letter «מ'» and "m": «4m» is a coefficient. A degree word is not here.
 *
 * Here because two builders need one list, and it knows no product and returns no strings.
 */
const LINE = /^(?:נתון\s+(?:כי\s+)?)?(?:ה?קשת|[⌢⏜]|[Aa]rcs?)\s*\{?\s*([A-Z]\d*'?)\s*([A-Z]\d*'?)\s*\}?\s*(?:=|(?<![א-ת])(?:הוא|היא)(?![א-ת])|(?<![א-ת])שווה\s*ל-?|\bis\b)\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:π|pi\b)?)\s*(?:יחידות(?:\s+אורך)?|יחידה|יח['׳]|ס["״]?מ|סמ['׳]|מ["״]מ|סנטימטרים|סנטימטר|מילימטרים|מילימטר|מטרים|מטר|units?|cm|mm|(?:centi|milli)?met(?:er|re)s?)(?![א-תA-Za-z])(?:\s*(?:ב-?ה?מעגל|של\s+ה?מעגל|in\s+circle|circle)\s+[A-Z]\d*'?)?\s*\.?$/;

export interface ArcUnitValue {
  /** the arc's two letters, as typed */
  readonly a: string;
  readonly b: string;
  /** the value with its unit taken off */
  readonly value: string;
}

/** The arc and value of a line that gives one arc a length unit; `null` for every other line. */
export function readArcUnitValue(line: string): ArcUnitValue | null {
  const m = LINE.exec(line.trim());
  return m ? { a: m[1], b: m[2], value: m[3].trim() } : null;
}
