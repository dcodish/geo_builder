/**
 * #1455 (ADR-W-096) — every 3-D refusal names only what the student can see. The corpus is every
 * sequence the 3-D test suite states (the #1394 harvest), replayed through the real store; each error is
 * rendered by `errorText3` with the real locale, and the VALUES it interpolates are checked by the shared
 * `studentFacingViolations`. Measured on main: «המישור «base»» and «גוף מסוג «pyramid»» — English engine
 * nouns inside Hebrew messages.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3 } from '../store/store3';
import { studentFacingViolations } from '../../shell/studentText';

const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ARRAY = new RegExp(String.raw`\[\s*((?:${STR})(?:\s*,\s*(?:${STR}))*)\s*,?\s*\]`, 'g');
const ITEM = new RegExp(STR, 'g');

function corpus(): string[][] {
  const seqs: string[][] = [];
  for (const f of readdirSync(__dirname).filter((n) => /\.tsx?$/.test(n) && !n.startsWith('student-text-1455'))) {
    const src = readFileSync(path.join(__dirname, f), 'utf8');
    for (const m of src.matchAll(ARRAY)) seqs.push([...m[1].matchAll(ITEM)].map((x) => x[0].slice(1, -1).replace(/\\(['"\\])/g, '$1')));
  }
  return seqs;
}

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

describe('#1455 — a 3-D refusal names only what the student can see', () => {
  const seqs = corpus();
  const found: string[] = [];
  let refusals = 0;
  for (const lines of seqs) {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    for (const line of lines) {
      useGeo3.getState().submit(line);
      const st = useGeo3.getState();
      if (!st.lastError) continue;
      refusals++;
      const c = derive3(st.facts, st.seed).construction;
      const names = [...c.points.keys(), ...c.planes.keys(), ...c.pointPlanes.keys(), ...c.lines.keys(), ...c.vectors.keys()];
      for (const v of studentFacingViolations(valuesOf(st.lastError), { typed: lines.join(' '), names })) found.push(`${v} ← «${line}»`);
    }
  }

  it('the corpus reaches real refusals (the guard is not vacuous)', () => {
    expect(seqs.length).toBeGreaterThan(500);
    expect(refusals).toBeGreaterThan(100);
  });

  it('no refusal interpolates an engine id or an untyped English word', () => {
    expect([...new Set(found)]).toEqual([]);
  });

  it('the check can fail: an engine noun in a value is reported', () => {
    expect(studentFacingViolations(['pyramid'], { typed: 'נפח הפירמידה = 11', names: [] })).toHaveLength(1);
  });
});
