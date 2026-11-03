/**
 * #2691 (ADR-AG-389) — THE SWEEP: no point letter lands on drawn ink or on another letter, anywhere the analytic
 * builder has a figure to show.
 *
 * Operator, 2026-11-03: *"points C and D are not located correctly and are on the line instead of next to it"*. The
 * class is every point letter in analytic (a fixed offset up-right of the dot, never placed), so the lock is the
 * class: every saved fixture and every catalog example, at configurations 0–2, with every canvas switch on and with
 * every switch off (#2688). A letter box (`pointLabelBox`) that crosses a drawn segment, line, curve, arc, extension,
 * perpendicular or locus, or overlaps another letter, is a failure, named by figure, seed and point.
 *
 * Measured on the branch base 0ad40243 (main's letter rule, unchanged): 2,130 letter boxes crossing drawn ink, 20 overlapping another
 * letter and 10 covering another dot, over 2,544 scenes and 7,662 letters (`pointLetterSweep.ts`). After: none.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeOf } from '../app/active';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { ALL_SHOWN, type CanvasDisplay } from '../render/canvasDisplay';
import { derive } from '../engine/derive';
import { letterViolations, scenesFrom } from './pointLetterSweep';

const DIR = path.join(__dirname, 'fixtures');
const NONE: CanvasDisplay = { grid: false, numbers: false, values: false };

const figures: Array<{ name: string; lines: string[] }> = [
  ...readdirSync(DIR)
    .filter((n) => n.endsWith('.analytic.json'))
    .sort()
    .map((n) => {
      const env = JSON.parse(readFileSync(path.join(DIR, n), 'utf8')) as { lines: string[]; disabled?: number[] };
      return { name: n, lines: activeOf(env.lines, env.disabled ?? []) };
    }),
  ...COMMAND_CATALOG_ANALYTIC.filter((e) => !e.lane).map((e) => ({ name: `catalog «${e.he}»`, lines: [...(e.needs ?? []), e.he] })),
];

describe('#2691 — no point letter on drawn ink or on another letter (every fixture and catalog example, seeds 0–2)', () => {
  it('the sweep is not empty', () => {
    expect(figures.length).toBeGreaterThan(150);
  });

  // round #2678: and again with every stated conic's chip on «both» (#1863) — a focus dot and a directrix are ink
  it('zero crossings, zero letter overlaps — switches on and off, conic chips off and on', () => {
    const bad: string[] = [];
    let scenes = 0;
    let letters = 0;
    const tally = { ink: 0, letter: 0, dot: 0 };
    for (const f of figures) {
      for (const seed of [0, 1, 2]) {
        const d = derive([...f.lines], seed);
        if (d.figure.points.length === 0) continue;
        for (const chips of [false, true]) {
          const both = scenesFrom(d, [ALL_SHOWN, NONE], chips);
          for (const [i, tag] of (['on', 'off'] as const).entries()) {
            const s = both?.[i];
            if (!s) continue;
            scenes += 1;
            letters += s.points.length;
            for (const v of letterViolations(s)) {
              tally[v.kind] += 1;
              if (v.kind !== 'dot') bad.push(`${f.name} · seed ${seed} · switches ${tag}${chips ? ' · chips' : ''}: ${v.point} ${v.kind} ${v.what}`);
            }
          }
        }
      }
    }
    // the before/after numbers the issue reports are this line
    console.log(`[#2691 sweep] figures=${figures.length} scenes=${scenes} letters=${letters} ink=${tally.ink} letter=${tally.letter} dot=${tally.dot}`);
    expect(bad).toEqual([]);
  });
});
