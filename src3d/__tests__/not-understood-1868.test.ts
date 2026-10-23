/**
 * #1868 (ADR-W-151) — this builder words an unread line with the ruled "not understood" sentence, through its own
 * refusal path and i18n instance. The assertions are shared: `shell/__tests__/fixtures/not-understood-1868.ts`.
 */
import { expect } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3 } from '../store/store3';
import { lockNotUnderstood } from '../../shell/__tests__/fixtures/not-understood-1868';

let n = 0;
lockNotUnderstood('3d', (lng, line) => {
  const v = decideSubmit3({ facts: [], seed: 0 }, line, () => `f${++n}`);
  expect(v.kind).toBe('not-understood');
  const t = i18n3d.getFixedT(lng) as (k: string, o?: Record<string, unknown>) => string;
  return errorText3(t, { code: 'not-understood' }) ?? '';
});
