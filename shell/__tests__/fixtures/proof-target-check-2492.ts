/**
 * #2492 ([ADR-W-192](../../../docs/06w-decisions-workspace.md#adr-w-192)) — the proof-target refusal says where the claim
 * can be checked, and names only what the builder draws. The shared half of the per-builder locks.
 *
 * Operator, 2026-10-24: *"For all cases of הוכיחו we should add to the message that they can check if its true … ניתן
 * לבדוק את נכונות הטענה על ידי לחיצה על כפתור הצג צלעות וזוויות שוות."* — and his ruling the same day (ballot e19):
 * *"for non-2d tools, we tell them to check the claim in the data panel"*. The non-2-D wording is the session's
 * (ADR-W-174). The texts here are the lock's anchors; each tree renders its own refusal through its own i18n instance and
 * hands it in, because `shell/` may never import a product tree (ADR-W-016 rule 2). Test-only.
 */

/** The suite sentence every builder says first, the claim quoted (ADR-W-107's wording, ADR-W-149's guillemets). */
export const PROOF_TARGET_SENTENCE = {
  he: (claim: string) => `זו טענה להוכחה, לא נתון — הכלי משרטט את הנתונים ואינו בודק הוכחות. הקלידו רק את מה שנתון בשאלה: «${claim}»`,
  en: (claim: string) => `That is a claim to prove, not a given — this tool draws the givens; it does not check proofs. Type only what the question gives: «${claim}»`,
} as const;

/** 2-D's line: the operator's sentence, verbatim (his button's label nested from `actions.viewRelations`). */
export const RULED_2D_CHECK_HE = 'ניתן לבדוק את נכונות הטענה על ידי לחיצה על כפתור הצג צלעות וזוויות שוות.';

/** The data-panel line: the claim's QUANTITIES are asked there and compared, because the ask box does not judge a claim. */
export const PANEL_POINTER = {
  he: (panel: string, ask: string) =>
    `ניתן לבדוק את נכונות הטענה בחלונית «${panel}»: הקלידו שם כל גודל שבטענה ולחצו «${ask}», והשוו בין התשובות — למשל, עבור AB = AC שאלו על AB ועל AC.`,
  en: (panel: string, ask: string) =>
    `You can check whether the claim is true in the «${panel}» panel: type each quantity in the claim there, press «${ask}», and compare the answers — for example, for AB = AC ask for AB and for AC.`,
} as const;

/**
 * A pointer names what the builder DRAWS (docs/17 §9, "a taught remedy is a grammar claim"): the App renders the data
 * panel's heading and the ask button from the very keys the refusal reads its two names from. Faults, empty = holds.
 */
export function panelDrawnFaults(appSource: string, keys: { panel: string; ask: string }): string[] {
  const out: string[] = [];
  const call = (k: string) => String.raw`\{t\('${k.replace(/\./g, '\\.')}'\)\}`;
  if (!new RegExp(String.raw`<DataPanel\b[^>]*?\btitle=${call(keys.panel)}`, 's').test(appSource)) out.push(`the App draws no <DataPanel title={t('${keys.panel}')}>`);
  if (!new RegExp(String.raw`<AskLane\b[^>]*?\baddLabel=${call(keys.ask)}`, 's').test(appSource)) out.push(`the App draws no <AskLane addLabel={t('${keys.ask}')}>`);
  return out;
}
