/**
 * Issue #151 — a plural carrier-membership statement over a CONJUNCTION of segments asserts EVERY
 * segment, not only the first. «AB ו DC מיתרים» ("AB and DC are chords") read only the first label
 * pair (A,B on the circle + segment AB) and dropped D,C — the honesty gate escalated, the LLM also
 * failed, and the statement was lost (operator session qx5a19co, forced to one-chord-per-line).
 *
 * Same family as ADR-076 (N points on N segments) / ADR-240 (multi-subject membership) /
 * `pluralSpecialLines` (heights/medians): the label list is paired sequentially (the ADR-076
 * uppercase-list convention), each pair one chord — all memberships + all segments. Mirrored for
 * plural diameters. An intersect compound never pair-reads (bare declarations only).
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const after = (utterances: string[], u: string) => {
  const facts: Fact[] = [];
  for (const [g, prev] of utterances.entries()) {
    const fig = replay(facts);
    const r = parse(prev, buildParseCtx(fig.construction, fig.positions));
    if (!r.ok) throw new Error(`did not parse: ${prev}`);
    for (const c of r.commands) facts.push({ id: `${g}-${facts.length}`, group: `g${g}`, enabled: true, utterance: prev, cmd: c });
  }
  const fig = replay(facts);
  return { facts, r: parse(u, buildParseCtx(fig.construction, fig.positions)) };
};
const memberships = (cmds: AnyCommand[]) => cmds.flatMap((c) => (c.type === 'point-on-circle' ? [c.id] : [])).sort();
const segments = (cmds: AnyCommand[]) => cmds.flatMap((c) => (c.type === 'segment' ? [[c.a, c.b].sort().join('')] : [])).sort();

describe('#151 — plural chord/diameter declarations distribute over the conjunction', () => {
  it('the operator utterance «AB ו DC מיתרים»: all four on the circle + both segments (He + En)', () => {
    for (const u of ['AB ו DC מיתרים', 'AB and DC are chords']) {
      const { r } = after(['מעגל O'], u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect(memberships(r.commands), u).toEqual(['A', 'B', 'C', 'D']);
      expect(segments(r.commands), u).toEqual(['AB', 'CD']);
    }
  });

  it('THREE chords «AB, CD ו EF מיתרים» — the class, not the pair instance', () => {
    const { r } = after(['מעגל O'], 'AB, CD ו EF מיתרים');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(memberships(r.commands)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(segments(r.commands)).toEqual(['AB', 'CD', 'EF']);
  });

  it('a single chord is byte-identical to before (both locales)', () => {
    for (const u of ['מיתר AB', 'chord AB in circle O']) {
      const { r } = after(['מעגל O'], u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect(r.commands, u).toEqual([
        { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
        { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
        { type: 'segment', a: 'A', b: 'B' },
      ]);
    }
  });

  it('plural DIAMETERS «AB ו CD קוטרים» — one diameter command per pair (He + En)', () => {
    for (const u of ['AB ו CD קוטרים', 'AB and CD are diameters']) {
      const { r } = after(['מעגל O'], u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      const dias = r.commands.filter((c) => c.type === 'diameter').map((c) => [c.id1, c.id2].sort().join(''));
      expect(dias.sort(), u).toEqual(['AB', 'CD']);
    }
  });

  it('shared-endpoint pairs «AB ו BC מיתרים» dedupe the shared membership', () => {
    const { r } = after(['מעגל O'], 'AB ו BC מיתרים');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(memberships(r.commands)).toEqual(['A', 'B', 'C']);
    expect(segments(r.commands)).toEqual(['AB', 'BC']);
  });

  it('replay: every declared chord endpoint lies ON the circle', () => {
    const { facts, r } = after(['מעגל O'], 'AB ו DC מיתרים');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) facts.push({ id: `x-${facts.length}`, group: 'gx', enabled: true, utterance: 'AB ו DC מיתרים', cmd: c });
    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    const circle = fig.circles.get('circle-O');
    expect(circle).toBeTruthy();
    for (const id of ['A', 'B', 'C', 'D']) {
      const p = fig.positions.get(id)!;
      expect(Math.hypot(p.x - circle!.center.x, p.y - circle!.center.y), `|O${id}|`).toBeCloseTo(circle!.r, 4);
    }
  });
});
