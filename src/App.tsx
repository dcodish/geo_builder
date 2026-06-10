/**
 * App shell (Phase 3) — the usable build loop, driven by the store.
 *
 * The fact list is the source of truth; the figure is derived by replaying the
 * enabled facts (see store `replay`). Each fact can be selected (highlighted on
 * the canvas), deselected (kept but turned off — the figure re-derives, and any
 * fact depending on it auto-drops), or deleted. A text input is present but
 * disabled — the parser is Phase 4; until then a row of "quick facts" drives the
 * same pipeline. i18n is wired with Hebrew default and RTL. Old UI lives in
 * /archive for reference.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { COMMAND_CATALOG, parse } from '@/parser';
import { Figure } from '@/render';
import { introducedIds, replay, useGeoStore } from '@/store/geoStore';

export default function App() {
  const { t, i18n } = useTranslation();
  const facts = useGeoStore((s) => s.facts);
  const selectedId = useGeoStore((s) => s.selectedId);
  const execute = useGeoStore((s) => s.execute);
  const toggle = useGeoStore((s) => s.toggle);
  const remove = useGeoStore((s) => s.remove);
  const select = useGeoStore((s) => s.select);
  const cycleAlt = useGeoStore((s) => s.cycleAlt);
  const clear = useGeoStore((s) => s.clear);

  const { undo, redo } = useGeoStore.temporal.getState();
  const canUndo = useStore(useGeoStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useGeoStore.temporal, (s) => s.futureStates.length > 0);

  const [text, setText] = useState('');
  const [notUnderstood, setNotUnderstood] = useState(false);
  const [showHelp, setShowHelp] = useState(true); // visible by default so supported commands are discoverable
  const he = i18n.language === 'he';

  // The single text → command[] path: parse, then run each command through the
  // store. Out-of-grammar input shows a hint (Phase 7 will escalate to the LLM).
  function submit(utterance: string) {
    const r = parse(utterance);
    if (!r.ok) {
      setNotUnderstood(true);
      return;
    }
    setNotUnderstood(false);
    r.commands.forEach((c) => execute(c, utterance));
    setText('');
  }

  // Figure + per-fact status are derived from the fact list.
  const { construction, positions, status, lastError } = useMemo(() => replay(facts), [facts]);

  // Highlight the objects introduced by the selected fact.
  const highlight = useMemo(() => {
    const f = facts.find((x) => x.id === selectedId);
    return f ? new Set(introducedIds(f.cmd)) : undefined;
  }, [facts, selectedId]);

  useEffect(() => {
    document.documentElement.dir = i18n.dir();
    document.documentElement.lang = i18n.language;
  }, [i18n, i18n.language]);

  const branchId = construction.objects.find((o) => o.kind === 'intersection' || o.kind === 'on-seg-angle')?.id;
  const examples = t('examples.items', { returnObjects: true }) as string[];

  return (
    <div style={page}>
      <header style={headerRow}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('app.title')}</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>{t('app.subtitle')}</p>
        </div>
        <button type="button" style={ghost} onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}>
          {t('actions.language')}
        </button>
      </header>

      <div style={main}>
        <Figure construction={construction} positions={positions} width={560} height={560} highlight={highlight} />

        <aside style={sidebar}>
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) submit(text);
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={input}
                placeholder={t('input.placeholder')}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (notUnderstood) setNotUnderstood(false);
                }}
                autoFocus
              />
              <button type="submit" style={sendBtn} disabled={!text.trim()}>
                {t('input.send')}
              </button>
            </div>
            {notUnderstood && <span style={{ fontSize: 12, color: '#b45309' }}>{t('input.notUnderstood')}</span>}
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0 }}
            >
              {showHelp ? t('help.hide') : t('help.show')}
            </button>
          </form>

          {showHelp && (
            <div style={helpPanel}>
              <div style={sectionLabel}>{t('help.title')}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {COMMAND_CATALOG.filter((c) => c.supported).map((c) => (
                  <li key={c.en} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button type="button" style={helpExample} onClick={() => submit(he ? c.he : c.en)} dir="auto">
                      {he ? c.he : c.en}
                    </button>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{he ? c.descHe : c.descEn}</span>
                  </li>
                ))}
              </ul>
              <div style={{ ...sectionLabel, marginTop: 10 }}>{t('help.comingSoon')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {COMMAND_CATALOG.filter((c) => !c.supported).map((c) => (
                  <span key={c.en} style={comingSoon} dir="auto">{he ? c.he : c.en}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={sectionLabel}>{t('examples.heading')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {examples.map((ex) => (
                <button key={ex} type="button" style={chip} onClick={() => submit(ex)} dir="auto">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {lastError && <div style={errorBanner}>⚠ {lastError}</div>}

          <div>
            <div style={sectionLabel}>{t('steps.title')}</div>
            {facts.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{t('steps.empty')}</p>
            ) : (
              <ul style={stepList}>
                {facts.map((f) => {
                  const st = status[f.id];
                  const state = !f.enabled ? 'disabled' : st === 'ok' ? 'ok' : 'broken';
                  return (
                    <li key={f.id} style={factRow(state, f.id === selectedId)}>
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        title={t('actions.toggle')}
                        onChange={() => toggle(f.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <button type="button" style={factLabel(state)} onClick={() => select(f.id)} title={typeof st === 'string' && state === 'broken' ? st : undefined}>
                        {f.utterance ?? f.cmd.type}
                      </button>
                      <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>
                        {state === 'ok' ? <span style={{ color: '#16a34a' }}>✓</span> : state === 'broken' ? <span style={{ color: '#dc2626' }}>✗</span> : <span style={{ color: '#94a3b8' }}>○</span>}
                      </span>
                      <button type="button" style={del} title={t('actions.delete')} onClick={() => remove(f.id)}>
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={ghost} disabled={!canUndo} onClick={() => undo()}>{t('actions.undo')}</button>
            <button type="button" style={ghost} disabled={!canRedo} onClick={() => redo()}>{t('actions.redo')}</button>
            <button type="button" style={ghost} onClick={clear}>{t('actions.clear')}</button>
          </div>

          {branchId && (
            <button type="button" style={alt} onClick={() => cycleAlt(branchId)}>{t('actions.another')}</button>
          )}
        </aside>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
  color: '#0f172a',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};
const headerRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const main: React.CSSProperties = { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' };
const sidebar: React.CSSProperties = { width: 340, display: 'flex', flexDirection: 'column', gap: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
const input: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
};
const sendBtn: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};
const chip: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  borderRadius: 999,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1e40af',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
};
const helpPanel: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  background: '#fafafa',
  padding: 12,
  maxHeight: 320,
  overflowY: 'auto',
};
const helpExample: React.CSSProperties = {
  textAlign: 'start',
  border: 'none',
  background: 'none',
  color: '#1e40af',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 13,
  padding: 0,
};
const comingSoon: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: 11,
  borderRadius: 999,
  border: '1px dashed #cbd5e1',
  color: '#94a3b8',
  fontFamily: 'ui-monospace, monospace',
};
const stepList: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const errorBanner: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#b91c1c',
};
const ghost: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
};
const del: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
};
const alt: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #7c3aed',
  background: '#7c3aed',
  color: '#fff',
  cursor: 'pointer',
};
function factRow(state: 'ok' | 'disabled' | 'broken', selected: boolean): React.CSSProperties {
  const border = selected ? '#f59e0b' : state === 'broken' ? '#fecaca' : '#e2e8f0';
  const bg = selected ? '#fffbeb' : state === 'broken' ? '#fef2f2' : '#f8fafc';
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: bg,
  };
}
function factLabel(state: 'ok' | 'disabled' | 'broken'): React.CSSProperties {
  return {
    flex: 1,
    textAlign: 'start',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    color: state === 'disabled' ? '#94a3b8' : '#0f172a',
    textDecoration: state === 'disabled' ? 'line-through' : 'none',
  };
}
