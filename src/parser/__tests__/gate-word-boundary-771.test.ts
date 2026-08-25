/**
 * #771 — the gate word BOUNDARY: a gate's word may not match inside a longer word.
 *
 * The shipped defect: `VERB_GATES.present` was a bare substring test (`/מקביל|parallel/`), and the
 * Hebrew for **parallelogram** (`מקבילית`) contains the Hebrew for **parallel** (`מקביל`). So every
 * parallelogram utterance was read as *stating a parallel relation*, and any correct lowering that
 * happened not to emit a `parallel`-typed command was judged to have dropped a given — escalated to
 * the paid LLM, which in prod returned not-understood for a sentence the grammar had already parsed
 * correctly. The gate was unsound in BOTH directions: «מקבילית ABCD» itself escaped only because its
 * command type string `"parallelogram"` contains `parallel`, i.e. by the very same coincidence.
 *
 * Why the boundary lives in `lexicon.ts`: JavaScript's word-boundary escape is defined over
 * `[A-Za-z0-9_]`, so it is inert around Hebrew letters and never matches between them at all. Hebrew
 * boundaries have to be spelled as lookarounds, and this tree already had exactly one registered home
 * for "Hebrew morphology handled ONCE". See ADR-458.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, droppedGivenVerbs, parse, VERB_GATES } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/** Parse `u` against the figure `prefix` builds — the real parse-with-context path. */
function withFigure(prefix: string[], u: string) {
  const facts: Fact[] = [];
  let g = 0;
  for (const p of prefix) {
    const fig = replay(facts);
    const r = parse(p, buildParseCtx(fig.construction, fig.positions));
    if (!r.ok) throw new Error(`prefix did not parse: ${p}`);
    for (const cmd of r.commands) facts.push({ id: `f${g++}`, utterance: p, cmd: cmd as AnyCommand, enabled: true });
  }
  const fig = replay(facts);
  const r = parse(u, buildParseCtx(fig.construction, fig.positions));
  const commands = r.ok ? r.commands : [];
  return { ok: r.ok, commands, gate: droppedGivenVerbs(u, commands) };
}

describe('#771 — the reported case: a parallelogram construction is not false-blocked', () => {
  it('«גובה המקבילית מקודקוד B» lowers to foot,segment AND passes the verb gate', () => {
    const r = withFigure(['מקבילית ABCD'], 'גובה המקבילית מקודקוד B');
    expect(r.ok).toBe(true);
    expect(r.commands.map((c) => c.type)).toEqual(['foot', 'segment']);
    expect(r.gate, 'the parallel gate must not fire on the parallelogram NOUN').toEqual([]);
  });

  it('parity with the identical triangle twin — same lowering, same (empty) gate result', () => {
    const par = withFigure(['מקבילית ABCD'], 'גובה המקבילית מקודקוד B');
    const tri = withFigure(['משולש ABC'], 'גובה המשולש מקודקוד B');
    expect(par.commands.map((c) => c.type)).toEqual(tri.commands.map((c) => c.type));
    expect(par.gate).toEqual(tri.gate);
  });

  it.each([
    'אלכסון המקבילית AC',
    'שטח המקבילית 24',
    'זווית A במקבילית שווה ל-60',
  ])('the whole family is released, not just the reported phrasing: «%s»', (u) => {
    const r = withFigure(['מקבילית ABCD'], u);
    expect(droppedGivenVerbs(u, r.commands)).toEqual([]);
  });

  it('the English mirror — `parallel` must not match inside `parallelogram` either', () => {
    expect(droppedGivenVerbs('the altitude of the parallelogram from vertex B', [])).toEqual([]);
    expect(droppedGivenVerbs('parallelogram ABCD', [])).toEqual([]);
  });
});

describe('#771 — the gate still does its job (non-vacuity)', () => {
  it('a genuinely dropped parallel IS still caught', () => {
    expect(droppedGivenVerbs('AB מקביל ל-CD', [{ type: 'segment', a: 'A', b: 'B' } as AnyCommand])).toEqual(['מקביל/parallel']);
  });

  it('a genuinely dropped tangency IS still caught', () => {
    expect(droppedGivenVerbs('AD משיק למעגל', [{ type: 'segment', a: 'A', b: 'D' } as AnyCommand]).length).toBeGreaterThan(0);
  });

  it('the inflections of a gate word still match — the boundary is not a whole-word-only trap', () => {
    for (const u of ['AB מקביל ל-CD', 'AB מקבילה ל-CD', 'AB ו-CD מקבילים', 'הצלעות מקבילות']) {
      expect(droppedGivenVerbs(u, []), `«${u}» must still be gated`).toContain('מקביל/parallel');
    }
  });

  it('the tangent / bisect / perpendicular rows keep their own inflections', () => {
    expect(droppedGivenVerbs('AD משיקים למעגל', [])).toContain('משיק/tangent');
    expect(droppedGivenVerbs('CD חוצה את הזווית', [])).toContain('חוצה/bisect');
    expect(droppedGivenVerbs('AB מאונכים ל-CD', [])).toContain('מאונך/perpendicular');
    expect(droppedGivenVerbs('CD bisects the angle', [])).toContain('חוצה/bisect');
    expect(droppedGivenVerbs('CD is the bisector of the angle', [])).toContain('חוצה/bisect');
  });
});

describe('#771 — the class, stated on the mechanism rather than on samples', () => {
  it('every gate rejects its OWN stem glued to a non-inflectional Hebrew letter', () => {
    // The shape of the parallelogram bug, asserted for EVERY row rather than for the row that bit.
    // The stems are read off the rows themselves, so a gate added later is covered automatically.
    const GLUE = 'ק'; // never an inflectional suffix in HE_SUFFIX
    for (const g of VERB_GATES) {
      expect(g.he.length, `${g.verb} declares its Hebrew stems`).toBeGreaterThan(0);
      for (const stem of g.he) {
        const word = stem.replace('[כך]', 'כ'); // the KAF atom, spelled out
        expect(g.present.test(word), `${g.verb}: «${word}» is its own word and must match`).toBe(true);
        expect(g.present.test(word + GLUE), `${g.verb}: «${word}${GLUE}» is a different word and must NOT match`).toBe(false);
      }
    }
  });

  it('`satisfied` is whole-token — the parallelogram macro is evidence by LISTING, not by substring', () => {
    const parallel = VERB_GATES.find((g) => g.verb.includes('parallel'))!;
    expect(parallel.satisfied.test('{"type":"parallelogram","ids":["A","B","C","D"]}')).toBe(true);
    expect(parallel.satisfied.test('{"type":"set-parallel"}')).toBe(true);
    expect(parallel.satisfied.test('{"type":"parallelism-nonsense"}')).toBe(false);
  });

  it('the tangency structural-evidence pass is selected by a FLAG, not by sniffing the pattern source', () => {
    const tangent = VERB_GATES.find((g) => g.verb.includes('tangent'))!;
    expect(tangent.tangency, 'the row declares it').toBe(true);
    expect(VERB_GATES.filter((g) => g.tangency).length, 'exactly one row owns the structural pass').toBe(1);
  });
});
