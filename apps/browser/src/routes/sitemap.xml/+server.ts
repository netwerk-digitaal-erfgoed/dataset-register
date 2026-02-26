import type { RequestEvent } from '@sveltejs/kit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { PUBLIC_SPARQL_ENDPOINT } from '$env/static/public';
import { encodeDatasetUri } from '$lib/url';

const fetcher = new SparqlEndpointFetcher();
const CACHE_TTL = 86400; // 24 hours in seconds

let cachedDatasets: DatasetInfo[] | null = null;
let cacheTimestamp = 0;

interface DatasetInfo {
  uri: string;
  dateRead?: string;
}

/**
 * Fetch all dataset URIs with their last read dates from the SPARQL endpoint.
 */
async function fetchDatasetUris(): Promise<DatasetInfo[]> {
  const query = `
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX schema: <http://schema.org/>

    SELECT DISTINCT ?dataset ?dateRead WHERE {
      ?dataset a dcat:Dataset ;
        schema:subjectOf ?registrationUrl .
      FILTER NOT EXISTS { ?registrationUrl schema:validUntil ?validUntil }
      OPTIONAL { ?dataset schema:dateRead ?dateRead }
    }
  `;

  const datasets: DatasetInfo[] = [];

  try {
    const bindings = await fetcher.fetchBindings(PUBLIC_SPARQL_ENDPOINT, query);

    for await (const binding of bindings) {
      const typedBinding = binding as unknown as {
        dataset: { value: string };
        dateRead?: { value: string };
      };

      datasets.push({
        uri: typedBinding.dataset.value,
        dateRead: typedBinding.dateRead?.value,
      });
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
      const loc = `${origin}/datasets/${encodeDatasetUri(dataset.uri)}`;
      const lastmod = dataset.dateRead
        ? `\n    <lastmod>${dataset.dateRead.split('T')[0]}</lastmod>`
        : '';

      return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod}
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
export async function GET({ url }: RequestEvent) {
  const now = Date.now();
  if (!cachedDatasets || now - cacheTimestamp > CACHE_TTL * 1000) {
    const datasets = await fetchDatasetUris();
    if (datasets.length > 0) {
      cachedDatasets = datasets;
      cacheTimestamp = now;
    }
  }

  const xml = generateSitemapXml(cachedDatasets ?? [], url.origin);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    },
  });
}
