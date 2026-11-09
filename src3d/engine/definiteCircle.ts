/**
 * #2705 ([ADR-3D-439](../../docs/06b-decisions-3d.md#adr-3d-439)) — THE DEFINITE CIRCLE. «המעגל» with no letter (a
 * command's `circle: ''`, ADR-029's implicit reference) names the ONE circle of the figure it is judged against; with
 * none it names nothing, with two or more it asks which (q-2611-twocircles, ADR-W-175 sr-12: "With two, the tool asks
 * which, using the existing question").
 *
 * One reader for every place that resolves the bare noun: `applyCommand3` (`point-on-circle3`, `circle-given`) asks
 * it over the figure the row applies to, and the fold asks it again over the circles the rows ABOVE the row made, so a
 * row judged while an earlier row was still deferred is judged in list order (`deriveCore3`). Nothing reads
 * `circles3[0]` alone.
 */
import type { Construction3, EngineError3, Id } from './types';

type Circle3 = Construction3['circles3'][number];

/**
 * The circle `''` names among `circles`, or the refusal. `point` is the letter the statement places on it: given, a
 * refusal over several circles carries the remedy sentence «הנקודה {point} על המעגל {centre}» when some circle is
 * built on a centre the student lettered (`circle-<centre>`, the only kind «המעגל X» can name).
 */
export function definiteCircle3(
  circles: readonly Circle3[],
  point?: Id,
): { ok: true; circle: Circle3 } | { ok: false; error: Extract<EngineError3, { code: 'unknown-circle' }> } {
  if (circles.length === 1) return { ok: true, circle: circles[0] };
  if (circles.length === 0) return { ok: false, error: { code: 'unknown-circle' } };
  if (point === undefined) return { ok: false, error: { code: 'unknown-circle', several: true } };
  const centre = circles.map((k) => ('center' in k.def && k.id === `circle-${k.def.center}` ? k.def.center : null)).find((x) => x !== null);
  return { ok: false, error: centre ? { code: 'unknown-circle', several: true, centre, point } : { code: 'unknown-circle', several: true } };
}
