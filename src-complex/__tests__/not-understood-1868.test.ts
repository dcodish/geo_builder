/**
 * #1868 (ADR-W-151) — this builder words an unread line with the ruled "not understood" sentence, through its own
 * refusal path and i18n instance. The assertions are shared: `shell/__tests__/fixtures/not-understood-1868.ts`.
 */
import { expect } from 'vitest';
import { complexI18n } from '../i18n';
import { errorText } from '../app/errorText';
import { decideSubmitCx } from '../app/submit';
import type { Translate } from '../model/why';
import { lockNotUnderstood } from '../../shell/__tests__/fixtures/not-understood-1868';

lockNotUnderstood('complex', (lng, line) => {
  const v = decideSubmitCx({ lines: [], disabled: [], seed: 0 }, line);
  expect(v.kind).toBe('refuse');
  if (v.kind !== 'refuse') return '';
  expect(v.error.key).toBe('not-handled');
  return errorText(v.error, complexI18n.getFixedT(lng) as unknown as Translate);
});
