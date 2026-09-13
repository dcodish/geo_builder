import { it } from 'vitest';
import { factsOf } from './scenario-pipeline';
import { meetsRequirements, replay, pointsDistinct, extensionsClear, intersectionsWithinSegments, segmentsCrossWithin, polygonsConvex } from '@/replay/core';
const why = (facts: any, s: number) => { const f = replay(facts, s); return `err=${f.lastError} viol=${f.violations.map((v: any) => v.relation + ':' + v.ids.join('')).join('|')} ext=${extensionsClear(facts, f)} within=${intersectionsWithinSegments(f)} cross=${segmentsCrossWithin(facts, f.positions)} distinct=${pointsDistinct(f.construction, f.positions, f.coincidences)} convex=${polygonsConvex(facts, f.positions)}`; };
const sweep = (label: string, seq: string[], n = 24) => { const facts = factsOf(seq); const t0 = Date.now(); const fails: number[] = []; for (let s = 0; s < n; s++) if (!meetsRequirements(facts, s)) fails.push(s); console.log(`${label}: fails=${fails.join(',') || 'none'} (${fails.length}/${n}) ${Date.now() - t0}ms`); for (const s of fails.slice(0, 3)) console.log(`   seed ${s}: ${why(facts, s)}`); return facts; };
it('556 after', () => {
  sweep('two tangents (reported)', ['שני מעגלים משיקים מבחוץ', 'A על מעגל O1', 'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות D ו C']);
  const f2 = factsOf(['שני מעגלים משיקים מבחוץ', 'A על מעגל O1', 'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות D ו C', 'ישר ADB']);
  for (let s = 0; s < 8; s++) { const f = replay(f2, s); const O2 = f.positions.get('O2'), D = f.positions.get('D'), C = f.positions.get('C'), B = f.positions.get('B'); if (!O2 || !D || !C || !B) { console.log(`ADB seed ${s}: err=${f.lastError} (missing)`); continue; } const rd = Math.hypot(O2.x - D.x, O2.y - D.y), rc = Math.hypot(O2.x - C.x, O2.y - C.y); const dot = (D.x - O2.x) * (B.x - D.x) + (D.y - O2.y) * (B.y - D.y); console.log(`ADB seed ${s}: err=${f.lastError} |O2D|=${rd.toFixed(3)} |O2C|=${rc.toFixed(3)} O2D·DB=${dot.toFixed(4)} meets=${meetsRequirements(f2, s)}`); }
  sweep('single tangent from A', ['מעגל O', 'מנקודה A מחוץ למעגל מעבירים משיק לנקודה D']);
  sweep('stated outside', ['מעגל O', 'M מחוץ למעגל']);
  sweep('secant apex', ['מעגל O', 'מנקודה A מחוץ למעגל O ישר חותך את המעגל בנקודות C ו-B']);
  sweep('stated inside', ['מעגל O', 'M בתוך המעגל']);
}, 900000);
