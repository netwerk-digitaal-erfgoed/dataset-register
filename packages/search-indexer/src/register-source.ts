import type { SparqlClient } from '@dataset-register/core';
import type { Quad } from '@rdfjs/types';

const PREFIXES = `
  PREFIX schema: <https://schema.org/>
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX dr: <urn:dr:>
`;

/**
 * Reads the register store (QLever) as a frameable RDF graph. Fully decoupled
 * from the crawl write path: it only reads the canonical RDF, which the unified
 * pipeline frames into the JSON-LD IR and projects.
 */
export class RegisterSource {
  constructor(
    private readonly client: SparqlClient,
    private readonly registrationsGraphIri: string,
  ) {}

  /**
   * CONSTRUCT one flat, frameable subgraph per dataset: its DCAT/DC content plus
   * the **newest** registration’s facts, every value hanging directly off the
   * dataset node (`dr:publisherName`, `dr:format`, …) rather than nested — a
   * deliberately flat IR, because a CONSTRUCT template that spans two subjects
   * (`?dataset dcat:distribution ?dist . ?dist dcat:mediaType ?x`) drops the
   * `?dataset → ?dist` link on QLever; single-subject templates are reliable.
   *
   * Structure matters for QLever too: registration facts are single-valued
   * OPTIONALs inside the registration block, and the UNION contains **only**
   * dataset-graph branches. Mixing registration-graph and dataset-graph branches
   * in one UNION makes QLever silently drop some branches from the CONSTRUCT
   * output. Keeping each multi-valued dataset property in its own UNION branch
   * still avoids the cross-product that would multiply languages × keywords ×
   * media types.
   *
   * The inner aggregate picks the newest registration per dataset (lexicographic
   * max of the ISO `schema:dateRead`), preserving the “most recently read
   * registration wins” status semantics. The engine emits the constant
   * `a dcat:Dataset`/`dr:dateRead` per row, which the framer dedupes (QLever does
   * not dedupe CONSTRUCT output).
   */
  async readQuads(): Promise<Quad[]> {
    const graph = `<${this.registrationsGraphIri}>`;
    return this.client.constructQuads(`
      ${PREFIXES}
      CONSTRUCT {
        ?dataset a dcat:Dataset ;
          dct:title ?title ; dct:description ?description ; dcat:keyword ?keyword ;
          dct:language ?language ; dr:organization ?organization ; schema:additionalType ?additionalType ;
          dr:publisherName ?publisherName ; dr:creatorName ?creatorName ;
          dr:format ?format ; dr:conformsTo ?conformsTo ;
          dr:dateRead ?dateRead ; dr:datePosted ?datePosted ; dr:validUntil ?validUntil .
      } WHERE {
        {
          SELECT ?dataset (MAX(?read) AS ?dateRead) WHERE {
            GRAPH ${graph} { ?anyRegistration schema:about ?dataset ; schema:dateRead ?read . }
          } GROUP BY ?dataset
        }
        GRAPH ${graph} {
          ?registration schema:about ?dataset ; schema:dateRead ?dateRead .
          OPTIONAL { ?registration schema:datePosted ?datePosted }
          OPTIONAL { ?registration schema:validUntil ?validUntil }
          OPTIONAL { ?registration schema:additionalType ?additionalType }
        }
        {
          GRAPH ?dataset { ?dataset dct:title ?title }
        } UNION { GRAPH ?dataset { ?dataset dct:description ?description } }
          UNION { GRAPH ?dataset { ?dataset dcat:keyword ?keyword } }
          UNION { GRAPH ?dataset { ?dataset dct:language ?languageValue } BIND(STR(?languageValue) AS ?language) }
          UNION { GRAPH ?dataset { ?dataset dct:publisher ?organization } FILTER(isIRI(?organization)) }
          UNION { GRAPH ?dataset { ?dataset dct:creator ?organization } FILTER(isIRI(?organization)) }
          UNION { GRAPH ?dataset { ?dataset dct:publisher ?publisherNode . ?publisherNode foaf:name ?publisherName } }
          UNION { GRAPH ?dataset { ?dataset dct:creator ?creatorNode . ?creatorNode foaf:name ?creatorName } }
          UNION { GRAPH ?dataset { ?dataset dcat:distribution ?dist . ?dist dcat:mediaType ?mediaType } BIND(STR(?mediaType) AS ?format) }
          UNION { GRAPH ?dataset { ?dataset dcat:distribution ?distribution . ?distribution dct:conformsTo ?conformsToValue } BIND(STR(?conformsToValue) AS ?conformsTo) }
      }`);
  }

  /**
   * CONSTRUCT one `?organization foaf:name ?label` triple per organization that
   * appears as a publisher or creator IRI, feeding the sidecar `labels`
   * collection. The dataset projection facets on the organization IRI; this
   * read supplies the human-readable label the browser shows for each facet
   * bucket (Typesense cannot facet on a joined field, so the label is stored
   * separately and resolved by IRI at query time).
   */
  async readOrganizationLabelQuads(): Promise<Quad[]> {
    const graph = `<${this.registrationsGraphIri}>`;
    return this.client.constructQuads(`
      ${PREFIXES}
      CONSTRUCT { ?organization foaf:name ?label } WHERE {
        GRAPH ${graph} { ?registration schema:about ?dataset . }
        {
          GRAPH ?dataset { ?dataset dct:publisher ?organization . ?organization foaf:name ?label }
        } UNION {
          GRAPH ?dataset { ?dataset dct:creator ?organization . ?organization foaf:name ?label }
        }
        FILTER(isIRI(?organization))
      }`);
  }
}
