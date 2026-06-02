// psl 1.15.0 ships its own type declarations, but its package.json `exports`
// map has no `types` condition, so under `moduleResolution: nodenext`
// TypeScript can’t resolve them (TS7016). The `@types/psl` package is now a
// deprecated empty stub. Until psl fixes its `exports` map upstream, declare the
// small surface we use here. See https://github.com/lupomontero/psl/issues.
declare module 'psl' {
  export interface ParsedDomain {
    input: string;
    tld: string | null;
    sld: string | null;
    domain: string | null;
    subdomain: string | null;
    listed: boolean;
    error?: { code: string; message: string };
  }

  export function parse(input: string): ParsedDomain;
  export function get(domain: string): string | null;
  export function isValid(domain: string): boolean;
}
