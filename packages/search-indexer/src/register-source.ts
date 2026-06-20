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
   * Read each dataset as a flat, frameable subgraph: its newest registration’s
   * facts plus its DCAT/DC content, every value hanging directly off the dataset
   * node (`dr:publisherName`, `dr:format`, …) rather than nested – a deliberately
   * flat IR, because a CONSTRUCT template spanning two subjects
   * (`?dataset dcat:distribution ?dist . ?dist dcat:mediaType ?x`) drops the
   * `?dataset → ?dist` link on QLever; single-subject templates are reliable.
   *
   * Split into **two** CONSTRUCTs, merged by dataset IRI, to avoid a
   * cross-product. The registration facts are single-valued but a dataset’s
   * properties are multi-valued, so emitting both in one query multiplied the
   * facts (and the `a dcat:Dataset` constant) by every keyword × format × …,
   * inflating the result ~4× on the full register. Keeping them apart also keeps
   * each query to a single graph: a UNION that mixes registration-graph and
   * dataset-graph branches makes QLever silently drop branches.
   *
   * - {@link facts} (registration graph): asserts `a dcat:Dataset` + the newest
   *   registration’s status/dates, for registered datasets that have a title.
   *   This is what makes a dataset a framing root, so titleless husks (e.g. a
   *   `gone` registration whose description is no longer retrievable) are
   *   excluded, matching the listing’s “has content” expectation.
   * - {@link properties} (dataset graphs): each multi-valued property in its own
   *   UNION branch (no inter-property cross-product). Properties of unregistered
   *   datasets are harmless – without the `a dcat:Dataset` from `facts` they are
   *   never framed.
   *
   * Within `facts`, the inner aggregate takes the newest `schema:dateRead` per
   * dataset and the outer `FILTER NOT EXISTS` keeps a single registration when
   * several share that timestamp (lexicographically greatest IRI), so the
   * “most recently read registration wins” status is one deterministic value
   * even for the datasets with duplicate registrations.
   */
  async readQuads(): Promise<Quad[]> {
    const [facts, properties] = await Promise.all([
      this.client.constructQuads(this.factsQuery()),
      this.client.constructQuads(this.propertiesQuery()),
    ]);
    return [...facts, ...properties];
  }

  /** Registration-graph CONSTRUCT: type + newest-registration facts per dataset. */
  private factsQuery(): string {
    const graph = `<${this.registrationsGraphIri}>`;
    return `
      ${PREFIXES}
      CONSTRUCT {
        ?dataset a dcat:Dataset ;
          schema:additionalType ?additionalType ;
          dr:dateRead ?dateRead ; dr:datePosted ?datePosted ; dr:validUntil ?validUntil .
      } WHERE {
        {
          SELECT ?dataset (MAX(?read) AS ?dateRead) WHERE {
            GRAPH ${graph} { ?anyRegistration schema:about ?dataset ; schema:dateRead ?read . }
          } GROUP BY ?dataset
        }
        GRAPH ${graph} { ?registration schema:about ?dataset ; schema:dateRead ?dateRead . }
        FILTER NOT EXISTS {
          GRAPH ${graph} { ?other schema:about ?dataset ; schema:dateRead ?dateRead . }
          FILTER(STR(?other) > STR(?registration))
        }
        FILTER EXISTS { GRAPH ?dataset { ?dataset dct:title ?anyTitle } }
        OPTIONAL { GRAPH ${graph} { ?registration schema:datePosted ?datePosted } }
        OPTIONAL { GRAPH ${graph} { ?registration schema:validUntil ?validUntil } }
        OPTIONAL { GRAPH ${graph} { ?registration schema:additionalType ?additionalType } }
      }`;
  }

  /** Dataset-graph CONSTRUCT: one UNION branch per multi-valued property. */
  private propertiesQuery(): string {
    return `
      ${PREFIXES}
      CONSTRUCT {
        ?dataset dct:title ?title ; dct:description ?description ; dcat:keyword ?keyword ;
          dct:language ?language ; dr:organization ?organization ; dr:catalog ?catalog ;
          dr:publisherName ?publisherName ; dr:creatorName ?creatorName ;
          dr:format ?format ; dr:conformsTo ?conformsTo .
      } WHERE {
        {
          GRAPH ?dataset { ?dataset dct:title ?title }
        } UNION { GRAPH ?dataset { ?dataset dct:description ?description } }
          UNION { GRAPH ?dataset { ?dataset dcat:keyword ?keyword } }
          UNION { GRAPH ?dataset { ?dataset dct:language ?languageValue } BIND(STR(?languageValue) AS ?language) }
          UNION { GRAPH ?dataset { ?dataset dct:publisher ?organization } FILTER(isIRI(?organization)) }
          UNION { GRAPH ?dataset { ?dataset dct:creator ?organization } FILTER(isIRI(?organization)) }
          UNION { GRAPH ?dataset { ?dataset dct:isPartOf ?catalog } FILTER(isIRI(?catalog)) }
          UNION { GRAPH ?dataset { ?dataset dct:publisher ?publisherNode . ?publisherNode foaf:name ?publisherName } }
          UNION { GRAPH ?dataset { ?dataset dct:creator ?creatorNode . ?creatorNode foaf:name ?creatorName } }
          UNION { GRAPH ?dataset { ?dataset dcat:distribution ?dist . ?dist dcat:mediaType ?mediaType } BIND(STR(?mediaType) AS ?format) }
          UNION { GRAPH ?dataset { ?dataset dcat:distribution ?distribution . ?distribution dct:conformsTo ?conformsToValue } BIND(STR(?conformsToValue) AS ?conformsTo) }
      }`;
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
