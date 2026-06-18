/// JSON replacer that renders bigints as decimal strings, so API responses are clean numeric
/// strings (no "n" suffix) that any client can parse.
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value, bigintReplacer);
}
