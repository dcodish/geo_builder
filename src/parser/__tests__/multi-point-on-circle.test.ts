/**
 * ADR-240 — a membership statement naming N points asserts membership for EVERY named point.
 *
 * Class: a multi-subject statement parsed single-subject — `pointOnCircle` read only the FIRST label,
 * so "A ו C נמצאות על המעגל" lowered to `point-on-circle A` alone and C floated free. The app-level
 * droppedNewLabels net (ADR-089) did flag it, but the escalation round-trip re-entered this same
 * single-subject grammar (the LLM's canonical line is parsed by the same rule), so the partial lowering
 * committed anyway — and the operator's exported `.geo.json` carried it to every machine. The rule now
 * reads the ADR-076 uppercase-label-list subject; the carrier defer also closes a latent sibling
 * ("D על המיתר AB במעגל O" put D on the CIRCLE instead of on the chord).
 *
 * Through the real parse-with-context → replay path, mirrored He/En.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx, droppedNewLabels } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/** A one-circle figure (centre O, free radius) — the context every case parses against. */
function circleCtx() {
  const facts: Fact[] = [
    {
      id: 'f0',
      utterance: 'מעגל O',
      cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand,
      enabled: true,
    },
  ];
  const fig = replay(facts);
  return { facts, ctx: buildParseCtx(fig.construction, fig.positions) };
}

const membershipIds = (cmds: AnyCommand[]): string[] =>
  cmds.flatMap((c) => (c.type === 'point-on-circle' && c.circle === 'circle-O' ? [c.id] : []));

describe('multi-point on-circle (ADR-240)', () => {
  it.each([
    ['A ו C נמצאות על המעגל', ['A', 'C']], // the operator's exact wording (session → saved file)
    ['A, C נמצאות על המעגל', ['A', 'C']],
    ['נקודות A, B, C על המעגל', ['A', 'B', 'C']],
    ['points A and C are on the circle', ['A', 'C']],
    ['points A, B, C on circle O', ['A', 'B', 'C']],
    ['A על מעגל O', ['A']], // the single-subject form is unchanged
    ['A on circle O', ['A']],
  ])('"%s" puts every named point on the circle', (utterance, expected) => {
    const { ctx } = circleCtx();
    const r = parse(utterance, ctx);
    expect(r.ok, `did not parse: ${utterance}`).toBe(true);
    if (!r.ok) return;
    expect(membershipIds(r.commands)).toEqual(expected);
    // The honesty net agrees: no stated label is left uncovered by the commands.
    expect(droppedNewLabels(utterance, r.commands, ctx.points ?? [])).toEqual([]);
  });

  it('the operator sequence replays with every stated point ON the circle', () => {
    const { facts, ctx } = circleCtx();
    let all = [...facts];
    let g = 0;
    for (const u of ['A ו C נמצאות על המעגל', 'OC', 'OA', 'AC']) {
      const fig = replay(all);
      const r = parse(u, buildParseCtx(fig.construction, fig.positions));
      expect(r.ok, `did not parse: ${u}`).toBe(true);
      if (!r.ok) return;
      const group = r.commands.length > 1 ? `g${g++}` : undefined;
      for (const cmd of r.commands) all = [...all, { id: `x${all.length}`, utterance: u, group, cmd, enabled: true }];
    }
    const fig = replay(all);
    expect(fig.lastError).toBeNull();
    const o = fig.positions.get('O')!;
    const r = fig.circles.get('circle-O')!.r;
    for (const p of ['A', 'C']) {
      const v = fig.positions.get(p)!;
      expect(Math.hypot(v.x - o.x, v.y - o.y), `|O${p}| should equal the radius`).toBeCloseTo(r, 6);
    }
    void ctx;
  });

  it('a point on a CARRIER lands on the chord, not on the circle (latent sibling)', () => {
    const { ctx } = circleCtx();
    const r = parse('D על המיתר AB במעגל O', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // D rides the chord; the chord's endpoints get the membership (withCarrierMembership).
    expect(r.commands).toContainEqual({ type: 'point-on-segment', id: 'D', a: 'A', b: 'B' });
    expect(membershipIds(r.commands).sort()).toEqual(['A', 'B']);
  });

  it('a glued pair "AB על המעגל" is a CHORD — both endpoints on the circle + the segment drawn (#231)', () => {
    const { ctx } = circleCtx();
    const r = parse('AB על המעגל', ctx);
    expect(r.ok).toBe(true); // #231: a bare pair means the segment (ADR-077); on-circle = both endpoints member
    if (!r.ok) return;
    expect(membershipIds(r.commands).sort()).toEqual(['A', 'B']);
    expect(r.commands).toContainEqual({ type: 'segment', a: 'A', b: 'B' });
  });
});
