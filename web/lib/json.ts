// JSON transport that keeps bigints (UserOperation gas fields, public keys) intact.
export function stringify(value: unknown) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? { $big: v.toString() } : v));
}

export function parse<T = unknown>(text: string): T {
  return JSON.parse(text, (_k, v) => (v && typeof v === 'object' && typeof v.$big === 'string' ? BigInt(v.$big) : v));
}
