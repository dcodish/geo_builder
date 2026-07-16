/**
 * The COMPUTED VALUE of a size/ratio given, measured on the current drawing ([issue #39]).
 *
 * The student enters `S_{DBCA}/S_{GAD}=15`; the solver drives it and a green figure already MEANS the ratio
 * holds — but there was no way to SEE the numbers. This reads the enforced given back off the figure's
 * coordinates and reports it, so a selected area/ratio/length/perimeter row can show e.g.
 * `S(DBCA)=62.2, S(GAD)=4.1 → ratio 15.0 ✓`.
 *
 * KNOWLEDGE DISCIPLINE (the ADR-101 / ADR-3D-030 rule): under the similarity gauge, only a RATIO is
 * seed-invariant knowledge — it is the verdict. An absolute area/length/perimeter is a per-drawing measure
 * (the world scale is whatever the solver picked); it is shown as context, and its ✓ only means "the world
 * coordinates realise the stated value" (the solver pins the scale to it), never that the number is intrinsic.
 *
 * Pure and read-only over `polygonArea`/`polygonPerimeter`/`dist` + the lowered constraints — no engine change.
 */
import type { AnyCommand, Command, Id, Vec } from '@/engine';
import { buildSymTab, lowerOne } from '@/engine';
import { angleDeg, dist, polygonArea, polygonPerimeter } from '@/engine/geometry';

/** One measured line in a readout. `strong` marks the seed-invariant verdict (a ratio, or the pinned value). */
export interface ReadoutItem {
  label: string;
  value: string;
  ok?: boolean; // present on the verdict item — did the measurement match the stated given?
}
export interface Readout {
  measured: ReadoutItem[]; // per-drawing context (absolute areas/lengths)
  verdict: ReadoutItem; // the seed-invariant knowledge: a ratio, or a pinned absolute
}

const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(Math.abs(r) >= 100 ? 0 : 1);
};
/** Relative match with a floor, so a solver that lands 15.02 for a stated 15 reads ✓. */
const matches = (measured: number, target: number, tol = 0.02): boolean =>
  Math.abs(measured - target) <= tol * Math.max(1, Math.abs(target));

const polyLabel = (sym: string, ids: Id[]): string => `${sym}(${ids.join('')})`;
const areaOf = (ids: Id[], pos: Map<Id, Vec>): number | null => {
  const pts = ids.map((id) => pos.get(id));
  return pts.every((p): p is Vec => !!p) ? Math.abs(polygonArea(pts)) : null;
};
const perimOf = (ids: Id[], pos: Map<Id, Vec>): number | null => {
  const pts = ids.map((id) => pos.get(id));
  return pts.every((p): p is Vec => !!p) ? polygonPerimeter(pts) : null;
};
const lenOf = (a: Id, b: Id, pos: Map<Id, Vec>): number | null => {
  const p = pos.get(a);
  const q = pos.get(b);
  return p && q ? dist(p, q) : null;
};

/**
 * A readout for a single lowered `set-*` command, or null if it isn't a measurable size/ratio given.
 * `lowerOne` produces engine COMMANDS (`set-distance`/`set-area-ratio`/…), which carry the same fields as
 * the constraints they create — so we read the measurement straight off the command.
 */
export function readoutForCommand(con: Command, pos: Map<Id, Vec>): Readout | null {
  switch (con.type) {
    case 'set-area': {
      const a = areaOf(con.ids, pos);
      if (a === null) return null;
      const lbl = polyLabel('S', con.ids);
      return { measured: [], verdict: { label: lbl, value: fmt(a), ok: matches(a, con.value) } };
    }
    case 'set-perimeter': {
      const p = perimOf(con.ids, pos);
      if (p === null) return null;
      const lbl = `P(${con.ids.join('')})`;
      return { measured: [], verdict: { label: lbl, value: fmt(p), ok: matches(p, con.value) } };
    }
    case 'set-distance': {
      const d = lenOf(con.a, con.b, pos);
      if (d === null) return null;
      return { measured: [], verdict: { label: `|${con.a}${con.b}|`, value: fmt(d), ok: matches(d, con.value) } };
    }
    case 'set-area-ratio':
    case 'set-perimeter-ratio': {
      const area = con.type === 'set-area-ratio';
      const sym = area ? 'S' : 'P';
      const m1 = area ? areaOf(con.ids1, pos) : perimOf(con.ids1, pos);
      const m2 = area ? areaOf(con.ids2, pos) : perimOf(con.ids2, pos);
      if (m1 === null || m2 === null || Math.abs(m2) < 1e-9) return null;
      const r = m1 / m2;
      return {
        measured: [
          { label: polyLabel(sym, con.ids1), value: fmt(m1) },
          { label: polyLabel(sym, con.ids2), value: fmt(m2) },
        ],
        verdict: { label: `${polyLabel(sym, con.ids1)}/${polyLabel(sym, con.ids2)}`, value: fmt(r), ok: matches(r, con.k) },
      };
    }
    case 'set-ratio': {
      // |a→b| = k·|c→d| (+ add). The ratio |ab|/|cd| is the seed-invariant knowledge; the two lengths are
      // per-drawing context. An affine `add` isn't a pure ratio, so verify against the constraint value.
      const m1 = lenOf(con.a, con.b, pos);
      const m2 = lenOf(con.c, con.d, pos);
      if (m1 === null || m2 === null || Math.abs(m2) < 1e-9) return null;
      const r = m1 / m2;
      const expected = con.add ? con.k + con.add / m2 : con.k;
      return {
        measured: [
          { label: `|${con.a}${con.b}|`, value: fmt(m1) },
          { label: `|${con.c}${con.d}|`, value: fmt(m2) },
        ],
        verdict: { label: `|${con.a}${con.b}|/|${con.c}${con.d}|`, value: fmt(r), ok: matches(r, expected) },
      };
    }
    case 'set-measure-sum': {
      // Σ coefᵢ·mᵢ = target (#154): each term measured as context; the verdict is the LHS sum against the
      // target (absolute form, «∠A + ∠B = 180») or the LHS/RHS sum RATIO (Σ=Σ form — a ratio is the
      // seed-invariant knowledge under the similarity gauge, matching the area/perimeter-ratio discipline).
      const stride = con.unit === 'length' ? 2 : 3;
      const measured: ReadoutItem[] = [];
      let sumL = 0; // positive-coef terms (the utterance's left side)
      let sumR = 0; // negated (right-side) terms, restored to positive
      for (let i = 0; i < con.coefs.length; i++) {
        const ids = con.points.slice(i * stride, (i + 1) * stride);
        const m =
          con.unit === 'length'
            ? lenOf(ids[0], ids[1], pos)
            : pos.get(ids[0]) && pos.get(ids[1]) && pos.get(ids[2])
              ? angleDeg(pos.get(ids[1])!, pos.get(ids[0])!, pos.get(ids[2])!)
              : null;
        if (m === null || !Number.isFinite(m)) return null;
        measured.push({ label: con.unit === 'length' ? `|${ids[0]}${ids[1]}|` : `∠${ids.join('')}`, value: fmt(m) });
        if (con.coefs[i] >= 0) sumL += con.coefs[i] * m;
        else sumR += -con.coefs[i] * m;
      }
      const lbl = con.unit === 'angle' ? 'Σ∠' : 'Σ';
      if (con.target !== 0 || sumR < 1e-9) {
        const total = sumL - sumR;
        return { measured, verdict: { label: lbl, value: fmt(total), ok: matches(total, con.target) } };
      }
      const ratio = sumL / sumR;
      return { measured, verdict: { label: `${lbl}/${lbl}`, value: fmt(ratio), ok: matches(ratio, 1) } };
    }
    case 'set-length-product': {
      // k·∏|lhs| = ∏|rhs| (#144): each factor measured as context, the two products' RATIO as the verdict
      // (a ratio is the seed-invariant knowledge under the similarity gauge — products are per-drawing).
      const measured: ReadoutItem[] = [];
      const prod = (ids: Id[]): number | null => {
        let p = 1;
        for (let i = 0; i + 1 < ids.length; i += 2) {
          const d = lenOf(ids[i], ids[i + 1], pos);
          if (d === null) return null;
          measured.push({ label: `|${ids[i]}${ids[i + 1]}|`, value: fmt(d) });
          p *= d;
        }
        return p;
      };
      const l = prod(con.lhs);
      const r = prod(con.rhs);
      if (l === null || r === null || Math.abs(r) < 1e-12) return null;
      const ratio = (con.k * l) / r;
      return { measured, verdict: { label: con.k === 1 ? '∏/∏' : `${fmt(con.k)}·∏/∏`, value: fmt(ratio), ok: matches(ratio, 1) } };
    }
    default:
      return null;
  }
}

/**
 * The readout for a fact GROUP (one step's commands): lowers the group's commands against the full enabled
 * symbol table and returns the FIRST measurable size/ratio given's readout, or null. `groupCmds` are the raw
 * `AnyCommand`s of the selected group; `allEnabledCmds` is every enabled fact's command (for the symbol table
 * so a `measure-area`/`measure-length` resolves its shared-variable ratio correctly).
 */
export function readoutForGroup(groupCmds: AnyCommand[], allEnabledCmds: AnyCommand[], pos: Map<Id, Vec>): Readout | null {
  const tab = buildSymTab(allEnabledCmds);
  const lowered: Command[] = groupCmds.flatMap((c) => lowerOne(c, tab));
  for (const con of lowered) {
    const r = readoutForCommand(con, pos);
    if (r) return r;
  }
  return null;
}
