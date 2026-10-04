/**
 * A NAME THAT IS A NEAR MISS OF ONE THE FIGURE HAS (#1750, [ADR-AG-234](../../docs/06c-decisions-analytic.md#adr-ag-234)).
 *
 * Operator, round #1736 play, T2: *"if i say «A היא נקודת המפגש של הישר 1 עם הישר 2» - it rejects without explaining
 * that l1 is not like 1"*. Refusing is right — a line named «1» and a line named «l1» are different names (#1609 kept
 * that deliberately) — but the refusal did not lead the student to the name the figure has.
 *
 * Two names are a near miss when they differ only in a way a student does not see as a different name: the `l` / `ℓ`
 * in front of a line's digits, a prime, a subscript digit, letter case. One key per name (`nameKey`); two different
 * names with the same key are a near miss.
 *
 * Pure over the construction. Whether the suggestion is OFFERED is the submit decision's (`decideSubmit`): only when the
 * student's sentence with the suggested name in it would record (the taught-remedies rule).
 */
import type { Construction } from '../engine/types';
import { refKindOf, statedName, type RefKind } from '../engine/names';

/** The name with every difference a student does not read as a different name folded away. */
export function nameKey(name: string): string {
  return name
    .normalize('NFKC') // ℓ → l, ₁ → 1
    .toLowerCase()
    .replace(/[′'’`]/g, '')
    .replace(/^l(?=[0-9])/, '');
}

/** The point objects — every other kind names itself by its id prefix (`refKindOf`). */
const POINT_KINDS = new Set(['point', 'derived', 'free']);

/** The names the student gave the figure's objects of `kind`, in the order they were made. */
export function namesOfKind(c: Construction, kind: RefKind): string[] {
  const out: string[] = [];
  for (const o of c.objects) {
    if (kind === 'point' ? !POINT_KINDS.has(o.kind) : refKindOf(o.id) !== kind || o.kind === 'point') continue;
    const name = statedName(o.id);
    if (kind !== 'point' && name === o.id) continue; // an anonymous curve has no name to offer
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** The figure's name of `kind` that `name` is a near miss of, or `null`. */
export function nearMissOf(c: Construction, name: string, kind: RefKind): string | null {
  const key = nameKey(name);
  return namesOfKind(c, kind).find((n) => n !== name && nameKey(n) === key) ?? null;
}

/**
 * `line` with the NAME `from` replaced by `to` — only where `from` stands as a name: not inside a longer name
 * («l1» in «l12»), an equation («y=x+1») or a number («1.5»). A Hebrew clitic before it («ו-2», «ל-l1») is kept.
 */
export function withName(line: string, from: string, to: string): string | null {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[\\s(,]|[\\u05D0-\\u05EA][-־]?)${esc}(?=$|[\\s,:;?!)]|\\.(?![0-9]))`, 'g');
  if (!re.test(line)) return null;
  re.lastIndex = 0;
  return line.replace(re, (_m, lead: string) => `${lead}${to}`);
}
