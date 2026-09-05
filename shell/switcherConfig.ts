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

/**
 * #903 (ADR-W-043) — THE THREE OUTCOMES OF A CONFIG READ.
 *
 * The degraded path above is right and stays: a student must never see proxy plumbing. But callers
 * used to collapse a failed fetch and an empty config into the same `null`, so **"nothing is
 * configured" and "the config could not be reached" were indistinguishable** — which is why the
 * complex builder's curation sat inert for a month with nothing to notice it. The route answered 404
 * because it had never been added to any reverse-proxy conf, and the app's own graceful fallback
 * hid it perfectly.
 *
 * `unreachable` is deliberately NOT `unset`. Both leave the roster untouched for the student; only
 * one of them means an operator's setting is being thrown away.
 */
export type ConfigRead =
  | { status: 'configured'; config: ToolConfig }
  /** The server answered and there is no curation for this tool (204). Nothing is wrong. */
  | { status: 'unset' }
  /** No usable answer: not routed (404), a server error, malformed JSON, or no response at all. */
  | { status: 'unreachable'; why: string };

/**
 * Read one tool's operator config, distinguishing the three outcomes.
 *
 * Total by construction — it never throws and never rejects, so a caller can consume it without a
 * `catch` and cannot accidentally reintroduce the collapse this exists to prevent. `fetchImpl` is
 * injected for tests; `base` is the app's `BASE_URL` (the deployed prefix), so the request goes
 * through the SAME public path a student's browser uses — which is what makes a missing proxy rule
 * observable at all.
 */
export async function readToolConfig(
  tool: string,
  base = '/',
  fetchImpl: typeof fetch = fetch,
): Promise<ConfigRead> {
  const url = `${base}api/config?tool=${encodeURIComponent(tool)}`;
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (e) {
    return { status: 'unreachable', why: `${url} — no response (${e instanceof Error ? e.message : String(e)})` };
  }
  if (res.status === 204) return { status: 'unset' };
  if (res.status !== 200) return { status: 'unreachable', why: `${url} — HTTP ${res.status}` };
  try {
    return { status: 'configured', config: (await res.json()) as ToolConfig };
  } catch {
    return { status: 'unreachable', why: `${url} — 200 with a body that is not JSON` };
  }
}

/** The config to apply, or null — the shape `applySwitcherConfig` already takes. Both non-configured
 *  outcomes yield null, because the STUDENT'S experience is identical; only the operator is told apart. */
export const configOf = (r: ConfigRead): ToolConfig | null => (r.status === 'configured' ? r.config : null);
