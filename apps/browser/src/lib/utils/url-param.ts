/**
 * Minimally percent-encode a URL so it can be safely embedded as a query
 * parameter value, while keeping the URL human-readable.
 *
 * Only escapes characters that would otherwise break parsing of the
 * surrounding URL: `#` (would start a fragment), `&` (would split the query
 * into another parameter), `+` (decoded as space by URLSearchParams), and
 * the space character. `?`, `:`, `/`, and `=` are left intact.
 */
export function encodeUrlParam(value: string): string {
  return value
    .replace(/#/g, '%23')
    .replace(/&/g, '%26')
    .replace(/\+/g, '%2B')
    .replace(/ /g, '%20');
}
