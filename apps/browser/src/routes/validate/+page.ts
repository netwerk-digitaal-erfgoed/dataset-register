import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  const prefillUrl = url.searchParams.get('url') ?? '';
  const tabParam = url.searchParams.get('tab');
  const tab: 'url' | 'inline' =
    tabParam === 'inline' ? 'inline' : prefillUrl ? 'url' : 'url';
  return { prefillUrl, tab };
};
