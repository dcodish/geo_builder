import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { derive } from './engine/model';
import { GaussPlane } from './render/GaussPlane';
import { useComplexStore, type InputError } from './store/useComplexStore';

const EXAMPLE_LINES = ['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2', 'z^5 = w^2'];

// The symbol palette (operator request 2026-08-15): wrapping symbols enclose the current
// selection; plain symbols insert at the cursor. Everything inserted parses (locked by tests).
const SYMBOLS: { label: string; titleKey: string; before: string; after?: string }[] = [
  { label: 'z̄', titleKey: 'symConj', before: 'conj(', after: ')' },
  { label: '|z|', titleKey: 'symAbs', before: '|', after: '|' },
  { label: '1/z', titleKey: 'symInv', before: '1/(', after: ')' },
  { label: 'Re', titleKey: 'symRe', before: 're(', after: ')' },
  { label: 'Im', titleKey: 'symIm', before: 'im(', after: ')' },
  { label: 'cis', titleKey: 'symCis', before: 'cis ' },
  { label: 'i', titleKey: 'symI', before: 'i' },
  { label: '°', titleKey: 'symDeg', before: '°' },
  { label: 'xⁿ', titleKey: 'symPow', before: '^' },
  { label: '·', titleKey: 'symMul', before: '*' },
  { label: 'θ', titleKey: 'symTheta', before: 'θ' },
  { label: 'α', titleKey: 'symAlpha', before: 'α' },
  { label: 'β', titleKey: 'symBeta', before: 'β' },
];

const ERROR_KEY: Record<InputError['key'], string> = {
  'not-handled': 'errNotHandled',
  'parse-error': 'errParse',
  'duplicate-name': 'errDuplicate',
};

export function App() {
  const { t, i18n } = useTranslation();
  const {
    facts,
    freePos,
    seed,
    view,
    lastError,
    addLine,
    removeFact,
    setFree,
    setView,
    nextConfig,
    clearAll,
  } = useComplexStore();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const insertSymbol = (before: string, after = '') => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? start;
    const sel = input.slice(start, end);
    setInput(input.slice(0, start) + before + sel + after + input.slice(end));
    const caret = start + before.length + sel.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  const scene = useMemo(() => derive(facts, freePos, seed), [facts, freePos, seed]);

  const submit = () => {
    if (input.trim() === '') return;
    if (addLine(input)) setInput('');
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="header-actions">
          <button onClick={nextConfig}>{t('anotherConfig')}</button>
          <button onClick={() => setView(view === 'cart' ? 'polar' : 'cart')}>
            {view === 'cart' ? t('viewPolar') : t('viewCart')}
          </button>
          <button onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}>
            {t('language')}
          </button>
        </div>
      </header>
      <main>
        <section className="panel">
          <div className="input-row">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('inputPlaceholder')}
              dir="ltr"
            />
            <button onClick={submit}>{t('add')}</button>
          </div>
          <div className="symbols" dir="ltr">
            {SYMBOLS.map((s) => (
              <button
                key={s.titleKey}
                className="sym"
                title={t(s.titleKey)}
                onClick={() => insertSymbol(s.before, s.after)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {lastError && (
            <p className="error" role="alert">
              {t(ERROR_KEY[lastError.key], { detail: lastError.detail })}
            </p>
          )}
          <div className="panel-actions">
            <button onClick={() => EXAMPLE_LINES.forEach((l) => addLine(l))}>{t('example')}</button>
            <button onClick={clearAll}>{t('clearAll')}</button>
            <span className="count">{t('factCount', { count: facts.length })}</span>
          </div>
          <ul className="facts">
            {facts.length === 0 && <li className="hint">{t('emptyHint')}</li>}
            {facts.map((f) => (
              <li key={f.id} className={scene.errors[f.id] ? 'fact err' : 'fact'}>
                <code dir="ltr">{f.src}</code>
                {f.kind === 'free' && (
                  <span className="badge">{t(f.implicit ? 'implicitLabel' : 'freeLabel')}</span>
                )}
                {scene.checks[f.id] && (
                  <span
                    className={scene.checks[f.id].ok ? 'check ok' : 'check bad'}
                    title={t(
                      scene.checks[f.id].driven
                        ? 'relDriven'
                        : scene.checks[f.id].ok
                          ? 'relOk'
                          : 'relBad',
                    )}
                  >
                    {scene.checks[f.id].ok ? '✓' : '✗'}
                  </span>
                )}
                {scene.errors[f.id] && (
                  <span className="fact-error">
                    {t(
                      scene.errors[f.id].key === 'unknown-ref' ? 'errUnknownRef' : 'errRootsOfZero',
                      { detail: scene.errors[f.id].detail },
                    )}
                  </span>
                )}
                <button className="del" onClick={() => removeFact(f.id)} aria-label="delete">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="canvas">
          <GaussPlane scene={scene} view={view} onDragFree={setFree} />
        </section>
      </main>
    </div>
  );
}
