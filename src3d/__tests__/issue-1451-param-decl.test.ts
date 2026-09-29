/**
 * #1451 — «t הוא פרמטר» IS UNDERSTOOD (ADR-3D-277): the unsigned declaration, sharing the signed
 * rule's owner gate. The two-spellings bug: «t הוא פרמטר חיובי» worked while the plain form burned
 * an LLM call per attempt.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
beforeEach(reset);

describe('#1451 — the spellings parse', () => {
  it.each(['t הוא פרמטר', 't פרמטר', 't is a parameter', 'k is parameter'])('«%s» lowers to param-decl', (u) => {
    const r = parse3(u);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('param-decl');
  });
});

describe('#1451 — the owner gate, both orders', () => {
  it('after the letter exists: absorbed green, the figure unchanged', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('B(2t,t,1)');
    submit('t הוא פרמטר');
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    for (const f of st.facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });

  it('a letter the figure lacks keeps the honest unknown-symbol refusal', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('q הוא פרמטר');
    const st = useGeo3.getState();
    const qf = st.facts.find((f) => f.utterance === 'q הוא פרמטר');
    if (qf) {
      const d = derive3(st.facts, st.seed);
      expect(d.status[qf.id]).toEqual({ code: 'unknown-symbol', id: 'q' });
    } else {
      expect(st.lastError, 'refused at the gate').not.toBeNull();
    }
  });

  it('the signed neighbour is untouched: «t הוא פרמטר חיובי» still lowers param-sign', () => {
    const r = parse3('t הוא פרמטר חיובי');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('param-sign');
  });
});
