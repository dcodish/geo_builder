/**
 * #434 ([ADR-509](../../docs/06-decisions.md#adr-509)) — the corpus lock on what a DETERMINED figure prints,
 * in BOTH directions. Sharded four ways (`determined-prints-{1..4}.test.ts`, each over its own snapshot) —
 * an infeasible seat or branch alternative pays the recruiter ladder to be refuted (#259), so the 66 figures
 * cost ~13 min in one file.
 *
 * Each snapshot records, for every scenario and fixture whose count read `freeDofCount === 0` on
 * 2026-09-13, the exact rows the canvas (definite angles / lengths) and the values panel print once the pool
 * is the figure's ADMISSIBLE SET. A withdrawn print coming back (a seed-, branch- or seat-dependent number
 * presented as knowledge — the 16 the operator ruled withheld, plus the two collapsed-seat figures) fails
 * here; so does a genuinely determined figure LOSING a print (the other 48). Values compare at 2 decimals;
 * a figure that stops being determined, or a new determined figure, is a snapshot change to make on purpose:
 *
 *     UPDATE_DETERMINED_PRINTS=1 npx vitest run src/__tests__/determined-prints-
 *
 * Only the listed figures are folded (a full corpus fold is ~10 min); the list itself is the lock.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENARIOS_1 } from './scenarios-corpus-1';
import { SCENARIOS_2 } from './scenarios-corpus-2';
import { SCENARIOS_3 } from './scenarios-corpus-3';
import { SCENARIOS_4 } from './scenarios-corpus-4';
import { factsOf } from './scenario-pipeline';
import { deserializeFigure } from '@/store/figureFile';
import { computeValues, detectAll, firstSatisfyingSeed, replay, sharedSamples, variantConfigs } from '@/replay/core';
import { freeDofCount } from '@/engine';
import type { Fact } from '@/store/geoStore';

const fixtures = import.meta.glob('./fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const scenarios = new Map([...SCENARIOS_1, ...SCENARIOS_2, ...SCENARIOS_3, ...SCENARIOS_4].map((sc) => [sc.id, sc] as const));

type Snapshot = Record<string, string[]>;

/** Every value the student SEES as knowledge — canvas definite angles/lengths + the panel's rows. */
export function printsOf(facts: Fact[]): string[] {
  const out: string[] = [];
  const { relations } = detectAll(facts);
  for (const a of relations.definiteAngles) out.push(`canvas ∠${a.a}${a.vertex}${a.b} = ${a.valueDeg.toFixed(2)}`);
  for (const l of relations.definiteLengths) out.push(`canvas |${l.a}${l.b}| = ${l.value.toFixed(2)}`);
  const rows = computeValues(facts).rows as { kind: string; ids?: string[]; value?: number; note?: string }[];
  for (const r of rows) {
    if (r.note === 'undetermined' || r.value === undefined) continue;
    out.push(`panel ${r.kind} ${(r.ids ?? []).join('')} = ${Number(r.value).toFixed(2)}`);
  }
  return out.sort();
}

/** `sc:<scenario id>` → the scenario's facts through the real parse path; `fx:<file>` → the saved figure's. */
export function factsFor(id: string): Fact[] {
  if (id.startsWith('sc:')) {
    const sc = scenarios.get(id.slice(3));
    if (!sc) throw new Error(`snapshot names a scenario that no longer exists: ${id}`);
    return factsOf(sc.steps);
  }
  const text = fixtures[`./fixtures/${id.slice(3)}`];
  if (!text) throw new Error(`snapshot names a fixture that no longer exists: ${id}`);
  const r = deserializeFigure(text);
  if (!r.ok) throw new Error(`fixture refused: ${id}`);
  return r.file.facts;
}

export function lockShard(snapshotUrl: URL): void {
  const path = fileURLToPath(snapshotUrl);
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
  const update = !!process.env.UPDATE_DETERMINED_PRINTS;
  const next: Snapshot = {};

  describe('#434 — determined figures print exactly what the admissible set supports', () => {
    it('the snapshot is not empty', () => {
      expect(Object.keys(snapshot).length).toBeGreaterThan(0);
    });

    for (const id of Object.keys(snapshot)) {
      it(id, () => {
        const facts = factsFor(id);
        const fig = replay(facts, firstSatisfyingSeed(facts));
        expect(fig.lastError, 'the figure still builds').toBeNull();
        const determined = variantConfigs(facts).length === 1 && freeDofCount(fig.construction) === 0;
        expect(determined, 'the count still reads 0 (else the figure leaves this lock on purpose)').toBe(true);
        expect(sharedSamples(facts).determined, 'the admissible set is complete (under the cap; tests run deadline-free)').toBe(true);
        const prints = printsOf(facts);
        next[id] = prints;
        if (!update) expect(prints).toEqual([...snapshot[id]].sort());
      }, 600_000);
    }

    it('snapshot written when UPDATE_DETERMINED_PRINTS is set', () => {
      if (update) writeFileSync(path, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 1) + '\n');
    });
  });
}
