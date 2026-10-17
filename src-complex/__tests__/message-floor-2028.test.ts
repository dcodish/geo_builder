/**
 * #2028 ([ADR-W-130](../../docs/06w-decisions-workspace.md#adr-w-130)) — complex (`errorText` + `whyText` over `InputError` and `Why`): every member of the typed error union
 * renders a locale sentence of the student's own words, never engine text. The assertions are shared
 * (`shell/__tests__/fixtures/message-floor.ts`); the rows are this tree's.
 */
import { complexI18n as i18nC } from '../i18n';
import { errorText as complexErrorText } from '../app/errorText';
import type { InputError as ComplexError } from '../store/useComplexStore';
import type { Why } from '../model/why';
import { lockMessageFloor, type Fixed, type Payload } from '../../shell/__tests__/fixtures/message-floor';

// ─── complex: `errorText` over `InputError`, and `whyText` over every `Why` a refusal can carry ─────────────────

const WHY: Record<Why['code'], Payload> = {
  'undecided-arg': { name: 'z1' },
  'undecided-mod-pair': { a: 'z1', b: 'w' },
  'undecided-arg-pair': { a: 'z1', b: 'w' },
  'undecided-arg-irrational': { name: 'z1' },
  'undecided-arg-pair-irrational': { a: 'z1', b: 'w' },
  'prop-holds': { name: 'z1', prop: 'real' },
  'prop-refuted': { name: 'z1', prop: 'imaginary' },
  'conjugates-hold': { a: 'z1', b: 'w' },
  'moduli-differ': {},
  'args-not-opposite': {},
  'forall-holds': { power: 'z^3', prop: 'real' },
  'forall-refuted': { power: 'z^3', prop: 'imaginary' },
  'minimal-none': { name: 'z1', prop: 'real' },
  'minimal-holds': { name: 'z1', prop: 'real', n: 2 },
  'minimal-refuted': { name: 'z1', prop: 'real', least: 2 },
  'free-dof-remain': {},
  'multi-config': { configs: 2 },
  undetermined: {},
  'maybe-multi': {},
  'multi-solution': { solutions: 2, first: 'z1' },
  'arg-of-zero': {},
  'measure-uncomputable': { src: 'z1 = 3+4i' },
  'measure-holds': { src: 'z1 = 3+4i' },
  'measure-violated': { src: 'z1 = 3+4i' },
  'line-unaccounted': { items: 'לא' },
  'line-unrecognized': {},
  'reserved-letter': { letter: 'u', equation: 'z^2 = 2i' },
  'declared-complex-real': { letter: 'u', declaration: 'u מספר מרוכב' },
};

const COMPLEX: Record<ComplexError['key'], Payload[]> = {
  'not-handled': [{}],
  'parse-error': [{}],
  'unread-name': [{ detail: 'ДЖФ' }],
  'unread-word': [{ detail: 'ДЖФ' }],
  // #1870 (ADR-CX-083) — a claim to prove, 2-D's sentence quoting the proof sentence
  'proof-target': [{ detail: 'הוכיחו כי |z1| = 5' }],
  'duplicate-name': [{ detail: 'z1' }],
  'wrong-app': [{}],
  'newer-version': [{}],
  'too-large': [{ detail: '200' }],
  incompatible: [{}],
  impossible: [{}],
  'complex-as-real': [{ letter: 'u' }],
  'word-root': [{ detail: 'שורש של 3', suggestion: '√3' }],
  'glued-i': [{ detail: 'zi', suggestion: 'z*i' }],
  // #2247 (ADR-CX-081) — analytic's two mixed-number sentences, and the «2 3» product question
  'mixed-number': [{ detail: '2 1/2', decimal: '2.5', sum: '2+1/2', product: '2*1/2' }, { detail: '2 1/3', sum: '2+1/3', product: '2*1/3' }],
  'juxtaposed-numbers': [{ detail: '|z| = 2 3', suggestion: '|z| = 2*3' }],
  'trig-mismatch': [{ detail: 'cos45 + i sin30', cos: '45', sin: '30' }],
  refused: Object.entries(WHY).map(([code, w]) => ({ why: { code, ...w } })),
  unaccounted: [{}],
  negation: [{ word: 'לא' }],
  'reserved-constant': [{ constant: 'i' }, { constant: 'o' }],
};

lockMessageFloor(
  'complex (errorText + whyText)',
  i18nC,
  Object.entries(COMPLEX).flatMap(([key, variants]) =>
    variants.map((p, i) => ({
      label: `${key} #${i + 1}${'why' in p ? ` (${(p.why as { code: string }).code})` : ''}`,
      render: (t: Fixed) => complexErrorText({ key, detail: 'z1 = 3+4i', ...p } as unknown as ComplexError, t),
    })),
  ),
);
