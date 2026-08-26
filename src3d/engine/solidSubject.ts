/**
 * WHICH SOLID DID THE STUDENT MEAN? — the definite-noun resolver (#766/#765, ADR-3D-169).
 *
 * A volume statement names its subject three ways, and until now the engine read only one of them:
 * a bare run of exactly four letters, hard-coded as "a tetrahedron". On «פירמידה ישרה מרובעת ABCDS»
 * the natural sentence «נפח הפירמידה ABCD = 11» names the pyramid's BASE run, whose triple product is
 * 0 by construction — so a TRUE given came back `claim-refuted` («check your arithmetic»), while the
 * degenerate «נפח הפירמידה ABCD = 0» was accepted as true. Two honesty invariants inverted at once.
 *
 * The class had already been ruled in 2-D: [ADR-457](docs/06-decisions.md#adr-457) — *a definite shape
 * reference resolves on the DECLARED kind, and the figure remembers what each ring was declared to be.*
 * That ADR's sibling audit concluded 3-D needed no port; the measurements on #766 refuted it.
 *
 * **Operator ruling (2026-08-26):** *"If there is only one pyramid, just says the pyramid volume is 11
 * should be understood. if there is more than one option of a pyramid, we can ask user to be more
 * specific with the letters they use"* — i.e. resolve from figure context when unambiguous, ask when
 * not, never pick one arbitrarily (ADR-052: picking asserts a given the student never stated). Same
 * shape as 2-D's omitted-vertex angle (ADR-164 / ADR-261).
 *
 * ONE resolver over the solid vocabulary, never a per-noun enumeration (`src3d/CLAUDE.md`: *"An
 * enumeration is not a rule"*) — and one resolver for both consumers, the CLAIM lane and the QUERY
 * lane, which had drifted into two different readings of the same sentence.
 */
import type { Construction3, Id, SolidKind, SolidNoun, SolidObj } from './types';
import { centroid3, cross3, dot3, sub3, type Vec3 } from './vec3';

/**
 * Which declared kinds each noun admits. Derived from the kind's own name rather than listed
 * one-by-one, so a kind added to `SolidKind` tomorrow is classified the same day — the enumeration
 * this file exists to avoid. `tetra` is a triangular pyramid by definition, so «הפירמידה» admits it.
 */
export type { SolidNoun };

export function nounAdmits(noun: SolidNoun, kind: SolidKind): boolean {
  switch (noun) {
    case 'any':
      return true;
    case 'pyramid':
      return kind.startsWith('pyramid') || kind === 'tetra';
    case 'tetra':
      return kind === 'tetra';
    case 'cube':
      return kind === 'cube';
    case 'box':
      return kind === 'box' || kind === 'cube'; // a cube IS a box; «התיבה» on a lone cube resolves
    case 'prism':
      return kind.startsWith('prism') || kind === 'parallelepiped' || kind === 'box' || kind === 'cube';
  }
}

export type SolidSubject =
  /** Exactly one declared solid answers the description. */
  | { kind: 'solid'; solid: SolidObj }
  /** No declared solid, but four named points — the bare-tetrahedron reading, preserved byte-for-byte. */
  | { kind: 'tetra'; ids: Id[] }
  /** Several solids answer it — ASK which, never guess (the operator's ruling). */
  | { kind: 'ambiguous'; count: number }
  /** Nothing in the figure answers it — refuse, naming the student's statement. */
  | { kind: 'none' };

const sameSet = (a: readonly Id[], b: readonly Id[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Resolve the subject of a solid statement.
 *
 * @param ids the letter run the student wrote — EMPTY when they wrote only the noun («נפח הפירמידה»).
 *
 * A run identifies a solid when it is that solid's FULL vertex run **or one of its faces** — the
 * pyramid's base run is how a bagrut question names it, and reading only the full run is what made
 * «נפח הפירמידה ABCD» arithmetically refutable on a square-base pyramid.
 */
export function resolveSolidSubject(c: Construction3, noun: SolidNoun, ids: readonly Id[]): SolidSubject {
  const byNoun = c.solids.filter((s) => nounAdmits(noun, s.kind));
  if (ids.length === 0) {
    // Noun only: the figure must supply the subject. One candidate is the answer; several is a question.
    if (byNoun.length === 1) return { kind: 'solid', solid: byNoun[0] };
    return byNoun.length === 0 ? { kind: 'none' } : { kind: 'ambiguous', count: byNoun.length };
  }
  const named = byNoun.filter((s) => sameSet(s.ids, ids) || s.faces.some((f) => sameSet(f, ids)));
  if (named.length === 1) return { kind: 'solid', solid: named[0] };
  if (named.length > 1) return { kind: 'ambiguous', count: named.length };
  // No declared solid carries this run. Four named points are still a tetrahedron — the pre-existing
  // reading, and the one form #765's locks require to stay byte-identical.
  if (ids.length === 4 && ids.every((id) => c.points.has(id))) return { kind: 'tetra', ids: [...ids] };
  return { kind: 'none' };
}

/**
 * The volume of a resolved subject — ONE computation for the claim lane and the query lane.
 *
 * A convex solid's volume comes from its own face rings (centroid fan → tetra sum, orientation-free),
 * so it is correct for every declared kind. The `|triple product| / 6` formula is correct only for an
 * actual tetrahedron, and selecting it by LETTER COUNT — four letters, therefore a tetra — is what
 * made a square-base pyramid's base run evaluate to 0.
 */
export function subjectVolume(subject: SolidSubject, pos: Map<Id, Vec3>): number | null {
  if (subject.kind === 'tetra') {
    const ps = subject.ids.map((id) => pos.get(id));
    if (ps.some((p) => !p)) return null;
    return Math.abs(dot3(sub3(ps[1]!, ps[0]!), cross3(sub3(ps[2]!, ps[0]!), sub3(ps[3]!, ps[0]!)))) / 6;
  }
  if (subject.kind !== 'solid') return null;
  const verts = subject.solid.ids.map((id) => pos.get(id));
  if (verts.some((p) => !p)) return null;
  const ctr = centroid3(verts as Vec3[]);
  let V = 0;
  for (const face of subject.solid.faces) {
    const fp = face.map((id) => pos.get(id));
    if (fp.some((p) => !p)) return null;
    for (let i = 1; i + 1 < fp.length; i++) {
      V += Math.abs(dot3(sub3(fp[0]!, ctr), cross3(sub3(fp[i]!, ctr), sub3(fp[i + 1]!, ctr)))) / 6;
    }
  }
  return V;
}
