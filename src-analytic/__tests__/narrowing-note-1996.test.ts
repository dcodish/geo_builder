/**
 * #1996 (ADR-AG-276, the analytic half of ADR-W-129) — THE GIVENS FORCED A NARROWER KIND, SAID IN ONE SENTENCE.
 *
 * Operator rulings of 2026-10-13 (#1996, three ballots): a note whenever the givens force a narrower named kind than
 * the noun typed, whatever caused it, naming the cause; triangles too, except when the typed given IS the right angle;
 * several givens listed as typed; the statement typed first named; silent when only numeric values force a kind on a
 * plain «משולש» / «מרובע».
 *
 * The thin lock runs the shared cross-builder rows (`shell/__tests__/fixtures/narrowing-note-rows.ts`) through analytic's
 * REAL submit decision (`decideSubmit`, recording lines as the App does) and its REAL text path (`narrowingNotesOf` →
 * `narrowingText` → `analyticI18n`), on the COMPLETE configuration pool. A line the submit gate accepts without adding
 * a row (`already-follows`, `already-known`) counts as recorded: the student's statement was accepted, nothing refused.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { narrowingNotesOf, narrowingText } from '../app/narrowing';
import { derive } from '../engine/derive';
import { configurationPool } from '../engine/evaluate';
import { SHAPES } from '../engine/shapes';
import { analyticI18n } from '../i18n';
import { NARROW_KINDS } from '../../shell/narrowing';
import { narrowingFaults, type NarrowGate } from '../../shell/__tests__/fixtures/narrowing-note-rows';

const he = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('he')(k, o) as string;
/** The page's bidi isolates (and marks), removed — the sentence as read. */
const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');

/** Submit each step through the real gate, recording what it records (the App's `recordLine`). */
function play(steps: readonly string[]): { lines: string[]; recorded: boolean } {
  const lines: string[] = [];
  let recorded = true;
  for (const step of steps) {
    const v = decideSubmit(step, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    else if (v.kind !== 'already-follows' && v.kind !== 'already-known') recorded = false;
  }
  return { lines, recorded };
}

/** The notes the page shows for these active lines, worded in Hebrew, on the complete pool. */
function notesFor(lines: readonly string[]): string[] {
  const d = derive(lines, 0);
  return narrowingNotesOf(lines, d).map((n) => plain(narrowingText(n, he, (i) => lines[i] ?? '')));
}

const gate: NarrowGate = (steps) => {
  const { lines, recorded } = play(steps);
  return { recorded, notes: notesFor(lines) };
};

describe('#1996 — the shared rows, through analytic’s real submit decision and text', () => {
  it('every row of narrowing-note-rows says exactly its note (or nothing) in analytic', async () => {
    expect(await narrowingFaults(gate, 'analytic')).toEqual([]);
  }, 600_000);
});

describe('#1996 — the declared kind is the noun as typed', () => {
  it('every quadrilateral and triangle noun of the registry carries its kind, and it is a kind of the lattice', () => {
    for (const [noun, row] of Object.entries(SHAPES)) {
      if (row.arity === 3 || row.arity === 4) {
        expect(row.kind, noun).toBeDefined();
        expect(NARROW_KINDS, noun).toContain(row.kind);
      } else expect(row.kind, noun).toBeUndefined();
    }
  });
});

describe('#1996 — lifecycle: the note is derived, never state', () => {
  const lines = ['מקבילית ABCD', 'AB = BC'];
  const NOTE = 'בגלל הנתון AB = BC, ABCD הוגבל ממקבילית למעוין — מעוין הוא סוג של מקבילית.';

  it('removing (or muting — the figure is folded from the active lines) the cause line removes the note', () => {
    expect(notesFor(lines)).toEqual([NOTE]);
    expect(notesFor(['מקבילית ABCD'])).toEqual([]);
  });

  it('re-deriving the same lines says the same (a reload says what typing said)', () => {
    expect(notesFor([...lines])).toEqual(notesFor(lines));
  });

  it('an incomplete pool shows nothing — and the same figure says the note once the pool completes', () => {
    const d = derive(lines, 0);
    const pool = configurationPool(d.construction);
    pool.defer(); // the page's mode (App.tsx): the pool completes after the render
    expect(pool.complete()).toBe(false);
    expect(narrowingNotesOf(lines, d)).toEqual([]);
    expect(pool.pendingShown, 'an incomplete pool asks for the re-render that brings the note').toBe(true);
    pool.fill();
    expect(narrowingNotesOf(lines, d).map((n) => plain(narrowingText(n, he, (i) => lines[i])))).toEqual([NOTE]);
  });

  it('the given is the line as the page shows it (a fallback-built row reads its spoken sentence)', () => {
    const d = derive(lines, 0);
    const [n] = narrowingNotesOf(lines, d);
    expect('causeLines' in n && n.causeLines).toEqual([1]);
    expect(plain(narrowingText(n, he, () => 'AB שווה ל-BC'))).toBe('בגלל הנתון AB שווה ל-BC, ABCD הוגבל ממקבילית למעוין — מעוין הוא סוג של מקבילית.');
  });
});

describe('#1996 — the fixture «מקבילית ABCD · ABCD חסום במעגל» loads, builds green, and says the note', () => {
  const file = join(__dirname, 'fixtures', 'issue-1996-parallelogram-inscribed.analytic.json');
  const fx = JSON.parse(readFileSync(file, 'utf8')) as { app: string; version: number; lines: string[]; seed: number };

  it('is a saved analytic figure whose every line still records through the real gate', () => {
    expect(fx.app).toBe('analytic-builder');
    const { lines, recorded } = play(fx.lines);
    expect(recorded).toBe(true);
    expect(lines).toEqual(fx.lines);
    expect(derive(lines, fx.seed).faults).toEqual([]);
  });

  it('says the circle note', () => {
    expect(notesFor(fx.lines)).toEqual(['כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.']);
  });

  it('in English too, from the same note', () => {
    const d = derive(fx.lines, fx.seed);
    const en = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('en')(k, o) as string;
    expect(narrowingNotesOf(fx.lines, d).map((n) => plain(narrowingText(n, en, (i) => fx.lines[i])))).toEqual([
      'For the circle to pass through every vertex, ABCD was constrained from a parallelogram to a rectangle — a rectangle is a kind of parallelogram.',
    ]);
  });
});

// #2169 (ADR-W-131): the one-way "FOUND" agreement check is retired — `nounsExclude` now READS the shared relation
// (`kindRelation`), locked both ways in quad-noun-pairs-2169.test.ts.
