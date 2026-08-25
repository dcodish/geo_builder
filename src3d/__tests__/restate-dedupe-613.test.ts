/**
 * #613 (ADR-W-031) — restating a fact SUCCEEDS, appends no row, and says so.
 *
 * M1 idempotency was implemented at APPLY: a statement about existing objects correctly returns the
 * construction unchanged. The STORE then appended any utterance that applied `ok`, so an idempotent
 * no-op still grew the fact list. Nothing was geometrically wrong — the figure is identical, and
 * deleting either row leaves the other — but the fact list is the tool's record of the student's own
 * reasoning, and it is what `.geo3.json` saves and replays. A student who restates a given three times
 * while exploring got a list that reads as three givens, and every replay re-paid their solve cost.
 *
 * Operator ruling (2026-08-16): *"if a fact is already known - it should not be added. this is true to
 * all tools."* — option (b): the submit succeeds, no row is appended, and a notice says it was already
 * stated. Refusing (a) was rejected: a refusal for something that is not an error reads harshly.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const st = () => useGeo3.getState();

beforeEach(reset);

describe('#613 — a restated fact adds no row', () => {
  it.each([
    [['פירמידה SABC', 'משולש ABC', 'משולש ABC'], 2],
    [['פירמידה SABC', 'זווית ABC = 90', 'זווית ABC = 90'], 2],
    [['פירמידה ABCDS שבסיסה ריבוע', 'ריבוע ABCD', 'ריבוע ABCD'], 2],
  ])('%s → %i rows', (lines, rows) => {
    for (const u of lines) submit(u);
    expect(st().lastError, 'the restatement is not an error').toBeNull();
    expect(st().facts.length).toBe(rows);
  });

  it('the restatement SUCCEEDS and is noticed, naming what it repeats', () => {
    submit('פירמידה SABC');
    submit('משולש ABC');
    submit('משולש ABC');
    expect(st().lastError).toBeNull();
    expect(st().lastNotice?.code).toBe('already-stated');
    expect(st().lastNotice?.utterance, 'the notice names the row it repeats').toBe('משולש ABC');
  });

  it('the notice is CLEARED by the next ordinary statement', () => {
    submit('פירמידה SABC');
    submit('משולש ABC');
    submit('משולש ABC');
    expect(st().lastNotice).not.toBeNull();
    submit('E אמצע AB');
    expect(st().lastNotice, 'a fresh statement clears it').toBeNull();
    expect(st().facts.length).toBe(3);
  });

  it('a DISABLED twin is re-enabled, never duplicated (2-D\'s FR-EN-9)', () => {
    submit('פירמידה SABC');
    submit('משולש ABC');
    const twin = st().facts.at(-1)!;
    useGeo3.getState().toggle(twin.id);
    expect(st().facts.find((f) => f.id === twin.id)!.enabled).toBe(false);
    submit('משולש ABC');
    expect(st().facts.length, 'no new row').toBe(2);
    expect(st().facts.find((f) => f.id === twin.id)!.enabled, 're-enabled instead').toBe(true);
  });

  it('a DIFFERENT statement still appends — the rule is structural, not "looks similar"', () => {
    submit('פירמידה SABC');
    submit('משולש ABC');
    submit('משולש SAB');
    expect(st().facts.length).toBe(3);
    expect(st().lastNotice).toBeNull();
  });

  it('the same statement in the OTHER language is the same statement', () => {
    submit('פירמידה SABC');
    submit('משולש ABC');
    submit('triangle ABC');
    expect(st().facts.length, 'lowered commands are equal, so it is one statement').toBe(2);
    expect(st().lastNotice?.code).toBe('already-stated');
  });
});
