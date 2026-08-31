import { describe, it } from 'vitest';
import { derive3, useGeo3 } from '../src3d/store/store3';
import { dataView } from '../src3d/engine/dataView';
function reset(){useGeo3.setState({facts:[],seed:0,lastError:null});useGeo3.temporal.getState().clear();}
const st=()=>useGeo3.getState();
const SEQ=['פירמידה SABCD שבסיסה מקבילית','המקצוע SA הוא גובה בפירמידה','M אמצע אלכסון BD','נסמן: AB = u, AD = v, AS = w','A(0,0,0)','B(0,5,0)','S(0,0,6)','D(3,p,0)','|u| = |v|'];
describe('vector lane', () => { it('v across seeds', () => {
  for (const seed of [0,1,3,17,42,99]) {
    reset(); for (const u of SEQ) st().submit(u);
    const dv = dataView(derive3(st().facts, seed).construction, seed);
    const v = dv.vectors.find(e=>e.label==='v');
    console.log(`seed ${String(seed).padStart(3)}  D=${dv.pointCoords['D']?.text}   v.coords=${v?.coords}   v.mag=${v?.mag}`);
  }
}); });
