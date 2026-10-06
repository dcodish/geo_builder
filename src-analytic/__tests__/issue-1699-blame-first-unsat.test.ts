/**
 * #1699 (ADR-AG-240) — one impossible given is blamed ALONE, also when the whole list is derived at once.
 *
 * ADR-AG-231's drop-one probe (`completingStatement`) names the statement whose removal ADMITS a figure — every given,
 * every selector and the ring holding. When it names one, the selectors and ring faults the compromise configuration
 * broke are that same contradiction, not second culprits. Before this, `derive`'s selector arm ran first and refused,
 * on corpus 7/4 derived whole, the triangle line («במשולש OBC …», its `distinct`), «B ברביע הראשון» and «E על הקטע OC»
 * beside the impossible «S_BDC / S_ODC = 0.8».
 *
 * Every lock CALLS the real path (`derive`, `confirmTaught`, `decideSubmit`).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { completingStatement } from '../engine/evaluate';
import { confirmTaught, decideSubmit } from '../app/submit';

const CORPUS: Array<{ id: string; lines: string[] }> = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'),
);
const corpus = (id: string) => CORPUS.find((q) => q.id === id)!.lines;
const blamed = (lines: readonly string[], seed: number) =>
  derive(lines, seed).faults.map((f) => `${f.code}@${f.index}`).sort();

describe('#1699 — the completing statement is blamed alone when the list is derived whole', () => {
  it('corpus 7/4 derived whole blames «נתון: S_BDC / S_ODC = 0.8» (line 4) alone, at seeds 0–3', () => {
    const lines = confirmTaught(corpus('7/4'), 0);
    expect(lines[4]).toBe('נתון: S_BDC / S_ODC = 0.8');
    for (let seed = 0; seed < 4; seed += 1) {
      expect(blamed(lines, seed), `seed ${seed}`).toEqual(['unsatisfiable@4']);
    }
  });

  it('the same verdict typed line by line: lines 0–3 record, line 4 is refused, and what follows records', () => {
    const held: string[] = [];
    const kinds = confirmTaught(corpus('7/4'), 0).map((line) => {
      const v = decideSubmit(line, held, 0);
      if (v.kind === 'record') held.push(v.line);
      return v.kind;
    });
    expect(kinds.slice(0, 5)).toEqual(['record', 'record', 'record', 'record', 'refused']);
    expect(held).not.toContain('נתון: S_BDC / S_ODC = 0.8');
  });

  /**
   * The class, not the one sentence: ANY impossible given on this figure, and in any position. Each of these also locks
   * the ring arm's gate — with the selector arm silenced alone, the collapsed triangle the compromise draws is refused
   * on line 0 as `ring-contradicts-noun` instead (measured while building ADR-AG-240).
   */
  it('a different impossible given on 7/4’s figure («S_BDC = 5») is blamed alone too', () => {
    const q = confirmTaught(corpus('7/4'), 0);
    const lines = [...q.slice(0, 4), 'S_BDC = 5', ...q.slice(5)];
    for (let seed = 0; seed < 2; seed += 1) {
      expect(blamed(lines, seed), `seed ${seed}`).toEqual(['unsatisfiable@4']);
    }
  });

  it('the impossible ratio stated LAST, after the selectors it breaks, is blamed alone', () => {
    const q = confirmTaught(corpus('7/4'), 0);
    const lines = [...q.slice(0, 4), ...q.slice(5), q[4]];
    for (let seed = 0; seed < 2; seed += 1) {
      expect(blamed(lines, seed), `seed ${seed}`).toEqual([`unsatisfiable@${lines.length - 1}`]);
    }
  });
});

describe('#1699 — controls: genuinely conflicting lines are all still named', () => {
  it('two INDEPENDENT contradictions on 7/4’s figure: no single removal admits it, so both givens are named', () => {
    const lines = [...confirmTaught(corpus('7/4'), 0).slice(0, 5), 'OC = 3'];
    const d = derive(lines, 0);
    expect(completingStatement(d.construction, d.constraintLine, 0)).toBeNull();
    const faults = blamed(lines, 0);
    expect(faults).toContain('unsatisfiable@4');
    expect(faults).toContain('unsatisfiable@5');
  });

  it('a selector that fails on its own is still refused on its line (no given fails, the probe never runs)', () => {
    // #1069's own case: D on the side BC, BD = 18 on a 10-unit side.
    const d = derive(['A(0,0)', 'B(10,0)', 'C(10,10)', 'D על הצלע BC', 'BD = 18'], 0);
    expect(d.faults.map((f) => f.index)).toContain(3);
  });
});
