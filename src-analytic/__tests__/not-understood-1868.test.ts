/**
 * #1868 (ADR-W-151) — this builder words an unread line with the ruled "not understood" sentence, through its own
 * refusal path and i18n instance. The assertions are shared: `shell/__tests__/fixtures/not-understood-1868.ts`.
 */
import { expect } from 'vitest';
import { analyticI18n } from '../i18n';
import { errorText, type Translate } from '../app/errorText';
import { decideSubmit } from '../app/submit';
import { lockNotUnderstood } from '../../shell/__tests__/fixtures/not-understood-1868';

lockNotUnderstood('analytic', (lng, line) => {
  const v = decideSubmit(line, [], 0);
  // the grammar's refusal, before the model lane: the error the App words if the model cannot read it either
  expect(v.kind).toBe('refused');
  if (v.kind !== 'refused') return '';
  expect(v.error.key).toBe('not-handled');
  return errorText(v.error, analyticI18n.getFixedT(lng) as unknown as Translate);
});
