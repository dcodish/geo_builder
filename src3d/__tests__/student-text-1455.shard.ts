/**
 * #1455 (ADR-W-096) — every 3-D refusal names only what the student can see. The corpus is every
 * sequence the 3-D test suite states (the #1394 harvest), replayed through the real store; each error is
 * rendered by `errorText3` with the real locale, and the VALUES it interpolates are checked by the shared
 * `studentFacingViolations`. Measured on main: «המישור «base»» and «גוף מסוג «pyramid»» — English engine
 * nouns inside Hebrew messages.
 *
 * #2610 (ADR-3D-412): the same replay also holds every NAME the figure SHOWS (the planes list, the drawn lines and
 * vectors, the created notice after every line; the canvas labels and the data panel at each sequence's end) to the
 * shared engine-token shape. A refusal's values were judged against the figure's names, so a name that was itself an
 * id («plane-ABCD», the projection's plane) passed both checks; this closes that hole. Every saved fixture joins the corpus.
 *
 * #2736: the corpus is dealt round-robin across `student-text-1455.test.ts` (shard 1) and
 * `student-text-1455-{2..5}.test.ts`, so the slices run in parallel. Every file here starts with
 * `student-text-1455`, which keeps the harvest from reading this guard's own sources. The whole-corpus vacuity
 * floors are held per shard at 1/n of the floor each (each shard > floor/n ⇒ the shards together > floor), and
 * shard 1 proves the deal covers every sequence exactly once.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3 } from '../store/store3';
import { hasEngineToken, studentFacingViolations } from '../../shell/studentText';
import { shownNames3 } from './shownNames3';

const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ARRAY = new RegExp(String.raw`\[\s*((?:${STR})(?:\s*,\s*(?:${STR}))*)\s*,?\s*\]`, 'g');
const ITEM = new RegExp(STR, 'g');
const FIXTURES = path.join(__dirname, '..', '..', 'fixtures3');

/** The whole-corpus floors (#1455, #2610), before they are dealt across shards. */
const MIN_SEQS = 500;
const MIN_REFUSALS = 100;
const MIN_SHOWN = 5000;

function corpus(): string[][] {
  const seqs: string[][] = [];
  for (const f of readdirSync(__dirname).filter((n) => /\.tsx?$/.test(n) && !n.startsWith('student-text-1455'))) {
    const src = readFileSync(path.join(__dirname, f), 'utf8');
    for (const m of src.matchAll(ARRAY)) seqs.push([...m[1].matchAll(ITEM)].map((x) => x[0].slice(1, -1).replace(/\\(['"\\])/g, '$1')));
  }
  // #2610: every saved fixture's utterances, in order
  for (const f of readdirSync(FIXTURES).filter((n) => n.endsWith('.geo3.json'))) {
    const file = JSON.parse(readFileSync(path.join(FIXTURES, f), 'utf8')) as { facts?: { utterance?: string }[] };
    const lines = (file.facts ?? []).map((x) => x.utterance ?? '').filter(Boolean);
    if (lines.length) seqs.push(lines);
  }
  return seqs;
}

/** The corpus indices shard k of n replays (1-based k). */
const dealt = (size: number, k: number, n: number): number[] => [...Array(size).keys()].filter((i) => i % n === k - 1);

/** Render one error with the real locale, keeping every value it interpolates. */
function valuesOf(err: NonNullable<ReturnType<typeof useGeo3.getState>['lastError']>): string[] {
  const values: string[] = [];
  const t = (k: string, o?: Record<string, unknown>) => {
    for (const v of Object.values(o ?? {})) if (typeof v === 'string') values.push(v);
    return i18n3d.t(k, o) as string;
  };
  errorText3(t, err);
  return values;
}

/** Register shard k of n of the #1455 / #2610 corpus guard. */
export function studentText1455Shard(k: number, n: number): void {
  const tag = ` (shard ${k}/${n})`;
  describe('#1455 — a 3-D refusal names only what the student can see', () => {
    const all = corpus();
    const seqs = dealt(all.length, k, n).map((i) => all[i]);
    const found: string[] = [];
    const shownLeaks: string[] = [];
    let refusals = 0;
    let shown = 0;
    const holdShown = (full: boolean, line: string) => {
      for (const nm of shownNames3(full)) {
        shown++;
        if (hasEngineToken(nm.text)) shownLeaks.push(`${nm.surface}: «${nm.text}» ← «${line}»`);
      }
    };
    for (const lines of seqs) {
      useGeo3.setState({ facts: [], seed: 0, lastError: null, lastCreated: null });
      for (const [i, line] of lines.entries()) {
        useGeo3.getState().submit(line);
        holdShown(i === lines.length - 1, line);
        const st = useGeo3.getState();
        if (!st.lastError) continue;
        refusals++;
        const c = derive3(st.facts, st.seed).construction;
        const names = [...c.points.keys(), ...c.planes.keys(), ...c.pointPlanes.keys(), ...c.lines.keys(), ...c.vectors.keys()];
        for (const v of studentFacingViolations(valuesOf(st.lastError), { typed: lines.join(' '), names })) found.push(`${v} ← «${line}»`);
      }
    }

    if (k === 1) {
      it('the corpus is large, and the shards deal every sequence exactly once', () => {
        expect(all.length).toBeGreaterThan(MIN_SEQS);
        const seen = Array.from({ length: n }, (_, j) => dealt(all.length, j + 1, n)).flat().sort((a, b) => a - b);
        expect(seen).toEqual([...all.keys()]);
      });
    }

    // Each shard clears floor/n, so the n shards together clear the whole-corpus floor.
    it(`the corpus reaches real refusals (the guard is not vacuous)${tag}`, () => {
      expect(refusals).toBeGreaterThan(MIN_REFUSALS / n);
    });

    it(`no refusal interpolates an engine id or an untyped English word${tag}`, () => {
      expect([...new Set(found)]).toEqual([]);
    });

    it(`#2610: the shown-name sweep reaches real figures (not vacuous)${tag}`, () => {
      expect(shown).toBeGreaterThan(MIN_SHOWN / n);
    });

    it(`#2610: no name the figure shows carries an engine id${tag}`, () => {
      expect([...new Set(shownLeaks)]).toEqual([]);
    });

    if (k === 1) {
      it('the check can fail: an engine noun in a value is reported', () => {
        expect(studentFacingViolations(['pyramid'], { typed: 'נפח הפירמידה = 11', names: [] })).toHaveLength(1);
      });
    }
  });
}
