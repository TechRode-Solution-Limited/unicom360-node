/**
 * Opt-in checks for SMS text, matching the gateway exactly. The SDK never runs them on its own:
 * call them to warn a user before sending.
 *
 * ```ts
 * import { gsm } from "unicom360";
 *
 * gsm.validateSms("Café 👋"); // ["non_gsm"]
 * gsm.units("a".repeat(161)); // 2
 * ```
 *
 * @module
 */

/**
 * The characters the gateway accepts: the GSM 7-bit basic set plus `^{}\[~]|€`, with no form
 * feed (the `sms_part_counter` 0.1.7 set).
 */
export const CHARSET =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
  "^{}\\[~]|€";

/** The longest message the gateway accepts, in characters. */
export const MAX_LENGTH = 1200;

/** Characters per billing unit. */
export const UNIT_LENGTH = 160;

const GSM7 = new Set(CHARSET);

/** A character outside the GSM-7 set and where it is. */
export interface NonGsmCharacter {
  /** The character (one code point; an emoji is one character). */
  char: string;
  /** Its 0-based code point index in the text (a CR LF pair counts as two here). */
  index: number;
}

/** A reason the gateway would refuse a text. */
export type GsmIssue = "empty" | "too_long" | "non_gsm";

/** Whether every character is in the gateway's GSM-7 set. An empty text is GSM-7. */
export function isGsm7(text: string): boolean {
  for (const char of text) if (!GSM7.has(char)) return false;
  return true;
}

/** The length the gateway counts: code points, with each CR LF pair counting as one. */
export function length(text: string): number {
  let count = 0;
  let previous = "";
  for (const char of text) {
    if (!(char === "\n" && previous === "\r")) count++;
    previous = char;
  }
  return count;
}

/**
 * The billing units per recipient: `max(1, ceil(length / 160))`. This is how the gateway
 * bills, not the GSM segment count.
 */
export function units(text: string): number {
  return Math.max(1, Math.ceil(length(text) / UNIT_LENGTH));
}

/** Every character outside the GSM-7 set, in order. */
export function nonGsmCharacters(text: string): NonGsmCharacter[] {
  const found: NonGsmCharacter[] = [];
  let index = 0;
  for (const char of text) {
    if (!GSM7.has(char)) found.push({ char, index });
    index++;
  }
  return found;
}

/**
 * The reasons the gateway would refuse this text, in this order: `empty` (empty, or only
 * spaces, tabs, CR and LF), `too_long` (over 1,200 characters), `non_gsm`. An empty list means
 * the gateway would accept it.
 */
export function validateSms(text: string): GsmIssue[] {
  const issues: GsmIssue[] = [];
  if (/^[ \t\n\r]*$/.test(text)) issues.push("empty");
  if (length(text) > MAX_LENGTH) issues.push("too_long");
  if (!isGsm7(text)) issues.push("non_gsm");
  return issues;
}
