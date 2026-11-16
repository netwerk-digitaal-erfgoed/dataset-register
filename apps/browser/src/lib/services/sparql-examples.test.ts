import { describe, expect, it } from 'vitest';
import { Parser } from 'sparqljs';
import {
  parseExample,
  sparqlExamples,
  sparqlPluginExamples,
} from './sparql-examples';

describe('example queries', () => {
  it.each([...sparqlExamples, ...sparqlPluginExamples])(
    '$id is valid SPARQL',
    ({ query }) => {
      expect(() => new Parser().parse(query)).not.toThrow();
    },
  );

  it.each(sparqlPluginExamples)(
    '$id selects its data without fixed VALUES',
    ({ query }) => {
      const parsed = new Parser().parse(query);
      // Inspect the parsed query, so ordinary comments mentioning values are fine.
      expect(JSON.stringify(parsed)).not.toContain('"type":"values"');
    },
  );

  it('loads every example in file order with a unique id', () => {
    const ids = [...sparqlExamples, ...sparqlPluginExamples].map(
      (example) => example.id,
    );
    expect(ids.slice(0, 2)).toEqual([
      'recent-registrations',
      'publisher-rating',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('takes labels from the header and strips them from the query', () => {
    expect(
      parseExample(
        './sparql-examples/admin/07-example.rq',
        '# label-en: Example\n# label-nl: Voorbeeld\n# view=table\nASK {}\n',
      ),
    ).toEqual({
      id: 'example',
      label: { en: 'Example', nl: 'Voorbeeld' },
      query: '# view=table\nASK {}',
    });
    expect(() =>
      parseExample('./sparql-examples/admin/08-broken.rq', 'ASK {}'),
    ).toThrow('label-en');
  });
});
