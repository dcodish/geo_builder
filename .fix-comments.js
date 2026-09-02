const fs = require('fs');
const f = 'src3d/store/store3.ts';
let s = fs.readFileSync(f, 'utf8');
s = s.replace(
  '  /** #578 (ADR-3D-211): a RENAME that could not be done. Typed, not : the sentence was\n   *  understood perfectly, so escalating it to the LLM would pay for a guess at a question already\n   *  answered. / are echoed so the message can name the letters the student typed. */',
  '  /** #578 (ADR-3D-211): a RENAME that could not be done. Typed, NOT `not-understood`: the sentence\n   *  was understood perfectly, so escalating it to the LLM would pay for a guess at a question already\n   *  answered. `from`/`to` are echoed so the message can name the letters the student typed. */');
s = s.replace(
  '   *  One undoable step. Also reached from the text command, intercepted in . */',
  '   *  One undoable step. Also reached from the text command, intercepted in `submit`. */');
fs.writeFileSync(f, s);
console.log('comments repaired');
