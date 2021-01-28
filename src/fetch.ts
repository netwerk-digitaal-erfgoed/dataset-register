import {IQueryResultQuads, newEngine} from '@comunica/actor-init-sparql';
import rdfDereferencer from 'rdf-dereference';
import factory from 'rdf-ext';
import DatasetExt from 'rdf-ext/lib/Dataset';
import nodeFetch from 'node-fetch';
import {URL} from 'url';

export class UrlNotFound extends Error {}
export class NoDatasetFoundAtUrl extends Error {}

export async function fetch(url: URL): Promise<DatasetExt> {
  // Comunica doesn't handle status codes well, so first make sure the URL can be retrieved.
  const response = await nodeFetch(url);
  if (!response.ok) {
    throw new UrlNotFound();
  }

  return dereference(url);
}
/**
 * Fetch the dataset description by dereferencing its URL.
 *
 * This assumes the dataset description is the primary resource on the URL. If the (embedded) RDF contains multiple
 * datasets (such as a catalog of datasets), we have a problem.
 */
async function dereference(url: URL): Promise<DatasetExt> {
  let dataset: DatasetExt;
  try {
    const {quads} = await rdfDereferencer.dereference(url.toString());
    dataset = await factory.dataset().import(quads);
  } catch (e) {
    throw new NoDatasetFoundAtUrl(e.message);
  }

  // Ensure we have at least a dataset IRI.
  if (
    dataset.match(
      null,
      factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      factory.namedNode('http://schema.org/Dataset')
    ).size === 0
  ) {
    throw new NoDatasetFoundAtUrl();
  }

  return dataset;
}

/**
 * Retrieve the dataset description through a CONSTRUCT SPARQL query.
 *
 * Currently unusable; see https://github.com/comunica/comunica/issues/773.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function query(url: string): Promise<IQueryResultQuads> {
  const comunica = newEngine();
  return (await comunica.query(
    `
      CONSTRUCT {
        ?s a schema:Dataset ;
          schema:identifier ?identifier ;
          schema:name ?name ;
          schema:description ?description ;
          schema:creator ?creator ;
          schema:license ?license ;
          schema:distribution ?distribution ;
          schema:url ?url ;
          schema:keywords ?keywords .
         
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
          GROUP BY ?s 
      }`,
    {sources: [url]}
  )) as IQueryResultQuads;
}
