/**
 * #1442 ([ADR-552](../../docs/06-decisions.md#adr-552)) — the WORDS of a values-panel row's label.
 *
 * The one place the panel's row names are worded, so the App and the lock read the same decision. A row
 * about a circle carries a structured {@link CircleRef} from the engine (`src/engine/circleRef.ts`): the
 * centre's letter keeps the ADR-410 wording («רדיוס O», «שטח (O)»); the only drawn circle with an
 * anonymous centre reads «רדיוס המעגל»; one of several reads its ADR-342 token, «רדיוס מעגל O».
 */
import type { ValueRow } from '@/engine';

type T = (key: string, params?: Record<string, string>) => string;

export function valueRowText(r: ValueRow, t: T): string {
  const via = r.circle?.via;
  if (r.kind === 'radius')
    return via === 'sole' ? t('values.radiusSole') : via === 'token' ? t('values.radiusOf', { c: r.label }) : t('values.radius', { c: r.label });
  if (r.kind === 'area')
    return via === 'sole' ? t('values.areaSole') : via === 'token' ? t('values.areaOf', { c: r.label }) : t('values.area', { ids: r.label });
  if (r.kind === 'perimeter')
    return via === 'sole' ? t('values.perimeterSole') : via === 'token' ? t('values.perimeterOf', { c: r.label }) : t('values.perimeter', { ids: r.label });
  return r.label;
}
