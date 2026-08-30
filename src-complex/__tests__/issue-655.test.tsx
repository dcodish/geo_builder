/**
 * #655 — A CONTRADICTION IS INFORMATION, AND IT LANDS WHERE THE STUDENT IS LOOKING.
 *
 * Operator report (prod, 2026-08-16): *«z^3 = 8» / «z ברביע הראשון» did report no valid config but the
 * input panel is not red so the message is hidden somewhere user will not notice.*
 *
 * The engine's verdict was already right; the REFUSAL had no salience — it appeared in the v2 banner
 * above the canvas while the input panel and the fact rows stayed neutral. The operator deferred the
 * fix deliberately: *"this will be fixed by the consolidation of ui's we are planning so no point of
 * fixing it now."*
 *
 * That call was correct and the consolidation delivered it: the acceptance gate (ADR-CX-023) refuses
 * the line at submit with keep-prior, and the shared `Banner` (ADR-W-016) renders the refusal as a red
 * `role="alert"` INSIDE the input area — the 2-D/3-D shape the issue asked for. **No code change was
 * needed here.** These are the locks that keep it, so the behaviour cannot regress silently the way it
 * arrived (standing rule 4: the operator's exact sequence becomes permanent coverage).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Banner } from '../../shell/frame/Banner';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';
import { complexI18n } from '../i18n';
import { stripFormatControls } from '../../shell/bidi';

const reset = () => useComplexStore.getState().resetSession();
const store = () => useComplexStore.getState() as unknown as {
  lastError: { key: string; detail: string } | null;
  lines: readonly unknown[];
};
const tRaw = complexI18n.getFixedT('he');
const t = (key: string, params?: Record<string, unknown>) => stripFormatControls(tRaw(key, params));

describe('#655 — the operator’s sequence', () => {
  beforeEach(reset);

  it('«z ברביע הראשון» after «z^3 = 8» is REFUSED, not quietly absorbed', () => {
    expect(submitLine('z^3 = 8')).toBe(true);
    expect(submitLine('z ברביע הראשון')).toBe(false);
  });

  it('the refusal NAMES the statement it conflicts with (ADR-276)', () => {
    submitLine('z^3 = 8');
    submitLine('z ברביע הראשון');
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z^3 = 8' });
  });

  it('KEEP-PRIOR — the refused line does not join the session', () => {
    submitLine('z^3 = 8');
    const before = store().lines.length;
    submitLine('z ברביע הראשון');
    expect(store().lines.length).toBe(before);
  });

  it('the message is a real sentence naming the student’s own line, not internal state', () => {
    submitLine('z^3 = 8');
    submitLine('z ברביע הראשון');
    const e = store().lastError!;
    const msg = t('errIncompatible', { detail: e.detail });
    expect(msg).toContain('z^3 = 8');
    expect(msg).not.toMatch(/configCount|enumerated|null|undefined/);
  });
});

describe('#655 — and it is rendered where a student looks', () => {
  /**
   * The salience half, which is what the report was actually about. The shared Banner is what the
   * complex app mounts inside its InputArea, so asserting the surface's contract here keeps the
   * "hidden somewhere the user will not notice" defect from coming back through a styling change.
   */
  it('an error banner is role="alert", so it is announced as well as red', () => {
    const html = renderToStaticMarkup(<Banner kind="error">שגיאה</Banner>);
    expect(html).toContain('role="alert"');
  });

  it('a NOTICE is only role="status" — a warning must not shout like a refusal', () => {
    const html = renderToStaticMarkup(<Banner kind="notice">הודעה</Banner>);
    expect(html).toContain('role="status"');
  });
});
