/**
 * #2198 ([ADR-678](../../docs/06-decisions.md#adr-678)) — A NUMBER THE READING NEVER READ.
 *
 * The number sibling of #1888's label member (`unreadParts`) and #1904's word member (`unreadRoles`), over the same
 * shell module (`shell/readExtent.ts`, the number class), in the same battery, so both 2-D commit seams have it.
 *
 * WHAT WENT WRONG. The number gate (`droppedGivenNumbers`, ADR-250) accounts a stated number by VALUE: it is kept
 * when some command carries the same value. So a value the rule wrote for another reason paid for it. «שני מעגלים
 * משיקים ברדיוסים שווים ל-1» lowers to the tangency and `set-radius-ratio k: 1` — the «1» is the encoding of «שווים»,
 * and the stated 1 was dropped green. ADR-677 stops the accountant counting SEEDS (a default radius, a marker
 * offset, an apex's starting x); a structural constant like this k is not a seed, and no field predicate can
 * foresee every such collision.
 *
 * THE CHECK. Each number the student stated (the gate's own scanner: counts and name indices are not stated
 * numbers) is replaced by a same-kind value that is not in the line, and the line is read again in the seam's own
 * context. An occurrence the lowering does not depend on was not read. Its value joins the gate's dropped numbers,
 * so the line gets exactly the verdict the same line with a number no command carries gets (escalate).
 *
 * The model's lowering cannot be re-read, so the LLM lane keeps ADR-677's accountant alone.
 */
import { parse, statedNumberOccurrences } from '@/parser';
import type { ParseContext } from '@/parser';
import type { AnyCommand } from '@/engine';
import { readNumbers, type Reader } from '../../shell/readExtent';
import { loweringKey } from './unreadParts';

/** 2-D's reader in a context: the lowering key of a successful parse, null otherwise. */
const readerIn = (ctx: ParseContext): Reader<string> => ({
  read: (text) => {
    const r = parse(text, ctx);
    return r.ok && r.commands.length > 0 ? loweringKey(r.commands) : null;
  },
  same: (a, b) => a === b,
});

/**
 * The member: the stated numbers no reading depends on, as values (the number gate's own currency), in the order
 * typed. Empty when the reading reads every number the student typed. `ctx` is the context the commands were parsed
 * in (the seam's own `pctx` / `ectx`), so a re-read is comparable.
 */
export function unreadNumbers(utterance: string, commands: readonly AnyCommand[], ctx: ParseContext): number[] {
  const { text, occurrences } = statedNumberOccurrences(utterance);
  if (occurrences.length === 0) return [];
  const occ = readNumbers(text, loweringKey(commands), readerIn(ctx), occurrences);
  return occ.unread.map((o) => parseFloat(o.text));
}
