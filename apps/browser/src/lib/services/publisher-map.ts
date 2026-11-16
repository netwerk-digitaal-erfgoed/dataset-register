import type { Binding, QueryResult, ResultRendererPlugin } from '@ldforge/core';
import { createGeoRenderer, type GeoRendererOptions } from '@ldforge/geo';
import * as m from '$lib/paraglide/messages';
import './publisher-map.css';

type Publisher = { iri: string; name: string; datasets: string };

export function placeDatasetsQuery(publishers: readonly string[]): string {
  if (
    publishers.length === 0 ||
    publishers.some(
      (iri) =>
        !/^https?:\/\//.test(iri) ||
        /[<>"{}|^`\\]/u.test(iri) ||
        [...iri].some((character) => character.charCodeAt(0) <= 32),
    )
  ) {
    throw new TypeError('Invalid publisher IRI');
  }
  const iris = [...new Set(publishers)].map((iri) => `<${iri}>`).join(', ');
  return `# view=table
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT DISTINCT ?dataset ?title ?publisher ?publisherName ?description
WHERE {
  ?dataset a dcat:Dataset ; dct:publisher ?publisher ;
    dct:title ?title ; schema:subjectOf ?registration .
  FILTER(?publisher IN (PLACEHOLDER))
  ?publisher foaf:name ?publisherName .
  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
  OPTIONAL { ?dataset dct:description ?description }
}
ORDER BY ?publisherName ?title ?dataset`.replace('PLACEHOLDER', iris);
}

export function groupPublisherPlaces(bindings: readonly Binding[]) {
  const places = new Map<
    string,
    { marker: Binding; publishers: Map<string, Publisher> }
  >();
  for (const row of bindings) {
    const place = row.place?.value;
    const publisher = row.publisher;
    if (!place || publisher?.type !== 'uri') continue;
    let entry = places.get(place);
    if (!entry) {
      entry = { marker: row, publishers: new Map() };
      places.set(place, entry);
    }
    entry.publishers.set(publisher.value, {
      iri: publisher.value,
      name: row.publisherName?.value || publisher.value,
      datasets: row.datasets?.value || '0',
    });
  }
  return places;
}

/** Keep every publisher as structured data, but draw only one marker per place. */
export function createPublisherMapRenderer(
  onSelect: (place: { name: string; publishers: string[] }) => void,
): ResultRendererPlugin {
  const fallback = createGeoRenderer();
  return {
    ...fallback,
    render(container, result, context) {
      if (
        result.kind !== 'bindings' ||
        !['publisher', 'publisherName', 'datasets', 'place'].every((name) =>
          result.variables.includes(name),
        )
      ) {
        return fallback.render(container, result, context);
      }
      const places = groupPublisherPlaces(result.bindings);
      const locale = context?.locale === 'nl' ? 'nl' : 'en';
      const options: GeoRendererOptions = {
        renderPopup(doc, properties) {
          const entry =
            typeof properties.link === 'string'
              ? places.get(properties.link)
              : undefined;
          if (!entry) return;
          const popup = doc.createElement('section');
          popup.className = 'publisher-map-popup';
          const title = doc.createElement('strong');
          title.textContent = String(properties.label ?? '');
          const total = [...entry.publishers.values()].reduce(
            (sum, publisher) => sum + Number(publisher.datasets),
            0,
          );
          const summary = doc.createElement('div');
          summary.className = 'publisher-map-total';
          summary.textContent = m.publisher_map_total(
            { count: new Intl.NumberFormat(locale).format(total) },
            { locale },
          );
          const list = doc.createElement('ul');
          for (const publisher of [...entry.publishers.values()].sort((a, b) =>
            a.name.localeCompare(b.name),
          )) {
            const item = doc.createElement('li');
            const text = doc.createElement('div');
            const name = doc.createElement('div');
            name.textContent = publisher.name;
            const count = doc.createElement('small');
            count.textContent = `${publisher.datasets} ${publisher.datasets === '1' ? 'dataset' : 'datasets'}`;
            text.append(name, count);
            item.append(text);
            list.append(item);
          }
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = m.publisher_map_show_datasets({}, { locale });
          button.addEventListener('click', () =>
            onSelect({
              name: String(properties.label ?? ''),
              publishers: [...entry.publishers.keys()],
            }),
          );
          const note = doc.createElement('small');
          note.textContent = m.publisher_map_place_note({}, { locale });
          popup.append(title, summary, list, button, note);
          return popup;
        },
      };
      const grouped: QueryResult = {
        ...result,
        bindings: [...places.values()].map(({ marker, publishers }) => ({
          ...marker,
          // Retain a plain-text representation for exports and alternate hosts.
          geoDescription: {
            type: 'literal',
            value: [...publishers.values()]
              .map((publisher) => `• ${publisher.name} (${publisher.datasets})`)
              .join('\n'),
          },
        })),
      };
      return createGeoRenderer(options).render(container, grouped, context);
    },
  };
}
