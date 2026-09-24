import type { Derivation } from '../engine/derive';
import { isKnowledge, knownCurve } from '../engine/evaluate';
import { isDirectionSymbol, paramRegister, usedSymbols } from '../engine/carriers';
import { type ParamDecl, positionalOf } from '../engine/types';

/**
 * WHICH CURVES THE DATA PANEL LISTS (#1250) — one decision, in one place, so a lock can CALL it.
 *
 * This lived inline in `App.tsx` as `curves.filter((c) => c.stated)`. It is extracted rather than
 * widened in place because a test written against an inline filter has to re-implement it, and a
 * test that reproduces the decision it guards stays green through the change that kills the feature
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * ## The rule, and why it is not `stated`
 *
 * Operator ruling, 2026-09-19: *"if we say that a point is on a line, we dont draw the line but if we
 * specifically mention a line, we should have its equation."*
 *
 * So there are two different questions, and they now have different answers:
 *
 * - **the canvas** asks `stated` — is this line DRAWN? («משוואת הצלע CE» draws only the segment)
 * - **the panel** asks this — was this line MENTIONED?
 *
 * They coincided until [ADR-AG-111](../../docs/06c-decisions-analytic.md) made a mentioned line
 * undrawn for the first time, and the equation a student had just written vanished from the one place
 * they check what the tool understood.
 *
 * ## `label.name` IS "mentioned", and not by coincidence
 *
 * A line the student made the SUBJECT of a sentence is one they referred to by name. A line minted
 * only to hold a point — #1078's «B על הישר y=x» — has nothing to call it, and #1078's objection was
 * exactly that: *"there is no way to know what it belongs to"*. That ruling is preserved here, not
 * reversed: an anonymous carrier still gets no row.
 *
 * A second flag (`drawn` beside `listed`) was considered and rejected: it would have to be set
 * correctly at every mint site, while the name already answers truthfully at all of them.
 */

/** The shape both the panel and its locks need — deliberately narrower than `CurveObject`. */
export interface PanelCurve {
  stated: boolean;
  label: { name: string };
}

/** Does this curve get an equation row? */
export const panelListsCurve = (c: PanelCurve): boolean => c.stated || c.label.name !== '';

/**
 * WHAT THE DATA PANEL KNOWS (#1289) — the panel's own knowledge gates, as one callable decision.
 *
 * The parameter, point and equation rows decided `known`/`unknown` inline in `App.tsx`, each calling
 * `isKnowledge` / `knownCurve` itself. A corpus invariant over "what the panel prints as unknown" could
 * then only REPRODUCE those calls, and a lock that reproduces its subject stays green through the change
 * that breaks it ([ADR-W-053](../../docs/06w-decisions-workspace.md)). So the decisions live here, the
 * panel renders from them, and `panel-freedom-invariant-1289.test.ts` asks the same function.
 */
export type PanelKnown = { known: true; value: number } | { known: false };

export interface PanelKnowledge {
  /** each non-direction parameter; a symbol nothing reads is never asked of the gate (#1343) */
  readonly params: readonly { sym: string; domain: ParamDecl['domain']; used: boolean; k: PanelKnown }[];
  /** each positional object's coordinates (ADR-AG-003 §2) */
  readonly points: readonly { id: string; x: PanelKnown; y: PanelKnown }[];
  /** each LISTED curve, with its equation when every coefficient is invariant, else null */
  readonly curves: readonly { id: string; known: ReturnType<typeof knownCurve> }[];
}

export function panelKnowledge(d: Pick<Derivation, 'construction' | 'figure'>): PanelKnowledge {
  const c = d.construction;
  const used = usedSymbols(c);
  return {
    params: paramRegister(c)
      .filter((p) => !isDirectionSymbol(p.sym))
      .map((p) => {
        const isUsed = used.has(p.sym);
        const k: PanelKnown = isUsed ? isKnowledge(c, (f) => f.env[p.sym] ?? null) : { known: false };
        return { sym: p.sym, domain: p.domain, used: isUsed, k };
      }),
    points: positionalOf(c).map((p) => ({
      id: p.id,
      x: isKnowledge(c, (f) => f.points.find((q) => q.id === p.id)?.x ?? null),
      y: isKnowledge(c, (f) => f.points.find((q) => q.id === p.id)?.y ?? null),
    })),
    curves: d.figure.curves.filter(panelListsCurve).map((cu) => ({ id: cu.id, known: knownCurve(c, cu.id) })),
  };
}

/** Does the panel print at least one quantity as UNKNOWN? (the #1289 invariant's right-hand side) */
export const panelShowsUnknown = (pk: PanelKnowledge): boolean =>
  pk.params.some((p) => !p.k.known) ||
  pk.points.some((p) => !p.x.known || !p.y.known) ||
  pk.curves.some((cu) => cu.known === null);
