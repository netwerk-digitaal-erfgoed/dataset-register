import nock from 'nock';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SparqlClient } from '../src/sparql.js';
import { storeUpdateDuration } from '../src/instrumentation.js';

// Kept apart from sparql.test.ts: nock intercepts HTTP for the whole file, which would also
// catch testcontainers’ requests to Docker there.
describe('SparqlClient.update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    nock.cleanAll();
  });

  it('records the HTTP status of a rejected update as its error type', async () => {
    const record = vi.spyOn(storeUpdateDuration, 'record');
    // A store that is too busy to take the update.
    nock('http://unavailable-store.example.org')
      .post('/sparql')
      .reply(503, 'Service Unavailable');
    const unavailable = new SparqlClient(
      'http://unavailable-store.example.org/sparql',
      undefined,
      'dataset',
    );

    await expect(
      unavailable.update('INSERT DATA { <urn:s> <urn:p> <urn:o> }'),
    ).rejects.toThrow();

    expect(record).toHaveBeenCalledWith(expect.any(Number), {
      'db.operation.name': 'update',
      'db.collection.name': 'dataset',
      'error.type': '503',
    });
  });
});
