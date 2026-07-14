/**
 * Issue #120 — load auto-re-lowers DETERMINISTIC steps (ADR-232 Am.); issue #121 — the save name choice.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import { refreshLoadedFigure } from '@/store/loadAudit';
import { chooseSaveName } from '@/store/figureFile';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function build(us: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of us) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `${g}.${facts.length}`, utterance: u, group: `g${g}`, cmd, enabled: true });
    g++;
  }
  return facts;
}
const lci = (facts: Fact[]) => facts.find((f) => f.cmd.type === 'line-circle-intersection')?.cmd as { onSegment?: string[] } | undefined;

describe('#120 — refreshLoadedFigure adopts the current parser for deterministic steps', () => {
  it('a pre-fix K command (no onSegment) is re-lowered to the current one on load', () => {
    // Build the incircle figure through the current parser, then DOWNGRADE the K step's command to the
    // pre-#119 lowering (strip onSegment) to simulate an older save.
    const facts = build(['במשולש שווה שוקיים חסום מעגל O', 'AC=AB', 'AC=√3 CO', 'CO', 'OB', 'OA', 'המעגל חותך את BO בנקודה K']);
    for (const f of facts) if (f.cmd.type === 'line-circle-intersection') delete (f.cmd as { onSegment?: unknown }).onSegment;
    expect(lci(facts)?.onSegment, 'downgraded save lacks onSegment').toBeUndefined();

    const { facts: refreshed, refreshed: idx } = refreshLoadedFigure(facts);
    expect(idx.length, 'the K step was refreshed').toBeGreaterThan(0);
    expect(lci(refreshed)?.onSegment, 'K re-lowered WITH onSegment').toEqual(['B', 'O']);
  });

  it('a healthy (current) save is unchanged — nothing refreshed', () => {
    const facts = build(['במשולש חסום מעגל', 'המעגל חותך את BO בנקודה K']);
    const { facts: out, refreshed } = refreshLoadedFigure(facts);
    expect(refreshed).toEqual([]);
    expect(out.map((f) => f.cmd)).toEqual(facts.map((f) => f.cmd));
  });

  it('an LLM step (utterance does not re-parse) is kept byte-for-byte (no re-escalation)', () => {
    // A canonical LLM command stored under an utterance the deterministic parser cannot read.
    const llmCmd = { type: 'set-ratio', a: 'A', b: 'C', c: 'C', d: 'O', k: 1.732 } as unknown as AnyCommand;
    const facts: Fact[] = [
      ...build(['משולש ABC']),
      { id: 'x.0', utterance: 'AC הוא פי שורש שלוש מ CO', group: 'gx', cmd: llmCmd, enabled: true },
    ];
    const before = JSON.stringify(facts[facts.length - 1].cmd);
    const { facts: out, refreshed } = refreshLoadedFigure(facts);
    expect(refreshed, 'the LLM step is not refreshed').toEqual([]);
    expect(JSON.stringify(out[out.length - 1].cmd)).toBe(before);
  });
});

describe('#121 — chooseSaveName (named figure: overwrite vs copy)', () => {
  it('overwrite keeps the current name and does not adopt', () => {
    expect(chooseSaveName('Q5', () => true, () => 'ignored')).toEqual({ name: 'Q5', adopt: false });
  });
  it('save-a-copy adopts the typed name', () => {
    expect(chooseSaveName('Q5', () => false, () => 'Q5 v2')).toEqual({ name: 'Q5 v2', adopt: true });
  });
  it('a blank/cancelled copy prompt aborts (null)', () => {
    expect(chooseSaveName('Q5', () => false, () => '')).toBeNull();
    expect(chooseSaveName('Q5', () => false, () => null)).toBeNull();
  });
  it('an unnamed figure returns null (the caller runs its own first-name prompt)', () => {
    let copyAsked = false;
    expect(chooseSaveName('   ', () => true, () => { copyAsked = true; return 'x'; })).toBeNull();
    expect(copyAsked, 'neither dialog is consulted for an unnamed figure').toBe(false);
  });
  it('the copy prompt is LAZY — not called when overwriting', () => {
    let copyAsked = false;
    chooseSaveName('Q5', () => true, () => { copyAsked = true; return 'x'; });
    expect(copyAsked).toBe(false);
  });
});
