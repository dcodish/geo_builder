/**
 * The 2-D builder's privacy DECLARATION (NFR-SE-3, #1426, ADR-W-090).
 *
 * `discloses` names every place a student's input can leave the browser for; the §5c lock
 * (`src/__tests__/privacy-disclosure-1426.test.ts`) holds it to the sinks this build really reaches,
 * so wiring a new one without updating the note fails the suite. The wording is `about.privacy`.
 */
import type { DataSink, PrivacyDeclaration } from '../../shell/frame/privacy';

/** The server usage log (`debug/sessionLog`), the model fallback (`parser/llm`), the share store. */
export const PRIVACY_DISCLOSES: ReadonlyArray<DataSink> = ['usage-log', 'llm', 'share-store'];

export function privacyDeclaration(t: (key: string) => string): PrivacyDeclaration {
  return { text: t('about.privacy'), discloses: PRIVACY_DISCLOSES };
}
