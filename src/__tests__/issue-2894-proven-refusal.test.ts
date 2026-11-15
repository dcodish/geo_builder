/**
 * #2894 ([ADR-833](../../docs/06-decisions.md#adr-833)) — A LINE THAT CANNOT HOLD IS REFUSED AT ONCE, IN THE LADDER'S OWN
 * WORDS.
 *
 * The metric closure proves that no figure holds the lengths, and the failure ladder returns the refusal its climb
 * would have ended with, without climbing. The lock: every row of each sequence reads exactly as it does when the
 * ladder climbs (the proof turned off), and the proof is what answered (far less work).
 *
 * pipeline-lock: the refusal's other half — the earlier statement it names, `[vs #i]` — is the FOLD's drop-one search, not
 * the step's, so "the proof reads as the climb" can only be checked on a folded figure, with and without the proof.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { factsOf } from './scenario-pipeline';
import { clearReplayCaches, replay } from '@/store/geoStore';
import { ladderProofConfig } from '@/engine/step';
import { work } from '@/engine/solveBudget';

const SEQUENCES: Record<string, string[]> = {
  'square diagonal': ['ריבוע ABCD', 'AB = 3', 'AC = 10'],
  'equilateral side': ['משולש שווה צלעות ABC', 'AB = 3', 'BC = 5'],
  'diameter': ['מעגל O ברדיוס 2', 'AB קוטר במעגל', 'AB = 6'],
  'chord past the diameter': ['מעגל O ברדיוס 2', 'AB מיתר במעגל', 'AB = 6'],
};

afterEach(() => {
  ladderProofConfig.exit = true;
});

function fold(lines: string[]): { rows: [string | undefined, unknown][]; units: number } {
  clearReplayCaches();
  const d0 = work.done;
  const facts = factsOf(lines);
  const d = replay(facts);
  return { rows: facts.map((f): [string | undefined, unknown] => [f.utterance, d.status[f.id]]), units: work.done - d0 };
}

/** Two whose climb costs 8–18 s here: their rows are held to the text `main` printed before the proof (63ccbc5a). */
const MEASURED: Record<string, { lines: string[]; refusal: string }> = {
  'rectangle diagonal': { lines: ['מלבן ABCD', 'AB = 3', 'BC = 4', 'AC = 7'], refusal: 'over-constrained: |AC| = 7 cannot hold [vs #3]' },
  'a square over unequal sides': { lines: ['מרובע ABCD', 'AB = 3', 'BC = 4', 'ABCD ריבוע'], refusal: 'over-constrained: |AB| = |BC| cannot hold [vs #3]' },
};

describe('#2894 — a proven refusal reads exactly as the climbed one', () => {
  for (const [name, { lines, refusal }] of Object.entries(MEASURED)) {
    it(`${name}: «${lines.join(' · ')}» reads as it did before the proof`, () => {
      const { rows } = fold(lines);
      const last = lines[lines.length - 1];
      for (const [u, st] of rows) expect(st, `«${u}»`).toBe(u === last ? refusal : 'ok');
    }, 60_000);
  }
  for (const [name, lines] of Object.entries(SEQUENCES)) {
    it(`${name}: «${lines.join(' · ')}»`, () => {
      const proven = fold(lines);
      ladderProofConfig.exit = false;
      const climbed = fold(lines);
      expect(proven.rows).toEqual(climbed.rows);
      expect(proven.rows.some(([, st]) => typeof st === 'string' && st !== 'ok'), 'the last line is refused').toBe(true);
      expect(proven.units, 'the proof answered, not the climb').toBeLessThan(climbed.units);
    }, 120_000);
  }
});
