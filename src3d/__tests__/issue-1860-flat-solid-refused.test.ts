/**
 * #1860 (ADR-3D-358, operator ruling 2026-10-07, ADR-W-115 Am. 1) — A DECLARED SOLID THE GIVENS FORCE FLAT IS
 * REFUSED, never drawn with a notice: *"we should refuse this as well since it contradicts the pyramid statement"*,
 * *"a flat figure is not a pyramid / prism / …"*.
 *
 * Before (b0e9dbea, `decideDeterministic3` ×24): «פירמידה SABCD · ∠BAS = 40 · ∠DAS = 50» built at 24/24 with the
 * #936 `solid-degenerate` notice (either order), and «פירמידה ישרה SABCD שבסיסה מלבן · AB = 6 · BC = 8 · SA = 5»
 * (SA is half the diagonal, so the apex lies in the base) was refused with the generic «הנתונים סותרים זה את זה …»,
 * which does not say why. Two predicates — the #872 hard gate and the #936 notice band — split one class by how
 * exactly the solver landed. Now one judgement, the declared-polygon one (ADR-3D-310), reaches every solid kind.
 * Everything runs through the App's real pre-LLM decision.
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { nounOfKind } from '../engine/solidSubject';

const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
const he = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('en')(k, o) as string;
const plain = (s: string | null): string => (s ?? '').replace(/[⁦-⁩]/g, '');

function run(lines: readonly string[], seed: number) {
  let st: { facts: Fact3[]; seed: number } = { facts: [], seed };
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const v = decideDeterministic3(st, lines[i], () => `f${++n}`);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null, kind: v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null, kind: 'record' as const };
}

/** Refused on the LAST line as the named solid, forced, naming `others`; the line is not a fact. */
function refused(lines: readonly string[], seed: number, solid: string, ring: string, others: readonly string[]): void {
  const r = run(lines, seed);
  const last = lines.length - 1;
  expect(r.refusedAt, `seed ${seed}: refused at «${lines[last]}» (got ${r.kind} at ${r.refusedAt})`).toBe(last);
  expect(r.error, `seed ${seed}`).toMatchObject({ code: 'polygon-collapsed', stated: lines[last], forced: true, solid, ring });
  const msg = plain(errorText3(he, r.error));
  for (const o of others) expect(msg, `seed ${seed}`).toContain(`«${o}»`);
  expect(r.st.facts.length, 'keep-prior: the refused line is not a fact').toBe(last);
}

/** Builds: every line records, every fact ok, and no flat-solid notice exists. */
function builds(lines: readonly string[], seed: number): void {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: «${lines[r.refusedAt]}» → ${JSON.stringify(r.error ?? r.kind)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
  expect(d.notices.map((x) => x.kind as string)).not.toContain('solid-degenerate');
}

describe('#1860 — the reported pyramid is refused at its third line, never drawn flat', () => {
  it('«פירמידה SABCD · ∠BAS = 40 · ∠DAS = 50» at all 24 seeds', () => {
    for (const seed of SEEDS_24) refused(['פירמידה SABCD', '∠BAS = 40', '∠DAS = 50'], seed, 'pyramid', 'SABCD', ['∠BAS = 40']);
  }, 120_000);

  it('the angles in the other order, at all 24 seeds', () => {
    for (const seed of SEEDS_24) refused(['פירמידה SABCD', '∠DAS = 50', '∠BAS = 40'], seed, 'pyramid', 'SABCD', ['∠DAS = 50']);
  }, 120_000);

  it('the exact wording, Hebrew and English (the shipped polygonForced frame with the solid noun)', () => {
    const r = run(['פירמידה SABCD', '∠BAS = 40', '∠DAS = 50'], 0);
    expect(plain(errorText3(he, r.error))).toBe('לא ניתן: «∠DAS = 50» יחד עם «∠BAS = 40» מתקיימים רק אם הפירמידה SABCD שטוחה — וגוף שטוח אינו פירמידה.');
    expect(plain(errorText3(en, r.error))).toBe("Can't do that: «∠DAS = 50» together with «∠BAS = 40» hold only if pyramid SABCD is flat — and a flat solid is not a pyramid.");
  });

  it('the solid is named the way the student wrote it («ABCDS» stays «ABCDS»)', () => {
    refused(['פירמידה ABCDS', '∠BAS = 40', '∠DAS = 50'], 0, 'pyramid', 'ABCDS', ['∠BAS = 40']);
  });
});

describe('#1860 — every declared solid the givens force flat is refused the same way, with its own noun', () => {
  it('a right pyramid whose LENGTHS put the apex in its base (was the generic «הנתונים סותרים…»), 24 seeds', () => {
    for (const seed of SEEDS_24)
      refused(['פירמידה ישרה SABCD שבסיסה מלבן', 'AB = 6', 'BC = 8', 'SA = 5'], seed, 'pyramid', 'SABCD', ['AB = 6', 'BC = 8']);
  }, 120_000);

  it.each<[string, string[], string, string, string[]]>([
    ['a tetrahedron flattened by its angles at A', ['פירמידה SABC', '∠BAS = 30', '∠CAS = 20', '∠BAC = 50'], 'pyramid', 'SABC', ['∠BAS = 30', '∠CAS = 20']],
    ['a tetrahedron flattened by lengths (S on AB)', ['פירמידה SABC', 'SA = 1', 'SB = 2', 'AB = 3'], 'pyramid', 'SABC', ['SA = 1', 'SB = 2']],
    ['a box driven to zero height (the space diagonal equals the base diagonal)', ["תיבה ABCDA'B'C'D'", 'AB = 3', 'BC = 4', "A'C = 5"], 'box', "ABCDA'B'C'D'", ['AB = 3', 'BC = 4']],
    ["a right prism driven to zero height (A'B = AB)",["מנסרה ישרה משולשת ABCA'B'C'", 'AB = 3', "A'B = 3"], 'prism', "ABCA'B'C'", ['AB = 3']],
  ])('%s', (_n, lines, solid, ring, others) => {
    for (const seed of [0, 5, 11, 23]) refused(lines, seed, solid, ring, others);
  }, 120_000);

  it('…while a statement whose claim is its own ARBITER keeps the claim register (the ADR-3D-030 pin-and-claim pattern)', () => {
    // a relation recorded as a claim with no `given` — a wrong answer that only a flat box would satisfy — is
    // refuted as an answer, exactly as before; the solid refusal is for the GIVENS that force the flatness
    for (const seed of [0, 5, 11, 23]) {
      const r = run(["תיבה ABCDA'B'C'D'", "המישור ABC מתלכד עם המישור A'B'C'"], seed);
      expect(r.refusedAt).toBe(1);
      expect(r.error).toEqual({ code: 'claim-refuted' });
    }
  });

  it('every non-flat kind has a noun, and a flat polygon kind has none', () => {
    expect(nounOfKind('tetra')).toBe('pyramid');
    expect(nounOfKind('pyramidTrapR')).toBe('pyramid');
    expect(nounOfKind('prismReg6')).toBe('prism');
    expect(nounOfKind('parallelepiped')).toBe('prism');
    expect(nounOfKind('cube')).toBe('cube');
    expect(nounOfKind('box')).toBe('box');
    expect(nounOfKind('polygon4')).toBeNull();
  });
});

describe('#1860 — a thin but real solid builds, with no notice and no refusal', () => {
  it.each<[string, string[]]>([
    ['41 / 50, one degree off complementary', ['פירמידה SABCD', '∠BAS = 41', '∠DAS = 50']],
    ['50 / 60', ['פירמידה SABCD', '∠BAS = 50', '∠DAS = 60']],
    ['«SA = 5.1», just above half the diagonal', ['פירמידה ישרה SABCD שבסיסה מלבן', 'AB = 6', 'BC = 8', 'SA = 5.1']],
    ["a box just above flat («A'C = 5.1»)", ["תיבה ABCDA'B'C'D'", 'AB = 3', 'BC = 4', "A'C = 5.1"]],
    ["a right prism just above flat («A'B = 3.1»)", ["מנסרה ישרה משולשת ABCA'B'C'", 'AB = 3', "A'B = 3.1"]],
    ['a tetrahedron one degree off flat', ['פירמידה SABC', '∠BAS = 30', '∠CAS = 20', '∠BAC = 49']],
  ])('%s, at all 24 seeds', (_n, lines) => {
    for (const seed of SEEDS_24) builds(lines, seed);
  }, 120_000);
});
