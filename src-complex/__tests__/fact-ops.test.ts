/**
 * B5 / D6 — the fact-list operations, each with its honesty contract:
 *  - DISABLE answers "what if I hadn't said this?" — the line leaves the FIGURE, stays in the list;
 *  - a muted line must not veto a NEW statement (the gate reads the active figure);
 *  - RE-ENABLING faces the gate: the returning line is refused, naming the conflicting statement,
 *    rather than drawn into a figure that cannot hold it;
 *  - EDIT keeps the position, re-parses, and gates exactly like a typed line — a refused edit
 *    changes nothing;
 *  - a removal SHIFTS the disabled indexes (they name positions);
 *  - a muted line survives save/load muted, ungated until re-enabled.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { activeLines, editLine, hydrateSession, submitLine, toggleLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();

beforeEach(() => {
  store().resetSession();
});

describe('disable — out of the figure, in the list', () => {
  it('a disabled line stops driving the figure', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(submitLine('|z1| = 5')).toBe(true);
    expect(deriveLines(activeLines(), 0, 0).points.find((p) => p.name === 'z1')?.modulusKnown).toBe(true);

    expect(toggleLine(1)).toBe(true);
    expect(store().disabled).toEqual([1]);
    expect(store().lines).toHaveLength(2); // still in the list
    expect(activeLines()).toEqual(['z1 = 3+4i']);
  });

  it('muting a DEPENDENCY drops nothing — the dependent recomputes over an implicit free point', () => {
    submitLine('z1 = 3+4i');
    submitLine('z2 = 2cis150');
    submitLine('w = z1*z2');
    expect(toggleLine(1)).toBe(true); // mute z2's definition; w still references z2
    const names = deriveLines(activeLines(), 0, 0).points.map((p) => p.name);
    // The counterfactual is honest: z2 stays visible as an implicitly-created FREE number
    // (sampled, draggable — the strip labels it), and w keeps computing over it.
    expect(names).toContain('z2');
    expect(names).toContain('w');
  });

  it('a muted line does not veto a new statement', () => {
    submitLine('|z1| = 5');
    toggleLine(0);
    // |z1| = 7 contradicts the MUTED line — and must be accepted, because the muted line is not
    // part of the figure
    expect(submitLine('|z1| = 7')).toBe(true);
  });

  it('re-enabling faces the gate and the refusal names the conflicting statement', () => {
    submitLine('|z1| = 5');
    toggleLine(0);
    submitLine('|z1| = 7');
    const ok = toggleLine(0); // try to bring |z1| = 5 back
    expect(ok).toBe(false);
    expect(store().disabled).toEqual([0]); // stays muted — the list never lies about the figure
    expect(store().lastError?.key).toBe('incompatible');
    expect(store().lastError?.detail).toBe('|z1| = 7');
  });
});

describe('edit — in place, re-parsed, gated', () => {
  it('a good edit replaces the line at its position', () => {
    submitLine('z1 = 3+4i');
    submitLine('z2 = 2cis150');
    expect(editLine(0, 'z1 = 1+i')).toBe(true);
    expect(store().lines).toEqual(['z1 = 1+i', 'z2 = 2cis150']);
  });

  it('an edit the grammar refuses changes nothing and names itself', () => {
    submitLine('z1 = 3+4i');
    expect(editLine(0, 'שורה שאינה נקראת')).toBe(false);
    expect(store().lines).toEqual(['z1 = 3+4i']);
    expect(store().lastError?.key).toBe('not-handled');
  });

  it('an edit that breaks the figure is refused, naming the conflicting statement', () => {
    submitLine('z1 = 3+4i'); // fixes |z1| = 5 exactly
    submitLine('|z1| = 5');
    expect(editLine(1, '|z1| = 7')).toBe(false);
    expect(store().lines[1]).toBe('|z1| = 5'); // a refused edit changes nothing
    expect(store().lastError?.key).toBe('incompatible');
    expect(store().lastError?.detail).toBe('z1 = 3+4i');
  });

  it('editing a MUTED line rewrites text only — it gates on re-enable', () => {
    submitLine('|z1| = 5');
    toggleLine(0);
    expect(editLine(0, '|z1| = 9')).toBe(true);
    expect(store().lines).toEqual(['|z1| = 9']);
    expect(store().disabled).toEqual([0]);
  });
});

describe('bookkeeping', () => {
  it('a removal shifts the disabled indexes above it', () => {
    submitLine('z1 = 3+4i');
    submitLine('z2 = 2cis150');
    submitLine('w = z1*z2');
    toggleLine(2);
    expect(store().disabled).toEqual([2]);
    store().removeLine(0);
    expect(store().lines).toEqual(['z2 = 2cis150', 'w = z1*z2']);
    expect(store().disabled).toEqual([1]);
  });

  it('a muted line survives save/load muted, ungated, and unaudited', () => {
    submitLine('z1 = 3+4i');
    submitLine('|z1| = 5');
    toggleLine(1);
    const saved = store().serialize();
    expect(saved.disabled).toEqual([1]);

    store().resetSession();
    expect(hydrateSession(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(store().lines).toEqual(['z1 = 3+4i', '|z1| = 5']);
    expect(store().disabled).toEqual([1]);
    expect(store().loadAudit).toBeNull();
    expect(activeLines()).toEqual(['z1 = 3+4i']);
  });
});
