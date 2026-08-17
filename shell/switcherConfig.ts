/**
 * The client half of the operator config (unify A3, #662): the pure overlay merge the builders
 * apply to their static roster.
 *
 * The wire shape MIRRORS `server/adminConfig.ts` — `shell/` and `server/` may not import each
 * other (BOUNDARIES.json), so the contract lives on both sides, and BOTH sides tolerate unknown
 * fields so the mirror can never hard-break the other.
 *
 * DEGRADED PATH (the #662 lock): config unreachable / malformed / empty ⇒ callers pass
 * `null`/`undefined` and the roster passes through UNCHANGED — a dead server leaves every builder
 * working with its built-in registry roster. Curation can only ever narrow or redecorate what the
 * registry declares; it can never add to it, because the merge starts FROM the roster and an
 * unknown configured id simply matches nothing.
 */

export interface SwitcherConfig {
  order?: string[];
  hidden?: string[];
  labels?: Record<string, string>;
  icons?: Record<string, string>;
}

export interface ToolConfig {
  switcher?: SwitcherConfig;
  quickCommands?: string[];
}

export interface SwitcherRosterEntry {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

/**
 * Apply the operator's curation to the registry roster: hide, reorder (listed ids first in the
 * configured order, the rest keep registry order), relabel, re-icon. Pure and total — any absent
 * or partial config leaves the corresponding aspect untouched.
 */
export function applySwitcherConfig<E extends SwitcherRosterEntry>(
  roster: E[],
  cfg: ToolConfig | null | undefined,
): E[] {
  const sw = cfg?.switcher;
  if (!sw) return roster;
  const hidden = new Set(sw.hidden ?? []);
  const decorated = roster
    .filter((e) => !hidden.has(e.id))
    .map((e) => ({
      ...e,
      label: sw.labels?.[e.id]?.trim() ? sw.labels[e.id] : e.label,
      icon: sw.icons?.[e.id]?.trim() ? sw.icons[e.id] : e.icon,
    }));
  const order = sw.order ?? [];
  if (order.length === 0) return decorated;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...decorated].sort((a, b) => {
    const ra = rank.has(a.id) ? (rank.get(a.id) as number) : order.length + roster.findIndex((e) => e.id === a.id);
    const rb = rank.has(b.id) ? (rank.get(b.id) as number) : order.length + roster.findIndex((e) => e.id === b.id);
    return ra - rb;
  });
}
