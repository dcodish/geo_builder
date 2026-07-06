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
const planned = (slice: FillSlice): Disposition => ({ kind: 'planned', slice });

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
  '5': planned('T2g-parallels-converses'),
  '6': tabled,
  '7': planned('T2g-parallels-converses'),
  '8': tabled,
  '9': planned('T2g-parallels-converses'),

  // ===== Triangle basics (10–14) =====
  '10': tabled,
  '11': tabled,
  '12': tabled,
  '13': tabled,
  '14': tabled,

  // ===== Medians / centroid (15–17) =====
  '15': planned('T2b-midsegment-median'),
  '16': planned('T2b-midsegment-median'),
  '17': planned('T2b-midsegment-median'),

  // ===== Congruence (18–21) =====
  '18': planned('T2a-congruence'),
  '19': planned('T2a-congruence'),
  '20': planned('T2a-congruence'),
  '21': planned('T2a-congruence'),

  // ===== Isosceles (22–27) =====
  '22': tabled,
  '23': planned('T2e-isosceles'),
  '24': planned('T2e-isosceles'),
  '25': planned('T2e-isosceles'),
  '26': planned('T2e-isosceles'),
  '27': planned('T2e-isosceles'),

  // ===== Right triangle (28–34) =====
  '28': tabled,
  '29': planned('T2d-right-triangle'),
  '30': planned('T2d-right-triangle'),
  '31': planned('T2d-right-triangle'),
  '32': planned('T2d-right-triangle'),
  '33': tabled,
  '34': tabled,

  // ===== Angle sums (35–36) =====
  '35': planned('T2j-sums-and-loci'),
  '36': planned('T2j-sums-and-loci'),

  // ===== Kite (37–38) =====
  '37': tabled,
  '38': tabled,

  // ===== Trapezoid (39–42) =====
  '39': tabled,
  '40': planned('T2i-quad-converses'),
  '41': tabled,
  '42': planned('T2i-quad-converses'),

  // ===== Parallelogram / rectangle / rhombus / square (43–61) =====
  '43': tabled,
  '44': planned('T2i-quad-converses'),
  '45': planned('T2i-quad-converses'),
  '46': tabled,
  '47': planned('T2i-quad-converses'),
  '48': tabled,
  '49': planned('T2i-quad-converses'),
  '50': tabled,
  '51': planned('T2i-quad-converses'),
  '52': tabled,
  '53': planned('T2i-quad-converses'),
  '54': planned('T2i-quad-converses'),
  '55': tabled,
  '56': tabled,
  '57': planned('T2i-quad-converses'),
  '58': planned('T2i-quad-converses'),
  '59': planned('T2i-quad-converses'),
  '60': planned('T2i-quad-converses'),
  '61': planned('T2i-quad-converses'),

  // ===== Midsegments (62–67) =====
  '62': planned('T2b-midsegment-median'),
  '63': planned('T2b-midsegment-median'),
  '64': planned('T2b-midsegment-median'),
  '65': planned('T2b-midsegment-median'),
  '66': planned('T2b-midsegment-median'),
  '67': planned('T2b-midsegment-median'),

  // ===== Similarity (68–71) — 68/70 forbidden (ADR-208), 69/71 admitted (ADR-220) =====
  '68': { kind: 'no-reveal' },
  '69': tabled,
  '70': { kind: 'no-reveal' },
  '71': tabled,

  // ===== Thales / proportion (72–74) =====
  '72': planned('T2f-thales'),
  '73': planned('T2f-thales'),
  '74': planned('T2f-thales'),

  // ===== Angle bisector / in-circle (75–81) — 76 forbidden (ADR-208) =====
  '75': planned('T2c-bisector'),
  '76': { kind: 'no-reveal' },
  '77': planned('T2c-bisector'),
  '78': planned('T2c-bisector'),
  '79': planned('T2c-bisector'),
  '80': planned('T2c-bisector'),
  '81': planned('T2c-bisector'),

  // ===== Perpendicular bisector / concurrency / regular polygons (82–90) =====
  '82': planned('T2j-sums-and-loci'),
  '83': planned('T2j-sums-and-loci'),
  '85': planned('T2j-sums-and-loci'),
  '86': planned('T2j-sums-and-loci'),
  '88': {
    kind: 'needs-construct',
    what: 'a circle inscribed in a QUADRILATERAL (4-side tangency) — no construct/parse path yet',
  },
  '89': planned('T2j-sums-and-loci'),
  '90': planned('T2j-sums-and-loci'),

  // ===== Cyclic quadrilateral (87) =====
  '87': tabled,

  // ===== Circle (84, 91–104) =====
  '84': tabled,
  '91': tabled,
  '92': tabled,
  '93': planned('T2h-circle'),
  '94': tabled,
  '95': planned('T2h-circle'),
  '96': planned('T2h-circle'),
  '97': tabled,
  '98': tabled,
  '99': tabled,
  '100': planned('T2h-circle'),
  '101': planned('T2h-circle'),
  '102': tabled,
  '103': tabled,
  '104': tabled,

  // ===== Tangents (105–109) =====
  '105': tabled,
  '106': planned('T2h-circle'),
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
