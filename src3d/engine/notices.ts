/**
 * BUILD NOTICES (#305, ADR-3D-090) — "the step committed, and here is what changed."
 *
 * Before this there was no channel for a successful-but-adjusted build: `guidanceNote` in App3 is
 * refusal-only (it fires when the parse fails and then clears `lastError`), and an error would be
 * wrong here — nothing failed. The 2-D `coincidences` notice (ADR-123: a forced coincidence is
 * ALLOWED, with a notice) is the pattern this copies; per docs/20 §12 the pattern is copied, never
 * imported across the product boundary.
 *
 * The notice is what keeps the ADR-3D-090 auto-fix honest. «פירמידה ישרה שבסיסה דלתון» constrains
 * the kite into a RIGHT kite so the right pyramid can exist at all — a consequence of two statements
 * the student made, not an invented given — but the student must be able to SEE that it happened.
 *
 * Derived purely from the construction, so it is identical for a typed figure and a loaded one, and
 * it needs no plumbing through the submit path.
 */

import { CYCLIC_MEMBER, CYCLIC_MEMBER_NAME, QUAD_PYRAMIDS } from './baseShapes';
import { isSelfDetermined, lineDirCarriesParam, operandLabel, planeNormalCarriesParam } from './operands';
import type { QuadBase } from './baseShapes';
import { cross3, dot3, norm3, sub3 } from './vec3';
import type { Resolved3 } from './evaluate';
import type { Construction3, Id, Operand3, SolidKind } from './types';

/**
 * The relations that can be «true, and already known» (#853). The list is the SOURCE, not a copy:
 * the notice type reads its `rel` from here, and the i18n ratchet
 * (`src3d/__tests__/issue-853-already-known.test.ts`) requires every member to carry both halves of
 * the message — the statement wording and the reason it follows — in Hebrew and English. A fifth case
 * is therefore one entry plus two strings per language, and the suite says so if the strings are missing.
 */
export const ALREADY_KNOWN_RELS = ['shape', 'objects', 'contained', 'perp', 'parallel'] as const;
export type AlreadyKnownRel = (typeof ALREADY_KNOWN_RELS)[number];

/** A non-error message attached to a successfully built figure. */
export type BuildNotice3 =
  | {
      /** A stated base was constrained into the cyclic member of its family so «ישרה» could hold. */
      kind: 'base-constrained';
      /** The solid's vertex ids (so the UI can name the solid the way the student did). */
      ids: Id[];
      /** The base the student stated, and the shape it became — both i18n keys. */
      from: QuadBase;
      to: string;
    }
  | {
      /** #375: the student called a LINE a plane («ACD אנך למישור ℓ1»). The kinds are known, so the
       *  relation is built — and the wording is corrected here rather than silently ignored. */
      kind: 'line-called-plane';
      ids: Id[];
      line: string;
    }
  | {
      /** S2 (#378): the same slip on a general line relation («AB מקביל למישור l1») — the relation
       *  is built against the line, and the wording is corrected. */
      kind: 'line-rel-noun';
      line: string;
    }
  | {
      /** #333 (ADR-3D-153): the student named an intersection line `ℓ` while `ℓ` was already another
       *  line, so it was auto-indexed. Operator ruling 2026-07-25: auto-index and SAY SO, rather than
       *  refuse with a bare `already-defined` the student cannot act on. Derived from the line's
       *  stored `requested`, so it survives reload and undo like every other notice here. */
      kind: 'line-auto-named';
      requested: string;
      assigned: string;
    }
  | {
      /** #853 (ADR-3D-209): the ONE channel for «true, and already known».
       *
       *  Four notices used to say this — `shape-redundant` (#612), `redundant-relation` (#396),
       *  `containment-redundant` (#842) and `relation-entailed` (#850) — each with its own kind, its
       *  own string and its own detection, added one per report. A student cannot tell them apart, and
       *  the next case had four precedents pointing three ways. They are now four CASES of one
       *  predicate ({@link alreadyKnown}) on one channel: `rel` says which relation the student stated,
       *  `subject`/`object` carry it in their own wording, and the message is one template.
       *
       *  Each case KEEPS its own conservative entailment test — structural for the containment and the
       *  self-determined pair, numeric-with-a-branch-guard for the ∥/⟂, an apply-time flag for the
       *  shape — because those are the tests the operator ruled on. What converged is the channel and
       *  the wording, never the confidence: when entailment cannot be shown, this says nothing. */
      kind: 'already-known';
      /** Which relation was stated — chooses the wording and names the entailment test that passed. */
      rel: AlreadyKnownRel;
      /** What the statement was about, in the student's own letters («ABCD», «BE», «π1»). */
      subject: string;
      /** The other side, where the relation has one («ABCD» the plane, «π2»). */
      object?: string;
      /** The shape name key, for `rel: 'shape'` only. */
      shape?: QuadBase;
    };

/**
 * #850 — does this seg-vs-plane relation hold in EVERY admissible branch at this sample?
 *
 * The operator chose the numeric route over the structural one. The risk they were shown, and the
 * reason this function exists: a sampled verdict can be confidently wrong — #827, fixed the same
 * day, was exactly that. Seeds vary the GAUGE; they never vary the BRANCH, so a figure with two
 * admissible placements can agree across every seed and still be true in only one of them.
 *
 * `pointRoots` (built for #827) carries the pool's position per point, one entry per solution in
 * pool order, so the branches can be walked directly. Absent ⇒ a single solution ⇒ nothing to miss.
 * Anything unmeasurable answers TRUE-to-abstain here and is refused by the caller's own claim check,
 * because this guard may only ever subtract confidence, never add it.
 */
function relationHoldsInEveryBranch(
  r: Resolved3,
  seg: readonly [Id, Id],
  plane: readonly [Id, Id, Id],
  rel: 'perp' | 'parallel',
): boolean {
  const roots = r.pivot?.pointRoots;
  if (!roots) return true;
  const lists = [...seg, ...plane].map((id) => roots[id]);
  if (lists.some((l) => !l || l.length !== lists[0]!.length)) return true; // not all tracked — abstain
  const n = lists[0]!.length;
  if (n <= 1) return true;
  for (let i = 0; i < n; i++) {
    const [s1, s2, p1, p2, p3] = lists.map((l) => l![i]);
    const d = sub3(s2!, s1!);
    const nrm = cross3(sub3(p2!, p1!), sub3(p3!, p1!));
    const den = norm3(d) * norm3(nrm);
    if (den < 1e-12) return false;
    // ∥ ⇒ the direction is orthogonal to the normal; ⟂ ⇒ it is parallel to it.
    const ok = rel === 'parallel'
      ? Math.abs(dot3(d, nrm)) <= 2e-5 * Math.max(den, 1)
      : norm3(cross3(d, nrm)) <= 2e-5 * Math.max(den, 1);
    if (!ok) return false;
  }
  return true;
}

/**
 * #850 — the plane's name AS THE STUDENT WROTE IT.
 *
 * A `perp-plane` / `par-plane` claim stores three points, because three fix a plane. The student
 * wrote «A'B'C'D'». Naming the truncation back at them would be the honesty invariant's own
 * counter-example — a message must name the statement, never internal state — so the full run is
 * recovered from the figure: a materialised point-run plane if one exists, otherwise the solid FACE
 * the three points open. Falls back to the three only when nothing in the figure matches.
 */
function statedPlaneName(c: Construction3, ids3: readonly Id[]): string {
  const opens = (ring: readonly Id[]) => ring.length >= ids3.length && ids3.every((id, i) => ring[i] === id);
  for (const [name, run] of c.pointPlanes) if (opens(run)) return name;
  for (const s of c.solids) for (const face of s.faces) if (opens(face)) return face.join('');
  return ids3.join('');
}

/**
 * #842 — is this point, BY ITS DEFINITION, already confined to this plane?
 *
 * STRUCTURAL, never numeric, and deliberately conservative. The alternative — checking whether the
 * containment's residual was already zero — would have to judge that at sampled positions, and a
 * quantity that merely *looks* satisfied across the samples it happened to draw is exactly the #827
 * defect (a two-branch value printing as knowledge). A structural entailment cannot be wrong about a
 * branch it never looked at, so the notice can only ever under-claim: when this returns false the
 * statement may still be redundant, and we say nothing rather than risk telling a student their real
 * given added nothing.
 *
 * `visited` guards the recursion; a malformed cycle answers "not entailed", the safe direction.
 */
function pointEntailedInPlane(
  c: Construction3,
  id: Id,
  planeName: string,
  planeIds: readonly Id[],
  visited = new Set<Id>(),
): boolean {
  if (planeIds.includes(id)) return true; // the point is one of the plane's own defining points
  if (visited.has(id)) return false;
  visited.add(id);
  const def = c.points.get(id);
  if (!def) return false;
  const inPlane = (q: Id) => pointEntailedInPlane(c, q, planeName, planeIds, visited);
  switch (def.kind) {
    // A rider the STUDENT stated on this plane is entailed. One the containment itself implied
    // (#841's placeholder) is not — that is the relation doing the work, which is the opposite of
    // redundant, and counting it would make every re-homing containment report itself as pointless.
    case 'on-plane':
      return def.plane === planeName && !def.implied;
    case 'on-segment':
      return inPlane(def.a) && inPlane(def.b); // a point of a segment whose ends lie in the plane
    case 'centroid':
      return def.of.every(inPlane);
    case 'plane-cut':
      return def.plane === planeName || (inPlane(def.a) && inPlane(def.b));
    case 'foot-plane':
    case 'line-plane':
      return def.plane === planeName;
    default:
      return false;
  }
}

/**
 * #853 (ADR-3D-209) — «true, and already known», in ONE predicate.
 *
 * Four reports produced four notices for one sentence to the student: a shape statement the figure
 * already held (#612), a relation between two objects their own definitions already fixed (#396), a
 * containment both endpoints already satisfied (#842), and a ∥/⟂ the built figure implies (#850).
 * Each was added because the previous one did not cover the case at hand — the honest reason, and also
 * the definition of an enumeration growing one member per report. They are cases, not kinds.
 *
 * **What converged: the channel and the wording.** Every case emits one `already-known` notice whose
 * `rel` names the relation, so the fifth case has one place to go and one message template to fill.
 *
 * **What deliberately did NOT converge: the entailment tests.** Each case keeps the test the operator
 * ruled on for it — structural for #396 and #842, numeric-with-a-branch-guard for #850, an apply-time
 * flag for #612. Merging four special cases risks a predicate general enough to over-claim on a case
 * none of them handled, and over-claiming here means telling a student their given was worthless when
 * it was not. The conservative direction is kept in all four: when entailment cannot be SHOWN, say
 * nothing.
 */
function alreadyKnown(c: Construction3, samples: readonly Resolved3[]): BuildNotice3[] {
  const out: BuildNotice3[] = [];

  // ---- case 1 (#612, ADR-3D-158): a shape statement that was true of the figure already.
  // Test: the apply-time flag — `applyShape` records the statement it found nothing to change.
  for (const r of c.redundantShapes) {
    out.push({ kind: 'already-known', rel: 'shape', subject: [...r.ids].join(''), shape: r.base });
  }

  // ---- case 2 (#396, ADR-3D-108): a relation between two SELF-DETERMINED objects could never have
  // driven anything — both are fixed by their own defining equations, so the statement adds nothing.
  // (It was verified at commit, or it would have refused claim-refuted.) Test: structural.
  // Excluded: a side whose direction/normal carries the figure parameter — there the statement PINNED
  // the parameter (2024-Q2's «ℓ ⟂ π»), which is real information. #500: the predicate is
  // `isSelfDetermined`, NOT `isAbsolute` — a FREE plane (#487) is absolute and carries no parameter,
  // yet the stated relation is the very thing that orients it, so the notice would have been a false
  // statement about the student's own given. Deliberately NOT emitted for claims on figure points:
  // there a claim is the verify-your-answer register (the tool's charter), not redundancy.
  {
    const carriesParam = (op: Operand3): boolean =>
      op.kind === 'line' ? lineDirCarriesParam(c, op.name)
      : op.kind === 'plane-named' ? planeNormalCarriesParam(c, op.name)
      : false;
    const pairOf = (cl: Construction3['claims'][number]): [Operand3, Operand3] | null =>
      cl.type === 'plane-rel' || cl.type === 'mutual-rel' || cl.type === 'distance-rel' ? [cl.a, cl.b]
      : cl.type === 'line-rel' ? [cl.op, { kind: 'line', name: cl.line }] : null;
    for (const cl of c.claims) {
      const pair = pairOf(cl);
      if (!pair) continue;
      const [a, b] = pair;
      if (!isSelfDetermined(c, a) || !isSelfDetermined(c, b)) continue;
      if (carriesParam(a) || carriesParam(b)) continue;
      out.push({ kind: 'already-known', rel: 'objects', subject: operandLabel(a), object: operandLabel(b) });
    }
  }

  // ---- case 3 (#842, ADR-3D-192): a containment whose endpoints already lie in the plane by earlier
  // givens — «BE מוכל במישור ABCD» where B defines the plane and E is the midpoint of AC. It changed no
  // point's definition and its claim already held. Test: structural (`pointEntailedInPlane`, per
  // endpoint). Point-run planes only: an absolute plane's redundancy is case 2's lane, and a
  // gauge-riding segment against a point-run plane is never two self-determined sides.
  for (const cl of c.claims) {
    if (cl.type !== 'plane-rel' || cl.rel !== 'contained') continue;
    const planeSide = cl.a.kind === 'plane-run' || cl.a.kind === 'plane-named' ? cl.a : cl.b;
    const linear = planeSide === cl.a ? cl.b : cl.a;
    if (linear.kind !== 'segment') continue;
    const planeName =
      planeSide.kind === 'plane-run' ? planeSide.ids.join('')
      : planeSide.kind === 'plane-named' ? planeSide.name
      : null;
    if (planeName === null) continue;
    const planeIds = c.pointPlanes.get(planeName);
    if (!planeIds) continue; // an equation plane — not this lane
    if (!pointEntailedInPlane(c, linear.a, planeName, planeIds)) continue;
    if (!pointEntailedInPlane(c, linear.b, planeName, planeIds)) continue;
    out.push({ kind: 'already-known', rel: 'contained', subject: operandLabel(linear), object: planeName });
  }

  // ---- case 4 (#850, ADR-3D-198): a ∥ / ⟂ the figure already implies.
  //
  // The counterfactual — *would this hold if the student had not said it?* — is already answered by
  // the LOWERING. `seg-plane-rel` becomes a driving `scalarPin` when the figure still has free dims,
  // and a pure claim otherwise. **A claim with no matching pin constrained nothing**: the figure was
  // determined by the other facts and this sentence only checked it. So the candidate set is exact
  // and costs nothing to compute.
  //
  // Test: NUMERIC (the operator's ruling) — `verifyClaim` already checks `claimSeeds`, four
  // configurations, not one; on top of it the branch guard, so a two-branch figure can never report
  // entailment on the strength of the branch it happened to draw. Sampling is gated behind a candidate
  // existing, so an ordinary figure pays nothing.
  {
    const pinned = new Set(
      c.scalarPins.flatMap((p) =>
        p.kind === 'seg-perp-plane' || p.kind === 'seg-par-plane' ? [`${p.a}${p.b}|${[...p.plane].join('')}`] : [],
      ),
    );
    for (const cl of c.claims) {
      if (cl.type !== 'perp-plane' && cl.type !== 'par-plane') continue;
      const rel = cl.type === 'perp-plane' ? ('perp' as const) : ('parallel' as const);
      // A relation that DROVE the figure is information, not a consequence — never reported.
      if (pinned.has(`${cl.seg[0]}${cl.seg[1]}|${cl.plane.join('')}`)) continue;
      if (samples.length > 0 && !samples.every((r) => relationHoldsInEveryBranch(r, cl.seg, cl.plane, rel))) continue;
      out.push({ kind: 'already-known', rel, subject: cl.seg.join(''), object: statedPlaneName(c, cl.plane) });
    }
  }

  return out;
}

/**
 * Every notice the figure currently warrants. Recomputed on each derive — a notice is a property of
 * the built figure, never a one-shot event, so undo/redo and load all show the right thing.
 */
export function buildNotices3(c: Construction3, samples: readonly Resolved3[] = []): BuildNotice3[] {
  const out: BuildNotice3[] = [];
  // #375: derived from the pin's own flag, so it survives save/load and undo exactly like every notice
  for (const pin of c.planeLinePerps) {
    if (pin.statedAsPlane) out.push({ kind: 'line-called-plane', ids: [...pin.ids], line: pin.line });
  }
  // S2 (#378): the same flag on the general line-relation family
  for (const r of c.lineRels) {
    if (r.statedAsPlane) out.push({ kind: 'line-rel-noun', line: r.line });
  }
  // #333 (ADR-3D-153): an intersection line that did not get the name the student wrote
  for (const [name, def] of c.lines) {
    if (def.kind === 'plane-plane' && def.requested && def.requested !== name) {
      out.push({ kind: 'line-auto-named', requested: def.requested, assigned: name });
    }
  }  for (const s of c.solids) {
    const spec = (QUAD_PYRAMIDS as Partial<Record<SolidKind, { base: QuadBase; right: boolean }>>)[s.kind];
    if (!spec?.right) continue;
    const entry = CYCLIC_MEMBER[spec.base];
    if (entry.fix.kind === 'none') continue; // square / rectangle are cyclic already — nothing changed
    out.push({ kind: 'base-constrained', ids: [...s.ids], from: spec.base, to: CYCLIC_MEMBER_NAME[spec.base] });
  }
  // #853 (ADR-3D-209): everything that says «true, and already known» — one predicate, one channel.
  // The four cases that used to live here inline (a redundant shape, a relation between two
  // self-determined objects, an entailed containment, an implied ∥/⟂) are cases of `alreadyKnown`.
  out.push(...alreadyKnown(c, samples));

  return out;
}
