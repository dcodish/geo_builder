/**
 * The figure → parser context builder — the SINGLE source of truth for what the app tells the parser
 * about the current figure ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) A3 / TST-2).
 *
 * This was re-implemented three times (App's `parseCtx`, scenarios' `ctxOf`, the triage harness's
 * `ctxFrom`) and the copies drifted: the triage mirror was missing `parallels` (ADR-169), so it
 * misclassified every trapezoid-altitude utterance as a coverage gap — a false signal in the exact tool
 * built to find real gaps. One builder here, imported by all three, prevents that whole drift class.
 *
 * Pure: derives the context from an already-computed figure (construction + positions), so the caller
 * reuses one `replay` for both the context and its own `before` figure.
 */

import type { Construction, GeoObject, Id, Vec } from '@/engine';
import { isGeoPoint, circleMembers, pointNeighbors, parallelEdgePairs } from '@/engine';
import type { ParseContext } from './parse';

/** A circle centre's reference TOKEN ([ADR-342](../../docs/06-decisions.md#adr-342)): an anonymous auto
 *  centre ('@ctr-O') is referenced by its letter ('O' — the circle's name, «מעגל O», `circle-O`), while a
 *  student-named centre IS its letter. Keeps every ctx consumer letter-based; the `centrePoint` map below
 *  carries the translation back to the real point id for rules that use a centre AS A POINT. */
const ctrToken = (centerId: string): string => (centerId.startsWith('@ctr-') ? centerId.slice(5) : centerId);

/**
 * #538 — are the (exactly two) unnamed auto circles INTERCHANGEABLE: is the construction structurally
 * identical under swapping the pair? A fresh pair macro («שני מעגלים משיקים מבחוץ») draws two circles
 * nothing yet distinguishes — binding a student's fresh circle name («היקף מעגל O1 הוא 6π») to either
 * asserts nothing (pure gauge, the ADR-244 creation-binding argument), so the #186 binding may pick
 * deterministically instead of asking a question with no informative answer.
 *
 * The test is a literal ISOMORPHISM check, so it cannot drift from the relation vocabulary: serialize
 * every object and constraint twice — once as-is, once with the pair's ids swapped — and compare the
 * sorted multisets. Normalisation drops what is SEED, not statement (a free radius' value, a free
 * centre's coordinates, `solve` bookkeeping — docs/17 §2.2), and wildcards scaffolding ids (`~…`
 * twins and the auto-minted `radial-toward` touch family, which the tangency `coincide` makes one
 * point). CONSERVATIVE by construction: any member point, stated size/order, or asymmetric relation
 * (containment, internal tangency) serializes differently → NOT interchangeable → the honest clarify.
 */
function autosInterchangeable(construction: Construction): boolean {
  const autos = construction.objects.filter(
    (o): o is Extract<Construction['objects'][number], { kind: 'circle' }> =>
      o.kind === 'circle' && o.autoCenter === true && !o.center.startsWith('~'),
  );
  if (autos.length !== 2) return false;
  const [c1, c2] = autos;
  if (c1.radius.via !== 'free' || c2.radius.via !== 'free') return false; // a stated size distinguishes
  const map = new Map<string, string>([
    [c1.id, c2.id],
    [c2.id, c1.id],
    [c1.center, c2.center],
    [c2.center, c1.center],
  ]);
  const wild = new Set(construction.objects.flatMap((o) => (o.id.startsWith('~') || o.kind === 'radial-toward' ? [o.id] : [])));
  const norm = (v: unknown, swap: boolean): unknown => {
    if (typeof v === 'string') return wild.has(v) ? '*' : swap ? (map.get(v) ?? v) : v;
    if (Array.isArray(v)) return v.map((x) => norm(x, swap));
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        if (k === 'solve') continue; // solver bookkeeping, never semantics (docs/17 §2.2)
        if (k === 'value' && o.via === 'free') continue; // a free radius' SEED value
        if ((k === 'x' || k === 'y') && o.kind === 'free-point' && !o.pinned && !o.rigid) continue; // a free point's seed
        out[k] = norm(o[k], swap);
      }
      return out;
    }
    return v;
  };
  const canon = (swap: boolean): string =>
    [...construction.objects.map((o) => JSON.stringify(norm(o, swap))), ...construction.constraints.map((k) => JSON.stringify(norm(k, swap)))]
      .sort()
      .join('\n');
  return canon(false) === canon(true);
}

export function buildParseCtx(construction: Construction, positions: Map<Id, Vec>): ParseContext {
  return {
    // Exclude pure SCAFFOLDING circles (a tangent's Thales aux), marked by a `~`-prefixed centre — the
    // student never references them, so they must not make "the circle" / "chord CE" ambiguous.
    // DEDUPED per centre letter (ADR-244): a concentric pair is ONE referenceable centre — "the circle" /
    // an unnamed chord still resolves to it, and the concentric post-pass (qualifier / membership /
    // clarify) decides WHICH of the pair. Two distinct centres stay two entries, as before.
    circles: [...new Set(construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [ctrToken(o.center)] : [])))],
    // Centre TOKEN → the centre's real POINT id (ADR-342): identity for named centres, '@ctr-…' for
    // anonymous auto centres — the translation rules use when a centre serves AS A POINT.
    centrePoint: Object.fromEntries(
      construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [[ctrToken(o.center), o.center] as [Id, Id]] : [])),
    ),
    // Centre letters that were AUTO-assigned (unnamed circle → hidden centre): «מרכז המעגל הוא P» renames
    // one of these to the student's letter instead of minting a second circle (issue #112).
    autoCenters: construction.objects.flatMap((o) => (o.kind === 'circle' && o.autoCenter && !o.center.startsWith('~') ? [ctrToken(o.center)] : [])),
    // #538: whether the two unnamed circles are structurally identical under the pair swap — lets the
    // #186 binding name-by-use deterministically when asking "which circle?" has no informative answer.
    autosInterchangeable: autosInterchangeable(construction),
    // #539: points that lie structurally BETWEEN two others BY CONSTRUCTION — the candidates a fresh
    // set-line label may bind to by naming-by-use (SEMANTIC: read off object kinds, never coordinates).
    structuralBetween: (() => {
      const out: { point: Id; a: Id; b: Id }[] = [];
      const byId = new Map(construction.objects.map((o) => [o.id, o] as const));
      const centreOf = new Map(construction.objects.flatMap((o) => (o.kind === 'circle' ? [[o.id, o.center] as [Id, Id]] : [])));
      // The EXTERNAL mutual-tangency touch: a coincide of two radial-toward twins, EACH aimed at the
      // other's centre — that touch is between the centres by construction. (The internal lowering aims
      // its witness at the touch point, not a centre — correctly excluded: an internal touch is outside.)
      for (const k of construction.constraints) {
        if (k.type !== 'coincide') continue;
        const p = byId.get(k.p);
        const q = byId.get(k.q);
        if (p?.kind !== 'radial-toward' || q?.kind !== 'radial-toward') continue;
        const pc = centreOf.get(p.circle);
        const qc = centreOf.get(q.circle);
        if (!pc || !qc || p.toward !== qc || q.toward !== pc) continue;
        for (const t of [p, q]) if (!t.id.startsWith('~')) out.push({ point: t.id, a: pc, b: qc });
      }
      for (const o of construction.objects) {
        if (o.kind === 'midpoint') out.push({ point: o.id, a: o.a, b: o.b });
        else if (o.kind === 'on-segment' && !o.extension) out.push({ point: o.id, a: o.a, b: o.b });
      }
      return out;
    })(),
    // Concentric pairs (ADR-244): the bound roles, read off the inner circle's `innerOf` marker.
    concentric: construction.objects.flatMap((o) =>
      o.kind === 'circle' && o.innerOf ? [{ center: o.center, outer: o.innerOf, inner: o.id }] : [],
    ),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction), // "arc BC" resolves to the circle holding both B and C
    neighbors: pointNeighbors(construction), // a single-vertex angle ("∠C קהה/חדה") finds its two arms
    onSegment: Object.fromEntries(
      construction.objects.flatMap((o) => (o.kind === 'on-segment' ? [[o.id, [o.a, o.b]] as [Id, [Id, Id]]] : [])),
    ), // which side a free point rides — lets a base-less midsegment (ADR-199) resolve E's host side
    midpointOf: Object.fromEntries(
      construction.objects.flatMap((o) => (o.kind === 'midpoint' ? [[o.id, [o.a, o.b]] as [Id, [Id, Id]]] : [])),
    ), // which side an existing midpoint bisects — lets a base-less named midsegment anchor on it (ADR-199 Am.)
    parallels: parallelEdgePairs(construction, positions), // "height from C" drops to a trapezoid's opposite base (ADR-169)
    lines: construction.objects.flatMap((o) => (o.kind === 'line' ? [o.id] : [])), // idempotent construct reuse
    tangentAuxes: construction.objects.flatMap((o) => (o.kind === 'circle' && o.id.startsWith('tanaux-') ? [o.id] : [])), // existing Thales tangent-aux circles — a 2nd single tangent from the SAME apex takes the OTHER branch (issue #142)
    polygons: construction.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])), // definite "the quad" binds to the existing one
    // #770: the DECLARED kind travels with each ring, so a definite shape noun («אלכסוני הריבוע»)
    // resolves on what the student named, never on "whichever quad exists".
    declaredPolygons: construction.objects.flatMap((o) => (o.kind === 'polygon' ? [{ vertices: o.vertices, kind: o.declaredAs }] : [])),
    // #775: side ROLES the figure's declarations induce — «תיכון ליתר» resolves the hypotenuse of the
    // right triangle, «לבסיס» the isosceles base. SEMANTIC on purpose: read off the declared structure
    // (the perp-offset the right-triangle macro builds, a ⟂/90° constraint at a triangle vertex, the
    // equal-sides constraint the isosceles variant lowers to) — never off drawn coordinates, so a side
    // that merely MEASURES equal at this seed never becomes «the base» (ADR-052).
    roleSides: (() => {
      const out: { role: 'hypotenuse' | 'base' | 'leg'; edge: [Id, Id] }[] = [];
      const push = (role: 'hypotenuse' | 'base' | 'leg', edge: [Id, Id]): void => {
        if (!out.some((r) => r.role === role && ((r.edge[0] === edge[0] && r.edge[1] === edge[1]) || (r.edge[0] === edge[1] && r.edge[1] === edge[0])))) out.push({ role, edge });
      };
      const tris = construction.objects.filter((o): o is Extract<GeoObject, { kind: 'polygon' }> => o.kind === 'polygon' && o.vertices.length === 3);
      /** The vertex both segments share, when segments (a,b) and (c,d) meet at one point. */
      const sharedVertex = (a: Id, b: Id, c: Id, d: Id): Id | null => {
        const shared = [a, b].filter((x) => x === c || x === d);
        return shared.length === 1 ? shared[0] : null;
      };
      for (const t of tris) {
        const vs = t.vertices;
        const inTri = (id: Id): boolean => vs.includes(id);
        const rightAt = new Set<Id>();
        for (const o of construction.objects) {
          // the right-triangle macro's structural build: the perp-offset anchored at the right-angle vertex
          if (o.kind === 'perp-offset' && inTri(o.anchor) && inTri(o.to) && inTri(o.id) && o.anchor === o.from) rightAt.add(o.anchor);
        }
        for (const con of construction.constraints) {
          if (con.type === 'perpendicular') {
            const v = sharedVertex(con.a, con.b, con.c, con.d);
            if (v && inTri(v) && [con.a, con.b, con.c, con.d].every(inTri)) rightAt.add(v);
          }
          if (con.type === 'angle' && con.value === 90 && inTri(con.vertex) && inTri(con.ray1) && inTri(con.ray2)) rightAt.add(con.vertex);
        }
        if (rightAt.size === 1) {
          const [v] = rightAt;
          push('hypotenuse', vs.filter((x) => x !== v) as [Id, Id]);
        }
        for (const con of construction.constraints) {
          const isEq = con.type === 'equal' || (con.type === 'ratio' && con.k === 1 && !con.add);
          if (!isEq) continue;
          const c4 = con as { a: Id; b: Id; c: Id; d: Id };
          if (![c4.a, c4.b, c4.c, c4.d].every(inTri)) continue;
          const apex = sharedVertex(c4.a, c4.b, c4.c, c4.d);
          if (!apex) continue;
          push('leg', [c4.a, c4.b].sort() as [Id, Id]);
          push('leg', [c4.c, c4.d].sort() as [Id, Id]);
          push('base', vs.filter((x) => x !== apex) as [Id, Id]);
        }
      }
      return out;
    })(),
    // Every circle pair's MUTUAL POSITION (from the drawn seed, tangency tol-based) — the two-touch
    // common-tangent CAPACITY depends on it (#197 Am. 4): disjoint 4, externally tangent / intersecting
    // 2 (the remaining tangents pass through the touch / don't exist), internally tangent or contained 0.
    circlePairPositions: (() => {
      const cs = construction.objects.filter((o): o is Extract<typeof o, { kind: 'circle' }> => o.kind === 'circle' && !o.center.startsWith('~'));
      const out: Record<string, 'disjoint' | 'ext-tangent' | 'intersecting' | 'int-tangent' | 'contained'> = {};
      const radiusOf = (c: (typeof cs)[number]): number | null => {
        if (c.radius.via === 'through') {
          const a = positions.get(c.center);
          const t = positions.get(c.radius.point);
          return a && t ? Math.hypot(a.x - t.x, a.y - t.y) : null;
        }
        return 'value' in c.radius ? c.radius.value : null;
      };
      for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++) {
          const p1 = positions.get(cs[i].center);
          const p2 = positions.get(cs[j].center);
          const r1 = radiusOf(cs[i]);
          const r2 = radiusOf(cs[j]);
          if (!p1 || !p2 || r1 === null || r2 === null) continue;
          const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const tol = 0.03 * (r1 + r2);
          const key = [cs[i].id, cs[j].id].sort().join('|');
          out[key] =
            Math.abs(d - (r1 + r2)) <= tol ? 'ext-tangent'
            : d > r1 + r2 ? 'disjoint'
            : Math.abs(d - Math.abs(r1 - r2)) <= tol ? 'int-tangent'
            : d > Math.abs(r1 - r2) ? 'intersecting'
            : 'contained';
        }
      return out;
    })(),
    // The TOUCH POINT of each tangent circle pair, resolved POSITIONALLY (#197 Am. 5): the point lying
    // on both circles (within tol) — the referent of the ROLE phrase «בנקודת ההשקה» / "at the touch
    // point". Membership lists can't answer this (the coincide-driven construction registers the touch
    // on ONE circle; the tangency drives the other side), so the drawn coordinates are the truth.
    circlePairTouches: (() => {
      const cs = construction.objects.filter((o): o is Extract<typeof o, { kind: 'circle' }> => o.kind === 'circle' && !o.center.startsWith('~'));
      const out: Record<string, Id> = {};
      const radiusOf = (c: (typeof cs)[number]): number | null => {
        if (c.radius.via === 'through') {
          const a = positions.get(c.center);
          const t = positions.get(c.radius.point);
          return a && t ? Math.hypot(a.x - t.x, a.y - t.y) : null;
        }
        return 'value' in c.radius ? c.radius.value : null;
      };
      const pts = construction.objects.filter(isGeoPoint);
      for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++) {
          const p1 = positions.get(cs[i].center);
          const p2 = positions.get(cs[j].center);
          const r1 = radiusOf(cs[i]);
          const r2 = radiusOf(cs[j]);
          if (!p1 || !p2 || r1 === null || r2 === null) continue;
          const tol = 0.05 * (r1 + r2);
          for (const pt of pts) {
            if (pt.id === cs[i].center || pt.id === cs[j].center) continue;
            const v = positions.get(pt.id);
            if (!v) continue;
            if (Math.abs(Math.hypot(v.x - p1.x, v.y - p1.y) - r1) <= tol && Math.abs(Math.hypot(v.x - p2.x, v.y - p2.y) - r2) <= tol) {
              out[[cs[i].id, cs[j].id].sort().join('|')] = pt.id;
              break;
            }
          }
        }
      return out;
    })(),
    // Existing COMMON tangents per circle pair (#197): touch pairs (A on c1, B on c2) recognised by the
    // paired radius-⟂-tangent constraints the common-tangent lowering emits — a REPEATED «משיק משותף»
    // must take an untaken tangent, so the rule passes these as its `avoid` list.
    commonTangents: (() => {
      const centreOf = new Map(construction.objects.flatMap((o) => (o.kind === 'circle' ? [[o.center, o.id] as [Id, Id]] : [])));
      const out: Record<string, { pair: [Id, Id]; kind?: 'external' | 'internal' }[]> = {};
      const perps = construction.constraints.filter((c) => c.type === 'perpendicular');
      for (const c of perps) {
        if (c.type !== 'perpendicular') continue;
        // The tangent-side pattern: radius (centre→touch) ⟂ (touch→other touch), i.e. b === c and
        // `a` is a circle centre. Pair two such constraints sharing the same segment {c,d}.
        if (c.b !== c.c || !centreOf.has(c.a)) continue; // this ⟂: radius to the touch at the segment's C end
        // The mate: the OTHER end's radius-⟂ on the same segment (b === d there).
        const mate = perps.find(
          (m) => m !== c && m.type === 'perpendicular' && centreOf.has(m.a) && m.c === c.c && m.d === c.d && m.b === m.d,
        );
        if (!mate || mate.type !== 'perpendicular') continue;
        const id1 = centreOf.get(c.a)!;
        const id2 = centreOf.get(mate.a)!;
        if (id1 === id2) continue;
        const key = [id1, id2].sort().join('|');
        const pair: [Id, Id] = id1 <= id2 ? [c.b, mate.b] : [mate.b, c.b];
        // The tangent's KIND, read off the drawn positions (external = centres on the same side of the
        // tangent line) — lets the rule refuse a third external/internal deterministically (#197 Am. 3).
        const A = positions.get(c.b);
        const B = positions.get(mate.b);
        const p1 = positions.get(c.a);
        const p2 = positions.get(mate.a);
        let kind: 'external' | 'internal' | undefined;
        if (A && B && p1 && p2) {
          const side = (q: Vec) => (B.x - A.x) * (q.y - A.y) - (B.y - A.y) * (q.x - A.x);
          const s = side(p1) * side(p2);
          if (Math.abs(s) > 1e-12) kind = s > 0 ? 'external' : 'internal';
        }
        (out[key] ??= []).push({ pair, kind });
      }
      return out;
    })(),
    radiusSymbols: construction.objects.flatMap((o) =>
      o.kind === 'circle' && o.radiusSymbol ? [{ name: o.radiusSymbol, circle: o.id, center: o.center }] : [],
    ), // "R = 1.5r" / "R > r" resolve each letter to its circle (issue #54)
    angleAliases: construction.objects.flatMap((o) =>
      o.kind === 'angle-alias' ? [{ name: o.id, vertex: o.vertex, ray1: o.ray1, ray2: o.ray2 }] : [],
    ), // «נסמן זוית BAM כ-A1» — «זוית A1» resolves through the alias at the parse seam (issue #235)
    radiusOrder: construction.objects.flatMap((o) =>
      o.kind === 'circle' && o.orderedBelow ? [{ outer: o.orderedBelow, inner: o.id }] : [],
    ), // recorded size roles — «המעגל הגדול/הקטן» resolves consistently once assigned (issue #102)
    circleXs: construction.objects.flatMap((o) => {
      // each referenceable centre's drawn x — «המעגל הימני/השמאלי» (the right/left circle, #188) resolves
      // a POINTING gesture against what the student is looking at; dedupe follows `circles` (a concentric
      // pair is ONE referenceable centre).
      if (o.kind !== 'circle' || o.center.startsWith('~')) return [];
      const c = positions.get(o.center);
      return c ? [{ center: ctrToken(o.center), x: c.x }] : [];
    }),
    circleSizes: construction.objects.flatMap((o) => {
      if (o.kind !== 'circle') return [];
      // the circle's CURRENT drawn size (seed base for a free radius; |centre·through| when derivable) —
      // the M4 soft default a first «המעגל הגדול» assignment reads (what the student is looking at)
      const r =
        o.radius.via === 'free' || o.radius.via === 'length'
          ? o.radius.value
          : o.radius.via === 'through'
            ? (() => {
                const c = positions.get(o.center);
                const t = positions.get(o.radius.point);
                return c && t ? Math.hypot(t.x - c.x, t.y - c.y) : null;
              })()
            : null;
      return r !== null && r !== undefined ? [{ id: o.id, center: o.center, r }] : [];
    }),
  };
}
