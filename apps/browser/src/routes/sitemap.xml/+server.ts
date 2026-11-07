import type { RequestEvent } from '@sveltejs/kit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { PUBLIC_SPARQL_ENDPOINT } from '$app/env/public';
import { datasetDetailHref } from '$lib/url';

const fetcher = new SparqlEndpointFetcher();
const CACHE_TTL = 86400; // 24 hours in seconds

let cachedDatasets: DatasetInfo[] | null = null;
let cacheTimestamp = 0;

// No lastmod: schema:dateRead advances on every crawl whether or not the
// description changed, and search engines stop trusting a lastmod that does.
interface DatasetInfo {
  uri: string;
}

/**
 * Fetch all dataset URIs from the SPARQL endpoint.
 */
async function fetchDatasetUris(): Promise<DatasetInfo[]> {
  const query = `
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX schema: <https://schema.org/>

    SELECT DISTINCT ?dataset WHERE {
      ?dataset a dcat:Dataset ;
        schema:subjectOf ?registrationUrl .
      FILTER NOT EXISTS { ?registrationUrl schema:validUntil ?validUntil }
    }
  `;

  const datasets: DatasetInfo[] = [];

  try {
    const bindings = await fetcher.fetchBindings(PUBLIC_SPARQL_ENDPOINT, query);

    for await (const binding of bindings) {
      const typedBinding = binding as unknown as {
        dataset: { value: string };
      };

      datasets.push({ uri: typedBinding.dataset.value });
    }
  } catch (error) {
    console.error('Sitemap query failed:', error);
  }

  return datasets;
}

/**
 * Generate sitemap XML from dataset information.
 */
function generateSitemapXml(datasets: DatasetInfo[], origin: string): string {
  const urls = datasets
    .map((dataset) => {
      const loc = `${origin}${datasetDetailHref(dataset.uri)}`;

      return `  <url>
    <loc>${escapeXml(loc)}</loc>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sitemap endpoint for search engine discovery.
 */
function revalidateCache() {
  fetchDatasetUris().then((datasets) => {
    if (datasets.length > 0) {
      cachedDatasets = datasets;
      cacheTimestamp = Date.now();
    }
  });
}

export async function GET({ url }: RequestEvent) {
  const now = Date.now();
  const cacheAge = now - cacheTimestamp;

  if (!cachedDatasets) {
    // First request: must wait for data.
    const datasets = await fetchDatasetUris();
    if (datasets.length > 0) {
      cachedDatasets = datasets;
      cacheTimestamp = now;
    }
  } else if (cacheAge > CACHE_TTL * 1000) {
    // Stale: serve cached data and revalidate in the background.
    revalidateCache();
  }

  const xml = generateSitemapXml(cachedDatasets ?? [], url.origin);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    },
  });
}
