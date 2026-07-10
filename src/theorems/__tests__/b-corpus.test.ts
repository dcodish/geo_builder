/**
 * The B-series corpus gate (theorem-discovery v2 **T1** — docs/18 §9.1/§10): all 22 booklet
 * questions (B1–B4, B6–B23; B5 removed by the operator) from
 * `docs/sample questions/theorem-ground-truth.md`, each replayed step-by-step through the REAL
 * pipeline (parse-with-context → fact list → `replay` → `detectTheorems`), with **membership
 * assertions only** (ranking assertions arrive in T3 per §9.2).
 *
 * T1 SEMANTICS — "green on today's table, misses documented, never silent":
 *  - `expect`  — ground-truth `expectSurfaced` ids that are TABLED and FIRE today → asserted ⊆ the
 *    final feed. A regression that stops any of these from surfacing fails here.
 *  - `gaps`    — ground-truth-expected ids that are tabled but DON'T fire today (an R2 evidence
 *    gap: e.g. tangency-at-an-existing-point lowers to `set-perpendicular`, invisible to
 *    `tangentPoints`; a `set-concyclic` quad invisible to the 87 matcher). Asserted **∉ feed** so
 *    the moment a T2 evidence fix makes one fire, this test flags it and the id MOVES to `expect`
 *    — a documented miss can never silently linger or silently flip.
 *  - `planned` — ground-truth-expected ids that are NOT tabled at all → asserted to carry a
 *    `planned`/`needs-construct` disposition in THEOREM_COVERAGE (the §4 map), i.e. the miss is
 *    scheduled, not invisible.
 *  - `never`   — ground-truth `mustNotSurface` ids that are tabled and have NO admitted evidence
 *    path in the figure → asserted absent from the **L1/L2 feed (no detected shapes)** at every
 *    step. The L1/L2 restriction matches the D4 default (the strict worksheet view): the ADR-220
 *    parallel-cut similarity (69/71 where a ∥ is *stated*) and B1-rule detected-shape triggers are
 *    deliberate admissions, NOT no-reveal breaches, so questions with a stated parallel omit 69/71
 *    from `never` (each notes it).
 *
 * Utterances are authored from each question's **Givens** line only (never a proof result); a
 * phrasing today's grammar can't lower deterministically is recorded as its canonical
 * decomposition — the commands the LLM fallback would emit (the standing LLM-mocked rule). Two
 * feed-neutral omissions for CI cost, each noted in place: B13's area-ratio given (a ~30 s
 * `set-area-ratio` solve that no matcher reads) and per-question `finalShapes: false` where
 * `detectShapes` is disproportionate (B4 ~28 s, B8 ~54 s, B10 ~7 s) and no expected id needs the
 * detected-shape (L3) lane.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx, droppedNewLabels } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { detectShapes } from '@/engine';
import type { AnyCommand } from '@/engine';
import { detectTheorems, visibleFeed } from '../detect';
import { dispositionOf } from '../coverage';
import type { TheoremId } from '../types';

interface BQuestion {
  id: string;
  title: string;
  /** Utterances stating the question's GIVENS, in booklet order (canonical forms where needed). */
  steps: string[];
  /** Tabled + firing today — asserted ⊆ the final feed (with shapes when `finalShapes`). */
  expect: TheoremId[];
  /** Tabled + ground-truth-expected + NOT firing today — asserted ∉ feed until a T2 fix flips it. */
  gaps?: TheoremId[];
  /** Ground-truth-expected but not tabled — asserted `planned`/`needs-construct` in the §4 map. */
  planned?: TheoremId[];
  /** Tabled mustNotSurface ids with no admitted path — asserted ∉ the L1/L2 feed at every step. */
  never?: TheoremId[];
  /** Run detectShapes for the final feed (default true; off where cost ≫ value — see header). */
  finalShapes?: boolean;
  /** A DOCUMENTED build failure (`replay().lastError` non-null): the figure is partial, an engine
   *  finding is on record, and the assertion pins the message so a fix (or a new breakage) flags
   *  loudly. Questions without this must build with NO lastError — T2 hardening (ADR-243; the T1
   *  wiring asserted parse-commit only, which let a failing group hide). */
  knownBuildIssue?: string;
  note?: string;
}

const CORPUS: BQuestion[] = [
  {
    id: 'B1',
    title: 'cyclic quadrilateral, tangent at A, double-isosceles forcing AB = AD',
    steps: [
      'quadrilateral ABCD inscribed in circle O',
      'G on CD',
      'AB = AG',
      'CB = CG',
      'the tangent at A meets the extension of CD at L',
      'the extension of CB meets the line LA at K',
    ],
    expect: [87, 105, 107, 22],
    gaps: [1, 91],
    // 94/101's premise (AB = AD) is DERIVED in א; only ONE tangent exists (K, A, L collinear on
    // it) so the two-tangents pair must stay silent.
    never: [69, 94, 108, 109],
  },
  {
    id: 'B2',
    title: 'rhombus, perpendicular bisector meets a diagonal, two circumcenters',
    steps: [
      'rhombus ABCD',
      'E is the midpoint of AB',
      'F is the midpoint of BC',
      'K is the intersection of AC and BD',
      // The booklet compound, parsed natively since the ADR-236 LINE_CUT fix (it used to drop G /
      // grab D, needing a canonical decomposition here):
      'the perpendicular to AB at E cuts the extension of BD at G',
      'M is the intersection of GF and AC',
      // "M is the circumcenter of △BDC" is a GIVEN (operator resolution #4) — stated as the
      // circle it defines:
      'circle centered at M through B',
      'D on circle M',
      'C on circle M',
    ],
    expect: [55, 56, 43, 46, 48, 50, 82],
    gaps: [98, 84, 91],
    never: [69],
  },
  {
    id: 'B3',
    title: 'isosceles triangle, two perpendicular medians, centroid, circle around ALKC',
    steps: [
      'triangle ABC',
      'AB = BC',
      'AK median to BC',
      'CL median to AB',
      'D is the intersection of AK and CL',
      'AK perpendicular to CL',
      'quadrilateral ALKC inscribed in circle M',
    ],
    expect: [22, 28, 91, 2, 10, 87, 15, 16, 17, 24],
    gaps: [99],
    never: [69],
    note: '84 is ground-truth background but its premise is genuinely unmet (△ABC is not the inscribed shape) — omitted, not a gap.',
  },
  {
    id: 'B4',
    title: 'triangle on a diameter, two tangents from an external point, bisector to the chord',
    steps: [
      'circle O',
      'diameter BF in circle O',
      'triangle BCF inscribed in circle O',
      // The second tangent's touch point is unnamed in the booklet; T is the canonical label.
      'from point A outside circle O two tangents touch the circle at B and T',
      'D on the extension of CF',
      'D on line AT',
      'AD perpendicular to CD',
      'K on BC',
      'FK bisects angle BFC',
    ],
    expect: [103, 104, 28, 84, 1, 105, 107, 108, 109, 75, 78],
    // (The tangent bundle fires since ADR-244's radius-⟂ tangency fingerprint; the stated bisector
    // FK fires 75/78. 35 is ground-truth background but its premise — quad ABFD — is never drawn
    // as a quad in the wiring, so it is omitted, not a gap.)
    never: [69],
    finalShapes: false,
    note: '76 is expectSurfaced in the ground truth (stated bisector) but stays structurally excluded (no-reveal, ADR-208); the T5 principles lane is its designated carrier.',
  },
  {
    id: 'B6',
    title: 'diameter, two parallel chords, equal arcs, rhombus AFKC',
    steps: [
      'circle O',
      'diameter AB in circle O',
      'chord CD in circle O',
      'chord AF in circle O',
      'CD parallel to AF',
      'K is the intersection of AB and CD',
      'arc CA = arc AF in circle O',
    ],
    expect: [103, 104, 94, 8, 2, 102, 92, 101],
    gaps: [4, 6],
    never: [],
    note: '68 (mustNot) is structurally excluded; 45/59/23 are planned converses, feed-absent today by construction.',
  },
  {
    id: 'B7',
    title: 'three medians, midsegment through the centroid, cyclic AEMD',
    steps: [
      'triangle ABC',
      'CE median to AB',
      'BD median to AC',
      'AF median to BC',
      'M is the intersection of CE and BD',
      // The third median passes through the centroid — a theorem-true check, stated as the given:
      'M on line AF',
      'K is the intersection of AM and ED',
      'circle through A E M',
      'D on the circle',
    ],
    expect: [91, 2, 1, 10, 15, 16, 17, 62],
    gaps: [102],
    never: [69],
  },
  {
    id: 'B8',
    title: 'cyclic kite (right kite), BE ⊥ DC, ¼-area similarity',
    steps: [
      // The kite word carries its shape-variant since ADR-236 (it used to be silently dropped);
      // the booklet also states the equal pairs explicitly — they pin the axis (ADR-138):
      'kite ABCD inscribed in circle O',
      'AB = AD',
      'CB = CD',
      'E on DC',
      'BE perpendicular to DC',
      'N is the intersection of BE and AC',
      // The compact S-form commits since the ADR-236 droppedNewLabels marker mask:
      'S_{ACD} = 4 S_{NCE}',
    ],
    expect: [87, 28, 2, 22, 94, 37, 38],
    gaps: [10, 84, 91],
    never: [69, 71, 104, 20],
    finalShapes: false,
    note: '104 must stay silent — no diameter is STATED (∠ADC = 90° is what the student proves in א).',
  },
  {
    id: 'B9',
    title: 'two intersecting circles, cross-tangent chords, emergent parallelogram CEDF',
    steps: [
      'two circles intersect at A and B',
      'chord AD in circle P',
      'AD is tangent to circle O at A',
      'chord CB in circle O',
      'CB is tangent to circle P at B',
      'AC extended meets circle P at E',
      'BD extended meets circle O at F',
    ],
    expect: [102, 87, 105, 107],
    never: [69, 71],
  },
  {
    id: 'B10',
    title: 'parallelogram, two midpoints, midsegment area, Thales ratio',
    steps: [
      'parallelogram ABCD',
      'angle DAB is acute',
      'E is the midpoint of BC',
      'F is the midpoint of CD',
      'S_{ECF} = S',
      'L is the midpoint of BE',
      // "a line through L parallel to AB cuts BF at M and AD at N" — canonical decomposition
      // (both ∥-to-AB constraints force L, M, N onto one line through L):
      'M on BF',
      'LM parallel to AB',
      'N on AD',
      'LN parallel to AB',
      'BE = EF',
    ],
    expect: [43, 46, 48, 50, 22, 8],
    // 73 is tabled but silent here: the stated ∥ cuts triangle ABF whose side AF is never drawn,
    // so the parallel-cut evidence has no triangle to bind to (a structural-triangle gate miss).
    gaps: [73],
    never: [],
    finalShapes: false,
    note: '69/71 omitted from never — a ∥ is stated (ADR-220 admitted path).',
  },
  {
    id: 'B11',
    title: 'tangent pair at 90°, circumcircle of the contact triangle',
    steps: [
      'circle O',
      'from point A outside circle O two tangents touch the circle at B and C',
      'angle CAB = 90',
      'chord BE in circle O',
      'chord CE in circle O',
      'the circle through A B C cuts CE at D',
    ],
    expect: [108, 109, 105, 107, 104, 91, 102],
    never: [69, 71],
  },
  {
    id: 'B12',
    title: 'cyclic quad on a diameter, external perpendicular, arc-midpoint chase',
    steps: [
      'quadrilateral ABCD inscribed in circle O',
      'diameter AB in circle O',
      'E on the extension of AD',
      'CE perpendicular to AE',
      'OD perpendicular to AC',
    ],
    expect: [103, 104, 87, 97, 1, 28, 84],
    // 106 was mis-bucketed `planned` at T1 — the ground truth lists it mustNotSurface (the ג crown:
    // nothing STATES a ⟂-to-a-radius; OD⟂AC's D is not on the chord). Now tabled ⇒ never.
    never: [69, 71, 106],
    note: '91 is ground-truth background but ABCD are points ON a drawn circle, not a CONSTRUCTED circumcircle — correctly absent per ADR-210 Am.',
  },
  {
    id: 'B13',
    title: 'right triangle on a diameter, doubled cevian, tangent at the far vertex',
    steps: [
      'triangle ABC inscribed in circle O',
      'diameter BC in circle O',
      'G on the extension of CA',
      'GA = AC',
      'line GB meets circle O at D',
      // The ratio given S_{DBCA} = 15·S_{GAD} is feed-neutral (no matcher reads areas) and its
      // solve costs ~30 s (the ADR-123 over-recruit note) — omitted from the CI wiring.
      'the tangent at C meets the extension of BA at E',
    ],
    // 87 fires since the issue-#7 fix: "GA = AC" used to be "satisfied" by collapsing the free
    // on-circle vertex A onto C (a VACUOUS 0 = 0 the recruiter's plain-evaluate accept admitted), so
    // the D-crossing group then failed honestly and the circle had only 3 members (the ADR-243
    // ENGINE FINDING). The step-accept boundary now refuses a result in which a new constraint's own
    // referenced points coincide (`newConstraintsNonVacuous`), the recruiter finds the real
    // configuration (A the midpoint of GC), D builds, and the 4-member concyclic evidence reaches 87.
    expect: [103, 105, 107, 84, 10, 22, 1, 87],
    never: [69, 18],
  },
  {
    id: 'B14',
    title: 'isosceles triangle, two perpendiculars trisecting the base, kite of the crossings',
    steps: [
      'triangle ABC',
      'BA = BC',
      'D on BC',
      'K is the foot of the perpendicular from D to AC',
      'E on BA',
      'L is the foot of the perpendicular from E to AC',
      'AL = LK',
      'LK = KC',
      'G is the intersection of EK and DL',
    ],
    // The emergent BEGD rhombus fires 37/38 through the ADR-244 kite-class observed path; the
    // isosceles bundle (24) and the equidistance converse (83, |BA|=|BC| with AC drawn) fire too.
    expect: [22, 28, 10, 2, 37, 38, 24, 83],
    never: [46, 69, 18, 19],
  },
  {
    id: 'B15',
    title: 'tangent + centre-line from an external point, perpendicular at A',
    steps: [
      'circle O',
      'from point A a tangent touches circle O at B',
      'the line AO cuts circle O at C and D',
      // "AG ⊥ AD with G, B, D collinear" — G on the line, created + driven (ADR-236 fix 4):
      'G on line BD',
      'GA perpendicular to AD',
      'angle ADB = α',
    ],
    expect: [105, 107, 28, 1, 103],
    never: [69],
  },
  {
    id: 'B16',
    title: 'rectangle, cevian ∩ diagonal, a STATED cyclic quadrilateral',
    steps: [
      'rectangle ABCD',
      'E on AD',
      'F is the intersection of CE and BD',
      'cyclic quadrilateral EABF',
    ],
    expect: [52, 43, 46, 48, 50, 2, 4, 10, 87],
    // The rectangle's structural right angle at A never reaches the 104 matcher; the rectangle
    // macro emits no stated-right-angle fact for 28. (87 fires since the ADR-243 concyclic
    // enrichment — `cyclic quadrilateral` lowers to circumcircle + set-concyclic.)
    gaps: [104, 28],
    never: [69],
    note: '69 holds on the L1/L2 feed; at L3 the rectangle parallels + detected triangles admit it (ADR-220).',
  },
  {
    id: 'B17',
    title: 'two circles through A,B; chords through one intersection, third side through the other',
    steps: [
      'two circles intersect at A and B',
      'chord AC in circle O',
      'line AC meets circle P at D',
      'chord AE in circle P',
      'line AE meets circle O at F',
      'line CBE',
    ],
    expect: [102, 1, 87],
    never: [69, 18, 19, 20, 21],
    note: '76/77 (the ג2 no-reveal pair) are structurally excluded / planned-converse respectively.',
  },
  {
    id: 'B18',
    title: 'tangent at the arc-midpoint, secant extension, chords meeting inside',
    steps: [
      'circle O',
      'A on circle O',
      'B on circle O',
      'C on circle O',
      'chord AB in circle O',
      'chord BC in circle O',
      'E is the midpoint of arc BC in circle O',
      'the tangent at E meets the extension of AB at G',
      'F is the intersection of AE and BC',
    ],
    expect: [92, 94, 105, 107, 2, 102, 101],
    never: [69],
  },
  {
    id: 'B19',
    title: 'right triangle, cyclic quad through the right-angle vertex, tangent hypotenuse',
    steps: [
      'right triangle ABC',
      'G, F, H on AC, AB, CB',
      'quadrilateral GCHF inscribed in circle P',
      'AB is tangent to circle P at F',
      'GH parallel to AB',
    ],
    expect: [8, 4, 6, 28, 10, 87, 102, 105, 107],
    // 104 stays a gap: the right angle at C is STRUCTURAL (the right-triangle command), and the
    // rightInscribed matcher reads stated `set-angle` 90° facts only.
    gaps: [104],
    // 31 is ground-truth "28/31 fold" but no median-to-hypotenuse is stated in the wired givens —
    // omitted, not a gap.
    never: [94],
    note: '69/71 omitted from never — GH ∥ AB is stated (ADR-220 admitted parallel-cut).',
  },
  {
    id: 'B20',
    title: 'tangent + secant from outside, parallel chords, concyclic O-C-E-K',
    steps: [
      'circle O',
      'from point B a tangent touches circle O at C',
      'from a point B outside circle O a line cuts the circle at E and A',
      'D on circle O',
      'CD parallel to EA',
      'K is the intersection of ED and AC',
      'angle CAE = 45',
    ],
    expect: [105, 107, 8, 4, 6, 2, 102, 99],
    never: [],
    note: 'The booklet names the centre only at ד; the wiring names it up front (membership-final is step-order-insensitive). 69/71 omitted — stated ∥.',
  },
  {
    id: 'B21',
    title: 'two circles through A,B; the ADR-098/103 operator figure',
    steps: [
      'two circles intersect at A and B',
      'C on circle P',
      'CA extended meets circle O at D',
      'CB extended meets circle O at E',
      'F on circle P',
      'the extension of DE meets the extension of CF at G',
      'CE perpendicular to AB',
      'CD = 36',
      'DE = 18',
    ],
    expect: [102, 28, 2, 10, 84, 87],
    gaps: [1],
    never: [],
    note: '76 (the ג crown) is structurally excluded — the sharpest no-reveal case alongside Q7.',
  },
  {
    id: 'B22',
    title: 'cyclic quad, tangent at C, AB = CB, bisecting diagonal',
    steps: [
      'quadrilateral ABCD inscribed in circle O',
      'F is the intersection of AC and BD',
      'the tangent at C meets the extension of AB at E',
      'AB = CB',
      'AC bisects angle ECD',
    ],
    expect: [87, 102, 105, 107, 22, 94, 2, 10, 93, 75, 78],
    gaps: [1],
    never: [69],
  },
  {
    id: 'B23',
    title: 'AB diameter, cyclic CEFO, midsegment parallelogram, a common tangent',
    steps: [
      'triangle ABC inscribed in circle O',
      'diameter AB in circle O',
      'E on BC',
      'F on BO',
      'quadrilateral CEFO inscribed in circle Q',
      'line AC meets circle Q at D',
      'ED parallel to AB',
      'tangent to circle O at C',
    ],
    expect: [103, 104, 102, 22, 8, 4, 6, 105, 107, 10, 1, 87, 73],
    // 106 (⟂-to-radius ⇒ tangent) is correctly SILENT: the tangent is stated AS a tangent, so the
    // converse prompt has nothing to recognise.
    never: [62, 63],
    note: '62/63 (the midsegment near-reveal, now tabled) must stay silent: D,E are midpoints only EMERGENTLY, never stated. 69/71 omitted — stated ∥.',
  },
];

function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

describe('theorem B-corpus (T1 membership gate — 22 booklet questions)', () => {
  for (const q of CORPUS) {
    describe(`${q.id} — ${q.title}`, () => {
      const facts: Fact[] = [];
      let g = 0;

      it('every step parses and commits (no dropped labels)', { timeout: 120_000 }, () => {
        for (const u of q.steps) {
          const ctx = ctxOf(facts);
          const r = parse(u, ctx);
          expect(r.ok, `did not parse (would escalate): ${u}`).toBe(true);
          if (!r.ok) return;
          const dropped = droppedNewLabels(u, r.commands, ctx.points);
          expect(dropped, `dropped labels in: ${u}`).toEqual([]);
          const group = `g${g++}`;
          for (const cmd of r.commands as AnyCommand[]) {
            facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
          }
          // The `never` set is a per-step contract on the strict L1/L2 view (no detected shapes).
          const { construction } = replay(facts);
          const feed = new Set(detectTheorems({ facts, construction }).map((e) => e.id));
          for (const x of q.never ?? []) {
            expect(feed.has(x), `#${x} must NOT surface (L1/L2) after: ${u}`).toBe(false);
          }
        }
        // Build honesty (T2 hardening, ADR-243): the wired figure must BUILD — a failing group is a
        // partial figure whose feed silently under-reports. A documented engine finding pins its
        // exact message instead (so a fix, or a different breakage, flags loudly).
        const { lastError } = replay(facts);
        if (q.knownBuildIssue) expect(lastError, `${q.id}'s documented build issue changed`).toContain(q.knownBuildIssue);
        else expect(lastError, `${q.id} no longer builds clean`).toBeNull();
      });

      it('final feed membership: expected in, documented gaps out', { timeout: 120_000 }, () => {
        const { construction } = replay(facts);
        const shapes = (q.finalShapes ?? true) ? detectShapes(construction).shapes : [];
        const entries = detectTheorems({ facts, construction, shapes });
        const feed = new Set(entries.map((e) => e.id));
        // FLOOD BUDGET (T3, §9.3): the visible headline section respects the FR-TH-6 cap on every
        // corpus figure — at most 7 rows unless bands 0-1 (never capped) exceed it.
        const { visible } = visibleFeed(entries);
        if (visible.length > 7) {
          expect(visible.every((e) => e.band <= 1), `${q.id}: >7 visible rows must all be band ≤1`).toBe(true);
        }
        for (const x of q.expect) {
          expect(feed.has(x), `#${x} expected in ${q.id}'s final feed`).toBe(true);
        }
        for (const x of q.gaps ?? []) {
          expect(dispositionOf(x)?.kind, `gap #${x} must be a TABLED id (else it belongs in 'planned')`).toBe('tabled');
          expect(feed.has(x), `#${x} now fires in ${q.id} — an evidence fix landed: move it from 'gaps' to 'expect'`).toBe(false);
        }
      });

      it('ground-truth-expected ids missing from the table are scheduled (planned dispositions)', () => {
        for (const x of q.planned ?? []) {
          const d = dispositionOf(x);
          expect(
            d?.kind === 'planned' || d?.kind === 'needs-construct',
            `#${x} is ground-truth-expected in ${q.id} but neither tabled nor scheduled (disposition: ${d?.kind})`,
          ).toBe(true);
        }
      });
    });
  }
});
