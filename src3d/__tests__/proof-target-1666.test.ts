/**
 * #1666 ([ADR-3D-295](../../docs/06b-decisions-3d.md#adr-3d-295), ADR-W-107) — 3-D's thin lock on the shared
 * proof-target rows (`shell/__tests__/fixtures/proof-target-rows.ts`, docs/28 §5c).
 *
 * Measured on `main` e92b671f through `decideSubmit3`, after «פירמידה ABCD»: «הוכיחו כי AB ⊥ AC», «הוכיחו ש-…»,
 * «הראו כי …», "prove that …" and "show that …" were RECORDED (`cos-angle` — a driving given on the free
 * pyramid), «הראו כי ∠BAC = 90°» recorded a claim, and «הוכיחו כי AB = AC» was refused as `claim-refuted`
 * (the tool "checked the proof" against a figure it had drawn). ADR-3D-002 stripped the proof verb on purpose;
 * since the T2 addendum a claim on a free figure DRIVES it, so the strip let the claim shape the figure.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { findProofTarget } from '../../shell/proofTarget';
import { proofTargetFaults, type ProofGate } from '../../shell/__tests__/fixtures/proof-target-rows';
import { PROOF_TARGET_SENTENCE, panelDrawnFaults } from '../../shell/__tests__/fixtures/proof-target-check-2492';
import { answerQuery } from '../engine/queries';
import * as fs from 'node:fs';
import * as path from 'node:path';

const t = i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string;
const tEn = i18n3d.getFixedT('en') as (k: string, o?: Record<string, unknown>) => string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

const pyramid = (() => {
  const v = decideSubmit3({ facts: [], seed: 0 }, 'פירמידה ABCD');
  if (v.kind !== 'record') throw new Error('setup: the pyramid did not record');
  return { facts: v.facts as Fact3[], seed: v.seed };
})();

/** The REAL submit decision — the function `store3.submit` dispatches — asked on the pyramid. */
const gate: ProofGate = (line) => {
  const v = decideSubmit3(pyramid, line);
  const proof = v.kind === 'refused' && v.error.code === 'proof-target';
  return { proof, recorded: v.kind === 'record', text: v.kind === 'refused' ? plain(errorText3(t, v.error) ?? '') : null };
};

describe('#1666 — 3-D refuses a proof target at the submit gate', () => {
  it('the shared rows hold through decideSubmit3', async () => {
    expect(await proofTargetFaults(gate)).toEqual([]);
  });

  it('the refusal, Hebrew and English, names the proof sentence', () => {
    const v = decideSubmit3(pyramid, 'נתון AB = AC. הוכיחו כי AB ⊥ AC');
    expect(v).toEqual({ kind: 'refused', error: { code: 'proof-target', sentence: 'הוכיחו כי AB ⊥ AC' } });
    if (v.kind !== 'refused') return;
    expect(plain(errorText3(t, v.error)!)).toBe(
      'זו טענה להוכחה, לא נתון — הכלי משרטט את הנתונים ואינו בודק הוכחות. הקלידו רק את מה שנתון בשאלה: «הוכיחו כי AB ⊥ AC» ' +
        RULED_3D_CHECK_HE,
    );
    expect(plain(errorText3(tEn, v.error)!)).toContain('is a claim to prove, not a given');
  });

  it('the parser no longer reads past the proof verb (the ADR-3D-002 strip is withdrawn)', () => {
    expect(parse3("הוכיחו כי CA' מאונך למישור BC'D").ok).toBe(false);
    expect(parse3('prove that AB = 3').ok).toBe(false);
    // the given framing is unchanged
    expect(parse3("נתון כי CA' מאונך למישור BC'D").ok).toBe(true);
  });

  it('a bare claim (no proof verb) still reads as before', () => {
    expect(decideSubmit3(pyramid, 'AB ⊥ AC').kind).toBe('record');
  });

  it('no line of the 3-D catalog reads as a proof target', () => {
    const hits = COMMAND_CATALOG_3D.flatMap((e) => [e.he, e.en]).filter((s) => s && findProofTarget(s));
    expect(hits).toEqual([]);
  });
});

/**
 * #2492 ([ADR-W-205](../../docs/06w-decisions-workspace.md#adr-w-205); the operator's ruling of 2026-11-10, option (b)) —
 * 3-D's refusal ends with a line naming what ITS data panel can check: an angle, a perpendicular or a parallel. The
 * ruling's example, byte for byte, with the panel's and the button's names nested from the keys App3 draws them with.
 */
const RULED_3D_CHECK_HE = 'ניתן לבדוק טענה על זווית, ניצבות או מקביליות בחלונית «נתונים»: שאלו שם על הזווית ולחצו «שאלו» — למשל ∠(AB, CD).';
const RULED_3D_CHECK_EN =
  'You can check a claim about an angle, a perpendicular or a parallel in the «Data» panel: ask there for the angle and press «Ask» — for example ∠(AB, CD).';

describe('#2492 — the 3-D proof-target refusal says where the claim can be checked', () => {
  type State = Parameters<typeof decideSubmit3>[0];
  const refuse = (state: State, line: string) => {
    const v = decideSubmit3(state, line);
    if (v.kind !== 'refused') throw new Error(`not refused: ${line}`);
    return v.error;
  };
  const triangle = (() => {
    const v = decideSubmit3({ facts: [], seed: 0 }, 'משולש ABC');
    if (v.kind !== 'record') throw new Error('setup: the triangle did not record');
    return { facts: v.facts as Fact3[], seed: v.seed } as State;
  })();

  it('«הוכיחו ש-AB = AC», Hebrew and English: the suite sentence quoting the claim, then the 3-D line', () => {
    const e = refuse(triangle, 'הוכיחו ש-AB = AC');
    expect(plain(errorText3(t, e)!)).toBe(`${PROOF_TARGET_SENTENCE.he('הוכיחו ש-AB = AC')} ${RULED_3D_CHECK_HE}`);
    expect(plain(errorText3(tEn, e)!)).toBe(`${PROOF_TARGET_SENTENCE.en('הוכיחו ש-AB = AC')} ${RULED_3D_CHECK_EN}`);
  });

  it('typed first, on an empty canvas, the refusal is the same', () => {
    const e = refuse({ facts: [], seed: 0 }, 'הוכיחו כי AB = AC');
    expect(plain(errorText3(t, e)!)).toBe(`${PROOF_TARGET_SENTENCE.he('הוכיחו כי AB = AC')} ${RULED_3D_CHECK_HE}`);
  });

  it("the line's two names are the labels App3 draws (nested, never retyped)", () => {
    const he = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../i18n/locales/he.json'), 'utf8').replace(/^﻿/, ''));
    expect(he.err.proofTargetCheck).toContain('$t(dataPanel.title)');
    expect(he.err.proofTargetCheck).toContain('$t(query.add)');
    const app = fs.readFileSync(path.resolve(__dirname, '../App3.tsx'), 'utf8');
    expect(panelDrawnFaults(app, { panel: 'dataPanel.title', ask: 'query.add' })).toEqual([]);
  });

  it("the pointer is true: the ask box answers the line's own example, a perpendicular and a parallel", () => {
    const build = (lines: string[]) => {
      let s: State = { facts: [], seed: 0 };
      for (const l of lines) {
        const v = decideSubmit3(s, l);
        if (v.kind !== 'record') throw new Error(`setup: ${l}`);
        s = { facts: v.facts as Fact3[], seed: v.seed } as State;
      }
      return (q: string) => answerQuery(derive3(s.facts, s.seed).construction, q, s.seed).answer;
    };
    expect(build(['מקבילית ABCD'])('∠(AB, CD)')).toMatch(/^(0|180)°?$/);
    expect(build(["תיבה ABCDA'B'C'D'"])("∠(AB, D'C')")).toMatch(/^(0|180)°?$/);
    expect(build(['פירמידה SABCD שבסיסה ריבוע', 'SA מאונך למישור ABCD'])('∠SBC')).toMatch(/^90°?$/);
  });
});
