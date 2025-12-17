import { extractLocaleFromUrl, setLocale } from '$lib/paraglide/runtime';

// Allow trailing slashes in URLs to support dataset URIs that end with /
export const trailingSlash = 'ignore';

export const load = ({ url }) => {
  const locale = extractLocaleFromUrl(url.pathname);
  if (locale) {
    setLocale(locale);
  }

  return {
    locale,
  };
};
