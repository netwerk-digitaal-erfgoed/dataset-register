import { Feed } from 'feed';
import type { RequestEvent } from '@sveltejs/kit';
import { fetchDatasets, type SearchRequest } from '$lib/services/datasets';
import { extractLocaleFromUrl, setLocale } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';
import { decodeDiscreteParam, decodeRangeParam } from '$lib/url';
import { getLocalizedValue, localizeHref } from '$lib/utils/i18n';

const cacheTtl = 3600;

/**
 * RSS feed endpoint for dataset search results.
 * Supports all search parameters from the main search page.
 */
export async function GET({ url }: RequestEvent) {
  // Extract and set locale from URL path
  const locale = extractLocaleFromUrl(url.pathname) || 'en';
  setLocale(locale);

  const searchRequest: SearchRequest = {
    query: url.searchParams.get('search') || undefined,
    publisher: decodeDiscreteParam('publishers', url.searchParams),
    keyword: decodeDiscreteParam('keywords', url.searchParams),
    format: decodeDiscreteParam('format', url.searchParams),
    class: decodeDiscreteParam('class', url.searchParams),
    terminologySource: decodeDiscreteParam(
      'terminologySource',
      url.searchParams,
    ),
    size: decodeRangeParam('size', url.searchParams),
    status: decodeDiscreteParam('status', url.searchParams),
  };

  const results = await fetchDatasets(searchRequest, 20, 0, 'datePosted');

  // Calculate most recent date from results for feed's updated timestamp
  const mostRecentDate =
    results.datasets.length > 0 && results.datasets[0].datePosted
      ? new Date(results.datasets[0].datePosted)
      : new Date();

  // Build feed title and description based on active filters
  const feedDescription = buildFeedDescription(searchRequest, results.total);

  // Build link to the HTML datasets page (not the RSS feed)
  const datasetsPageUrl = `${url.origin}/datasets${url.search}`;

  // Create RSS feed
  const feed = new Feed({
    title: `${m.header_title()} — ${m.header_tagline()}`,
    description: feedDescription,
    id: url.toString(),
    link: datasetsPageUrl,
    language: locale,
    copyright: m.organization(),
    updated: mostRecentDate,
    generator: 'Dataset Register',
    ttl: cacheTtl,
    feedLinks: {
      rss: url.toString(),
    },
    image:
      'https://datasetregister.netwerkdigitaalerfgoed.nl/assets/apple-touch-icon.png',
    favicon:
      'https://datasetregister.netwerkdigitaalerfgoed.nl/assets/favicon-32x32.png',
  });

  // Add each dataset as a feed item
  for (const dataset of results.datasets) {
    const title = getLocalizedValue(dataset.title) || 'Untitled Dataset';
    const description = getLocalizedValue(dataset.description) || '';
    const publisherName = dataset.publisher
      ? getLocalizedValue(dataset.publisher.name)
      : undefined;

    // Link to the dataset detail page
    const datasetLink = `${url.origin}${localizeHref('/datasets/' + dataset.$id)}`;

    feed.addItem({
      title,
      id: dataset.$id,
      guid: dataset.$id,
      link: datasetLink,
      description,
      content: description,
      author: publisherName
        ? [
            {
              name: publisherName,
              link: dataset.publisher?.$id,
            },
          ]
        : undefined,
      date: dataset.datePosted ? new Date(dataset.datePosted) : new Date(),
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `max-age=0, s-maxage=${cacheTtl}`,
    },
  });
}

/**
 * Build feed description based on active filters and result count
 */
function buildFeedDescription(
  searchRequest: SearchRequest,
  total: number,
): string {
  const parts: string[] = [];

  if (searchRequest.query) {
    parts.push(`${m.rss_filter_search()}: "${searchRequest.query}"`);
  }

  if (searchRequest.publisher.length > 0) {
    parts.push(
      `${m.rss_filter_publishers()}: ${searchRequest.publisher.length}`,
    );
  }

  if (searchRequest.keyword.length > 0) {
    parts.push(`${m.rss_filter_keywords()}: ${searchRequest.keyword.length}`);
  }

  if (searchRequest.format.length > 0) {
    parts.push(`${m.rss_filter_formats()}: ${searchRequest.format.length}`);
  }

  if (searchRequest.class.length > 0) {
    parts.push(`${m.rss_filter_classes()}: ${searchRequest.class.length}`);
  }

  if (searchRequest.terminologySource.length > 0) {
    parts.push(
      `${m.rss_filter_terminology_sources()}: ${searchRequest.terminologySource.length}`,
    );
  }

  if (
    searchRequest.size.min !== undefined ||
    searchRequest.size.max !== undefined
  ) {
    parts.push(
      `${m.rss_filter_size()}: ${searchRequest.size.min ?? '∞'} - ${searchRequest.size.max ?? '∞'} ${m.rss_triples()}`,
    );
  }

  const filterDescription = parts.length > 0 ? ` (${parts.join(', ')})` : '';

  return `${m.search_datasets_found({ count: total })}${filterDescription}`;
}
