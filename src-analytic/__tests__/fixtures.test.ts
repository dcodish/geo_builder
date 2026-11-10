/**
 * THE SAVED-SESSION FIXTURE NET for the analytic builder — #2654 idea 6 (ADR-W-172).
 *
 * docs/22 §9 names `src-analytic/__tests__/fixtures/` as this builder's fixtures folder, and the other three
 * builders each run theirs through one zero-authoring net (2-D `src/__tests__/fixtures.test.ts`, 3-D
 * `src3d/__tests__/fixtures3.test.ts`, complex `src-complex/__tests__/fixtures.test.ts`). Analytic had none: each
 * of its fixtures was replayed only by the issue test that imports it, so a fixture no test imports (three, when
 * this net was written) was not coverage at all, and an exam fixture was checked only for what its own issue
 * asked. This is the net, with the 2-D contract:
 *
 *  1. **No drift** — every saved line still parses. A line the grammar stopped reading is named.
 *  2. **Loads green** — the real load path (`loadAnalyticSession`, the file picker and the restore offer) audits
 *     the session and reports nothing failed.
 *  3. **Builds green at the saved configuration** — `derive` at the saved seed has no fault: nothing unread,
 *     contradicted or unsatisfiable, which is the analytic verifier's verdict.
 *
 * A fixture that deliberately ends on a refused line is listed in `REFUSES_LAST_LINE` with the refusal it must
 * produce, and only those: a fixture newly refusing fails, and a listed one that starts building fails too.
 *
 * Each `describe` carries the envelope's own name, so the exam corpus runner (`npm run test:exams`) selects the
 * exam fixtures from this file by the exam pattern, and a failure names the exam.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { activeOf, activePins, rowOf } from '../app/active';
import { loadAnalyticSession } from '../app/loadSession';
import { parseLine } from '../parser/parseAnalytic';
import { useAnalyticStore } from '../store/useAnalyticStore';

interface Envelope {
  app: string;
  lines: string[];
  seed?: number;
  name?: string;
  disabled?: number[];
  /** #1973 (ADR-AG-430): per row, the ring a cevian line was accepted in. */
  hosts?: Record<string, string[]>;
}

const DIR = path.join(__dirname, 'fixtures');
const FILES = readdirSync(DIR).filter((n) => n.endsWith('.analytic.json')).sort();

/** The fixtures saved to lock a REFUSAL: their last active line must be refused with exactly this code. */
const REFUSES_LAST_LINE: Record<string, string> = {
  // #1963 — a circle through three points stated to lie on one line: the last line is refused, quoting the ⟂ reason.
  'issue-1963-circle-through-collinear': 'forced-collinear',
  // #2115 — AB is a side of the triangle, so it cannot bisect an angle: the last line is refused, as in 2-D.
  'issue-2115-bisector-on-side': 'bisector-is-side',
  // #2664 — «קנונית» said of a parabola its equation puts off the origin: the word is a claim, refused by name.
  'issue-2664-canonical-word-refused': 'not-canonical',
};

beforeEach(() => {
  useAnalyticStore.getState().restore({ lines: [], seed: 0, name: '' });
});

describe('analytic saved-session fixtures net (#2654, ADR-W-172)', () => {
  it('the net is not empty, and every listed refusal names a fixture on disk', () => {
    expect(FILES.length).toBeGreaterThan(0);
    for (const k of Object.keys(REFUSES_LAST_LINE)) expect(FILES, k).toContain(`${k}.analytic.json`);
  });

  for (const file of FILES) {
    const id = file.replace(/\.analytic\.json$/, '');
    const env = JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as Envelope;
    const lines = env.lines;
    const active = activeOf(lines, env.disabled ?? []);
    const seed = env.seed ?? 0;
    const refusal = REFUSES_LAST_LINE[id];

    describe(`${id} — ${env.name ?? ''}`, () => {
      it('every saved line still parses (drift)', () => {
        expect(lines.filter((l) => !parseLine(l).ok)).toEqual([]);
      });

      if (refusal) {
        it(`refuses its last line with «${refusal}», and nothing else`, () => {
          const d = derive(active, seed);
          expect(d.faults.map((f) => ({ index: f.index, code: f.code }))).toEqual([{ index: active.length - 1, code: refusal }]);
        });
        return;
      }

      it('loads green through the real load path', () => {
        expect(loadAnalyticSession(env as unknown as Record<string, unknown>, id).failed).toBe(0);
      });

      it('builds green at its saved configuration', () => {
        const d = derive(active, seed);
        expect(d.faults.map((f) => `${f.code}: ${active[f.index] ?? f.index}`)).toEqual([]);
      });

      // #1973 (ADR-AG-430): a line saved with the host its cevian was accepted in still resolves in that shape
      if (env.hosts) {
        const hosts = env.hosts;
        it('every recorded cevian host is the shape its line resolves in', () => {
          const rows = rowOf(lines.length, env.disabled ?? []);
          const d = derive(active, seed, {}, activePins(hosts as Record<number, string[]>, lines.length, env.disabled ?? []));
          for (const [row, ring] of Object.entries(hosts)) {
            expect(d.hosts.find((h) => rows[h.index] === Number(row))?.host.ring, `row ${row}: «${lines[Number(row)]}»`).toEqual(ring);
          }
        });
      }
    });
  }
});
