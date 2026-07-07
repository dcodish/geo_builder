/**
 * THEOREM_COVERAGE — the full-catalog disposition map (theorem-discovery v2, T1;
 * [docs/18 §4](../../docs/18-theorem-relevance-plan.md)).
 *
 * The `catalog.ts` pattern applied to theorems: every citable id in
 * [07-theorem-reference.md](../../docs/07-theorem-reference.md) gets exactly ONE explicit,
 * machine-checked disposition, so "theorems that should appear don't appear" (R1) is answerable
 * in one lookup and the remaining table work is enumerable instead of anecdotal.
 * `integrity.test.ts` asserts TOTALITY (every 07 id has a disposition, no stray keys) and the
 * structural equivalences (`tabled` ⇔ present in `THEOREM_TABLE`; `no-reveal` ⇔ the ADR-208
 * forbidden set; `supplemental` ⇔ the Appendix ids ADR-217 chose NOT to keep).
 *
 * `planned` slices follow the T2 fill order ([18 §10](../../docs/18-theorem-relevance-plan.md)),
 * which itself follows the measured corpus frequency (the fill-order report,
 * `reports/theorem-fill-order.md` — regenerate via the env-gated spec in
 * `__tests__/fill-order.test.ts`). A slice tag is an authoring aid, not a contract — T2 may
 * re-slice as families land; the totality guard only cares that the disposition is explicit.
 */

import type { TheoremId } from './types';

/** The T2 coverage-fill slices, in planned order (docs/18 §10, priority by measured frequency). */
export type FillSlice =
  | 'T2a-congruence'
  | 'T2b-midsegment-median'
  | 'T2c-bisector'
  | 'T2d-right-triangle'
  | 'T2e-isosceles'
  | 'T2f-thales'
  | 'T2g-parallels-converses'
  | 'T2h-circle'
  | 'T2i-quad-converses'
  | 'T2j-sums-and-loci';

export type Disposition =
  /** In THEOREM_TABLE today (integrity: ⇔, both directions). */
  | { kind: 'tabled' }
  /** Structurally excluded — a DERIVED premise would reveal the proof task (ADR-208: 68/70/76). */
  | { kind: 'no-reveal' }
  /** Appendix (O) id the operator chose NOT to keep (ADR-217 kept only A2–A6, B3). */
  | { kind: 'supplemental' }
  /** Scheduled for a T2 coverage slice — an absent id that SHOULD eventually surface. */
  | { kind: 'planned'; slice: FillSlice }
  /** The premise is not expressible with today's constructs — waits on the named capability. */
  | { kind: 'needs-construct'; what: string }
  /** Outside the theorem feed by standing rule (formulas/definitions/trig apparatus). */
  | { kind: 'out-of-scope'; why: string };

const tabled: Disposition = { kind: 'tabled' };
// (The `planned` builder retired with the T2 completion — every id is now `tabled` or carries an
// honest `needs-construct`; the `planned` kind stays in the union for future catalog growth.)

/**
 * Keyed by `String(id)` so numeric ids and the Appendix label strings share one map
 * (the `integrity.test.ts` REF-parser convention).
 */
export const THEOREM_COVERAGE: Record<string, Disposition> = {
  // ===== Angles (1–2) =====
  '1': tabled,
  '2': tabled,

  // ===== Parallels (3–9) =====
  '3': tabled,
  '4': tabled,
  '5': tabled,
  '6': tabled,
  '7': tabled,
  '8': tabled,
  '9': tabled,

  // ===== Triangle basics (10–14) =====
  '10': tabled,
  '11': tabled,
  '12': tabled,
  '13': tabled,
  '14': tabled,

  // ===== Medians / centroid (15–17) =====
  '15': tabled,
  '16': tabled,
  '17': tabled,

  // ===== Congruence (18–21) =====
  '18': tabled,
  '19': tabled,
  '20': tabled,
  '21': tabled,

  // ===== Isosceles (22–27) =====
  '22': tabled,
  '23': tabled,
  '24': tabled,
  '25': tabled,
  '26': tabled,
  '27': tabled,

  // ===== Right triangle (28–34) =====
  '28': tabled,
  '29': {
    kind: 'needs-construct',
    what: 'a stated a²+b²=c² squares-sum relation between three lengths has no constraint form',
  },
  '30': tabled,
  '31': tabled,
  '32': tabled,
  '33': tabled,
  '34': tabled,

  // ===== Angle sums (35–36) =====
  '35': tabled,
  '36': tabled,

  // ===== Kite (37–38) =====
  '37': tabled,
  '38': tabled,

  // ===== Trapezoid (39–42) =====
  '39': tabled,
  '40': tabled,
  '41': tabled,
  '42': tabled,

  // ===== Parallelogram / rectangle / rhombus / square (43–61) =====
  '43': tabled,
  '44': tabled,
  '45': tabled,
  '46': tabled,
  '47': tabled,
  '48': tabled,
  '49': tabled,
  '50': tabled,
  '51': tabled,
  '52': tabled,
  '53': tabled,
  '54': tabled,
  '55': tabled,
  '56': tabled,
  '57': tabled,
  '58': tabled,
  '59': tabled,
  '60': tabled,
  '61': tabled,

  // ===== Midsegments (62–67) =====
  '62': tabled,
  '63': tabled,
  '64': tabled,
  '65': tabled,
  '66': tabled,
  '67': tabled,

  // ===== Similarity (68–71) — 68/70 forbidden (ADR-208), 69/71 admitted (ADR-220) =====
  '68': { kind: 'no-reveal' },
  '69': tabled,
  '70': { kind: 'no-reveal' },
  '71': tabled,

  // ===== Thales / proportion (72–74) =====
  '72': tabled,
  '73': tabled,
  '74': tabled,

  // ===== Angle bisector / in-circle (75–81) — 76 forbidden (ADR-208) =====
  '75': tabled,
  '76': { kind: 'no-reveal' },
  '77': tabled,
  '78': tabled,
  '79': {
    kind: 'needs-construct',
    what: "the equidistant-from-the-sides premise needs a point-to-LINE distance given — no construct/parse path yet",
  },
  '80': tabled,
  '81': tabled,

  // ===== Perpendicular bisector / concurrency / regular polygons (82–90) =====
  '82': tabled,
  '83': tabled,
  '85': tabled,
  '86': tabled,
  '88': {
    kind: 'needs-construct',
    what: 'a circle inscribed in a QUADRILATERAL (4-side tangency) — no construct/parse path yet',
  },
  '89': tabled,
  '90': tabled,

  // ===== Cyclic quadrilateral (87) =====
  '87': tabled,

  // ===== Circle (84, 91–104) =====
  '84': tabled,
  '91': tabled,
  '92': tabled,
  '93': tabled,
  '94': tabled,
  '95': tabled,
  '96': {
    kind: 'needs-construct',
    what: 'the equidistant-chords premise needs a stated centre-to-CHORD (point-to-line) distance — no construct yet',
  },
  '97': tabled,
  '98': tabled,
  '99': tabled,
  '100': tabled,
  '101': tabled,
  '102': tabled,
  '103': tabled,
  '104': tabled,

  // ===== Tangents (105–109) =====
  '105': tabled,
  '106': tabled,
  '107': tabled,
  '108': tabled,
  '109': tabled,

  // ===== Geo-builder cyclic corollaries (200 band) =====
  '201': tabled,

  // ===== Appendix A (practice-only) — ADR-217 kept A2–A6 =====
  A1: { kind: 'supplemental' },
  A2: tabled,
  A3: tabled,
  A4: tabled,
  A5: tabled,
  A6: tabled,

  // ===== Appendix B (removed curriculum) — ADR-217 kept B3 =====
  B1: { kind: 'supplemental' },
  B2: { kind: 'supplemental' },
  B3: tabled,
  B4: { kind: 'supplemental' },
};

/** Disposition lookup for a runtime id (number or Appendix label). */
export const dispositionOf = (id: TheoremId): Disposition | undefined => THEOREM_COVERAGE[String(id)];

/** True when the id is expected in the live feed today (its matcher exists). */
export const isTabled = (id: TheoremId): boolean => dispositionOf(id)?.kind === 'tabled';
