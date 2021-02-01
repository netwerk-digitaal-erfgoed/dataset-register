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
import {NamedNode, Quad_Object} from 'rdf-js';

export class UrlNotFound extends Error {}
export class NoDatasetFoundAtUrl extends Error {}

export async function fetch(url: URL): Promise<DatasetExt[]> {
  // Comunica doesn't handle status codes well, so first make sure the URL can be retrieved.
  const response = await nodeFetch(url);
  if (!response.ok) {
    throw new UrlNotFound();
  }

  //   return await construct(url);
  return query(url);
}

/**
 * Fetch dataset descriptions by dereferencing its URL.
 *
 * This assumes the dataset descriptions is the primary resource on the URL. If the (embedded) RDF contains multiple
 * datasets (such as a catalog of datasets), we have a problem.
 */
// eslint-disable-next-line
async function dereference(url: URL): Promise<DatasetExt[]> {
  // eslint-disable-line no-unused-vars
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

  return [dataset];
}

/**
 * Fetch dataset descriptions by executing a SPARQL SELECT query.
 */
async function query(url: URL): Promise<DatasetExt[]> {
  const engine = newEngine();
  const {bindingsStream} = (await engine.query(
    `
      SELECT * WHERE {
        ?s a schema:Dataset ;
          schema:name ?name ;
          schema:description ?description ;
          schema:license ?license ;
          schema:creator ?creator ;
          schema:distribution ?distribution .
        ?creator schema:name ?creator_name ;
          a schema:Organization .
        ?distribution a schema:DataDownload ;
          schema:contentUrl ?contentUrl ;
          schema:encodingFormat ?encodingFormat .
        OPTIONAL { ?s schema:alternateName ?alternateName . }
      } LIMIT 100000`,
    {sources: [url.toString()]}
  )) as IQueryResultBindings;

  // Write results to an N3 Store for deduplication.
  const store = new Store();

  return new Promise(resolve => {
    bindingsStream
      .on('data', binding => {
        const datasetIri = binding.get('?s') as NamedNode;

        /**
         * Use skolemized values because they are correct, unlike the generated blank node ids.
         * See https://github.com/rubensworks/jsonld-streaming-parser.js/issues/72
         */
        const creatorBlankNode = factory.blankNode(
          binding.get('?creator').skolemized.value.replace(/:/g, '_')
        );
        const distributionBlankNode = factory.blankNode(
          binding.get('?distribution').skolemized.value.replace(/:/g, '_')
        );

        store.addQuads([
          factory.quad(
            datasetIri,
            factory.namedNode(
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
            ),
            factory.namedNode('http://schema.org/Dataset'),
            datasetIri
          ),
          factory.quad(
            datasetIri,
            factory.namedNode('http://schema.org/name'),
            binding.get('?name') as Quad_Object,
            datasetIri
          ),
          factory.quad(
            datasetIri,
            factory.namedNode('http://schema.org/description'),
            binding.get('?description') as Quad_Object,
            datasetIri
          ),
          factory.quad(
            datasetIri,
            factory.namedNode('http://schema.org/license'),
            binding.get('?license') as Quad_Object,
            datasetIri
          ),
          factory.quad(
            datasetIri,
            factory.namedNode('http://schema.org/creator'),
            creatorBlankNode,
            datasetIri
          ),
          factory.quad(
            creatorBlankNode,
            factory.namedNode(
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
            ),
            factory.namedNode('http://schema.org/Organization'),
            datasetIri
          ),
          factory.quad(
            creatorBlankNode,
            factory.namedNode('http://schema.org/name'),
            binding.get('?creator_name') as NamedNode,
            datasetIri
          ),
          factory.quad(
            datasetIri,
            factory.namedNode('http://schema.org/distribution'),
            distributionBlankNode,
            datasetIri
          ),
          factory.quad(
            distributionBlankNode,
            factory.namedNode(
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
            ),
            factory.namedNode('http://schema.org/DataDownload'),
            datasetIri
          ),
          factory.quad(
            distributionBlankNode,
            factory.namedNode('http://schema.org/contentUrl'),
            binding.get('?contentUrl') as NamedNode,
            datasetIri
          ),
          factory.quad(
            distributionBlankNode,
            factory.namedNode('http://schema.org/encodingFormat'),
            binding.get('?encodingFormat') as Quad_Object,
            datasetIri
          ),
        ]);

        // Optionals.
        if (binding.get('?alternateName')) {
          store.addQuad(
            factory.quad(
              datasetIri,
              factory.namedNode('http://schema.org/alternateName'),
              binding.get('?alternateName') as Quad_Object,
              datasetIri
            )
          );
        }
      })
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
