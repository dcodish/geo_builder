/**
 * THE «נתון:» LIST OF THE QUESTION EXPORT (#1872, [ADR-CX-067](../../docs/06d-decisions-complex.md#adr-cx-067)).
 *
 * «הורידו שאלה» puts the Gauss plane beside a numbered list of the givens, as a .docx — the shared composer
 * (`shell/export/questionDoc`) lays it out; this module decides which lines are printed.
 *
 * ## Givens only (operator ruling W6, 2026-10-08)
 *
 * Asked whether the claims the tool checks (✓/✗ in the relations section, «w מדומה טהור») belong in the
 * exported question, he chose **"Givens only"**. A claim is the student's ANSWER (`model/claim.ts`), and a
 * question sheet does not print its own answers. So a line whose whole content is a claim is left out;
 * every other active line prints AS TYPED, in entry order — complex has no canonical echo, and the fact
 * list shows the typed line too.
 *
 * A claim line is recognised by what the parser READ, never by its wording: `parseLineV2`'s channels are
 * classified below, exhaustively, so a channel added to `ParsedLine` does not typecheck until someone says
 * whether it is a given. A line that states a given AND a claim keeps its place — the given cannot be
 * printed without the sentence, and dropping a stated given is the one error this list must never make.
 * A real-parameter TYPE («a ממשי», ADR-CX-061) is a given (`realTyped`), although its row is also checked.
 *
 * A muted line is not printed: it was taken out of the figure (2-D's rule, ADR-251).
 *
 * Pure over the lines (no store, no DOM), so it is unit-tested in node through the real parser.
 */
import type { ParsedLine } from '../parser/rules';
import { parseLineV2 } from '../parser/rules';
import { complexScopeOf } from './deriveLines';

/** What each channel of a parsed line IS, for the question sheet. `meta` carries no statement of its own. */
const CHANNEL: Record<keyof ParsedLine, 'given' | 'claim' | 'meta'> = {
  constraints: 'given',
  filters: 'given',
  assertions: 'claim',
  objects: 'given',
  measures: 'given',
  queries: 'given', // a display request typed as a line (legacy files) — printed as the student wrote it
  ratios: 'given',
  exprQueries: 'given',
  argQueries: 'given',
  sequences: 'given',
  roots: 'given',
  selections: 'given',
  typed: 'given',
  realTyped: 'given',
  declares: 'meta', // the names a line brings in — a claim's subject is declared by the claim itself
  claims: 'meta', // the SPAN ranges the rule consumed, not the student's claims (see ParsedLine)
  atoms: 'meta',
};

const sizeOf = (v: unknown): number => (Array.isArray(v) ? v.length : v instanceof Map ? v.size : 0);

/** Does this parsed line state a claim and nothing else? */
function claimOnly(l: ParsedLine): boolean {
  const used = (Object.keys(CHANNEL) as (keyof ParsedLine)[]).filter((k) => sizeOf(l[k]) > 0);
  return used.some((k) => CHANNEL[k] === 'claim') && !used.some((k) => CHANNEL[k] === 'given');
}

/** The givens, in entry order, as the exported question prints them. */
export function questionLines(lines: readonly string[], disabled: readonly number[]): string[] {
  const active = lines.filter((_, i) => !disabled.includes(i));
  // The figure's own reading of a declared letter (#1405), as the submit path parses a line.
  const scope = new Set(complexScopeOf(active).keys());
  return active
    .filter((raw) => {
      const scoped = parseLineV2(raw, scope);
      const r = scoped.ok ? scoped : parseLineV2(raw);
      return !(r.ok && claimOnly(r.line));
    })
    .map((raw) => raw.trim())
    .filter((s) => s.length > 0);
}
