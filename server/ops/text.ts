/**
 * The management console's words (#2868, ADR-W-209). Every Hebrew sentence lives in `he.json`, never in a `.ts`
 * literal (ADR-W-153, the inline-Hebrew ratchet); code reads it by key. A missing key throws, so a typo fails a
 * test instead of rendering an empty label.
 */
import table from './he.json';

export function t(key: string): string {
  let v: unknown = table;
  for (const part of key.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
  if (typeof v !== 'string') throw new Error(`management text: no "${key}" in server/ops/he.json`);
  return v;
}
