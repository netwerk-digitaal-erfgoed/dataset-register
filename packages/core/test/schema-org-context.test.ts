import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { DatasetCore, Quad } from '@rdfjs/types';
import { load } from '../src/dataset.ts';
import {
  isSchemaOrgContextUrl,
  withSchemaOrgContext,
} from '../src/schema-org-context.ts';

const registration = (context: string) =>
  JSON.stringify({
    '@context': context,
    '@id': 'https://example.org/dataset',
    '@type': 'Dataset',
    name: 'A dataset',
    mainEntityOfPage: 'https://example.org/about',
    license: 'http://creativecommons.org/publicdomain/zero/1.0/',
    dateModified: '2025-12-01',
  });

function objectOf(data: DatasetCore, property: string): Quad['object'] {
  const quad = [...data].find(
    (candidate) =>
      candidate.predicate.value === `https://schema.org/${property}`,
  );
  if (quad === undefined) {
    throw new Error(`no ${property} quad found`);
  }
  return quad.object;
}

describe('isSchemaOrgContextUrl', () => {
  it.each([
    'http://schema.org',
    'https://schema.org',
    'https://schema.org/',
    'https://schema.org/docs/jsonldcontext.jsonld',
    'https://schema.org/docs/jsonldcontext.json',
  ])('recognizes %s', (url) => {
    expect(isSchemaOrgContextUrl(url)).toBe(true);
  });

  it.each([
    'https://schema.org/Dataset',
    'https://example.org/context.jsonld',
    'https://schema.org.example.org/',
  ])('leaves %s alone', (url) => {
    expect(isSchemaOrgContextUrl(url)).toBe(false);
  });
});

describe('withSchemaOrgContext', () => {
  it('serves our context without reaching the network', async () => {
    const baseFetch = vi.fn();
    const response = await withSchemaOrgContext(
      baseFetch as unknown as typeof globalThis.fetch,
    )('https://schema.org/');

    expect(baseFetch).not.toHaveBeenCalled();
    expect(response.headers.get('content-type')).toBe('application/ld+json');
    const context = (await response.json()) as {
      '@context': Record<string, unknown>;
    };
    expect(context['@context']['@vocab']).toBe('https://schema.org/');
    expect(context['@context']['mainEntityOfPage']).toEqual({
      '@id': 'schema:mainEntityOfPage',
      '@type': '@id',
    });
  });

  /**
   * Comunica and rdf-dereference hand their `fetch` a string, a `URL` or a `Request`
   * depending on the path taken. Reading the URL from only one of those would leave the
   * interception silently not firing on the others.
   */
  it.each([
    ['a URL', new URL('https://schema.org/')],
    ['a Request', new Request('https://schema.org/docs/jsonldcontext.jsonld')],
  ])('intercepts when given %s', async (_name, input) => {
    const baseFetch = vi.fn();
    const response = await withSchemaOrgContext(
      baseFetch as unknown as typeof globalThis.fetch,
    )(input);

    expect(baseFetch).not.toHaveBeenCalled();
    expect(response.headers.get('content-type')).toBe('application/ld+json');
  });

  it('passes every other request through untouched', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));
    const init = { headers: { accept: 'application/ld+json' } };
    await withSchemaOrgContext(baseFetch as unknown as typeof globalThis.fetch)(
      'https://example.org/context.jsonld',
      init,
    );

    expect(baseFetch).toHaveBeenCalledWith(
      'https://example.org/context.jsonld',
      init,
    );
  });
});

describe('parsing a registration that cites schema.org', () => {
  /**
   * Schema.org 30.1 dropped `"@type": "@id"` from `mainEntityOfPage`, so the live context
   * expands this value to a literal and `sh:nodeKind sh:IRI` fails. Our context restores
   * the typing, which is the whole point of serving it.
   */
  it('reads mainEntityOfPage as an IRI', async () => {
    const data = (await load(
      Readable.from(registration('https://schema.org/')),
      'application/ld+json',
    )) as DatasetCore;

    expect(objectOf(data, 'mainEntityOfPage').termType).toBe('NamedNode');
    expect(objectOf(data, 'license').termType).toBe('NamedNode');
  });

  /**
   * `"@type": "Date"` resolves against `@vocab`, so a date-only value is typed
   * `schema:Date` – exactly what schema.org’s context produced before 30.1, and one of
   * the datatypes the `sh:or` on `schema:dateModified` accepts. Under the live context
   * it is a plain string, which matches none of them.
   */
  it('types a date-only value as schema:Date', async () => {
    const data = (await load(
      Readable.from(registration('https://schema.org/')),
      'application/ld+json',
    )) as DatasetCore;

    const dateModified = objectOf(data, 'dateModified') as Quad['object'] & {
      datatype: { value: string };
    };
    expect(dateModified.termType).toBe('Literal');
    expect(dateModified.datatype.value).toBe('https://schema.org/Date');
  });

  it('keeps the prefixes publishers rely on inside a schema.org context', async () => {
    const data = (await load(
      Readable.from(
        JSON.stringify({
          '@context': 'https://schema.org/',
          '@id': 'https://example.org/dataset',
          '@type': 'Dataset',
          'dct:source': { '@id': 'https://example.org/source' },
        }),
      ),
      'application/ld+json',
    )) as DatasetCore;

    expect(
      [...data].some(
        (quad) => quad.predicate.value === 'http://purl.org/dc/terms/source',
      ),
    ).toBe(true);
  });
});
