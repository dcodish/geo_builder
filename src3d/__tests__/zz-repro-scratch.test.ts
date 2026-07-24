import { describe, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { add3, scale3, sub3, norm3 } from '../engine/vec3';

const build = (us: string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  us.forEach((u) => useGeo3.getState().submit(u));
  const st = useGeo3.getState();
  return { st, c: derive3(st.facts, st.seed).construction };
};

describe('scratch: where does O actually land?', () => {
  it('האלכסונים AC ו BD — centre of ABCD, or midpoint of AB?', () => {
    for (const utt of [
      'האלכסונים AC ו BD נחתכים בנקודה O',
      'אלכסוני ABCD נחתכים בנקודה O',
    ]) {
      const { st, c } = build(['מנסרה ישרה שבסיסה מלבן', utt]);
      if (st.facts.length < 2) { console.log(utt, '=> FAILED', JSON.stringify(st.lastError)); continue; }
      console.log(utt, '=> cmds', JSON.stringify(st.facts[1].cmds));
      const pos = resolve3(c, 0).positions;
      const p = (id: string) => pos.get(id)!;
      const O = p('O');
      const midAC = scale3(add3(p('A'), p('C')), 0.5);
      const midBD = scale3(add3(p('B'), p('D')), 0.5);
      const midAB = scale3(add3(p('A'), p('B')), 0.5);
      console.log('   O=', JSON.stringify(O));
      console.log('   dist to mid(AC)=', norm3(sub3(O, midAC)).toFixed(6),
                  ' mid(BD)=', norm3(sub3(O, midBD)).toFixed(6),
                  ' mid(AB)=', norm3(sub3(O, midAB)).toFixed(6));
    }
  });
});
