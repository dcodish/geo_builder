/**
 * The 3-D session store (docs/20 §7): the 2-D store's architecture transplanted —
 * the ordered FACT LIST is the source of truth, the figure is DERIVED by replaying
 * the enabled facts through the engine, positions are never stored (undo can't
 * desync), zundo gives temporal undo/redo.
 *
 * Unlike the 2-D store (where replay is expensive and cached in state), V0 figures
 * are tiny and `replay3` is closed-form — so the derived figure is NOT stored at
 * all: `derive3(facts, seed)` is recomputed by the UI (useMemo) and by tests.
 * That removes a whole class of undo/derived-desync bugs by construction: undo
 * restores {facts, seed}, and everything else follows.
 *
 * V0 semantics kept from the 2-D tool:
 *  - submit is all-or-nothing: a fact that errors is NOT added (keep-prior) and
 *    the error surfaces; the figure never breaks.
 *  - toggling a fact off re-derives; a dependent fact that can no longer apply is
 *    flagged in `status` (auto-drop, reversible) rather than deleted.
 *  - "show another configuration" advances the seed → free DOFs resample (box
 *    aspect, prism shape/height, free on-segment t). Stability: samples are keyed
 *    by object identity, so adding a fact never moves existing points.
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import { applyCommand3 } from '../engine/apply';
import { checkInSpan, memberHolds3, resolve3, type Resolved3 } from '../engine/evaluate';
import { verifyClaim } from '../engine/claims';
import { cross3, dot3, norm3, sub3 } from '../engine/vec3';
import { emptyConstruction3, type Command3, type Construction3, type EngineError3, type Positions3 } from '../engine/types';
import { parse3 } from '../parser/parse3';

export interface Fact3 {
  id: string;
  utterance: string;
  cmds: Command3[];
  enabled: boolean;
}

export type FactStatus3 = 'ok' | 'disabled' | EngineError3;

export interface Derived3 {
  construction: Construction3;
  /** The full resolved figure (positions + planes/lines/parameter) — the renderer's input. */
  resolved: Resolved3;
  /** Convenience alias of resolved.positions. */
  positions: Positions3;
  status: Record<string, FactStatus3>;
}

export type StoreError3 =
  | EngineError3
  | { code: 'not-understood' }
  | { code: 'ambiguous-vector-length' }
  | { code: 'bad-file' }
  | { code: 'newer-schema' }
  | null;

/**
 * Pure replay: fold the enabled facts through the reducer, evaluate — then
 * VERIFY: every claim is checked against the final figure across several
 * sampled configurations (claims.ts), and every span-driven point is
 * post-checked (its closed-form t must actually satisfy the condition ON the
 * stated segment). A fact that fails verification carries the verdict in
 * `status` — and `submit` refuses it (keep-prior), so a wrong answer or an
 * unsatisfiable condition can never silently sit on the figure.
 */
export function derive3(facts: Fact3[], seed: number): Derived3 {
  let c: Construction3 = emptyConstruction3();
  const status: Record<string, FactStatus3> = {};
  const claimOwners: { factId: string; from: number; to: number }[] = [];
  const pinOwnerIds = new Set<string>();
  for (const f of facts) {
    if (!f.enabled) {
      status[f.id] = 'disabled';
      continue;
    }
    let st: FactStatus3 = 'ok';
    const claimsBefore = c.claims.length;
    const pinsBefore = c.pins.length + c.vectorPins.length + c.pairPins.length + c.scalarPins.length + c.planePins.length;
    for (const cmd of f.cmds) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) {
        st = r.error;
        break;
      }
      c = r.next;
    }
    // count-delta attribution: EVERY claim recorded while this fact applied belongs to
    // it — including claims composite commands create indirectly (none can escape)
    if (c.claims.length > claimsBefore) claimOwners.push({ factId: f.id, from: claimsBefore, to: c.claims.length });
    // pin ownership (same count-delta discipline): a fact that contributed ANY pivot
    // pin must not read ok when the pivot finds no placement (honesty — no silent seed figure)
    if (c.pins.length + c.vectorPins.length + c.pairPins.length + c.scalarPins.length + c.planePins.length > pinsBefore) pinOwnerIds.add(f.id);
    status[f.id] = st;
  }

  const resolved = resolve3(c, seed);
  const positions = resolved.positions;

  // verify every recorded claim against the FINAL figure, attributed to its fact
  for (const owner of claimOwners) {
    if (status[owner.factId] !== 'ok') continue;
    for (let i = owner.from; i < owner.to; i++) {
      const claim = c.claims[i];
      // ADR-3D-032: a claim that PINS the figure parameter (references a coord-sym
      // point) is a given, not a size statement — no root = the honest no-roots.
      const pinsParam = c.paramGivens.includes(claim);
      if (pinsParam && resolved.param && resolved.param.roots.length === 0) {
        status[owner.factId] = { code: 'no-roots' };
        break;
      }
      // V2 honest boundary: a numeric size on a free-dim solid figure is a SCALE
      // statement, not a check — refuse with a clear message rather than "refute" it.
      if (!pinsParam && (claim.type === 'length-eq' || claim.type === 'area-eq') && c.solids.length > 0) {
        status[owner.factId] = { code: 'size-on-solid' };
        break;
      }
      if (!verifyClaim(claim, c, seed)) {
        status[owner.factId] = { code: 'claim-refuted' };
        break;
      }
    }
  }

  for (const f of facts) {
    if (status[f.id] !== 'ok') continue;
    // a pin-contributing fact with NO pivot placement — honest refusal, never a silent
    // fallback to the unsolved seed figure (class: any pin kind, not only injections)
    if (pinOwnerIds.has(f.id) && resolved.pivot && resolved.pivot.solutions === 0) {
      status[f.id] = { code: 'injection-unsatisfiable' };
      continue;
    }
    for (const cmd of f.cmds) {
      if (cmd.type === 'point-in-span') {
        const def = c.points.get(cmd.id);
        if (def?.kind === 'in-span') {
          const verdict = checkInSpan(c, cmd.id, def, positions);
          if (verdict !== 'ok') {
            status[f.id] = { code: verdict, id: cmd.id };
            break;
          }
        }
      } else if (cmd.type === 'plane-angle' || cmd.type === 'line-perp-plane') {
        // the stated relation admits NO parameter value — over-constrained, honestly
        if (resolved.param && resolved.param.roots.length === 0) {
          status[f.id] = { code: 'no-roots' };
          break;
        }
      } else if (cmd.type === 'param-sign') {
        // ADR-3D-032: the chosen parameter value must honour the stated sign
        const v = resolved.param?.value;
        if (v === undefined || !Number.isFinite(v) || (cmd.positive ? v <= 1e-9 : v >= -1e-9)) {
          status[f.id] = { code: 'sign-unsatisfiable', id: cmd.sym };
          break;
        }
      } else if (cmd.type === 'vec-rel' || cmd.type === 'seg-plane-rel' || cmd.type === 'length-rel') {
        // a vec-defined/vec-pair point (or a pinned symbol) that found NO position → honest refusal
        const ids =
          cmd.type === 'vec-rel'
            ? [
                cmd.from,
                cmd.to,
                ...cmd.terms.flatMap((t) =>
                  t.atom.kind === 'pair'
                    ? [t.atom.from, t.atom.to]
                    : (() => {
                        const dv = c.vectors.get(t.atom.name);
                        return dv ? [dv.from, dv.to] : [];
                      })(),
                ),
              ]
            : cmd.type === 'length-rel'
              ? [
                  cmd.a1,
                  cmd.b1,
                  ...('pair' in cmd.rhs
                    ? cmd.rhs.pair
                    : (() => {
                        const dv = c.vectors.get((cmd.rhs as { vec: string }).vec);
                        return dv ? [dv.from, dv.to] : [];
                      })()),
                ]
              : [cmd.a, cmd.b];
        const missing = ids.find((id) => {
          const def = c.points.get(id);
          return (def?.kind === 'vec-defined' || def?.kind === 'vec-pair') && !positions.has(id);
        });
        if (missing) {
          status[f.id] = { code: 'no-solution', id: missing };
          break;
        }
        // (claims these relations may have recorded are verified by the count-delta pass above)
      } else if (cmd.type === 'line-plane-point') {
        if (!positions.has(cmd.id)) {
          status[f.id] = { code: 'line-misses-plane', id: cmd.id }; // parallel at the chosen parameter
          break;
        }
      } else if (cmd.type === 'on-line') {
        const p = positions.get(cmd.id);
        const ln = resolved.lines.get(cmd.line);
        const holds =
          p !== undefined &&
          ln !== undefined &&
          norm3(cross3(sub3(p, ln.anchor), ln.dir)) <= 1e-7 * Math.max(norm3(sub3(p, ln.anchor)) * norm3(ln.dir), 1);
        if (!holds) {
          status[f.id] = { code: 'not-on-line', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'point-on-circle3') {
        // V8-i: on the circle ⟺ |P−centre| = radius AND P lies in the circle's plane
        const p = positions.get(cmd.point);
        const k = cmd.circle === '' ? resolved.circles3[0] : resolved.circles3.find((x) => x.id === cmd.circle);
        const holds =
          p !== undefined &&
          k !== undefined &&
          Math.abs(norm3(sub3(p, k.center)) - k.radius) <= 1e-5 * Math.max(k.radius, 1) &&
          Math.abs(dot3(sub3(p, k.center), k.normal)) <= 1e-5 * Math.max(k.radius, 1);
        if (!holds) {
          status[f.id] = { code: 'not-on-line', id: cmd.point };
          break;
        }
      } else if (cmd.type === 'right-pyramid-point') {
        // V8-j: no point on the segment sits above the base centroid → no right pyramid (honest)
        if (!positions.has(cmd.id)) {
          status[f.id] = { code: 'no-solution', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'inject-vector' || (cmd.type === 'point3' && c.pins.some((p) => p.id === cmd.id))) {
        // an injection with NO satisfying placement — the pivot found nothing (honest refusal)
        if (resolved.pivot && resolved.pivot.solutions === 0) {
          status[f.id] = { code: 'injection-unsatisfiable' };
          break;
        }
      } else if (cmd.type === 'sign-given') {
        const p = positions.get(cmd.id);
        const val = p?.[cmd.axis];
        const holds = val !== undefined && (cmd.positive ? val > 1e-9 : val < -1e-9);
        if (!holds) {
          status[f.id] = { code: 'sign-unsatisfiable', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'on-planes') {
        const p = positions.get(cmd.id);
        if (cmd.side) {
          // above/below (ADR-3D-015): the signed side of the +z-oriented plane — checked on
          // FINAL coordinates, so it holds for a created point AND verifies a stated one
          const pl = cmd.plane === 'any' ? undefined : resolved.planes.get(cmd.plane);
          if (!p || !pl) {
            status[f.id] = { code: 'not-on-plane', id: cmd.id };
            break;
          }
          const nz = pl.n.z / norm3(pl.n);
          if (Math.abs(nz) <= 1e-9) {
            // a vertical plane has no "above"/"below" — refuse rather than guess a side
            status[f.id] = { code: 'plane-side-undefined', id: cmd.plane };
            break;
          }
          let signed = (dot3(pl.n, p) + pl.d) / norm3(pl.n);
          if (nz < 0) signed = -signed;
          if (signed * (cmd.side === 'above' ? 1 : -1) <= 1e-9) {
            status[f.id] = { code: 'wrong-side-of-plane', id: cmd.id };
            break;
          }
        } else {
          const names = cmd.plane === 'any' ? [...resolved.planes.keys()] : [cmd.plane];
          // memberHolds3 (ADR-3D-033): the same predicate the membership DRIVE triggers
          // on, so a driven landing always verifies (no drive/verify tolerance gap)
          const holds =
            p !== undefined &&
            names.some((name) => {
              const pl = resolved.planes.get(name);
              return pl !== undefined && memberHolds3(p, pl);
            });
          if (!holds) {
            status[f.id] = { code: 'not-on-plane', id: cmd.id };
            break;
          }
        }
      } else if (cmd.type === 'plane-through') {
        // a plane named by points must be a REAL plane: 4 named points must be coplanar,
        // 3 must not be collinear — a best-fit patch through off-plane points would lie
        const pl = resolved.planes.get(cmd.name);
        const holds =
          pl !== undefined &&
          cmd.ids.every((q) => {
            const p = positions.get(q);
            return p !== undefined && Math.abs(dot3(pl.n, p) + pl.d) <= 1e-5 * norm3(pl.n) * (1 + norm3(p));
          });
        if (!holds) {
          status[f.id] = { code: 'not-coplanar', id: cmd.name };
          break;
        }
      }
    }
  }

  return { construction: c, resolved, positions, status };
}

export interface Geo3State {
  facts: Fact3[];
  seed: number;
  lastError: StoreError3;
  submit: (utterance: string) => void;
  /** Add ONE fact from LLM-normalised canonical lines (each re-parsed deterministically; all-or-nothing). */
  submitSteps: (utterance: string, steps: string[]) => void;
  toggle: (factId: string) => void;
  remove: (factId: string) => void;
  clear: () => void;
  /** The figure's NAME (issue #42) - shown on the page, used as the save filename, derived from the
   *  loaded file's name. Session metadata: NOT in the undo history (partialize is facts+seed only);
   *  reset by `clear`. */
  figureName: string;
  setFigureName: (name: string) => void;
  resample: () => void;
  dismissError: () => void;
  /** Load a deserialised figure — ONE undoable set (never destructive: undo restores the prior session). */
  loadFigure: (facts: Fact3[], seed: number) => void;
  /** Surface a file-load refusal through the normal error banner. */
  reportLoadError: (reason: 'bad-file' | 'newer-schema') => void;
}

export const useGeo3 = create<Geo3State>()(
  temporal(
    (set, get) => ({
      facts: [],
      seed: 0,
      figureName: '',
      lastError: null,

      submit: (utterance) => {
        const parsed = parse3(utterance);
        if (!parsed.ok) {
          set({ lastError: { code: parsed.reason === 'ambiguous-vector-length' ? 'ambiguous-vector-length' : 'not-understood' } });
          return;
        }
        const { facts, seed } = get();
        const fact: Fact3 = { id: nanoid(8), utterance: utterance.trim(), cmds: parsed.commands, enabled: true };
        const candidate = [...facts, fact];
        const st = derive3(candidate, seed).status[fact.id];
        if (st !== 'ok' && st !== 'disabled') {
          set({ lastError: st }); // keep-prior: the bad fact is not added
          return;
        }
        set({ facts: candidate, lastError: null });
      },

      submitSteps: (utterance, steps) => {
        const all: Command3[] = [];
        for (const step of steps) {
          const p = parse3(step);
          if (!p.ok) {
            set({ lastError: { code: 'not-understood' } }); // an LLM step the parser can't read — refuse whole
            return;
          }
          all.push(...p.commands);
        }
        if (all.length === 0) {
          set({ lastError: { code: 'not-understood' } });
          return;
        }
        const { facts, seed } = get();
        const fact: Fact3 = { id: nanoid(8), utterance: utterance.trim(), cmds: all, enabled: true };
        const candidate = [...facts, fact];
        const st = derive3(candidate, seed).status[fact.id];
        if (st !== 'ok' && st !== 'disabled') {
          set({ lastError: st });
          return;
        }
        set({ facts: candidate, lastError: null });
      },

      toggle: (factId) =>
        set({ facts: get().facts.map((f) => (f.id === factId ? { ...f, enabled: !f.enabled } : f)), lastError: null }),

      remove: (factId) => set({ facts: get().facts.filter((f) => f.id !== factId), lastError: null }),

      clear: () => set({ facts: [], figureName: '', lastError: null }),

      setFigureName: (name) => set({ figureName: name }),

      resample: () => set({ seed: get().seed + 1 }),

      dismissError: () => set({ lastError: null }),

      loadFigure: (facts, seed) => set({ facts, seed, lastError: null }),

      reportLoadError: (reason) => set({ lastError: { code: reason } }),
    }),
    {
      // History tracks the durable inputs only; lastError is transient UI state,
      // and `equality` keeps error-only sets from pushing duplicate snapshots.
      partialize: (s) => ({ facts: s.facts, seed: s.seed }) as Geo3State,
      equality: (past, current) => past.facts === current.facts && past.seed === current.seed,
    },
  ),
);

export const undo3 = () => useGeo3.temporal.getState().undo();
export const redo3 = () => useGeo3.temporal.getState().redo();
