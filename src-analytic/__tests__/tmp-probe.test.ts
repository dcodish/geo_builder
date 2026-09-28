// TEMPORARY — deleted before commit.
import { it } from 'vitest';
import { derive } from '../engine/derive';

it('probe square contradiction', () => {
  const d = derive(['ריבוע ABCD', 'AB = 2BC'], 0);
  const at = (id: string) => d.figure.points.find((p) => p.id === id)!;
  const len = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
  console.log('faults:', JSON.stringify(d.faults.map((f) => f.code)));
  console.log('AB=', len('A', 'B').toFixed(4), 'BC=', len('B', 'C').toFixed(4), 'CD=', len('C', 'D').toFixed(4), 'DA=', len('D', 'A').toFixed(4));
  console.log('seed:', d.seed);
});
