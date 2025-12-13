/**
 * Encode dataset URI in a path to protect it from Paraglide's URL processing.
 * Returns the path unchanged if not a dataset detail page.
 */
export function encodeDatasetPath(pathname: string): string {
  const match = pathname.match(/(\/(?:en\/)?datasets\/)(.+)$/);
  if (match && match[2].includes('://')) {
    return match[1] + encodeURIComponent(match[2]);
  }
  return pathname;
}

/**
 * Check if a path contains a dataset URI with ://
 */
export function isDatasetPathWithUri(pathname: string): boolean {
  const match = pathname.match(/^\/(?:en\/)?datasets\/.+:\/\/.+$/);
  return match !== null;
}
