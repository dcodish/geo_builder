/**
 * The analytic builder's privacy DECLARATION (NFR-SE-3, #1426, ADR-W-090).
 *
 * `discloses` names every place a student's input can leave the browser for; the §5c lock
 * (`src-analytic/__tests__/privacy-disclosure-1426.test.ts`) holds it to the sinks this build really
 * reaches. This is the product whose note said the statements "stay in your own browser" for five
 * days after its usage log went live (#1243/#1363) — the gap this declaration exists to close.
 * The wording is `privacy`.
 */
import type { DataSink, PrivacyDeclaration } from '../../shell/frame/privacy';

/** The server usage log (`debug/sessionLogAnalytic`), the model fallback (`parser/llmAnalytic`),
 *  the share store. */
export const PRIVACY_DISCLOSES: ReadonlyArray<DataSink> = ['usage-log', 'llm', 'share-store'];

export function privacyDeclaration(t: (key: string) => string): PrivacyDeclaration {
  return { text: t('privacy'), discloses: PRIVACY_DISCLOSES };
}
