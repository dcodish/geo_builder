/**
 * #960 ([ADR-495](../../docs/06-decisions.md#adr-495)) — a scenario's fact list must be what the UI
 * would HOLD, and "would the app accept this line?" must have exactly one answer in the codebase.
 *
 * Found by the operator playing the #955 sheet (2026-09-09): two cases died at line 3 on his canvas
 * while reporting green headlessly, because `factsOf` commits every step and the app does not.
 * `submitPipeline.ts` says so itself — *"a contradicting line is refused BEFORE it becomes a fact"*.
 */
import { describe, expect, it } from 'vitest';
import { useGeoStore } from '@/store/geoStore';
import { factsOf } from './scenario-pipeline';
import { gateVerdict, driveThroughGate } from './submit-gate';

const clean = () => useGeoStore.getState().clear();
const verdictAfter = (prefix: string[], utterance: string) => {
  clean();
  return gateVerdict(factsOf(prefix), utterance, 0);
};

describe('#960 — the operator’s two dead play cases, as the gate sees them', () => {
  it('T2: «AB = x» after «AB = 3» commits NOTHING — the app answers "already drawn"', () => {
    const v = verdictAfter(['משולש ABC', 'AB = 3'], 'AB = x');
    expect(v.kind, 'not a commit — which is why the canvas never reached line 4').not.toBe('commit');
    expect(v.kind).toBe('noop');
  });

  it('T6: «DE = x» before D and E exist is REFUSED pre-commit, not deferred', () => {
    const v = verdictAfter(['משולש ABC', 'AB = 3x'], 'DE = x');
    expect(v.kind).toBe('refused');
    expect(v).toMatchObject({ reason: 'error' });
    expect((v as { detail?: string }).detail ?? '', 'and it says why').toMatch(/unknown point/i);
  });
});

describe('#960 — the verdicts, measured', () => {
  it('an ordinary line commits, and hands back the commands the app would execute', () => {
    const v = verdictAfter([], 'משולש ABC');
    expect(v.kind).toBe('commit');
    expect((v as { commands: { type: string }[] }).commands.map((c) => c.type)).toEqual(['triangle']);
  });

  it('a line the grammar cannot read is refused as `parse` — the LLM-escalation seam, not a gate failure', () => {
    const v = verdictAfter([], 'זהו משפט שאינו גאומטריה כלל ובכלל');
    expect(v).toMatchObject({ kind: 'refused', reason: 'parse' });
  });

  it('a contradiction is refused as `error` and never becomes a fact', () => {
    const v = verdictAfter(['משולש ABC', 'BC = 4', 'AC = 5', 'זווית ABC = 90', 'AB = x'], 'x = 8');
    expect(v).toMatchObject({ kind: 'refused', reason: 'error' });
    expect((v as { detail?: string }).detail ?? '').toMatch(/cannot hold/);
  });

  it('re-typing an existing shape is a friendly no-op, never an escalation (ADR-156)', () => {
    expect(verdictAfter(['square ABCD'], 'square ABCD').kind).toBe('noop');
  });

  it('a deferrable constraint typed EARLY still commits — order-independence (ADR-104)', () => {
    // the q4 case: «CE⟂AB» before its pinning givens must COMMIT so replay can retry it.
    const v = verdictAfter(['משולש ABC', 'נקודה E על AB'], 'CE ⊥ AB');
    expect(v.kind, 'a deferrable constraint is committed, not refused').toBe('commit');
  });
});

describe('#960 — driveThroughGate builds the fact list the UI would hold', () => {
  it('a refused line leaves NO fact behind, and is reported with its index', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC', 'BC = 4', 'AC = 5', 'זווית ABC = 90', 'AB = x', 'x = 8']);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ index: 5, utterance: 'x = 8' });
    expect(facts.some((f) => f.utterance === 'x = 8'), 'the refused line is not in the list').toBe(false);
    expect(facts.some((f) => f.utterance === 'AB = x'), 'the accepted ones are').toBe(true);
  });

  it('…which is exactly where it differs from factsOf, the difference this issue is about', () => {
    const steps = ['משולש ABC', 'BC = 4', 'AC = 5', 'זווית ABC = 90', 'AB = x', 'x = 8'];
    clean();
    const viaFactsOf = factsOf(steps);
    const viaGate = driveThroughGate(steps).facts;
    expect(viaFactsOf.some((f) => f.utterance === 'x = 8'), 'factsOf commits it').toBe(true);
    expect(viaGate.some((f) => f.utterance === 'x = 8'), 'the gate does not').toBe(false);
  });

  it('a fully-acceptable sequence passes through untouched', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC', 'AB = 5', 'זווית ABC = 40']);
    expect(refused).toEqual([]);
    expect(new Set(facts.map((f) => f.utterance))).toEqual(new Set(['משולש ABC', 'AB = 5', 'זווית ABC = 40']));
  });
});
