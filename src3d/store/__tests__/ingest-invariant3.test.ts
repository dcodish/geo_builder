/**
 * #751 (ADR-W-029) — THE store-side ingest invariant, 3-D half.
 *
 * The operator's report came from here: «קובייה ABCD» entered by clicking an example chip exported
 * to `.docx` as «קובייה ⟦PDI⟧ABCD⟦LRI⟧`, two missing-glyph boxes, while the hand-typed lines were
 * clean. The chip submitted its own DISPLAY label.
 *
 * `normalize3` already stripped the same controls at the PARSER boundary (#531/ADR-3D-144) — that
 * protects the grammar, not the fact list, which is what is saved, logged and exported.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3 } from '../store3';
import { deserializeFigure3, serializeFigure3 } from '../figureFile3';
import i18n3 from '../../i18n';

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const CONTROLS = /[؜​-‏‪-‮⁦-⁩﻿]/;

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};

describe('#751 — the 3-D fact list never holds presentation characters', () => {
  beforeEach(reset);

  it('the chips take the RAW translation, while the display form still carries isolates', async () => {
    await i18n3.changeLanguage('he');
    const shown = i18n3.t('examples.ex1');
    const raw = i18n3.t('examples.ex1', { postProcess: [] });
    expect(CONTROLS.test(shown)).toBe(true); // the post-processor is real
    expect(CONTROLS.test(raw)).toBe(false);
  });

  it('the operator’s exact case: submitting the chip’s DISPLAY text still stores it clean', () => {
    useGeo3.getState().submit(`קובייה ${LRI}ABCD${PDI}`);
    const f = useGeo3.getState().facts;
    expect(f.length).toBe(1);
    expect(f[0].utterance).toBe('קובייה ABCD');
    expect(CONTROLS.test(f[0].utterance)).toBe(false);
  });

  it('replaceFact (the edit path) cleans too', () => {
    useGeo3.getState().submit('קובייה ABCD');
    const id = useGeo3.getState().facts[0].id;
    useGeo3.getState().replaceFact(id, `תיבה ${LRI}ABCDA'B'C'D'${PDI}`);
    expect(useGeo3.getState().facts[0].utterance).toBe("תיבה ABCDA'B'C'D'");
  });

  it('a file saved BEFORE the fix loads with clean utterances', () => {
    // Build a REAL save, then dirty its utterance exactly as a pre-fix session would have — the
    // schema stays the serializer's own, so this cannot rot against a hand-written fixture.
    useGeo3.getState().submit('קובייה ABCD');
    const saved = serializeFigure3(useGeo3.getState().facts, 0);
    const dirty = saved.replace('קובייה ABCD', `קובייה ${LRI}ABCD${PDI}`);
    expect(dirty).not.toBe(saved);

    const r = deserializeFigure3(dirty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.facts[0].utterance).toBe('קובייה ABCD');
  });
});
