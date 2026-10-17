/**
 * #1837 ([ADR-W-142](../../docs/06w-decisions-workspace.md#adr-w-142), ADR-710) — 3-D's thin lock on the shared
 * radian-angle rows (`shell/__tests__/fixtures/radian-angle-rows.ts`, docs/28 §5c).
 *
 * Measured on `main` b0e9dbea through `decideSubmit3`, after «משולש ABC»: «∠ABC = π» and «∠ABC = 0.5π» were
 * RECORDED as an angle mark labelled π (`angle-mark … label: "π"`, the angle drawn wherever the free triangle
 * fell), and every other spelling was `not-understood` — handed to the model. The operator's ruling
 * (2026-10-07) reaches 3-D's plane-geometry angle sentences through the parity rule: refused, with 2-D's sentence.
 * π as a plane NAME («B על המישור π2») and a space angle with a plane operand are untouched.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, type Fact3 } from '../store/store3';
import { decideDeterministic3, refusalCategory3 } from '../app/decideDeterministic3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { findRadianAngle } from '../../shell/radianAngle';
import { radianAngleFaults, RADIAN_SENTENCE_EN, RADIAN_SENTENCE_HE, type RadianGate } from '../../shell/__tests__/fixtures/radian-angle-rows';

const t = i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string;
const tEn = i18n3d.getFixedT('en') as (k: string, o?: Record<string, unknown>) => string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

const triangle = (() => {
  const v = decideSubmit3({ facts: [], seed: 0 }, 'משולש ABC');
  if (v.kind !== 'record') throw new Error('setup: the triangle did not record');
  return { facts: v.facts as Fact3[], seed: v.seed };
})();

/** The REAL decision App3 dispatches (`decideDeterministic3`), asked on the triangle. */
const gate: RadianGate = (line) => {
  const v = decideDeterministic3(triangle, line);
  const radian = v.kind === 'refused' && v.error.code === 'radian-angle';
  return { radian, recorded: v.kind === 'record', escalated: v.kind === 'not-understood', text: v.kind === 'refused' ? plain(errorText3(t, v.error) ?? '') : null };
};

describe('#1837 — 3-D refuses a plane-geometry angle written in radians', () => {
  it('the shared rows hold through decideDeterministic3', async () => {
    expect(await radianAngleFaults(gate)).toEqual([]);
  });

  it('it is a guided refusal (never a model call), in Hebrew and English', () => {
    const v = decideSubmit3(triangle, '∠ABC = π');
    expect(v).toEqual({ kind: 'refused', error: { code: 'radian-angle' } });
    if (v.kind !== 'refused') return;
    expect(refusalCategory3(v.error)).toBe('guided');
    expect(plain(errorText3(tEn, v.error)!)).toBe(RADIAN_SENTENCE_EN);
    expect(plain(errorText3(t, v.error)!)).toBe(RADIAN_SENTENCE_HE);
  });

  it('π as a plane name still records, and the degrees remedy builds', () => {
    expect(decideSubmit3(triangle, 'B על המישור π2').kind).toBe('record');
    expect(decideSubmit3(triangle, '∠ABC = 90').kind).toBe('record');
  });

  it('no line of the 3-D catalog reads as an angle in radians', () => {
    const hits = COMMAND_CATALOG_3D.flatMap((e) => [e.he, e.en]).filter((s) => s && findRadianAngle(s));
    expect(hits).toEqual([]);
  });
});
