import { describe, it } from 'vitest';
import { derive } from './src-analytic/engine/derive';
const run = (ls: string[]) => {
  const d = derive(ls, 0);
  console.log('Q ' + JSON.stringify(ls) + ' codes=' + JSON.stringify(d.faults.map(f=>f.code)) +
    ' out=' + JSON.stringify(d.outcomes) + ' unsat=' + d.figure.unsatisfied.length);
};
describe('p', () => { it('r', () => {
  console.log('--- start ---');
  run(['דלתון ABCD', 'שטח הדלתון ABCD הוא 24']);
  run(['דלתון ABCD', 'שטח הדלתון הוא 24']);
  run(['מקבילית ABCD', 'שטח המקבילית ABCD הוא 24']);
  run(['שטח הדלתון הוא 24']);
  run(['דלתון ABCD', 'דלתון EFGH', 'שטח הדלתון הוא 24']);
  run(['מרובע ABCD', 'דלתון ABCD']);
  run(['משולש ABC', 'שטח המשולש ABC הוא 6']);
  run(['A(0,0)','B(4,0)','C(0,3)','שטח ABC הוא 6']);
  run(['שטח המשולש ABC הוא 6']);
  run(['ריבוע ABCD', 'שטח הריבוע הוא 25']);
}); });
