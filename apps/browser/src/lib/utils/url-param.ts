/**
 * Minimally percent-encode a URL so it can be safely embedded as a query
 * parameter value, while keeping the URL human-readable.
 *
 * Encodes only the characters that would otherwise break the surrounding URL:
 * `%` (to prevent double-decoding), `#` (fragment), `&` (param separator),
 * `?`, `+` (decoded as space by URLSearchParams), and the space character.
 * Other characters – including `:` and `/` – are left intact.
 */
export function encodeUrlParam(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/&/g, '%26')
    .replace(/\?/g, '%3F')
    .replace(/\+/g, '%2B')
    .replace(/ /g, '%20');
}
