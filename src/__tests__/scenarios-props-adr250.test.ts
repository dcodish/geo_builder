import { describe, it, expect } from 'vitest';
import { parse, droppedNewLabels, droppedGivenNumbers } from '@/parser';
import { replay, useGeoStore, dryRunOutcome, hasDeferrableConstraint } from '@/store/geoStore';
import { ctxOf, at } from './scenarios-corpus';
import type { AnyCommand } from '@/engine';

/**
 * ADR-250 — operator session m68n76e7 (prod, 2026-07-07), verbatim sequence. Two honesty mechanisms:
 * (1) a stated carrier is DRAWN — "D על המשך הצלע BC" shows B—C—D and "AD חותך את המעגל ב-E" shows
 * A—E—D whole (the student had to hand-type DA/DB/EC/BE to complete the drawing); (2) the typo
 * "משוטח" (for משטח) let the TRIANGLE rule claim the area-ratio utterance and commit a bare △AEB with
 * the row ✓ — the stated 2.25 silently dropped. The submit gate now escalates on a dropped NUMBER
 * (droppedGivenNumbers, the ADR-089 sibling); the LLM second attempt (mocked with the corrected
 * phrasing's own lowering) carries the ratio.
 */
describe('reported scenario — carrier segments drawn + a typo never silently drops a stated ratio (ADR-250)', () => {
  it('[m68n76e7-carrier-draw-and-typo-ratio] extension/secant edges auto-draw; the משוטח typo escalates and the ratio holds', () => {
    const st = useGeoStore.getState();
    st.clear();
    // App.submit-faithful gate incl. the ADR-250 number guard; LLM mocked with canonical commands.
    const submit = (utterance: string, llm?: AnyCommand[]) => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      let commands: AnyCommand[] | null = null;
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0 && droppedGivenNumbers(utterance, r.commands).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed);
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) commands = r.commands;
      }
      if (!commands) commands = llm ?? null;
      expect(commands, `step did not commit: ${utterance}`).not.toBeNull();
      for (const c of commands!) useGeoStore.getState().execute(c, utterance, `g${utterance}`);
      return commands!;
    };
    submit('משולש ABC שווה צלעות חסום במעגל');
    submit('D על המשך הצלע BC');
    submit('AD חותך את המעגל בנקודה E');
    // (1) the stated carriers are already drawn — the operator's manual DA/DB/EC/BE round is no longer needed
    {
      const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
      const segs = new Set(fig.construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id));
      for (const want of ['seg-BC', 'seg-CD', 'seg-AE', 'seg-DE']) expect(segs, `missing drawn carrier ${want}`).toContain(want);
    }
    // (2) the typo: the #497 fail-closed leftover gate stops the triangle rule AT THE PARSE — the
    // partial (wrong) meaning never even forms. (It used to half-parse to a bare △AEB and rely on the
    // ADR-250 number guard to refuse the commit; that guard remains the LLM-commit path's net.)
    const typo = 'שטח AEB גדול פי 2.25 משוטח משולש CED';
    {
      const ctx = ctxOf(useGeoStore.getState().facts);
      const r = parse(typo, ctx);
      expect(r.ok).toBe(false); // escalates whole to the LLM, whose job is typos
      expect(droppedGivenNumbers(typo, [{ type: 'triangle', ids: ['A', 'E', 'B'] } as AnyCommand])).toEqual([2.25]); // the net still names the drop
    }
    // …and the LLM second attempt (mocked: the corrected phrasing's own lowering) carries the ratio.
    const corrected = parse('שטח AEB גדול פי 2.25 משטח משולש CED', ctxOf(useGeoStore.getState().facts));
    expect(corrected.ok && corrected.commands.some((c) => c.type === 'set-area-ratio')).toBe(true);
    const committed = submit(typo, corrected.ok ? corrected.commands : undefined);
    expect(committed.some((c) => c.type === 'set-area-ratio')).toBe(true);
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    for (const [id, s2] of Object.entries(fig.status)) expect(s2, `status ${id}`).toBe('ok');
    const area = (ids: string[]): number => {
      let s = 0;
      for (let i = 0; i < ids.length; i++) {
        const p = at(fig, ids[i]);
        const q = at(fig, ids[(i + 1) % ids.length]);
        s += p.x * q.y - q.x * p.y;
      }
      return Math.abs(s) / 2;
    };
    expect(area(['A', 'E', 'B']) / area(['C', 'E', 'D'])).toBeCloseTo(2.25, 2);
    st.clear();
  });
});
