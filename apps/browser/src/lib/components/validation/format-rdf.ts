import { n3FormatFor, type ContentType } from './detect-content-type.js';

export type FormatOutcome =
  | { kind: 'ok'; text: string }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

/**
 * Pretty-print RDF in the editor. JSON-LD uses JSON.stringify; the Turtle
 * family round-trips through the `n3` parser/writer. RDF/XML is not supported
 * (no common pure-JS formatter) — returns `unsupported`.
 */
export async function formatRdf(
  text: string,
  contentType: ContentType,
): Promise<FormatOutcome> {
  if (!text.trim()) return { kind: 'ok', text };

  if (contentType === 'application/ld+json') {
    try {
      return { kind: 'ok', text: JSON.stringify(JSON.parse(text), null, 2) };
    } catch (error) {
      return {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const inputFormat = n3FormatFor(contentType);
  if (!inputFormat) return { kind: 'unsupported' };
  // N-Triples / N-Quads are hard to read at a glance; upgrade the writer to
  // Turtle / TriG so CURIEs and multi-object blocks collapse nicely.
  const outputFormat = inputFormat.startsWith('N-Quads')
    ? 'TriG'
    : inputFormat.startsWith('N-')
      ? 'Turtle'
      : inputFormat;

  try {
    const { Parser, Writer } = await import('n3');
    const parser = new Parser({ format: inputFormat });
    // Use the synchronous form — `parse(text)` returns an array immediately,
    // whereas `parse(text, callback)` fires the callback asynchronously and
    // the caller sees an empty quad set.
    const quads = parser.parse(text);
    const prefixes =
      (parser as unknown as { _prefixes?: Record<string, string> })._prefixes ??
      {};
    const writer = new Writer({ format: outputFormat, prefixes });
    writer.addQuads(quads);
    return await new Promise<FormatOutcome>((resolve) => {
      writer.end((error, result) => {
        if (error) {
          resolve({ kind: 'error', message: error.message });
          return;
        }
        resolve({ kind: 'ok', text: result });
      });
    });
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
