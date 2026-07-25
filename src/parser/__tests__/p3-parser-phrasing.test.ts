/**
 * P3 parser-phrasing batch — the log-triage 2026-07-25 grammar cluster (issues #245/#242/#267/#231/#198).
 *
 * Each case is the exact prod/operator utterance, parsed WITH the session figure as context and (where it
 * builds a figure) replayed. Two of the six were SILENT bugs the verification pass surfaced — not the
 * escalations the issues describe:
 *   #267  «נסמן ∠CAD=A1» parsed to `set-angle {value: 1}` — the "1" of "A1" read as 1° (a stated given
 *         silently corrupted). Now → `angle-alias`; the bare value/equality forms are untouched.
 *   #198  «מיתר AR» (R bound as the radius symbol) built a NODE R on the circle — exactly what the operator
 *         ruling forbids. Now → a deterministic `reserved-symbol` refusal; radius RELATIONS (R>r, R=1.5r) pass.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/** Parse `target` with the figure built from `prefix` as context (the app's parse-with-context path). */
function ctxParse(prefix: string[], target: string) {
  let facts: Fact[] = [];
  for (const u of prefix) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`prefix "${u}" did not parse: ${JSON.stringify(r)}`);
    for (const cmd of r.commands) facts.push({ id: `g.${facts.length}`, utterance: u, group: 'g', cmd: cmd as AnyCommand, enabled: true });
  }
  const { construction, positions } = replay(facts);
  return { r: parse(target, buildParseCtx(construction, positions)), facts };
}
const types = (r: ReturnType<typeof parse>) => (r.ok ? r.commands.map((c) => c.type) : []);

describe('#245 — multi-subject on-segment membership «M ו N נמצאות על הצלע BC»', () => {
  it.each([['M ו N נמצאות על הצלע BC'], ['N ו M נמצאות על הצלע BC'], ['M and N are on side BC']])(
    'both points ride the named side: %s',
    (utt) => {
      const { r } = ctxParse(['משולש ABC'], utt);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const onseg = r.commands.filter((c) => c.type === 'point-on-segment');
      expect(onseg).toHaveLength(2);
      expect(onseg.every((c: any) => c.a === 'B' && c.b === 'C')).toBe(true);
    },
  );
  it('the single-subject form is unchanged', () => {
    const { r } = ctxParse(['משולש ABC'], 'M נמצאת על הצלע BC');
    expect(types(r)).toContain('point-on-segment');
  });
});

describe('#242 — the locative apex «גובה בנקודה A» / «height at point A»', () => {
  it.each([['גובה בנקודה A'], ['height at point A'], ['גובה מ A']])('altitude apex A: %s', (utt) => {
    const { r } = ctxParse(['משולש ABC'], utt);
    expect(types(r)).toEqual(expect.arrayContaining(['foot', 'segment']));
  });
  it('the median sibling «תיכון בנקודה A»', () => {
    const { r } = ctxParse(['משולש ABC'], 'תיכון בנקודה A');
    expect(types(r)).toEqual(expect.arrayContaining(['midpoint', 'segment']));
  });
  it('CROSSING-SAFETY: a «…בנקודה K» crossing is NOT grabbed as the apex (keyword-anchored locative)', () => {
    // "the extension of altitude AD cuts the circle at K" — the altitude rule must NOT read K (the crossing)
    // as the apex; it reads the named altitude AD and drops the extension (→ escalates, #148), never an
    // altitude FROM K. So the produced foot is from A onto BC, and K is never a foot's apex.
    const { r } = ctxParse(['משולש ABC', 'מעגל O'], 'המשך הגובה AD חותך את המעגל בנקודה K');
    if (r.ok) {
      const foot = r.commands.find((c) => c.type === 'foot') as any;
      if (foot) expect(foot.from).not.toBe('K');
    }
  });
});

describe('#267 — angle-alias «=» binder «נסמן ∠CAD=A1» (was silently ∠CAD=1°)', () => {
  it.each([['נסמן ∠CAD=A1'], ['נסמן זוית CAD=A1'], ['denote ∠CAD = A1']])('binds the alias: %s', (utt) => {
    const { r } = ctxParse(['משולש ACD'], utt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toContainEqual({ type: 'angle-alias', name: 'A1', vertex: 'A', ray1: 'C', ray2: 'D' });
    // and NOT a value: no set-angle with value 1
    expect(r.commands.some((c: any) => c.type === 'set-angle' && c.value === 1)).toBe(false);
  });
  it('NO THEFT — a numeric RHS is still a VALUE', () => {
    const { r } = ctxParse(['משולש ACD'], 'נסמן ∠CAD=40');
    expect(r.ok && r.commands.some((c: any) => c.type === 'set-angle' && c.value === 40)).toBe(true);
  });
  it('NO THEFT — an angle-ref RHS is still an EQUALITY', () => {
    const { r } = ctxParse(['משולש ACD', 'משולש DEF'], 'נסמן ∠CAD=∠DEF');
    expect(types(r)).toContain('set-angle-ratio');
  });
  it('the bare «∠CAD=A1» (no נסמן) no longer silently sets value 1', () => {
    const { r } = ctxParse(['משולש ACD'], '∠CAD=A1');
    // must NOT commit ∠CAD = 1°; escalates instead (honest)
    expect(r.ok && r.commands.some((c: any) => c.type === 'set-angle' && c.value === 1)).toBeFalsy();
  });
});

describe('#231 — a glued pair on a circle is a CHORD «BC על מעגל» + «מיתר» introduces its circle', () => {
  it('«BC על מעגל» → both endpoints on the circle + the segment (existing circle)', () => {
    const { r } = ctxParse(['מעגל O'], 'BC על מעגל');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mem = r.commands.filter((c) => c.type === 'point-on-circle').map((c: any) => c.id).sort();
    expect(mem).toEqual(['B', 'C']);
    expect(r.commands).toContainEqual({ type: 'segment', a: 'B', b: 'C' });
  });
  it('«BC מיתר במעגל» on a CIRCLE-LESS figure INTRODUCES the circle', () => {
    const { r } = ctxParse(['נקודה B', 'נקודה C'], 'BC מיתר במעגל');
    expect(types(r)).toEqual(expect.arrayContaining(['circle', 'point-on-circle', 'segment']));
  });
  it('the whole «BC על מעגל» figure builds cleanly', () => {
    const { r, facts } = ctxParse(['נקודה B', 'נקודה C'], 'BC על מעגל');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const all = [...facts, ...r.commands.map((cmd, i) => ({ id: `t.${i}`, utterance: 'BC על מעגל', group: 't', cmd: cmd as AnyCommand, enabled: true }))];
    const fig = replay(all);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
  });
});

describe('#198 — a bound radius symbol reused as a point → deterministic clarification (was a silent node R)', () => {
  const bound = ['מעגל O', 'רדיוס מעגל O הוא R'];
  it('«מיתר AR» refuses with `reserved-symbol` naming R (never a node R)', () => {
    const { r } = ctxParse(bound, 'מיתר AR');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('reserved-symbol');
    if (r.reason === 'reserved-symbol') expect(r.symbol).toBe('R');
  });
  it('NO false positive — a radius RELATION «R > r» / «R = 1.5r» is not flagged', () => {
    const both = ['מעגל O', 'רדיוס מעגל O הוא R', 'מעגל P', 'רדיוס מעגל P הוא r'];
    expect(ctxParse(both, 'R > r').r.ok).toBe(true);
    expect(ctxParse(both, 'R = 1.5r').r.ok).toBe(true);
  });
});
