import { describe, expect, it } from 'vitest';
import { Parser } from 'sparqljs';
import { sparqlPluginExamples } from './sparql-plugin-examples';

describe('plugin showcase queries', () => {
  it.each(sparqlPluginExamples)(
    '$id is valid SPARQL without fixed VALUES data',
    ({ query }) => {
      const parsed = new Parser().parse(query);
      // Inspect the parsed query, so ordinary comments mentioning values are fine.
      expect(JSON.stringify(parsed)).not.toContain('"type":"values"');
    },
  );
});
