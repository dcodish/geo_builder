/**
 * THE TOOL'S LETTERS FOR POINTS THE STUDENT DID NOT NAME — one table, one resolver (#1620 S6, ADR-AG-211).
 *
 * Operator ruling, 2026-10-02 (#1620): *a point the student did not name takes 2-D's letter — M for a midpoint, F for
 * a foot, the next free letter when it is taken — except that analytic uses H for a foot, because F is this tool's
 * focus letter (#1167). The letter is announced on the row and renameable.*
 *
 * Before this module three conventions coexisted: a perpendicular's foot and a perpendicular bisector's midpoint took
 * the reserved `P₁` (S2, ADR-AG-207), a median's or altitude's foot `M₁` / `H₁` (S4, ADR-AG-209), and a midsegment's
 * midpoints 2-D's M and N (S3, ADR-AG-208). Now every one of them is a placeholder `@fresh:<role>|<key>` the parser
 * writes (`toolPoint`), resolved HERE by its ROLE through {@link TOOL_LETTERS}.
 *
 * The letters, measured through `decideDeterministic2D` (2-D's `freeLabel`, `src/parser/parse.ts`): a foot prefers
 * F, G, H, P (a free point F already in the figure → G; F, G, H → P); a midsegment's midpoints prefer M, N, P, Q and
 * N, P, Q, S; then 2-D's pool `MNPQRSTUVWXYZKLGHIJ`. Analytic's foot reads F → H, so H, G, P (F is never offered).
 * 2-D's median and perpendicular-bisector midpoints always write M, even over a point M the figure has — a 2-D
 * collision (#1690); here the midpoint takes the next free letter like every other role.
 *
 * Resolved in LIST ORDER against the letters the EARLIER facts use, so a later line never re-letters an earlier
 * point (stability) and a later line that names the tool's letter refers to it (#1153: naming it a second time is
 * `already-named`; the student renames). A point the figure already derives the SAME way keeps its name — the
 * student's «M אמצע AB» before «קטע האמצעים …», or one perpendicular stated twice. The coordinate point keeps its own
 * ruling (#1281: the reserved `P₁`, `derive.resolveMints`) — it is not a construct with a role.
 */
import { sameDerivation } from './sameDerivation';
import type { Fact, Id } from './types';

export type ToolPointRole = 'midpoint' | 'midpoint-2' | 'foot' | 'end' | 'diameter-end';

/** The ONE role → letters table. The first free letter wins; then 2-D's pool; then the first letter subscripted. */
export const TOOL_LETTERS: Readonly<Record<ToolPointRole, string>> = {
  /** A midpoint the sentence did not name — a median's foot, a perpendicular bisector's, a midsegment's first end. */
  midpoint: 'MNPQ',
  /** A midsegment's second end (2-D's `m2`), so the pair reads M, N. */
  'midpoint-2': 'NPQS',
  /** The foot of a perpendicular or an altitude: 2-D's F, G, H, P with F → H (#1167). */
  foot: 'HGP',
  /**
   * The ends of a shape whose points the sentence did not name (#1622 E4, ADR-AG-220) — «קוטר», «רבע מעגל»: 2-D names
   * them A, B, the next free letters in order. F stays the focus letter (#1167) and O the centre's (#1673), so neither
   * is offered.
   */
  end: 'ABCDEGHIJKLMNPQRSTUVWXYZ',
  /** The far end of a diameter from a named point (#1622 E4) — «קוטר מנקודה F»: 2-D's D, then the next free letter. */
  'diameter-end': 'DEGHIJKLMNPQRSTUVWXYZ',
};
/** 2-D's `freeLabel` pool, minus nothing: it holds no F. */
const POOL = 'MNPQRSTUVWXYZKLGHIJ';

export const TOOL_PREFIX = '@fresh:';
/** The placeholder a parser rule writes for an unnamed point: its role, and a key saying what the point IS. */
export const toolPoint = (role: ToolPointRole, key: string): Id => `${TOOL_PREFIX}${role}|${key.replace(/["@]/g, '')}`;
const PLACEHOLDER = /@fresh:[^"|]*\|[^"@]*/g;

/** `n` in subscript digits — `M₁`. */
const subscript = (n: number): string => String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x2080 + Number(d)));

const segId = (a: Id, b: Id): Id => `seg-${[a, b].sort().join('')}`;

export function resolveToolLetters(
  facts: readonly Fact[],
  owner: readonly number[],
): { facts: Fact[]; minted: Array<{ index: number; id: string }> } {
  if (!JSON.stringify(facts).includes(TOOL_PREFIX)) return { facts: [...facts], minted: [] };
  const used = new Set<string>();
  const names = new Map<string, string>();
  const minted: Array<{ index: number; id: string }> = [];
  const out: Fact[] = [];
  facts.forEach((f0, i) => {
    // A segment's id is its SORTED ends, and a placeholder may sort first inside it — it is re-keyed from its ends
    // below, so its id is never where a placeholder is discovered.
    const scan = f0.t === 'segment' ? { ...f0, id: '' } : f0;
    let text = JSON.stringify(scan);
    for (const ph of new Set(text.match(PLACEHOLDER) ?? [])) {
      if (names.has(ph)) continue;
      const role = ph.slice(TOOL_PREFIX.length).split('|')[0] as ToolPointRole;
      // The same point already derived the same way keeps ITS name (#1153: one position, one name).
      const own =
        f0.t === 'derived' && f0.id === ph
          ? out.find((g) => g.t === 'derived' && sameDerivation(g.rule, f0.rule) && !g.id.includes(TOOL_PREFIX))
          : undefined;
      let name = own ? (own as { id: Id }).id : [...(TOOL_LETTERS[role] ?? ''), ...POOL].find((x) => !used.has(x));
      if (!name) {
        const base = (TOOL_LETTERS[role] ?? 'P')[0];
        let n = 0;
        do name = `${base}${subscript(++n)}`;
        while (used.has(name));
      }
      names.set(ph, name);
      used.add(name);
      if (!own) minted.push({ index: owner[i], id: name });
    }
    text = text.replace(PLACEHOLDER, (ph) => names.get(ph) ?? ph);
    let f = JSON.parse(text) as Fact;
    if (f.t === 'segment') f = { ...f, id: f0.t === 'segment' && !f0.id.includes(TOOL_PREFIX) ? f0.id : segId(f.a, f.b) };
    for (const m of text.match(/"[A-Z][0-9₀-₉]?"/g) ?? []) used.add(m.slice(1, -1));
    out.push(f);
  });
  return { facts: out, minted };
}
