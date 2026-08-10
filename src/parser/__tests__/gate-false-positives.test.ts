/**
 * #140 — the catalog-wide FALSE-POSITIVE net over the whole honesty-gate battery.
 *
 * The retrospective that filed this: #138 was a P1 prod regression in which the ADR-292 «משיק» verb gate
 * blocked the aux-circle external tangent — a construction the grammar has always supported — and it
 * shipped past 3478 tests. Running the broken gate over the supported catalog flags the four exact
 * forms that broke:
 *
 *     [משיק/tangent] from point E outside circle O two tangents touch the circle at A and B
 *     [משיק/tangent] מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B
 *     [משיק/tangent] from point E a tangent touches circle O at D
 *     [משיק/tangent] מנקודה E משיק נוגע במעגל O בנקודה D
 *
 * The regression was sitting in the enumerated vocabulary the entire time, and nothing looked. Only
 * `droppedGivenNumbers` had a catalog-wide guard (ADR-250); every other gate had per-case tests only,
 * which prove the cases someone thought of.
 *
 * THE CATALOG IS THE ENUMERATION of constructs that legitimately carry a verb, a label, a relation, a
 * number, a construct noun. So the property is exact and total: **every supported catalog example that
 * parses must pass EVERY gate with an empty result.** A gate that flags one is not protecting honesty —
 * it is refusing the tool's own documented input.
 *
 * WHY THE GATE LIST IS EXTRACTED, NOT LISTED (ADR-W-006, learned from #501): a guard that enumerates the
 * gates it knows about cannot fail on a gate it does not know about, which is precisely how #140 came to
 * exist. The list is read out of `submitPipeline.ts` — the place the gates actually run — so gate #12
 * fails this test the day it is wired, without anyone remembering to come here.
 *
 * CONTEXT MATTERS (and is the reason this file is not one line in adr-250.test.ts): several catalog
 * entries are *about* an existing circle («המשיק למעגל», «מנקודה E מחוץ למעגל O»). Parsed with an empty
 * context they take a different route and lower differently, so the guard would measure a parse no
 * student ever produces. A minimal single-circle context is what those forms are written against.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COMMAND_CATALOG,
  droppedCompoundRelation,
  droppedComparison,
  droppedConstructNoun,
  droppedGivenNumbers,
  droppedGivenRelations,
  droppedGivenVerbs,
  droppedMidsegment,
  droppedNewLabels,
  droppedRadiusSymbol,
  droppedRegionSubject,
  droppedWordRelations,
  introducedNewLabels,
  parse,
} from '@/parser';
import type { AnyCommand, Id } from '@/engine';

/** Every gate, called the way the submit path calls it. A gate is "clean" when it reports nothing. */
const GATES: Record<string, (u: string, cmds: AnyCommand[], pts: Id[]) => unknown[] | boolean> = {
  droppedNewLabels: (u, c, pts) => droppedNewLabels(u, c, pts),
  droppedGivenNumbers: (u, c) => droppedGivenNumbers(u, c),
  droppedGivenRelations: (u, c) => droppedGivenRelations(u, c),
  droppedGivenVerbs: (u, c) => droppedGivenVerbs(u, c),
  droppedCompoundRelation: (u, c) => droppedCompoundRelation(u, c),
  droppedWordRelations: (u, c) => droppedWordRelations(u, c),
  droppedComparison: (u, c) => droppedComparison(u, c),
  droppedConstructNoun: (u, c) => droppedConstructNoun(u, c),
  droppedRadiusSymbol: (u, c) => droppedRadiusSymbol(u, c),
  droppedRegionSubject: (u, c) => droppedRegionSubject(u, c),
  droppedMidsegment: (u, c) => droppedMidsegment(u, c),
  // #255's mirror gate is LINE-shaped, not command-shaped: it compares the LLM's canonical lines
  // against the student's text. Fed the example as its own canonical line, it asserts the property
  // that matters here — a construct stated in its documented form invents nothing.
  introducedNewLabels: (u, _c, pts) => introducedNewLabels(u, [u], pts),
};

const isClean = (v: unknown[] | boolean): boolean => (typeof v === 'boolean' ? !v : v.length === 0);
const show = (v: unknown[] | boolean): string => (typeof v === 'boolean' ? String(v) : JSON.stringify(v));

describe('#140 — the gate list is DERIVED from the submit path, never enumerated here', () => {
  it('every gate the pipeline calls is exercised by this file (ADR-W-006)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../app/submitPipeline.ts'), 'utf8');
    // BOTH halves of the battery's naming convention — `droppedX` (what the lowering LOST) and
    // `introducedX` (#255: what it ADDED). Extracting only the first would have silently missed the
    // mirror gate the day it landed, which is the exact failure ADR-W-006 exists to prevent.
    const called = [...new Set([...src.matchAll(/\b((?:dropped|introduced)[A-Z]\w*)\s*\(/g)].map((m) => m[1]))];
    // The extraction must find something: an anchor/naming change that silently yields an empty list
    // would leave this test passing forever while proving nothing (the shrinking-expectation trap).
    expect(called.length, 'no gates extracted from submitPipeline.ts — the naming convention changed').toBeGreaterThanOrEqual(8);
    for (const g of called) {
      expect(Object.keys(GATES), `submitPipeline.ts calls ${g}() — add it to GATES in this file (#140)`).toContain(g);
    }
  });
});

describe('#140 — no supported catalog example trips ANY honesty gate', () => {
  // The context those entries are written against: one existing circle O with its centre, and its
  // points available. Deliberately minimal — a maximal all-letters-exist context changes the parse
  // route for reference forms and would measure a parse no student produces.
  const CTX = { circles: ['O'], points: ['O'] as Id[] };

  const cases = COMMAND_CATALOG.filter((c) => c.supported).flatMap((c) =>
    [c.he, c.en].map((ex) => ({ ex, id: `${c.he} / ${c.en}` })),
  );

  it(`every supported example parses clean through all ${Object.keys(GATES).length} gates`, () => {
    const failures: string[] = [];
    for (const { ex } of cases) {
      const r = parse(ex, CTX as never);
      if (!r.ok) continue; // parseability is catalog.test.ts's job; this file measures gate honesty only
      for (const [name, gate] of Object.entries(GATES)) {
        const v = gate(ex, r.commands, CTX.points);
        if (!isClean(v)) failures.push(`${name} → ${show(v)}   on: «${ex}»`);
      }
    }
    // One assertion carrying the whole list: a gate regression names every construct it broke, which is
    // the report #138 needed (four forms, one root cause) rather than the first failure and a re-run.
    expect(failures, `honesty gates flag supported catalog input:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('the net is not vacuous — it runs over the real catalog and would SEE a false positive', () => {
    expect(cases.length).toBeGreaterThan(200);
    // A deliberately broken lowering of a real catalog example must be caught by this file's method:
    // the verb is stated, the commands carry no tangency — exactly the #138 shape, inverted.
    const ex = 'מנקודה E משיק נוגע במעגל O בנקודה D';
    expect(droppedGivenVerbs(ex, [{ type: 'segment', a: 'E', b: 'D' } as AnyCommand]).length).toBeGreaterThan(0);
  });
});
