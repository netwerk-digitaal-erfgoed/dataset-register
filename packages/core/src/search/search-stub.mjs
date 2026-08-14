/**
 * Replaces `@lde/search` inside the bundled schema-declaration module.
 *
 * A mounted module must be importless plain data, and bundling the real package
 * would drag its CJS dependencies (`jsonld`, `rdf-canonize`) into what has to
 * stay a lean ESM file. `defineSearchType` carries all of its value in the
 * types, so at runtime it is the identity function this stub provides – the
 * declarations that come out are the same objects either way, and the images
 * re-validate them at boot regardless.
 */
export const defineSearchType = (searchType) => searchType;
