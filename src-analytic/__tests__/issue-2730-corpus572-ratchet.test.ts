/**
 * THE 572 CORPUS RATCHET (#2730, ADR-AG-424).
 *
 * Question 1 of the 16 exams in `אוסף בגרויות 572 Logify 2026`, each sentence as the exam prints it, transcribed
 * into `fixtures/corpus572.json`: `given` a line that adds to the figure, `locus` a locus statement, `question` what
 * the exam asks. Only the givens are counted; the other two are kept for the next measurement.
 *
 * Unlike the 471 ratchet this walks the STUDENT'S path: one line at a time through {@link decideSubmit}, in the
 * configuration the previous line was drawn in. A whole-list `derive` can land a figure a student typing line by line
 * is refused (471's 23/5), so that count runs high. No model call: a line the model would rescue counts as refused,
 * which is why this floor sits well below what a student gets. It measures the deterministic grammar.
 *
 * The floor can only rise. Raising it is part of the change that earned it. Under 2 seconds.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import type { Seed } from '../engine/evaluate';

interface CorpusLine {
  kind: 'given' | 'locus' | 'question';
  text: string;
}

interface CorpusQuestion {
  id: string;
  exam: string;
  lines: CorpusLine[];
}

const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus572.json'), 'utf8'));

/** The floor. Raise it in the commit that earns it; never lower it. */
const FLOOR = { givens: 45 }; // ADR-AG-424: the first measurement, `main` @ 7d485d14

/** The given lines a student typing this question in order gets recorded. A refused line stays out, as in the app. */
function recorded(q: CorpusQuestion): number {
  const held: string[] = [];
  let seed: Seed = 0;
  let count = 0;
  for (const { kind, text } of q.lines) {
    if (kind !== 'given') continue;
    const verdict = decideSubmit(text, held, seed);
    if (verdict.kind === 'record') {
      held.push(text);
      seed = verdict.configuration ?? seed;
      count += 1;
    } else if (verdict.kind === 'teach') {
      const taught = decideSubmit(verdict.canonical, held, seed);
      if (taught.kind === 'record') {
        held.push(verdict.canonical);
        seed = taught.configuration ?? seed;
        count += 1;
      }
    } else if (verdict.kind === 'already-known' || verdict.kind === 'already-follows') {
      count += 1;
    }
  }
  return count;
}

describe('#2730 — the 572 corpus ratchet', () => {
  it('the corpus is question 1 of the 16 exams', () => {
    expect(CORPUS).toHaveLength(16);
    for (const q of CORPUS) expect(q.lines.some((l) => l.kind === 'given'), q.id).toBe(true);
  });

  it('no change lowers the number of printed givens a student gets recorded', () => {
    const total = CORPUS.reduce((n, q) => n + q.lines.filter((l) => l.kind === 'given').length, 0);
    const givens = CORPUS.reduce((n, q) => n + recorded(q), 0);
    // Printed so a change can read its own gain off the run.
    console.log(`572 corpus: ${givens}/${total} printed givens record`);
    expect(givens).toBeGreaterThanOrEqual(FLOOR.givens);
  });
});
