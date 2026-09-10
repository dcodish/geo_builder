/**
 * The 3-D fixtures regression net (ADR-3D-005 — the 2-D ADR-232 net transplanted):
 * every `fixtures3/*.geo3.json` replays through the REAL load path and must
 *  (1) build with every fact OK (claims verified included), and
 *  (2) show no parser drift — each stored utterance must still lower to the
 *      stored commands (every 3-D fact is deterministic; no LLM steps yet).
 *
 * A manual testing session's saved figure becomes PERMANENT coverage by dropping
 * the file into `fixtures3/`.
 *
 * Add the MISSING seeded fixtures with:  GEN_FIXTURES3=1 npx vitest run src3d/__tests__/fixtures3.test.ts
 *
 * That writes only files that are not on disk. Rebuilding the WHOLE corpus is a separate, deliberate
 * act — `GEN_FIXTURES3_ALL=1` — because a blanket rewrite is a schema MIGRATION of every stored file
 * and silently deletes the older generations' load coverage (#916, ADR-3D-232). The coverage itself is
 * asserted below, so any route to that loss fails rather than passing as churn.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserializeFigure3 } from '../store/figureFile3';
import { derive3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { generateSeeded, schemaVersionCoverage, supportedSchemaVersions, versionsWithoutCoverage } from './fixtures3-gen';
import type { SeededCorpus } from './fixtures3-gen';

const DIR = join(__dirname, '..', '..', 'fixtures3');

/** The corpus sessions the net is seeded with (the three gate figures). */
const SEEDED: SeededCorpus = {
  // #977 (ADR-3D-241) — a symbolic angle with a COEFFICIENT, stated behind a copula that was unreadable
  // before. The figure must build AND the drawn angle must be 2 × 30: the fixture nets the parse and the
  // drive together, which is what makes it the right lock for "this sentence now works end to end".
  'angle-coef-symbol-977.geo3.json': ['משולש ABC', 'זווית ABC שווה 2α', 'α = 30'],
  'prism-2020-q2.geo3.json': [
    'מנסרה ישרה משולשת ABC',
    "M אמצע B'C'",
    "K על AA' כך ש-AK = 2KA'",
    "נסמן: AA' = w, KC = v, KB = u",
    'AM = 1/2u + 1/2v + 5/3w',
    'P על AM כך ש-KP = αu + βv',
    'KP = 1/5u + 1/5v',
  ],
  'cube-2023-q2.geo3.json': [
    'קובייה ABCD',
    "נסמן: AB = u, AD = v, AA' = w",
    "CA' מאונך למישור BC'D",
    "E מפגש התיכונים של משולש BC'D",
    'CE = -1/3u - 1/3v + 1/3w',
    "E, C, A' על ישר אחד",
  ],
  // #552 — the operator's free-line request, exact notation: bare/⊥-created convention names,
  // a noun-declared arbitrary name, and both ∥ and membership pins on one figure.
  // #640/#504/#639 — bagrut 35582 חורף תשפ"ד Q2, typed the way the EXAM prints it: the line with no
  // definite article and no colon (the form that used to reach the paid LLM lane), then the parameterised
  // plane, the ⟂ given that pins m, and the crossing point the exam asks for.
  'param-line-2024-q2.geo3.json': [
    'ישר l x=(-1,5,-11)+t(m-1,5-m,-2)',
    'מישור π: 3x+my+(m+6)z+4=0',
    'l ⊥ π',
    'A נקודת החיתוך של l עם π',
  ],
  // #755/#756 — the operator's prod session, 2026-08-19: a solid, a midpoint, a point-run plane, a
  // drawn diagonal, and the crossing point named in the NOUN frame with a SEGMENT on the line side —
  // the one square the three old crossing rules left empty, and the shape of nearly every 3-D
  // question (an edge or diagonal against three of the solid's vertices).
  'crossing-cell-755.geo3.json': [
    "תיבה ABCDA'B'C'D'",
    "E אמצע BB'",
    'מישור ADE',
    "אלכסון AC'",
    "G נקודת חיתוך של CC' עם מישור ADE",
  ],
  // #571 — the operator's diagonal plane, named by its two vertical edges. A plane named by points is
  // a SET: this stated order traces a bowtie and used to be refused `not-coplanar` on coplanar points.
  'plane-run-order-571.geo3.json': ["קובייה ABCDA'B'C'D'", "מישור BB'DD'", "מישור BB'D'D"],
  // #820 (ADR-3D-204) — the operator's bagrut pyramid with the rider the relation DRIVES. «K על SB»
  // leaves one free DOF and «SD מקביל למישור ACK» consumes it, landing K on SB's midpoint; before the
  // fix this exact sequence refused `givens-contradict` and named the student's own givens.
  'pyramid-rider-drive-820.geo3.json': [
    'פירמידה SABCD שבסיסה מקבילית',
    'המקצוע SA הוא גובה בפירמידה',
    'נסמן: AB = u, AD = v, AS = w',
    'A(0,0,0)',
    'B(0,5,0)',
    'S(0,0,6)',
    'D(3,p,0)',
    '|u| = |v|',
    'p חיובי',
    'K על SB',
    'SD מקביל למישור ACK',
  ],
  'free-line-552.geo3.json': [
    'פירמידה BCKS',
    'l⊥BCK',
    'ישר k',
    'הישר k מקביל למישור BCK',
    'S על הישר k',
  ],
  // #557 play (ADR-3D-141 Am. 1) — the operator's EXACT session that surfaced the pivot-staleness
  // class: a coordinate-injected prism (the '4-vectors' bagrut figure), a declared bare «l», then
  // «l⊥BCK» — the free line must hold against the pivot-placed figure, every fact green.
  'free-line-552-play.geo3.json': [
    'מנסרה ישרה שבסיסה משולש ישר זוית',
    'זוית BAC=90',
    'AB=u',
    'AC=v',
    "AA'=w",
    'BE=0.2BC',
    "B'E",
    "EC'",
    '|u|=3',
    '|v|=4',
    "B'E⊥C'E",
    'A(0,0,0)',
    'B על החלק החיובי של ציר x',
    'C על החלק החיובי של ציר y',
    "A' על החלק החיובי של ציר z",
    "K אמצע AA'",
    'המישור BCK',
    'l',
    'l⊥BCK',
  ],
  // #579 (ADR-3D-146) — the operator's prod figure: «SO גובה הפירמידה» names the NEW foot O,
  // and the ⟂-to-base disposition must create it (not refuse it as an unknown reference).
  'named-foot-579.geo3.json': ['פירמידה ABCDS שבסיסה ריבוע', 'SO גובה הפירמידה'],
  // #794 (ADR-3D-168) — the operator's bagrut Q2 (2026-08-26): a right prism whose three edge
  // vectors are stated in a parameter k. The right-prism structure (AA'⊥AB, AA'⊥AC) pins k = 2 —
  // the symbolic pair pins join the pivot exactly like `B(2t,t,k)` point pins. The first line is
  // the operator's EXACT utterance (spacing included); the sign given locks the param-sign gate
  // over a PAIR symbol (pinSymsOf across all three pin families).
  'prism-sym-pair-794.geo3.json': [
    'מנסרה ישרה משולשת ABC',
    "AA'=(k-1,k-7, k+1)",
    'AB = (k-1, k, 3)',
    'AC = (k+1, 0, k-3)',
    'k חיובי',
  ],
  // #801 (ADR-3D-174) — the operator's 2026-08-27 continuation of that same exam figure: the exercise's
  // LINE, whose direction is the same vector in the same letter k. The equation must route to the letter's
  // OWNER (the pivot) instead of opening the root-find lane beside it, and the two point memberships the
  // named form carries must DRIVE the prism onto the line — every fact green at k = 2.
  'prism-sym-line-801.geo3.json': [
    "מנסרה ישרה משולשת ABCA'B'C'",
    "AA'=(k-1,k-7,k+1)",
    'AC=(k+1,0,k-3)',
    'AB=(k-1,k,3)',
    'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)',
  ],
  // #814 (ADR-3D-175) — the operator's prod figure (2026-08-29): a pyramid on a parallelogram base
  // whose base vertex is stated with a BARE parameter, «D(3,p,0)». The letter NAMES D's free y
  // component (it is not a pivot unknown — that is the partial injection the exam gates rely on),
  // and «p חיובי» selects among its roots, so |AB| = |AD| lands the figure on p = +4 at every seed
  // and the panel prints coordinates instead of «?».
  'pyramid-named-comp-814.geo3.json': [
    'פירמידה SABCD שבסיסה מקבילית',
    'המקצוע SA הוא גובה בפירמידה',
    'M אמצע אלכסון BD',
    'נסמן: AB = u, AD = v, AS = w',
    'A(0,0,0)',
    'B(0,5,0)',
    'S(0,0,6)',
    'D(3,p,0)',
    '|u| = |v|',
    'p חיובי',
  ],
  // #509 (ADR-3D-213): a component naming TWO symbols — the arity the reader could not read. The
  // whole point is that it resolves, so the net (green replay + no parser drift) is the right lock.
  'prism-two-symbol-component-509.geo3.json': [
    'תיבה ABCDA\u0027B\u0027C\u0027D\u0027',
    'C(p+q,1,0)',
  ],
  'planes-2022-q2.geo3.json': [
    'המישור π1: z - 3 = 0',
    'המישור π2: ay + z - 8 = 0',
    'הזווית בין המישורים π1 ו-π2 היא 45',
    'A(2,-2,6) נמצאת על אחד המישורים',
    'מ-A מורידים אנך למישור π1 החותך אותו בנקודה B',
    'AB = 3',
    'ℓ ישר החיתוך בין המישורים π1 ו-π2',
    'מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C',
    'שטח המשולש ABC = 4.5',
  ],
  // #909 (ADR-3D-215) — the operator's exact sequence. A stated angle between two segments that do
  // not meet used to fall out of the drive lane and be refuted `claim-refuted`; it is a GIVEN, and
  // the figure reshapes to honour it. Green replay + no parser drift is exactly the right lock.
  'box-seg-angle-909.geo3.json': ["תיבה ABCDA'B'C'D'", "הזווית בין A'C לבין BC' היא 70"],
  // #902 (ADR-3D-219) — the operator's exact sequence (playing #511's T8): a coordinate written in a
  // letter, then a VALUE for that letter. «p=3» used to refuse unknown-symbol — the pins were keyed by
  // the vec-def that introduced a symbol, so a coordinate-born one had no pin to land in. Green replay
  // (C at (9,1,0)) + no parser drift is exactly the right lock.
  'coord-symbol-value-902.geo3.json': ["תיבה ABCDA'B'C'D'", 'C(p²,1,0)', 'p=3'],
  // #923 (ADR-3D-221) — #902's own T10, the normal bagrut phrasing: an angle NAMED in part 1 and VALUED
  // in part 2. Two arc producers each drew the wedge, so «α» and «70°» were painted at one pixel; the
  // scene now emits one arc per wedge reading the value. Green replay + no drift locks the SEQUENCE; the
  // one-arc assertion is in issue-923-917.test.ts.
  'pyramid-named-valued-angle-923.geo3.json': ['פירמידה SABCD שבסיסה ריבוע', '∠SAB = α', 'α = 70'],
  // #917 (ADR-3D-222) — round #915's T3: two space diagonals that CROSS at the box centre. The stated
  // angle drove the figure (#909) but the arc lane was keyed on a shared NAME, so nothing was drawn
  // where they meet.
  'box-seg-angle-cross-917.geo3.json': ["תיבה ABCDA'B'C'D'", "הזווית בין AC' לבין BD' היא 55"],
};

// #916: MISSING-only by default; the blanket rebuild needs its own flag, so it cannot happen as a side
// effect of adding one fixture. The arithmetic lives in `fixtures3-gen.ts` so it is testable against a
// temp directory (`issue-916-fixture-corpus.test.ts`) instead of only by running this env-gated block.
if (process.env.GEN_FIXTURES3 || process.env.GEN_FIXTURES3_ALL) {
  describe('fixtures3 — GENERATE the seeded corpus files (env-gated)', () => {
    it('writes the seeded sessions through the real pipeline', () => {
      const { written, skipped } = generateSeeded(DIR, SEEDED, { all: !!process.env.GEN_FIXTURES3_ALL });
      // eslint-disable-next-line no-console
      console.log(`fixtures3: wrote ${written.length} (${written.join(', ') || 'none'}), left ${skipped.length} untouched`);
    });
  });
}

describe('fixtures3 — the regression net', () => {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')) : [];

  it('the net is not empty (the seeded corpus files exist)', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * #916 (ADR-3D-232) — EVERY SCHEMA GENERATION THE LOAD PATH ACCEPTS KEEPS A FIXTURE.
   *
   * `deserializeFigure3` reads any `schemaVersion <= SCHEMA_VERSION_3D`, and a student's saved figure
   * is whatever version it was saved at — so the older generations are a live promise, not history.
   * Their only coverage is these files. A regeneration migrates them all to the current version and
   * the suite stayed green, so the coverage could vanish as review-invisible churn. This is what
   * notices.
   */
  it('every supported schemaVersion still has load coverage', () => {
    const coverage = schemaVersionCoverage(DIR);
    const lost = versionsWithoutCoverage(DIR);
    expect(
      lost,
      lost.length === 0
        ? ''
        : `schemaVersion ${lost.join(', ')} has NO fixture left — the backward-compatible load path for ` +
          `${lost.length > 1 ? 'those generations is' : 'that generation is'} now untested. A blanket ` +
          `GEN_FIXTURES3_ALL rebuild migrates every file to v${supportedSchemaVersions().slice(-1)[0]}; ` +
          `restore one file at each lost version (git checkout it, or save one from that generation). ` +
          `Present: ${[...coverage].map(([v, f]) => `v${v}×${f.length}`).join(' ') || 'nothing'}`,
    ).toEqual([]);
  });

  for (const file of files) {
    describe(file, () => {
      const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));

      it('loads through the real path', () => {
        expect(r.ok).toBe(true);
      });

      it('replays with every fact OK (claims verified, no violations)', () => {
        if (!r.ok) return;
        const d = derive3(r.facts, r.seed);
        for (const f of r.facts) {
          expect(d.status[f.id], f.utterance).toBe(f.enabled ? 'ok' : 'disabled');
        }
        expect(d.positions.size).toBeGreaterThan(0);
      });

      it('no parser drift: every stored utterance still lowers to the stored commands', () => {
        if (!r.ok) return;
        for (const f of r.facts) {
          const parsed = parse3(f.utterance);
          expect(parsed.ok, f.utterance).toBe(true);
          if (parsed.ok) expect(parsed.commands, f.utterance).toEqual(f.cmds);
        }
      });
    });
  }
});
