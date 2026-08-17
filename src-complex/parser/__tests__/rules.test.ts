/**
 * S4 part 2 (#621): the rules, the catalog, and the two guards that keep them honest.
 *
 * The catalog battery is the important one. It is the 2-D `catalog.test.ts` pattern — *every* specimen
 * must parse in *both* languages — and its own tree records why: a family with no catalog entry is a
 * family no coverage guard exercises, which is how an unreachable form survived in production
 * unnoticed (#347).
 */
import { describe, expect, it } from 'vitest';

import { CATALOG, coveredFamilies } from '../catalog';
import { ALL_FAMILIES, FAMILY_TITLE } from '../families';
import { ATOM_SOURCES } from '../lexicon';
import { parseLineV2 } from '../rules';
import { RULES } from '../rules';
import { solveTier1 } from '../../solve/tier1';
import { filterBranches } from '../../solve/filter';
import { format as fmtMod } from '../../value/modulus';
import { branchDegrees } from '../../solve/tier1';

const ok = (line: string) => {
  const r = parseLineV2(line);
  if (!r.ok) throw new Error(`did not parse: ${line} (${r.reason}${'items' in r ? `: ${r.items}` : ''})`);
  return r.line;
};

/** Run several lines the way the app will: parse each, collect, solve. */
const build = (...lines: string[]) => {
  const constraints = lines.flatMap((l) => ok(l).constraints);
  const filters = lines.flatMap((l) => ok(l).filters);
  const t1 = solveTier1(constraints);
  return { t1, kept: filterBranches(t1.branches, filters).kept };
};

describe('CATALOG — every specimen parses, in both languages', () => {
  it('is not vacuous', () => {
    expect(CATALOG.length).toBeGreaterThan(10);
  });

  for (const entry of CATALOG) {
    it(`He: ${entry.he}`, () => expect(parseLineV2(entry.he).ok, entry.he).toBe(true));
    it(`En: ${entry.en}`, () => expect(parseLineV2(entry.en).ok, entry.en).toBe(true));
  }

  it('every entry names a family that exists in the contract', () => {
    for (const e of CATALOG) expect(ALL_FAMILIES, e.he).toContain(e.family);
  });

  it('reports MEASURED coverage — which families actually work today', () => {
    // this is the honest number, and it is deliberately much smaller than the contract
    expect(coveredFamilies()).toEqual(['F1', 'F12', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'G7', 'G8']);
    expect(Object.keys(FAMILY_TITLE).length).toBeGreaterThan(coveredFamilies().length);
  });
});

describe('THE LEXICAL RATCHET — no rule spells a fragment inline (ADR-CX-009 §4)', () => {
  // 2-D spells the point-label fragment 342 times, and the Hebrew final-kaf trap fired at least three
  // times AFTER being recorded as a trap. The ceiling starts at zero and may only go down.
  const CEILING = 0;

  it('rules.ts inlines no lexical fragment', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'rules.ts'), 'utf8');
    // comments are prose and may quote an utterance; the ratchet is about CODE
    const body = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/^import[\s\S]*?from '[^']+';$/gm, '');
    // the shapes an atom exists for: a bare label class, a bare number class, a raw Hebrew keyword
    const inlined = [
      ...body.matchAll(/\[A-Za-z\]\[A-Za-z\]\*\\d\*/g),
      ...body.matchAll(/\\d\+\(\?:\\\.\\d\+\)\?/g),
      ...body.matchAll(/'[^']*[֐-׿][^']*'/g),
    ];
    expect(
      inlined.map((m) => m[0]),
      'compose from lexicon atoms instead — the ratchet only goes down',
    ).toHaveLength(CEILING);
  });

  it('the atoms cover both spellings of every final letter they mention', () => {
    for (const [name, src] of Object.entries(ATOM_SOURCES)) {
      // A prefix class is word-INITIAL, where a final form cannot occur by the rules of the script.
      // Strip it before checking, or every atom that composes HE_PREFIX inherits a false positive.
      const body = src.split(ATOM_SOURCES.HE_PREFIX).join('');
      // Only a WORD-FINAL position can take a final form — `ארגומנט` has a medial mem mid-word and is
      // correct as written. So the check looks for a letter ending an alternative, not anywhere.
      // ALL FIVE final forms. The list stopped at three, and «היקף» — which ends in a final pe — was
      // then spelled with the KAF atom and refused its own word. A guard that checks most of a closed
      // set is a guard that will be wrong about the rest of it.
      const FINALS = [['כ', 'ך'], ['מ', 'ם'], ['נ', 'ן'], ['פ', 'ף'], ['צ', 'ץ']] as const;
      for (const [medial, final] of FINALS) {
        const atEnd = new RegExp(`${medial}(?=[|)]|$)`, 'u');
        if (atEnd.test(body) && !body.includes(final)) {
          throw new Error(`${name} ends a word with ${medial} but never spells ${final} — the ADR-3D-035 trap`);
        }
      }
    }
  });
});

describe('the rules build the corpus systems', () => {
  it('#607: the three lines solve to z1 = √2·cis45°', () => {
    const { t1, kept } = build('z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)');
    expect(t1.inconsistent).toBeNull();
    expect(fmtMod(t1.knownModulus.get('z1')!)).toBe('√2');
    expect(kept).toHaveLength(1);
    expect(branchDegrees(kept[0], 'z1')).toBe(45);
  });

  it('the English mirror builds identically', () => {
    const { kept } = build('z1 in the first quadrant', 'z1^3 = z3', '-2z1 = conj(z3)');
    expect(branchDegrees(kept[0], 'z1')).toBe(45);
  });

  it('|z1| = 9r is a MAGNITUDE given — it says nothing about direction', () => {
    const { t1 } = build('|z1| = 9r');
    expect(fmtMod(t1.knownModulus.get('z1')!)).toBe('9r');
    expect(t1.freeDof).toEqual(['arg z1']);
  });

  it('arg z1 - arg z2 = 90 is a DIRECTION given — it says nothing about magnitude', () => {
    const { t1 } = build('arg z1 - arg z2 = 90');
    expect(t1.knownModulus.size).toBe(0);
    expect(t1.freeDof).toContain('|z1|');
  });

  it('z^3 = 8 enumerates three roots', () => {
    const { t1 } = build('z^3 = 8');
    expect(t1.branches).toHaveLength(3);
  });

  it('a polar literal parses: z2 = 2cis150', () => {
    const { t1 } = build('z2 = 2cis150');
    expect(fmtMod(t1.knownModulus.get('z2')!)).toBe('2');
    expect(branchDegrees(t1.branches[0], 'z2')).toBe(150);
  });

  /**
   * The sign belongs to the ANGLE, and it is read in the expression grammar.
   *
   * `2cis(-30)` is the exam's way of writing a direction below the real axis. It reaches `cisOf` as a
   * negation rather than as a number, so a bare `num` test refused it — in the *expression* grammar,
   * which meant every rule composed on top inherited the gap rather than each having its own.
   */
  it.each([
    ['z2 = 2cis(-30)', 330],
    ['z2 = 2cis-30', 330],
    ['z2 = 2cis(30)', 30],
  ])('a negative polar angle parses: %s', (line, deg) => {
    const { t1 } = build(line);
    expect(fmtMod(t1.knownModulus.get('z2')!)).toBe('2');
    expect(branchDegrees(t1.branches[0], 'z2')).toBe(deg);
  });

  it('r is a real PARAMETER, never auto-created as a complex number (ADR-CX-004)', () => {
    const { t1 } = build('|z1| = 9r');
    expect(t1.names).toEqual(['z1']); // r is a parameter, not a drawable number
  });
});

describe('span accounting is ENFORCING, not advisory', () => {
  it('a line with content no rule claimed is REFUSED, in the student’s own words', () => {
    const r = parseLineV2('z1 ברביע הראשון ומקבילית');
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'unaccounted') expect(r.items).toContain('ומקבילית');
  });

  it('an unrecognised line is not-handled — the seam the LLM fallback escalates from', () => {
    const r = parseLineV2('draw me something nice');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-handled');
  });

  it('exam typography pastes verbatim: Z₁³ = Z₃', () => {
    expect(parseLineV2('Z₁³ = Z₃').ok).toBe(true);
  });

  it('the rule list is ordered and named, so precedence is reviewable', () => {
    expect(RULES.map((r) => r.name)).toEqual([
      'declaration',
      'quadrant',
      'conjugates-claim',
      'forall-power',
      'minimal-power',
      'type-claim',
      // the long sequence sentence outranks the bare list, and both outrank the relation rules: its
      // tail «האיבר השלישי הוא Z4» is a type-claim shape if read by a laxer rule first
      'sequence-first-terms',
      'sequence-list',
      // a measure sentence carries a shape noun too, so it outranks the shape rules; and the circle
      // sentences outrank them for the same reason — «המעגל החוסם את המשולש …» contains a shape noun,
      // and the shape rule would claim its tail and drop the circumscription
      'measure-relation',
      // and the QUESTION form after the statement form: the same words minus the equating word
      'measure-query',
      'measure-ratio',
      'circumscribed-circle',
      'circle-centre-radius',
      'named-shape',
      'argument-relation',
      'equation',
      // last of all: a bare glued run is a figure only when nothing read the line as maths
      'bare-run',
    ]);
  });
});
