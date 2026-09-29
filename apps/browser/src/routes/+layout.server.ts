import { building } from '$app/environment';
import { getStatusAnnouncements } from '$lib/services/status-announcements.server';

export const load = async ({ url }) => {
  // Reading the pathname makes SvelteKit rerun this load on every navigation, so
  // announcements stay current during a visit, including one that starts on a
  // prerendered page.
  void url.pathname;

  return {
    // Prerendered pages (/changes) are built once, so a banner baked into them
    // would outlive the announcement; they get none.
    statusAnnouncements: building ? [] : await getStatusAnnouncements(),
  };
};
