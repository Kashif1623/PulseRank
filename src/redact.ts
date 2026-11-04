/**
 * Hides provider API keys before text reaches logs, traces or error messages.
 * Alchemy puts the key in the URL path: https://<net>.g.alchemy.com/v2/<KEY>
 */
const ALCHEMY_KEY_IN_URL = /(\.g\.alchemy\.com\/v2\/)[A-Za-z0-9_-]+/gi;

export function redactSecrets(text: string): string {
  return text.replace(ALCHEMY_KEY_IN_URL, '$1***');
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}
