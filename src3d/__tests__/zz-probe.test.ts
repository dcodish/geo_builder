import { describe, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, type Fact3 } from '../store/store3';
import { pinningGivens, paramRoots } from '../engine/evaluate';

const facts = (utts: string[]): Fact3[] =>
  utts.map((u, i) => {
    const r = parse3(u);
    if (!r.ok) throw new Error(`NOT-HANDLED: ${u}`);
    return { id: `f${i}`, utterance: u, cmds: r.commands, enabled: true };
  });

const report = (tag: string, utts: string[]) => {
  const fs = facts(utts);
  const d = derive3(fs, 0);
  console.log(tag, 'status', JSON.stringify(fs.map((f) => [f.utterance, d.status[f.id]])));
  console.log(tag, 'param', JSON.stringify(d.resolved.param));
  console.log(tag, 'pinningGivens', pinningGivens(d.construction), 'roots', JSON.stringify(paramRoots(d.construction)));
  console.log(tag, 'lineRels', JSON.stringify(d.construction.lineRels));
  console.log(tag, 'claims', JSON.stringify(d.construction.claims));
  return d;
};

describe('probe3', () => {
  it('#492 unsatisfiable', () => {
    report('#492', ['הישר l: x=(1,2,3)+t(m+2,m,m-2)', 'מישור π1: x+(m-2)y+(m-1)z-5=0', 'l מקביל לπ1']);
  });
  it('#492b satisfiable', () => {
    report('#492b', ['הישר l: x=(1,2,3)+t(m-2,m,m+2)', 'מישור π1: x+(m-2)y+(m-1)z-5=0', 'l מקביל לπ1']);
  });
  it('#508 distance to free plane — commands', () => {
    for (const u of [
      'המרחק בין A למישור π2 הוא 5',
      'המרחק מ A למישור π2 הוא 5',
      'המרחק בין A למישור ABC הוא 5',
    ]) {
      const r = parse3(u);
      console.log('#508 cmd', u, r.ok ? JSON.stringify(r.commands) : 'NOT-HANDLED');
    }
    const d = report('#508', ['פירמידה משולשת ABCD', 'מישור π2', 'המרחק בין A למישור π2 הוא 5']);
    console.log('#508 planeDists?', JSON.stringify(Object.keys(d.construction)));
  });
  it('#425 pins', () => {
    const d = report('#425', [
      'פירמידה משולשת ABCD',
      'AB',
      '|AB|=|BC|',
      'AC',
      '|AB|=|AC|',
      'AD',
      'BD',
      'זווית DAB = 120',
      'זווית DAC = 53.13',
    ]);
    console.log('#425 scalarPins', JSON.stringify(d.construction.scalarPins));
    console.log('#425 pins', JSON.stringify(d.construction.pins), 'vectorPins', JSON.stringify(d.construction.vectorPins));
    console.log('#425 pivot', JSON.stringify(d.resolved.pivot?.solutions));
  });
});
