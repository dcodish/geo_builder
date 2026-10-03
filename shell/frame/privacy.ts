/**
 * THE PRIVACY NOTE IS A DECLARATION, NOT FREE TEXT (#1426, ADR-W-090).
 *
 * The About modal's privacy note (NFR-SE-3) used to be a bare string. Nothing tied it to what the
 * product actually wires, so when analytic gained a server usage log (#1243) the code "inherited the
 * posture" and the note kept telling students «המשפטים שאתם מקלידים נשמרים בדפדפן שלכם» — false for
 * five days in production. The words are code-reviewed prose; the sinks are code. Only a
 * declaration that NAMES the sinks can be checked against the code.
 *
 * So a product hands the frame its note together with the list of places a student's input can
 * leave the browser for. `shell/__tests__/fixtures/privacy-disclosure-rows.ts` checks that list
 * against the product's real wiring (docs/28 §5c): wiring a sink you did not declare fails, and so
 * does declaring one you do not have.
 *
 * The wording stays the product's own (ADR-W-016 rule 2): this module holds no strings and knows
 * no product.
 */

/**
 * Every place a student's input can leave the browser for. Extending this list is a privacy
 * decision: the checker's endpoint table (`SINK_OF_ENDPOINT`) must learn the new sink in the
 * same change, or every product that reaches it fails its lock.
 *
 * - `usage-log` — the server's usage-event log (typed statements, kept up to the server's retention window — 30 days — anonymous id);
 * - `llm`       — the model fallback: a statement the local parser did not understand is sent,
 *                 through our proxy, to an external AI service;
 * - `share-store` — «העתק קישור»: the figure and its picture are stored on the server.
 */
export const DATA_SINKS = ['usage-log', 'llm', 'share-store'] as const;
export type DataSink = (typeof DATA_SINKS)[number];

export interface PrivacyDeclaration {
  /** The note as the student reads it, already translated by the product's own i18n. */
  text: string;
  /** Every sink the product wires. The note's text must describe each of them. */
  discloses: ReadonlyArray<DataSink>;
}
