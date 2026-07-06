/**
 * The 3-D tool's shell (docs/20 §6.6) — V0 minimal: input → parse → fact list →
 * derived figure on the orbitable canvas. RTL Hebrew default. A deliberate
 * rewrite-following-the-template of the 2-D App (pattern-copy, no imports from
 * src/ — docs/20 §12 rule 1).
 */

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Figure3 from './render/Figure3';
import { deserializeFigure3, serializeFigure3 } from './store/figureFile3';
import { derive3, redo3, undo3, useGeo3, type FactStatus3, type StoreError3 } from './store/store3';

function errorText(t: (k: string, o?: Record<string, unknown>) => string, err: StoreError3): string | null {
  if (!err) return null;
  switch (err.code) {
    case 'not-understood':
      return t('err.notUnderstood');
    case 'bad-file':
      return t('err.badFile');
    case 'newer-schema':
      return t('err.newerSchema');
    case 'already-defined':
      return t('err.alreadyDefined', { id: err.id });
    case 'unknown-point':
      return t('err.unknownPoint', { id: err.id });
    case 'unknown-vector':
      return t('err.unknownVector', { id: err.id });
    case 'unknown-plane':
      return t('err.unknownPlane', { id: err.id });
    case 'unknown-line':
      return t('err.unknownLine', { id: err.id });
    case 'bad-solid':
      return t('err.badSolid');
    case 'two-params':
      return t('err.twoParams');
    case 'no-roots':
      return t('err.noRoots');
    case 'not-on-plane':
      return t('err.notOnPlane', { id: err.id });
    case 'not-on-line':
      return t('err.notOnLine', { id: err.id });
    case 'line-misses-plane':
      return t('err.lineMissesPlane', { id: err.id });
    case 'symbolic-new-point':
      return t('err.symbolicNewPoint', { id: err.id });
    case 'injection-unsatisfiable':
      return t('err.injectionUnsatisfiable');
    case 'sign-unsatisfiable':
      return t('err.signUnsatisfiable', { id: err.id });
    case 'size-on-solid':
      return t('err.sizeOnSolid');
    case 'bad-name':
      return t('err.badName');
    case 'need-basis':
      return t('err.needBasis');
    case 'no-solution':
      return t('err.noSolution', { id: err.id });
    case 'not-on-segment':
      return t('err.notOnSegment', { id: err.id });
    case 'claim-refuted':
      return t('err.claimRefuted');
  }
}

const EXAMPLE_KEYS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8'] as const;

export default function App3() {
  const { t } = useTranslation();
  const facts = useGeo3((s) => s.facts);
  const seed = useGeo3((s) => s.seed);
  const lastError = useGeo3((s) => s.lastError);
  const submit = useGeo3((s) => s.submit);
  const toggle = useGeo3((s) => s.toggle);
  const remove = useGeo3((s) => s.remove);
  const clear = useGeo3((s) => s.clear);
  const resample = useGeo3((s) => s.resample);
  const loadFigure = useGeo3((s) => s.loadFigure);
  const reportLoadError = useGeo3((s) => s.reportLoadError);

  const [text, setText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const derived = useMemo(() => derive3(facts, seed), [facts, seed]);

  const onSaveFile = () => {
    const blob = new Blob([serializeFigure3(facts, seed)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `figure-3d-${new Date().toISOString().slice(0, 10)}.geo3.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onLoadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-loading the same file
    if (!f) return;
    const r = deserializeFigure3(await f.text());
    if (r.ok) loadFigure(r.facts, r.seed);
    else reportLoadError(r.reason);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    submit(text);
    // clear the box only when the input was accepted
    const err = useGeo3.getState().lastError;
    if (!err) setText('');
  };

  const statusDot = (st: FactStatus3 | undefined) => {
    if (st === 'ok') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
    if (st === 'disabled') return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />;
    return <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title={t('status.inactive')} />;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-xl font-bold">
          {t('title')} <span className="ms-2 align-middle text-xs font-normal text-slate-400">{t('tagline')}</span>
        </h1>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-5 md:flex-row">
        {/* Input + fact list */}
        <section className="flex w-full flex-col gap-3 md:w-96">
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('input.placeholder')}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-sky-500 focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700">
              {t('input.add')}
            </button>
          </form>

          {lastError && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {errorText(t, lastError)}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setText(t(`examples.${k}`))}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-sky-400 hover:text-sky-700"
              >
                {t(`examples.${k}`)}
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-1.5" data-testid="fact-list">
            {facts.length === 0 && <li className="py-2 text-sm text-slate-400">{t('facts.empty')}</li>}
            {facts.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={() => toggle(f.id)}
                  title={t('facts.toggleTitle')}
                  className="accent-sky-600"
                />
                {f.cmds.some((c) => c.type === 'claim') && derived.status[f.id] === 'ok' ? (
                  <span className="text-xs font-bold text-emerald-600" title={t('facts.claimVerified')}>
                    ✓
                  </span>
                ) : (
                  statusDot(derived.status[f.id])
                )}
                <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                  {f.utterance}
                </span>
                <button
                  type="button"
                  aria-label={t('facts.delete')}
                  title={t('facts.delete')}
                  onClick={() => remove(f.id)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Canvas + view/session controls */}
        <section className="flex flex-1 flex-col gap-2">
          <Figure3 construction={derived.construction} resolved={derived.resolved} resetLabel={t('actions.resetView')} />
          <p className="text-xs text-slate-400">{t('hint.orbit')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resample} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.another')}
            </button>
            <button type="button" onClick={undo3} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.undo')}
            </button>
            <button type="button" onClick={redo3} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.redo')}
            </button>
            <button type="button" onClick={clear} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
              {t('actions.clear')}
            </button>
            <span className="mx-1 self-center text-slate-300">|</span>
            <button
              type="button"
              onClick={onSaveFile}
              disabled={facts.length === 0}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40"
            >
              {t('actions.save')}
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              {t('actions.load')}
            </button>
            <input ref={fileInput} type="file" accept=".geo3.json,application/json,.json" className="hidden" onChange={onLoadFile} />
          </div>
        </section>
      </main>
    </div>
  );
}
