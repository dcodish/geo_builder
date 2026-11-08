/**
 * The crash boundary (#1507, ADR-W-195): an error while drawing costs a notice, never the construction.
 *
 * Without it, React 18 unmounts the whole root when a render throws: a white page, and the student's
 * only way forward is a reload. Each builder mounts this ONCE, around its app, inside its i18n
 * provider. On an error it:
 *
 *  1. shows a small notice in place of the app — a sentence, the error's text (so the next report
 *     carries it) and «שחזור»;
 *  2. rolls the session back to the last state that drew without an error (`CrashSession.rollback`,
 *     see `shell/session/crash.ts`), and the notice says when that undid the last change;
 *  3. hands the error to the builder's debug log (`onCrash`).
 *
 * «שחזור» re-mounts the app. **Nothing retries on its own**: the boundary waits for the click, so an
 * error that recurs shows the notice again rather than looping.
 *
 * Parameterized by the caller, like the rest of the frame: the session contract, the log and the
 * dev trigger are props, and the words are the suite's keys (`CRASH_KEYS`), read through the
 * caller's i18n instance from the provider it is mounted under — `shell/` holds no strings.
 */
import { Component, Fragment, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CRASH_KEYS, DEV_CRASH_MESSAGE, crashText, type CrashReport, type CrashSession, type DevCrashMode } from '../session/crash';
import { color, fs, radius } from '../theme';
import { Banner } from './Banner';

export interface CrashBoundaryProps {
  children: ReactNode;
  /** The builder's session store, so «שחזור» comes back with the last state that drew. */
  session?: CrashSession;
  /** The builder's debug log. Called once per caught error. */
  onCrash?: (report: CrashReport) => void;
  /**
   * The dev-only trigger. The caller passes `import.meta.env.DEV ? devCrashMode(location.search) : null`,
   * so a production build always passes null and never renders it.
   */
  devCrash?: DevCrashMode | null;
}

interface CrashState {
  crash: { text: string; undone: boolean } | null;
  /** Bumped by «שחזור», so the app re-mounts from scratch. */
  generation: number;
}

export class CrashBoundary extends Component<CrashBoundaryProps, CrashState> {
  state: CrashState = { crash: null, generation: 0 };

  /** The store state of the last render that COMMITTED — a render that throws never does. */
  private lastGood: { state: unknown } | null = null;

  static getDerivedStateFromError(error: unknown): Partial<CrashState> {
    return { crash: { text: crashText(error), undone: false } };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const undone = this.rollback();
    if (undone) this.setState((s) => (s.crash ? { crash: { ...s.crash, undone: true } } : null));
    try {
      this.props.onCrash?.({
        message: crashText(error),
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
        ...(info.componentStack ? { componentStack: info.componentStack } : {}),
        undone,
      });
    } catch {
      /* a log that throws must not take the notice down with it */
    }
  }

  /** Roll the session back to what last drew. A rollback that itself fails leaves the session as it is. */
  private rollback(): boolean {
    const { session } = this.props;
    if (!session || !this.lastGood) return false;
    try {
      return session.rollback(this.lastGood.state);
    } catch {
      return false;
    }
  }

  /**
   * Called by the probe after every render that committed, with the store state it drew: a stable
   * reference, so the probe's effect does not re-run for nothing.
   */
  noteCommitted = (state: unknown): void => {
    this.lastGood = { state };
  };

  /** «שחזור» — re-mount the app, once, on the student's click. */
  recover = (): void => {
    this.setState((s) => ({ crash: null, generation: s.generation + 1 }));
  };

  render(): ReactNode {
    const { crash, generation } = this.state;
    if (crash) return <CrashNotice text={crash.text} undone={crash.undone} onRecover={this.recover} />;
    const { children, session, devCrash } = this.props;
    return (
      <Fragment key={generation}>
        {children}
        {devCrash && <DevCrash mode={devCrash} session={session} />}
        {/* LAST, so its effect runs after everything above it committed */}
        {session && <CommitProbe session={session} onCommit={this.noteCommitted} />}
      </Fragment>
    );
  }
}

/**
 * Re-renders on every change of the session store, in the same pass as the app, and records the
 * state once that pass has committed. When anything in the pass throws, the pass never commits, so
 * the recorded state stays the one that last drew.
 */
function CommitProbe({ session, onCommit }: { session: CrashSession; onCommit: (state: unknown) => void }) {
  // the third argument only answers a server render (the static renders of the tests); the client reads the store
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useLayoutEffect(() => {
    onCommit(state);
  }, [state, onCommit]);
  return null;
}

/** The notice shown in place of the app. */
export function CrashNotice({ text, undone, onRecover }: { text: string; undone: boolean; onRecover: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={page}>
      <Banner kind="error">
        <p style={sentence}>{t(undone ? CRASH_KEYS.noticeUndone : CRASH_KEYS.notice)}</p>
        <p dir="ltr" style={errorLine}>
          {text}
        </p>
        <button type="button" data-crash-recover="" onClick={onRecover} style={recoverBtn}>
          {t(CRASH_KEYS.recover)}
        </button>
      </Banner>
    </div>
  );
}

/**
 * DEV ONLY (ADR-W-195): a 💥 button that crashes the drawing on purpose, so the operator can play the
 * notice. Never rendered unless the caller passes a mode, which it does only under
 * `import.meta.env.DEV`. It stays armed until the boundary has caught the throw — React retries a
 * failed render once before giving up, so a one-shot throw would be swallowed by the retry.
 */
function DevCrash({ mode, session }: { mode: DevCrashMode; session?: CrashSession }) {
  const [armedAt, setArmedAt] = useState<{ state: unknown } | null>(null);
  const read = session?.getState ?? noState;
  const state = useSyncExternalStore(session?.subscribe ?? noSubscribe, read, read);
  if (armedAt && (mode === 'now' || (session !== undefined && session.changed(armedAt.state, state)))) {
    throw new Error(DEV_CRASH_MESSAGE);
  }
  return (
    <button type="button" data-dev-crash={armedAt ? 'armed' : ''} onClick={() => setArmedAt({ state })} style={{ ...devBtn, ...(armedAt ? devArmed : null) }}>
      {armedAt ? '💣' : '💥'}
    </button>
  );
}
const noSubscribe = () => () => {};
const noState = () => null;

const page: CSSProperties = {
  maxWidth: 640,
  margin: '48px auto',
  paddingInline: 16,
  fontFamily: "system-ui, 'Segoe UI', sans-serif",
};
const sentence: CSSProperties = { margin: 0, fontSize: fs.control, lineHeight: 1.5 };
const errorLine: CSSProperties = {
  margin: '8px 0 12px',
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: fs.small,
  color: color.muted,
  overflowWrap: 'anywhere',
  textAlign: 'start',
  unicodeBidi: 'plaintext',
};
const recoverBtn: CSSProperties = {
  fontFamily: "system-ui, 'Segoe UI', sans-serif",
  lineHeight: 1.4,
  fontSize: fs.control,
  fontWeight: 600,
  padding: '6px 16px',
  border: `1px solid ${color.primary}`,
  borderRadius: radius.control,
  background: color.primary,
  color: '#ffffff',
  cursor: 'pointer',
};
const devBtn: CSSProperties = {
  position: 'fixed',
  insetBlockEnd: 12,
  insetInlineStart: 12,
  zIndex: 1000,
  fontSize: 18,
  lineHeight: 1,
  padding: 6,
  border: `1px dashed ${color.borderStrong}`,
  borderRadius: radius.control,
  background: color.surface,
  cursor: 'pointer',
  opacity: 0.6,
};
const devArmed: CSSProperties = { opacity: 1, borderColor: color.danger };
