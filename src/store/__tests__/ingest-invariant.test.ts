/**
 * #751 (ADR-W-029) — THE store-side ingest invariant, 2-D half.
 *
 * A fact's `utterance` holds what the STUDENT stated, never presentation characters. The app wraps
 * LTR technical runs in Unicode isolates for display; the empty-canvas chips used to submit that
 * display string as the command, so the isolates landed in the fact list — and from there in the
 * saved `.geo.json`, the prod usage log, and the `.docx` export, where Word draws them as
 * missing-glyph boxes (the operator's report).
 *
 * Locked here: the chip's SOURCE is raw, the store cleans whatever it is handed anyway, and a file
 * saved BEFORE this fix loads clean — that last one is what protects the saves already in the wild.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGeoStore } from '../geoStore';
import { deserializeFigure, FIGURE_FILE_VERSION } from '../figureFile';
import i18n from '@/i18n';

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const CONTROLS = /[؜​-‏‪-‮⁦-⁩﻿]/;

const s = () => useGeoStore.getState();
beforeEach(() => s().clear());

describe('#751 — the 2-D fact list never holds presentation characters', () => {
  it('the chips take the RAW translation, while the display form still carries isolates', async () => {
    await i18n.changeLanguage('he');
    const shown = i18n.t('examples.items', { returnObjects: true }) as string[];
    const raw = i18n.t('examples.items', { returnObjects: true, postProcess: [] }) as string[];

    // the post-processor is real — otherwise this test would pass vacuously
    expect(shown.some((x) => CONTROLS.test(x))).toBe(true);
    expect(raw.every((x) => !CONTROLS.test(x))).toBe(true);
    expect(raw.map((x) => x.replace(new RegExp(`[${LRI}${PDI}]`, 'g'), ''))).toEqual(
      shown.map((x) => x.replace(new RegExp(`[${LRI}${PDI}]`, 'g'), '')),
    );
  });

  it('execute / executeMany store a cleaned utterance even when handed a dirty one', () => {
    s().execute({ type: 'free-point', id: 'A', x: 0, y: 0 }, `נקודה ${LRI}A${PDI}`);
    expect(s().facts[0].utterance).toBe('נקודה A');

    s().executeMany([{ type: 'free-point', id: 'B', x: 1, y: 0 }], `נקודה ${LRI}B${PDI}`);
    expect(s().facts[1].utterance).toBe('נקודה B');
    expect(s().facts.every((f) => !CONTROLS.test(f.utterance ?? ''))).toBe(true);
  });

  it('replaceGroup (the ✎ edit path) cleans too', () => {
    s().execute({ type: 'free-point', id: 'A', x: 0, y: 0 }, 'נקודה A');
    const key = s().facts[0].id;
    s().replaceGroup(key, [{ type: 'free-point', id: 'A', x: 2, y: 2 }], `נקודה ${LRI}A${PDI} אחרת`);
    expect(s().facts[0].utterance).toBe('נקודה A אחרת');
  });

  it('a file saved BEFORE the fix loads with clean utterances', () => {
    const dirty = JSON.stringify({
      app: 'geo-builder',
      schemaVersion: FIGURE_FILE_VERSION,
      facts: [{ id: 'x1', utterance: `טרפז ${LRI}ABCD${PDI} חסום במעגל`, cmd: { type: 'free-point', id: 'A', x: 0, y: 0 }, enabled: true }],
      seed: 0,
    });
    const r = deserializeFigure(dirty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.facts[0].utterance).toBe('טרפז ABCD חסום במעגל');
  });
});
