import { error, redirect } from '@sveltejs/kit';
import { extractLocaleFromUrl } from '$lib/paraglide/runtime';
import { datasetDetailHref } from '$lib/url';
import type { RequestHandler } from './$types';

/**
 * Legacy redirect. Dataset detail used to live at /datasets/<full-iri>, which
 * is fragile: path-embedded URIs get mangled by HTTP intermediaries. Outlook
 * collapses `https://` to `https:/` inside `<a href>` attributes, and
 * Paraglide rewrites the same `://` when localising URLs.
 *
 * Restore an Outlook-mangled scheme prefix and 308-redirect to the new
 * `/dataset?uri=…` shape so existing shared links keep working. Preserve
 * any locale prefix from the original URL so /en/datasets/<iri> lands on
 * /en/dataset?uri=<iri>.
 */
export const GET: RequestHandler = ({ params, url }) => {
  const raw = decodeURIComponent(params.uri ?? '');

  if (!raw) {
    error(404, 'Dataset URI is required');
  }

  const datasetUri = raw.replace(/^(https?):\/(?!\/)/, '$1://');
  const locale = extractLocaleFromUrl(url.pathname);
  const prefix =
    locale && url.pathname.startsWith(`/${locale}/`) ? `/${locale}` : '';
  redirect(308, `${prefix}${datasetDetailHref(datasetUri)}`);
};
