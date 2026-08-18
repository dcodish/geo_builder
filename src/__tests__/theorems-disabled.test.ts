/**
 * #740 (operator, 2026-08-18): "for the 2d tool i want to disable the theorems for now. its not
 * ready and is just confusing."
 *
 * This lock keeps the theorem SURFACE from returning by accident: re-enabling is an operator
 * decision, taken by flipping `THEOREMS_SURFACE` in src/App.tsx AND deleting this file as part of
 * that deliberate change. The theorems ENGINE (src/theorems/) and its whole test suite stay live —
 * what is disabled is the product surface: the panel checkbox, the feed sections, and the per-step
 * detection work that fed them.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('#740 — the 2-D theorem surface stays disabled until the operator re-enables it', () => {
  it('the flag is present and OFF', () => {
    expect(read('src/App.tsx')).toContain('const THEOREMS_SURFACE: boolean = false;');
  });

  it('the proof-refusal explainer no longer promises the feed (honesty: no false promises while disabled)', () => {
    // the feed's own strings (theorems.*) stay for its return — but a string the student can still
    // SEE must not promise «משפטים רלוונטיים» appearing, because they will not.
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    const heProof: string = he.input.scope.proof;
    const enProof: string = en.input.scope.proof;
    expect(heProof, 'he scope.proof exists').toBeTruthy();
    expect(heProof).not.toContain('משפטים רלוונטיים');
    expect(enProof.toLowerCase()).not.toContain('theorem');
  });
});
