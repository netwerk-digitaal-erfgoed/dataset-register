import { describe, expect, it } from 'vitest';
import { parseShaclReport, resultGroupKey } from './shacl-report.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeResult(partial: Record<string, any>) {
  return {
    '@id': partial['@id'] ?? '_:r',
    '@type': ['http://www.w3.org/ns/shacl#ValidationResult'],
    ...partial,
  };
}

describe('parseShaclReport', () => {
  it('extracts report + results from expanded JSON-LD', () => {
    const json = [
      {
        '@id': '_:r1',
        '@type': ['http://www.w3.org/ns/shacl#ValidationReport'],
        'http://www.w3.org/ns/shacl#conforms': [
          {
            '@value': 'false',
            '@type': 'http://www.w3.org/2001/XMLSchema#boolean',
          },
        ],
      },
      makeResult({
        '@id': '_:r2',
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Violation' },
        ],
        'http://www.w3.org/ns/shacl#focusNode': [
          { '@id': 'http://data.example/ds/1' },
        ],
        'http://www.w3.org/ns/shacl#resultPath': [
          { '@id': 'https://schema.org/name' },
        ],
        'http://www.w3.org/ns/shacl#resultMessage': [
          { '@value': 'Voeg een titel toe', '@language': 'nl' },
          { '@value': 'Add a title', '@language': 'en' },
        ],
        'http://www.w3.org/ns/shacl#sourceConstraintComponent': [
          { '@id': 'http://www.w3.org/ns/shacl#MinCountConstraintComponent' },
        ],
      }),
    ];

    const report = parseShaclReport(json, { locale: 'en' });
    expect(report.conforms).toBe(false);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({
      severity: 'Violation',
      focusNode: 'http://data.example/ds/1',
      path: 'https://schema.org/name',
      message: 'Add a title',
      sourceConstraintComponent:
        'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
    });
  });

  it('picks the Dutch message when locale is nl', () => {
    const json = [
      makeResult({
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Warning' },
        ],
        'http://www.w3.org/ns/shacl#resultMessage': [
          { '@value': 'Voeg een beschrijving toe', '@language': 'nl' },
          { '@value': 'Add a description', '@language': 'en' },
        ],
      }),
    ];
    const report = parseShaclReport(json, { locale: 'nl' });
    expect(report.results[0].message).toBe('Voeg een beschrijving toe');
  });

  it('handles IRI-valued sh:value and literal sh:value', () => {
    const json = [
      makeResult({
        '@id': '_:a',
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Violation' },
        ],
        'http://www.w3.org/ns/shacl#value': [
          { '@id': 'https://example.com/bad-license' },
        ],
        'http://www.w3.org/ns/shacl#resultMessage': [{ '@value': 'Bad IRI' }],
      }),
      makeResult({
        '@id': '_:b',
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Info' },
        ],
        'http://www.w3.org/ns/shacl#value': [{ '@value': '2024' }],
        'http://www.w3.org/ns/shacl#resultMessage': [{ '@value': 'Info' }],
      }),
    ];
    const report = parseShaclReport(json, { locale: 'en' });
    expect(report.results[0]).toMatchObject({
      value: 'https://example.com/bad-license',
      valueIsIri: true,
    });
    expect(report.results[1]).toMatchObject({
      value: '2024',
      valueIsIri: false,
    });
  });

  it('marks blank-node focus nodes', () => {
    const json = [
      makeResult({
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Violation' },
        ],
        'http://www.w3.org/ns/shacl#focusNode': [{ '@id': '_:df_62_0' }],
        'http://www.w3.org/ns/shacl#resultMessage': [{ '@value': 'Hi' }],
      }),
    ];
    const report = parseShaclReport(json, { locale: 'en' });
    expect(report.results[0]).toMatchObject({
      focusNode: '_:df_62_0',
      focusNodeIsBlank: true,
    });
  });

  it('computes conforms when the ValidationReport node is missing', () => {
    const warningOnly = [
      makeResult({
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Warning' },
        ],
        'http://www.w3.org/ns/shacl#resultMessage': [{ '@value': 'Hi' }],
      }),
    ];
    expect(parseShaclReport(warningOnly, { locale: 'en' }).conforms).toBe(true);

    const violation = [
      makeResult({
        'http://www.w3.org/ns/shacl#resultSeverity': [
          { '@id': 'http://www.w3.org/ns/shacl#Violation' },
        ],
        'http://www.w3.org/ns/shacl#resultMessage': [{ '@value': 'Hi' }],
      }),
    ];
    expect(parseShaclReport(violation, { locale: 'en' }).conforms).toBe(false);
  });

  it('returns an empty report for empty input', () => {
    expect(parseShaclReport([], { locale: 'en' })).toEqual({
      conforms: true,
      results: [],
    });
  });
});

describe('resultGroupKey', () => {
  it('distinguishes results with the same message but different paths', () => {
    const a = {
      severity: 'Warning' as const,
      path: 'https://schema.org/name',
      sourceConstraintComponent:
        'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
      message: 'Add a value',
    };
    const b = { ...a, path: 'https://schema.org/description' };
    expect(resultGroupKey(a)).not.toBe(resultGroupKey(b));
  });

  it('collapses repeats of the same constraint across focus nodes', () => {
    const base = {
      severity: 'Warning' as const,
      path: 'https://schema.org/name',
      sourceConstraintComponent:
        'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
      message: 'Add a value',
    };
    expect(resultGroupKey({ ...base, focusNode: 'x' })).toBe(
      resultGroupKey({ ...base, focusNode: 'y' }),
    );
  });
});
