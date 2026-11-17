// Types for the one export the management console's server imports (#2868): the spot-audit ledger write.
// The ledger is `scripts/playsheets/spot-audits.json`; see case-closure.mjs for the rule it applies.
export function recordAudit(ledger: unknown, sheetName: string, id: string, pass: boolean, date: string, note?: string): unknown;
