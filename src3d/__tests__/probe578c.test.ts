import { describe, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
const reset = () => { useGeo3.setState({ facts: [], seed: 0, lastError: null }); useGeo3.temporal.getState().clear(); };
const st = () => useGeo3.getState();
describe('probe578c — which utterance auto-names a height foot', () => {
  for (const h of ['גובה מ-S', 'גובה מהקודקוד S', 'הגובה מ-S', 'SE גובה', 'גובה S']) {
    it(h, () => {
      reset(); st().submit('פירמידה ABCDS שבסיסה ריבוע'); st().submit(h);
      const d = derive3(st().facts, st().seed);
      console.log(`H «${h}» err=${JSON.stringify(st().lastError)} pts=${[...d.positions.keys()].join(',')} facts=${st().facts.length}`);
    });
  }
});
