/**
 * #233 / ADR-377 — a tangency declared at an EXISTING touch states the FULL conjunction:
 * T ∈ circle ∧ T ∈ line ∧ radius ⟂ line. The ADR-075 branch used to assert the ⟂ ALONE ("assumes T
 * is already on the circle") — trivially satisfiable with the line far from the circle, all green
 * (the operator's rectangle screenshot, dev 2026-07-20). Both entry orders lock: the touch created
 * first (this branch) and the touch named fresh (the ADR-374 named-new-touch branch).
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

let n = 0;
function ctxOf(...utterances: string[]) {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`setup parse failed: ${u}`);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

const types = (cmds: AnyCommand[]) => cmds.map((c) => c.type);

describe('#233 — tangency at an EXISTING touch carries the membership', () => {
  it('the operator sequence: E already riding AD → membership + ⟂ (the on-line conjunct is structural)', () => {
    const ctx = ctxOf('מלבן ABCD', 'מעגל', 'B על המעגל', 'E על AD');
    for (const u of ['AD משיק למעגל בנקודה E', 'AD tangent to the circle at E']) {
      const r = parse(u, ctx);
      if (!r.ok) throw new Error(`did not parse: ${u}`);
      expect(types(r.commands), u).toContain('point-on-circle');
      expect(types(r.commands), u).toContain('set-perpendicular');
      expect(types(r.commands), `${u}: E rides AD — no redundant set-line`).not.toContain('set-line');
      const poc = r.commands.find((c) => c.type === 'point-on-circle') as { id?: string };
      expect(poc.id).toBe('E');
    }
  });

  it('a touch that does NOT ride the named segment also gets the on-line conjunct', () => {
    const ctx = ctxOf('מלבן ABCD', 'מעגל', 'B על המעגל', 'נקודה E');
    const r = parse('AD משיק למעגל בנקודה E', ctx);
    if (!r.ok) throw new Error('did not parse');
    expect(types(r.commands)).toContain('point-on-circle');
    expect(types(r.commands)).toContain('set-perpendicular');
    expect(types(r.commands), 'E is a loose free point — the on-line conjunct must be stated').toContain('set-line');
  });

  it('a touch already ON the circle keeps the lean ADR-075 lowering (idempotent membership, no set-line)', () => {
    const ctx = ctxOf('מעגל O', 'E על המעגל', 'נקודה A', 'נקודה D', 'AD');
    const r = parse('AD משיק למעגל בנקודה E', ctx);
    if (!r.ok) throw new Error('did not parse');
    expect(types(r.commands)).toContain('point-on-circle'); // idempotent — apply case (a)
    expect(types(r.commands)).toContain('set-perpendicular');
    expect(types(r.commands)).not.toContain('set-line');
  });

  it('entry-order twin: the tangent typed BEFORE the touch exists takes the ADR-374 named-new-touch path', () => {
    const ctx = ctxOf('מלבן ABCD', 'מעגל', 'B על המעגל');
    const r = parse('AD משיק למעגל בנקודה E', ctx);
    if (!r.ok) throw new Error('did not parse');
    expect(types(r.commands)).toContain('foot'); // E = the ⟂ foot from the centre, on the circle
    expect(types(r.commands)).toContain('point-on-circle');
  });
});
