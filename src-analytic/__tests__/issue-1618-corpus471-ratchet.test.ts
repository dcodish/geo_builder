/**
 * THE 471 CORPUS RATCHET (#1616, #1618).
 *
 * The 4-point bagrut geometry questions (Q4 + Q5 of the 23 exams in `חוברת בגרויות 471 2025`), each as
 * the student would type it — the exam's OWN sentences, one per line, transcribed into
 * `fixtures/corpus471.json` from `docs/sample questions/471-geometry-inventory.json`. The exam's own lines come
 * first and unchanged. After them come the transcribers' figure-position notes («A משמאל ל-O», «D מתחת לציר x»,
 * «B ברביע הראשון»), each clause as a line the grammar reads: since #1706 a position word is a given that narrows
 * the configurations, and a student who sees the printed figure types what it shows (operator, 2026-10-03, on
 * #1706; ADR-AG-222). A clause with no readable meaning («הקטעים CM, DM מסורטטים», «A למעלה משמאל» with nothing
 * to be left of) is left out; ADR-AG-222 lists them.
 *
 * The analytic tool was built for the 5-point question and accepted 23 of these lines as printed when
 * the corpus was first measured. Each #1616 slice raises the floor below; the test fails if a change
 * LOWERS either count, so a slice can never buy one structure by losing another. Raising a floor is
 * part of the slice that earned it.
 *
 * This counts lines the parser and apply ACCEPT — it is a coverage gate, not a figure check. A line the
 * submit decision TEACHES (the exam's construction imperatives, ADR-AG-206) is counted as the sentence the
 * student confirms: `confirmTaught` is the app's own decision, called here, never a copy of it. A
 * question that fully lands gets a `.geo.json` fixture in the slice that completes it, which is where
 * the figure itself is verified.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { confirmTaught } from '../app/submit';

interface CorpusQuestion {
  id: string;
  title: string;
  crossedOut: boolean;
  /** How many of `lines` the exam prints; the transcribers' figure-position notes follow them. */
  printed: number;
  lines: string[];
}

const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));

/** The floors. Raise them in the commit that earns them; never lower them. */
const FLOOR = { lines: 360, questions: 45 }; // ADR-AG-240 (#1699): 7/4 derived whole blames its impossible line 4 alone, 357 → 360
// (earlier: ADR-AG-222 amendment: the figure-position notes are typed lines (#1706).)

function measure() {
  let lines = 0;
  let total = 0;
  const landed: string[] = [];
  for (const q of CORPUS) {
    // ADR-AG-206: the lines as the student ends up holding them — every taught imperative confirmed.
    const d = derive(confirmTaught(q.lines, 0), 0);
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
    for (const q of CORPUS) {
      expect(q.lines.length).toBeGreaterThan(0);
      expect(q.printed, q.id).toBeGreaterThan(0);
      expect(q.printed, q.id).toBeLessThanOrEqual(q.lines.length);
    }
  });

  it('no change lowers the number of corpus lines or questions that land', () => {
    const m = measure();
    // Printed so a slice can read its own gain off the run.
    console.log(`471 corpus: ${m.lines}/${m.total} lines land; ${m.landed.length}/${CORPUS.length} questions fully land [${m.landed.join(' ')}]`);
    expect(m.lines).toBeGreaterThanOrEqual(FLOOR.lines);
    expect(m.landed.length).toBeGreaterThanOrEqual(FLOOR.questions);
  });
});
