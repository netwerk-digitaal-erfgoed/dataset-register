/**
 * Encode dataset URI in a path to protect it from Paraglide's URL processing.
 * Returns the path unchanged if not a dataset detail page.
 */
export function encodeDatasetPath(href: string): string {
  // Only match dataset detail pages where the path contains an embedded URI (with ://)
  // e.g., /datasets/https://example.com/ but NOT /datasets?keywords=...
  const match = href.match(
    /^((?:https?:\/\/[^/]+)?\/(?:en\/)?datasets\/)(https?:\/\/.+)$/,
  );
  if (match) {
    return match[1] + encodeURIComponent(match[2]);
  }
  return href;
}
