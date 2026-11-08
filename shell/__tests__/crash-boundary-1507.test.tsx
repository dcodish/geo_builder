/**
 * #1507 (ADR-W-195) — the crash boundary and its rollback, as units.
 *
 * `shell/session/crash.ts` is pure and is called here. The boundary is a React class; the repo's tests
 * have no DOM renderer and a static render has no error boundaries, so its lifecycle is driven the way
 * React drives it (the shared rows' `crashInsideChild`: a child throws inside the boundary's own render
 * output, then `getDerivedStateFromError` and `componentDidCatch`). Each builder's REAL wiring runs the
 * shared rows in its own tree (`session-offer-1238.test.ts`); the meta-lock is beside this file.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { temporal } from 'zundo';
import { CrashBoundary, CrashNotice } from '../frame/CrashBoundary';
import { CRASH_KEYS, DEV_CRASH_MESSAGE, crashSessionOf, crashText, devCrashMode, sliceChanged } from '../session/crash';
import { createProductI18n } from '../i18n';
import suiteHe from '../locales/he.json';
import suiteEn from '../locales/en.json';
import { crashInsideChild } from './fixtures/crash-recovery-rows';

interface S {
  lines: string[];
  seed: number;
  name: string;
  error: string | null;
  selected: string | null;
}

/** A store shaped like every builder's: zustand + zundo, undo tracking lines and seed. */
function storeOf() {
  return create<S>()(
    temporal(() => ({ lines: [], seed: 0, name: '', error: null, selected: null }) as S, {
      partialize: (s) => ({ lines: s.lines, seed: s.seed }) as S,
      equality: (a, b) => a.lines === b.lines && a.seed === b.seed,
    }),
  );
}

describe('crashText — what the notice and the log show of the error', () => {
  it('names the error and its message', () => {
    expect(crashText(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe("TypeError: Cannot read properties of undefined (reading 'x')");
  });
  it('reads a thrown non-Error, and never throws itself', () => {
    expect(crashText('boom')).toBe('boom');
    const hostile = { toString: () => { throw new Error('no'); } };
    expect(crashText(hostile)).toBe('Error');
  });
  it('is bounded — a page-long message does not become a page-long notice', () => {
    const t = crashText(new Error('x'.repeat(5000)));
    expect(t.length).toBeLessThanOrEqual(300);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('devCrashMode — the DEV-only trigger flag (the caller gates it on import.meta.env.DEV)', () => {
  it('reads ?crash as «crash now» and ?crash=next as «crash on the next change»', () => {
    expect(devCrashMode('?crash')).toBe('now');
    expect(devCrashMode('?crash=now')).toBe('now');
    expect(devCrashMode('?crash=next')).toBe('next');
    expect(devCrashMode('?a=1&crash=next')).toBe('next');
  });
  it('is off without the flag', () => {
    expect(devCrashMode('')).toBeNull();
    expect(devCrashMode('?steps')).toBeNull();
  });
});

describe('crashSessionOf — the one rollback', () => {
  it('sliceChanged compares the slice by reference, and only the slice', () => {
    const a = { lines: ['x'], seed: 0, name: '', error: null, selected: null } as S;
    expect(sliceChanged(['lines', 'seed'], a, { ...a, selected: 'p' })).toBe(false);
    expect(sliceChanged(['lines', 'seed'], a, { ...a, lines: ['x'] })).toBe(true);
  });

  it('a rollback to the state on screen does nothing and writes nothing', () => {
    const store = storeOf();
    const persist = vi.fn();
    const s = crashSessionOf(store, { slice: ['lines', 'seed', 'name'], persist });
    store.setState({ lines: ['a'] });
    const past = store.temporal.getState().pastStates.length;
    expect(s.rollback(store.getState())).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(store.temporal.getState().pastStates.length).toBe(past);
  });

  it('a crash one step past the last good state steps BACK through the history: the failing step is on the redo side', () => {
    const store = storeOf();
    const persist = vi.fn();
    const s = crashSessionOf(store, { slice: ['lines', 'seed', 'name'], clear: { error: null }, persist });
    store.setState({ lines: ['a'] });
    const good = store.getState();
    store.setState({ lines: ['a', 'b'], error: 'about b' });
    expect(s.rollback(good)).toBe(true);
    expect(store.getState().lines).toBe(good.lines);
    expect(store.getState().error, 'what the builder’s own undo clears, the rollback clears').toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    const h = store.temporal.getState();
    expect(h.pastStates.map((p) => p.lines)).toEqual([[]]);
    expect(h.futureStates.map((p) => p.lines)).toEqual([['a', 'b']]);
  });

  it('a field the undo history does not track (a name) is put back without a history entry', () => {
    const store = storeOf();
    const s = crashSessionOf(store, { slice: ['lines', 'seed', 'name'], persist: () => {} });
    store.setState({ lines: ['a'] });
    const good = store.getState();
    store.setState({ name: 'broken' });
    const past = store.temporal.getState().pastStates.length;
    expect(s.rollback(good)).toBe(true);
    expect(store.getState().name).toBe('');
    expect(store.temporal.getState().pastStates.length).toBe(past);
  });

  it('when the history does not hold the step (a load cleared it), the slice is set directly', () => {
    const store = storeOf();
    const s = crashSessionOf(store, { slice: ['lines', 'seed', 'name'], persist: () => {} });
    store.setState({ lines: ['a'] });
    const good = store.getState();
    store.temporal.getState().clear();
    store.setState({ lines: ['other'], seed: 3 });
    expect(s.rollback(good)).toBe(true);
    expect(store.getState().lines).toBe(good.lines);
    expect(store.getState().seed).toBe(0);
  });
});

describe('CrashBoundary — the lifecycle React runs', () => {
  const Broken = () => {
    throw new Error('drawing failed');
  };
  function boundary(props: Partial<ConstructorParameters<typeof CrashBoundary>[0]> = {}) {
    const b = new CrashBoundary({ children: createElement(Broken), ...props });
    b.setState = ((u: unknown) => {
      const patch = typeof u === 'function' ? (u as (s: CrashBoundary['state']) => unknown)(b.state) : u;
      if (patch) b.state = { ...b.state, ...(patch as object) };
    }) as CrashBoundary['setState'];
    return b;
  }

  it('the error a CHILD throws while rendering is the one the boundary holds, logs and shows', () => {
    const onCrash = vi.fn();
    const b = boundary({ onCrash });
    const thrown = crashInsideChild(b);
    expect((thrown as Error).message).toBe('drawing failed');
    expect(b.state.crash).toEqual({ text: 'Error: drawing failed', undone: false });
    expect(onCrash).toHaveBeenCalledTimes(1);
    expect(onCrash.mock.calls[0][0]).toMatchObject({ message: 'Error: drawing failed', undone: false, componentStack: expect.any(String) });
    expect(onCrash.mock.calls[0][0].stack).toContain('drawing failed');
  });

  it('with no render committed yet there is no last good state, so nothing is rolled back', () => {
    const rollback = vi.fn(() => true);
    const b = boundary({ session: { subscribe: () => () => {}, getState: () => 1, changed: () => true, rollback } });
    crashInsideChild(b);
    expect(rollback).not.toHaveBeenCalled();
    expect(b.state.crash?.undone).toBe(false);
  });

  it('rolls back to the state the last COMMITTED render drew, and the notice says the change was undone', () => {
    const rollback = vi.fn(() => true);
    const b = boundary({ session: { subscribe: () => () => {}, getState: () => 'now', changed: () => true, rollback } });
    b.noteCommitted('drew');
    crashInsideChild(b);
    expect(rollback).toHaveBeenCalledWith('drew');
    expect(b.state.crash?.undone).toBe(true);
  });

  it('a rollback or a log that throws costs neither the notice nor the other', () => {
    const onCrash = vi.fn(() => {
      throw new Error('log down');
    });
    const b = boundary({
      onCrash,
      session: { subscribe: () => () => {}, getState: () => 0, changed: () => true, rollback: () => { throw new Error('store down'); } },
    });
    b.noteCommitted(0);
    expect(() => crashInsideChild(b)).not.toThrow();
    expect(b.state.crash).toEqual({ text: 'Error: drawing failed', undone: false });
    expect(onCrash).toHaveBeenCalledTimes(1);
  });

  it('never retries on its own: the notice stays until «שחזור», which re-mounts the app once', () => {
    const b = boundary();
    crashInsideChild(b);
    for (let i = 0; i < 3; i++) expect((b.render() as { type: unknown }).type).toBe(CrashNotice);
    b.recover();
    expect(b.state).toMatchObject({ crash: null, generation: 1 });
    const out = b.render() as { key: string | null; props: { children: unknown[] } };
    expect(out.key, 'a new key re-mounts the app from scratch').toBe('1');
    // a child that throws again is caught again — a second notice, never a loop
    crashInsideChild(b);
    expect((b.render() as { type: unknown }).type).toBe(CrashNotice);
  });

  it('the dev trigger is rendered only when the caller passes a mode, and throws the dev message once armed', () => {
    const plain = boundary({ children: null });
    expect(renderToStaticMarkup(createElement('div', null, plain.render()))).not.toContain('data-dev-crash');
    const dev = boundary({ children: null, devCrash: 'now' });
    expect(renderToStaticMarkup(createElement('div', null, dev.render()))).toContain('data-dev-crash');
    expect(DEV_CRASH_MESSAGE).toMatch(/dev-only \?crash/);
  });
});

describe('CrashNotice — the words are the suite’s, in both languages', () => {
  const i18n = createProductI18n({ resources: { he: suiteHe, en: suiteEn } });
  const render = (undone: boolean) =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <CrashNotice text="TypeError: x is undefined" undone={undone} onRecover={() => {}} />
      </I18nextProvider>,
    );

  it('every key exists in he and en', () => {
    for (const lng of ['he', 'en'] as const) for (const k of Object.values(CRASH_KEYS)) expect(i18n.exists(k, { lng }), `${lng}:${k}`).toBe(true);
  });

  it('shows the sentence, the error text (left-to-right) and «שחזור»', async () => {
    await i18n.changeLanguage('he');
    const html = render(false);
    expect(html).toContain(i18n.t(CRASH_KEYS.notice));
    expect(html).toContain('<p dir="ltr"');
    expect(html).toContain('TypeError: x is undefined');
    expect(html).toContain('>שחזור</button>');
    expect(html).toContain('role="alert"');
  });

  it('says the last change was undone when it was', async () => {
    await i18n.changeLanguage('he');
    expect(render(true)).toContain(i18n.t(CRASH_KEYS.noticeUndone));
    await i18n.changeLanguage('en');
    expect(render(true)).toContain('so that change was undone');
    expect(render(false)).toContain('>Restore</button>');
  });
});
