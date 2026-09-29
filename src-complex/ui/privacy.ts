/**
 * The complex builder's privacy DECLARATION (NFR-SE-3, #1426, ADR-W-090).
 *
 * `discloses` names every place a student's input can leave the browser for; the §5c lock
 * (`src-complex/__tests__/privacy-disclosure-1426.test.ts`) holds it to the sinks this build really
 * reaches. Complex has no usage log and no model fallback today — only «העתק קישור» stores anything
 * on the server. When its usage emitter lands (#1243's remainder), the lock fails until this list
 * and the note both say so. The wording is `privacy`.
 */
import type { DataSink, PrivacyDeclaration } from '../../shell/frame/privacy';

/** The server usage log (`debug/sessionLogComplex`, #1243) and the share store. */
export const PRIVACY_DISCLOSES: ReadonlyArray<DataSink> = ['usage-log', 'share-store'];

export function privacyDeclaration(t: (key: string) => string): PrivacyDeclaration {
  return { text: t('privacy'), discloses: PRIVACY_DISCLOSES };
}
