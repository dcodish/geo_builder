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
 * Regenerate the seeded corpus fixtures with:  GEN_FIXTURES3=1 npx vitest run src3d/__tests__/fixtures3.test.ts
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

const DIR = join(__dirname, '..', '..', 'fixtures3');

/** The corpus sessions the net is seeded with (the three gate figures). */
const SEEDED: Record<string, string[]> = {
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
};

if (process.env.GEN_FIXTURES3) {
  describe('fixtures3 — GENERATE the seeded corpus files (env-gated)', () => {
    it('writes every seeded session through the real pipeline', () => {
      mkdirSync(DIR, { recursive: true });
      for (const [name, seq] of Object.entries(SEEDED)) {
        useGeo3.setState({ facts: [], seed: 0, lastError: null });
        useGeo3.temporal.getState().clear();
        for (const u of seq) {
          useGeo3.getState().submit(u);
          expect(useGeo3.getState().lastError, `${name}: ${u}`).toBeNull();
        }
        writeFileSync(join(DIR, name), serializeFigure3(useGeo3.getState().facts, useGeo3.getState().seed), 'utf8');
      }
    });
  });
}

describe('fixtures3 — the regression net', () => {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')) : [];

  it('the net is not empty (the seeded corpus files exist)', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
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
