/**
 * #1728 (ADR-3D-297) — TWO DIAGONALS NAMED BY LETTERS MEET WHERE BOTH ARE.
 *
 * «מרובע ABCD» · «האלכסונים AB ו-CD נפגשים בנקודה E» recorded ONE command, `point-on-segment3 E on AB at
 * t = ½`: the second pair and the meeting were dropped, a parallelogram was assumed, and the sides AB and
 * CD were accepted as "diagonals" — green. The same lowering put the true meet of «האלכסונים AC ו-BD» at
 * the midpoint of AC, which on a general quad is OFF the diagonal BD; and «E מפגש האלכסונים של ABCD» (the
 * named-quad form) did the same.
 *
 * The 2-D twin is #1683 (ADR-569); this copies its pattern (src3d never imports src/). Everything goes
 * through `decideSubmit3` and the drawn positions.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { parse3 } from '../parser/parse3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';

type St = { facts: Fact3[]; seed: number };

/** Submit the context (every line must record), then return the verdict of the last line. */
function run(lines: string[]) {
  let st: St = { facts: [], seed: 0 };
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit3(st, line);
    expect(v.kind, `context «${line}»`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, v: decideSubmit3(st, lines[lines.length - 1]) };
}

/** Distance from P to segment a–b's line, and P's parameter along it. */
function onSeg(P: Vec3, A: Vec3, B: Vec3): { off: number; t: number } {
  const d = sub3(B, A);
  return { off: norm3(cross3(sub3(P, A), d)) / norm3(d), t: dot3(sub3(P, A), d) / dot3(d, d) };
}

/** P lies on both segments (inside each), at the recorded seed and three more. */
function meetsBoth(st: St, p: string, [a1, b1]: [string, string], [a2, b2]: [string, string]): void {
  const c = derive3(st.facts, st.seed).construction;
  for (const seed of [st.seed, st.seed + 1, st.seed + 2, st.seed + 3]) {
    const pos = resolve3(c, seed).positions;
    const g = (id: string) => pos.get(id)!;
    for (const [a, b] of [[a1, b1], [a2, b2]]) {
      const { off, t } = onSeg(g(p), g(a), g(b));
      expect(off, `${p} on line ${a}${b} @${seed}`).toBeLessThan(1e-6);
      expect(t > -1e-9 && t < 1 + 1e-9, `${p} inside ${a}${b} @${seed} (t = ${t})`).toBe(true);
    }
  }
}

describe('#1728 — the named diagonals of a quad', () => {
  it.each([
    'האלכסונים AB ו-CD נפגשים בנקודה E',
    'האלכסונים AB ו-CD נחתכים בנקודה E',
    'the diagonals AB and CD meet at E',
  ])('sides named as diagonals are refused, naming the pair: «%s»', (line) => {
    const { v } = run(['מרובע ABCD', line]);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error).toMatchObject({ code: 'not-a-diagonal', a: 'A', b: 'B' });
  });

  it.each([
    'האלכסונים AC ו-BD נפגשים בנקודה E',
    'האלכסונים AC ו-BD נחתכים בנקודה E',
    'האלכסונים BD ו-AC נפגשים בנקודה E',
    'the diagonals AC and BD meet at E',
  ])('the true diagonals meet where BOTH are, on a general quad: «%s»', (line) => {
    const { v } = run(['מרובע ABCD', line]);
    expect(v.kind).toBe('record');
    if (v.kind === 'record') meetsBoth({ facts: v.facts, seed: v.seed }, 'E', ['A', 'C'], ['B', 'D']);
  });

  it('…so «E על BD» after the meet is already true (it was refuted while E sat at AC’s midpoint)', () => {
    const { st, v } = run(['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E', 'E על BD']);
    expect(v.kind, JSON.stringify(st.facts.map((f) => f.utterance))).not.toBe('refused');
  });

  it('the named-quad form «E מפגש האלכסונים של ABCD» is the same meet (no parallelogram assumed)', () => {
    const { v } = run(['מרובע ABCD', 'E מפגש האלכסונים של ABCD']);
    expect(v.kind).toBe('record');
    if (v.kind === 'record') meetsBoth({ facts: v.facts, seed: v.seed }, 'E', ['A', 'C'], ['B', 'D']);
  });

  it('on a rectangle-based prism the meet is still the centre of the face (control)', () => {
    const { v } = run(['מנסרה ישרה שבסיסה מלבן', 'האלכסונים AC ו-BD נפגשים בנקודה O']);
    expect(v.kind).toBe('record');
    if (v.kind === 'record') meetsBoth({ facts: v.facts, seed: v.seed }, 'O', ['A', 'C'], ['B', 'D']);
  });

  it('on a solid, the pairs the sentence names are the ones that meet (a lateral face of a cube)', () => {
    const { v } = run(["קובייה ABCDA'B'C'D'", "האלכסונים AB' ו-A'B נפגשים בנקודה K"]);
    expect(v.kind).toBe('record');
    if (v.kind === 'record') meetsBoth({ facts: v.facts, seed: v.seed }, 'K', ['A', "B'"], ["A'", 'B']);
  });

  it('two diagonals that do not meet are refused, naming both — never a point drawn between them', () => {
    const { v } = run(["קובייה ABCDA'B'C'D'", "האלכסונים AC ו-B'D' נפגשים בנקודה E"]);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toEqual({ code: 'segments-do-not-meet', id: 'E', s1: 'AC', s2: "B'D'" });
    const t = (k: string, o?: Record<string, unknown>) => i18n3d.t(k, o) as string;
    expect(errorText3(t, v.error)).toContain("B'D'");
  });

  it('the unlettered and named-quad spellings keep their own construct', () => {
    expect(parse3('אלכסוני ABCD נחתכים בנקודה O')).toEqual({ ok: true, commands: [{ type: 'diag-intersection', id: 'O', face: ['A', 'B', 'C', 'D'] }] });
    expect(parse3('אלכסוני הריבוע נחתכים בנקודה O')).toEqual({ ok: true, commands: [{ type: 'diag-intersection', id: 'O', face: [] }] });
  });

  it('on an empty canvas the line is refused (no quad to read the letters on), never half-built', () => {
    expect(decideSubmit3({ facts: [], seed: 0 }, 'האלכסונים AC ו-BD נפגשים בנקודה E').kind).toBe('refused');
  });
});
