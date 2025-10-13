import { extractLocaleFromUrl, setLocale } from '$lib/paraglide/runtime';

export const load = ({ url }) => {
  const locale = extractLocaleFromUrl(url.pathname);
  if (locale) {
    setLocale(locale);
  }

  return {
    locale,
  };
};
