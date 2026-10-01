/**
 * THE 471 CORPUS RATCHET (#1616, #1618).
 *
 * The 4-point bagrut geometry questions (Q4 + Q5 of the 23 exams in `חוברת בגרויות 471 2025`), each as
 * the student would type it — the exam's OWN sentences, one per line, transcribed into
 * `fixtures/corpus471.json` from `docs/sample questions/471-geometry-inventory.json`. Only the
 * transcribers' figure-position notes («A למעלה משמאל…») are left out: they describe the drawing, they
 * are not sentences anyone types.
 *
 * The analytic tool was built for the 5-point question and accepted 23 of these lines as printed when
 * the corpus was first measured. Each #1616 slice raises the floor below; the test fails if a change
 * LOWERS either count, so a slice can never buy one structure by losing another. Raising a floor is
 * part of the slice that earned it.
 *
 * This counts lines the parser and apply ACCEPT — it is a coverage gate, not a figure check. A
 * question that fully lands gets a `.geo.json` fixture in the slice that completes it, which is where
 * the figure itself is verified.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

interface CorpusQuestion {
  id: string;
  title: string;
  crossedOut: boolean;
  lines: string[];
}

const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));

/** The floors. Raise them in the commit that earns them; never lower them. */
const FLOOR = { lines: 175, questions: 10 };

function measure() {
  let lines = 0;
  let total = 0;
  const landed: string[] = [];
  for (const q of CORPUS) {
    const d = derive(q.lines, 0);
    const failing = new Set(d.faults.map((f) => f.index));
    total += q.lines.length;
    lines += q.lines.length - failing.size;
    if (failing.size === 0) landed.push(q.id);
  }
  return { lines, total, landed };
}

describe('#1618 — the 471 corpus ratchet', () => {
  it('the corpus is the 46 questions of the inventory', () => {
    expect(CORPUS).toHaveLength(46);
    for (const q of CORPUS) expect(q.lines.length).toBeGreaterThan(0);
  });

  it('no change lowers the number of corpus lines or questions that land', () => {
    const m = measure();
    // Printed so a slice can read its own gain off the run.
    console.log(`471 corpus: ${m.lines}/${m.total} lines land; ${m.landed.length}/${CORPUS.length} questions fully land [${m.landed.join(' ')}]`);
    expect(m.lines).toBeGreaterThanOrEqual(FLOOR.lines);
    expect(m.landed.length).toBeGreaterThanOrEqual(FLOOR.questions);
  });
});
