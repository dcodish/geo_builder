/**
 * #2610 (ADR-3D-412) — every NAME the 3-D figure shows the student, by surface. In 3-D a plane's, a line's and a
 * vector's name is the very text the planes list, the canvas label, the data panel and the created notice print, so
 * an id-shaped name is a leak on all of them at once. Read by the #1455 corpus guard and the #2610 lock.
 *
 * `full` adds the surfaces that cost a scene build and a data-panel sample (the canvas labels, the panel's rows); the
 * cheap set (the planes list, the drawn lines, the vectors, the created notice) is what every line can afford.
 */
import { dataView } from '../engine/dataView';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { derive3, useGeo3 } from '../store/store3';

export interface ShownName3 {
  surface: string;
  text: string;
}

export function shownNames3(full = false): ShownName3[] {
  const st = useGeo3.getState();
  const d = derive3(st.facts, st.seed);
  const out: ShownName3[] = [];
  for (const n of d.resolved.planes.keys()) out.push({ surface: 'planes list', text: n });
  for (const n of d.resolved.lines.keys()) out.push({ surface: 'line', text: n });
  for (const n of d.construction.vectors.keys()) out.push({ surface: 'vector', text: n });
  for (const id of st.lastCreated?.ids ?? []) out.push({ surface: 'created notice', text: id });
  if (!full) return out;
  const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 });
  for (const p of scene.planes) out.push({ surface: 'canvas plane label', text: p.name });
  for (const l of scene.lines) out.push({ surface: 'canvas line label', text: l.name });
  for (const p of scene.points) out.push({ surface: 'canvas point label', text: p.label });
  const panel = dataView(d.construction, st.seed);
  // a row is a name followed by its math («ABB'A': 20x − y …», «N(6, 6, 6)»): only the NAME is judged, since the
  // math is the student's own algebra («k-1») and is not id-shaped by intent
  for (const r of panel.planes) out.push({ surface: 'data panel plane row', text: r.split(':')[0].trim() });
  for (const r of panel.points) out.push({ surface: 'data panel point row', text: r.split('(')[0].trim() });
  for (const m of panel.mutual) out.push({ surface: 'data panel', text: m.a }, { surface: 'data panel', text: m.b });
  for (const v of panel.vectors) out.push({ surface: 'data panel', text: v.label });
  return out;
}
