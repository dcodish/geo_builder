/**
 * THE META-LOCK (#1666, docs/28 §5c step 5) — the shared proof-target rows are run against deliberately
 * BROKEN gates, and each check is shown to catch its own defect. A shared suite that passes everything
 * would let all three thin locks go green while the rule is held by nothing.
 *
 * It calls the same `proofTargetFaults` and the same `findProofTarget` the builders call — never a copy.
 */
import { describe, expect, it } from 'vitest';
import { proofTargetFaults, PROOF_ROWS, NOT_PROOF_ROWS, type ProofGate } from './fixtures/proof-target-rows';
import { findProofTarget } from '../proofTarget';

/** A conforming gate: the shared detector, a refusal quoting its sentence, nothing recorded on a refusal. */
const gateOf = (detect: (line: string) => { sentence: string } | null): ProofGate => (line) => {
  const p = detect(line);
  return p ? { proof: true, recorded: false, text: `«${p.sentence}» — claim to prove` } : { proof: false, recorded: true, text: null };
};
const good = gateOf(findProofTarget);

describe('#1666 — the shared proof-target rows catch a broken gate', () => {
  it('a gate built on the shared detector conforms', async () => {
    expect(await proofTargetFaults(good)).toEqual([]);
  });

  it('catches a builder with no gate at all (2-D and 3-D before #1666)', async () => {
    const faults = await proofTargetFaults(() => ({ proof: false, recorded: true, text: null }));
    expect(faults.join('\n')).toMatch(/was not refused as a proof target/);
    expect(faults.join('\n')).toMatch(/a claim to prove became a given/);
  });

  it('catches a detector anchored at the line start (misses the item marker and the mixed line)', async () => {
    const anchored = gateOf((line) => (/^(?:הוכיחו|הוכח|הראו|הראה|prove|show|יש|צריך)/i.test(line) ? { sentence: line } : null));
    const faults = await proofTargetFaults(anchored);
    expect(faults).toContain('«א. הוכיחו כי AB ⊥ AC» was not refused as a proof target');
    expect(faults).toContain('«נתון AB = AC. הוכיחו כי AB ⊥ AC» was not refused as a proof target');
  });

  it('catches an over-eager detector that fires on any «כי» or «ש»', async () => {
    const eager = gateOf((line) => (/כי|ש/.test(line) || findProofTarget(line) ? { sentence: line } : null));
    const faults = await proofTargetFaults(eager);
    expect(faults).toContain('«נתון כי AB = AC» is not a proof target, but was refused as one');
    expect(faults).toContain('«D על AB כך ש-AD = DB» is not a proof target, but was refused as one');
  });

  it('catches the show-verb read without its complementizer («הראו שני גבהים» is "show me")', async () => {
    const bareShow = gateOf((line) => (/^הרא[והי]/.test(line) || findProofTarget(line) ? { sentence: line } : null));
    expect((await proofTargetFaults(bareShow)).join('\n')).toMatch(/«הראו שני גבהים» is not a proof target/);
  });

  it('catches a refusal that does not quote the claim', async () => {
    const mute: ProofGate = (line) => (findProofTarget(line) ? { proof: true, recorded: false, text: 'refused' } : { proof: false, recorded: true, text: null });
    expect((await proofTargetFaults(mute)).join('\n')).toMatch(/does not quote the claim/);
  });

  it('catches a gate that refuses but still records the given half of a mixed line', async () => {
    const leaky: ProofGate = async (line) => ({ ...(await good(line)), recorded: line.startsWith('נתון AB') });
    expect((await proofTargetFaults(leaky)).join('\n')).toMatch(/«נתון AB = AC\. הוכיחו כי AB ⊥ AC» was recorded/);
  });

  it('the rows are not empty, and every negative really is a non-target to the detector', () => {
    expect(PROOF_ROWS.length).toBeGreaterThan(10);
    expect(NOT_PROOF_ROWS.length).toBeGreaterThan(5);
    for (const line of NOT_PROOF_ROWS) expect(findProofTarget(line), line).toBeNull();
    for (const { line } of PROOF_ROWS) expect(findProofTarget(line), line).not.toBeNull();
  });
});

describe('#1666 — findProofTarget: the span is the proof sentence', () => {
  it('the mixed line names only the claim, at its own indices', () => {
    const line = 'נתון AB = AC. הוכיחו כי AB ⊥ AC';
    const p = findProofTarget(line)!;
    expect(p.sentence).toBe('הוכיחו כי AB ⊥ AC');
    expect(line.slice(p.span[0], p.span[1])).toBe('הוכיחו כי AB ⊥ AC');
  });
  it('an item marker is skipped, and a following sentence is not swallowed', () => {
    expect(findProofTarget('(1) הוכיחו כי AB = AC. נתון AD = 3')!.sentence).toBe('הוכיחו כי AB = AC');
  });
  it('a bare prove-verb counts only where a sentence starts', () => {
    expect(findProofTarget('הוכיחו: AB ⊥ AC')).not.toBeNull();
    expect(findProofTarget('ב) הוכח את הטענה')!.sentence).toBe('הוכח את הטענה');
    expect(findProofTarget('הוכחה')).toBeNull();
  });
  it('a pasted bidi isolate is not quoted', () => {
    expect(findProofTarget('⁧הוכיחו כי AB ⊥ AC⁩')!.sentence).toBe('הוכיחו כי AB ⊥ AC');
  });
});
