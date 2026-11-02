/**
 * An open string enum: the listed values autocomplete, and any other string the gateway sends
 * is accepted and passed through.
 */
export type OpenEnum<T extends string> = T | (string & Record<never, never>);

const nonDigits = /[^0-9]/g;

/**
 * @internal The first item whose number has the same digits as `number`, after removing every
 * non-digit from both; when `number` has no digits, an exact string match.
 */
export function findByNumber<T>(
  items: readonly T[],
  numberOf: (item: T) => string | null,
  number: string,
): T | null {
  const wanted = number.replace(nonDigits, "");
  const found = items.find((item) => {
    const value = numberOf(item);
    return wanted === "" ? value === number : (value ?? "").replace(nonDigits, "") === wanted;
  });
  return found ?? null;
}
