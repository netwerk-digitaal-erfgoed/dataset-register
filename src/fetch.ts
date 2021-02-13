import {
  IQueryResultBindings,
  IQueryResultQuads,
  newEngine,
} from '@comunica/actor-init-sparql';
import rdfDereferencer from 'rdf-dereference';
import factory from 'rdf-ext';
import DatasetExt from 'rdf-ext/lib/Dataset';
import nodeFetch from 'node-fetch';
import {URL} from 'url';
import {Store} from 'n3';
import {bindingsToQuads, selectQuery} from './query';

export class UrlNotFound extends Error {}
export class NoDatasetFoundAtUrl extends Error {}

export async function fetch(url: URL): Promise<DatasetExt[]> {
  // Comunica doesn't handle status codes well (https://github.com/comunica/comunica/issues/777),
  // so first make sure the URL can be retrieved.
  const response = await nodeFetch(url, {
    // Use Comunica’s Accept header.
    headers: {
      Accept:
        'application/n-quads,application/trig;q=0.95,application/ld+json;q=0.9,application/n-triples;q=0.8,text/turtle;q=0.6,application/rdf+xml;q=0.5',
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new UrlNotFound();
    }
    throw new NoDatasetFoundAtUrl();
  }

  //   return await construct(url);
  const datasets = await query(url);
  if (datasets.length === 0) {
    throw new NoDatasetFoundAtUrl();
  }

  return datasets;
}

/**
 * Fetch dataset description(s) by dereferencing the registration URL.
 */
export async function dereference(url: URL): Promise<DatasetExt> {
  try {
    const {quads} = await rdfDereferencer.dereference(url.toString());
    return await factory.dataset().import(quads);
  } catch (e) {
    throw new NoDatasetFoundAtUrl(e.message);
  }
}

const engine = newEngine();

/**
 * Fetch dataset descriptions by executing a SPARQL SELECT query.
 *
 * Use OPTIONALs in order to fetch both complete and incomplete datasets. We want those incomplete datasets in order
 * to have SHACL validation results. Any data not matching this SPARQL query will return nothing, after all, and nothing
 * cannot be validated by SHACL.
 */
async function query(url: URL): Promise<DatasetExt[]> {
  const {bindingsStream} = (await engine.query(selectQuery, {
    sources: [url.toString()],
  })) as IQueryResultBindings;

  // Write results to an N3 Store for deduplication and partitioning by dataset.
  const store = new Store();

  return new Promise(resolve => {
    bindingsStream
      .on('data', binding => store.addQuads(bindingsToQuads(binding)))
      .on('end', async () => {
        // Each dataset description is stored in its own graph, so separate them out now.
        const datasets: DatasetExt[] = await Promise.all(
          store
            .getGraphs(null, null, null)
            .map(
              async graph =>
                await factory
                  .dataset()
                  .import(store.match(undefined, undefined, undefined, graph))
            )
        );

        resolve(datasets);
      });
  });
}

/**
 * Retrieve the dataset description through a CONSTRUCT SPARQL query.
 *
 * Currently unusable; see https://github.com/comunica/comunica/issues/773.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function construct(url: URL) {
  const comunica = newEngine();
  const result = (await comunica.query(
    `
      CONSTRUCT {
        ?s a schema:Dataset ;
          schema:name ?name ;
          schema:description ?description ;
          schema:creator ?creator ;
          schema:license ?license ;
          schema:distribution ?distribution .
        ?distribution a schema:DataDownload ;
          schema:encodingFormat ?encodingFormat ;
          schema:contentUrl ?contentUrl .
        ?creator a schema:Organization ;
          schema:name ?creatorName .                 
      }   
      WHERE {
        {
          ?s a schema:Dataset ;
            schema:identifier ?identifier ;
            schema:name ?name ;
            schema:description ?description ;
            schema:creator ?creator ;
            schema:license ?license ;
            schema:distribution ?distribution .
          ?distribution a schema:DataDownload ; 
            schema:encodingFormat ?encodingFormat ;
            schema:contentUrl ?contentUrl .
          ?creator a schema:Organization ; 
            schema:name ?creatorName .
          OPTIONAL { ?s schema:url ?url . }
          OPTIONAL { ?s schema:keywords ?keywords . }
        }
      }`,
    {sources: [url.toString()]}
  )) as IQueryResultQuads;

  // const quads = await result.quads();
  console.log(await result.quads());

  return await factory.dataset().import(result.quadStream);
}
