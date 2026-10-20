/**
 * #2427 ([ADR-AG-325](../../docs/06c-decisions-analytic.md#adr-ag-325)) — A CAPITAL LETTER USED AS A SIZE.
 *
 * In this tool a capital Latin letter is a point's name; a size (a radius, a length, an angle, a parameter in an
 * equation or a coordinate) is a lowercase letter, with the one exception R for a radius (`RADIUS_CAPITALS`,
 * ADR-AG-307). Operator, on the #2414 play sheet: *"Need a message to user saying that sizes are small letters
 * except for R"*; ruling 2026-10-20 on #2427: the wording, the corrected sentence, and the capitals the grammar
 * still accepted («M(K,0)», «K הוא פרמטר חיובי», «שיפוע AB הוא M») refused the same way — **S for an area stays**
 * (and so does any capital area label, as before: the ruling refused the three families it named, and kept the area).
 *
 * Two readings of one question, both asked at the submit decision because both need the figure (a capital that is
 * already a POINT of the figure is the student naming that point, and is left exactly as it was):
 *
 * - {@link capitalSizeRetry} — a line no rule read. Each value reader DECLINES a capital (`not-handled`), which is
 *   the one code that reaches the model. 2-D's `input.scope.lowercase-labels` is the template: read the line again
 *   with the case corrected; when that reading parses AND uses the lowercased letter as a symbol, the tool
 *   understood the sentence and disagrees with its letter, so the refusal is OWNED and never reaches the model.
 * - {@link capitalParamOf} — a line the grammar read with a capital as a parameter (coordinates, a declaration, a
 *   slope): asked of the parameter REGISTER (`carriers.ts`, #1014 — a symbol is a parameter because it is used),
 *   so every family is covered without a reader-by-reader list. A capital the figure already registered (a saved
 *   session) is not new and is not refused.
 */
import { parseLine } from '../parser/parseAnalytic';
import { RADIUS_CAPITALS, paramRegister } from '../engine/carriers';
import type { Construction, Fact } from '../engine/types';

/** What the refusal carries: the letter, and the student's line with that letter lowercased. */
export interface CapitalSize {
  letter: string;
  corrected: string;
}

/**
 * A capital standing ALONE — no Latin letter before it, no capital after it («AB» is a segment), and no index, prime
 * or subscript after it (those make a point's name: «K1», «K'», «K₁»). A digit before it is a coefficient («2K»), and
 * a lowercase letter after it is juxtaposition («Kx»).
 */
const LONE_CAPITAL = /(?<![A-Za-z])[A-Z](?![A-Z0-9₀-₉_'׳′])/g;

/** The distinct lone capitals of `line`, in order of appearance. */
const loneCapitals = (line: string): string[] => [...new Set(line.match(LONE_CAPITAL) ?? [])];

/** `line` with every lone occurrence of `letter` lowercased — the corrected sentence the refusal teaches. */
export const lowerLone = (line: string, letter: string): string =>
  line.replace(LONE_CAPITAL, (c) => (c === letter ? c.toLowerCase() : c));

/** Does any fact read `sym` as a symbol — an expression's `sym` node or a declaration's `sym`? */
function usesSymbol(node: unknown, sym: string): boolean {
  if (Array.isArray(node)) return node.some((n) => usesSymbol(n, sym));
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  if (o.kind === 'sym' && o.name === sym) return true;
  if (o.sym === sym) return true;
  return Object.values(o).some((v) => usesSymbol(v, sym));
}

/** Does the fact state an AREA — the one place a capital stays a size (the 2026-10-20 ruling keeps «S»)? */
function statesArea(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(statesArea);
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  // an area constraint («שטח המשולש ABC הוא S»), or an area term of a length equation («נסמן את שטח ABCD ב-S»)
  return o.t === 'area' || o.kind === 'area' || Object.values(o).some(statesArea);
}

/**
 * The capitals that may be a size: R everywhere (ADR-AG-307), and an AREA's label — the ruling keeps «S» for an area
 * (2-D's grammar labels an area with a capital too, «שטח ABC = S»); a letter is exempt only inside the fact that states
 * the area, so «M(K,0)» beside it is still asked.
 */
const mayBeSize = (letter: string, facts: readonly Fact[]): boolean =>
  RADIUS_CAPITALS.has(letter) || facts.some((f) => statesArea(f) && usesSymbol(f, letter));

/**
 * A line no rule read (`not-handled`): the first lone capital — not R, not a point of the figure — whose lowercase
 * makes the line parse with that letter as a symbol. `null` when no such letter exists: the line stays not-handled.
 */
export function capitalSizeRetry(line: string, figureLabels: readonly string[]): CapitalSize | null {
  for (const letter of loneCapitals(line)) {
    if (RADIUS_CAPITALS.has(letter) || figureLabels.includes(letter)) continue;
    const corrected = lowerLone(line, letter);
    const p = parseLine(corrected);
    if (p.ok && usesSymbol(p.facts, letter.toLowerCase())) return { letter, corrected };
  }
  return null;
}

/** Every symbol the construction's register holds. */
const registered = (c: Construction): Set<string> => new Set(paramRegister(c).map((p) => p.sym));

/**
 * A line the grammar read: the first capital it ADDED to the parameter register — not R, not an area's label, not a
 * point of the figure — whose corrected line still parses. `null` when the line added none.
 */
export function capitalParamOf(
  line: string,
  facts: readonly Fact[],
  before: Construction,
  after: Construction,
  figureLabels: readonly string[],
): CapitalSize | null {
  const had = registered(before);
  for (const sym of registered(after)) {
    if (!/^[A-Z]$/.test(sym) || had.has(sym) || figureLabels.includes(sym) || mayBeSize(sym, facts)) continue;
    const corrected = lowerLone(line, sym);
    if (corrected !== line && parseLine(corrected).ok) return { letter: sym, corrected };
  }
  return null;
}

/** A cheap gate before any fold: could `line` hold a capital size at all? */
export const mayHoldCapitalSize = (line: string): boolean => loneCapitals(line).some((c) => !RADIUS_CAPITALS.has(c));
